'use client'

import {
  useRepoAnalysis, AnalysisShell, Card, ScoreRing, Bar, Stat, Pill, AiSummary, C, FONT,
} from '@/components/analysis/shell'
import type { EngagementReport } from '@/app/api/github/engagement/route'

const ACCENT = C.success

export default function EngagementPage() {
  const a = useRepoAnalysis<EngagementReport>('/api/github/engagement')
  const r = a.report

  return (
    <AnalysisShell
      title="Community Engagement" accent={ACCENT} icon="💬"
      subtitle="How alive is the community? Blends responsiveness, contributor diversity, discussion volume, reach and momentum."
      analyseLabel="SCORE ENGAGEMENT"
      user={a.user} repos={a.repos} selectedRepo={a.selectedRepo} setSelectedRepo={a.setSelectedRepo}
      analysing={a.analysing} onAnalyse={a.analyse} error={a.error} hasReport={!!r}
    >
      {r && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* HERO */}
          <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 12 }}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <ScoreRing score={r.score} size={130} />
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center', gap: 8 }}>
                  <Pill text={r.tier.toUpperCase()} color={r.gradeColor} />
                  <span style={{ fontFamily: FONT.orbitron, fontSize: 18, fontWeight: 700, color: r.gradeColor }}>{r.grade}</span>
                </div>
              </div>
            </Card>
            <Card title="ENGAGEMENT FACTORS" accent={ACCENT} icon="◈">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {r.factors.map(f => (
                  <div key={f.key}>
                    <Bar label={f.label.toUpperCase()} value={f.score} color={f.color} />
                    <div style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim, marginTop: 3 }}>{f.insight}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* SIGNALS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
            <Stat label="CONTRIBUTORS" value={r.signals.contributors} color={C.text} />
            <Stat label="EXTERNAL %" value={`${r.signals.externalContributorPct}%`} color={C.purple} />
            <Stat label="ISSUE RESPONSE" value={`${r.signals.issueResponseRate}%`} color={ACCENT} />
            <Stat label="DISCUSSION" value={r.signals.discussionVolume.toLocaleString()} color={C.gold} hint="total comments" />
            <Stat label="★/⑂ RATIO" value={r.signals.starToForkRatio} color={C.orange} />
          </div>

          <AiSummary text={r.aiSummary} accent={ACCENT} />
        </div>
      )}
    </AnalysisShell>
  )
}
