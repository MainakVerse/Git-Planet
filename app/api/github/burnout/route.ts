import { NextRequest, NextResponse } from 'next/server'
import {
  authenticate, ghJson, parseRepoParams,
  clamp, pct, daysSince, aiSummarize,
  type GHRepoMeta, type GHCommitListItem,
} from '@/lib/gh'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BurnoutSignal {
  key: string
  label: string
  value: string
  severity: 'ok' | 'watch' | 'risk'
  weight: number
  detail: string
}

export interface MaintainerLoad {
  login: string
  avatar: string
  html: string
  commits: number
  sharePct: number
  offHoursPct: number
  weekendPct: number
  lastActiveDays: number
  burnoutRisk: number       // 0-100 per maintainer
}

export interface BurnoutReport {
  owner: string
  repo: string
  burnoutRisk: number       // 0-100 overall (higher = more risk)
  riskLabel: string
  riskColor: string

  signals: BurnoutSignal[]
  maintainers: MaintainerLoad[]

  cadence: { week: string; commits: number }[]
  hourHistogram: number[]   // 24 buckets
  offHoursPct: number
  weekendPct: number
  soloMaintainerPct: number
  recentTrend: 'accelerating' | 'steady' | 'declining'

  aiSummary: string
  meta: { commitsAnalyzed: number; generatedAt: string }
}

