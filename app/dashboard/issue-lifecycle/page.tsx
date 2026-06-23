'use client'

import {
  useRepoAnalysis, AnalysisShell, Card, ScoreRing, Stat, MiniBars, DualBars, AiSummary, C, FONT,
} from '@/components/analysis/shell'
import type { IssueLifecycleReport } from '@/app/api/github/issue-lifecycle/route'

const ACCENT = C.success

export default function IssueLifecyclePage() {
  const a = useRepoAnalysis<IssueLifecycleReport>('/api/github/issue-lifecycle')
  const r = a.report

  return (
    <AnalysisShell
      title="Issue Lifecycle" accent={ACCENT} icon="🔄"
      subtitle="Triage speed, resolution times, backlog age and label throughput across the repository's issue history."
      analyseLabel="ANALYSE ISSUES"
      user={a.user} repos={a.repos} selectedRepo={a.selectedRepo} setSelectedRepo={a.setSelectedRepo}
      analysing={a.analysing} onAnalyse={a.analyse} error={a.error} hasReport={!!r}
    >
      {r && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* HERO */}
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 12 }}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <ScoreRing score={r.healthScore} size={120} />
                <div style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim, letterSpacing: '0.12em', marginTop: 8 }}>LIFECYCLE HEALTH</div>
              </div>
            </Card>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, alignContent: 'start' }}>
              <Stat label="SAMPLED" value={r.totalSampled} color={C.text} />
              <Stat label="OPEN" value={r.openCount} color={C.gold} />
              <Stat label="CLOSE RATE" value={`${r.closeRate}%`} color={ACCENT} />
              <Stat label="MEDIAN CLOSE" value={r.medianCloseDays !== null ? `${r.medianCloseDays}d` : '—'} color={C.purple} />
              <Stat label="P90 CLOSE" value={r.p90CloseDays !== null ? `${r.p90CloseDays}d` : '—'} color={C.orange} />
              <Stat label="STALE OPEN" value={r.staleOpenCount} color={r.staleOpenCount > 0 ? C.danger : C.success} hint=">90d, untouched 30d" />
            </div>
          </div>

          <AiSummary text={r.aiSummary} accent={ACCENT} />

          {/* DISTRIBUTIONS */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Card title="TIME TO CLOSE" accent={C.success} icon="⚡">
              <MiniBars data={r.closeTimeDistribution} color={C.success} />
            </Card>
            <Card title="OPEN ISSUE AGE" accent={C.orange} icon="⏳">
              <MiniBars data={r.ageDistribution} color={C.orange} />
            </Card>
          </div>

          {/* MONTHLY FLOW */}
          <Card title="OPENED vs CLOSED — LAST 6 MONTHS" accent={ACCENT} icon="◈">
            <DualBars data={r.monthlyOpened} />
          </Card>

          {/* LABELS */}
          {r.topLabels.length > 0 && (
            <Card title="LABEL THROUGHPUT" accent={C.purple} icon="🏷">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 110px', gap: 10, fontFamily: FONT.mono, fontSize: 8, color: C.dim, letterSpacing: '0.06em', paddingBottom: 4, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <span>LABEL</span><span style={{ textAlign: 'right' }}>TOTAL</span><span style={{ textAlign: 'right' }}>OPEN</span><span style={{ textAlign: 'right' }}>MED. CLOSE</span>
                </div>
                {r.topLabels.map(l => (
                  <div key={l.label} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 110px', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.label}</span>
                    <span style={{ fontFamily: FONT.orbitron, fontSize: 10, color: C.text, textAlign: 'right' }}>{l.total}</span>
                    <span style={{ fontFamily: FONT.orbitron, fontSize: 10, color: l.open > 0 ? C.gold : C.dim, textAlign: 'right' }}>{l.open}</span>
                    <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.dim, textAlign: 'right' }}>{l.medianCloseDays !== null ? `${l.medianCloseDays}d` : '—'}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </AnalysisShell>
  )
}
