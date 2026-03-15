import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/session'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface LargeFn {
  name: string
  line: number
  lines: number
}

export interface FileComplexity {
  path: string
  score: number
  lines: number
  cyclomaticComplexity: number
  maxNestingDepth: number
  importCount: number
  functionCount: number
  largeFunctions: LargeFn[]
  reasons: string[]
}

export interface ComplexityReport {
  score: number
  grade: string
  meta: {
    totalFiles: number
    filesAnalyzed: number
    totalLines: number
    totalFunctions: number
  }
  averages: {
    cyclomaticComplexity: number
    functionLength: number
    nestingDepth: number
    fileSize: number
    importCount: number
  }
  highRiskFileCount: number
  mostComplexFiles: FileComplexity[]
  largestFunctions: Array<{
    path: string
    name: string
    line: number
    lines: number
    cyclomaticComplexity: number
  }>
  hotspots: Array<{
    path: string
    score: number
    issues: string[]
  }>
}

// ── Constants ──────────────────────────────────────────────────────────────────

const IGNORE = new Set([
  'node_modules', '.git', '.next', '.nuxt', 'dist', 'build', 'out', 'coverage',
  '.cache', '.vercel', '.turbo', '__pycache__', '.pytest_cache', 'target',
  'vendor', '.idea', '.vscode', 'tmp', 'temp', 'logs',
])

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rb'])

// ── Helpers ────────────────────────────────────────────────────────────────────

function extOf(p: string): string { const i = p.lastIndexOf('.'); return i >= 0 ? p.slice(i) : '' }

function isTestFile(p: string): boolean {
  const lower = p.toLowerCase()
  const fn = lower.split('/').pop() ?? ''
  return lower.includes('.test.') || lower.includes('.spec.')
    || lower.includes('/__tests__/') || lower.includes('/test/')
    || lower.startsWith('test/') || lower.startsWith('tests/')
    || fn.startsWith('test_') || lower.includes('_test.go')
}

async function ghFetch(url: string, headers: Record<string, string>): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 28_000)
  try { return await fetch(url, { headers, cache: 'no-store', signal: ctrl.signal }) }
  finally { clearTimeout(t) }
}

// ── Analysis ───────────────────────────────────────────────────────────────────

function stripCommentsAndStrings(content: string): string {
  let s = content.replace(/\/\*[\s\S]*?\*\//g, ' ')
  s = s.replace(/\/\/[^\n]*/g, ' ')
  s = s.replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, '""')
  s = s.replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, "''")
  s = s.replace(/`[^`\\]*(?:\\.[^`\\]*)*`/g, '``')
  return s
}

