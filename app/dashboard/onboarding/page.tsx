'use client'

import {
  useRepoAnalysis, AnalysisShell, Card, Stat, Pill, Chips, StepList, CodeLine, C, FONT,
} from '@/components/analysis/shell'
import type { OnboardingReport } from '@/app/api/github/onboarding/route'

const ACCENT = '#ff9500'

export default function OnboardingPage() {
  const a = useRepoAnalysis<OnboardingReport>('/api/github/onboarding')
  const r = a.report

  return (
    <AnalysisShell
      title="Onboarding Guide" accent={ACCENT} icon="🚀"
      subtitle="Generates a tailored ramp-up plan for any repo — setup, what to read in order, core concepts and good first tasks."
      analyseLabel="GENERATE GUIDE"
      user={a.user} repos={a.repos} selectedRepo={a.selectedRepo} setSelectedRepo={a.setSelectedRepo}
      analysing={a.analysing} onAnalyse={a.analyse} error={a.error} hasReport={!!r}
    >
      {r && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* HERO */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            <Stat label="DIFFICULTY" value={r.difficulty.toUpperCase()} color={r.difficultyColor} />
            <Stat label="RAMP TIME" value={`~${r.estimatedRampHours}h`} color={ACCENT} hint="to first contribution" />
            <Stat label="PREREQUISITES" value={r.prerequisites.length} color={C.purple} />
          </div>

          <Card title="PREREQUISITES" accent={C.purple} icon="◆">
            <Chips items={r.prerequisites} color={C.purple} />
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Card title="SETUP STEPS" accent={C.success} icon="▶">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {r.setupSteps.map((s, i) => {
                  const cmd = s.match(/`([^`]+)`/)?.[1]
                  return cmd
                    ? <div key={i}><div style={{ fontFamily: FONT.sans, fontSize: 11, color: C.sub, marginBottom: 3 }}>{s.replace(/`[^`]+`/, '').trim()}</div><CodeLine>{cmd}</CodeLine></div>
                    : <div key={i} style={{ display: 'flex', gap: 8 }}><span style={{ color: C.success, fontSize: 9, marginTop: 3 }}>▹</span><span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: C.sub, lineHeight: 1.5 }}>{s}</span></div>
                })}
              </div>
            </Card>
            <Card title="READING ORDER" accent={ACCENT} icon="📖">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {r.readingOrder.map((it, i) => (
                  <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                    <span style={{ flexShrink: 0, fontFamily: FONT.orbitron, fontSize: 10, fontWeight: 700, color: ACCENT, width: 18 }}>{i + 1}</span>
                    <div>
                      <code style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.accent, background: 'rgba(0,229,255,0.08)', padding: '1px 5px', borderRadius: 3 }}>{it.path}</code>
                      <div style={{ fontFamily: FONT.sans, fontSize: 10.5, color: C.dim, marginTop: 3, lineHeight: 1.45 }}>{it.why}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card title="CORE CONCEPTS" accent={C.accent} icon="🧠">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '9px 16px' }}>
              {r.coreConcepts.map((c, i) => (
                <div key={i}>
                  <span style={{ fontFamily: FONT.mono, fontSize: 11, color: C.accent }}>{c.term}</span>
                  <p style={{ fontFamily: FONT.sans, fontSize: 11, color: C.dim, margin: '2px 0 0', lineHeight: 1.45 }}>{c.definition}</p>
                </div>
              ))}
            </div>
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Card title="GOOD FIRST TASKS" accent={C.success} icon="✓">
              <StepList items={r.firstTasks.map(t => ({ title: t }))} accent={C.success} />
            </Card>
            <Card title="GOTCHAS" accent={C.danger} icon="⚠">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {r.gotchas.map((g, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ color: C.danger, fontSize: 11, marginTop: 1 }}>⚠</span>
                    <span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: C.sub, lineHeight: 1.5 }}>{g}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {!r.meta.aiGenerated && (
            <div style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim, textAlign: 'center' }}>
              Heuristic mode — add ANTHROPIC_API_KEY for AI-tailored guidance.
            </div>
          )}
        </div>
      )}
    </AnalysisShell>
  )
}
