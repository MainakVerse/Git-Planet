import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { verifySession } from '@/lib/session'

// ── Auth ────────────────────────────────────────────────────────────────────────

export interface AuthOk { ok: true; accessToken: string; headers: Record<string, string> }
export interface AuthErr { ok: false; response: NextResponse }
export type AuthResult = AuthOk | AuthErr

/**
 * Standard session gate used by every analysis route. Returns either the
 * GitHub access token + ready-to-use headers, or a NextResponse to return.
 */
export async function authenticate(): Promise<AuthResult> {
  const cookieStore = await cookies()
  const token = cookieStore.get('gh_session')?.value
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  }
  const session = verifySession(token)
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid session' }, { status: 401 }) }
  }
  const accessToken = session.access_token as string
  if (!accessToken) {
    return { ok: false, response: NextResponse.json({ error: 'No access token in session' }, { status: 401 }) }
  }
  return {
    ok: true,
    accessToken,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  }
}

// ── Fetch ───────────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT = 22_000

/** GitHub fetch with abort timeout. Never throws on HTTP status — returns the Response. */
export async function ghFetch(
  url: string,
  headers: Record<string, string>,
  timeoutMs = DEFAULT_TIMEOUT,
): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { headers, cache: 'no-store', signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

/** Fetch + parse JSON, returning a fallback on any failure (non-ok status, abort, parse error). */
export async function ghJson<T>(url: string, headers: Record<string, string>, fallback: T): Promise<T> {
  try {
    const r = await ghFetch(url, headers)
    if (!r.ok) return fallback
    return (await r.json()) as T
  } catch {
    return fallback
  }
}

/**
 * Paginate a GitHub list endpoint until exhaustion or maxPages.
 * `url` must already contain `per_page`; `&page=N` is appended.
 */
export async function ghPaginate<T>(
  baseUrl: string,
  headers: Record<string, string>,
  maxPages = 3,
): Promise<T[]> {
  const out: T[] = []
  const sep = baseUrl.includes('?') ? '&' : '?'
  for (let page = 1; page <= maxPages; page++) {
    const batch = await ghJson<T[]>(`${baseUrl}${sep}page=${page}`, headers, [])
    if (!Array.isArray(batch) || batch.length === 0) break
    out.push(...batch)
    if (batch.length < 100) break
  }
  return out
}

// ── Shared GitHub types ───────────────────────────────────────────────────────────

export interface GHUserLite {
  login: string
  id: number
  avatar_url: string
  html_url: string
  type?: string
}

export interface GHContributor extends GHUserLite {
  contributions: number
}

export interface GHRepoMeta {
  name: string
  full_name: string
  owner: { login: string }
  description: string | null
  html_url: string
  default_branch: string
  language: string | null
  stargazers_count: number
  forks_count: number
  watchers_count: number
  subscribers_count?: number
  open_issues_count: number
  size: number
  created_at: string
  updated_at: string
  pushed_at: string
  archived: boolean
  fork: boolean
  license: { spdx_id: string | null; name: string } | null
  topics?: string[]
}

export interface GHCommitListItem {
  sha: string
  commit: {
    author: { name: string; email: string; date: string } | null
    committer: { name: string; email: string; date: string } | null
    message: string
  }
  author: GHUserLite | null
  committer: GHUserLite | null
}

export interface GHIssue {
  number: number
  title: string
  state: 'open' | 'closed'
  created_at: string
  updated_at: string
  closed_at: string | null
  comments: number
  user: GHUserLite | null
  pull_request?: unknown   // present ⇒ this "issue" is actually a PR
  labels: { name: string }[]
}

// ── Repo resolver ─────────────────────────────────────────────────────────────────

/** Parse owner/repo from search params, accepting `?owner=&repo=` or `?full=owner/repo`. */
export function parseRepoParams(searchParams: URLSearchParams): { owner: string; repo: string } | null {
  const full = searchParams.get('full')
  if (full && full.includes('/')) {
    const [owner, repo] = full.split('/')
    if (owner && repo) return { owner, repo }
  }
  const owner = searchParams.get('owner')
  const repo = searchParams.get('repo')
  if (owner && repo) return { owner, repo }
  return null
}

// ── Scoring utilities ─────────────────────────────────────────────────────────────

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export function logScale(value: number, base = 10, factor = 1): number {
  return (Math.log10(value + 1) / Math.log10(base)) * factor
}

export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

export function daysBetween(a: string | number | Date, b: string | number | Date): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000
}

