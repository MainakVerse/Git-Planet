import { NextRequest, NextResponse } from 'next/server'
import {
  authenticate, ghJson, parseRepoParams,
  clamp, pct, daysSince, grade, aiSummarize,
  type GHRepoMeta, type GHIssue, type GHContributor,
} from '@/lib/gh'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EngagementFactor {
  key: string
  label: string
  score: number       // 0-100
  weight: number
  color: string
  insight: string
}

export interface EngagementReport {
  owner: string
  repo: string
  score: number
  grade: string
  gradeColor: string
  tier: string

  factors: EngagementFactor[]

  signals: {
    stars: number
    forks: number
    watchers: number
    contributors: number
    externalContributorPct: number
    issueResponseRate: number       // % issues with ≥1 comment
    prParticipationRate: number     // % PRs with comments/reviews proxy
    avgIssueComments: number
    discussionVolume: number        // total comments across sampled issues+PRs
    recentActivityDays: number
    starToForkRatio: number
  }

  aiSummary: string
  meta: { issuesSampled: number; prsSampled: number; generatedAt: string }
}

const F_COLORS: Record<string, string> = {
  responsiveness: '#00E5FF', diversity: '#7B61FF', popularity: '#FFD700',
  participation: '#00ff88', momentum: '#ff8800',
}

