import { NextRequest, NextResponse } from 'next/server'
import {
  authenticate, ghJson, parseRepoParams,
  clamp, pct, daysSince, aiSummarize,
  type GHRepoMeta, type GHCommitListItem,
} from '@/lib/gh'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChurnContributor {
  login: string
  avatar: string
  html: string
  commits: number
  firstSeenDays: number      // days since first commit (in sample)
  lastSeenDays: number       // days since last commit (in sample)
  tenureDays: number
  status: 'active' | 'at_risk' | 'churned' | 'new'
}

export interface ChurnReport {
  owner: string
  repo: string

  retentionScore: number     // 0-100 (higher = better retention)
  churnRatePct: number       // % of historical contributors now inactive

  activeCount: number
  atRiskCount: number
  churnedCount: number
  newCount: number
  totalContributors: number

  cohorts: { period: string; joined: number; stillActive: number; retentionPct: number }[]
  netFlow: { period: string; joined: number; lost: number }[]

  recentlyChurned: ChurnContributor[]
  risingContributors: ChurnContributor[]

  busFactorTrend: string
  aiSummary: string
  meta: { commitsAnalyzed: number; windowDays: number; generatedAt: string }
}

const ACTIVE_DAYS = 90
const RISK_DAYS = 180

// ── Handler ─────────────────────────────────────────────────────────────────────

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

    // Pull up to 500 commits (5 pages) to span a meaningful history window
    const pages = await Promise.all([1, 2, 3, 4, 5].map(p =>
      ghJson<GHCommitListItem[]>(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=100&page=${p}`, H, []),
    ))
    const commits = pages.flat().filter(c => c?.commit?.author?.date)

    if (commits.length < 10) {
      return NextResponse.json({ error: 'Not enough commit history to analyse churn' }, { status: 422 })
    }

    // Per-author first/last seen
    const authors = new Map<string, {
      avatar: string; html: string; commits: number; first: string; last: string
    }>()
    for (const c of commits) {
      const login = c.author?.login ?? c.commit!.author!.name ?? 'unknown'
      if (login === 'unknown' || login.endsWith('[bot]')) continue
      const date = c.commit!.author!.date
      const a = authors.get(login) ?? {
        avatar: c.author?.avatar_url ?? '', html: c.author?.html_url ?? '',
        commits: 0, first: date, last: date,
      }
      a.commits++
      if (date < a.first) a.first = date
      if (date > a.last) a.last = date
      authors.set(login, a)
    }

    const built: ChurnContributor[] = Array.from(authors.entries()).map(([login, a]) => {
      const firstSeenDays = Math.round(daysSince(a.first))
      const lastSeenDays = Math.round(daysSince(a.last))
      const tenureDays = Math.max(0, firstSeenDays - lastSeenDays)
      let status: ChurnContributor['status']
      if (firstSeenDays <= ACTIVE_DAYS) status = 'new'
      else if (lastSeenDays <= ACTIVE_DAYS) status = 'active'
      else if (lastSeenDays <= RISK_DAYS) status = 'at_risk'
      else status = 'churned'
      return { login, avatar: a.avatar, html: a.html, commits: a.commits, firstSeenDays, lastSeenDays, tenureDays, status }
    }).sort((a, b) => b.commits - a.commits)

    const total = built.length
    const activeCount = built.filter(c => c.status === 'active').length
    const atRiskCount = built.filter(c => c.status === 'at_risk').length
    const churnedCount = built.filter(c => c.status === 'churned').length
    const newCount = built.filter(c => c.status === 'new').length

    // Churn rate = churned / (everyone who is past the "new" stage)
    const matured = total - newCount
    const churnRatePct = pct(churnedCount, matured)

    // Retention score: reward active+new, penalise churn, factor breadth
    const retentionScore = clamp(Math.round(
      pct(activeCount + newCount, total) * 0.6 +
      (100 - churnRatePct) * 0.3 +
      clamp(Math.log10(total + 1) * 18, 0, 10),
    ), 0, 100)

    // ── Cohort retention by join quarter ─────────────────────────────────────────
    const quarter = (d: string) => {
      const dt = new Date(d)
      return `${dt.getUTCFullYear()}-Q${Math.floor(dt.getUTCMonth() / 3) + 1}`
    }
    const cohortMap = new Map<string, { joined: number; active: number }>()
    for (const c of built) {
      const firstDate = new Date(Date.now() - c.firstSeenDays * 86_400_000).toISOString()
      const q = quarter(firstDate)
      const e = cohortMap.get(q) ?? { joined: 0, active: 0 }
      e.joined++
      if (c.status === 'active' || c.status === 'new') e.active++
      cohortMap.set(q, e)
    }
    const cohorts = Array.from(cohortMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0])).slice(-8)
      .map(([period, e]) => ({ period, joined: e.joined, stillActive: e.active, retentionPct: pct(e.active, e.joined) }))

    // ── Net flow by quarter (joined vs lost) ─────────────────────────────────────
    const flowMap = new Map<string, { joined: number; lost: number }>()
    for (const c of built) {
      const firstDate = new Date(Date.now() - c.firstSeenDays * 86_400_000).toISOString()
      const jq = quarter(firstDate)
      const fj = flowMap.get(jq) ?? { joined: 0, lost: 0 }
      fj.joined++
      flowMap.set(jq, fj)
      if (c.status === 'churned') {
        const lastDate = new Date(Date.now() - c.lastSeenDays * 86_400_000).toISOString()
        const lq = quarter(lastDate)
        const fl = flowMap.get(lq) ?? { joined: 0, lost: 0 }
        fl.lost++
        flowMap.set(lq, fl)
      }
    }
    const netFlow = Array.from(flowMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0])).slice(-8)
      .map(([period, e]) => ({ period, joined: e.joined, lost: e.lost }))

    const recentlyChurned = built.filter(c => c.status === 'churned')
      .sort((a, b) => a.lastSeenDays - b.lastSeenDays).slice(0, 8)
    const risingContributors = built.filter(c => c.status === 'new' || (c.status === 'active' && c.firstSeenDays <= 180))
      .sort((a, b) => b.commits - a.commits).slice(0, 8)

    const busFactorTrend = activeCount <= 2
      ? 'Concentrating — fewer active contributors than historical average'
      : activeCount >= total * 0.5
        ? 'Healthy — most contributors remain active'
        : 'Stable — a committed core persists alongside natural turnover'

    const fallback =
      `${owner}/${repo} retains ${retentionScore}/100 on contributor retention, with ${activeCount} active and ${churnedCount} churned of ${total} historical contributors (${churnRatePct}% churn). ` +
      `${atRiskCount > 0 ? `${atRiskCount} contributors are at risk — inactive 3-6 months and trending toward churn.` : 'No contributors are currently flagged at-risk.'} ` +
      `${newCount > 0 ? `${newCount} new contributors joined recently, a healthy sign of inflow.` : 'Few new contributors have joined recently, worth watching for pipeline health.'}`

    const aiSummary = await aiSummarize(
      `Write a 3-sentence contributor-churn analysis for the GitHub repo ${owner}/${repo}. Analytical prose, no bullets.
Data: ${total} historical contributors — ${activeCount} active, ${atRiskCount} at-risk, ${churnedCount} churned, ${newCount} new. Churn rate ${churnRatePct}%. Retention score ${retentionScore}/100.
Focus on turnover health, contributor pipeline, and continuity risk.`,
      fallback,
    )

    const report: ChurnReport = {
      owner, repo,
      retentionScore, churnRatePct,
      activeCount, atRiskCount, churnedCount, newCount, totalContributors: total,
      cohorts, netFlow, recentlyChurned, risingContributors,
      busFactorTrend, aiSummary,
      meta: { commitsAnalyzed: commits.length, windowDays: built.length ? Math.max(...built.map(c => c.firstSeenDays)) : 0, generatedAt: new Date().toISOString() },
    }

    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
