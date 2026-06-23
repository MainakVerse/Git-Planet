'use client'

import {
  useRepoAnalysis, AnalysisShell, Card, ScoreRing, Bar, Stat, Pill, AvatarRow, AiSummary, C, FONT,
} from '@/components/analysis/shell'
import type { BusFactorReport } from '@/app/api/github/bus-factor/route'

const ACCENT = C.success

export default function BusFactorPage() {
  const a = useRepoAnalysis<BusFactorReport>('/api/github/bus-factor')
  const r = a.report

  return (
    <AnalysisShell
      title="Bus Factor" accent={ACCENT} icon="🚌"
      subtitle="How many contributors could leave before the project stalls? Measures knowledge concentration and continuity risk."
      analyseLabel="ANALYSE RISK"
      user={a.user} repos={a.repos} selectedRepo={a.selectedRepo} setSelectedRepo={a.setSelectedRepo}
      analysing={a.analysing} onAnalyse={a.analyse} error={a.error} hasReport={!!r}
    >
      {r && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* HERO */}
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 12 }}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: FONT.orbitron, fontSize: 64, fontWeight: 700, color: r.riskColor, lineHeight: 1, textShadow: `0 0 22px ${r.riskColor}` }}>
                  {r.busFactor}
                </div>
                <div style={{ fontFamily: FONT.mono, fontSize: 9, color: C.dim, letterSpacing: '0.12em', marginTop: 4 }}>BUS FACTOR</div>
                <div style={{ marginTop: 10 }}>
                  <Pill text={r.riskLevel.toUpperCase() + ' RISK'} color={r.riskColor} />
                </div>
              </div>
            </Card>
            <Card title="RESILIENCE" accent={ACCENT} icon="🛡️">
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 16, alignItems: 'center' }}>
                <ScoreRing score={r.resilienceScore} size={110} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <Bar label="TOP CONTRIBUTOR SHARE" value={r.topShare} suffix="%" color={C.danger} />
                  <Bar label="TOP 3 SHARE" value={r.top3Share} suffix="%" color={C.orange} />
                  <Bar label="OWNERSHIP EVENNESS" value={Math.round((1 - r.giniCoefficient) * 100)} suffix="%" color={ACCENT} />
                </div>
              </div>
            </Card>
          </div>

          {/* STATS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
            <Stat label="TOTAL CONTRIBUTORS" value={r.totalContributors} color={C.text} />
            <Stat label="ACTIVE (6MO)" value={r.activeContributors} color={ACCENT} />
            <Stat label="GINI COEFFICIENT" value={r.giniCoefficient} color={C.gold} hint="0=even · 1=concentrated" />
            <Stat label="COMMITS ANALYSED" value={r.meta.commitsAnalyzed.toLocaleString()} color={C.text} />
          </div>

          {/* SILOS */}
          {r.knowledgeSilos.length > 0 && (
            <Card title="KNOWLEDGE SILOS" accent={C.danger} icon="⚠">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {r.knowledgeSilos.map(s => (
                  <div key={s.login} style={{ padding: '8px 11px', background: 'rgba(255,68,102,0.06)', border: '1px solid rgba(255,68,102,0.2)', borderRadius: 7 }}>
                    <span style={{ fontFamily: FONT.mono, fontSize: 11, color: C.danger }}>@{s.login}</span>
                    <span style={{ fontFamily: FONT.sans, fontSize: 11, color: C.sub, marginLeft: 8 }}>{s.note}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <AiSummary text={r.aiSummary} accent={ACCENT} />

          {/* CONTRIBUTOR TABLE */}
          <Card title="OWNERSHIP DISTRIBUTION" accent={ACCENT} icon="◈">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {r.contributors.map((c, i) => (
                <div key={c.login} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 180px 90px', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontFamily: FONT.mono, fontSize: 10, color: 'rgba(0,229,255,0.4)' }}>{String(i + 1).padStart(2, '0')}</span>
                  <AvatarRow avatar={c.avatar} login={c.login} html={c.html}
                    sub={c.lastActiveDays !== null ? `last commit ${c.lastActiveDays}d ago` : 'no recent commits'} />
                  <div>
                    <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${c.sharePct}%`, background: i === 0 ? C.danger : i < 3 ? C.orange : ACCENT, borderRadius: 3, boxShadow: `0 0 5px ${i === 0 ? C.danger : ACCENT}` }} />
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                    <span style={{ fontFamily: FONT.orbitron, fontSize: 11, fontWeight: 700, color: C.text }}>{c.sharePct}%</span>
                    {c.isActive
                      ? <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.success, boxShadow: `0 0 5px ${C.success}` }} title="active" />
                      : <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(125,133,144,0.5)' }} title="inactive" />}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </AnalysisShell>
  )
}
