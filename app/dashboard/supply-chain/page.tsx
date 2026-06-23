'use client'

import {
  useRepoAnalysis, AnalysisShell, Card, ScoreRing, Bar, Stat, Pill, Radar, C, FONT,
} from '@/components/analysis/shell'
import type { SupplyChainReport } from '@/app/api/github/supply-chain/route'

const ACCENT = '#FFD700'

export default function SupplyChainPage() {
  const a = useRepoAnalysis<SupplyChainReport>('/api/github/supply-chain')
  const r = a.report

  return (
    <AnalysisShell
      title="Supply Chain Risk" accent={ACCENT} icon="⛓"
      subtitle="Scores software-supply-chain risk from vulnerability exposure, dependency surface, maintenance freshness, hygiene and license risk."
      analyseLabel="SCORE RISK"
      user={a.user} repos={a.repos} selectedRepo={a.selectedRepo} setSelectedRepo={a.setSelectedRepo}
      analysing={a.analysing} onAnalyse={a.analyse} error={a.error} hasReport={!!r}
    >
      {r && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* HERO */}
          <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr 260px', gap: 12 }}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <ScoreRing score={r.riskScore} size={110} label="RISK" />
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center' }}>
                  <Pill text={r.tier.toUpperCase()} color={r.gradeColor} />
                  <span style={{ fontFamily: FONT.orbitron, fontSize: 16, fontWeight: 700, color: r.gradeColor }}>{r.grade}</span>
                </div>
              </div>
            </Card>
            <Card title="RISK FACTORS" accent={ACCENT} icon="◈">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {r.factors.map(f => (
                  <div key={f.key}>
                    <Bar label={f.label.toUpperCase()} value={f.score} color={f.color} />
                    <div style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim, marginTop: 3 }}>{f.detail}</div>
                  </div>
                ))}
              </div>
            </Card>
            <Card title="RISK PROFILE" accent={ACCENT} icon="◎">
              <Radar data={r.factors.map(f => ({ skill: f.label.split(' ')[0], level: f.score }))} color={ACCENT} size={220} />
            </Card>
          </div>

          {/* SIGNALS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8 }}>
            <Stat label="TOTAL DEPS" value={r.signals.totalDependencies} color={C.text} />
            <Stat label="VULNERABLE" value={r.signals.vulnerableDeps} color={r.signals.vulnerableDeps > 0 ? C.danger : C.success} />
            <Stat label="COPYLEFT" value={r.signals.copyleftDeps} color={C.orange} />
            <Stat label="LOCKFILE" value={r.signals.hasLockfile ? 'YES' : 'NO'} color={r.signals.hasLockfile ? C.success : C.danger} />
            <Stat label="DEPENDABOT" value={r.signals.hasDependabot ? 'YES' : 'NO'} color={r.signals.hasDependabot ? C.success : C.danger} />
            <Stat label="PINNED" value={`${r.signals.pinnedRatio}%`} color={C.purple} />
          </div>

          {/* RECOMMENDATIONS */}
          <Card title="HARDENING RECOMMENDATIONS" accent={ACCENT} icon="→">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {r.recommendations.map((rec, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ fontFamily: FONT.orbitron, fontSize: 10, color: ACCENT, flexShrink: 0, marginTop: 1 }}>{String(i + 1).padStart(2, '0')}</span>
                  <span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: C.sub, lineHeight: 1.5 }}>{rec}</span>
                </div>
              ))}
            </div>
          </Card>

          <div style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim, textAlign: 'center' }}>{r.meta.note}</div>
        </div>
      )}
    </AnalysisShell>
  )
}
