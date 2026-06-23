import { NextRequest, NextResponse } from 'next/server'
import { authenticate, ghJson, parseRepoParams, clamp, pct, daysSince, type GHRepoMeta } from '@/lib/gh'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OpenPRPrediction {
  number: number
  title: string
  author: string
  authorAvatar: string
  html: string
  ageDays: number
  additions: number
  deletions: number
  changedFiles: number
  impactScore: number        // 0-100 blast radius
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  riskColor: string
  mergeProbability: number   // 0-100
  predictedReviewDays: number
  factors: string[]
}

export interface PRImpactReport {
  owner: string
  repo: string

  baseline: {
    medianMergeDays: number
    medianChangedFiles: number
    medianAdditions: number
    mergeRate: number
    avgReviewComments: number
    sampledMerged: number
  }

  openPRs: OpenPRPrediction[]
  sizeDistribution: { label: string; count: number }[]
  meta: { generatedAt: string; note: string }
}

interface PRListItem {
  number: number; title: string; state: string; created_at: string; merged_at: string | null
  user: { login: string; avatar_url: string } | null; html_url: string
  additions?: number; deletions?: number; changed_files?: number; comments?: number; review_comments?: number
}

const RISK = { low: '#00ff88', medium: '#FFD700', high: '#ff8800', critical: '#ff4466' }
const MAX_DETAIL = 30

function median(arr: number[]): number {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

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

    const [closedRaw, openRaw] = await Promise.all([
      ghJson<PRListItem[]>(`https://api.github.com/repos/${owner}/${repo}/pulls?state=closed&per_page=100&sort=updated&direction=desc`, H, []),
      ghJson<PRListItem[]>(`https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=50&sort=created&direction=desc`, H, []),
    ])

    const merged = (closedRaw ?? []).filter(p => p.merged_at)
    if (merged.length === 0 && (openRaw ?? []).length === 0) {
      return NextResponse.json({ error: 'This repository has no pull requests to analyse' }, { status: 422 })
    }

    // Fetch detail (additions/files) for a bounded sample of merged PRs to build baseline
    const mergedSample = merged.slice(0, MAX_DETAIL)
    const mergedDetails = await Promise.all(mergedSample.map(p =>
      ghJson<PRListItem | null>(`https://api.github.com/repos/${owner}/${repo}/pulls/${p.number}`, H, null),
    ))
    const mDetails = mergedDetails.filter((d): d is PRListItem => d !== null)

    const mergeDays = mergedSample.map(p => daysSince(p.created_at) - daysSince(p.merged_at!)).filter(d => d >= 0)
    const baseline = {
      medianMergeDays: Math.round(median(mergeDays)),
      medianChangedFiles: Math.round(median(mDetails.map(d => d.changed_files ?? 0))),
      medianAdditions: Math.round(median(mDetails.map(d => d.additions ?? 0))),
      mergeRate: pct(merged.length, (closedRaw ?? []).length),
      avgReviewComments: mDetails.length ? Math.round(mDetails.reduce((s, d) => s + (d.review_comments ?? 0), 0) / mDetails.length) : 0,
      sampledMerged: mDetails.length,
    }

    // Detail open PRs and predict impact
    const openSample = (openRaw ?? []).slice(0, 20)
    const openDetails = await Promise.all(openSample.map(p =>
      ghJson<PRListItem | null>(`https://api.github.com/repos/${owner}/${repo}/pulls/${p.number}`, H, null),
    ))

    const openPRs: OpenPRPrediction[] = openDetails.filter((d): d is PRListItem => d !== null).map(d => {
      const additions = d.additions ?? 0
      const deletions = d.deletions ?? 0
      const changedFiles = d.changed_files ?? 0
      const churn = additions + deletions
      const ageDays = Math.round(daysSince(d.created_at))

      // Impact = blast radius from churn + files, relative to repo baseline
      const fileImpact = clamp((changedFiles / Math.max(1, baseline.medianChangedFiles * 2)) * 50, 0, 50)
      const churnImpact = clamp((churn / Math.max(50, baseline.medianAdditions * 3)) * 50, 0, 50)
      const impactScore = clamp(Math.round(fileImpact + churnImpact), 0, 100)

      const riskLevel: OpenPRPrediction['riskLevel'] =
        impactScore >= 75 ? 'critical' : impactScore >= 50 ? 'high' : impactScore >= 25 ? 'medium' : 'low'

      // Merge probability: smaller + younger + matches baseline → higher
      const sizeFactor = clamp(100 - (churn / Math.max(50, baseline.medianAdditions * 4)) * 100, 10, 100)
      const ageFactor = ageDays <= baseline.medianMergeDays * 2 ? 100 : clamp(100 - (ageDays - baseline.medianMergeDays * 2) * 2, 20, 100)
      const mergeProbability = clamp(Math.round(sizeFactor * 0.5 + ageFactor * 0.3 + baseline.mergeRate * 0.2), 0, 99)

      const predictedReviewDays = Math.max(1, Math.round(baseline.medianMergeDays * (1 + impactScore / 100)))

      const factors: string[] = []
      if (changedFiles > baseline.medianChangedFiles * 2) factors.push(`Touches ${changedFiles} files (${Math.round(changedFiles / Math.max(1, baseline.medianChangedFiles))}× typical)`)
      if (churn > baseline.medianAdditions * 3) factors.push(`Large change: ${churn} lines`)
      if (ageDays > baseline.medianMergeDays * 3) factors.push(`Aging — open ${ageDays}d vs ${baseline.medianMergeDays}d median`)
      if (impactScore < 25) factors.push('Small, focused change — low risk')
      if (factors.length === 0) factors.push('Within normal change patterns for this repo')

      return {
        number: d.number, title: d.title, author: d.user?.login ?? 'unknown', authorAvatar: d.user?.avatar_url ?? '',
        html: d.html_url, ageDays, additions, deletions, changedFiles,
        impactScore, riskLevel, riskColor: RISK[riskLevel], mergeProbability, predictedReviewDays, factors,
      }
    }).sort((a, b) => b.impactScore - a.impactScore)

    // Size distribution across all detailed PRs
    const allChurn = [...mDetails, ...openDetails.filter(Boolean)].map(d => (d!.additions ?? 0) + (d!.deletions ?? 0))
    const sizeDistribution = [
      { label: 'XS (<10)', count: allChurn.filter(c => c < 10).length },
      { label: 'S (10-50)', count: allChurn.filter(c => c >= 10 && c < 50).length },
      { label: 'M (50-200)', count: allChurn.filter(c => c >= 50 && c < 200).length },
      { label: 'L (200-500)', count: allChurn.filter(c => c >= 200 && c < 500).length },
      { label: 'XL (500+)', count: allChurn.filter(c => c >= 500).length },
    ]

    const report: PRImpactReport = {
      owner, repo, baseline, openPRs, sizeDistribution,
      meta: { generatedAt: new Date().toISOString(), note: `Baseline learned from ${baseline.sampledMerged} recent merged PRs.` },
    }

    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
