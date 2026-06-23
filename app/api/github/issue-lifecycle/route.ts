import { NextRequest, NextResponse } from 'next/server'
import {
  authenticate, ghJson, parseRepoParams,
  clamp, pct, daysBetween, daysSince, aiSummarize,
  type GHRepoMeta, type GHIssue,
} from '@/lib/gh'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LifecycleBucket { label: string; count: number }

export interface LabelStat { label: string; total: number; open: number; medianCloseDays: number | null }

export interface IssueLifecycleReport {
  owner: string
  repo: string

  totalSampled: number
  openCount: number
  closedCount: number
  closeRate: number

  medianCloseDays: number | null
  meanCloseDays: number | null
  p90CloseDays: number | null
  medianFirstResponseProxy: number | null   // proxy via comments>0 timing unavailable → uses comment presence

  staleOpenCount: number          // open > 90d with no update in 30d
  oldestOpenDays: number | null
  avgCommentsPerIssue: number

  closeTimeDistribution: LifecycleBucket[]
  ageDistribution: LifecycleBucket[]
  monthlyOpened: { month: string; opened: number; closed: number }[]
  topLabels: LabelStat[]

  healthScore: number             // 0-100 lifecycle health
  aiSummary: string
  meta: { generatedAt: string; window: string }
}

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

    // Pull up to 200 most recent issues (2 pages), excluding PRs
    const [p1, p2] = await Promise.all([
      ghJson<GHIssue[]>(`https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=100&page=1&sort=created&direction=desc`, H, []),
      ghJson<GHIssue[]>(`https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=100&page=2&sort=created&direction=desc`, H, []),
    ])
    const issues = [...(p1 ?? []), ...(p2 ?? [])].filter(i => !i.pull_request)

    if (issues.length === 0) {
      return NextResponse.json({ error: 'This repository has no issues to analyse' }, { status: 422 })
    }

    const open = issues.filter(i => i.state === 'open')
    const closed = issues.filter(i => i.state === 'closed' && i.closed_at)

    // Close-time stats
    const closeDays = closed.map(i => daysBetween(i.created_at, i.closed_at!)).sort((a, b) => a - b)
    const median = (arr: number[]) => arr.length ? arr[Math.floor(arr.length / 2)] : null
    const mean = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null
    const p90 = (arr: number[]) => arr.length ? arr[Math.floor(arr.length * 0.9)] : null

    const medianCloseDays = closeDays.length ? Math.round(median(closeDays)!) : null
    const meanCloseDays = closeDays.length ? Math.round(mean(closeDays)!) : null
    const p90CloseDays = closeDays.length ? Math.round(p90(closeDays)!) : null

    // Open issue ages
    const openAges = open.map(i => daysSince(i.created_at))
    const oldestOpenDays = openAges.length ? Math.round(Math.max(...openAges)) : null
    const staleOpenCount = open.filter(i => daysSince(i.created_at) > 90 && daysSince(i.updated_at) > 30).length

    const avgCommentsPerIssue = issues.length
      ? Math.round((issues.reduce((s, i) => s + (i.comments ?? 0), 0) / issues.length) * 10) / 10
      : 0
    const repliedRate = pct(issues.filter(i => (i.comments ?? 0) > 0).length, issues.length)

    // Close-time distribution
    const closeBuckets: LifecycleBucket[] = [
      { label: '< 1 day', count: 0 }, { label: '1-7 days', count: 0 },
      { label: '1-4 weeks', count: 0 }, { label: '1-3 months', count: 0 }, { label: '> 3 months', count: 0 },
    ]
    for (const d of closeDays) {
      if (d < 1) closeBuckets[0].count++
      else if (d <= 7) closeBuckets[1].count++
      else if (d <= 28) closeBuckets[2].count++
      else if (d <= 90) closeBuckets[3].count++
      else closeBuckets[4].count++
    }

    // Age distribution of open issues
    const ageBuckets: LifecycleBucket[] = [
      { label: '< 1 week', count: 0 }, { label: '1-4 weeks', count: 0 },
      { label: '1-3 months', count: 0 }, { label: '3-12 months', count: 0 }, { label: '> 1 year', count: 0 },
    ]
    for (const d of openAges) {
      if (d <= 7) ageBuckets[0].count++
      else if (d <= 28) ageBuckets[1].count++
      else if (d <= 90) ageBuckets[2].count++
      else if (d <= 365) ageBuckets[3].count++
      else ageBuckets[4].count++
    }

    // Monthly opened/closed (last 6 months)
    const monthKey = (d: string) => d.slice(0, 7)
    const months: string[] = []
    {
      const now = new Date()
      for (let i = 5; i >= 0; i--) {
        const dt = new Date(now.getFullYear(), now.getMonth() - i, 1)
        months.push(dt.toISOString().slice(0, 7))
      }
    }
    const monthlyOpened = months.map(m => ({
      month: m,
      opened: issues.filter(i => monthKey(i.created_at) === m).length,
      closed: closed.filter(i => i.closed_at && monthKey(i.closed_at) === m).length,
    }))

    // Top labels with per-label close time
    const labelMap = new Map<string, { total: number; open: number; closeDays: number[] }>()
    for (const i of issues) {
      for (const l of i.labels ?? []) {
        const e = labelMap.get(l.name) ?? { total: 0, open: 0, closeDays: [] }
        e.total++
        if (i.state === 'open') e.open++
        else if (i.closed_at) e.closeDays.push(daysBetween(i.created_at, i.closed_at))
        labelMap.set(l.name, e)
      }
    }
    const topLabels: LabelStat[] = Array.from(labelMap.entries())
      .sort((a, b) => b[1].total - a[1].total).slice(0, 8)
      .map(([label, e]) => ({
        label, total: e.total, open: e.open,
        medianCloseDays: e.closeDays.length ? Math.round(median(e.closeDays.sort((a, b) => a - b))!) : null,
      }))

    // Lifecycle health score
    const closeRate = pct(closed.length, issues.length)
    const speedScore = medianCloseDays === null ? 50
      : medianCloseDays <= 3 ? 100 : medianCloseDays <= 7 ? 85 : medianCloseDays <= 21 ? 65 : medianCloseDays <= 60 ? 40 : 18
    const backlogScore = clamp(100 - staleOpenCount * 4, 0, 100)
    const responseScore = repliedRate
    const healthScore = clamp(Math.round(closeRate * 0.3 + speedScore * 0.35 + backlogScore * 0.2 + responseScore * 0.15), 0, 100)

    const fallback =
      `${owner}/${repo} has a ${closeRate}% issue close rate across ${issues.length} sampled issues, with a median resolution time of ${medianCloseDays ?? 'n/a'} days. ` +
      `${staleOpenCount > 0 ? `${staleOpenCount} open issues have gone stale (90+ days old, untouched for a month), suggesting backlog pressure.` : 'The backlog is well-tended with few stale issues.'} ` +
      `Lifecycle health scores ${healthScore}/100, ${healthScore >= 70 ? 'reflecting responsive, disciplined triage.' : healthScore >= 45 ? 'indicating workable but improvable issue management.' : 'pointing to issue-management debt that is hurting contributors.'}`

    const aiSummary = await aiSummarize(
      `Write a 3-sentence issue-lifecycle analysis for the GitHub repo ${owner}/${repo}. Analytical prose, no bullets.
Data: ${issues.length} issues sampled, ${closeRate}% closed, median close ${medianCloseDays}d, p90 ${p90CloseDays}d, ${staleOpenCount} stale open issues, oldest open ${oldestOpenDays}d, ${repliedRate}% issues got a reply, health ${healthScore}/100.
Focus on triage speed, backlog health, and contributor experience.`,
      fallback,
    )

    const report: IssueLifecycleReport = {
      owner, repo,
      totalSampled: issues.length,
      openCount: open.length,
      closedCount: closed.length,
      closeRate,
      medianCloseDays, meanCloseDays, p90CloseDays,
      medianFirstResponseProxy: repliedRate,
      staleOpenCount, oldestOpenDays, avgCommentsPerIssue,
      closeTimeDistribution: closeBuckets,
      ageDistribution: ageBuckets,
      monthlyOpened,
      topLabels,
      healthScore,
      aiSummary,
      meta: { generatedAt: new Date().toISOString(), window: 'up to 200 most recent issues' },
    }

    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
