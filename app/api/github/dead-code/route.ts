import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/session'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DeadFileEntry {
  path: string
  lines: number
  ext: string
}

export interface UnusedFunctionEntry {
  path: string
  name: string
  lines: number
  line: number
}

export interface UnusedExportEntry {
  path: string
  name: string
  kind: 'function' | 'const' | 'class' | 'type' | 'interface' | 'default' | 'unknown'
}

export interface DeadCodeReport {
  summary: {
    totalFiles: number
    filesAnalyzed: number
    totalLines: number
    deadLines: number
    deadFiles: number
    unusedFunctions: number
    unusedExports: number
    cleanupPercent: number
    coverageNote: string
  }
  deadFiles: DeadFileEntry[]
  unusedFunctions: UnusedFunctionEntry[]
  unusedExports: UnusedExportEntry[]
}

// ── Constants ──────────────────────────────────────────────────────────────────

const IGNORE = new Set([
  'node_modules', '.git', '.next', '.nuxt', 'dist', 'build', 'out', 'coverage',
  '.cache', '.vercel', '.turbo', '__pycache__', '.pytest_cache', 'target',
  'vendor', '.idea', '.vscode', 'tmp', 'temp', 'logs',
])

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

// basenames that are ALWAYS framework entry points — never dead
const FRAMEWORK_BASENAMES = new Set([
  // Next.js App Router segments
  'page', 'layout', 'loading', 'error', 'not-found', 'template', 'default',
  'route', 'global-error', 'opengraph-image', 'twitter-image',
  'sitemap', 'robots', 'manifest', 'icon', 'apple-icon',
  // Common entry / bootstrap files
  'index', 'main', 'app', 'server', 'entry', 'start', 'bootstrap',
  // CLI / script entries
  'cli', 'bin', 'cmd',
  // Config / tooling
  'next.config', 'vite.config', 'webpack.config', 'rollup.config',
  'babel.config', 'jest.config', 'vitest.config', 'tailwind.config',
  'postcss.config', 'eslint.config', 'prettier.config', 'tsconfig',
  // Test setup
  'setupTests', 'setup', 'jest.setup', 'vitest.setup', 'test-setup',
  // Middleware / hooks typical roots
  'middleware',
])

// directory segments that indicate framework-managed files — never dead
const FRAMEWORK_DIRS = new Set([
  'pages',   // Next.js pages router
  'app',     // Next.js app router
  'api',     // API routes (Next.js / Express)
  'routes',  // Express / Fastify
  'views',   // MVC views
  'controllers',
  'migrations',
  'seeds',
  'fixtures',
])

// ── Helpers ────────────────────────────────────────────────────────────────────

function extOf(p: string): string { const i = p.lastIndexOf('.'); return i >= 0 ? p.slice(i) : '' }
function baseName(p: string): string { return (p.split('/').pop() ?? '').replace(/\.[^.]+$/, '') }

function isTestFile(p: string): boolean {
  const lower = p.toLowerCase()
  const fn = lower.split('/').pop() ?? ''
  return lower.includes('.test.') || lower.includes('.spec.')
    || lower.includes('/__tests__/') || lower.includes('/test/')
    || lower.startsWith('test/') || lower.startsWith('tests/')
    || fn.startsWith('test_') || lower.includes('_test.go')
}

/** Files that are NEVER dead by convention. */
function isProtectedFile(p: string): boolean {
  const bn = baseName(p).toLowerCase()
  const parts = p.split('/')

  // Type declarations
  if (p.endsWith('.d.ts')) return true

  // Storybook stories
  if (bn.endsWith('.stories') || bn.endsWith('.story')) return true

  // Config / setup suffix
  if (bn.endsWith('.config') || bn.endsWith('.setup') || bn.endsWith('.rc')) return true

  // Reserved framework basenames
  if (FRAMEWORK_BASENAMES.has(bn)) return true

  // Any segment is a framework-managed directory
  if (parts.some(seg => FRAMEWORK_DIRS.has(seg))) return true

  // Root-level files (depth 1) are almost always entry points
  if (parts.length === 1) return true

  // Files whose name starts with underscore (private/utility conventions)
  const filename = parts[parts.length - 1] ?? ''
  if (filename.startsWith('_') || filename.startsWith('.')) return true

  return false
}

