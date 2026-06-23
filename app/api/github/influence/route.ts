import { NextRequest, NextResponse } from 'next/server'
import {
  authenticate, ghJson,
  clamp, logScale, pct, daysSince, grade, aiSummarize, LANG_COLORS,
} from '@/lib/gh'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InfluenceComponent {
  key: string
  label: string
  score: number
  max: number
  color: string
  insight: string
}

export interface InfluenceReport {
  login: string
  name: string | null
  avatar: string
  bio: string | null
  htmlUrl: string

  influence: number          // 0-100
  grade: string
  gradeColor: string
  tier: string

  components: InfluenceComponent[]

  topRepos: { name: string; stars: number; forks: number; html: string; lang: string | null; langColor: string }[]

  stats: {
    followers: number
    following: number
    followerRatio: number
    totalStars: number
    totalForks: number
    publicRepos: number
    amplification: number      // stars per repo
    reachIndex: number         // log-blended reach
    accountAgeYears: number
    starsPerYear: number
  }

  aiSummary: string
  meta: { reposAnalyzed: number; generatedAt: string }
}

interface GHUser {
  login: string; name: string | null; avatar_url: string; bio: string | null
  html_url: string; followers: number; following: number
  public_repos: number; created_at: string
}
interface GHRepo {
  name: string; fork: boolean; stargazers_count: number; forks_count: number
  language: string | null; html_url: string
}

const TIERS: { min: number; tier: string }[] = [
  { min: 88, tier: 'Ecosystem Leader' }, { min: 72, tier: 'High Influence' },
  { min: 55, tier: 'Established' }, { min: 35, tier: 'Emerging' }, { min: 0, tier: 'Building' },
]

// ── Handler ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await authenticate()
  if (!auth.ok) return auth.response
  const H = auth.headers

  const login = new URL(req.url).searchParams.get('login')
  if (!login) return NextResponse.json({ error: 'Missing login' }, { status: 400 })

  try {
    const profile = await ghJson<GHUser | null>(`https://api.github.com/users/${login}`, H, null)
    if (!profile) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const allRepos = await ghJson<GHRepo[]>(`https://api.github.com/users/${login}/repos?type=owner&per_page=100&sort=pushed`, H, [])
    const repos = (allRepos ?? []).filter(r => !r.fork)

    const totalStars = repos.reduce((s, r) => s + r.stargazers_count, 0)
    const totalForks = repos.reduce((s, r) => s + r.forks_count, 0)
    const followerRatio = profile.following > 0 ? Math.round((profile.followers / profile.following) * 10) / 10 : profile.followers
    const amplification = repos.length > 0 ? Math.round(totalStars / repos.length) : 0
    const accountAgeYears = daysSince(profile.created_at) / 365.25
    const starsPerYear = accountAgeYears > 0 ? Math.round(totalStars / accountAgeYears) : totalStars
    const reachIndex = Math.round(logScale(profile.followers, 10, 30) + logScale(totalStars, 10, 30) + logScale(totalForks, 10, 20))

    // ── Components (sum to 100) ───────────────────────────────────────────────
    // Follower reach (0-28)
    const c1 = clamp(Math.round(logScale(profile.followers, 10, 18.7)), 0, 28)
    // Star gravity (0-30)
    const c2 = clamp(Math.round(logScale(totalStars, 10, 20)), 0, 30)
    // Fork reach (0-18)
    const c3 = clamp(Math.round(logScale(totalForks, 10, 12)), 0, 18)
    // Amplification — stars per repo, rewards signal over volume (0-12)
    const c4 = clamp(Math.round(logScale(amplification, 10, 8)), 0, 12)
    // Authority ratio — followers vs following (0-12)
    const c5 = clamp(Math.round(logScale(followerRatio, 10, 8) + (followerRatio >= 2 ? 4 : 0)), 0, 12)

    const influence = clamp(c1 + c2 + c3 + c4 + c5, 0, 100)
    const g = grade(influence)
    const tier = (TIERS.find(t => influence >= t.min) ?? TIERS[TIERS.length - 1]).tier

    const components: InfluenceComponent[] = [
      { key: 'followers', label: 'Follower Reach', score: c1, max: 28, color: '#00E5FF', insight: `${profile.followers.toLocaleString()} followers` },
      { key: 'stars', label: 'Star Gravity', score: c2, max: 30, color: '#FFD700', insight: `${totalStars.toLocaleString()} stars across ${repos.length} repos` },
      { key: 'forks', label: 'Fork Reach', score: c3, max: 18, color: '#7B61FF', insight: `${totalForks.toLocaleString()} forks of their work` },
      { key: 'amplification', label: 'Amplification', score: c4, max: 12, color: '#00ff88', insight: `${amplification} stars per repo — signal density` },
      { key: 'authority', label: 'Authority Ratio', score: c5, max: 12, color: '#ff8800', insight: `${followerRatio}× follower-to-following ratio` },
    ]

    const topRepos = [...repos]
      .sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 6)
      .map(r => ({ name: r.name, stars: r.stargazers_count, forks: r.forks_count, html: r.html_url, lang: r.language, langColor: LANG_COLORS[r.language ?? ''] ?? '#7d8590' }))

    const fallback =
      `${profile.name ?? profile.login} is an ${tier.toLowerCase()} in the GitHub ecosystem with an influence score of ${influence}/100. ` +
      `Their work has earned ${totalStars.toLocaleString()} stars and ${totalForks.toLocaleString()} forks, reaching ${profile.followers.toLocaleString()} followers at a ${followerRatio}× follower ratio. ` +
      `With ${amplification} stars per repository, their output carries ${amplification >= 50 ? 'exceptional' : amplification >= 10 ? 'strong' : 'developing'} signal density across ${repos.length} public projects.`

    const aiSummary = await aiSummarize(
      `Write a 3-sentence developer-influence summary for GitHub user ${profile.login}. Analytical prose, no bullets, don't start with their name.
Influence ${influence}/100 (${tier}, grade ${g.grade}). Followers ${profile.followers}, following ${profile.following} (${followerRatio}× ratio). Total stars ${totalStars}, forks ${totalForks}. Amplification ${amplification} stars/repo. Account age ${accountAgeYears.toFixed(1)}y.
Focus on ecosystem reach and the nature of their influence.`,
      fallback,
    )

    const report: InfluenceReport = {
      login: profile.login, name: profile.name, avatar: profile.avatar_url, bio: profile.bio, htmlUrl: profile.html_url,
      influence, grade: g.grade, gradeColor: g.color, tier,
      components, topRepos,
      stats: {
        followers: profile.followers, following: profile.following, followerRatio,
        totalStars, totalForks, publicRepos: profile.public_repos,
        amplification, reachIndex,
        accountAgeYears: Math.round(accountAgeYears * 10) / 10, starsPerYear,
      },
      aiSummary,
      meta: { reposAnalyzed: repos.length, generatedAt: new Date().toISOString() },
    }

    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