const TIERS: { min: number; tier: string }[] = [
  { min: 85, tier: 'Thriving' }, { min: 70, tier: 'Engaged' },
  { min: 50, tier: 'Growing' }, { min: 30, tier: 'Quiet' }, { min: 0, tier: 'Dormant' },
]

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

    const [issuesRaw, prsRaw, contributorsRaw] = await Promise.all([
      ghJson<GHIssue[]>(`https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=100&sort=created&direction=desc`, H, []),
      ghJson<{ comments?: number; review_comments?: number; user?: { login: string } | null; merged_at: string | null }[]>(`https://api.github.com/repos/${owner}/${repo}/pulls?state=all&per_page=100&sort=created&direction=desc`, H, []),
      ghJson<GHContributor[]>(`https://api.github.com/repos/${owner}/${repo}/contributors?per_page=100`, H, []),
    ])

    const issues = (issuesRaw ?? []).filter(i => !i.pull_request)
    const prs = prsRaw ?? []
    const contributors = (contributorsRaw ?? []).filter(c => c?.login && c.type !== 'Bot')

    // ── Signals ──────────────────────────────────────────────────────────────
    const ownerLogin = meta.owner.login.toLowerCase()
    const externalContributors = contributors.filter(c => c.login.toLowerCase() !== ownerLogin)
    const externalContributorPct = pct(externalContributors.length, contributors.length)

    const issuesWithComments = issues.filter(i => (i.comments ?? 0) > 0).length
    const issueResponseRate = pct(issuesWithComments, issues.length)
    const avgIssueComments = issues.length
      ? Math.round((issues.reduce((s, i) => s + (i.comments ?? 0), 0) / issues.length) * 10) / 10
      : 0

    const prsWithParticipation = prs.filter(p => (p.comments ?? 0) + (p.review_comments ?? 0) > 0).length
    const prParticipationRate = pct(prsWithParticipation, prs.length)

    const discussionVolume =
      issues.reduce((s, i) => s + (i.comments ?? 0), 0) +
      prs.reduce((s, p) => s + (p.comments ?? 0) + (p.review_comments ?? 0), 0)

    const recentActivityDays = Math.round(daysSince(meta.pushed_at))
    const starToForkRatio = meta.forks_count > 0 ? Math.round((meta.stargazers_count / meta.forks_count) * 10) / 10 : meta.stargazers_count

    // ── Factor scoring ──────────────────────────────────────────────────────────
    const responsiveness = Math.round(issueResponseRate * 0.6 + prParticipationRate * 0.4)
    const diversity = clamp(Math.round(externalContributorPct * 0.7 + clamp(Math.log10(contributors.length + 1) * 30, 0, 30)), 0, 100)
    const popularity = clamp(Math.round(Math.log10(meta.stargazers_count + 1) * 22 + Math.log10(meta.subscribers_count ?? meta.watchers_count) * 8), 0, 100)
    const participation = clamp(Math.round(clamp(avgIssueComments * 18, 0, 60) + clamp(discussionVolume / 10, 0, 40)), 0, 100)
    const momentum = recentActivityDays <= 7 ? 100 : recentActivityDays <= 30 ? 80 : recentActivityDays <= 90 ? 55 : recentActivityDays <= 180 ? 30 : recentActivityDays <= 365 ? 12 : 0

    const factors: EngagementFactor[] = [
      { key: 'responsiveness', label: 'Responsiveness', score: responsiveness, weight: 25, color: F_COLORS.responsiveness,
        insight: `${issueResponseRate}% of issues get a reply · ${prParticipationRate}% of PRs see discussion` },
      { key: 'diversity', label: 'Contributor Diversity', score: diversity, weight: 22, color: F_COLORS.diversity,
        insight: `${externalContributorPct}% external contributors across ${contributors.length} people` },
      { key: 'participation', label: 'Discussion Participation', score: participation, weight: 20, color: F_COLORS.participation,
        insight: `${discussionVolume} comments · ${avgIssueComments} avg per issue` },
      { key: 'popularity', label: 'Reach', score: popularity, weight: 18, color: F_COLORS.popularity,
        insight: `${meta.stargazers_count.toLocaleString()}★ · ${(meta.subscribers_count ?? meta.watchers_count).toLocaleString()} watching` },
      { key: 'momentum', label: 'Momentum', score: momentum, weight: 15, color: F_COLORS.momentum,
        insight: `Last activity ${recentActivityDays}d ago` },
    ]

    const score = clamp(Math.round(
      factors.reduce((s, f) => s + f.score * f.weight, 0) / factors.reduce((s, f) => s + f.weight, 0),
    ), 0, 100)
    const g = grade(score)
    const tier = (TIERS.find(t => score >= t.min) ?? TIERS[TIERS.length - 1]).tier

    const sorted = [...factors].sort((a, b) => b.score - a.score)
    const fallback =
      `${owner}/${repo} is a ${tier.toLowerCase()} community scoring ${score}/100 (grade ${g.grade}). ` +
      `Engagement is driven by ${sorted[0].label.toLowerCase()} (${sorted[0].score}/100), with ${externalContributorPct}% external contributors and ${issueResponseRate}% of issues receiving a response. ` +
      `${sorted[sorted.length - 1].score < 40 ? `Its weakest area is ${sorted[sorted.length - 1].label.toLowerCase()}, the clearest lever for growing participation.` : 'Engagement is well-rounded across all measured dimensions.'}`

    const aiSummary = await aiSummarize(
      `Write a 3-sentence community-engagement assessment for the GitHub repo ${owner}/${repo}. Analytical prose, no bullets.
Score ${score}/100 (${tier}, grade ${g.grade}). Factors: ${factors.map(f => `${f.label} ${f.score}`).join(', ')}.
Signals: ${externalContributorPct}% external contributors, ${issueResponseRate}% issue response rate, ${discussionVolume} total comments, last activity ${recentActivityDays}d ago.
Focus on how alive the community is and what would deepen engagement.`,
      fallback,
    )

    const report: EngagementReport = {
      owner, repo, score, grade: g.grade, gradeColor: g.color, tier,
      factors,
      signals: {
        stars: meta.stargazers_count, forks: meta.forks_count,
        watchers: meta.subscribers_count ?? meta.watchers_count,
        contributors: contributors.length, externalContributorPct,
        issueResponseRate, prParticipationRate, avgIssueComments,
        discussionVolume, recentActivityDays, starToForkRatio,
      },
      aiSummary,
      meta: { issuesSampled: issues.length, prsSampled: prs.length, generatedAt: new Date().toISOString() },
    }

    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
