import { NextRequest, NextResponse } from 'next/server'
import {
  authenticate, ghJson, parseRepoParams,
  clamp, pct, daysSince, daysBetween, grade, aiSummarize,
  type GHRepoMeta, type GHIssue, type GHContributor, type GHCommitListItem,
} from '@/lib/gh'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HealthDimension {
  key: string
  label: string
  score: number       // 0-100
  weight: number      // contribution to overall
  color: string
  insight: string
}

export interface RepoHealthReport {
  owner: string
  repo: string
  overall: number
  grade: string
  gradeColor: string

  dimensions: HealthDimension[]
  strengths: string[]
  risks: string[]
  recommendations: string[]

  signals: {
    stars: number
    forks: number
    watchers: number
    openIssues: number
    closedIssueRate: number    // % of recent issues closed
    medianIssueCloseDays: number | null
    prMergeRate: number        // % of recent PRs merged
    daysSinceLastPush: number
    contributors: number
    hasLicense: boolean
    hasDescription: boolean
    hasTopics: boolean
    hasReadme: boolean
    commitFrequencyPerWeek: number
    isArchived: boolean
  }

  aiSummary: string
  meta: { issuesSampled: number; prsSampled: number; commitsSampled: number; generatedAt: string }
}

const DIM_COLORS: Record<string, string> = {
  activity: '#00E5FF', maintenance: '#00ff88', popularity: '#FFD700',
  responsiveness: '#7B61FF', community: '#ff8800', documentation: '#ff4466',
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

    // Parallel signal collection
    const [issuesRaw, prsRaw, contributorsRaw, commitsRaw, readmeRes] = await Promise.all([
      ghJson<GHIssue[]>(`https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=100&sort=created&direction=desc`, H, []),
      ghJson<{ merged_at: string | null; created_at: string; state: string }[]>(`https://api.github.com/repos/${owner}/${repo}/pulls?state=all&per_page=100&sort=created&direction=desc`, H, []),
      ghJson<GHContributor[]>(`https://api.github.com/repos/${owner}/${repo}/contributors?per_page=100`, H, []),
      ghJson<GHCommitListItem[]>(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=100`, H, []),
      ghJson<{ name?: string }>(`https://api.github.com/repos/${owner}/${repo}/readme`, H, {}),
    ])

    // Separate real issues from PRs (issues endpoint returns both)
    const issues = (issuesRaw ?? []).filter(i => !i.pull_request)
    const contributors = (contributorsRaw ?? []).filter(c => c?.login && c.type !== 'Bot')
    const commits = commitsRaw ?? []
    const prs = prsRaw ?? []

    // ── Signals ──────────────────────────────────────────────────────────────
    const daysSinceLastPush = Math.round(daysSince(meta.pushed_at))

    // Issue close rate + median close time
    const closedIssues = issues.filter(i => i.state === 'closed' && i.closed_at)
    const closedIssueRate = pct(closedIssues.length, issues.length)
    const closeDurations = closedIssues
      .map(i => daysBetween(i.created_at, i.closed_at!))
      .sort((a, b) => a - b)
    const medianIssueCloseDays = closeDurations.length
      ? Math.round(closeDurations[Math.floor(closeDurations.length / 2)])
      : null

    // PR merge rate
    const mergedPRs = prs.filter(p => p.merged_at).length
    const prMergeRate = pct(mergedPRs, prs.length)

    // Commit frequency (commits per week over the sampled window)
    let commitFrequencyPerWeek = 0
    if (commits.length >= 2) {
      const newest = commits[0].commit?.author?.date
      const oldest = commits[commits.length - 1].commit?.author?.date
      if (newest && oldest) {
        const weeks = Math.max(1, daysBetween(oldest, newest) / 7)
        commitFrequencyPerWeek = Math.round((commits.length / weeks) * 10) / 10
      }
    }

    const hasLicense = !!meta.license?.spdx_id && meta.license.spdx_id !== 'NOASSERTION'
    const hasDescription = !!meta.description && meta.description.trim().length > 0
    const hasTopics = (meta.topics?.length ?? 0) > 0
    const hasReadme = !!readmeRes?.name

    // ── Dimension scoring ──────────────────────────────────────────────────────

    // Activity (recency + frequency)
    const recencyScore = daysSinceLastPush <= 7 ? 100 : daysSinceLastPush <= 30 ? 80 : daysSinceLastPush <= 90 ? 55 : daysSinceLastPush <= 180 ? 30 : daysSinceLastPush <= 365 ? 12 : 0
    const freqScore = clamp(commitFrequencyPerWeek * 14, 0, 100)
    const activity = Math.round(recencyScore * 0.6 + freqScore * 0.4)

    // Maintenance (issue/PR throughput)
    const maintenance = Math.round(clamp(closedIssueRate * 0.5 + prMergeRate * 0.5, 0, 100))

    // Popularity (stars/forks/watchers, log-scaled)
    const popLog = Math.log10(meta.stargazers_count + 1) * 22 + Math.log10(meta.forks_count + 1) * 14
    const popularity = clamp(Math.round(popLog), 0, 100)

    // Responsiveness (how fast issues close)
    const responsiveness = medianIssueCloseDays === null
      ? (issues.length === 0 ? 60 : 40)
      : medianIssueCloseDays <= 3 ? 100 : medianIssueCloseDays <= 7 ? 85 : medianIssueCloseDays <= 21 ? 65 : medianIssueCloseDays <= 60 ? 40 : 18

    // Community (contributor breadth)
    const community = clamp(Math.round(Math.log10(contributors.length + 1) * 55), 0, 100)

    // Documentation (license, readme, description, topics)
    const docPoints = (hasReadme ? 40 : 0) + (hasLicense ? 25 : 0) + (hasDescription ? 20 : 0) + (hasTopics ? 15 : 0)
    const documentation = docPoints

    const dimensions: HealthDimension[] = [
      { key: 'activity', label: 'Activity', score: activity, weight: 25, color: DIM_COLORS.activity,
        insight: daysSinceLastPush <= 30 ? `Active — last push ${daysSinceLastPush}d ago, ~${commitFrequencyPerWeek} commits/wk` : `Slowing — last push ${daysSinceLastPush}d ago` },
      { key: 'maintenance', label: 'Maintenance', score: maintenance, weight: 20, color: DIM_COLORS.maintenance,
        insight: `${closedIssueRate}% issues closed · ${prMergeRate}% PRs merged` },
      { key: 'responsiveness', label: 'Responsiveness', score: responsiveness, weight: 15, color: DIM_COLORS.responsiveness,
        insight: medianIssueCloseDays === null ? 'No closed-issue history to measure' : `Median issue closes in ${medianIssueCloseDays}d` },
      { key: 'popularity', label: 'Popularity', score: popularity, weight: 15, color: DIM_COLORS.popularity,
        insight: `${meta.stargazers_count.toLocaleString()}★ · ${meta.forks_count.toLocaleString()} forks` },
      { key: 'community', label: 'Community', score: community, weight: 15, color: DIM_COLORS.community,
        insight: `${contributors.length} contributors involved` },
      { key: 'documentation', label: 'Documentation', score: documentation, weight: 10, color: DIM_COLORS.documentation,
        insight: [hasReadme && 'README', hasLicense && 'license', hasDescription && 'description', hasTopics && 'topics'].filter(Boolean).join(' · ') || 'Missing core docs' },
    ]

    const overall = clamp(Math.round(
      dimensions.reduce((s, d) => s + d.score * d.weight, 0) / dimensions.reduce((s, d) => s + d.weight, 0),
    ), 0, 100)
    const g = grade(overall)

    // ── Narrative ──────────────────────────────────────────────────────────────
    const sorted = [...dimensions].sort((a, b) => b.score - a.score)
    const strengths = sorted.filter(d => d.score >= 70).slice(0, 3).map(d => `${d.label}: ${d.insight}`)
    const risks = [...dimensions].filter(d => d.score < 50).sort((a, b) => a.score - b.score).map(d => `${d.label}: ${d.insight}`)

    const recommendations: string[] = []
    if (!hasReadme) recommendations.push('Add a README to onboard new users and contributors.')
    if (!hasLicense) recommendations.push('Add a license — without one the code is legally "all rights reserved".')
    if (closedIssueRate < 50 && issues.length > 5) recommendations.push('Triage the open-issue backlog; close-rate is below 50%.')
    if (prMergeRate < 40 && prs.length > 5) recommendations.push('Review stale pull requests — merge rate is low.')
    if (daysSinceLastPush > 180) recommendations.push('Repository looks dormant; a maintenance release would signal it is alive.')
    if (contributors.length <= 2) recommendations.push('Encourage external contributions — the project is currently very centralized.')
    if (recommendations.length === 0) recommendations.push('Maintain current cadence — the repository is in good health.')

    const fallback =
      `${owner}/${repo} scores ${overall}/100 (grade ${g.grade}) for overall health. ` +
      `Its strongest dimension is ${sorted[0].label.toLowerCase()} (${sorted[0].score}/100), while ${sorted[sorted.length - 1].label.toLowerCase()} (${sorted[sorted.length - 1].score}/100) is the weakest. ` +
      `${meta.archived ? 'Note: this repository is archived. ' : ''}With ${contributors.length} contributors and a last push ${daysSinceLastPush} days ago, ${overall >= 70 ? 'the project shows sustained, healthy maintenance.' : overall >= 50 ? 'the project is functional but has clear areas to improve.' : 'the project shows signs of neglect that warrant attention.'}`

    const aiSummary = await aiSummarize(
      `Write a 3-sentence repository-health assessment for the GitHub repo ${owner}/${repo}. Analytical prose, no bullets, no headers.
Overall: ${overall}/100 (grade ${g.grade})
Dimensions: ${dimensions.map(d => `${d.label} ${d.score}`).join(', ')}
Signals: ${meta.stargazers_count} stars, ${contributors.length} contributors, last push ${daysSinceLastPush}d ago, ${closedIssueRate}% issues closed, ${prMergeRate}% PRs merged, license=${hasLicense}, archived=${meta.archived}.
Focus on what is working and the single most important thing to fix.`,
      fallback,
    )

    const report: RepoHealthReport = {
      owner, repo, overall, grade: g.grade, gradeColor: g.color,
      dimensions, strengths, risks, recommendations,
      signals: {
        stars: meta.stargazers_count, forks: meta.forks_count,
        watchers: meta.subscribers_count ?? meta.watchers_count,
        openIssues: meta.open_issues_count,
        closedIssueRate, medianIssueCloseDays, prMergeRate,
        daysSinceLastPush, contributors: contributors.length,
        hasLicense, hasDescription, hasTopics, hasReadme,
        commitFrequencyPerWeek, isArchived: meta.archived,
      },
      aiSummary,
      meta: { issuesSampled: issues.length, prsSampled: prs.length, commitsSampled: commits.length, generatedAt: new Date().toISOString() },
    }

    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