export function daysSince(d: string | number | Date): number {
  return (Date.now() - new Date(d).getTime()) / 86_400_000
}

/** Shannon-entropy–based concentration. Returns 0 (one actor) … 1 (perfectly even). */
export function evenness(values: number[]): number {
  const total = values.reduce((s, v) => s + v, 0)
  if (total <= 0 || values.length <= 1) return 0
  const h = values.reduce((s, v) => {
    if (v <= 0) return s
    const p = v / total
    return s - p * Math.log(p)
  }, 0)
  return h / Math.log(values.length)
}

/** Gini coefficient of inequality. 0 = perfectly equal, 1 = fully concentrated. */
export function gini(values: number[]): number {
  const xs = values.filter(v => v >= 0).sort((a, b) => a - b)
  const n = xs.length
  if (n === 0) return 0
  const sum = xs.reduce((s, v) => s + v, 0)
  if (sum === 0) return 0
  let cum = 0
  for (let i = 0; i < n; i++) cum += (2 * (i + 1) - n - 1) * xs[i]
  return clamp(cum / (n * sum), 0, 1)
}

export const GRADE_BANDS: { min: number; grade: string; color: string }[] = [
  { min: 90, grade: 'A+', color: '#00ff88' },
  { min: 80, grade: 'A', color: '#00ff88' },
  { min: 70, grade: 'B', color: '#00E5FF' },
  { min: 60, grade: 'C', color: '#FFD700' },
  { min: 45, grade: 'D', color: '#ff8800' },
  { min: 0, grade: 'F', color: '#ff4466' },
]

export function grade(score: number): { grade: string; color: string } {
  const band = GRADE_BANDS.find(b => score >= b.min) ?? GRADE_BANDS[GRADE_BANDS.length - 1]
  return { grade: band.grade, color: band.color }
}

export const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#FFD43B',
  Go: '#00ADD8', Rust: '#dea584', Java: '#b07219', 'C++': '#f34b7d',
  C: '#555555', Ruby: '#701516', PHP: '#4F5D95', Swift: '#ffac45',
  Kotlin: '#A97BFF', CSS: '#563d7c', HTML: '#e34c26', Shell: '#89e051',
  Vue: '#41b883', Svelte: '#ff3e00', Dart: '#00B4AB', Scala: '#c22d40',
}

// ── AI summary (graceful fallback) ─────────────────────────────────────────────────

/**
 * Request a short AI summary from Claude Haiku. Returns the fallback string
 * verbatim if no API key is configured or the request fails for any reason.
 * Keeps every feature fully functional without ANTHROPIC_API_KEY.
 */
export async function aiSummarize(prompt: string, fallback: string, maxTokens = 280): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return fallback
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 18_000)
    let res: Response
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: ctrl.signal,
      })
    } finally {
      clearTimeout(t)
    }
    if (!res.ok) return fallback
    const data = await res.json()
    const text = data?.content?.[0]?.text
    return typeof text === 'string' && text.trim() ? text.trim() : fallback
  } catch {
    return fallback
  }
}

/**
 * Ask the model for a JSON object and parse it. Returns `fallback` if no key,
 * request fails, or output isn't valid JSON. Strips markdown code fences.
 */
export async function aiJson<T>(prompt: string, fallback: T, maxTokens = 1200): Promise<T> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return fallback
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 30_000)
    let res: Response
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: `${prompt}\n\nRespond with ONLY valid JSON, no markdown fences, no prose.` }],
        }),
        signal: ctrl.signal,
      })
    } finally { clearTimeout(t) }
    if (!res.ok) return fallback
    const data = await res.json()
    let text: string = data?.content?.[0]?.text ?? ''
    text = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const start = text.indexOf('{'); const arrStart = text.indexOf('[')
    const begin = arrStart >= 0 && (start < 0 || arrStart < start) ? arrStart : start
    if (begin > 0) text = text.slice(begin)
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

