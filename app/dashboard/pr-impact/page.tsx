'use client'

import {
  useRepoAnalysis, AnalysisShell, Card, Stat, Pill, MiniBars, AvatarRow, C, FONT,
} from '@/components/analysis/shell'
import type { PRImpactReport } from '@/app/api/github/pr-impact/route'

const ACCENT = '#ff9500'

export default function PRImpactPage() {
  const a = useRepoAnalysis<PRImpactReport>('/api/github/pr-impact')
  const r = a.report

  return (
    <AnalysisShell
      title="PR Impact Prediction" accent={ACCENT} icon="🎯"
      subtitle="Learns this repo's merge patterns from history, then predicts the blast radius, risk and review burden of open pull requests."
      analyseLabel="PREDICT IMPACT"
      user={a.user} repos={a.repos} selectedRepo={a.selectedRepo} setSelectedRepo={a.setSelectedRepo}
      analysing={a.analysing} onAnalyse={a.analyse} error={a.error} hasReport={!!r}
    >
      {r && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* BASELINE */}
          <Card title="LEARNED BASELINE" accent={C.purple} icon="📊">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
              <Stat label="MED. MERGE TIME" value={`${r.baseline.medianMergeDays}d`} color={C.accent} />
              <Stat label="MED. FILES/PR" value={r.baseline.medianChangedFiles} color={C.purple} />
              <Stat label="MED. ADDITIONS" value={r.baseline.medianAdditions} color={C.gold} />
              <Stat label="MERGE RATE" value={`${r.baseline.mergeRate}%`} color={C.success} />
              <Stat label="AVG REVIEWS" value={r.baseline.avgReviewComments} color={C.orange} />
            </div>
          </Card>

          <Card title="PR SIZE DISTRIBUTION" accent={ACCENT} icon="◈">
            <MiniBars data={r.sizeDistribution} color={ACCENT} height={90} />
          </Card>

          {/* OPEN PR PREDICTIONS */}
          <Card title={`OPEN PR PREDICTIONS (${r.openPRs.length})`} accent={ACCENT} icon="🎯">
            {r.openPRs.length === 0 ? (
              <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.dim }}>No open pull requests to predict.</span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {r.openPRs.map(pr => (
                  <div key={pr.number} style={{ padding: '11px 13px', background: 'rgba(0,0,0,0.22)', border: `1px solid ${pr.riskColor}33`, borderRadius: 8, borderLeft: `3px solid ${pr.riskColor}` }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <a href={pr.html} target="_blank" rel="noreferrer" style={{ fontFamily: FONT.sans, fontSize: 13, color: C.text, textDecoration: 'none', fontWeight: 500, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <span style={{ color: C.dim }}>#{pr.number}</span> {pr.title}
                        </a>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                          <img src={pr.authorAvatar} alt={pr.author} style={{ width: 16, height: 16, borderRadius: '50%' }} />
                          <span style={{ fontFamily: FONT.mono, fontSize: 9, color: C.dim }}>{pr.author} · {pr.ageDays}d old</span>
                          <span style={{ fontFamily: FONT.mono, fontSize: 9, color: C.success }}>+{pr.additions}</span>
                          <span style={{ fontFamily: FONT.mono, fontSize: 9, color: C.danger }}>−{pr.deletions}</span>
                          <span style={{ fontFamily: FONT.mono, fontSize: 9, color: C.dim }}>{pr.changedFiles} files</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontFamily: FONT.orbitron, fontSize: 20, fontWeight: 700, color: pr.riskColor }}>{pr.impactScore}</div>
                        <Pill text={pr.riskLevel.toUpperCase()} color={pr.riskColor} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 7 }}>
                      <span style={{ fontFamily: FONT.mono, fontSize: 9, color: C.dim }}>merge prob: <b style={{ color: pr.mergeProbability >= 60 ? C.success : pr.mergeProbability >= 35 ? C.gold : C.danger }}>{pr.mergeProbability}%</b></span>
                      <span style={{ fontFamily: FONT.mono, fontSize: 9, color: C.dim }}>est. review: <b style={{ color: C.accent }}>~{pr.predictedReviewDays}d</b></span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {pr.factors.map((f, i) => <span key={i} style={{ fontFamily: FONT.mono, fontSize: 8.5, color: C.dim, padding: '2px 7px', background: 'rgba(255,255,255,0.03)', borderRadius: 4 }}>{f}</span>)}
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
