import { NextRequest, NextResponse } from 'next/server'
import { authenticate, ghJson, clamp, logScale, daysSince, aiSummarize, LANG_COLORS } from '@/lib/gh'

// ── Types ─────────────────────────────────────────────────────────────────────

export type RadarRing = 'adopt' | 'trial' | 'assess' | 'hold'

export interface RadarBlip {
  name: string
  full: string
  html: string
  stars: number
  starsPerDay: number
  ageMonths: number
  language: string | null
  langColor: string
  momentum: number          // 0-100 growth velocity (x-axis)
  maturity: number          // 0-100 establishment (y-axis)
  ring: RadarRing
  description: string | null
}

export interface TechRadarReport {
  query: string
  blips: RadarBlip[]
  rings: { ring: RadarRing; count: number; label: string; color: string }[]
  risingLanguages: { name: string; count: number; color: string }[]
  summary: string
  meta: { scanned: number; generatedAt: string }
}

const RING_META: Record<RadarRing, { label: string; color: string }> = {
  adopt: { label: 'Adopt — proven & growing', color: '#00ff88' },
  trial: { label: 'Trial — promising momentum', color: '#00E5FF' },
  assess: { label: 'Assess — early, watch closely', color: '#FFD700' },
  hold: { label: 'Hold — niche or stalling', color: '#ff8800' },
}

export async function GET(req: NextRequest) {
  const auth = await authenticate()
  if (!auth.ok) return auth.response
  const H = auth.headers

  const q = new URL(req.url).searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ error: 'Provide a domain, topic or language' }, { status: 400 })

  try {
    const isLang = /^[a-z+#]+$/i.test(q) && q.length < 14
    const qualifier = isLang ? `language:${q}` : `topic:${q.toLowerCase().replace(/\s+/g, '-')}`
    // Created in the last 2 years, gaining traction → emerging
    const since = new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 10)
    const search = `${qualifier} created:>${since} stars:>30`

    const data = await ghJson<{ items?: {
      full_name: string; name: string; description: string | null; html_url: string
      stargazers_count: number; language: string | null; created_at: string; pushed_at: string
    }[] }>(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(search)}&sort=stars&order=desc&per_page=40`, H, {},
    )

    const items = data.items ?? []
    if (items.length === 0) {
      return NextResponse.json({ error: `No emerging projects found for "${q}". Try a broader domain.` }, { status: 404 })
    }

    const blips: RadarBlip[] = items.map(it => {
      const ageDays = Math.max(7, daysSince(it.created_at))
      const ageMonths = Math.round(ageDays / 30)
      const starsPerDay = it.stargazers_count / ageDays
      const stale = daysSince(it.pushed_at) > 90

      const momentum = clamp(Math.round(logScale(starsPerDay * 100, 10, 35) + (stale ? 0 : 20)), 0, 100)
      const maturity = clamp(Math.round(logScale(it.stargazers_count, 10, 25) + (ageMonths > 12 ? 25 : ageMonths * 2)), 0, 100)

      let ring: RadarRing
      if (momentum >= 55 && maturity >= 50) ring = 'adopt'
      else if (momentum >= 55) ring = 'trial'
      else if (maturity < 40 && momentum >= 30) ring = 'assess'
      else ring = 'hold'

      return {
        name: it.name, full: it.full_name, html: it.html_url,
        stars: it.stargazers_count, starsPerDay: Math.round(starsPerDay * 10) / 10, ageMonths,
        language: it.language, langColor: LANG_COLORS[it.language ?? ''] ?? '#7d8590',
        momentum, maturity, ring, description: it.description,
      }
    }).sort((a, b) => b.momentum - a.momentum).slice(0, 30)

    const ringCounts = (Object.keys(RING_META) as RadarRing[]).map(ring => ({
      ring, count: blips.filter(b => b.ring === ring).length, label: RING_META[ring].label, color: RING_META[ring].color,
    }))

    const langCounts = new Map<string, number>()
    for (const b of blips) if (b.language) langCounts.set(b.language, (langCounts.get(b.language) ?? 0) + 1)
    const risingLanguages = Array.from(langCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([name, count]) => ({ name, count, color: LANG_COLORS[name] ?? '#7d8590' }))

    const top = blips.slice(0, 3)
    const fallback =
      `In the "${q}" space, ${blips.length} emerging projects are gaining traction. ` +
      `${top.length ? `Fast-movers include ${top.map(b => `${b.name} (${b.starsPerDay}★/day)`).join(', ')}. ` : ''}` +
      `${ringCounts.find(r => r.ring === 'adopt')?.count ? `${ringCounts.find(r => r.ring === 'adopt')!.count} have matured enough to adopt; ` : ''}the rest are worth watching as the niche develops.`

    const summary = await aiSummarize(
      `Write a 2-3 sentence emerging-tech trend summary for the "${q}" domain on GitHub. Top rising repos: ${top.map(b => `${b.name} (${b.stars}★, ${b.starsPerDay}/day, ${b.ageMonths}mo old)`).join('; ')}. Rising languages: ${risingLanguages.map(l => l.name).join(', ')}. Describe what's trending and what it signals. No bullets.`,
      fallback,
    )

    const report: TechRadarReport = {
      query: q, blips, rings: ringCounts, risingLanguages, summary,
      meta: { scanned: items.length, generatedAt: new Date().toISOString() },
    }
    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
