import { NextRequest, NextResponse } from 'next/server'
import { authenticate, ghJson, parseRepoParams, fetchTree, fetchFileContent, clamp, SECRET_PATTERNS, type GHRepoMeta } from '@/lib/gh'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SecretFinding {
  patternId: string
  label: string
  severity: 'critical' | 'high' | 'medium'
  path: string
  line: number
  preview: string          // redacted snippet
}

export interface SecretScanReport {
  owner: string
  repo: string
  riskScore: number        // 0-100, higher = worse
  riskLabel: string
  riskColor: string
  findings: SecretFinding[]
  bySeverity: { critical: number; high: number; medium: number }
  byType: { label: string; count: number; color: string }[]
  scannedFiles: number
  riskyFiles: string[]     // .env etc committed
  meta: { generatedAt: string; note: string }
}

const SEV_COLOR = { critical: '#ff4466', high: '#ff8800', medium: '#FFD700' }
const SCAN_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|rs|java|php|env|yml|yaml|json|sh|cfg|conf|ini|properties|xml|txt)$|(^|\/)\.env/
const SKIP_FILE = /package-lock\.json|pnpm-lock|yarn\.lock|\.min\.js|\.map$/
const MAX_FILES = 70

function redact(line: string, matchStr: string): string {
  const idx = line.indexOf(matchStr)
  const trimmed = line.trim().slice(0, 120)
  if (idx < 0 || matchStr.length < 8) return trimmed
  // keep first 4 chars of the secret, mask the rest
  const masked = matchStr.slice(0, 4) + '•'.repeat(Math.min(20, matchStr.length - 4))
  return trimmed.replace(matchStr, masked).slice(0, 120)
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

    const tree = await fetchTree(owner, repo, branch, H)
    const scanFiles = tree
      .filter(f => f.type === 'blob' && SCAN_EXT.test(f.path) && !SKIP_FILE.test(f.path))
      .sort((a, b) => {
        // prioritise config/env files — likeliest to leak
        const ax = /\.env|config|secret|credential/i.test(a.path) ? 0 : 1
        const bx = /\.env|config|secret|credential/i.test(b.path) ? 0 : 1
        return ax - bx
      })
      .slice(0, MAX_FILES)
      .map(f => f.path)

    if (scanFiles.length === 0) return NextResponse.json({ error: 'No scannable files found' }, { status: 422 })

    // Risky committed files (should be gitignored)
    const riskyFiles = tree
      .filter(f => f.type === 'blob' && /(^|\/)\.env($|\.)(?!example|sample|template)/i.test(f.path))
      .map(f => f.path)

    const findings: SecretFinding[] = []
    const BATCH = 12
    for (let i = 0; i < scanFiles.length; i += BATCH) {
      const slice = scanFiles.slice(i, i + BATCH)
      const contents = await Promise.all(slice.map(p => fetchFileContent(owner, repo, p, H)))
      for (let j = 0; j < contents.length; j++) {
        const content = contents[j]
        if (!content) continue
        const path = slice[j]
        const isExample = /example|sample|template|\.md$|test|spec|mock|fixture/i.test(path)
        const lines = content.split('\n')
        for (let k = 0; k < lines.length; k++) {
          const line = lines[k]
          if (line.length > 500) continue   // skip minified/data lines
          for (const pat of SECRET_PATTERNS) {
            const m = pat.re.exec(line)
            if (!m) continue
            // downgrade generic matches in example/test files
            const severity = isExample && pat.severity !== 'critical' ? 'medium' : pat.severity
            findings.push({ patternId: pat.id, label: pat.label, severity, path, line: k + 1, preview: redact(line, m[0]) })
            break  // one finding per line
          }
        }
      }
    }

    const bySeverity = {
      critical: findings.filter(f => f.severity === 'critical').length,
      high: findings.filter(f => f.severity === 'high').length,
      medium: findings.filter(f => f.severity === 'medium').length,
    }

    const typeCounts = new Map<string, number>()
    for (const f of findings) typeCounts.set(f.label, (typeCounts.get(f.label) ?? 0) + 1)
    const byType = Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count, color: SEV_COLOR[findings.find(f => f.label === label)!.severity] }))

    const riskScore = clamp(bySeverity.critical * 30 + bySeverity.high * 12 + bySeverity.medium * 4 + riskyFiles.length * 15, 0, 100)
    const riskLabel = riskScore >= 60 ? 'Critical Exposure' : riskScore >= 30 ? 'High Risk' : riskScore > 0 ? 'Some Findings' : 'Clean'
    const riskColor = riskScore >= 60 ? SEV_COLOR.critical : riskScore >= 30 ? SEV_COLOR.high : riskScore > 0 ? SEV_COLOR.medium : '#00ff88'

    // critical first
    const sev = { critical: 0, high: 1, medium: 2 }
    findings.sort((a, b) => sev[a.severity] - sev[b.severity])

    const report: SecretScanReport = {
      owner, repo, riskScore, riskLabel, riskColor,
      findings: findings.slice(0, 80), bySeverity, byType,
      scannedFiles: scanFiles.length, riskyFiles,
      meta: { generatedAt: new Date().toISOString(), note: `Static regex scan of ${scanFiles.length} files. Secrets are redacted; verify and rotate any true positives.` },
    }

    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
