import { NextRequest, NextResponse } from 'next/server'
import {
  authenticate, ghJson, parseRepoParams, fetchPackageJson, fetchDependabotAlerts, fetchOsvVulns, pinnedVersion, clamp, type GHRepoMeta,
} from '@/lib/gh'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Vulnerability {
  id: string
  package: string
  ecosystem: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'unknown'
  summary: string
  vulnerableRange: string
  firstPatched: string | null
  url: string
}

export interface VulnReport {
  owner: string
  repo: string
  source: 'dependabot' | 'osv'
  securityScore: number      // 0-100, higher = safer
  riskLabel: string
  riskColor: string
  bySeverity: { critical: number; high: number; medium: number; low: number; unknown: number }
  vulnerabilities: Vulnerability[]
  patchable: number          // # with a known fix
  meta: { depsScanned: number; generatedAt: string; note: string }
}

const SEV_COLOR = { critical: '#ff4466', high: '#ff8800', medium: '#FFD700', low: '#00E5FF', unknown: '#7d8590' }
const SEV_WEIGHT = { critical: 30, high: 14, medium: 5, low: 1, unknown: 3 }

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

    let vulnerabilities: Vulnerability[] = []
    let source: VulnReport['source'] = 'dependabot'
    let depsScanned = 0
    let note = ''

    // 1. Prefer authoritative Dependabot alerts
    const dependabot = await fetchDependabotAlerts(owner, repo, H)
    if (dependabot.available) {
      source = 'dependabot'
      vulnerabilities = dependabot.alerts.map(a => ({
        id: a.ghsaId || `alert-${a.number}`, package: a.package, ecosystem: a.ecosystem,
        severity: a.severity, summary: a.summary, vulnerableRange: a.vulnerableRange,
        firstPatched: a.firstPatched, url: a.url,
      }))
      note = `Authoritative scan via GitHub Dependabot (${vulnerabilities.length} open alerts).`
    } else {
      // 2. Fall back to OSV.dev over package.json deps
      source = 'osv'
      const pkg = await fetchPackageJson(owner, repo, H)
      if (!pkg) {
        return NextResponse.json({ error: `Dependabot unavailable (${dependabot.reason}) and no package.json to scan via OSV.` }, { status: 422 })
      }
      const deps = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })
        .map(([name, v]) => ({ name, version: pinnedVersion(v), ecosystem: 'npm' }))
        .slice(0, 100)
      depsScanned = deps.length
      const osv = await fetchOsvVulns(deps)
      vulnerabilities = osv.map(v => ({
        id: v.id, package: v.package, ecosystem: v.ecosystem, severity: 'unknown' as const,
        summary: v.summary, vulnerableRange: v.version, firstPatched: null,
        url: `https://osv.dev/vulnerability/${v.id}`,
      }))
      note = `Dependabot unavailable — scanned ${deps.length} npm deps against OSV.dev (${vulnerabilities.length} hits).`
    }

    const bySeverity = {
      critical: vulnerabilities.filter(v => v.severity === 'critical').length,
      high: vulnerabilities.filter(v => v.severity === 'high').length,
      medium: vulnerabilities.filter(v => v.severity === 'medium').length,
      low: vulnerabilities.filter(v => v.severity === 'low').length,
      unknown: vulnerabilities.filter(v => v.severity === 'unknown').length,
    }
    const patchable = vulnerabilities.filter(v => v.firstPatched).length

    const penalty = vulnerabilities.reduce((s, v) => s + SEV_WEIGHT[v.severity], 0)
    const securityScore = clamp(100 - penalty, 0, 100)
    const riskLabel = securityScore >= 90 ? 'Secure' : securityScore >= 65 ? 'Low Risk' : securityScore >= 40 ? 'Moderate Risk' : 'High Risk'
    const riskColor = securityScore >= 90 ? '#00ff88' : securityScore >= 65 ? '#00E5FF' : securityScore >= 40 ? '#ff8800' : '#ff4466'

    const order = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 }
    vulnerabilities.sort((a, b) => order[a.severity] - order[b.severity])

    const report: VulnReport = {
      owner, repo, source, securityScore, riskLabel, riskColor,
      bySeverity, vulnerabilities: vulnerabilities.slice(0, 80), patchable,
      meta: { depsScanned, generatedAt: new Date().toISOString(), note },
    }

    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
