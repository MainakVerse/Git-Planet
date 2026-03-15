import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/session'

// ── Types ──────────────────────────────────────────────────────────────────────

interface DepNode {
  id: string
  label: string
  type: 'internal' | 'external' | 'entry'
}

interface DepEdge {
  from: string
  to: string
}

// ── Constants ──────────────────────────────────────────────────────────────────

const IGNORE = new Set([
  'node_modules', '.git', '.next', '.nuxt', 'dist', 'build', 'out', 'coverage',
  '.cache', '.vercel', '.turbo', '__pycache__', '.pytest_cache', 'target',
  'vendor', '.idea', '.vscode', 'tmp', 'temp', 'logs', '.DS_Store',
])

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rb'])

// ── Helpers ────────────────────────────────────────────────────────────────────

function ext(p: string): string {
  const i = p.lastIndexOf('.')
  return i >= 0 ? p.slice(i) : ''
}

function isSourceFile(p: string): boolean {
  return SOURCE_EXTS.has(ext(p))
}

function parseImports(src: string, lang: 'js' | 'py' | 'go' | 'rb'): string[] {
  const found: string[] = []
  if (lang === 'js') {
    const re = [
      /(?:^|\n)\s*import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g,
      /(?:^|\n)\s*(?:const|let|var)\s+\S+\s*=\s*require\s*\(\s*['"]([^'"]+)['"]/g,
      /(?:^|\n)\s*export\s+(?:.*?\s+from\s+)['"]([^'"]+)['"]/g,
    ]
    for (const r of re) { let m; while ((m = r.exec(src)) !== null) found.push(m[1]) }
  } else if (lang === 'py') {
    const re = [
      /^\s*import\s+([\w.]+)/gm,
      /^\s*from\s+([\w.]+)\s+import/gm,
    ]
    for (const r of re) { let m; while ((m = r.exec(src)) !== null) found.push(m[1]) }
  } else if (lang === 'go') {
    const re = /import\s*\(\s*([\s\S]*?)\)/g
    let m
    while ((m = re.exec(src)) !== null) {
      const block = m[1]
      const pathRe = /"([^"]+)"/g
      let pm
      while ((pm = pathRe.exec(block)) !== null) found.push(pm[1])
    }
    const single = /import\s+"([^"]+)"/g
    while ((m = single.exec(src)) !== null) found.push(m[1])
  } else if (lang === 'rb') {
    const re = /^\s*require(?:_relative)?\s+['"]([^'"]+)['"]/gm
    let m
    while ((m = re.exec(src)) !== null) found.push(m[1])
  }
  return found
}

function detectLang(path: string): 'js' | 'py' | 'go' | 'rb' {
  if (path.endsWith('.py')) return 'py'
  if (path.endsWith('.go')) return 'go'
  if (path.endsWith('.rb')) return 'rb'
  return 'js'
}

function isExternal(imp: string, lang: 'js' | 'py' | 'go' | 'rb'): boolean {
  if (lang === 'js') return !imp.startsWith('.') && !imp.startsWith('@/') && !imp.startsWith('~/')
  if (lang === 'py') return !imp.startsWith('.')
  return true
}

function fileKey(path: string): string {
  // Shorten path for label: strip leading src/ and extension
  return path.replace(/^src\//, '').replace(/\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb)$/, '')
}

async function ghFetch(url: string, headers: Record<string, string>): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 25_000)
  try { return await fetch(url, { headers, cache: 'no-store', signal: ctrl.signal }) }
  finally { clearTimeout(t) }
}

// ── Mermaid builder ────────────────────────────────────────────────────────────

function buildMermaid(nodes: DepNode[], edges: DepEdge[]): string {
  const safeId = (id: string) => `n_${id.replace(/[^a-zA-Z0-9]/g, '_')}`

  const lines: string[] = [
    'flowchart LR',
    '  classDef entry fill:#001a1a,stroke:#00E5FF,stroke-width:2px,color:#e6edf3',
    '  classDef internal fill:#0a0d1a,stroke:#7B61FF,stroke-width:1px,color:#e6edf3',
    '  classDef external fill:#001a0a,stroke:#00ff88,stroke-width:1px,color:#e6edf3',
    '',
  ]

  for (const n of nodes) {
    const id = safeId(n.id)
    const lbl = n.label.length > 28 ? n.label.slice(0, 26) + '..' : n.label
    if (n.type === 'external') {
      lines.push(`  ${id}(["${lbl}"]):::external`)
    } else if (n.type === 'entry') {
      lines.push(`  ${id}["${lbl}"]:::entry`)
    } else {
      lines.push(`  ${id}["${lbl}"]:::internal`)
    }
  }
  lines.push('')

  for (const e of edges) {
    lines.push(`  ${safeId(e.from)} --> ${safeId(e.to)}`)
  }

  return lines.join('\n')
}

