import { NextRequest, NextResponse } from 'next/server'
import { authenticate, ghJson, parseRepoParams, fetchTree, fetchFileContent, clamp, aiSummarize, type GHRepoMeta } from '@/lib/gh'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RefactorOpportunity {
  path: string
  type: 'large-file' | 'long-function' | 'deep-nesting' | 'high-complexity' | 'duplication'
  severity: 'high' | 'medium' | 'low'
  metric: string
  suggestion: string
  line?: number
}

export interface RefactorReport {
  owner: string
  repo: string
  healthScore: number          // 0-100, higher = cleaner
  opportunities: RefactorOpportunity[]
  byType: { type: string; count: number; color: string }[]
  hotspots: { path: string; issues: number; score: number }[]
  summary: string
  meta: { filesScanned: number; generatedAt: string; aiGenerated: boolean }
}

const TYPE_COLOR: Record<RefactorOpportunity['type'], string> = {
  'large-file': '#ff4466', 'long-function': '#ff8800', 'deep-nesting': '#FFD700',
  'high-complexity': '#7B61FF', 'duplication': '#00E5FF',
}

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb)$/
const MAX_FILES = 40

function analyzeFile(path: string, content: string): RefactorOpportunity[] {
  const out: RefactorOpportunity[] = []
  const lines = content.split('\n')
  const loc = lines.length

  if (loc > 400) out.push({ path, type: 'large-file', severity: loc > 800 ? 'high' : 'medium', metric: `${loc} lines`, suggestion: `Split this ${loc}-line file into smaller, focused modules.` })

  // function length + nesting via brace tracking
  const fnRe = /(?:function\s+\w+|(?:const|let)\s+\w+\s*=\s*(?:async\s+)?\([^)]*\)\s*=>|def\s+\w+|func\s+\w+)/
  let depth = 0, maxDepth = 0
  for (const ch of content) { if (ch === '{') { depth++; maxDepth = Math.max(maxDepth, depth) } else if (ch === '}') depth = Math.max(0, depth - 1) }
  if (maxDepth >= 6) out.push({ path, type: 'deep-nesting', severity: maxDepth >= 8 ? 'high' : 'medium', metric: `depth ${maxDepth}`, suggestion: 'Reduce nesting with early returns or guard clauses.' })

  // long functions (brace-scan from each fn start)
  for (let i = 0; i < lines.length; i++) {
    if (!fnRe.test(lines[i]) || !lines[i].includes('{')) continue
    let d = 0, end = i
    for (let j = i; j < Math.min(i + 400, lines.length); j++) {
      for (const ch of lines[j]) { if (ch === '{') d++; else if (ch === '}') d-- }
      if (d === 0 && j > i) { end = j; break }
    }
    const fnLen = end - i + 1
    if (fnLen > 80) { out.push({ path, type: 'long-function', severity: fnLen > 150 ? 'high' : 'medium', metric: `${fnLen} lines`, line: i + 1, suggestion: `Extract sub-functions — this function is ${fnLen} lines long.` }); break }
  }

  // crude complexity: count branching keywords
  const branches = (content.match(/\b(if|else if|for|while|case|catch|&&|\|\||\?)\b/g) ?? []).length
  if (branches > 60) out.push({ path, type: 'high-complexity', severity: branches > 120 ? 'high' : 'medium', metric: `${branches} branches`, suggestion: 'High cyclomatic complexity — consider decomposing decision logic.' })

  return out
}

