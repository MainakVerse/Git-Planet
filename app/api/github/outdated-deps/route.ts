import { NextRequest, NextResponse } from 'next/server'
import { authenticate, parseRepoParams, fetchPackageJson, clamp, pct } from '@/lib/gh'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DepStatus {
  name: string
  current: string
  latest: string
  gap: 'major' | 'minor' | 'patch' | 'current' | 'unknown'
  behind: number              // # of major versions behind (for major), else 0
  dev: boolean
  color: string
}

export interface OutdatedReport {
  owner: string
  repo: string
  freshnessScore: number      // 0-100, higher = more up to date
  total: number
  current: number
  outdated: { major: number; minor: number; patch: number }
  unknown: number
  deps: DepStatus[]
  meta: { registriesQueried: number; generatedAt: string; note: string }
}

const GAP_COLOR = { major: '#ff4466', minor: '#ff8800', patch: '#FFD700', current: '#00ff88', unknown: '#7d8590' }
const MAX_DEPS = 60

function cleanVersion(v: string): string { return v.replace(/^[\^~>=<\s]+/, '').split(' ')[0] }
function parseSemver(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(cleanVersion(v))
  return m ? [+m[1], +m[2], +m[3]] : null
}

async function npmLatest(name: string): Promise<string | null> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8000)
    let res: Response
    try { res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`, { signal: ctrl.signal }) }
    finally { clearTimeout(t) }
    if (!res.ok) return null
    const data = await res.json()
    return typeof data?.version === 'string' ? data.version : null
  } catch { return null }
}

export async function GET(req: NextRequest) {
  const auth = await authenticate()
  if (!auth.ok) return auth.response
  const H = auth.headers

  const params = parseRepoParams(new URL(req.url).searchParams)
  if (!params) return NextResponse.json({ error: 'Missing owner/repo' }, { status: 400 })
  const { owner, repo } = params

  try {
    const pkg = await fetchPackageJson(owner, repo, H)
    if (!pkg) return NextResponse.json({ error: 'No package.json found — this checker supports npm/Node projects.' }, { status: 422 })

    const prod = Object.entries(pkg.dependencies ?? {}).map(([name, v]) => ({ name, v, dev: false }))
    const dev = Object.entries(pkg.devDependencies ?? {}).map(([name, v]) => ({ name, v, dev: true }))
    const all = [...prod, ...dev].filter(d => !d.v.startsWith('workspace:') && !d.v.startsWith('file:') && !d.v.startsWith('link:')).slice(0, MAX_DEPS)

    if (all.length === 0) return NextResponse.json({ error: 'No resolvable npm dependencies found' }, { status: 422 })

    // Query npm registry in bounded parallel
    const deps: DepStatus[] = []
    const BATCH = 14
    for (let i = 0; i < all.length; i += BATCH) {
      const slice = all.slice(i, i + BATCH)
      const latests = await Promise.all(slice.map(d => npmLatest(d.name)))
      for (let j = 0; j < slice.length; j++) {
        const d = slice[j]
        const latest = latests[j]
        const cur = parseSemver(d.v)
        let gap: DepStatus['gap'] = 'unknown'
        let behind = 0
        if (latest && cur) {
          const lat = parseSemver(latest)
          if (lat) {
            if (lat[0] > cur[0]) { gap = 'major'; behind = lat[0] - cur[0] }
            else if (lat[1] > cur[1]) gap = 'minor'
            else if (lat[2] > cur[2]) gap = 'patch'
            else gap = 'current'
          }
        }
        deps.push({ name: d.name, current: cleanVersion(d.v), latest: latest ?? '—', gap, behind, dev: d.dev, color: GAP_COLOR[gap] })
      }
    }

    const outdated = {
      major: deps.filter(d => d.gap === 'major').length,
      minor: deps.filter(d => d.gap === 'minor').length,
      patch: deps.filter(d => d.gap === 'patch').length,
    }
    const current = deps.filter(d => d.gap === 'current').length
    const unknown = deps.filter(d => d.gap === 'unknown').length
    const known = deps.length - unknown

    // Freshness: penalise by severity of lag
    const penalty = outdated.major * 4 + outdated.minor * 1.5 + outdated.patch * 0.5
    const freshnessScore = known > 0 ? clamp(Math.round(100 - (penalty / known) * 100), 0, 100) : 0

    // Sort: major first, then minor, patch, current, unknown
    const order = { major: 0, minor: 1, patch: 2, current: 3, unknown: 4 }
    deps.sort((a, b) => order[a.gap] - order[b.gap] || b.behind - a.behind)

    const report: OutdatedReport = {
      owner, repo, freshnessScore,
      total: deps.length, current, outdated, unknown, deps,
      meta: { registriesQueried: deps.length, generatedAt: new Date().toISOString(), note: `Checked ${deps.length} dependencies against the npm registry.` },
    }

    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
