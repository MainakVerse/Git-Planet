'use client'

import {
  useRepoAnalysis, AnalysisShell, Card, ScoreRing, Stat, Pill, MiniBars, C, FONT,
} from '@/components/analysis/shell'
import type { SecretScanReport } from '@/app/api/github/secret-scan/route'

const ACCENT = '#FFD700'
const SEV_COLOR = { critical: C.danger, high: C.orange, medium: C.gold }

export default function SecretScanPage() {
  const a = useRepoAnalysis<SecretScanReport>('/api/github/secret-scan')
  const r = a.report

  return (
    <AnalysisShell
      title="Secret Leak Detection" accent={ACCENT} icon="🔑"
      subtitle="Scans the codebase for hardcoded credentials — API keys, tokens, private keys and connection strings. Findings are redacted."
      analyseLabel="SCAN FOR SECRETS"
      user={a.user} repos={a.repos} selectedRepo={a.selectedRepo} setSelectedRepo={a.setSelectedRepo}
      analysing={a.analysing} onAnalyse={a.analyse} error={a.error} hasReport={!!r}
    >
      {r && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* HERO */}
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 12 }}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <ScoreRing score={r.riskScore} size={110} label="RISK" />
                <div style={{ marginTop: 10 }}><Pill text={r.riskLabel.toUpperCase()} color={r.riskColor} /></div>
              </div>
            </Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                <Stat label="CRITICAL" value={r.bySeverity.critical} color={C.danger} />
                <Stat label="HIGH" value={r.bySeverity.high} color={C.orange} />
                <Stat label="MEDIUM" value={r.bySeverity.medium} color={C.gold} />
                <Stat label="FILES SCANNED" value={r.scannedFiles} color={C.text} />
              </div>
              {r.byType.length > 0 && (
                <Card title="FINDING TYPES" accent={ACCENT} icon="◈">
                  <MiniBars data={r.byType.map(t => ({ label: t.label.split(' ')[0], count: t.count }))} color={ACCENT} height={80} />
                </Card>
              )}
            </div>
          </div>

          {/* RISKY FILES */}
          {r.riskyFiles.length > 0 && (
            <Card title="COMMITTED SECRET FILES" accent={C.danger} icon="⚠">
              <p style={{ fontFamily: FONT.sans, fontSize: 11, color: C.sub, margin: '0 0 8px' }}>These files typically hold secrets and should be in <code style={{ color: ACCENT }}>.gitignore</code>:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {r.riskyFiles.map(f => <Pill key={f} text={f} color={C.danger} />)}
              </div>
            </Card>
          )}

          {/* FINDINGS */}
          <Card title={`FINDINGS (${r.findings.length})`} accent={ACCENT} icon="🔑">
            {r.findings.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8 }}>
                <span style={{ fontSize: 16 }}>✓</span>
                <span style={{ fontFamily: FONT.mono, fontSize: 11, color: C.success }}>No hardcoded secrets detected in the scanned files.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 520, overflowY: 'auto' }}>
                {r.findings.map((f, i) => (
                  <div key={i} style={{ padding: '8px 11px', background: 'rgba(0,0,0,0.25)', borderRadius: 7, borderLeft: `2px solid ${SEV_COLOR[f.severity]}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Pill text={f.severity.toUpperCase()} color={SEV_COLOR[f.severity]} />
                      <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.sub }}>{f.label}</span>
                      <code style={{ fontFamily: FONT.mono, fontSize: 8.5, color: C.dim, marginLeft: 'auto' }}>{f.path}:{f.line}</code>
                    </div>
                    <code style={{ fontFamily: FONT.mono, fontSize: 10, color: C.gold, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: 'rgba(0,0,0,0.3)', padding: '4px 7px', borderRadius: 4 }}>{f.preview}</code>
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
