import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/session'
import { Project, SyntaxKind } from 'ts-morph'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface FunctionInfo { name: string; lines: number }

export interface FileResult {
  path: string
  totalLines: number
  isTest: boolean
  lang: string
  functions: FunctionInfo[]
}

export interface QualityReport {
  score: number
  meta: {
    totalFiles: number
    sourceFiles: number
    testFiles: number
    filesAnalyzed: number
    totalLines: number
  }
  structural: {
    complexFiles: { path: string; functionCount: number; avgFunctionLines: number }[]
    largeFunctions: { path: string; name: string; lines: number }[]
    duplicateBlocks: { preview: string[]; files: string[]; count: number }[]
    issueCount: number
  }
  testing: {
    coveragePercent: number
    testToCodeRatio: number
    untestedModules: string[]
    untestedSourcePaths: string[]
    criticalUntested: string[]
    testFrameworks: string[]
    existingTestPaths: string[]
  }
  practices: {
    hasMocks: boolean
    hasIntegrationTests: boolean
    hasUnitTests: boolean
    mockCount: number
    integrationCount: number
    assertionDensity: number
  }
  breakdown: {
    structuralScore: number
    testingScore: number
    practicesScore: number
  }
}

// ── Constants ──────────────────────────────────────────────────────────────────

const IGNORE = new Set([
  'node_modules', '.git', '.next', '.nuxt', 'dist', 'build', 'out', 'coverage',
  '.cache', '.vercel', '.turbo', '__pycache__', '.pytest_cache', 'target',
  'vendor', '.idea', '.vscode', 'tmp', 'temp', 'logs', '.storybook',
])

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rb'])

const CRITICAL_FILES = ['index', 'main', 'app', 'server', 'router', 'controller', 'service', 'handler', 'api']

// ── Helpers ────────────────────────────────────────────────────────────────────

function extOf(p: string): string { const i = p.lastIndexOf('.'); return i >= 0 ? p.slice(i) : '' }
function baseName(p: string): string { return (p.split('/').pop() ?? '').replace(/\.[^.]+$/, '') }
function isTestFile(p: string): boolean {
  const lower = p.toLowerCase()
  const filename = lower.split('/').pop() ?? ''
  return lower.includes('.test.') || lower.includes('.spec.')
    || lower.includes('/__tests__/') || lower.includes('/test/')
    || lower.includes('/tests/') || lower.startsWith('test/')
    || lower.startsWith('tests/') || lower.endsWith('.test')
    || lower.endsWith('.spec') || lower.includes('_test.go')
    || lower.includes('_test.py') || filename.startsWith('test_')
}

function detectLang(path: string): 'js' | 'py' | 'go' | 'rb' {
  if (path.endsWith('.py') || path.endsWith('_test.py')) return 'py'
  if (path.endsWith('.go') || path.endsWith('_test.go')) return 'go'
  if (path.endsWith('.rb')) return 'rb'
  return 'js'
}

// ── Function extraction via regex (Python / Go / Ruby) ────────────────────────

