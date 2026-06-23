import { NextRequest, NextResponse } from 'next/server'
import { authenticate, ghJson, parseRepoParams, fetchSbom, classifyLicense, clamp, pct, type LicenseRisk, type GHRepoMeta } from '@/lib/gh'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LicenseBucket { risk: LicenseRisk; count: number; color: string; label: string }
export interface DepLicense { name: string; license: string; risk: LicenseRisk; color: string }

export interface LicenseReport {
  owner: string
  repo: string
  projectLicense: string | null
  projectRisk: LicenseRisk
  projectColor: string
  hasLicenseFile: boolean

  complianceScore: number      // 0-100
  buckets: LicenseBucket[]
  incompatibilities: { dep: string; license: string; issue: string }[]
  dependencies: DepLicense[]
  unknownCount: number
  conflicts: number

  recommendations: string[]
  meta: { depsScanned: number; sbomAvailable: boolean; generatedAt: string }
}

const RISK_LABEL: Record<LicenseRisk, string> = {
  permissive: 'Permissive', 'weak-copyleft': 'Weak Copyleft', 'strong-copyleft': 'Strong Copyleft',
  'network-copyleft': 'Network Copyleft', unknown: 'Unknown', none: 'No License',
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

    const projectSpdx = meta.license?.spdx_id ?? null
    const projClass = classifyLicense(projectSpdx)
    const projectRisk = projectSpdx ? projClass.risk : 'none'
    const hasLicenseFile = !!projectSpdx && projectSpdx !== 'NOASSERTION'

    const sbom = await fetchSbom(owner, repo, H)
    const sbomAvailable = sbom.length > 0

    const dependencies: DepLicense[] = sbom.slice(0, 200).map(p => {
      const lic = p.licenseConcluded && p.licenseConcluded !== 'NOASSERTION' ? p.licenseConcluded : 'UNKNOWN'
      const cls = classifyLicense(lic === 'UNKNOWN' ? null : lic)
      return { name: p.name, license: lic, risk: cls.risk, color: cls.color }
    })

    // Buckets
    const bucketMap = new Map<LicenseRisk, number>()
    for (const d of dependencies) bucketMap.set(d.risk, (bucketMap.get(d.risk) ?? 0) + 1)
    const buckets: LicenseBucket[] = (['permissive', 'weak-copyleft', 'strong-copyleft', 'network-copyleft', 'unknown'] as LicenseRisk[])
      .map(risk => ({ risk, count: bucketMap.get(risk) ?? 0, color: classifyLicense(risk === 'unknown' ? null : risk === 'permissive' ? 'MIT' : risk === 'weak-copyleft' ? 'LGPL-3.0' : risk === 'strong-copyleft' ? 'GPL-3.0' : 'AGPL-3.0').color, label: RISK_LABEL[risk] }))
      .filter(b => b.count > 0)

    // Incompatibilities: strong/network copyleft deps in a permissively-licensed (or unlicensed) project
    const incompatibilities: LicenseReport['incompatibilities'] = []
    if (projectRisk === 'permissive' || projectRisk === 'none') {
      for (const d of dependencies) {
        if (d.risk === 'strong-copyleft') incompatibilities.push({ dep: d.name, license: d.license, issue: `GPL dependency in a ${projectRisk === 'none' ? 'unlicensed' : 'permissive'} project — may force the whole project to GPL.` })
        else if (d.risk === 'network-copyleft') incompatibilities.push({ dep: d.name, license: d.license, issue: 'AGPL dependency — network use triggers source-disclosure obligations.' })
      }
    }
    const conflicts = incompatibilities.length
    const unknownCount = dependencies.filter(d => d.risk === 'unknown').length

    // Compliance score
    let score = 100
    if (!hasLicenseFile) score -= 30
    score -= conflicts * 12
    score -= clamp(pct(unknownCount, Math.max(1, dependencies.length)) * 0.3, 0, 20)
    score -= (bucketMap.get('strong-copyleft') ?? 0) > 0 && projectRisk !== 'strong-copyleft' ? 5 : 0
    const complianceScore = clamp(Math.round(score), 0, 100)

    const recommendations: string[] = []
    if (!hasLicenseFile) recommendations.push('Add a LICENSE file — without one, the code is "all rights reserved" by default.')
    for (const inc of incompatibilities.slice(0, 3)) recommendations.push(`Review ${inc.dep} (${inc.license}): ${inc.issue}`)
    if (unknownCount > 0) recommendations.push(`${unknownCount} dependencies have undetermined licenses — audit them manually.`)
    if (recommendations.length === 0) recommendations.push('No license conflicts detected — compliance looks healthy.')

    const report: LicenseReport = {
      owner, repo,
      projectLicense: projectSpdx, projectRisk, projectColor: projClass.color, hasLicenseFile,
      complianceScore, buckets, incompatibilities, dependencies: dependencies.slice(0, 60),
      unknownCount, conflicts, recommendations,
      meta: { depsScanned: dependencies.length, sbomAvailable, generatedAt: new Date().toISOString() },
    }

    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