export async function GET(req: NextRequest) {
  const auth = await authenticate()
  if (!auth.ok) return auth.response
  const H = auth.headers

  const params = parseRepoParams(new URL(req.url).searchParams)
  if (!params) return NextResponse.json({ error: 'Missing owner/repo' }, { status: 400 })
  const { owner, repo } = params

  try {
    const meta = await ghJson<GHRepoMeta | null>(`https://api.github.com/repos/${owner}/${repo}`, H, null)
    if (!meta) return NextResponse.json({ error: 'Repo not found' }, { status: 404 })
    const branch = meta.default_branch || 'main'

    const tree = await fetchTree(owner, repo, branch, H)
    const blobs = (tree.filter(f => f.type === 'blob' && SOURCE_EXT.test(f.path) && !/\.(test|spec)\./.test(f.path)) as { path: string; size?: number }[])
      .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))      // biggest files first — likeliest to need refactor
      .slice(0, MAX_FILES)
      .map(f => f.path)

    if (blobs.length === 0) return NextResponse.json({ error: 'No source files to analyse' }, { status: 422 })

    const opportunities: RefactorOpportunity[] = []
    const blockMap = new Map<string, string[]>()       // dup detection
    let filesScanned = 0

    const BATCH = 12
    for (let i = 0; i < blobs.length; i += BATCH) {
      const slice = blobs.slice(i, i + BATCH)
      const contents = await Promise.all(slice.map(p => fetchFileContent(owner, repo, p, H)))
      for (let j = 0; j < contents.length; j++) {
        const content = contents[j]
        if (!content) continue
        filesScanned++
        opportunities.push(...analyzeFile(slice[j], content))
        // duplication: 6-line normalized blocks
        const meaningful = content.split('\n').map(l => l.trim()).filter(l => l.length > 6 && !l.startsWith('//') && l !== '{' && l !== '}')
        for (let k = 0; k + 6 <= meaningful.length; k++) {
          const key = meaningful.slice(k, k + 6).join('\n')
          const arr = blockMap.get(key) ?? []
          if (!arr.includes(slice[j])) arr.push(slice[j])
          blockMap.set(key, arr)
        }
      }
    }

    // Duplication opportunities
    let dupCount = 0
    for (const [, files] of blockMap) {
      if (files.length >= 2 && dupCount < 8) {
        dupCount++
        opportunities.push({ path: files.slice(0, 2).join(' ↔ '), type: 'duplication', severity: 'medium', metric: `${files.length} files`, suggestion: 'Duplicated logic — extract into a shared utility.' })
      }
    }

    // Aggregations
    const typeCounts = new Map<string, number>()
    for (const o of opportunities) typeCounts.set(o.type, (typeCounts.get(o.type) ?? 0) + 1)
    const byType = Array.from(typeCounts.entries()).map(([type, count]) => ({ type, count, color: TYPE_COLOR[type as RefactorOpportunity['type']] ?? '#7d8590' }))

    const fileIssues = new Map<string, number>()
    for (const o of opportunities) {
      if (o.type === 'duplication') continue
      fileIssues.set(o.path, (fileIssues.get(o.path) ?? 0) + 1)
    }
    const hotspots = Array.from(fileIssues.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([path, issues]) => ({ path, issues, score: clamp(100 - issues * 18, 10, 90) }))

    const high = opportunities.filter(o => o.severity === 'high').length
    const healthScore = clamp(100 - high * 8 - (opportunities.length - high) * 3, 0, 100)

    // Priority sort
    const sev = { high: 0, medium: 1, low: 2 }
    opportunities.sort((a, b) => sev[a.severity] - sev[b.severity])

    const fallback =
      `Scanned ${filesScanned} files and found ${opportunities.length} refactoring opportunities (${high} high-severity). ` +
      `${hotspots[0] ? `The biggest hotspot is ${hotspots[0].path} with ${hotspots[0].issues} issues. ` : ''}` +
      `Code-health scores ${healthScore}/100 — ${healthScore >= 75 ? 'the codebase is generally clean.' : healthScore >= 50 ? 'there is moderate room to improve maintainability.' : 'significant refactoring would pay off.'}`

    const summary = await aiSummarize(
      `Write a 3-sentence refactoring summary for ${owner}/${repo}. Analytical prose, no bullets.
${opportunities.length} opportunities found (${high} high severity) across ${filesScanned} files. Types: ${byType.map(t => `${t.type} ${t.count}`).join(', ')}. Health ${healthScore}/100. Top hotspots: ${hotspots.slice(0, 3).map(h => h.path).join(', ')}.
Focus on the highest-leverage improvements.`,
      fallback,
    )

    const report: RefactorReport = {
      owner, repo, healthScore,
      opportunities: opportunities.slice(0, 60), byType, hotspots, summary,
      meta: { filesScanned, generatedAt: new Date().toISOString(), aiGenerated: !!process.env.ANTHROPIC_API_KEY },
    }

    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