function extractFunctionsRegex(content: string, lang: string): FunctionInfo[] {
  const lines = content.split('\n')
  const funcs: FunctionInfo[] = []

  if (lang === 'py') {
    const defRe = /^(\s*)def\s+(\w+)\s*\(/
    for (let i = 0; i < lines.length; i++) {
      const m = defRe.exec(lines[i])
      if (!m) continue
      const indent = m[1].length
      let end = i + 1
      while (end < lines.length) {
        const l = lines[end]
        if (l.trim() === '') { end++; continue }
        const li = l.match(/^(\s*)/)?.[1].length ?? 0
        if (li <= indent && l.trim() !== '') break
        end++
      }
      funcs.push({ name: m[2], lines: end - i })
    }
  } else if (lang === 'go') {
    const fnRe = /^func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(/
    for (let i = 0; i < lines.length; i++) {
      const m = fnRe.exec(lines[i])
      if (!m) continue
      let depth = 0; let end = i
      for (let j = i; j < Math.min(i + 200, lines.length); j++) {
        for (const ch of lines[j]) { if (ch === '{') depth++; else if (ch === '}') depth-- }
        if (depth === 0 && j > i) { end = j; break }
      }
      funcs.push({ name: m[1], lines: end - i + 1 })
    }
  } else if (lang === 'rb') {
    const defRe = /^\s*def\s+(\w+)/
    for (let i = 0; i < lines.length; i++) {
      const m = defRe.exec(lines[i])
      if (!m) continue
      let depth = 1; let end = i + 1
      while (end < lines.length && depth > 0) {
        const l = lines[end].trim()
        if (l === 'end') depth--
        else if (/^(def|do|if|unless|while|for|begin|class|module)\b/.test(l)) depth++
        end++
      }
      funcs.push({ name: m[1], lines: end - i })
    }
  }

  return funcs
}

// ── Function extraction via ts-morph ─────────────────────────────────────────

function extractFunctionsTsMorph(project: Project, path: string): FunctionInfo[] {
  try {
    const sf = project.getSourceFile(`/${path}`)
    if (!sf) return []
    const funcs: FunctionInfo[] = []

    for (const fn of sf.getFunctions()) {
      const s = fn.getStartLineNumber(); const e = fn.getEndLineNumber()
      funcs.push({ name: fn.getName() ?? 'anonymous', lines: e - s + 1 })
    }
    for (const cls of sf.getClasses()) {
      const cn = cls.getName() ?? 'Class'
      for (const m of cls.getMethods()) {
        const s = m.getStartLineNumber(); const e = m.getEndLineNumber()
        funcs.push({ name: `${cn}.${m.getName()}`, lines: e - s + 1 })
      }
    }
    // Arrow functions assigned to variables (top-level)
    for (const vd of sf.getVariableDeclarations()) {
      const init = vd.getInitializer()
      if (!init) continue
      const k = init.getKind()
      if (k === SyntaxKind.ArrowFunction || k === SyntaxKind.FunctionExpression) {
        const s = init.getStartLineNumber(); const e = init.getEndLineNumber()
        funcs.push({ name: vd.getName(), lines: e - s + 1 })
      }
    }
    return funcs
  } catch { return [] }
}

// ── Duplicate block detection ─────────────────────────────────────────────────

function detectDuplicates(
  fileContents: Record<string, string>,
  blockSize = 8
): { preview: string[]; files: string[]; count: number }[] {
  const blockMap = new Map<string, { path: string; lines: string[] }[]>()

  for (const [path, content] of Object.entries(fileContents)) {
    const meaningful = content.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 3
        && !l.startsWith('//')
        && !l.startsWith('*')
        && !l.startsWith('#')
        && l !== '{'
        && l !== '}'
        && l !== ''
      )
    if (meaningful.length < blockSize) continue
    for (let i = 0; i <= meaningful.length - blockSize; i++) {
      const block = meaningful.slice(i, i + blockSize)
      const key = block.join('\n')
      if (!blockMap.has(key)) blockMap.set(key, [])
      blockMap.get(key)!.push({ path, lines: block })
    }
  }

  const results: { preview: string[]; files: string[]; count: number }[] = []
  const seen = new Set<string>()

  for (const [key, occurrences] of blockMap) {
    if (seen.has(key)) continue
    const uniqueFiles = [...new Set(occurrences.map(o => o.path))]
    if (uniqueFiles.length >= 2) {
      seen.add(key)
      results.push({ preview: occurrences[0].lines.slice(0, 4), files: uniqueFiles, count: uniqueFiles.length })
    }
  }

  // Sort by most files affected, limit to top 8
  return results.sort((a, b) => b.count - a.count).slice(0, 8)
}

// ── Test framework detection ───────────────────────────────────────────────────

function detectFrameworks(contents: Record<string, string>): string[] {
  const combined = Object.values(contents).join('\n')
  const frameworks: string[] = []
  if (/\bjest\b/.test(combined) || /from 'jest'/.test(combined)) frameworks.push('Jest')
  if (/\bvitest\b/.test(combined) || /from 'vitest'/.test(combined)) frameworks.push('Vitest')
  if (/\bmocha\b/.test(combined) || /from 'mocha'/.test(combined)) frameworks.push('Mocha')
  if (/\bjasmine\b/.test(combined)) frameworks.push('Jasmine')
  if (/import pytest/.test(combined) || /def test_/.test(combined)) frameworks.push('Pytest')
  if (/testing\.T/.test(combined) || /func Test/.test(combined)) frameworks.push('Go testing')
  if (/@testing-library/.test(combined)) frameworks.push('Testing Library')
  if (/cypress/.test(combined)) frameworks.push('Cypress')
  if (/playwright/.test(combined)) frameworks.push('Playwright')
  return frameworks
}

// ── GitHub fetch helper ────────────────────────────────────────────────────────

async function ghFetch(url: string, headers: Record<string, string>): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 25_000)
  try { return await fetch(url, { headers, cache: 'no-store', signal: ctrl.signal }) }
  finally { clearTimeout(t) }
}

// ── Score computation ──────────────────────────────────────────────────────────

