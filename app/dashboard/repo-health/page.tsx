'use client'

import {
  useRepoAnalysis, AnalysisShell, Card, ScoreRing, Bar, Stat, Pill, AiSummary, C, FONT,
} from '@/components/analysis/shell'
import type { RepoHealthReport } from '@/app/api/github/repo-health/route'

const ACCENT = C.success

export default function RepoHealthPage() {
  const a = useRepoAnalysis<RepoHealthReport>('/api/github/repo-health')
  const r = a.report

  return (
    <AnalysisShell
      title="Repository Health" accent={ACCENT} icon="❤"
      subtitle="A composite health grade from activity, maintenance, responsiveness, popularity, community and documentation signals."
      analyseLabel="SCORE HEALTH"
      user={a.user} repos={a.repos} selectedRepo={a.selectedRepo} setSelectedRepo={a.setSelectedRepo}
      analysing={a.analysing} onAnalyse={a.analyse} error={a.error} hasReport={!!r}
    >
      {r && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* HERO */}
          <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 12 }}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <ScoreRing score={r.overall} size={130} />
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontFamily: FONT.orbitron, fontSize: 28, fontWeight: 700, color: r.gradeColor, textShadow: `0 0 16px ${r.gradeColor}` }}>{r.grade}</span>
                  {r.signals.isArchived && <Pill text="ARCHIVED" color={C.danger} />}
                </div>
              </div>
            </Card>
            <Card title="HEALTH DIMENSIONS" accent={ACCENT} icon="◈">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 18px' }}>
                {r.dimensions.map(d => (
                  <div key={d.key}>
                    <Bar label={d.label.toUpperCase()} value={d.score} color={d.color} />
                    <div style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim, marginTop: 3 }}>{d.insight}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* SIGNALS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
            <Stat label="STARS" value={r.signals.stars.toLocaleString()} color={C.gold} />
            <Stat label="CONTRIBUTORS" value={r.signals.contributors} color={ACCENT} />
            <Stat label="ISSUE CLOSE RATE" value={`${r.signals.closedIssueRate}%`} color={C.purple} />
            <Stat label="PR MERGE RATE" value={`${r.signals.prMergeRate}%`} color={C.accent} />
            <Stat label="LAST PUSH" value={`${r.signals.daysSinceLastPush}d`} color={r.signals.daysSinceLastPush > 90 ? C.danger : C.text} />
          </div>

          <AiSummary text={r.aiSummary} accent={ACCENT} />

          {/* STRENGTHS / RISKS */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Card title="STRENGTHS" accent={C.success} icon="✓">
              {r.strengths.length ? (
                <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {r.strengths.map((s, i) => <li key={i} style={{ fontFamily: FONT.sans, fontSize: 11, color: C.sub, lineHeight: 1.45 }}>{s}</li>)}
                </ul>
              ) : <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.dim }}>No standout strengths yet.</span>}
            </Card>
            <Card title="RISKS" accent={C.danger} icon="⚠">
              {r.risks.length ? (
                <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {r.risks.map((s, i) => <li key={i} style={{ fontFamily: FONT.sans, fontSize: 11, color: C.sub, lineHeight: 1.45 }}>{s}</li>)}
                </ul>
              ) : <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.dim }}>No major risks detected.</span>}
            </Card>
          </div>

          {/* RECOMMENDATIONS */}
          <Card title="RECOMMENDATIONS" accent={ACCENT} icon="→">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {r.recommendations.map((rec, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ fontFamily: FONT.orbitron, fontSize: 10, color: ACCENT, flexShrink: 0, marginTop: 1 }}>{String(i + 1).padStart(2, '0')}</span>
                  <span style={{ fontFamily: FONT.sans, fontSize: 11, color: C.sub, lineHeight: 1.5 }}>{rec}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </AnalysisShell>
  )
}