// ── AI chat (Opus, grounded, returns explicit errors for the UI) ────────────────────

export interface ChatTurn { role: 'user' | 'assistant'; content: string }
export interface ChatResult { ok: boolean; reply?: string; error?: string; status?: number }

function cleanEnv(value: string | undefined): string {
  return (value ?? '').trim().replace(/^['"]|['"]$/g, '')
}

/**
 * Multi-turn grounded chat for the "Ask AI" modes. Uses Opus for the deeper
 * reasoning tasks (repo explanation, startup ideation). Returns an explicit
 * error (not a fallback) so the chat UI can prompt the user to add a key.
 */
export async function aiChat(
  system: string,
  history: ChatTurn[],
  { model = cleanEnv(process.env.ANTHROPIC_MODEL) || 'claude-opus-4-8', maxTokens = 1024 }: { model?: string; maxTokens?: number } = {},
): Promise<ChatResult> {
  const apiKey = cleanEnv(process.env.ANTHROPIC_API_KEY)
  if (!apiKey) return { ok: false, error: 'Add ANTHROPIC_API_KEY to your .env to enable Ask-AI mode.', status: 503 }

  const models = [model, 'claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001']
    .filter((value, index, all) => value && all.indexOf(value) === index)

  let lastError = 'Chat failed'
  for (const modelId of models) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 45_000)
      let res: Response
      try {
        res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: modelId, max_tokens: maxTokens, system, messages: history }),
          signal: ctrl.signal,
        })
      } finally { clearTimeout(t) }
      if (!res.ok) {
        const txt = await res.text()
        lastError = `Anthropic ${res.status} (${modelId}): ${txt.slice(0, 140)}`
        continue
      }
      const data = await res.json()
      const reply = data?.content?.[0]?.text
      if (reply) return { ok: true, reply }
      lastError = `Empty response from ${modelId}`
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'Chat failed'
    }
  }

  return { ok: false, error: lastError, status: 503 }
}

// ── Repo content fetchers (shared across AI-doc / security modules) ──────────────────

export const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.next', '.nuxt', 'dist', 'build', 'out', 'coverage',
  '.cache', '.vercel', '.turbo', '__pycache__', '.pytest_cache', 'target',
  'vendor', '.idea', '.vscode', 'tmp', 'temp', 'logs',
])

export interface RepoTreeFile { path: string; type: string; size?: number }

/** Fetch the recursive git tree for a repo's default branch, filtered of junk dirs. */
export async function fetchTree(
  owner: string, repo: string, branch: string, headers: Record<string, string>,
): Promise<RepoTreeFile[]> {
  const data = await ghJson<{ tree?: RepoTreeFile[] }>(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, headers, {},
  )
  return (data.tree ?? []).filter(f => !f.path.split('/').some(seg => IGNORE_DIRS.has(seg)))
}

/** Fetch + base64-decode a single file's text content. Returns null on any failure. */
export async function fetchFileContent(
  owner: string, repo: string, path: string, headers: Record<string, string>,
): Promise<string | null> {
  const data = await ghJson<{ content?: string; encoding?: string }>(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, headers, {},
  )
  if (!data.content) return null
  try { return Buffer.from(data.content, 'base64').toString('utf-8') } catch { return null }
}

export interface PackageJson {
  name?: string; version?: string; description?: string
  dependencies?: Record<string, string>; devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>; scripts?: Record<string, string>
  license?: string; engines?: Record<string, string>
}

/** Fetch + parse package.json. Returns null if absent / unparseable. */
export async function fetchPackageJson(
  owner: string, repo: string, headers: Record<string, string>,
): Promise<PackageJson | null> {
  const raw = await fetchFileContent(owner, repo, 'package.json', headers)
  if (!raw) return null
  try { return JSON.parse(raw) as PackageJson } catch { return null }
}

// ── Dependency graph / SBOM (GitHub Dependency Graph API) ────────────────────────────

export interface SbomPackage { name: string; versionInfo?: string; ecosystem: string; licenseConcluded?: string }