function computeCyclomaticComplexity(content: string): number {
  const clean = stripCommentsAndStrings(content)
  let complexity = 1

  const patterns: RegExp[] = [
    /\bif\s*\(/g,
    /\belse\s+if\s*\(/g,
    /\bfor\s*\(/g,
    /\bwhile\s*\(/g,
    /\bdo\s*\{/g,
    /\bcase\b/g,
    /\bcatch\s*\(/g,
    /\?\?/g,
    /&&/g,
    /\|\|/g,
  ]

  for (const re of patterns) {
    const m = clean.match(re)
    if (m) complexity += m.length
  }

  // Ternary operators — rough count (exclude generic type syntax `<T>`)
  const ternary = clean.match(/[^<>?]\?[^?:.>]/g)
  if (ternary) complexity += ternary.length

  return complexity
}

function computeMaxNestingDepth(content: string): number {
  let depth = 0, maxDepth = 0
  for (const ch of content) {
    if (ch === '{') { depth++; if (depth > maxDepth) maxDepth = depth }
    else if (ch === '}') { depth = Math.max(0, depth - 1) }
  }
  return maxDepth
}

function countImports(content: string): number {
  const staticRe = /^\s*import\s+/gm
  const requireRe = /\brequire\s*\(\s*['"`]/g
  const pythonRe = /^\s*(?:import|from)\s+\w/gm
  return (
    (content.match(staticRe)?.length ?? 0) +
    (content.match(requireRe)?.length ?? 0) +
    (content.match(pythonRe)?.length ?? 0)
  )
}

function extractFunctions(content: string): { name: string; line: number; lines: number }[] {
  const lines = content.split('\n')
  const fns: { name: string; line: number; lines: number }[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const fnDecl = /(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(line)
    if (fnDecl) {
      let depth = 0, end = i
      for (let j = i; j < Math.min(i + 400, lines.length); j++) {
        for (const ch of lines[j]) { if (ch === '{') depth++; else if (ch === '}') depth-- }
        if (depth === 0 && j > i) { end = j; break }
      }
      fns.push({ name: fnDecl[1], line: i + 1, lines: end - i + 1 })
      continue
    }

    const arrowDecl = /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.exec(line)
    if (arrowDecl) {
      let end = i
      if (line.includes('{')) {
        let depth = 0
        for (let j = i; j < Math.min(i + 400, lines.length); j++) {
          for (const ch of lines[j]) { if (ch === '{') depth++; else if (ch === '}') depth-- }
          if (depth === 0 && j > i) { end = j; break }
        }
      }
      fns.push({ name: arrowDecl[1], line: i + 1, lines: Math.max(1, end - i + 1) })
    }
  }

  return fns
}

function analyzeFile(path: string, content: string): FileComplexity {
  const lines = content.split('\n').length
  const cyclomaticComplexity = computeCyclomaticComplexity(content)
  const maxNestingDepth = computeMaxNestingDepth(content)
  const importCount = countImports(content)
  const fns = extractFunctions(content)

  const largeFunctions: LargeFn[] = fns
    .filter(f => f.lines > 80)
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 10)
    .map(f => ({ name: f.name, line: f.line, lines: f.lines }))

  const reasons: string[] = []
  let raw = 0

  // Cyclomatic complexity: up to 35 pts
  raw += Math.min(cyclomaticComplexity / 30, 1.0) * 35
  if (cyclomaticComplexity > 20) reasons.push(`High cyclomatic complexity (${cyclomaticComplexity})`)

  // Nesting depth: up to 20 pts (penalise from depth 2 onward)
  raw += Math.min(Math.max(0, maxNestingDepth - 1) / 7, 1.0) * 20
  if (maxNestingDepth > 4) reasons.push(`Deep nesting (${maxNestingDepth} levels)`)

  // File size: up to 20 pts
  raw += Math.min(lines / 600, 1.0) * 20
  if (lines > 400) reasons.push(`Large file (${lines} lines)`)

  // Import count: up to 10 pts
  raw += Math.min(importCount / 20, 1.0) * 10
  if (importCount > 15) reasons.push(`Excessive dependencies (${importCount} imports)`)

  // Large functions: up to 15 pts
  raw += Math.min(largeFunctions.length / 3, 1.0) * 15
  if (largeFunctions.length > 0) reasons.push(`${largeFunctions.length} function(s) exceeding 80 lines`)

  return {
    path,
    score: Math.round(Math.min(raw, 100)),
    lines,
    cyclomaticComplexity,
    maxNestingDepth,
    importCount,
    functionCount: fns.length,
    largeFunctions,
    reasons,
  }
}

function gradeScore(score: number): string {
  if (score <= 20) return 'A'
  if (score <= 40) return 'B'
  if (score <= 60) return 'C'
  if (score <= 75) return 'D'
  return 'F'
}

// ── Main GET handler ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get('gh_session')?.value
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const session = verifySession(token)
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })

  const accessToken = session.access_token as string
  const { searchParams } = new URL(req.url)
  const owner = searchParams.get('owner')
  const repo = searchParams.get('repo')
  if (!owner || !repo) return NextResponse.json({ error: 'Missing owner/repo' }, { status: 400 })

  const H = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  try {
    // ── 1. Default branch ──────────────────────────────────────────────────────
    const repoRes = await ghFetch(`https://api.github.com/repos/${owner}/${repo}`, H)
    if (!repoRes.ok) return NextResponse.json({ error: 'Repo not found' }, { status: 404 })
    const { default_branch } = await repoRes.json()
    const branch = default_branch || 'main'

    // ── 2. Full file tree ──────────────────────────────────────────────────────
    const treeRes = await ghFetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, H
    )
    if (!treeRes.ok) return NextResponse.json({ error: 'Tree fetch failed' }, { status: 500 })
    const { tree: rawTree } = await treeRes.json()

    const allBlobs: { path: string; size: number }[] = (rawTree ?? [])
      .filter((f: { type: string }) => f.type === 'blob')
      .map((f: { path: string; size?: number }) => ({ path: f.path, size: f.size ?? 0 }))
      .filter((f: { path: string }) => !f.path.split('/').some((seg: string) => IGNORE.has(seg)))
      .filter((f: { path: string }) => SOURCE_EXTS.has(extOf(f.path)))

    // Prioritise larger files — they're more likely to harbour complexity
    const sourcePaths = allBlobs
      .filter(f => !isTestFile(f.path))
      .sort((a, b) => b.size - a.size)

    const totalFiles = sourcePaths.length

    // ── 3. Sample up to 60 files ───────────────────────────────────────────────
    const samplePaths = sourcePaths.slice(0, 60).map(f => f.path)

    // ── 4. Fetch contents in parallel ─────────────────────────────────────────
    const fileContents: Record<string, string> = {}
    await Promise.all(
      samplePaths.map(async (path) => {
        try {
          const r = await ghFetch(
            `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, H
          )
          if (!r.ok) return
          const { content } = await r.json()
          if (content) fileContents[path] = Buffer.from(content, 'base64').toString('utf-8')
        } catch { /* non-fatal */ }
      })
    )

    const analyzedPaths = Object.keys(fileContents)

    // ── 5. Analyse each file ───────────────────────────────────────────────────
    const fileAnalyses: FileComplexity[] = analyzedPaths.map(path =>
      analyzeFile(path, fileContents[path])
    )

    // ── 6. Aggregate metrics ───────────────────────────────────────────────────
    const totalLines = fileAnalyses.reduce((s, f) => s + f.lines, 0)
    const totalFunctions = fileAnalyses.reduce((s, f) => s + f.functionCount, 0)

    function avg(arr: number[]): number {
      return arr.length > 0
        ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10
        : 0
    }

    const allFnLengths = fileAnalyses.flatMap(f => f.largeFunctions.map(fn => fn.lines))

    const averages = {
      cyclomaticComplexity: avg(fileAnalyses.map(f => f.cyclomaticComplexity)),
      functionLength: avg(allFnLengths.length > 0 ? allFnLengths : [0]),
      nestingDepth: avg(fileAnalyses.map(f => f.maxNestingDepth)),
      fileSize: avg(fileAnalyses.map(f => f.lines)),
      importCount: avg(fileAnalyses.map(f => f.importCount)),
    }

    // ── 7. Repo-level score (size-weighted mean of file scores) ────────────────
    const repoScore = fileAnalyses.length > 0
      ? Math.round(
          fileAnalyses.reduce((s, f) => s + f.score * f.lines, 0) /
          Math.max(totalLines, 1)
        )
      : 0

    // ── 8. Build result sets ───────────────────────────────────────────────────
    const highRiskFileCount = fileAnalyses.filter(f => f.reasons.length > 0).length

    const mostComplexFiles = [...fileAnalyses]
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)

    const largestFunctions = fileAnalyses
      .flatMap(f => f.largeFunctions.map(fn => ({
        path: f.path,
        name: fn.name,
        line: fn.line,
        lines: fn.lines,
        cyclomaticComplexity: f.cyclomaticComplexity,
      })))
      .sort((a, b) => b.lines - a.lines)
      .slice(0, 20)

    const hotspots = fileAnalyses
      .filter(f => f.reasons.length >= 2 || f.score >= 60)
      .sort((a, b) => b.score - a.score)
      .slice(0, 15)
      .map(f => ({ path: f.path, score: f.score, issues: f.reasons }))

    const report: ComplexityReport = {
      score: repoScore,
      grade: gradeScore(repoScore),
      meta: { totalFiles, filesAnalyzed: analyzedPaths.length, totalLines, totalFunctions },
      averages,
      highRiskFileCount,
      mostComplexFiles,
      largestFunctions,
      hotspots,
    }

    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
