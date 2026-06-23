import { NextRequest, NextResponse } from 'next/server'
import { authenticate, ghJson, parseRepoParams, fetchDependabotAlerts, clamp, daysSince, daysBetween, type GHRepoMeta } from '@/lib/gh'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PatchEvent {
  date: string
  type: 'release' | 'security-release' | 'advisory'
  title: string
  tag?: string
  url: string
  isSecurity: boolean
}

export interface OpenAdvisory {
  package: string
  severity: string
  ageDays: number
  summary: string
  hasFix: boolean
  url: string
}

export interface PatchTrackingReport {
  owner: string
  repo: string
  responsivenessScore: number   // 0-100
  patchVelocity: string         // descriptor

  totalReleases: number
  securityReleases: number
  daysSinceLastRelease: number | null
  medianReleaseGapDays: number | null

  openAdvisories: OpenAdvisory[]
  oldestOpenAdvisoryDays: number | null
  unpatchedCount: number

  timeline: PatchEvent[]
  meta: { dependabotAvailable: boolean; generatedAt: string; note: string }
}

const SECURITY_RE = /\b(security|cve|vuln|patch|fix(?:es|ed)?\s+.*\b(vuln|security|cve)|advisory|xss|rce|injection|sanitiz)/i

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

    const [releasesRaw, dependabot] = await Promise.all([
      ghJson<{ name: string | null; tag_name: string; published_at: string | null; body: string | null; html_url: string }[]>(
        `https://api.github.com/repos/${owner}/${repo}/releases?per_page=100`, H, []),
      fetchDependabotAlerts(owner, repo, H),
    ])

    const releases = (releasesRaw ?? []).filter(r => r.published_at).sort((a, b) => (b.published_at! > a.published_at! ? 1 : -1))

    // Release cadence
    const dates = releases.map(r => r.published_at!).sort()
    const gaps: number[] = []
    for (let i = 1; i < dates.length; i++) gaps.push(daysBetween(dates[i - 1], dates[i]))
    gaps.sort((a, b) => a - b)
    const medianReleaseGapDays = gaps.length ? Math.round(gaps[Math.floor(gaps.length / 2)]) : null
    const daysSinceLastRelease = dates.length ? Math.round(daysSince(dates[dates.length - 1])) : null

    // Security releases
    const securityReleaseCount = releases.filter(r => SECURITY_RE.test(`${r.name ?? ''} ${r.body ?? ''}`)).length

    // Open advisories from Dependabot
    const openAdvisories: OpenAdvisory[] = dependabot.available
      ? dependabot.alerts.map(a => ({
          package: a.package, severity: a.severity, ageDays: a.createdAt ? Math.round(daysSince(a.createdAt)) : 0,
          summary: a.summary, hasFix: !!a.firstPatched, url: a.url,
        })).sort((a, b) => b.ageDays - a.ageDays)
      : []
    const oldestOpenAdvisoryDays = openAdvisories.length ? openAdvisories[0].ageDays : null
    const unpatchedCount = openAdvisories.filter(a => a.hasFix).length   // has fix but still open = unpatched

    // Timeline (security-relevant)
    const timeline: PatchEvent[] = releases.slice(0, 20).map(r => {
      const isSec = SECURITY_RE.test(`${r.name ?? ''} ${r.body ?? ''}`)
      return {
        date: r.published_at!, type: isSec ? 'security-release' : 'release',
        title: r.name || r.tag_name, tag: r.tag_name, url: r.html_url, isSecurity: isSec,
      }
    })

    // Responsiveness score
    let score = 70
    if (dependabot.available) {
      // penalise old unfixed-but-patchable advisories
      const stale = openAdvisories.filter(a => a.hasFix && a.ageDays > 30).length
      score -= stale * 12
      score -= openAdvisories.filter(a => a.severity === 'critical').length * 10
      if (openAdvisories.length === 0) score = 95
    }
    // reward recent release cadence
    if (daysSinceLastRelease !== null) {
      if (daysSinceLastRelease <= 30) score += 10
      else if (daysSinceLastRelease > 365) score -= 15
    }
    if (securityReleaseCount > 0) score += 5
    const responsivenessScore = clamp(Math.round(score), 0, 100)

    const patchVelocity =
      responsivenessScore >= 80 ? 'Fast — patches ship promptly'
      : responsivenessScore >= 55 ? 'Steady — reasonable patch cadence'
      : responsivenessScore >= 30 ? 'Slow — patches lag behind disclosures'
      : 'Stalled — security issues are not being addressed'

    const note = dependabot.available
      ? `Tracking ${releases.length} releases and ${openAdvisories.length} open Dependabot advisories.`
      : `Dependabot unavailable (${dependabot.reason}) — tracking release history only.`

    const report: PatchTrackingReport = {
      owner, repo, responsivenessScore, patchVelocity,
      totalReleases: releases.length, securityReleases: securityReleaseCount,
      daysSinceLastRelease, medianReleaseGapDays,
      openAdvisories: openAdvisories.slice(0, 30), oldestOpenAdvisoryDays, unpatchedCount,
      timeline,
      meta: { dependabotAvailable: dependabot.available, generatedAt: new Date().toISOString(), note },
    }

    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
