'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import {
  useRepoAnalysis, AnalysisShell, Card, Stat, Pill, AiSummary, C, FONT,
} from '@/components/analysis/shell'
import { AskAI } from '@/components/analysis/ask-ai'
import type { ExplainReport } from '@/app/api/github/explain/route'

const ACCENT = '#ff9500'

export default function ExplainPage() {
  const a = useRepoAnalysis<ExplainReport>('/api/github/explain')
  const r = a.report

  // group tech stack by category
  const stackByCat: Record<string, ExplainReport['techStack']> = {}
  r?.techStack.forEach(t => { (stackByCat[t.category] ??= []).push(t) })

  return (
    <AnalysisShell
      title="Instant Repo Explanation" accent={ACCENT} icon="💡"
      subtitle="Understand any repository in seconds — what it does, how it works, its stack and structure. Then ask the AI anything."
      analyseLabel="EXPLAIN REPO"
      user={a.user} repos={a.repos} selectedRepo={a.selectedRepo} setSelectedRepo={a.setSelectedRepo}
      analysing={a.analysing} onAnalyse={a.analyse} error={a.error} hasReport={!!r}
    >
      {r && a.user && a.selectedRepo && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* TLDR */}
          <div style={{ padding: '16px 18px', background: `${ACCENT}0f`, border: `1px solid ${ACCENT}44`, borderRadius: 12 }}>
            <div style={{ fontFamily: FONT.mono, fontSize: 8, color: ACCENT, letterSpacing: '0.15em', marginBottom: 6 }}>TL;DR</div>
            <div style={{ fontFamily: FONT.orbitron, fontSize: 17, fontWeight: 700, color: C.text, lineHeight: 1.4 }}>{r.tldr}</div>
          </div>

          {/* STATS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8 }}>
            <Stat label="FILES" value={r.stats.files} color={C.text} />
            <Stat label="DIRS" value={r.stats.directories} color={C.accent} />
            <Stat label="DEPS" value={r.stats.dependencies} color={C.purple} />
            <Stat label="TESTS" value={r.stats.hasTests ? 'YES' : 'NO'} color={r.stats.hasTests ? C.success : C.dim} />
            <Stat label="CI" value={r.stats.hasCI ? 'YES' : 'NO'} color={r.stats.hasCI ? C.success : C.dim} />
            <Stat label="DOCKER" value={r.stats.hasDocker ? 'YES' : 'NO'} color={r.stats.hasDocker ? C.success : C.dim} />
          </div>

          {/* WHAT / HOW + LANG DONUT */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Card title="WHAT IT DOES" accent={ACCENT} icon="◆">
                <p style={{ fontFamily: FONT.sans, fontSize: 12.5, color: C.sub, lineHeight: 1.65, margin: 0 }}>{r.whatItDoes}</p>
              </Card>
              <Card title="HOW IT WORKS" accent={C.purple} icon="⚙">
                <p style={{ fontFamily: FONT.sans, fontSize: 12.5, color: C.sub, lineHeight: 1.65, margin: 0 }}>{r.howItWorks}</p>
              </Card>
            </div>
            <Card title="LANGUAGE MIX" accent={C.accent} icon="◈">
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={r.languageBreakdown} dataKey="count" nameKey="ext" cx="50%" cy="50%" innerRadius="48%" outerRadius="80%" strokeWidth={0}>
                    {r.languageBreakdown.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.88} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'rgba(13,17,23,0.95)', border: '1px solid rgba(0,229,255,0.2)', borderRadius: 5, fontFamily: FONT.mono, fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
                {r.languageBreakdown.slice(0, 6).map(d => (
                  <div key={d.ext} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                    <span style={{ fontFamily: FONT.mono, fontSize: 9, color: C.sub, flex: 1 }}>.{d.ext}</span>
                    <span style={{ fontFamily: FONT.mono, fontSize: 9, color: d.color }}>{d.pct}%</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* TECH STACK + COMPONENTS */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Card title="TECH STACK" accent={ACCENT} icon="⬡">
              {Object.keys(stackByCat).length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {Object.entries(stackByCat).map(([cat, items]) => (
                    <div key={cat}>
                      <div style={{ fontFamily: FONT.mono, fontSize: 8, color: items[0].color, letterSpacing: '0.08em', marginBottom: 4 }}>{cat.toUpperCase()}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {items.map(t => <Pill key={t.name} text={t.name} color={t.color} />)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.dim }}>No recognised stack from package.json.</span>}
            </Card>
            <Card title="COMPONENTS" accent={C.purple} icon="◫">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {r.components.map(c => (
                  <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ fontFamily: FONT.mono, fontSize: 11, color: C.accent, minWidth: 90 }}>{c.name}/</span>
                    <span style={{ fontFamily: FONT.sans, fontSize: 11, color: C.sub, flex: 1 }}>{c.purpose}</span>
                    <span style={{ fontFamily: FONT.mono, fontSize: 9, color: C.dim }}>{c.files}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* QUICK START */}
          {r.quickStart.length > 0 && (
            <Card title="QUICK START" accent={C.success} icon="▶">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {r.quickStart.map((cmd, i) => (
                  <div key={i} style={{ fontFamily: FONT.mono, fontSize: 11, color: C.success, padding: '6px 10px', background: 'rgba(0,0,0,0.35)', borderRadius: 5, border: '1px solid rgba(0,255,136,0.15)' }}>
                    <span style={{ color: C.dim }}>$ </span>{cmd}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* ASK AI */}
          <AskAI
            endpoint="/api/github/explain/chat"
            payload={{ owner: a.user.login, repo: a.selectedRepo.name }}
            accent={ACCENT}
            title="ASK ABOUT THIS REPO"
            placeholder="e.g. Where does authentication happen?"
            greeting={`I've read through ${a.selectedRepo.name}. Ask me anything — architecture, where to start, how a feature works, or how to extend it.`}
            suggestions={[
              'What problem does this solve?',
              'Walk me through the architecture',
              'Where should I start reading the code?',
              'How would I add a new feature?',
            ]}
          />
        </div>
      )}
    </AnalysisShell>
  )
}