/** Fetch the SBOM (Software Bill of Materials) via GitHub's dependency-graph API. */
export async function fetchSbom(
  owner: string, repo: string, headers: Record<string, string>,
): Promise<SbomPackage[]> {
  const data = await ghJson<{ sbom?: { packages?: { name?: string; versionInfo?: string; externalRefs?: { referenceLocator?: string }[]; licenseConcluded?: string }[] } }>(
    `https://api.github.com/repos/${owner}/${repo}/dependency-graph/sbom`, headers, {},
  )
  const pkgs = data.sbom?.packages ?? []
  return pkgs.map(p => {
    // SPDX names look like "npm:react" or "pip:flask" — split ecosystem prefix
    const raw = p.name ?? ''
    const locator = p.externalRefs?.[0]?.referenceLocator ?? ''
    const eco = locator.startsWith('pkg:') ? locator.slice(4).split('/')[0] : raw.includes(':') ? raw.split(':')[0] : 'unknown'
    const name = raw.includes(':') ? raw.split(':').slice(1).join(':') : raw
    return { name, versionInfo: p.versionInfo, ecosystem: eco, licenseConcluded: p.licenseConcluded }
  }).filter(p => p.name && p.name !== owner + '/' + repo)
}

// ── Secret-leak scan patterns ────────────────────────────────────────────────────────

export interface SecretPattern { id: string; label: string; severity: 'critical' | 'high' | 'medium'; re: RegExp }

