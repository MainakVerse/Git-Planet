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
