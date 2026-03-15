import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/session'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface GenerateTestsResult {
  sourcePath: string
  testCode: string
  suggestedPath: string
  tree: string
  framework: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function extOf(p: string) { const i = p.lastIndexOf('.'); return i >= 0 ? p.slice(i) : '' }
function baseName(p: string) { return (p.split('/').pop() ?? '').replace(/\.[^.]+$/, '') }
function dirOf(p: string) { return p.split('/').slice(0, -1).join('/') }

function detectLang(path: string): 'ts' | 'js' | 'py' | 'go' | 'rb' {
  if (path.endsWith('.py')) return 'py'
  if (path.endsWith('.go')) return 'go'
  if (path.endsWith('.rb')) return 'rb'
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'ts'
  return 'js'
}

// ── Detect repo test structure ─────────────────────────────────────────────────

function detectTestStructure(existingTestPaths: string[]): {
  dir: 'colocated' | '__tests__' | 'test' | 'tests'
  extPattern: string
  namePrefix: boolean   // Python test_* prefix convention
} {
  if (existingTestPaths.length === 0) {
    return { dir: '__tests__', extPattern: '.test.ts', namePrefix: false }
  }

  let colocated = 0, inTests = 0, inTest = 0, in__tests__ = 0
  let testDotTs = 0, specDotTs = 0, testDotJs = 0, specDotJs = 0
  let prefixCount = 0

  for (const p of existingTestPaths) {
    const lower = p.toLowerCase()
    const filename = lower.split('/').pop() ?? ''
    if (lower.includes('/__tests__/')) in__tests__++
    else if (lower.includes('/tests/') || lower.startsWith('tests/')) inTests++
    else if (lower.includes('/test/') || lower.startsWith('test/')) inTest++
    else colocated++

    if (filename.startsWith('test_')) prefixCount++
    if (lower.includes('.test.ts') || lower.includes('.test.tsx')) testDotTs++
    else if (lower.includes('.spec.ts') || lower.includes('.spec.tsx')) specDotTs++
    else if (lower.includes('.test.js') || lower.includes('.test.jsx')) testDotJs++
    else if (lower.includes('.spec.js') || lower.includes('.spec.jsx')) specDotJs++
  }

  const dir = in__tests__ >= inTests && in__tests__ >= inTest && in__tests__ >= colocated ? '__tests__'
    : inTests >= inTest && inTests >= colocated ? 'tests'
    : inTest >= colocated ? 'test'
    : 'colocated'

  const extPattern = testDotTs >= specDotTs && testDotTs >= testDotJs && testDotTs >= specDotJs ? '.test.ts'
    : specDotTs >= testDotJs && specDotTs >= specDotJs ? '.spec.ts'
    : testDotJs >= specDotJs ? '.test.js'
    : '.spec.js'

  return { dir, extPattern, namePrefix: prefixCount > existingTestPaths.length / 2 }
}

// ── Suggest where the test file should go ─────────────────────────────────────

function suggestTestPath(
  sourcePath: string,
  lang: string,
  structure: ReturnType<typeof detectTestStructure>
): { testPath: string; tree: string } {
  const dir = dirOf(sourcePath)
  const base = baseName(sourcePath)
  const srcExt = extOf(sourcePath)

  let testPath: string

  if (lang === 'go') {
    testPath = `${dir ? dir + '/' : ''}${base}_test.go`
  } else if (lang === 'py') {
    const name = structure.namePrefix ? `test_${base}.py` : `${base}_test.py`
    const folder = structure.dir === 'colocated' ? (dir || '.') : structure.dir
    testPath = `${folder}/${name}`
  } else {
    // JS / TS
    const testExt = srcExt === '.jsx' ? '.test.jsx'
      : srcExt === '.tsx' ? structure.extPattern.replace('.ts', '.tsx')
      : srcExt === '.mjs' || srcExt === '.cjs' ? '.test.js'
      : structure.extPattern
    const filename = `${base}${testExt}`

    if (structure.dir === 'colocated') {
      testPath = `${dir ? dir + '/' : ''}${filename}`
    } else if (structure.dir === '__tests__') {
      testPath = `${dir ? dir + '/' : ''}__tests__/${filename}`
    } else {
      testPath = `${structure.dir}/${filename}`
    }
  }

  // Build ASCII folder tree
  const parts = testPath.split('/')
  let tree = ''
  for (let i = 0; i < parts.length; i++) {
    const indent = '  '.repeat(i)
    const isFile = i === parts.length - 1
    tree += `${indent}${i === 0 ? '' : '└─ '}${parts[i]}${isFile ? '   ← place here' : '/'}\n`
  }

  return { testPath, tree }
}