// ── GET Handler ────────────────────────────────────────────────────────────────

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
    // ── 1. Default branch ─────────────────────────────────────────────────────
    const repoRes = await ghFetch(`https://api.github.com/repos/${owner}/${repo}`, H)
    if (!repoRes.ok) return NextResponse.json({ error: 'Repo not found' }, { status: 404 })
    const { default_branch } = await repoRes.json()
    const branch = default_branch || 'main'

    // ── 2. File tree ──────────────────────────────────────────────────────────
    const treeRes = await ghFetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, H
    )
    if (!treeRes.ok) return NextResponse.json({ error: 'Tree fetch failed' }, { status: 500 })
    const { tree: rawTree } = await treeRes.json()

    const allPaths: string[] = (rawTree ?? [])
      .filter((f: { type: string }) => f.type === 'blob')
      .map((f: { path: string }) => f.path)
      .filter((p: string) => !p.split('/').some((seg: string) => IGNORE.has(seg)))
      .filter((p: string) => isSourceFile(p))

    // ── 3. Pick up to 12 most important source files ──────────────────────────
    const PRIO = [
      'index.ts','index.tsx','index.js','page.tsx','layout.tsx','route.ts',
      'app.ts','server.ts','main.ts','main.py','main.go','app.py','index.py',
    ]
    const scored = allPaths.map(p => {
      const name = p.split('/').pop() ?? ''
      const score = PRIO.includes(name) ? 2 : p.split('/').length <= 2 ? 1 : 0
      return { path: p, score }
    }).sort((a, b) => b.score - a.score)

    const selectedPaths = scored.slice(0, 12).map(s => s.path)

    // ── 4. Fetch file contents in parallel ────────────────────────────────────
    const fileImports: Record<string, string[]> = {}
    await Promise.all(
      selectedPaths.map(async (path) => {
        try {
          const r = await ghFetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, H)
          if (!r.ok) return
          const { content } = await r.json()
          if (!content) return
          const src = Buffer.from(content, 'base64').toString('utf-8')
          fileImports[path] = parseImports(src, detectLang(path))
        } catch { /* non-fatal */ }
      })
    )

    // ── 5. Build node and edge sets ───────────────────────────────────────────
    const internalIds = new Set(selectedPaths.map(fileKey))
    const externalSet = new Set<string>()
    const edges: DepEdge[] = []
    const edgeSet = new Set<string>()

    for (const [path, imports] of Object.entries(fileImports)) {
      const from = fileKey(path)
      const lang = detectLang(path)
      for (const imp of imports) {
        if (isExternal(imp, lang)) {
          // External package: use package name (first segment, strip @ scope only if too long)
          const pkgName = imp.startsWith('@') ? imp.split('/').slice(0, 2).join('/') : imp.split('/')[0]
          if (pkgName.length > 1) externalSet.add(pkgName)
          const key = `${from}→${pkgName}`
          if (!edgeSet.has(key)) { edgeSet.add(key); edges.push({ from, to: pkgName }) }
        } else {
          // Internal relative import — resolve to a key in internalIds
          const parts = path.split('/')
          parts.pop()
          const impParts = imp.replace(/\?.*$/, '').split('?')[0].split('/')
          const resolved: string[] = [...parts]
          for (const seg of impParts) {
            if (seg === '..') resolved.pop()
            else if (seg !== '.') resolved.push(seg)
          }
          // Try matching against known file keys (with and without extension)
          const candidate = resolved.join('/')
          const match = Array.from(internalIds).find(id =>
            id === candidate || id === candidate.replace(/\.(ts|tsx|js|jsx)$/, '')
          )
          if (match && match !== from) {
            const key = `${from}→${match}`
            if (!edgeSet.has(key)) { edgeSet.add(key); edges.push({ from, to: match }) }
          }
        }
      }
    }

    // ── 6. Limit external nodes to top 10 most-referenced ─────────────────────
    const extCount: Record<string, number> = {}
    for (const e of edges) {
      if (externalSet.has(e.to)) extCount[e.to] = (extCount[e.to] ?? 0) + 1
    }
    const topExternal = Object.entries(extCount).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k)
    const allowedExternal = new Set(topExternal)

    // Filter edges — keep only edges to allowed external packages
    const filteredEdges = edges.filter(e => !externalSet.has(e.to) || allowedExternal.has(e.to))

    // ── 7. Build final node list ───────────────────────────────────────────────
    const referencedNodes = new Set<string>()
    for (const e of filteredEdges) { referencedNodes.add(e.from); referencedNodes.add(e.to) }

    const nodes: DepNode[] = []
    for (const id of internalIds) {
      if (!referencedNodes.has(id)) continue
      const isEntry = PRIO.some(p => id.endsWith(p.replace(/\.(ts|tsx|js|jsx|py|go|rb)$/, '')))
      nodes.push({ id, label: id, type: isEntry ? 'entry' : 'internal' })
    }
    for (const id of allowedExternal) {
      if (referencedNodes.has(id)) nodes.push({ id, label: id, type: 'external' })
    }

    const mermaidDef = buildMermaid(nodes, filteredEdges)

    return NextResponse.json({
      mermaidDef,
      meta: {
        totalFiles: allPaths.length,
        filesAnalyzed: selectedPaths.length,
        internalNodes: nodes.filter(n => n.type !== 'external').length,
        externalPackages: nodes.filter(n => n.type === 'external').length,
        totalEdges: filteredEdges.length,
      },
      nodes,
      edges: filteredEdges,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
