import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/session'
import { Project, SyntaxKind, SourceFile } from 'ts-morph'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DepNode {
  id: string
  label: string
  type: 'internal' | 'external' | 'entry'
  inDegree: number
  outDegree: number
}

export interface DepEdge {
  from: string
  to: string
}

export interface DepInsights {
  hubs: { id: string; label: string; inDegree: number }[]
  circularDeps: string[][]
}

// ── Constants ──────────────────────────────────────────────────────────────────

const IGNORE = new Set([
  'node_modules', '.git', '.next', '.nuxt', 'dist', 'build', 'out', 'coverage',
  '.cache', '.vercel', '.turbo', '__pycache__', '.pytest_cache', 'target',
  'vendor', '.idea', '.vscode', 'tmp', 'temp', 'logs',
])

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rb'])

const PRIO_FILES = [
  'index.ts', 'index.tsx', 'index.js', 'index.jsx',
  'page.tsx', 'layout.tsx', 'route.ts',
  'app.ts', 'server.ts', 'main.ts', 'main.py', 'main.go', 'app.py', 'index.py',
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function extOf(p: string): string {
  const i = p.lastIndexOf('.')
  return i >= 0 ? p.slice(i) : ''
}

function isSourceFile(p: string): boolean {
  return SOURCE_EXTS.has(extOf(p))
}

function fileKey(path: string): string {
  return path
    .replace(/^src\//, '')
    .replace(/\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb)$/, '')
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
  return true // go/rb — treat all as external unless local
}

// ── Regex fallback parser (non-JS or ts-morph failure) ────────────────────────

function parseRegex(src: string, lang: 'js' | 'py' | 'go' | 'rb'): string[] {
  const found: string[] = []
  if (lang === 'js') {
    const pats = [
      /(?:^|\n)\s*import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g,
      /(?:^|\n)\s*(?:const|let|var)\s+\S+\s*=\s*require\s*\(\s*['"]([^'"]+)['"]/g,
      /(?:^|\n)\s*export\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g,
      /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ]
    for (const r of pats) { let m; while ((m = r.exec(src)) !== null) found.push(m[1]) }
  } else if (lang === 'py') {
    const pats = [/^\s*import\s+([\w.]+)/gm, /^\s*from\s+([\w.]+)\s+import/gm]
    for (const r of pats) { let m; while ((m = r.exec(src)) !== null) found.push(m[1]) }
  } else if (lang === 'go') {
    const block = /import\s*\(\s*([\s\S]*?)\)/g
    let m
    while ((m = block.exec(src)) !== null) {
      const pr = /"([^"]+)"/g; let pm
      while ((pm = pr.exec(m[1])) !== null) found.push(pm[1])
    }
    const single = /import\s+"([^"]+)"/g
    while ((m = single.exec(src)) !== null) found.push(m[1])
  } else if (lang === 'rb') {
    const re = /^\s*require(?:_relative)?\s+['"]([^'"]+)['"]/gm
    let m; while ((m = re.exec(src)) !== null) found.push(m[1])
  }
  return found
}

// ── ts-morph AST import extractor ─────────────────────────────────────────────

function extractFromSourceFile(sf: SourceFile): string[] {
  const found: string[] = []

  // Static imports — skip type-only (no runtime dependency)
  for (const d of sf.getImportDeclarations()) {
    if (!d.isTypeOnly()) found.push(d.getModuleSpecifierValue())
  }

  // Re-exports with a module specifier
  for (const d of sf.getExportDeclarations()) {
    const mod = d.getModuleSpecifierValue()
    if (mod && !d.isTypeOnly()) found.push(mod)
  }

  // require() and dynamic import() call expressions
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression()
    const isRequire = expr.getText() === 'require'
    const isDynamic = expr.getKind() === SyntaxKind.ImportKeyword
    if (isRequire || isDynamic) {
      const arg = call.getArguments()[0]
      if (arg?.getKind() === SyntaxKind.StringLiteral) {
        found.push(arg.getText().slice(1, -1))
      }
    }
  }

  return [...new Set(found)]
}

// ── Graph analysis ─────────────────────────────────────────────────────────────

