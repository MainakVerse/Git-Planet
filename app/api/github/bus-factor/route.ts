import { NextRequest, NextResponse } from 'next/server'
import {
  authenticate, ghFetch, ghJson, parseRepoParams,
  clamp, pct, gini, daysSince, aiSummarize,
  type GHContributor, type GHRepoMeta, type GHCommitListItem,
} from '@/lib/gh'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BusContributor {
  login: string
  avatar: string
  html: string
  commits: number
  sharePct: number
  cumulativePct: number
  recentCommits: number      // commits in the last 90 days window of the sample
  lastActiveDays: number | null
  isActive: boolean
}

export interface BusFactorReport {
  owner: string
  repo: string
  busFactor: number          // # of contributors holding ≥ 50% of commits
  riskLevel: 'critical' | 'high' | 'moderate' | 'healthy'
  riskColor: string
  resilienceScore: number    // 0-100, higher = safer
  giniCoefficient: number    // 0-1 concentration of commit ownership
  topShare: number           // % held by #1 contributor
  top3Share: number          // % held by top 3
  activeContributors: number
  totalContributors: number
  contributors: BusContributor[]
  knowledgeSilos: { login: string; sharePct: number; note: string }[]
  aiSummary: string
  meta: {
    commitsAnalyzed: number
    contributorsAnalyzed: number
    sampleWindow: string
    generatedAt: string
  }
}

