'use client'

import {
  useRepoAnalysis, AnalysisShell, Card, Stat, Pill, Chips, Radar, C, FONT,
} from '@/components/analysis/shell'
import type { LearningPathReport, LearningStage } from '@/app/api/github/learning-path/route'

const ACCENT = '#ff9500'
const LEVEL_COLOR: Record<LearningStage['level'], string> = { Beginner: C.success, Intermediate: C.gold, Advanced: C.danger }

export default function LearningPathPage() {
  const a = useRepoAnalysis<LearningPathReport>('/api/github/learning-path')
  const r = a.report

  return (
    <AnalysisShell
      title="Learning Path" accent={ACCENT} icon="🎓"
      subtitle="Turns any repository into a structured curriculum — a staged path from fundamentals to mastery, grounded in the actual code."
      analyseLabel="BUILD PATH"
      user={a.user} repos={a.repos} selectedRepo={a.selectedRepo} setSelectedRepo={a.setSelectedRepo}
      analysing={a.analysing} onAnalyse={a.analyse} error={a.error} hasReport={!!r}
    >
      {r && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* HERO */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ padding: '14px 16px', background: `${ACCENT}0f`, border: `1px solid ${ACCENT}44`, borderRadius: 12 }}>
                <div style={{ fontFamily: FONT.mono, fontSize: 8, color: ACCENT, letterSpacing: '0.15em', marginBottom: 5 }}>FOCUS</div>
                <div style={{ fontFamily: FONT.orbitron, fontSize: 16, fontWeight: 700, color: C.text, lineHeight: 1.4 }}>{r.focus}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
                <Stat label="EST. TIME" value={`~${r.totalEstimatedHours}h`} color={ACCENT} />
                <Stat label="STAGES" value={r.stages.length} color={C.purple} />
              </div>
              <Card title="STUDY RESOURCES" accent={C.accent} icon="◆">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {r.resources.map((res, i) => <Pill key={i} text={`${res.label}`} color={res.type === 'tool' ? C.accent : res.type === 'pattern' ? C.purple : C.success} />)}
                </div>
              </Card>
            </div>
            <Card title="SKILL EMPHASIS" accent={ACCENT} icon="◎">
              {r.skillRadar.length >= 3 ? <Radar data={r.skillRadar} color={ACCENT} size={230} />
                : <div style={{ fontFamily: FONT.mono, fontSize: 10, color: C.dim, textAlign: 'center', padding: 20 }}>Not enough skill data.</div>}
            </Card>
          </div>

          {/* STAGES */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {r.stages.map((s, i) => (
              <div key={i} style={{ position: 'relative', padding: '14px 16px 14px 20px', background: 'rgba(13,17,23,0.8)', border: `1px solid ${LEVEL_COLOR[s.level]}33`, borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: LEVEL_COLOR[s.level], boxShadow: `0 0 10px ${LEVEL_COLOR[s.level]}` }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontFamily: FONT.orbitron, fontSize: 22, fontWeight: 700, color: `${LEVEL_COLOR[s.level]}66` }}>{i + 1}</span>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Pill text={s.level.toUpperCase()} color={LEVEL_COLOR[s.level]} />
                      <span style={{ fontFamily: FONT.orbitron, fontSize: 13, fontWeight: 700, color: C.text }}>{s.title}</span>
                    </div>
                    <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: C.dim, marginTop: 3 }}>{s.goal}</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 8 }}>
                  <div>
                    <div style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim, letterSpacing: '0.08em', marginBottom: 5 }}>CONCEPTS</div>
                    <Chips items={s.concepts} color={LEVEL_COLOR[s.level]} />
                  </div>
                  <div>
                    <div style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim, letterSpacing: '0.08em', marginBottom: 5 }}>PRACTICE FILES</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {s.practiceFiles.length ? s.practiceFiles.map(f => (
                        <code key={f} style={{ fontFamily: FONT.mono, fontSize: 9.5, color: C.accent }}>{f}</code>
                      )) : <span style={{ fontFamily: FONT.mono, fontSize: 9, color: C.dim }}>—</span>}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 10, padding: '7px 10px', background: `${LEVEL_COLOR[s.level]}0f`, borderRadius: 6, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 11 }}>🏁</span>
                  <span style={{ fontFamily: FONT.sans, fontSize: 11, color: C.sub }}><b style={{ color: LEVEL_COLOR[s.level], fontWeight: 600 }}>Milestone:</b> {s.milestone}</span>
                </div>
              </div>
            ))}
          </div>

          {!r.meta.aiGenerated && (
            <div style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim, textAlign: 'center' }}>Heuristic mode — add ANTHROPIC_API_KEY for an AI-crafted curriculum.</div>
          )}
        </div>
      )}
    </AnalysisShell>
  )
}
