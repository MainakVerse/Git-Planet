import { NextRequest, NextResponse } from 'next/server'
import {
  authenticate, ghJson, parseRepoParams, fetchPackageJson, fetchSbom, fetchDependabotAlerts,
  classifyLicense, clamp, daysSince, grade, type GHRepoMeta,
} from '@/lib/gh'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RiskFactor {
  key: string
  label: string
  score: number       // 0-100, higher = riskier
  weight: number
  color: string
  detail: string
}

export interface SupplyChainReport {
  owner: string
  repo: string
  riskScore: number          // 0-100, higher = riskier
  grade: string
  gradeColor: string
  tier: string

  factors: RiskFactor[]
  signals: {
    totalDependencies: number
    directDependencies: number
    vulnerableDeps: number
    copyleftDeps: number
    daysSinceUpdate: number
    hasLockfile: boolean
    hasDependabot: boolean
    pinnedRatio: number
  }
  recommendations: string[]
  meta: { generatedAt: string; note: string }
}

const TIERS = [
  { max: 20, tier: 'Low Risk', color: '#00ff88' },
  { max: 40, tier: 'Guarded', color: '#00E5FF' },
  { max: 60, tier: 'Elevated', color: '#FFD700' },
  { max: 80, tier: 'High Risk', color: '#ff8800' },
  { max: 101, tier: 'Critical', color: '#ff4466' },
]

function riskColor(score: number): string {
  return score >= 70 ? '#ff4466' : score >= 45 ? '#ff8800' : score >= 25 ? '#FFD700' : '#00ff88'
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
    const branch = meta.default_branch || 'main'

    const [pkg, sbom, dependabot, tree] = await Promise.all([
      fetchPackageJson(owner, repo, H),
      fetchSbom(owner, repo, H),
      fetchDependabotAlerts(owner, repo, H),
      ghJson<{ tree?: { path: string }[] }>(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, H, {}),
    ])

    const directDeps = pkg ? Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }) : []
    const totalDeps = sbom.length || directDeps.length
    const files = (tree.tree ?? []).map(f => f.path)
    const hasLockfile = files.some(f => /(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|poetry\.lock|Gemfile\.lock|go\.sum)$/.test(f))
    const hasDependabotConfig = files.some(f => /\.github\/dependabot\.(yml|yaml)$/.test(f))

    // Pinned ratio (exact versions vs ranges) from package.json
    let pinned = 0, ranged = 0
    if (pkg) {
      for (const v of Object.values({ ...pkg.dependencies, ...pkg.devDependencies })) {
        if (/^\d/.test(v)) pinned++; else ranged++
      }
    }
    const pinnedRatio = (pinned + ranged) > 0 ? Math.round((pinned / (pinned + ranged)) * 100) : 0

    const vulnerableDeps = dependabot.available ? dependabot.alerts.length : 0
    const copyleftDeps = sbom.filter(p => {
      const r = classifyLicense(p.licenseConcluded).risk
      return r === 'strong-copyleft' || r === 'network-copyleft'
    }).length
    const daysSinceUpdate = Math.round(daysSince(meta.pushed_at))

    // ── Risk factors (each 0-100, higher = riskier) ────────────────────────────
    const depSurfaceRisk = clamp(Math.round(Math.log10(totalDeps + 1) * 28), 0, 100)
    const vulnRisk = dependabot.available ? clamp(vulnerableDeps * 16, 0, 100) : 40   // unknown → moderate assumption
    const maintenanceRisk = daysSinceUpdate <= 30 ? 5 : daysSinceUpdate <= 90 ? 25 : daysSinceUpdate <= 180 ? 50 : daysSinceUpdate <= 365 ? 75 : 95
    const hygieneRisk = clamp(
      (hasLockfile ? 0 : 35) + (hasDependabotConfig ? 0 : 25) + (pinnedRatio < 20 ? 25 : pinnedRatio < 50 ? 12 : 0) + (meta.archived ? 15 : 0), 0, 100)
    const licenseRisk = clamp(copyleftDeps * 12, 0, 60)

    const factors: RiskFactor[] = [
      { key: 'vuln', label: 'Vulnerability Exposure', score: vulnRisk, weight: 30, color: riskColor(vulnRisk),
        detail: dependabot.available ? `${vulnerableDeps} open Dependabot alerts` : `Dependabot unavailable — exposure unknown` },
      { key: 'surface', label: 'Dependency Surface', score: depSurfaceRisk, weight: 20, color: riskColor(depSurfaceRisk),
        detail: `${totalDeps} total dependencies in the supply chain` },
      { key: 'maintenance', label: 'Maintenance Freshness', score: maintenanceRisk, weight: 20, color: riskColor(maintenanceRisk),
        detail: `Last updated ${daysSinceUpdate} days ago${meta.archived ? ' · archived' : ''}` },
      { key: 'hygiene', label: 'Supply-Chain Hygiene', score: hygieneRisk, weight: 20, color: riskColor(hygieneRisk),
        detail: `${hasLockfile ? 'lockfile ✓' : 'no lockfile ✗'} · ${hasDependabotConfig ? 'dependabot ✓' : 'no dependabot ✗'} · ${pinnedRatio}% pinned` },
      { key: 'license', label: 'License Risk', score: licenseRisk, weight: 10, color: riskColor(licenseRisk),
        detail: `${copyleftDeps} copyleft dependencies` },
    ]

    const riskScore = clamp(Math.round(factors.reduce((s, f) => s + f.score * f.weight, 0) / factors.reduce((s, f) => s + f.weight, 0)), 0, 100)
    const tierObj = TIERS.find(t => riskScore < t.max) ?? TIERS[TIERS.length - 1]
    // grade is inverse of risk
    const g = grade(100 - riskScore)

    const recommendations: string[] = []
    if (!hasLockfile) recommendations.push('Commit a lockfile to pin the full dependency tree and prevent supply-chain drift.')
    if (!hasDependabotConfig) recommendations.push('Enable Dependabot (`.github/dependabot.yml`) for automated security updates.')
    if (vulnerableDeps > 0) recommendations.push(`Resolve ${vulnerableDeps} open vulnerability alert${vulnerableDeps > 1 ? 's' : ''}.`)
    if (pinnedRatio < 30 && pkg) recommendations.push('Consider pinning critical dependencies to exact versions.')
    if (daysSinceUpdate > 180) recommendations.push('Repository is stale — dependencies are likely accumulating silent risk.')
    if (recommendations.length === 0) recommendations.push('Supply-chain posture is healthy — maintain current practices.')

    const report: SupplyChainReport = {
      owner, repo, riskScore, grade: g.grade, gradeColor: g.color, tier: tierObj.tier,
      factors,
      signals: {
        totalDependencies: totalDeps, directDependencies: directDeps.length, vulnerableDeps,
        copyleftDeps, daysSinceUpdate, hasLockfile, hasDependabot: hasDependabotConfig, pinnedRatio,
      },
      recommendations,
      meta: { generatedAt: new Date().toISOString(), note: dependabot.available ? 'Vulnerability data from Dependabot.' : `Vulnerability data unavailable (${dependabot.reason}) — that factor is estimated.` },
    }

    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