const RISK = {
  critical: { color: '#ff4466', max: 1 },
  high: { color: '#ff8800', max: 2 },
  moderate: { color: '#FFD700', max: 4 },
  healthy: { color: '#00ff88', max: Infinity },
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
    // 1. Repo meta (for default branch + sanity)
    const meta = await ghJson<GHRepoMeta | null>(`https://api.github.com/repos/${owner}/${repo}`, H, null)
    if (!meta) return NextResponse.json({ error: 'Repo not found' }, { status: 404 })

    // 2. Contributor stats (commit counts, all-time) — primary ownership signal
    const contributorsRaw = await ghJson<GHContributor[]>(
      `https://api.github.com/repos/${owner}/${repo}/contributors?per_page=100&anon=false`, H, [],
    )
    const contributors = (contributorsRaw ?? [])
      .filter(c => c && c.login && c.type !== 'Bot' && !c.login.endsWith('[bot]'))
      .sort((a, b) => b.contributions - a.contributions)

    if (contributors.length === 0) {
      return NextResponse.json({ error: 'No contributor data available for this repository' }, { status: 422 })
    }

    // 3. Recent commits (last page-load worth) to measure who is *still* active.
    //    Sample up to 100 recent commits; map author → recency.
    const recentCommits = await ghJson<GHCommitListItem[]>(
      `https://api.github.com/repos/${owner}/${repo}/commits?per_page=100`, H, [],
    )
    const recencyMap = new Map<string, { count: number; last: string }>()
    for (const c of recentCommits) {
      const login = c.author?.login
      const date = c.commit?.author?.date
      if (!login || !date) continue
      const cur = recencyMap.get(login)
      if (!cur) recencyMap.set(login, { count: 1, last: date })
      else { cur.count++; if (date > cur.last) cur.last = date }
    }

    // 4. Build ownership distribution
    const totalCommits = contributors.reduce((s, c) => s + c.contributions, 0)
    let cumulative = 0
    const built: BusContributor[] = contributors.slice(0, 50).map(c => {
      const sharePct = pct(c.contributions, totalCommits)
      cumulative += c.contributions
      const rec = recencyMap.get(c.login)
      const lastActiveDays = rec ? Math.round(daysSince(rec.last)) : null
      return {
        login: c.login,
        avatar: c.avatar_url,
        html: c.html_url,
        commits: c.contributions,
        sharePct,
        cumulativePct: pct(cumulative, totalCommits),
        recentCommits: rec?.count ?? 0,
        lastActiveDays,
        isActive: lastActiveDays !== null && lastActiveDays <= 180,
      }
    })

    // 5. Bus factor = smallest set of contributors whose cumulative share ≥ 50%
    let busFactor = 0
    let running = 0
    for (const c of built) {
      running += c.sharePct
      busFactor++
      if (running >= 50) break
    }

    // 6. Risk classification
    const riskLevel = (Object.keys(RISK) as (keyof typeof RISK)[])
      .find(k => busFactor <= RISK[k].max) ?? 'healthy'

    // 7. Resilience score (0-100): blend bus factor, active-contributor breadth, evenness
    const giniCoeff = gini(contributors.map(c => c.contributions))
    const activeCount = built.filter(c => c.isActive).length
    const busScore = clamp(busFactor * 22, 0, 55)              // 3+ ⇒ strong
    const spreadScore = clamp((1 - giniCoeff) * 30, 0, 30)      // even ownership
    const activeScore = clamp(activeCount * 3, 0, 15)           // live maintainers
    const resilienceScore = clamp(Math.round(busScore + spreadScore + activeScore), 0, 100)

    const topShare = built[0]?.sharePct ?? 0
    const top3Share = built.slice(0, 3).reduce((s, c) => s + c.sharePct, 0)

    // 8. Knowledge silos — anyone holding ≥ 35% alone, or top-2 holding ≥ 80%
    const knowledgeSilos: BusFactorReport['knowledgeSilos'] = []
    for (const c of built.slice(0, 3)) {
      if (c.sharePct >= 35) {
        knowledgeSilos.push({
          login: c.login,
          sharePct: c.sharePct,
          note: c.isActive
            ? `Holds ${c.sharePct}% of commits — single point of knowledge`
            : `Holds ${c.sharePct}% of commits but inactive ${c.lastActiveDays}d — orphaned knowledge risk`,
        })
      }
    }

    // 9. AI summary (graceful fallback)
    const fallback =
      `${owner}/${repo} has a bus factor of ${busFactor} — ${busFactor <= 1
        ? 'a single contributor holds the majority of institutional knowledge, a critical continuity risk.'
        : busFactor <= 2
          ? 'just two people hold most of the knowledge; losing either would significantly slow the project.'
          : `knowledge is spread across ${busFactor} core contributors, giving the project reasonable resilience.`} ` +
      `The top contributor owns ${topShare}% of commits (Gini ${giniCoeff.toFixed(2)}), with ${activeCount} of ${contributors.length} contributors active in the last 6 months.`

    const aiSummary = await aiSummarize(
      `Write a 3-sentence bus-factor risk assessment for the GitHub repository ${owner}/${repo}. Professional, analytical prose — no bullet points, no headers.
Data:
- Bus factor: ${busFactor} (contributors holding 50% of commits)
- Risk level: ${riskLevel}
- Top contributor share: ${topShare}%; top 3 share: ${top3Share}%
- Gini coefficient of commit ownership: ${giniCoeff.toFixed(2)}
- Active contributors (last 6mo): ${activeCount} of ${contributors.length}
- Resilience score: ${resilienceScore}/100
Focus on continuity risk and what would happen if key contributors left.`,
      fallback,
    )

    const report: BusFactorReport = {
      owner, repo,
      busFactor,
      riskLevel,
      riskColor: RISK[riskLevel].color,
      resilienceScore,
      giniCoefficient: Math.round(giniCoeff * 100) / 100,
      topShare,
      top3Share,
      activeContributors: activeCount,
      totalContributors: contributors.length,
      contributors: built.slice(0, 20),
      knowledgeSilos,
      aiSummary,
      meta: {
        commitsAnalyzed: totalCommits,
        contributorsAnalyzed: contributors.length,
        sampleWindow: 'all-time commit counts + last 100 commits for recency',
        generatedAt: new Date().toISOString(),
      },
    }

    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
