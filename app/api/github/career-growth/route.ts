import { NextRequest, NextResponse } from 'next/server'
import {
  authenticate, ghJson,
  clamp, daysSince, aiSummarize, LANG_COLORS,
} from '@/lib/gh'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface YearPoint {
  year: number
  reposCreated: number
  starsEarned: number          // stars on repos created that year
  cumulativeRepos: number
  cumulativeStars: number
  topLanguage: string | null
  languages: string[]
}

export interface LanguageEra {
  language: string
  color: string
  firstYear: number
  lastYear: number
  repos: number
  peakYear: number
}

export interface Milestone { year: number; label: string; detail: string }

export interface CareerGrowthReport {
  login: string
  name: string | null
  avatar: string
  htmlUrl: string

  accountAgeYears: number
  trajectory: 'accelerating' | 'steady' | 'plateauing' | 'early'
  trajectoryColor: string
  growthScore: number          // 0-100 momentum

  timeline: YearPoint[]
  languageEras: LanguageEra[]
  milestones: Milestone[]

  stats: {
    totalRepos: number
    totalStars: number
    peakYear: number
    peakYearRepos: number
    mostStarredRepo: { name: string; stars: number; html: string } | null
    languagesOverTime: number
    currentFocus: string | null
  }

  aiSummary: string
  meta: { reposAnalyzed: number; generatedAt: string }
}

