import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/session'
import Anthropic from '@anthropic-ai/sdk'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CodeSnippet {
  path: string
  lineStart: number
  code: string
  label: string
}

export interface StyleDimension {
  key: string
  label: string
  score: number       // 0–100
  insight: string
  color: string
  snippets: CodeSnippet[]
}

export interface StyleTag {
  label: string
  category: string
  positive: boolean
}

export interface StyleArchetype {
  name: string
  icon: string
  similarity: number  // 0–100
  description: string
}

export interface StyleFingerprintReport {
  owner: string
  repo: string
  language: string

  consistencyScore: number
  overallStyleScore: number

  dimensions: StyleDimension[]
  tags: StyleTag[]

  archetype: string
  archetypeIcon: string
  archetypeDescription: string
  similarArchetypes: StyleArchetype[]

  aiSummary: string

  rawSignals: {
    camelCaseRatio: number
    snakeCaseRatio: number
    arrowFnRatio: number
    asyncAwaitPct: number
    promiseChainPct: number
    callbackPct: number
    tryCatchCoverage: number
    commentDensity: number
    avgFunctionLines: number
    avgFileLines: number
    avgLineLength: number
    avgMaxNesting: number
    avgImports: number
    shortFnRatio: number
    defaultExportRatio: number
    constVarRatio: number
  }