/** Curated high-signal credential patterns for static secret scanning. */
export const SECRET_PATTERNS: SecretPattern[] = [
  { id: 'aws_key', label: 'AWS Access Key ID', severity: 'critical', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: 'aws_secret', label: 'AWS Secret Access Key', severity: 'critical', re: /aws_secret_access_key\s*[=:]\s*['"]?[A-Za-z0-9/+=]{40}['"]?/i },
  { id: 'gh_pat', label: 'GitHub Personal Access Token', severity: 'critical', re: /\bghp_[A-Za-z0-9]{36}\b/ },
  { id: 'gh_oauth', label: 'GitHub OAuth Token', severity: 'critical', re: /\bgho_[A-Za-z0-9]{36}\b/ },
  { id: 'google_api', label: 'Google API Key', severity: 'high', re: /\bAIza[0-9A-Za-z\-_]{35}\b/ },
  { id: 'slack_token', label: 'Slack Token', severity: 'high', re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/ },
  { id: 'stripe_live', label: 'Stripe Live Secret Key', severity: 'critical', re: /\bsk_live_[0-9A-Za-z]{24,}\b/ },
  { id: 'private_key', label: 'Private Key Block', severity: 'critical', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { id: 'jwt', label: 'JWT Token', severity: 'medium', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { id: 'npm_token', label: 'npm Token', severity: 'high', re: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { id: 'openai', label: 'OpenAI API Key', severity: 'critical', re: /\bsk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}\b/ },
  { id: 'generic_secret', label: 'Hardcoded Secret/Password', severity: 'medium', re: /(?:password|passwd|secret|api[_-]?key|token)\s*[=:]\s*['"][^'"\s]{8,}['"]/i },
  { id: 'connection_string', label: 'DB Connection String w/ Credentials', severity: 'high', re: /(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/[^:\s]+:[^@\s]+@/i },
]

// ── Vulnerability data (Dependabot + OSV.dev) ────────────────────────────────────

export interface DependabotAlert {
  number: number
  state: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  package: string
  ecosystem: string
  summary: string
  vulnerableRange: string
  firstPatched: string | null
  ghsaId: string
  url: string
  createdAt: string
}

export interface DependabotResult { available: boolean; alerts: DependabotAlert[]; reason?: string }

/** Fetch Dependabot alerts. Returns available:false (with reason) if the token
 *  lacks scope or alerts are disabled — callers fall back to OSV. */
export async function fetchDependabotAlerts(
  owner: string, repo: string, headers: Record<string, string>,
): Promise<DependabotResult> {
  try {
    const r = await ghFetch(`https://api.github.com/repos/${owner}/${repo}/dependabot/alerts?state=open&per_page=100`, headers)
    if (r.status === 403) return { available: false, alerts: [], reason: 'Token lacks security_events scope or alerts are restricted.' }
    if (r.status === 404) return { available: false, alerts: [], reason: 'Dependabot alerts are not enabled for this repository.' }
    if (!r.ok) return { available: false, alerts: [], reason: `GitHub returned ${r.status}.` }
    const raw = await r.json() as {
      number: number; state: string
      security_advisory?: { severity?: string; summary?: string; ghsa_id?: string }
      security_vulnerability?: { package?: { name?: string; ecosystem?: string }; vulnerable_version_range?: string; first_patched_version?: { identifier?: string } }
      dependency?: { package?: { name?: string; ecosystem?: string } }
      html_url?: string; created_at?: string
    }[]
    if (!Array.isArray(raw)) return { available: false, alerts: [], reason: 'Unexpected response.' }
    const alerts: DependabotAlert[] = raw.map(a => ({
      number: a.number,
      state: a.state,
      severity: (a.security_advisory?.severity as DependabotAlert['severity']) ?? 'medium',
      package: a.security_vulnerability?.package?.name ?? a.dependency?.package?.name ?? 'unknown',
      ecosystem: a.security_vulnerability?.package?.ecosystem ?? a.dependency?.package?.ecosystem ?? 'unknown',
      summary: a.security_advisory?.summary ?? 'Security advisory',
      vulnerableRange: a.security_vulnerability?.vulnerable_version_range ?? '—',
      firstPatched: a.security_vulnerability?.first_patched_version?.identifier ?? null,
      ghsaId: a.security_advisory?.ghsa_id ?? '',
      url: a.html_url ?? '',
      createdAt: a.created_at ?? '',
    }))
    return { available: true, alerts }
  } catch (e) {
    return { available: false, alerts: [], reason: e instanceof Error ? e.message : 'Request failed.' }
  }
}

export interface OsvVuln { package: string; ecosystem: string; version: string; id: string; summary: string; severity: string }

/** Query OSV.dev's batch API for known vulnerabilities in a set of packages. */
export async function fetchOsvVulns(
  pkgs: { name: string; version: string; ecosystem: string }[],
): Promise<OsvVuln[]> {
  if (pkgs.length === 0) return []
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 15_000)
    let res: Response
    try {
      res = await fetch('https://api.osv.dev/v1/querybatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: pkgs.map(p => ({ package: { name: p.name, ecosystem: p.ecosystem }, version: p.version })) }),
        signal: ctrl.signal,
      })
    } finally { clearTimeout(t) }
    if (!res.ok) return []
    const data = await res.json() as { results?: { vulns?: { id: string; modified?: string }[] }[] }
    const out: OsvVuln[] = []
    ;(data.results ?? []).forEach((r, i) => {
      const p = pkgs[i]
      for (const v of r.vulns ?? []) {
        out.push({ package: p.name, ecosystem: p.ecosystem, version: p.version, id: v.id, summary: 'Known vulnerability (see OSV)', severity: 'unknown' })
      }
    })
    return out
  } catch { return [] }
}

/** Map an npm semver range string to a single resolved version for OSV queries. */
export function pinnedVersion(range: string): string {
  return range.replace(/^[\^~>=<\s]+/, '').split(' ')[0] || '0.0.0'
}

/** License classification for compliance checks. */
export type LicenseRisk = 'permissive' | 'weak-copyleft' | 'strong-copyleft' | 'network-copyleft' | 'unknown' | 'none'

export function classifyLicense(spdx: string | null | undefined): { risk: LicenseRisk; color: string } {
  if (!spdx || spdx === 'NOASSERTION') return { risk: 'unknown', color: '#7d8590' }
  const id = spdx.toUpperCase()
  if (/^(MIT|BSD|APACHE|ISC|UNLICENSE|0BSD|ZLIB|MPL-1)/.test(id)) return { risk: 'permissive', color: '#00ff88' }
  if (/^(LGPL|MPL-2|EPL|CDDL)/.test(id)) return { risk: 'weak-copyleft', color: '#FFD700' }
  if (/^AGPL/.test(id)) return { risk: 'network-copyleft', color: '#ff4466' }
  if (/^GPL/.test(id)) return { risk: 'strong-copyleft', color: '#ff8800' }
  return { risk: 'unknown', color: '#7d8590' }
}