function computeInsights(nodes: DepNode[], internalEdges: DepEdge[]): DepInsights {
  // Hubs: internal nodes with high in-degree
  const hubs = nodes
    .filter(n => n.type !== 'external' && n.inDegree >= 2)
    .sort((a, b) => b.inDegree - a.inDegree)
    .slice(0, 5)
    .map(n => ({ id: n.id, label: n.label, inDegree: n.inDegree }))

  // Circular dependency detection via DFS
  const adj = new Map<string, string[]>()
  const nodeIds = new Set<string>()
  for (const { from, to } of internalEdges) {
    if (!adj.has(from)) adj.set(from, [])
    adj.get(from)!.push(to)
    nodeIds.add(from)
    nodeIds.add(to)
  }

  const cycles: string[][] = []
  const color = new Map<string, 0 | 1 | 2>() // 0=unvisited 1=in-stack 2=done

  function dfs(node: string, path: string[]): void {
    if (cycles.length >= 5) return
    color.set(node, 1)
    for (const neighbor of adj.get(node) ?? []) {
      if (color.get(neighbor) === 1) {
        const idx = path.indexOf(neighbor)
        if (idx >= 0) cycles.push([...path.slice(idx), neighbor])
      } else if (!color.get(neighbor)) {
        dfs(neighbor, [...path, neighbor])
      }
    }
    color.set(node, 2)
  }

  for (const node of nodeIds) {
    if (!color.get(node)) dfs(node, [node])
  }

  return { hubs, circularDeps: cycles }
}

// ── GitHub fetch helper ────────────────────────────────────────────────────────