  meta: {
    filesAnalyzed: number
    totalLines: number
    totalFunctions: number
    generatedAt: string
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const IGNORE = new Set([
  'node_modules', '.git', '.next', '.nuxt', 'dist', 'build', 'out', 'coverage',
  '.cache', '.vercel', '.turbo', '__pycache__', 'vendor', '.idea', '.vscode',
  'tmp', 'temp', 'logs', 'public', 'assets', 'static',
])

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

const DIMENSION_COLORS: Record<string, string> = {
  naming:           '#00E5FF',
  modularity:       '#7B61FF',
  readability:      '#00ff88',
  async_patterns:   '#FFD700',
  error_handling:   '#ff4466',
  function_design:  '#ff8800',
  abstraction:      '#a855f7',
  consistency:      '#f472b6',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extOf(p: string): string { const i = p.lastIndexOf('.'); return i >= 0 ? p.slice(i) : '' }

function isTestFile(p: string): boolean {
  const lower = p.toLowerCase()
  return lower.includes('.test.') || lower.includes('.spec.')
    || lower.includes('/__tests__/') || lower.includes('/test/')
    || lower.startsWith('test/') || lower.startsWith('tests/')
}

async function ghFetch(url: string, headers: Record<string, string>): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 25_000)
  try { return await fetch(url, { headers, cache: 'no-store', signal: ctrl.signal }) }
  finally { clearTimeout(t) }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

// ── Per-file analysis ─────────────────────────────────────────────────────────

interface FileSignals {
  path: string
  lines: number
  // naming
  camelCaseCount: number
  snakeCaseCount: number
  shortNameCount: number
  // functions
  arrowFnCount: number
  fnDeclarationCount: number
  asyncFnCount: number
  fnCount: number
  shortFnCount: number
  totalFnLines: number
  // async
  awaitCount: number
  thenCount: number
  callbackCount: number
  promiseAllCount: number
  // error handling
  tryCatchCount: number
  throwCount: number
  consoleErrorCount: number
  // comments
  totalCommentLines: number
  jsdocCount: number
  // structure
  importCount: number
  namedExportCount: number
  defaultExportCount: number
  maxNestingDepth: number
  avgLineLength: number
  // var style
  constCount: number
  varCount: number
  // snippets
  asyncSnippet?: CodeSnippet
  errorSnippet?: CodeSnippet
  functionSnippet?: CodeSnippet
  namingSnippet?: CodeSnippet
}

function analyzeFileStyle(path: string, content: string): FileSignals {
  const lines = content.split('\n')

  // Strip strings to avoid false pattern matches
  const noStrings = content
    .replace(/`[^`\\]*(?:\\.[^`\\]*)*`/g, '``')
    .replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, '""')
    .replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, "''")

  // ── Naming patterns ──────────────────────────────────────────────────────
  const camelCaseCount  = (noStrings.match(/\b(?:const|let|var|function)\s+([a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*)\b/g) ?? []).length
  const snakeCaseCount  = (noStrings.match(/\b(?:const|let|var|function)\s+([a-z]+_[a-z][a-zA-Z0-9_]*)\b/g) ?? []).length
  const shortNameCount  = (noStrings.match(/\b(?:const|let|var)\s+[a-z_]{1,2}\s*=/g) ?? []).length

  // ── Function extraction ──────────────────────────────────────────────────
  const arrowFnCount       = (noStrings.match(/(?:const|let)\s+\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-z]\w*)\s*=>/g) ?? []).length
  const fnDeclarationCount = (noStrings.match(/(?:^|\s)(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+\w+\s*\(/gm) ?? []).length
  const asyncFnCount       = (noStrings.match(/\basync\s+(?:function|\([^)]*\)\s*=>|\w+\s*=>)/g) ?? []).length

  // Extract function bodies to measure size
  const fnBodies: { name: string; startLine: number; lines: number }[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const m = /(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(line)
           ?? /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.exec(line)
    if (!m) continue
    let depth = 0, end = i
    if (line.includes('{')) {
      for (let j = i; j < Math.min(i + 300, lines.length); j++) {
        for (const ch of lines[j]) { if (ch === '{') depth++; else if (ch === '}') depth-- }
        if (depth === 0 && j > i) { end = j; break }
      }
    }
    fnBodies.push({ name: m[1], startLine: i + 1, lines: Math.max(1, end - i + 1) })
  }

  const fnCount      = fnBodies.length
  const shortFnCount = fnBodies.filter(f => f.lines < 15).length
  const totalFnLines = fnBodies.reduce((s, f) => s + f.lines, 0)

  // ── Async patterns ───────────────────────────────────────────────────────
  const awaitCount      = (noStrings.match(/\bawait\s+/g) ?? []).length
  const thenCount       = (noStrings.match(/\.then\s*\(/g) ?? []).length
  const callbackCount   = (noStrings.match(/\bfunction\s*\((?:err|error|cb|callback)/g) ?? []).length
  const promiseAllCount = (noStrings.match(/Promise\.all\s*\(/g) ?? []).length

  // ── Error handling ───────────────────────────────────────────────────────
  const tryCatchCount    = (noStrings.match(/\btry\s*\{/g) ?? []).length
  const throwCount       = (noStrings.match(/\bthrow\s+/g) ?? []).length
  const consoleErrorCount = (noStrings.match(/console\.(?:error|warn)\s*\(/g) ?? []).length

  // ── Comments ─────────────────────────────────────────────────────────────
  let totalCommentLines = 0, jsdocCount = 0
  let inBlock = false, inJsDoc = false
  for (const line of lines) {
    const t = line.trim()
    if (t.startsWith('/**')) { jsdocCount++; inJsDoc = true; totalCommentLines++ }
    else if (t.startsWith('/*')) { inBlock = true; totalCommentLines++ }
    else if (inJsDoc || inBlock) {
      totalCommentLines++
      if (t.includes('*/')) { inJsDoc = false; inBlock = false }
    } else if (t.startsWith('//')) { totalCommentLines++ }
  }

  // ── Structure ─────────────────────────────────────────────────────────────
  const importCount       = (content.match(/^\s*import\s+/gm) ?? []).length
  const namedExportCount  = (noStrings.match(/\bexport\s+(?:const|function|class|interface|type|enum)\b/g) ?? []).length
  const defaultExportCount = (noStrings.match(/\bexport\s+default\b/g) ?? []).length

  let depth = 0, maxNestingDepth = 0
  for (const ch of content) {
    if (ch === '{') { depth++; if (depth > maxNestingDepth) maxNestingDepth = depth }
    else if (ch === '}') depth = Math.max(0, depth - 1)
  }

  const nonEmpty = lines.filter(l => l.trim().length > 0)
  const avgLineLength = nonEmpty.length > 0
    ? Math.round(nonEmpty.reduce((s, l) => s + l.length, 0) / nonEmpty.length)
    : 0

  const constCount = (noStrings.match(/\bconst\s+/g) ?? []).length
  const varCount   = (noStrings.match(/\bvar\s+/g) ?? []).length

  // ── Representative snippets ───────────────────────────────────────────────
  let asyncSnippet: CodeSnippet | undefined
  let errorSnippet: CodeSnippet | undefined
  let functionSnippet: CodeSnippet | undefined
  let namingSnippet: CodeSnippet | undefined

  for (let i = 0; i < lines.length; i++) {
    if (!asyncSnippet && /async\s+(function|\w+\s*=>|\([^)]*\)\s*=>)/.test(lines[i])) {
      asyncSnippet = { path, lineStart: i + 1, label: 'Async Pattern',
        code: lines.slice(i, Math.min(i + 8, lines.length)).join('\n') }
    }
    if (!errorSnippet && /try\s*\{/.test(lines[i])) {
      errorSnippet = { path, lineStart: i + 1, label: 'Error Handling',
        code: lines.slice(i, Math.min(i + 8, lines.length)).join('\n') }
    }
    if (!functionSnippet && fnBodies.length > 0 && i + 1 === fnBodies[0].startLine) {
      const end = Math.min(fnBodies[0].startLine + Math.min(fnBodies[0].lines, 8) - 1, lines.length)
      functionSnippet = { path, lineStart: i + 1, label: 'Function Design',
        code: lines.slice(i, end).join('\n') }
    }
    if (!namingSnippet && /\b(?:const|let|function)\s+[a-z][a-zA-Z]{4,}\b/.test(lines[i])) {
      namingSnippet = { path, lineStart: i + 1, label: 'Naming Convention',
        code: lines.slice(i, Math.min(i + 5, lines.length)).join('\n') }
    }
    if (asyncSnippet && errorSnippet && functionSnippet && namingSnippet) break
  }

  return {
    path, lines: lines.length,
    camelCaseCount, snakeCaseCount, shortNameCount,
    arrowFnCount, fnDeclarationCount, asyncFnCount, fnCount, shortFnCount, totalFnLines,
    awaitCount, thenCount, callbackCount, promiseAllCount,
    tryCatchCount, throwCount, consoleErrorCount,
    totalCommentLines, jsdocCount,
    importCount, namedExportCount, defaultExportCount, maxNestingDepth, avgLineLength,
    constCount, varCount,
    asyncSnippet, errorSnippet, functionSnippet, namingSnippet,
  }
}

// ── Aggregation ───────────────────────────────────────────────────────────────

function aggregateSignals(files: FileSignals[]) {
  const n = files.length
  if (n === 0) return null

  // Sum all raw counts
  let camelCase = 0, snakeCase = 0, shortNames = 0
  let arrowFn = 0, fnDecl = 0, asyncFn = 0, fnCount = 0, shortFn = 0, fnLines = 0
  let awaitC = 0, thenC = 0, cbC = 0, promiseAll = 0
  let tryCatch = 0, throwC = 0, consoleErr = 0
  let commentLines = 0, jsdoc = 0, totalLines = 0
  let imports = 0, namedExp = 0, defaultExp = 0
  let constC = 0, varC = 0

  for (const f of files) {
    camelCase   += f.camelCaseCount;  snakeCase  += f.snakeCaseCount
    shortNames  += f.shortNameCount
    arrowFn     += f.arrowFnCount;    fnDecl     += f.fnDeclarationCount
    asyncFn     += f.asyncFnCount;    fnCount    += f.fnCount
    shortFn     += f.shortFnCount;    fnLines    += f.totalFnLines
    awaitC      += f.awaitCount;      thenC      += f.thenCount
    cbC         += f.callbackCount;   promiseAll += f.promiseAllCount
    tryCatch    += f.tryCatchCount;   throwC     += f.throwCount
    consoleErr  += f.consoleErrorCount
    commentLines += f.totalCommentLines; jsdoc   += f.jsdocCount
    totalLines  += f.lines
    imports     += f.importCount
    namedExp    += f.namedExportCount; defaultExp += f.defaultExportCount
    constC      += f.constCount;      varC       += f.varCount
  }

  // ── Derived ratios ────────────────────────────────────────────────────────
  const totalFnStyle    = arrowFn + fnDecl
  const arrowFnRatio    = totalFnStyle > 0 ? arrowFn / totalFnStyle : 0.5
  const totalAsync      = awaitC + thenC + cbC
  const asyncAwaitPct   = totalAsync > 0 ? (awaitC  / totalAsync) * 100 : 50
  const promiseChainPct = totalAsync > 0 ? (thenC   / totalAsync) * 100 : 0
  const callbackPct     = totalAsync > 0 ? (cbC     / totalAsync) * 100 : 0
  const totalNaming     = camelCase + snakeCase
  const camelCaseRatio  = totalNaming > 0 ? camelCase / totalNaming : 0.8
  const snakeCaseRatio  = 1 - camelCaseRatio
  const commentDensity  = totalLines > 0 ? (commentLines / totalLines) * 100 : 0
  const tryCatchCoverage = asyncFn > 0 ? clamp((tryCatch / asyncFn) * 100, 0, 100) : 0
  const avgFunctionLines = fnCount > 0 ? fnLines / fnCount : 0
  const shortFnRatio     = fnCount > 0 ? shortFn / fnCount : 0.5
  const avgImports       = imports / n
  const avgFileLines     = totalLines / n
  const defaultExportRatio = (defaultExp + namedExp) > 0 ? defaultExp / (defaultExp + namedExp) : 0.5
  const constVarRatio    = (constC + varC) > 0 ? constC / (constC + varC) : 0.9
  const avgMaxNesting    = files.reduce((s, f) => s + f.maxNestingDepth, 0) / n
  const avgLineLength    = files.reduce((s, f) => s + f.avgLineLength, 0) / n
  const totalFunctions   = fnCount

  // ── Dimension scoring ─────────────────────────────────────────────────────

  // 1. Naming Quality (0–100)
  const namingScore = clamp(Math.round(
    camelCaseRatio * 55 +
    (constVarRatio > 0.85 ? 20 : constVarRatio * 23) +
    (shortNames / Math.max(fnCount, 1) < 0.3 ? 25 : 10),
  ), 0, 100)

  // 2. Modularity (0–100)
  const modularityScore = clamp(Math.round(
    (avgFileLines < 150 ? 40 : avgFileLines < 300 ? 25 : avgFileLines < 500 ? 12 : 4) +
    clamp((1 - avgImports / 20) * 35, 5, 35) +
    (shortFnRatio > 0.65 ? 25 : shortFnRatio * 25),
  ), 0, 100)

  // 3. Readability (0–100)
  const readabilityScore = clamp(Math.round(
    (commentDensity >= 5 && commentDensity <= 25 ? 35 : commentDensity > 25 ? 22 : commentDensity * 6) +
    (avgLineLength < 80 ? 35 : avgLineLength < 100 ? 22 : avgLineLength < 120 ? 10 : 4) +
    (avgMaxNesting < 3 ? 30 : avgMaxNesting < 5 ? 18 : avgMaxNesting < 7 ? 8 : 3),
  ), 0, 100)

  // 4. Async Patterns (0–100)
  const asyncScore = clamp(Math.round(
    asyncAwaitPct * 0.55 +
    clamp(promiseAll * 4, 0, 25) +
    (callbackPct < 10 ? 20 : Math.max(0, 20 - callbackPct * 0.5)),
  ), 0, 100)

  // 5. Error Handling (0–100)
  const errorScore = clamp(Math.round(
    clamp(tryCatchCoverage * 0.5, 0, 50) +
    clamp(consoleErr * 2.5, 0, 25) +
    clamp(throwC * 2, 0, 25),
  ), 0, 100)

  // 6. Function Design (0–100)
  const fnDesignScore = clamp(Math.round(
    shortFnRatio * 50 +
    (arrowFnRatio > 0.5 ? 30 : (1 - arrowFnRatio) * 30) +
    (avgFunctionLines < 20 ? 20 : avgFunctionLines < 40 ? 12 : avgFunctionLines < 80 ? 5 : 0),
  ), 0, 100)

  // 7. Abstraction (0–100)
  const abstractionScore = clamp(Math.round(
    clamp(shortFnRatio * 55, 15, 55) +
    clamp(avgImports * 2.2, 0, 30) +
    (jsdoc > 3 ? 15 : jsdoc * 4),
  ), 0, 100)

  // 8. Consistency (0–100) — variance of naming style across files
  const perFileCamelRatio = files.map(f => {
    const t = f.camelCaseCount + f.snakeCaseCount
    return t > 0 ? f.camelCaseCount / t : camelCaseRatio
  })
  const variance = perFileCamelRatio.length > 1
    ? perFileCamelRatio.reduce((s, v) => s + Math.pow(v - camelCaseRatio, 2), 0) / perFileCamelRatio.length
    : 0
  const consistencyScore = clamp(Math.round(100 - variance * 200), 40, 100)

  const overallStyleScore = Math.round(
    namingScore * 0.15 + modularityScore * 0.18 + readabilityScore * 0.15 +
    asyncScore * 0.15 + errorScore * 0.10 + fnDesignScore * 0.15 + abstractionScore * 0.12,
  )

  // ── Collect snippets per dimension ────────────────────────────────────────
  const asyncSnippets  = files.flatMap(f => f.asyncSnippet  ? [f.asyncSnippet]  : []).slice(0, 2)
  const errorSnippets  = files.flatMap(f => f.errorSnippet  ? [f.errorSnippet]  : []).slice(0, 2)
  const fnSnippets     = files.flatMap(f => f.functionSnippet ? [f.functionSnippet] : []).slice(0, 2)
  const namingSnippets = files.flatMap(f => f.namingSnippet ? [f.namingSnippet] : []).slice(0, 2)

  // ── Build dimension objects ───────────────────────────────────────────────
  const dimensions: StyleDimension[] = [
    {
      key: 'naming', label: 'Naming Quality', score: namingScore,
      color: DIMENSION_COLORS.naming,
      insight: camelCaseRatio > 0.75
        ? `${Math.round(camelCaseRatio * 100)}% camelCase — idiomatic, consistent naming`
        : `Mixed styles: ${Math.round(camelCaseRatio * 100)}% camelCase · ${Math.round(snakeCaseRatio * 100)}% snake_case`,
      snippets: namingSnippets,
    },
    {
      key: 'modularity', label: 'Modularity', score: modularityScore,
      color: DIMENSION_COLORS.modularity,
      insight: avgFileLines < 200
        ? `Lean files (avg ${Math.round(avgFileLines)} lines) — well-decomposed codebase`
        : `Larger files (avg ${Math.round(avgFileLines)} lines) · avg ${avgImports.toFixed(1)} imports/file`,
      snippets: [],
    },
    {
      key: 'readability', label: 'Readability', score: readabilityScore,
      color: DIMENSION_COLORS.readability,
      insight: `${commentDensity.toFixed(1)}% comment density · ${Math.round(avgLineLength)} chars/line · nesting ≈ ${avgMaxNesting.toFixed(1)}`,
      snippets: [],
    },
    {
      key: 'async_patterns', label: 'Async Patterns', score: asyncScore,
      color: DIMENSION_COLORS.async_patterns,
      insight: asyncAwaitPct > 65
        ? `async/await dominant (${Math.round(asyncAwaitPct)}%) — modern, clean async code`
        : promiseChainPct > 45
          ? `Promise chains preferred (${Math.round(promiseChainPct)}%) — functional style`
          : `Mixed async: ${Math.round(asyncAwaitPct)}% await · ${Math.round(promiseChainPct)}% .then`,
      snippets: asyncSnippets,
    },
    {
      key: 'error_handling', label: 'Error Handling', score: errorScore,
      color: DIMENSION_COLORS.error_handling,
      insight: tryCatchCoverage > 60
        ? `Solid coverage — ${Math.round(tryCatchCoverage)}% of async fns guarded`
        : `Light coverage — ${Math.round(tryCatchCoverage)}% of async fns guarded`,
      snippets: errorSnippets,
    },
    {
      key: 'function_design', label: 'Function Design', score: fnDesignScore,
      color: DIMENSION_COLORS.function_design,
      insight: shortFnRatio > 0.65
        ? `${Math.round(shortFnRatio * 100)}% of functions under 15 lines — focused, composable`
        : `Avg function length ${Math.round(avgFunctionLines)} lines — some long functions present`,
      snippets: fnSnippets,
    },
    {
      key: 'abstraction', label: 'Abstraction', score: abstractionScore,
      color: DIMENSION_COLORS.abstraction,
      insight: avgImports > 8
        ? `High compositional density (${avgImports.toFixed(1)} imports/file) — leverages abstractions`
        : `Lean dependencies (${avgImports.toFixed(1)} imports/file) — self-contained modules`,
      snippets: [],
    },
    {
      key: 'consistency', label: 'Consistency', score: consistencyScore,
      color: DIMENSION_COLORS.consistency,
      insight: consistencyScore > 82
        ? 'Highly uniform style across all files'
        : consistencyScore > 65
          ? 'Moderate variance — most files follow the same conventions'
          : 'Noticeable style drift between files',
      snippets: [],
    },
  ]

  // ── Style tags ────────────────────────────────────────────────────────────
  const tags: StyleTag[] = []
  if (camelCaseRatio > 0.78) tags.push({ label: 'camelCase', category: 'naming', positive: true })
  else if (snakeCaseRatio > 0.55) tags.push({ label: 'snake_case', category: 'naming', positive: true })
  if (constVarRatio > 0.88) tags.push({ label: 'immutability-first', category: 'style', positive: true })
  if (asyncAwaitPct > 65) tags.push({ label: 'async/await preferred', category: 'async', positive: true })
  else if (promiseChainPct > 45) tags.push({ label: 'promise chains', category: 'async', positive: true })
  if (callbackPct > 40) tags.push({ label: 'callback style', category: 'async', positive: false })
  if (commentDensity > 12) tags.push({ label: 'well documented', category: 'readability', positive: true })
  else if (commentDensity < 3) tags.push({ label: 'minimal comments', category: 'readability', positive: false })
  if (avgMaxNesting < 3) tags.push({ label: 'low nesting', category: 'readability', positive: true })
  else if (avgMaxNesting > 5) tags.push({ label: 'deep nesting', category: 'readability', positive: false })
  if (shortFnRatio > 0.70) tags.push({ label: 'small functions', category: 'functions', positive: true })
  else if (avgFunctionLines > 50) tags.push({ label: 'long functions', category: 'functions', positive: false })
  if (arrowFnRatio > 0.70) tags.push({ label: 'arrow functions', category: 'functions', positive: true })
  else if (arrowFnRatio < 0.25) tags.push({ label: 'function declarations', category: 'functions', positive: true })
  if (tryCatchCoverage > 60) tags.push({ label: 'defensive coding', category: 'errors', positive: true })
  else if (tryCatchCoverage < 20 && asyncFn > 5) tags.push({ label: 'minimal error handling', category: 'errors', positive: false })
  if (avgFileLines < 150) tags.push({ label: 'modular files', category: 'modularity', positive: true })
  else if (avgFileLines > 400) tags.push({ label: 'large files', category: 'modularity', positive: false })
  if (promiseAll > 3) tags.push({ label: 'parallelized async', category: 'async', positive: true })
  if (jsdoc > 5) tags.push({ label: 'JSDoc annotated', category: 'readability', positive: true })

  // ── Archetype matching ────────────────────────────────────────────────────
  const ARCHETYPES: { name: string; icon: string; description: string; vector: Record<string, number> }[] = [
    {
      name: 'The Architect', icon: '🏗️',
      description: 'Structures code for long-term maintainability with clear abstractions and modular design.',
      vector: { naming: 88, modularity: 90, readability: 75, async_patterns: 78, error_handling: 80, function_design: 85, abstraction: 90, consistency: 88 },
    },
    {
      name: 'The Pragmatist', icon: '⚡',
      description: 'Gets things done cleanly — readable, practical, without over-engineering.',
      vector: { naming: 78, modularity: 65, readability: 80, async_patterns: 82, error_handling: 65, function_design: 75, abstraction: 58, consistency: 75 },
    },
    {
      name: 'The Minimalist', icon: '✨',
      description: 'Concise, focused code — short functions, low nesting, zero redundancy.',
      vector: { naming: 72, modularity: 82, readability: 85, async_patterns: 70, error_handling: 48, function_design: 92, abstraction: 70, consistency: 80 },
    },
    {
      name: 'The Documenter', icon: '📖',
      description: 'Clarity first — thorough documentation, descriptive names, and explanatory comments.',
      vector: { naming: 92, modularity: 68, readability: 95, async_patterns: 65, error_handling: 75, function_design: 70, abstraction: 65, consistency: 85 },
    },
    {
      name: 'The Defender', icon: '🛡️',
      description: 'Defensive philosophy — comprehensive error handling, guarded paths, resilience.',
      vector: { naming: 80, modularity: 70, readability: 70, async_patterns: 80, error_handling: 95, function_design: 70, abstraction: 75, consistency: 82 },
    },
    {
      name: 'The Scripter', icon: '📜',
      description: 'Direct and quick — solves problems without heavy ceremony or abstraction layers.',
      vector: { naming: 62, modularity: 48, readability: 58, async_patterns: 60, error_handling: 42, function_design: 52, abstraction: 44, consistency: 62 },
    },
  ]

  const devVector: Record<string, number> = {
    naming: namingScore, modularity: modularityScore, readability: readabilityScore,
    async_patterns: asyncScore, error_handling: errorScore,
    function_design: fnDesignScore, abstraction: abstractionScore, consistency: consistencyScore,
  }

  const similarities = ARCHETYPES.map(a => {
    const keys = Object.keys(devVector)
    const dot  = keys.reduce((s, k) => s + devVector[k] * a.vector[k], 0)
    const magD = Math.sqrt(keys.reduce((s, k) => s + devVector[k] ** 2, 0))
    const magA = Math.sqrt(keys.reduce((s, k) => s + a.vector[k] ** 2, 0))
    const cos  = magD > 0 && magA > 0 ? dot / (magD * magA) : 0
    return { ...a, similarity: Math.round(cos * 100) }
  }).sort((a, b) => b.similarity - a.similarity)

  const top = similarities[0]

  return {
    rawSignals: {
      camelCaseRatio:    Math.round(camelCaseRatio * 100) / 100,
      snakeCaseRatio:    Math.round(snakeCaseRatio * 100) / 100,
      arrowFnRatio:      Math.round(arrowFnRatio * 100) / 100,
      asyncAwaitPct:     Math.round(asyncAwaitPct),
      promiseChainPct:   Math.round(promiseChainPct),
      callbackPct:       Math.round(callbackPct),
      tryCatchCoverage:  Math.round(tryCatchCoverage),
      commentDensity:    Math.round(commentDensity * 10) / 10,
      avgFunctionLines:  Math.round(avgFunctionLines),
      avgFileLines:      Math.round(avgFileLines),
      avgLineLength:     Math.round(avgLineLength),
      avgMaxNesting:     Math.round(avgMaxNesting * 10) / 10,
      avgImports:        Math.round(avgImports * 10) / 10,
      shortFnRatio:      Math.round(shortFnRatio * 100) / 100,
      defaultExportRatio: Math.round(defaultExportRatio * 100) / 100,
      constVarRatio:     Math.round(constVarRatio * 100) / 100,
    },
    dimensions,
    tags,
    archetype: top.name,
    archetypeIcon: top.icon,
    archetypeDescription: top.description,
    similarArchetypes: similarities.slice(0, 3).map(a => ({
      name: a.name, icon: a.icon, similarity: a.similarity, description: a.description,
    })),
    consistencyScore,
    overallStyleScore,
    totalFunctions,
    totalLines,
  }
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
  const repo  = searchParams.get('repo')
  if (!owner || !repo) return NextResponse.json({ error: 'Missing owner/repo' }, { status: 400 })

  const H = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  try {
    // 1. Default branch + language
    const repoRes = await ghFetch(`https://api.github.com/repos/${owner}/${repo}`, H)
    if (!repoRes.ok) return NextResponse.json({ error: 'Repo not found' }, { status: 404 })
    const repoData = await repoRes.json()
    const branch   = repoData.default_branch || 'main'
    const language = repoData.language ?? 'JavaScript'

    // 2. File tree
    const treeRes = await ghFetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, H,
    )
    if (!treeRes.ok) return NextResponse.json({ error: 'Tree fetch failed' }, { status: 500 })
    const { tree: rawTree } = await treeRes.json()

    const blobs: { path: string; size: number }[] = (rawTree ?? [])
      .filter((f: { type: string }) => f.type === 'blob')
      .map((f: { path: string; size?: number }) => ({ path: f.path, size: f.size ?? 0 }))
      .filter((f: { path: string }) => !f.path.split('/').some((seg: string) => IGNORE.has(seg)))
      .filter((f: { path: string }) => SOURCE_EXTS.has(extOf(f.path)))
      .filter((f: { path: string }) => !isTestFile(f.path))

    // Prefer larger, more substantial files
    const samplePaths = [...blobs]
      .sort((a, b) => b.size - a.size)
      .slice(0, 40)
      .map(f => f.path)

    // 3. Fetch contents in parallel
    const fileContents: Record<string, string> = {}
    await Promise.all(samplePaths.map(async (p) => {
      try {
        const r = await ghFetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(p)}`, H,
        )
        if (!r.ok) return
        const { content } = await r.json()
        if (content) fileContents[p] = Buffer.from(content, 'base64').toString('utf-8')
      } catch { /* non-fatal */ }
    }))

    // 4. Analyse each file
    const fileSignals = Object.entries(fileContents).map(([p, c]) => analyzeFileStyle(p, c))

    // 5. Aggregate
    const agg = aggregateSignals(fileSignals)
    if (!agg) return NextResponse.json({ error: 'No analysable files found' }, { status: 422 })

    // 6. AI summary
    let aiSummary = ''
    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const topDims  = [...agg.dimensions].sort((a, b) => b.score - a.score).slice(0, 3)
      const weakDims = [...agg.dimensions].sort((a, b) => a.score - b.score).slice(0, 2)
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 250,
        messages: [{
          role: 'user',
          content: `Write a sharp 2-3 sentence coding style analysis for a developer's repository. Use specific, technical language. No bullet points. Professional and analytical tone.

Repo: ${owner}/${repo} (${language})
Style archetype: ${agg.archetype}
Strongest dimensions: ${topDims.map(d => `${d.label} (${d.score}/100)`).join(', ')}
Weakest dimensions: ${weakDims.map(d => `${d.label} (${d.score}/100)`).join(', ')}
Key signals: async/await ${agg.rawSignals.asyncAwaitPct}%, comment density ${agg.rawSignals.commentDensity}%, avg fn ${agg.rawSignals.avgFunctionLines} lines, nesting ${agg.rawSignals.avgMaxNesting}, ${Math.round(agg.rawSignals.arrowFnRatio * 100)}% arrow fns
Style tags: ${agg.tags.filter(t => t.positive).map(t => t.label).join(', ')}
Consistency score: ${agg.consistencyScore}/100`,
        }],
      })
      aiSummary = (msg.content[0] as { type: string; text: string }).text.trim()
    } catch {
      const top = agg.dimensions.sort((a, b) => b.score - a.score)[0]
      aiSummary = `This ${language} codebase exhibits a "${agg.archetype}" profile with a strong emphasis on ${top.label.toLowerCase()}. ${agg.rawSignals.asyncAwaitPct > 60 ? 'Modern async/await patterns dominate the asynchronous code.' : 'Async patterns show room for modernisation.'} The overall style consistency score of ${agg.consistencyScore}/100 reflects ${agg.consistencyScore > 75 ? 'a disciplined, uniform approach across files.' : 'some variance in conventions across the codebase.'}`
    }

    const report: StyleFingerprintReport = {
      owner, repo, language,
      consistencyScore: agg.consistencyScore,
      overallStyleScore: agg.overallStyleScore,
      dimensions: agg.dimensions,
      tags: agg.tags,
      archetype: agg.archetype,
      archetypeIcon: agg.archetypeIcon,
      archetypeDescription: agg.archetypeDescription,
      similarArchetypes: agg.similarArchetypes,
      aiSummary,
      rawSignals: agg.rawSignals,
      meta: {
        filesAnalyzed: fileSignals.length,
        totalLines: agg.totalLines,
        totalFunctions: agg.totalFunctions,
        generatedAt: new Date().toISOString(),
      },
    }

    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