// ── Pick framework label ───────────────────────────────────────────────────────

function pickFramework(detectedFrameworks: string[], lang: string): string {
  if (detectedFrameworks.length > 0) return detectedFrameworks[0]
  if (lang === 'py') return 'pytest'
  if (lang === 'go') return 'Go testing'
  return 'Jest'
}

// ── GitHub fetch helper ────────────────────────────────────────────────────────

async function ghFetch(url: string, headers: Record<string, string>): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 20_000)
  try { return await fetch(url, { headers, cache: 'no-store', signal: ctrl.signal }) }
  finally { clearTimeout(t) }
}

// ── POST handler ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get('gh_session')?.value
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const session = verifySession(token)
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Add ANTHROPIC_API_KEY to .env to use test generation.' }, { status: 503 })

  const accessToken = session.access_token as string
  const { owner, repo, sourcePath, existingTestPaths = [], testFrameworks = [], branch = 'main' } = await req.json()
  if (!owner || !repo || !sourcePath) return NextResponse.json({ error: 'Missing owner/repo/sourcePath' }, { status: 400 })

  const H = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  // ── 1. Fetch source file ──────────────────────────────────────────────────────
  const fileRes = await ghFetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(sourcePath)}`, H
  )
  if (!fileRes.ok) return NextResponse.json({ error: `Could not fetch ${sourcePath}` }, { status: 404 })
  const { content: b64, encoding } = await fileRes.json()
  if (encoding !== 'base64' || !b64) return NextResponse.json({ error: 'Unexpected file encoding' }, { status: 500 })
  const fileContent = Buffer.from(b64, 'base64').toString('utf-8')

  // ── 2. Detect structure + suggest path ────────────────────────────────────────
  const lang = detectLang(sourcePath)
  const structure = detectTestStructure(existingTestPaths)
  const { testPath, tree } = suggestTestPath(sourcePath, lang, structure)
  const framework = pickFramework(testFrameworks, lang)

  // ── 3. Build import path from test file to source ─────────────────────────────
  const testDir = dirOf(testPath)
  const srcDir = dirOf(sourcePath)
  let importPath: string
  if (lang === 'py' || lang === 'go' || lang === 'rb') {
    importPath = baseName(sourcePath)
  } else {
    // Relative path from test dir to source dir
    const testParts = testDir ? testDir.split('/') : []
    const srcParts = srcDir ? srcDir.split('/') : []
    let common = 0
    while (common < testParts.length && common < srcParts.length && testParts[common] === srcParts[common]) common++
    const up = testParts.slice(common).map(() => '..')
    const down = srcParts.slice(common)
    const rel = [...up, ...down, baseName(sourcePath)].join('/')
    importPath = rel.startsWith('.') ? rel : `./${rel}`
  }

  // ── 4. Generate tests with Claude ─────────────────────────────────────────────
  const langLabel: Record<string, string> = { ts: 'TypeScript', js: 'JavaScript', py: 'Python', go: 'Go', rb: 'Ruby' }
  const system = `You are an expert test engineer. Generate a complete, production-quality test file.

STRICT OUTPUT RULES:
- Output ONLY the raw test code — no markdown fences, no explanations, no comments outside the code
- Do NOT wrap in \`\`\` blocks
- First line must be an import or package declaration

Framework: ${framework}
Language: ${langLabel[lang] ?? lang}
Source file path: ${sourcePath}
Test file will be placed at: ${testPath}
Import the source module from: "${importPath}"

Test requirements:
1. Test every exported function, class, component, or route handler
2. At least one happy-path test and one edge-case or error test per export
3. Mock all external I/O (network, DB, file system) — never make real calls in tests
4. Descriptive test names ("should <behavior> when <condition>")
5. Group tests with describe blocks when testing a module with multiple exports`

  const userMsg = `Source code of ${sourcePath}:\n\n${fileContent.slice(0, 6000)}`

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1800,
        system,
        messages: [{ role: 'user', content: userMsg }],
      }),
    })
    if (!aiRes.ok) throw new Error(`Claude ${aiRes.status}`)
    const aiData = await aiRes.json()
    let testCode = aiData.content?.[0]?.text ?? ''

    // Strip any accidental markdown fences
    testCode = testCode.replace(/^```[\w]*\n?/m, '').replace(/\n?```$/m, '').trim()

    const result: GenerateTestsResult = { sourcePath, testCode, suggestedPath: testPath, tree, framework }
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Test generation failed: ${msg}` }, { status: 503 })
  }
}
