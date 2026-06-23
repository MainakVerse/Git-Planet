'use client'

import {
  useRepoAnalysis, AnalysisShell, Card, Bar, Pill, Chips, C, FONT,
} from '@/components/analysis/shell'
import { AskAI } from '@/components/analysis/ask-ai'
import type { StartupIdeasReport } from '@/app/api/github/startup-ideas/route'

const ACCENT = '#ff4466'

export default function StartupIdeasPage() {
  const a = useRepoAnalysis<StartupIdeasReport>('/api/github/startup-ideas')
  const r = a.report

  return (
    <AnalysisShell
      title="Startup Ideas from Repos" accent={ACCENT} icon="🚀"
      subtitle="Turns any repository into commercial opportunities — product ideas, target users, market gaps and monetization. Then brainstorm with the AI."
      analyseLabel="GENERATE IDEAS"
      user={a.user} repos={a.repos} selectedRepo={a.selectedRepo} setSelectedRepo={a.setSelectedRepo}
      analysing={a.analysing} onAnalyse={a.analyse} error={a.error} hasReport={!!r}
    >
      {r && a.user && a.selectedRepo && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ padding: '12px 16px', background: `${ACCENT}0f`, border: `1px solid ${ACCENT}44`, borderRadius: 10 }}>
            <span style={{ fontFamily: FONT.mono, fontSize: 8, color: ACCENT, letterSpacing: '0.12em' }}>BASIS · </span>
            <span style={{ fontFamily: FONT.sans, fontSize: 12, color: C.sub }}>{r.basis}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {r.ideas.map((idea, i) => (
              <Card key={i} accent={ACCENT}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontFamily: FONT.orbitron, fontSize: 18, fontWeight: 700, color: `${ACCENT}66`, flexShrink: 0 }}>{String.fromCharCode(65 + i)}</span>
                  <div>
                    <div style={{ fontFamily: FONT.orbitron, fontSize: 14, fontWeight: 700, color: C.text }}>{idea.title}</div>
                    <p style={{ fontFamily: FONT.sans, fontSize: 11.5, color: C.sub, margin: '4px 0 0', lineHeight: 1.5 }}>{idea.pitch}</p>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '10px 0' }}>
                  {[['🎯 Target', idea.targetUser], ['🕳 Gap', idea.marketGap], ['💰 Revenue', idea.monetization], ['🔨 MVP', idea.mvpScope]].map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', gap: 7 }}>
                      <span style={{ fontFamily: FONT.mono, fontSize: 9, color: C.dim, flexShrink: 0, width: 64 }}>{k}</span>
                      <span style={{ fontFamily: FONT.sans, fontSize: 10.5, color: C.sub, lineHeight: 1.4 }}>{v}</span>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '10px 0' }}>
                  <Bar label="NOVELTY" value={idea.noveltyScore} color={C.purple} />
                  <Bar label="FEASIBILITY" value={idea.feasibilityScore} color={C.success} />
                  <Bar label="MARKET" value={idea.marketScore} color={C.gold} />
                </div>

                <Chips items={idea.tags} color={ACCENT} />
              </Card>
            ))}
          </div>

          {!r.meta.aiGenerated && (
            <div style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim, textAlign: 'center' }}>Heuristic ideas — add ANTHROPIC_API_KEY for AI-generated, repo-specific ideation.</div>
          )}

          <AskAI
            endpoint="/api/github/startup-ideas/chat"
            payload={{ owner: a.user.login, repo: a.selectedRepo.name }}
            accent={ACCENT}
            title="BRAINSTORM WITH AI"
            placeholder="e.g. Who would pay for this and how much?"
            greeting={`Let's brainstorm businesses built on ${a.selectedRepo.name}. Ask about markets, pricing, competitors, GTM, or pressure-test an idea.`}
            suggestions={[
              'Which idea has the biggest market?',
              'Who are the competitors?',
              'How would I price this?',
              'What is the riskiest assumption?',
            ]}
          />
        </div>
      )}
    </AnalysisShell>
  )
}
