import { NextRequest, NextResponse } from 'next/server'
import { authenticate, ghJson, clamp, logScale, daysSince, LANG_COLORS } from '@/lib/gh'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UnderratedRepo {
  full: string
  description: string | null
  html: string
  stars: number
  forks: number
  language: string | null
  langColor: string
  updatedDays: number
  openIssues: number
  topics: string[]
  underratedScore: number      // 0-100, higher = more hidden-gem
  qualitySignal: number        // 0-100
  reasons: string[]
}

export interface UnderratedReport {
  query: string
  resolvedQuery: string
  repos: UnderratedRepo[]
  meta: { candidatesScanned: number; generatedAt: string }
}

export async function GET(req: NextRequest) {
  const auth = await authenticate()
  if (!auth.ok) return auth.response
  const H = auth.headers

  const q = new URL(req.url).searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ error: 'Provide a topic, language or keyword' }, { status: 400 })

  try {
    // Search mid-tier repos: enough stars to be real, few enough to be hidden.
    // Look at the freshly-updated slice so we surface active-but-obscure projects.
    const isLang = /^[a-z+#]+$/i.test(q) && q.length < 14
    const qualifier = isLang ? `language:${q}` : `topic:${q.toLowerCase().replace(/\s+/g, '-')}`
    const search = `${qualifier} stars:50..3000 pushed:>${new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10)}`

    const data = await ghJson<{ items?: {
      full_name: string; description: string | null; html_url: string
      stargazers_count: number; forks_count: number; language: string | null
      pushed_at: string; open_issues_count: number; topics?: string[]
      created_at: string; watchers_count: number
    }[] }>(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(search)}&sort=updated&order=desc&per_page=50`, H, {},
    )

    const items = data.items ?? []
    if (items.length === 0) {
      return NextResponse.json({ error: `No repositories found for "${q}". Try a broader topic or language.` }, { status: 404 })
    }

    const repos: UnderratedRepo[] = items.map(it => {
      const updatedDays = Math.round(daysSince(it.pushed_at))
      const ageDays = Math.max(1, daysSince(it.created_at))
      const starsPerDay = it.stargazers_count / ageDays

      // Quality signals: active, documented, engaged, healthy fork ratio
      const freshness = updatedDays <= 14 ? 100 : updatedDays <= 30 ? 80 : updatedDays <= 90 ? 50 : 20
      const docSignal = it.description ? 30 : 0
      const topicSignal = clamp((it.topics?.length ?? 0) * 8, 0, 25)
      const engagement = clamp(logScale(it.forks_count, 10, 25), 0, 25)
      const qualitySignal = clamp(Math.round(freshness * 0.3 + docSignal + topicSignal + engagement), 0, 100)

      // Underrated = high quality but low stars (hidden gem) + still growing
      const obscurity = clamp(100 - logScale(it.stargazers_count, 10, 28), 0, 100)
      const momentum = clamp(logScale(starsPerDay * 100, 10, 30), 0, 30)
      const underratedScore = clamp(Math.round(qualitySignal * 0.45 + obscurity * 0.35 + momentum * 0.2), 0, 100)

      const reasons: string[] = []
      if (updatedDays <= 14) reasons.push('Actively maintained')
      if (it.stargazers_count < 500 && qualitySignal > 60) reasons.push('High quality, low visibility')
      if (starsPerDay > 0.5) reasons.push('Gaining stars steadily')
      if ((it.topics?.length ?? 0) >= 3) reasons.push('Well-categorised')
      if (it.forks_count > it.stargazers_count * 0.2) reasons.push('Strong fork-to-star ratio')
      if (reasons.length === 0) reasons.push('Solid niche project')

      return {
        full: it.full_name, description: it.description, html: it.html_url,
        stars: it.stargazers_count, forks: it.forks_count, language: it.language,
        langColor: LANG_COLORS[it.language ?? ''] ?? '#7d8590',
        updatedDays, openIssues: it.open_issues_count, topics: it.topics ?? [],
        underratedScore, qualitySignal, reasons,
      }
    }).sort((a, b) => b.underratedScore - a.underratedScore).slice(0, 24)

    const report: UnderratedReport = {
      query: q, resolvedQuery: search,
      repos,
      meta: { candidatesScanned: items.length, generatedAt: new Date().toISOString() },
    }
    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