async function ghFetch(url: string, headers: Record<string, string>): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 25_000)
  try { return await fetch(url, { headers, cache: 'no-store', signal: ctrl.signal }) }
  finally { clearTimeout(t) }
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
    // ── 1. Default branch ──────────────────────────────────────────────────────
    const repoRes = await ghFetch(`https://api.github.com/repos/${owner}/${repo}`, H)
    if (!repoRes.ok) return NextResponse.json({ error: 'Repo not found' }, { status: 404 })
    const { default_branch } = await repoRes.json()
    const branch = default_branch || 'main'

    // ── 2. File tree ───────────────────────────────────────────────────────────
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

    // ── 3. Score and pick up to 30 files ──────────────────────────────────────
    const scored = allPaths
      .map(p => {
        const name = p.split('/').pop() ?? ''
        const depth = p.split('/').length
        let score = 0
        if (PRIO_FILES.includes(name)) score += 10
        if (depth <= 2) score += 4
        else if (depth <= 3) score += 2
        return { path: p, score }
      })
      .sort((a, b) => b.score - a.score)

    const selectedPaths = scored.slice(0, 30).map(s => s.path)

    // ── 4. Fetch all file contents in parallel ─────────────────────────────────
    const fileContents: Record<string, string> = {}
    await Promise.all(
      selectedPaths.map(async (path) => {
        try {
          const r = await ghFetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, H)
          if (!r.ok) return
          const { content } = await r.json()
          if (!content) return
          fileContents[path] = Buffer.from(content, 'base64').toString('utf-8')
        } catch { /* non-fatal */ }
      })
    )

    // ── 5. Parse imports — ts-morph for JS/TS, regex for others ───────────────
    const fileImports: Record<string, string[]> = {}

    // Build a single ts-morph Project for all JS/TS files (efficient)
    const jsPaths = Object.keys(fileContents).filter(p => detectLang(p) === 'js')
    if (jsPaths.length > 0) {
      try {
        const project = new Project({
          useInMemoryFileSystem: true,
          skipAddingFilesFromTsConfig: true,
          compilerOptions: { allowJs: true, jsx: 1 /* Preserve */ },
        })
        for (const path of jsPaths) {
          project.createSourceFile(`/${path}`, fileContents[path], { overwrite: true })
        }
        for (const sf of project.getSourceFiles()) {
          const key = sf.getFilePath().replace(/^\//, '')
          fileImports[key] = extractFromSourceFile(sf)
        }
      } catch {
        // Fallback: regex for all JS/TS files
        for (const path of jsPaths) {
          fileImports[path] = parseRegex(fileContents[path], 'js')
        }
      }
    }

    // Regex for Python/Go/Ruby
    for (const [path, src] of Object.entries(fileContents)) {
      const lang = detectLang(path)
      if (lang !== 'js') fileImports[path] = parseRegex(src, lang)
    }

    // ── 6. Build graph ─────────────────────────────────────────────────────────
    const internalIds = new Set(selectedPaths.map(fileKey))
    const externalSet = new Set<string>()
    const allEdges: DepEdge[] = []
    const edgeSet = new Set<string>()

    for (const [path, imports] of Object.entries(fileImports)) {
      const from = fileKey(path)
      const lang = detectLang(path)

      for (const imp of imports) {
        if (isExternal(imp, lang)) {
          const pkgName = imp.startsWith('@')
            ? imp.split('/').slice(0, 2).join('/')
            : imp.split('/')[0]
          if (pkgName.length > 1) {
            externalSet.add(pkgName)
            const key = `${from}→${pkgName}`
            if (!edgeSet.has(key)) { edgeSet.add(key); allEdges.push({ from, to: pkgName }) }
          }
        } else {
          // Resolve relative import to a known internal file key
          const parts = path.split('/')
          parts.pop()
          const impClean = imp.split('?')[0]
          const resolved: string[] = [...parts]
          for (const seg of impClean.split('/')) {
            if (seg === '..') resolved.pop()
            else if (seg !== '.') resolved.push(seg)
          }
          const candidate = resolved.join('/')
          const match = Array.from(internalIds).find(id =>
            id === candidate || id === candidate.replace(/\.(ts|tsx|js|jsx)$/, '')
          )
          if (match && match !== from) {
            const key = `${from}→${match}`
            if (!edgeSet.has(key)) { edgeSet.add(key); allEdges.push({ from, to: match }) }
          }
        }
      }
    }

    // ── 7. Keep only top-10 external packages by reference count ──────────────
    const extCount: Record<string, number> = {}
    for (const e of allEdges) {
      if (externalSet.has(e.to)) extCount[e.to] = (extCount[e.to] ?? 0) + 1
    }
    const topExternal = new Set(
      Object.entries(extCount).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k)
    )
    const filteredEdges = allEdges.filter(e => !externalSet.has(e.to) || topExternal.has(e.to))

    // ── 8. Compute degree counts ───────────────────────────────────────────────
    const inDegree: Record<string, number> = {}
    const outDegree: Record<string, number> = {}
    for (const e of filteredEdges) {
      inDegree[e.to] = (inDegree[e.to] ?? 0) + 1
      outDegree[e.from] = (outDegree[e.from] ?? 0) + 1
    }

    // ── 9. Build final node list ───────────────────────────────────────────────
    const referenced = new Set<string>()
    for (const e of filteredEdges) { referenced.add(e.from); referenced.add(e.to) }

    const nodes: DepNode[] = []
    for (const id of internalIds) {
      if (!referenced.has(id)) continue
      const name = id.split('/').pop() ?? id
      const isEntry = PRIO_FILES.some(p => name === p.replace(/\.(ts|tsx|js|jsx|py|go|rb)$/, ''))
      nodes.push({ id, label: name, type: isEntry ? 'entry' : 'internal', inDegree: inDegree[id] ?? 0, outDegree: outDegree[id] ?? 0 })
    }
    for (const id of topExternal) {
      if (referenced.has(id)) {
        nodes.push({ id, label: id, type: 'external', inDegree: inDegree[id] ?? 0, outDegree: outDegree[id] ?? 0 })
      }
    }

    // ── 10. Compute insights ───────────────────────────────────────────────────
    const internalEdges = filteredEdges.filter(e => !externalSet.has(e.to))
    const insights = computeInsights(nodes, internalEdges)

    return NextResponse.json({
      nodes,
      edges: filteredEdges,
      meta: {
        totalFiles: allPaths.length,
        filesAnalyzed: Object.keys(fileContents).length,
        internalNodes: nodes.filter(n => n.type !== 'external').length,
        externalPackages: nodes.filter(n => n.type === 'external').length,
        totalEdges: filteredEdges.length,
      },
      insights,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