async function ghFetch(url: string, headers: Record<string, string>): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 28_000)
  try { return await fetch(url, { headers, cache: 'no-store', signal: ctrl.signal }) }
  finally { clearTimeout(t) }
}

// ── Import extraction ──────────────────────────────────────────────────────────

function extractImportSpecs(content: string): string[] {
  const specs: string[] = []
  let m: RegExpExecArray | null

  // static import:  import ... from 'X'
  const staticRe = /\bimport\s+(?:[^'";\n]+\s+from\s+)?['"]([^'"]+)['"]/g
  while ((m = staticRe.exec(content)) !== null) specs.push(m[1])

  // require('X')
  const reqRe = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((m = reqRe.exec(content)) !== null) specs.push(m[1])

  // export { X } from 'Y'   and   export * from 'Y'
  const reRe = /\bexport\s+(?:\{[^}]*\}|\*(?:\s+as\s+\w+)?)\s+from\s+['"]([^'"]+)['"]/g
  while ((m = reRe.exec(content)) !== null) specs.push(m[1])

  // dynamic import: import('X')  or  import("X")
  const dynRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((m = dynRe.exec(content)) !== null) specs.push(m[1])

  return specs
}

/**
 * Resolve a relative specifier to an actual file path in allPaths.
 * Returns null for external packages (no leading dot).
 */
function resolveSpec(spec: string, importerPath: string, allPaths: Set<string>): string | null {
  if (!spec.startsWith('.')) return null

  const importerDir = importerPath.split('/').slice(0, -1).join('/')
  const segments = importerDir ? importerDir.split('/') : []

  for (const part of spec.split('/')) {
    if (part === '..') segments.pop()
    else if (part !== '.') segments.push(part)
  }

  const resolved = segments.join('/')
  const bn = baseName(resolved)
  const dir = segments.slice(0, -1).join('/')

  // Try exact match with each extension
  for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']) {
    const exact = dir ? `${dir}/${bn}${ext}` : `${bn}${ext}`
    if (allPaths.has(exact)) return exact

    // index barrel
    const idx = resolved ? `${resolved}/index${ext}` : `index${ext}`
    if (allPaths.has(idx)) return idx
  }

  // Already has extension?
  if (allPaths.has(resolved)) return resolved

  // Fuzzy: same basename anywhere in allPaths (only if basename is specific enough)
  if (bn.length > 3 && !['util', 'utils', 'helper', 'helpers', 'type', 'types', 'lib'].includes(bn)) {
    for (const p of allPaths) {
      if (baseName(p).toLowerCase() === bn.toLowerCase()) return p
    }
  }

  return null
}

/**
 * Check if a file's basename or tail-path appears as an import string
 * anywhere in the analyzed corpus — catches dynamic imports and aliases.
 */
