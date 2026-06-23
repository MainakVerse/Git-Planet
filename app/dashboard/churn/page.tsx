'use client'

import {
  useRepoAnalysis, AnalysisShell, Card, ScoreRing, Stat, Pill, AvatarRow, AiSummary, C, FONT,
} from '@/components/analysis/shell'
import type { ChurnReport } from '@/app/api/github/churn/route'

const ACCENT = C.success

export default function ChurnPage() {
  const a = useRepoAnalysis<ChurnReport>('/api/github/churn')
  const r = a.report

  return (
    <AnalysisShell
      title="Contributor Churn" accent={ACCENT} icon="🌊"
      subtitle="Tracks contributor retention, turnover and at-risk maintainers using first/last-commit cohorts."
      analyseLabel="ANALYSE CHURN"
      user={a.user} repos={a.repos} selectedRepo={a.selectedRepo} setSelectedRepo={a.setSelectedRepo}
      analysing={a.analysing} onAnalyse={a.analyse} error={a.error} hasReport={!!r}
    >
      {r && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* HERO */}
          <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: 12 }}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <ScoreRing score={r.retentionScore} size={120} label="RETENTION" />
                <div style={{ marginTop: 10 }}><Pill text={`${r.churnRatePct}% CHURN`} color={r.churnRatePct >= 50 ? C.danger : r.churnRatePct >= 30 ? C.gold : C.success} /></div>
              </div>
            </Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                <Stat label="ACTIVE" value={r.activeCount} color={C.success} />
                <Stat label="AT RISK" value={r.atRiskCount} color={C.gold} hint="3-6mo idle" />
                <Stat label="CHURNED" value={r.churnedCount} color={C.danger} hint=">6mo idle" />
                <Stat label="NEW" value={r.newCount} color={ACCENT} hint="<3mo" />
              </div>
              <Card title="BUS-FACTOR TREND" accent={C.purple} icon="◈">
                <p style={{ fontFamily: FONT.sans, fontSize: 12, color: C.sub, margin: 0, lineHeight: 1.5 }}>{r.busFactorTrend}</p>
              </Card>
            </div>
          </div>

          <AiSummary text={r.aiSummary} accent={ACCENT} />

          {/* COHORT RETENTION */}
          <Card title="COHORT RETENTION BY JOIN QUARTER" accent={ACCENT} icon="◈">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {r.cohorts.map(c => (
                <div key={c.period} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 110px', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.sub }}>{c.period}</span>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${c.retentionPct}%`, background: c.retentionPct >= 50 ? C.success : c.retentionPct >= 25 ? C.gold : C.danger, borderRadius: 3, boxShadow: `0 0 5px ${c.retentionPct >= 50 ? C.success : C.gold}` }} />
                  </div>
                  <span style={{ fontFamily: FONT.mono, fontSize: 9, color: C.dim, textAlign: 'right' }}>{c.stillActive}/{c.joined} active ({c.retentionPct}%)</span>
                </div>
              ))}
            </div>
          </Card>

          {/* LISTS */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Card title="RISING CONTRIBUTORS" accent={C.success} icon="↗">
              {r.risingContributors.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {r.risingContributors.map(c => (
                    <AvatarRow key={c.login} avatar={c.avatar} login={c.login} html={c.html}
                      sub={`joined ${c.firstSeenDays}d ago · ${c.commits} commits`}
                      right={<Pill text={c.status === 'new' ? 'NEW' : 'ACTIVE'} positive />} />
                  ))}
                </div>
              ) : <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.dim }}>No recent newcomers.</span>}
            </Card>
            <Card title="RECENTLY CHURNED" accent={C.danger} icon="↘">
              {r.recentlyChurned.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {r.recentlyChurned.map(c => (
                    <AvatarRow key={c.login} avatar={c.avatar} login={c.login} html={c.html}
                      sub={`last seen ${c.lastSeenDays}d ago · ${c.commits} commits`}
                      right={<Pill text={`${c.lastSeenDays}d`} color={C.danger} />} />
                  ))}
                </div>
              ) : <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.dim }}>No churned contributors detected.</span>}
            </Card>
          </div>
        </div>
      )}
    </AnalysisShell>
  )
}
