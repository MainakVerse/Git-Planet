import { NextRequest, NextResponse } from 'next/server'
import { authenticate, ghJson, parseRepoParams, fetchTree, fetchFileContent, pct, type GHRepoMeta } from '@/lib/gh'

// ── Types ─────────────────────────────────────────────────────────────────────

export type TodoKind = 'TODO' | 'FIXME' | 'HACK' | 'XXX' | 'BUG' | 'NOTE' | 'OPTIMIZE' | 'DEPRECATED'

export interface TodoItem {
  kind: TodoKind
  text: string
  path: string
  line: number
  priority: 'high' | 'medium' | 'low'
  hasAssignee: boolean
}

export interface TodoReport {
  owner: string
  repo: string
  total: number
  byKind: { kind: TodoKind; count: number; color: string }[]
  byPriority: { high: number; medium: number; low: number }
  byFile: { path: string; count: number }[]
  debtScore: number          // 0-100, higher = more debt
  items: TodoItem[]
  meta: { filesScanned: number; filesWithTodos: number; generatedAt: string }
}

const KIND_META: Record<TodoKind, { color: string; priority: TodoItem['priority'] }> = {
  FIXME: { color: '#ff4466', priority: 'high' },
  BUG: { color: '#ff4466', priority: 'high' },
  XXX: { color: '#ff8800', priority: 'high' },
  HACK: { color: '#ff8800', priority: 'medium' },
  OPTIMIZE: { color: '#FFD700', priority: 'medium' },
  DEPRECATED: { color: '#FFD700', priority: 'medium' },
  TODO: { color: '#00E5FF', priority: 'low' },
  NOTE: { color: '#7d8590', priority: 'low' },
}

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|rs|java|kt|php|swift|c|cpp|h|cs|scala|vue|svelte)$/
const TAG_RE = /(?:\/\/|#|\/\*|\*|<!--)\s*(TODO|FIXME|HACK|XXX|BUG|NOTE|OPTIMIZE|DEPRECATED)\b[:\s-]*(.*)/i
const MAX_FILES = 60

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
    const sourceFiles = tree
      .filter(f => f.type === 'blob' && SOURCE_EXT.test(f.path))
      .sort((a, b) => (a.path.split('/').length) - (b.path.split('/').length))  // prefer shallow
      .slice(0, MAX_FILES)
      .map(f => f.path)

    if (sourceFiles.length === 0) return NextResponse.json({ error: 'No source files to scan' }, { status: 422 })

    const items: TodoItem[] = []
    const filesWithTodos = new Set<string>()

    const BATCH = 12
    for (let i = 0; i < sourceFiles.length; i += BATCH) {
      const slice = sourceFiles.slice(i, i + BATCH)
      const contents = await Promise.all(slice.map(p => fetchFileContent(owner, repo, p, H)))
      for (let j = 0; j < contents.length; j++) {
        const content = contents[j]
        if (!content) continue
        const path = slice[j]
        const lines = content.split('\n')
        for (let k = 0; k < lines.length; k++) {
          const m = TAG_RE.exec(lines[k])
          if (!m) continue
          const kind = m[1].toUpperCase() as TodoKind
          if (!KIND_META[kind]) continue
          let text = (m[2] ?? '').replace(/\*\/\s*$/, '').replace(/-->\s*$/, '').trim()
          if (!text) text = '(no description)'
          const hasAssignee = /@\w+|\(\w+\)/.test(text)
          items.push({ kind, text: text.slice(0, 200), path, line: k + 1, priority: KIND_META[kind].priority, hasAssignee })
          filesWithTodos.add(path)
        }
      }
    }

    // Aggregations
    const kindCounts = new Map<TodoKind, number>()
    for (const it of items) kindCounts.set(it.kind, (kindCounts.get(it.kind) ?? 0) + 1)
    const byKind = Array.from(kindCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([kind, count]) => ({ kind, count, color: KIND_META[kind].color }))

    const byPriority = {
      high: items.filter(i => i.priority === 'high').length,
      medium: items.filter(i => i.priority === 'medium').length,
      low: items.filter(i => i.priority === 'low').length,
    }

    const fileCounts = new Map<string, number>()
    for (const it of items) fileCounts.set(it.path, (fileCounts.get(it.path) ?? 0) + 1)
    const byFile = Array.from(fileCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([path, count]) => ({ path, count }))

    // Debt score: weighted by priority, normalised against files scanned
    const weighted = byPriority.high * 3 + byPriority.medium * 2 + byPriority.low * 1
    const debtScore = Math.min(100, Math.round((weighted / Math.max(1, sourceFiles.length)) * 25))

    // Sort items: high priority first, then by file
    items.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 }
      return order[a.priority] - order[b.priority] || a.path.localeCompare(b.path)
    })

    const report: TodoReport = {
      owner, repo,
      total: items.length, byKind, byPriority, byFile, debtScore,
      items: items.slice(0, 100),
      meta: { filesScanned: sourceFiles.length, filesWithTodos: filesWithTodos.size, generatedAt: new Date().toISOString() },
    }

    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