function isReferencedAsImportString(filePath: string, allImportSpecs: string[]): boolean {
  const bn = baseName(filePath).toLowerCase()
  const pathLower = filePath.toLowerCase()

  for (const spec of allImportSpecs) {
    const specLower = spec.toLowerCase()
    // exact basename match at end of spec path
    const specBn = specLower.split('/').pop()?.replace(/\.[^.]+$/, '') ?? ''
    if (specBn === bn) return true
    // partial path match (e.g. spec = '../utils/format', filePath contains 'utils/format')
    if (pathLower.includes(specLower.replace(/^\.\.?\//, ''))) return true
  }
  return false
}

// ── Export extraction ──────────────────────────────────────────────────────────

function extractExports(content: string): { name: string; kind: UnusedExportEntry['kind'] }[] {
  const exports: { name: string; kind: UnusedExportEntry['kind'] }[] = []
  let m: RegExpExecArray | null

  const namedRe = /\bexport\s+(?:async\s+)?(function|class|const|let|var|type|interface)\s+([A-Za-z_$][\w$]*)/g
  while ((m = namedRe.exec(content)) !== null) {
    const kindMap: Record<string, UnusedExportEntry['kind']> = {
      function: 'function', class: 'class', const: 'const',
      let: 'const', var: 'const', type: 'type', interface: 'interface',
    }
    exports.push({ name: m[2], kind: kindMap[m[1]] ?? 'unknown' })
  }

  // export { X, Y as Z } — skip re-exports (from '...')
  const groupRe = /\bexport\s+\{([^}]+)\}(?!\s+from)/g
  while ((m = groupRe.exec(content)) !== null) {
    const names = m[1].split(',').map(s => {
      const parts = s.trim().split(/\s+as\s+/)
      return (parts[parts.length - 1] ?? '').trim()
    }).filter(Boolean)
    for (const n of names) exports.push({ name: n, kind: 'unknown' })
  }

  return exports
}

// ── Function extraction ────────────────────────────────────────────────────────

interface FnDef { name: string; line: number; lines: number; exported: boolean }

function extractFunctions(content: string): FnDef[] {
  const lines = content.split('\n')
  const fns: FnDef[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // function declaration
    const fnDecl = /^(\s*)(?:(export)\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(line)
    if (fnDecl) {
      const exported = !!fnDecl[2]
      let depth = 0; let end = i
      for (let j = i; j < Math.min(i + 300, lines.length); j++) {
        for (const ch of lines[j]) { if (ch === '{') depth++; else if (ch === '}') depth-- }
        if (depth === 0 && j > i) { end = j; break }
      }
      fns.push({ name: fnDecl[3], line: i + 1, lines: end - i + 1, exported })
      continue
    }

    // arrow / function expression assigned to const/let/var
    const arrowDecl = /^(\s*)(?:(export)\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.exec(line)
    if (arrowDecl) {
      const exported = !!arrowDecl[2]
      let end = i
      if (line.includes('{')) {
        let depth = 0
        for (let j = i; j < Math.min(i + 300, lines.length); j++) {
          for (const ch of lines[j]) { if (ch === '{') depth++; else if (ch === '}') depth-- }
          if (depth === 0 && j > i) { end = j; break }
        }
      }
      fns.push({ name: arrowDecl[3], line: i + 1, lines: Math.max(1, end - i + 1), exported })
    }
  }

  return fns
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

    const allPaths = allBlobs.map(f => f.path)
    const allPathSet = new Set(allPaths)
    const sourcePaths = allPaths.filter(p => !isTestFile(p))
    const testPaths = allPaths.filter(p => isTestFile(p))
    const totalFiles = sourcePaths.length

    // ── 3. Two-tier sampling ───────────────────────────────────────────────────
    //
    // TIER A — "importer" files: shallow/entry-adjacent files that are most
    // likely to import other modules. These build a comprehensive import graph.
    //
    // TIER B — "candidate" files: deeper, non-protected files that might be
    // dead. We only flag one as dead if NO Tier-A file imports it.
    //
    // We also include a sample of test files so we can check test references.

    const tierA: string[] = sourcePaths
      .filter(p => {
        const depth = p.split('/').length
        const bn = baseName(p).toLowerCase()
        // Root or near-root, or named like an orchestrator/importer
        return depth <= 3
          || FRAMEWORK_BASENAMES.has(bn)
          || bn === 'index'
          || bn.includes('store') || bn.includes('router') || bn.includes('provider')
          || bn.includes('context') || bn.includes('hook')
      })
      .slice(0, 60)

    // Tier B = deeper, non-protected files not already in Tier A
    const tierASet = new Set(tierA)
    const tierB: string[] = sourcePaths
      .filter(p =>
        !tierASet.has(p) &&
        !isProtectedFile(p) &&
        p.split('/').length > 2
      )
      .slice(0, 50)

    // Test corpus (for checking if a file is referenced from tests)
    const testSample = testPaths.slice(0, 20)

    const selectedPaths = [...new Set([...tierA, ...tierB, ...testSample])]

    // ── 4. Fetch contents in parallel ─────────────────────────────────────────
    const fileContents: Record<string, string> = {}
    await Promise.all(
      selectedPaths.map(async (path) => {
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

    // ── 5. Build global import corpus ─────────────────────────────────────────
    // Collect every import specifier ever seen across all files (for string-ref check)
    const allImportSpecs: string[] = []
    const importedByMap = new Map<string, Set<string>>()  // resolved path → importers

    for (const [p, content] of Object.entries(fileContents)) {
      const specs = extractImportSpecs(content)
      for (const spec of specs) {
        allImportSpecs.push(spec)
        const resolved = resolveSpec(spec, p, allPathSet)
        if (resolved) {
          if (!importedByMap.has(resolved)) importedByMap.set(resolved, new Set())
          importedByMap.get(resolved)!.add(p)
        }
      }
    }

    // ── 6. Dead files ──────────────────────────────────────────────────────────
    // A file is dead only if ALL of the following are true:
    //   1. It is a Tier-B candidate (not a protected/entry/framework file)
    //   2. No analyzed file imports it (import graph check)
    //   3. Its basename is not referenced as an import string anywhere (dynamic imports)
    //   4. Its basename doesn't appear in any test file content (test references)
    //   5. It has meaningful content (>5 lines)

    const testContent = testPaths
      .map(p => fileContents[p] ?? '')
      .join('\n')
      .toLowerCase()

    const deadFiles: DeadFileEntry[] = []

    for (const p of tierB) {
      if (!fileContents[p]) continue  // couldn't fetch

      const importers = importedByMap.get(p)
      if (importers && importers.size > 0) continue  // imported — alive

      if (isReferencedAsImportString(p, allImportSpecs)) continue  // dynamic ref — alive

      // Check if basename appears in test files (tests reference the module)
      const bn = baseName(p).toLowerCase()
      if (testContent.includes(bn)) continue  // test-referenced — alive

      const lines = fileContents[p].split('\n').length
      if (lines <= 5) continue  // trivially small — skip

      deadFiles.push({ path: p, lines, ext: extOf(p) })
    }

    deadFiles.sort((a, b) => b.lines - a.lines)

    // ── 7. Unused functions ────────────────────────────────────────────────────
    // A function is unused only if ALL of:
    //   1. It is NOT exported (exported fns may be consumed by files we didn't fetch)
    //   2. Its name doesn't appear in ANY other analyzed file's content
    //   3. It is not a React component (PascalCase → could be JSX referenced in TSX)
    //   4. It is not a hook (starts with "use")
    //   5. It has substance (>= 5 lines)
    //   6. The file it lives in is not a protected/framework file

    const unusedFunctions: UnusedFunctionEntry[] = []

    for (const [p, content] of Object.entries(fileContents)) {
      if (isTestFile(p)) continue
      if (isProtectedFile(p)) continue

      const fns = extractFunctions(content)
      for (const fn of fns) {
        if (fn.exported) continue  // exported — might be used externally
        if (fn.name.startsWith('_')) continue  // private-by-convention
        if (fn.name[0] === fn.name[0].toUpperCase() && fn.name[0] !== fn.name[0].toLowerCase()) continue  // PascalCase → React component
        if (fn.name.startsWith('use') && fn.name.length > 3) continue  // React hook
        if (fn.lines < 5) continue  // too small to matter

        const escaped = fn.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const nameRe = new RegExp(`\\b${escaped}\\b`)

        // Must not appear in ANY other analyzed source file
        const usedElsewhere = Object.entries(fileContents).some(
          ([op, oc]) => op !== p && !isTestFile(op) && nameRe.test(oc)
        )
        if (usedElsewhere) continue

        unusedFunctions.push({ path: p, name: fn.name, line: fn.line, lines: fn.lines })
      }
    }

    unusedFunctions.sort((a, b) => b.lines - a.lines)

    // ── 8. Unused exports ─────────────────────────────────────────────────────
    // An export is unused only if:
    //   1. The file is not a protected/framework file
    //   2. The export name does not appear in ANY import statement of another file
    //   3. The export name does not appear at all in any test file

    const unusedExports: UnusedExportEntry[] = []

    // Build a set of all names appearing in import statements across all files
    const allImportedNames = new Set<string>()
    for (const content of Object.values(fileContents)) {
      // named imports: import { A, B as C } from '...'
      const namedImpRe = /\bimport\s+\{([^}]+)\}\s+from/g
      let m: RegExpExecArray | null
      while ((m = namedImpRe.exec(content)) !== null) {
        m[1].split(',').forEach(seg => {
          const name = seg.trim().split(/\s+as\s+/)[0]?.trim()
          if (name) allImportedNames.add(name)
        })
      }
      // default import: import X from '...'
      const defImpRe = /\bimport\s+([A-Za-z_$][\w$]*)\s+from/g
      while ((m = defImpRe.exec(content)) !== null) allImportedNames.add(m[1])
      // namespace: import * as X from '...'
      const nsRe = /\bimport\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from/g
      while ((m = nsRe.exec(content)) !== null) allImportedNames.add(m[1])
    }

    for (const [p, content] of Object.entries(fileContents)) {
      if (isTestFile(p)) continue
      if (isProtectedFile(p)) continue

      const exps = extractExports(content)
      for (const exp of exps) {
        if (exp.name === 'default') continue  // skip default exports

        // Skip very common/generic names that would produce noise
        if (['config', 'options', 'props', 'handler', 'Component', 'App'].includes(exp.name)) continue

        // Skip if the name is found in any import across all files
        if (allImportedNames.has(exp.name)) continue

        // Skip if name appears in test content (could be mocked/tested directly)
        const escaped = exp.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        if (new RegExp(`\\b${escaped}\\b`).test(testContent)) continue

        unusedExports.push({ path: p, name: exp.name, kind: exp.kind })
      }
    }

    // ── 9. Cleanup estimate ────────────────────────────────────────────────────
    const totalLines = Object.values(fileContents)
      .filter((_, i) => !isTestFile(Object.keys(fileContents)[i]))
      .reduce((s, c) => s + c.split('\n').length, 0)

    const deadFileLines = deadFiles.reduce((s, f) => s + f.lines, 0)
    const unusedFnLines = unusedFunctions.reduce((s, f) => s + f.lines, 0)
    const deadLines = deadFileLines + Math.round(unusedFnLines * 0.6)
    const cleanupPercent = totalLines > 0
      ? Math.min(85, Math.round((deadLines / totalLines) * 100))
      : 0

    const coveragePct = totalFiles > 0
      ? Math.round(((tierA.length + tierB.length) / totalFiles) * 100)
      : 100
    const coverageNote = coveragePct >= 80
      ? 'High confidence — analyzed most of the codebase'
      : coveragePct >= 40
      ? `Moderate confidence — analyzed ${coveragePct}% of source files`
      : `Low confidence — only ${coveragePct}% of source files analyzed; large repos may show more results`

    const report: DeadCodeReport = {
      summary: {
        totalFiles,
        filesAnalyzed: analyzedPaths.filter(p => !isTestFile(p)).length,
        totalLines,
        deadLines,
        deadFiles: deadFiles.length,
        unusedFunctions: unusedFunctions.length,
        unusedExports: unusedExports.length,
        cleanupPercent,
        coverageNote,
      },
      deadFiles: deadFiles.slice(0, 30),
      unusedFunctions: unusedFunctions.slice(0, 40),
      unusedExports: unusedExports.slice(0, 50),
    }

    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