const RISK_BANDS: { min: number; label: string; color: string }[] = [
  { min: 70, label: 'High Burnout Risk', color: '#ff4466' },
  { min: 45, label: 'Elevated Risk', color: '#ff8800' },
  { min: 25, label: 'Some Pressure', color: '#FFD700' },
  { min: 0, label: 'Healthy', color: '#00ff88' },
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

    // Pull up to 300 recent commits (3 pages) for cadence + temporal analysis
    const pages = await Promise.all([1, 2, 3].map(p =>
      ghJson<GHCommitListItem[]>(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=100&page=${p}`, H, []),
    ))
    const commits = pages.flat().filter(c => c?.commit?.author?.date)

    if (commits.length < 5) {
      return NextResponse.json({ error: 'Not enough commit history to assess burnout' }, { status: 422 })
    }

    // ── Temporal signals ───────────────────────────────────────────────────────
    const hourHistogram = new Array(24).fill(0)
    let offHours = 0, weekend = 0
    const perAuthor = new Map<string, {
      avatar: string; html: string; commits: number; offHours: number; weekend: number; last: string
    }>()

    for (const c of commits) {
      const dateStr = c.commit!.author!.date
      const d = new Date(dateStr)
      const hour = d.getUTCHours()
      const day = d.getUTCDay()
      hourHistogram[hour]++
      const isOff = hour < 7 || hour >= 22          // late night / very early
      const isWeekend = day === 0 || day === 6
      if (isOff) offHours++
      if (isWeekend) weekend++

      const login = c.author?.login ?? c.commit!.author!.name ?? 'unknown'
      const a = perAuthor.get(login) ?? {
        avatar: c.author?.avatar_url ?? '', html: c.author?.html_url ?? '',
        commits: 0, offHours: 0, weekend: 0, last: dateStr,
      }
      a.commits++
      if (isOff) a.offHours++
      if (isWeekend) a.weekend++
      if (dateStr > a.last) a.last = dateStr
      perAuthor.set(login, a)
    }

    const offHoursPct = pct(offHours, commits.length)
    const weekendPct = pct(weekend, commits.length)

    // ── Cadence (weekly buckets) ────────────────────────────────────────────────
    const weekMap = new Map<string, number>()
    for (const c of commits) {
      const d = new Date(c.commit!.author!.date)
      const day = d.getUTCDay()
      const monday = new Date(d)
      monday.setUTCDate(d.getUTCDate() - day + (day === 0 ? -6 : 1))
      const wk = monday.toISOString().slice(0, 10)
      weekMap.set(wk, (weekMap.get(wk) ?? 0) + 1)
    }
    const cadence = Array.from(weekMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-16)
      .map(([week, c]) => ({ week, commits: c }))

    // Trend: compare last 4 weeks to prior 4 weeks
    const recent4 = cadence.slice(-4).reduce((s, w) => s + w.commits, 0)
    const prior4 = cadence.slice(-8, -4).reduce((s, w) => s + w.commits, 0)
    const recentTrend = recent4 > prior4 * 1.2 ? 'accelerating' : recent4 < prior4 * 0.7 ? 'declining' : 'steady'

    // ── Maintainer load ─────────────────────────────────────────────────────────
    const totalCommits = commits.length
    const maintainers: MaintainerLoad[] = Array.from(perAuthor.entries())
      .filter(([login]) => login !== 'unknown' && !login.endsWith('[bot]'))
      .sort((a, b) => b[1].commits - a[1].commits)
      .slice(0, 8)
      .map(([login, a]) => {
        const sharePct = pct(a.commits, totalCommits)
        const ohPct = pct(a.offHours, a.commits)
        const wePct = pct(a.weekend, a.commits)
        const lastActiveDays = Math.round(daysSince(a.last))
        // Per-maintainer burnout: heavy load + off-hours + weekend work
        const risk = clamp(Math.round(
          clamp(sharePct - 30, 0, 40) +          // carrying outsized share
          ohPct * 0.3 +
          wePct * 0.25,
        ), 0, 100)
        return { login, avatar: a.avatar, html: a.html, commits: a.commits, sharePct, offHoursPct: ohPct, weekendPct: wePct, lastActiveDays, burnoutRisk: risk }
      })

    const soloMaintainerPct = maintainers[0]?.sharePct ?? 0

    // ── Signals ─────────────────────────────────────────────────────────────────
    const signals: BurnoutSignal[] = [
      {
        key: 'solo_load', label: 'Maintainer Concentration',
        value: `${soloMaintainerPct}%`, weight: 30,
        severity: soloMaintainerPct >= 70 ? 'risk' : soloMaintainerPct >= 50 ? 'watch' : 'ok',
        detail: `Top maintainer authors ${soloMaintainerPct}% of recent commits`,
      },
      {
        key: 'off_hours', label: 'Off-Hours Work',
        value: `${offHoursPct}%`, weight: 25,
        severity: offHoursPct >= 35 ? 'risk' : offHoursPct >= 20 ? 'watch' : 'ok',
        detail: `${offHoursPct}% of commits land between 22:00–07:00 UTC`,
      },
      {
        key: 'weekend', label: 'Weekend Work',
        value: `${weekendPct}%`, weight: 20,
        severity: weekendPct >= 35 ? 'risk' : weekendPct >= 22 ? 'watch' : 'ok',
        detail: `${weekendPct}% of commits happen on weekends`,
      },
      {
        key: 'trend', label: 'Commit Trend',
        value: recentTrend, weight: 25,
        severity: recentTrend === 'declining' ? 'risk' : recentTrend === 'accelerating' ? 'watch' : 'ok',
        detail: recentTrend === 'declining'
          ? 'Activity dropped >30% vs the prior month — possible disengagement'
          : recentTrend === 'accelerating'
            ? 'Activity spiking >20% — watch for unsustainable crunch'
            : 'Commit cadence is stable',
      },
    ]

    // Overall burnout risk = weighted severities
    const sevValue = (s: BurnoutSignal['severity']) => s === 'risk' ? 100 : s === 'watch' ? 55 : 12
    const burnoutRisk = clamp(Math.round(
      signals.reduce((s, sig) => s + sevValue(sig.severity) * sig.weight, 0) / signals.reduce((s, sig) => s + sig.weight, 0),
    ), 0, 100)
    const band = RISK_BANDS.find(b => burnoutRisk >= b.min) ?? RISK_BANDS[RISK_BANDS.length - 1]

    const fallback =
      `${owner}/${repo} shows a ${band.label.toLowerCase()} (${burnoutRisk}/100). ` +
      `The top maintainer carries ${soloMaintainerPct}% of recent commits, with ${offHoursPct}% landing in off-hours and ${weekendPct}% on weekends. ` +
      `${recentTrend === 'declining' ? 'A declining commit trend may signal fatigue or disengagement.' : recentTrend === 'accelerating' ? 'An accelerating pace warrants watching for unsustainable crunch.' : 'Commit cadence remains steady, a positive sign.'}`

    const aiSummary = await aiSummarize(
      `Write a 3-sentence maintainer-burnout assessment for the GitHub repo ${owner}/${repo}. Empathetic but analytical prose, no bullets.
Signals: overall risk ${burnoutRisk}/100 (${band.label}); top-maintainer share ${soloMaintainerPct}%; off-hours commits ${offHoursPct}%; weekend commits ${weekendPct}%; recent trend ${recentTrend}.
Focus on sustainability and concrete pressure points, not generic advice.`,
      fallback,
    )

    const report: BurnoutReport = {
      owner, repo,
      burnoutRisk, riskLabel: band.label, riskColor: band.color,
      signals, maintainers,
      cadence, hourHistogram, offHoursPct, weekendPct, soloMaintainerPct, recentTrend,
      aiSummary,
      meta: { commitsAnalyzed: commits.length, generatedAt: new Date().toISOString() },
    }

    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