interface GHUser {
  login: string; name: string | null; avatar_url: string; html_url: string; created_at: string
}
interface GHRepo {
  name: string; fork: boolean; stargazers_count: number
  language: string | null; created_at: string; html_url: string
}

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

    // Up to 200 owned repos (2 pages)
    const [p1, p2] = await Promise.all([
      ghJson<GHRepo[]>(`https://api.github.com/users/${login}/repos?type=owner&per_page=100&page=1&sort=created`, H, []),
      ghJson<GHRepo[]>(`https://api.github.com/users/${login}/repos?type=owner&per_page=100&page=2&sort=created`, H, []),
    ])
    const repos = [...(p1 ?? []), ...(p2 ?? [])].filter(r => !r.fork)

    if (repos.length === 0) {
      return NextResponse.json({ error: 'No public repositories to chart growth' }, { status: 422 })
    }

    const accountYear = new Date(profile.created_at).getUTCFullYear()
    const nowYear = new Date().getUTCFullYear()
    const accountAgeYears = Math.round((daysSince(profile.created_at) / 365.25) * 10) / 10

    // Per-year aggregation
    const yearMap = new Map<number, { repos: number; stars: number; langs: Map<string, number> }>()
    for (let y = accountYear; y <= nowYear; y++) yearMap.set(y, { repos: 0, stars: 0, langs: new Map() })
    for (const r of repos) {
      const y = new Date(r.created_at).getUTCFullYear()
      const e = yearMap.get(y) ?? { repos: 0, stars: 0, langs: new Map() }
      e.repos++
      e.stars += r.stargazers_count
      if (r.language) e.langs.set(r.language, (e.langs.get(r.language) ?? 0) + 1)
      yearMap.set(y, e)
    }

    let cumRepos = 0, cumStars = 0
    const timeline: YearPoint[] = Array.from(yearMap.entries()).sort((a, b) => a[0] - b[0]).map(([year, e]) => {
      cumRepos += e.repos
      cumStars += e.stars
      const topLanguage = Array.from(e.langs.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
      return {
        year, reposCreated: e.repos, starsEarned: e.stars,
        cumulativeRepos: cumRepos, cumulativeStars: cumStars,
        topLanguage, languages: Array.from(e.langs.keys()),
      }
    })

    // Language eras
    const langTrack = new Map<string, { first: number; last: number; repos: number; perYear: Map<number, number> }>()
    for (const r of repos) {
      if (!r.language) continue
      const y = new Date(r.created_at).getUTCFullYear()
      const e = langTrack.get(r.language) ?? { first: y, last: y, repos: 0, perYear: new Map() }
      e.first = Math.min(e.first, y); e.last = Math.max(e.last, y); e.repos++
      e.perYear.set(y, (e.perYear.get(y) ?? 0) + 1)
      langTrack.set(r.language, e)
    }
    const languageEras: LanguageEra[] = Array.from(langTrack.entries())
      .sort((a, b) => b[1].repos - a[1].repos).slice(0, 6)
      .map(([language, e]) => ({
        language, color: LANG_COLORS[language] ?? '#7d8590',
        firstYear: e.first, lastYear: e.last, repos: e.repos,
        peakYear: Array.from(e.perYear.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? e.first,
      }))

    // Peak year + trajectory
    const peak = [...timeline].sort((a, b) => b.reposCreated - a.reposCreated)[0]
    const recent3 = timeline.slice(-3).reduce((s, t) => s + t.reposCreated, 0)
    const prior3 = timeline.slice(-6, -3).reduce((s, t) => s + t.reposCreated, 0)
    let trajectory: CareerGrowthReport['trajectory']
    if (accountAgeYears < 2) trajectory = 'early'
    else if (recent3 > prior3 * 1.3) trajectory = 'accelerating'
    else if (recent3 < prior3 * 0.6) trajectory = 'plateauing'
    else trajectory = 'steady'
    const trajectoryColor = { accelerating: '#00ff88', steady: '#00E5FF', plateauing: '#ff8800', early: '#FFD700' }[trajectory]

    // Growth score: blend recent activity, star accumulation rate, consistency
    const activeYears = timeline.filter(t => t.reposCreated > 0).length
    const consistency = clamp((activeYears / Math.max(1, timeline.length)) * 100, 0, 100)
    const momentum = clamp((recent3 / Math.max(1, peak.reposCreated * 3)) * 100, 0, 100)
    const starRate = clamp(Math.log10(cumStars + 1) * 22, 0, 100)
    const growthScore = clamp(Math.round(consistency * 0.35 + momentum * 0.35 + starRate * 0.3), 0, 100)

    // Milestones
    const milestones: Milestone[] = []
    milestones.push({ year: accountYear, label: 'Joined GitHub', detail: `Account created in ${accountYear}` })
    if (timeline.find(t => t.cumulativeRepos >= 10)) {
      const m = timeline.find(t => t.cumulativeRepos >= 10)!
      milestones.push({ year: m.year, label: '10 repositories', detail: `Reached 10 public repos by ${m.year}` })
    }
    const firstStarYear = timeline.find(t => t.cumulativeStars >= 100)
    if (firstStarYear) milestones.push({ year: firstStarYear.year, label: '100 stars', detail: `Crossed 100 total stars in ${firstStarYear.year}` })
    const thousandStar = timeline.find(t => t.cumulativeStars >= 1000)
    if (thousandStar) milestones.push({ year: thousandStar.year, label: '1,000 stars', detail: `Crossed 1k total stars in ${thousandStar.year}` })
    milestones.push({ year: peak.year, label: 'Peak output', detail: `${peak.reposCreated} repos created in ${peak.year}` })

    const mostStarred = [...repos].sort((a, b) => b.stargazers_count - a.stargazers_count)[0]
    const currentFocus = timeline[timeline.length - 1]?.topLanguage ?? null

    const fallback =
      `${profile.name ?? profile.login}'s ${accountAgeYears}-year journey on GitHub spans ${repos.length} repositories and ${cumStars.toLocaleString()} total stars, peaking in ${peak.year} with ${peak.reposCreated} new projects. ` +
      `Their language path moved through ${languageEras.slice(0, 3).map(e => e.language).join(', ')}, with current focus on ${currentFocus ?? 'a mix of languages'}. ` +
      `The trajectory is ${trajectory}, scoring ${growthScore}/100 on growth momentum.`

    const aiSummary = await aiSummarize(
      `Write a 3-sentence career-trajectory summary for GitHub user ${profile.login}. Narrative but analytical, no bullets, don't start with their name.
Span ${accountAgeYears}y, ${repos.length} repos, ${cumStars} total stars. Peak year ${peak.year} (${peak.reposCreated} repos). Language eras: ${languageEras.map(e => `${e.language} (${e.firstYear}-${e.lastYear})`).join(', ')}. Current focus ${currentFocus}. Trajectory ${trajectory}, growth ${growthScore}/100.
Tell the story of how this developer has grown and where they're heading.`,
      fallback,
    )

    const report: CareerGrowthReport = {
      login: profile.login, name: profile.name, avatar: profile.avatar_url, htmlUrl: profile.html_url,
      accountAgeYears, trajectory, trajectoryColor, growthScore,
      timeline, languageEras, milestones: milestones.sort((a, b) => a.year - b.year),
      stats: {
        totalRepos: repos.length, totalStars: cumStars,
        peakYear: peak.year, peakYearRepos: peak.reposCreated,
        mostStarredRepo: mostStarred ? { name: mostStarred.name, stars: mostStarred.stargazers_count, html: mostStarred.html_url } : null,
        languagesOverTime: langTrack.size, currentFocus,
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
