'use client'

import {
  useRepoAnalysis, AnalysisShell, Card, ScoreRing, Stat, Pill, C, FONT,
} from '@/components/analysis/shell'
import type { LicenseReport } from '@/app/api/github/license-check/route'

const ACCENT = '#FFD700'

export default function LicenseCheckPage() {
  const a = useRepoAnalysis<LicenseReport>('/api/github/license-check')
  const r = a.report

  return (
    <AnalysisShell
      title="License Compliance" accent={ACCENT} icon="⚖"
      subtitle="Audits the project license and every dependency's license — flagging copyleft conflicts and compliance risk."
      analyseLabel="CHECK LICENSES"
      user={a.user} repos={a.repos} selectedRepo={a.selectedRepo} setSelectedRepo={a.setSelectedRepo}
      analysing={a.analysing} onAnalyse={a.analyse} error={a.error} hasReport={!!r}
    >
      {r && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* HERO */}
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 12 }}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <ScoreRing score={r.complianceScore} size={110} label="COMPLY" />
                <div style={{ marginTop: 10 }}>
                  <Pill text={r.projectLicense ?? 'NO LICENSE'} color={r.projectColor} />
                </div>
              </div>
            </Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                <Stat label="DEPS SCANNED" value={r.meta.depsScanned} color={C.text} />
                <Stat label="CONFLICTS" value={r.conflicts} color={r.conflicts > 0 ? C.danger : C.success} />
                <Stat label="UNKNOWN" value={r.unknownCount} color={C.gold} />
                <Stat label="LICENSE FILE" value={r.hasLicenseFile ? 'YES' : 'NO'} color={r.hasLicenseFile ? C.success : C.danger} />
              </div>
              {r.buckets.length > 0 && (
                <Card title="DEPENDENCY LICENSE MIX" accent={ACCENT} icon="◈">
                  <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
                    {r.buckets.map(b => (
                      <div key={b.risk} title={`${b.label}: ${b.count}`} style={{ width: `${(b.count / r.meta.depsScanned) * 100}%`, background: b.color }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {r.buckets.map(b => (
                      <span key={b.risk} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: b.color }} />
                        <span style={{ fontFamily: FONT.mono, fontSize: 9, color: C.dim }}>{b.label} ({b.count})</span>
                      </span>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          </div>

          {/* CONFLICTS */}
          {r.incompatibilities.length > 0 && (
            <Card title="LICENSE CONFLICTS" accent={C.danger} icon="⚠">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {r.incompatibilities.map((inc, i) => (
                  <div key={i} style={{ padding: '8px 11px', background: 'rgba(255,68,102,0.06)', border: '1px solid rgba(255,68,102,0.2)', borderRadius: 7 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <code style={{ fontFamily: FONT.mono, fontSize: 11, color: C.danger }}>{inc.dep}</code>
                      <Pill text={inc.license} color={C.danger} />
                    </div>
                    <span style={{ fontFamily: FONT.sans, fontSize: 11, color: C.sub }}>{inc.issue}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* RECOMMENDATIONS */}
          <Card title="RECOMMENDATIONS" accent={ACCENT} icon="→">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {r.recommendations.map((rec, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ fontFamily: FONT.orbitron, fontSize: 10, color: ACCENT, flexShrink: 0, marginTop: 1 }}>{String(i + 1).padStart(2, '0')}</span>
                  <span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: C.sub, lineHeight: 1.5 }}>{rec}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* DEP TABLE */}
          {r.dependencies.length > 0 && (
            <Card title="DEPENDENCY LICENSES" accent={C.purple} icon="◈">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '4px 16px', maxHeight: 320, overflowY: 'auto' }}>
                {r.dependencies.map(d => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                    <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.sub, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</span>
                    <span style={{ fontFamily: FONT.mono, fontSize: 9, color: d.color }}>{d.license}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {!r.meta.sbomAvailable && (
            <div style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim, textAlign: 'center' }}>
              GitHub dependency-graph SBOM unavailable for this repo — only the project license was checked.
            </div>
          )}
        </div>
      )}
    </AnalysisShell>
  )
}
