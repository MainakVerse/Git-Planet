'use client'

import {
  useRepoAnalysis, AnalysisShell, Card, ScoreRing, Stat, Pill, C, FONT,
} from '@/components/analysis/shell'
import type { VulnReport } from '@/app/api/github/vuln-scan/route'

const ACCENT = '#FFD700'
const SEV_COLOR = { critical: C.danger, high: C.orange, medium: C.gold, low: C.accent, unknown: C.dim }

export default function VulnScanPage() {
  const a = useRepoAnalysis<VulnReport>('/api/github/vuln-scan')
  const r = a.report

  return (
    <AnalysisShell
      title="Vulnerability Scanner" accent={ACCENT} icon="🛡"
      subtitle="Scans dependencies for known CVEs — via GitHub Dependabot where available, falling back to the OSV.dev database."
      analyseLabel="SCAN VULNERABILITIES"
      user={a.user} repos={a.repos} selectedRepo={a.selectedRepo} setSelectedRepo={a.setSelectedRepo}
      analysing={a.analysing} onAnalyse={a.analyse} error={a.error} hasReport={!!r}
    >
      {r && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* HERO */}
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 12 }}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <ScoreRing score={r.securityScore} size={110} label="SECURE" />
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'center' }}>
                  <Pill text={r.riskLabel.toUpperCase()} color={r.riskColor} />
                  <Pill text={`SOURCE: ${r.source.toUpperCase()}`} color={C.dim} />
                </div>
              </div>
            </Card>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, alignContent: 'start' }}>
              <Stat label="CRITICAL" value={r.bySeverity.critical} color={C.danger} />
              <Stat label="HIGH" value={r.bySeverity.high} color={C.orange} />
              <Stat label="MEDIUM" value={r.bySeverity.medium} color={C.gold} />
              <Stat label="LOW" value={r.bySeverity.low} color={C.accent} />
              <Stat label="PATCHABLE" value={r.patchable} color={C.success} hint="fix available" />
              <Stat label="TOTAL" value={r.vulnerabilities.length} color={C.text} />
            </div>
          </div>

          {/* VULN LIST */}
          <Card title={`VULNERABILITIES (${r.vulnerabilities.length})`} accent={ACCENT} icon="🛡">
            {r.vulnerabilities.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8 }}>
                <span style={{ fontSize: 16 }}>✓</span>
                <span style={{ fontFamily: FONT.mono, fontSize: 11, color: C.success }}>No known vulnerabilities found in scanned dependencies.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 540, overflowY: 'auto' }}>
                {r.vulnerabilities.map((v, i) => (
                  <div key={i} style={{ padding: '9px 12px', background: 'rgba(0,0,0,0.25)', borderRadius: 7, borderLeft: `2px solid ${SEV_COLOR[v.severity]}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Pill text={v.severity.toUpperCase()} color={SEV_COLOR[v.severity]} />
                      <code style={{ fontFamily: FONT.mono, fontSize: 11, color: C.text }}>{v.package}</code>
                      <span style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim }}>{v.ecosystem}</span>
                      <a href={v.url} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', fontFamily: FONT.mono, fontSize: 8.5, color: C.accent, textDecoration: 'none' }}>{v.id} ↗</a>
                    </div>
                    <p style={{ fontFamily: FONT.sans, fontSize: 11, color: C.sub, margin: '0 0 4px', lineHeight: 1.4 }}>{v.summary}</p>
                    <div style={{ display: 'flex', gap: 14 }}>
                      <span style={{ fontFamily: FONT.mono, fontSize: 8.5, color: C.dim }}>vulnerable: <span style={{ color: C.orange }}>{v.vulnerableRange}</span></span>
                      {v.firstPatched && <span style={{ fontFamily: FONT.mono, fontSize: 8.5, color: C.dim }}>patched in: <span style={{ color: C.success }}>{v.firstPatched}</span></span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim, textAlign: 'center' }}>{r.meta.note}</div>
        </div>
      )}
    </AnalysisShell>
  )
}