function computeScore(
  structural: QualityReport['structural'],
  testing: QualityReport['testing'],
  practices: QualityReport['practices']
): { score: number; breakdown: QualityReport['breakdown'] } {
  // Structural score (0-40)
  const largePenalty = Math.min(16, structural.largeFunctions.length * 3)
  const complexPenalty = Math.min(10, structural.complexFiles.length * 2)
  const dupPenalty = Math.min(14, structural.duplicateBlocks.length * 4)
  const structuralScore = Math.max(0, 40 - largePenalty - complexPenalty - dupPenalty)

  // Testing score (0-40)
  const coverageScore = (testing.coveragePercent / 100) * 20
  const ratioScore = Math.min(20, testing.testToCodeRatio * 40)
  const testingScore = Math.min(40, Math.round(coverageScore + ratioScore))

  // Practices score (0-20)
  let practicesScore = 0
  if (practices.hasMocks) practicesScore += 5
  if (practices.hasIntegrationTests) practicesScore += 5
  if (practices.hasUnitTests) practicesScore += 5
  if (practices.assertionDensity > 2) practicesScore += 5

  const score = Math.min(100, Math.round(structuralScore + testingScore + practicesScore))

  return {
    score,
    breakdown: { structuralScore, testingScore, practicesScore },
  }
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
      .filter((p: string) => SOURCE_EXTS.has(extOf(p)))

    const sourcePaths = allPaths.filter(p => !isTestFile(p))
    const testPaths = allPaths.filter(p => isTestFile(p))

    // ── 3. Sample files (25 source + 15 test) ─────────────────────────────────
    const scoredSource = sourcePaths
      .map(p => {
        const name = baseName(p)
        let score = 0
        if (CRITICAL_FILES.includes(name)) score += 10
        if (p.split('/').length <= 2) score += 4
        else if (p.split('/').length <= 3) score += 2
        return { path: p, score }
      })
      .sort((a, b) => b.score - a.score)

    const selectedSource = scoredSource.slice(0, 25).map(s => s.path)
    const selectedTest = testPaths.slice(0, 15)
    const selectedPaths = [...selectedSource, ...selectedTest]

    // ── 4. Fetch file contents in parallel ────────────────────────────────────
    const fileContents: Record<string, string> = {}
    await Promise.all(
      selectedPaths.map(async (path) => {
        try {
          const r = await ghFetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, H)
          if (!r.ok) return
          const { content } = await r.json()
          if (content) fileContents[path] = Buffer.from(content, 'base64').toString('utf-8')
        } catch { /* non-fatal */ }
      })
    )

    // ── 5. Analyze files ───────────────────────────────────────────────────────
    const fileResults: FileResult[] = []

    // Build ts-morph project for JS/TS
    const jsPaths = Object.keys(fileContents).filter(p => detectLang(p) === 'js')
    let tsProject: Project | null = null
    if (jsPaths.length > 0) {
      try {
        tsProject = new Project({
          useInMemoryFileSystem: true,
          skipAddingFilesFromTsConfig: true,
          compilerOptions: { allowJs: true, jsx: 1 },
        })
        for (const path of jsPaths) {
          tsProject.createSourceFile(`/${path}`, fileContents[path], { overwrite: true })
        }
      } catch { tsProject = null }
    }

    for (const [path, content] of Object.entries(fileContents)) {
      const lang = detectLang(path)
      const totalLines = content.split('\n').length
      const isTest = isTestFile(path)
      let functions: FunctionInfo[] = []

      if (lang === 'js' && tsProject) {
        functions = extractFunctionsTsMorph(tsProject, path)
      }
      if (functions.length === 0) {
        functions = extractFunctionsRegex(content, lang)
      }

      fileResults.push({ path, totalLines, isTest, lang, functions })
    }

    // ── 6. Build structural analysis ──────────────────────────────────────────
    const sourceResults = fileResults.filter(f => !f.isTest)
    const testResults = fileResults.filter(f => f.isTest)

    const largeFunctions: { path: string; name: string; lines: number }[] = []
    const complexFiles: { path: string; functionCount: number; avgFunctionLines: number }[] = []

    for (const fr of sourceResults) {
      const largeInFile = fr.functions.filter(fn => fn.lines > 80)
      for (const fn of largeInFile) {
        largeFunctions.push({ path: fr.path, name: fn.name, lines: fn.lines })
      }
      if (fr.functions.length >= 8) {
        const avg = fr.functions.reduce((s, f) => s + f.lines, 0) / fr.functions.length
        complexFiles.push({ path: fr.path, functionCount: fr.functions.length, avgFunctionLines: Math.round(avg) })
      }
    }

    // Sort large functions by size
    largeFunctions.sort((a, b) => b.lines - a.lines)

    // Duplicate detection across source files only
    const sourceContents: Record<string, string> = {}
    for (const fr of sourceResults) {
      if (fileContents[fr.path]) sourceContents[fr.path] = fileContents[fr.path]
    }
    const duplicateBlocks = detectDuplicates(sourceContents)

    const structural: QualityReport['structural'] = {
      complexFiles: complexFiles.slice(0, 8),
      largeFunctions: largeFunctions.slice(0, 10),
      duplicateBlocks,
      issueCount: largeFunctions.length + complexFiles.length + duplicateBlocks.length,
    }

    // ── 7. Testing health analysis ─────────────────────────────────────────────
    // Build test target set — what each test file is testing
    // Handles: .test.ts  .spec.ts  _test.go  _test.py  test_module.py (prefix)
    const testBaseSet = new Set(
      testPaths.map(p => {
        let name = baseName(p)
          .replace(/\.test$/, '').replace(/\.spec$/, '')
          .replace(/_test$/, '').replace(/_spec$/, '')
        if (name.startsWith('test_')) name = name.slice(5)   // Python: test_auth → auth
        return name.toLowerCase()
      })
    )

    // Deduplicate source modules by base name so we don't inflate the denominator
    // (Next.js repos have many page.tsx, route.ts, index.ts files)
    const seenBases = new Set<string>()
    const untestedPairs: { path: string; base: string }[] = []
    const coveredPairs: { path: string; base: string }[] = []
    for (const p of selectedSource) {
      const base = baseName(p).toLowerCase()
      if (seenBases.has(base)) continue
      seenBases.add(base)
      if (testBaseSet.has(base)) coveredPairs.push({ path: p, base })
      else untestedPairs.push({ path: p, base })
    }

    const untestedModules = untestedPairs.map(x => x.base)
    const untestedSourcePaths = untestedPairs.map(x => x.path)
    const criticalUntested = untestedModules.filter(b => CRITICAL_FILES.includes(b))

    const totalUnique = untestedPairs.length + coveredPairs.length
    const coveragePercent = totalUnique > 0
      ? Math.round((coveredPairs.length / totalUnique) * 100)
      : 0

    const testToCodeRatio = sourcePaths.length > 0
      ? Math.round((testPaths.length / sourcePaths.length) * 100) / 100
      : 0

    const testFrameworks = detectFrameworks(
      Object.fromEntries(testResults.map(f => [f.path, fileContents[f.path] ?? '']))
    )

    const testing: QualityReport['testing'] = {
      coveragePercent,
      testToCodeRatio,
      untestedModules: untestedModules.slice(0, 12),
      untestedSourcePaths: untestedSourcePaths.slice(0, 12),
      criticalUntested: criticalUntested.slice(0, 6),
      testFrameworks,
      existingTestPaths: testPaths.slice(0, 30),
    }

    // ── 8. Testing practices analysis ─────────────────────────────────────────
    const testContent = testResults.map(f => fileContents[f.path] ?? '').join('\n')

    const mockCount = (testContent.match(/\b(?:jest\.fn|vi\.fn|jest\.mock|vi\.mock|sinon\.stub|sinon\.spy|spyOn|mock\(|\.mockImplementation|\.mockReturnValue)\b/g) ?? []).length
    const assertionCount = (testContent.match(/\b(?:expect|assert|should|toBe|toEqual|toHaveBeenCalled|assertEqual|assertTrue)\b/g) ?? []).length
    const integrationCount = (testContent.match(/\b(?:integration|e2e|end-to-end|supertest|request\(app\))\b/gi) ?? []).length
    const unitTestIndicators = (testContent.match(/\b(?:describe|it\(|test\(|beforeEach|afterEach)\b/g) ?? []).length

    const assertionDensity = testResults.length > 0 ? Math.round(assertionCount / testResults.length) : 0

    const practices: QualityReport['practices'] = {
      hasMocks: mockCount > 0,
      hasIntegrationTests: integrationCount > 0,
      hasUnitTests: unitTestIndicators > 0,
      mockCount,
      integrationCount,
      assertionDensity,
    }

    // ── 9. Compute score ───────────────────────────────────────────────────────
    const { score, breakdown } = computeScore(structural, testing, practices)

    const report: QualityReport = {
      score,
      meta: {
        totalFiles: allPaths.length,
        sourceFiles: sourcePaths.length,
        testFiles: testPaths.length,
        filesAnalyzed: Object.keys(fileContents).length,
        totalLines: fileResults.reduce((s, f) => s + f.totalLines, 0),
      },
      structural,
      testing,
      practices,
      breakdown,
    }

    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
