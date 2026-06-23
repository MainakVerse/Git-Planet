'use client'

import { useState } from 'react'
import {
  useRepoAnalysis, AnalysisShell, Card, ScoreRing, Stat, Pill, MiniBars, AiSummary, C, FONT,
} from '@/components/analysis/shell'
import type { RefactorReport, RefactorOpportunity } from '@/app/api/github/refactor/route'

const ACCENT = '#ff9500'
const SEV_COLOR = { high: C.danger, medium: C.gold, low: C.accent }

export default function RefactorPage() {
  const a = useRepoAnalysis<RefactorReport>('/api/github/refactor')
  const r = a.report
  const [type, setType] = useState<string>('all')

  const ops = r ? (type === 'all' ? r.opportunities : r.opportunities.filter(o => o.type === type)) : []

  return (
    <AnalysisShell
      title="Refactor Opportunities" accent={ACCENT} icon="🔧"
      subtitle="Detects large files, long functions, deep nesting, complexity and duplication — ranked into actionable refactoring opportunities."
      analyseLabel="FIND OPPORTUNITIES"
      user={a.user} repos={a.repos} selectedRepo={a.selectedRepo} setSelectedRepo={a.setSelectedRepo}
      analysing={a.analysing} onAnalyse={a.analyse} error={a.error} hasReport={!!r}
    >
      {r && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* HERO */}
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 12 }}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <ScoreRing score={r.healthScore} size={110} label="HEALTH" />
                <div style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim, letterSpacing: '0.1em', marginTop: 8 }}>CODE HEALTH</div>
              </div>
            </Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                <Stat label="OPPORTUNITIES" value={r.opportunities.length} color={C.text} />
                <Stat label="HIGH SEVERITY" value={r.opportunities.filter(o => o.severity === 'high').length} color={C.danger} />
                <Stat label="FILES SCANNED" value={r.meta.filesScanned} color={C.purple} />
              </div>
              <Card title="BY CATEGORY" accent={ACCENT} icon="◈">
                <MiniBars data={r.byType.map(t => ({ label: t.type.replace('-', ' '), count: t.count }))} color={ACCENT} height={85} />
              </Card>
            </div>
          </div>

          <AiSummary text={r.summary} accent={ACCENT} />

          {/* HOTSPOTS */}
          {r.hotspots.length > 0 && (
            <Card title="REFACTOR HOTSPOTS" accent={C.danger} icon="🔥">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {r.hotspots.map(h => (
                  <div key={h.path} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 50px', gap: 10, alignItems: 'center' }}>
                    <code style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.path}</code>
                    <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${100 - h.score}%`, background: h.score < 40 ? C.danger : h.score < 70 ? C.gold : C.success, borderRadius: 3 }} />
                    </div>
                    <span style={{ fontFamily: FONT.orbitron, fontSize: 10, color: C.danger, textAlign: 'right' }}>{h.issues} ◆</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* OPPORTUNITIES */}
          <Card title="OPPORTUNITIES" accent={ACCENT} icon="🔧">
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              {['all', ...r.byType.map(t => t.type)].map(t => (
                <button key={t} onClick={() => setType(t)}
                  style={{ padding: '4px 11px', borderRadius: 4, cursor: 'pointer', fontFamily: FONT.mono, fontSize: 9,
                    background: type === t ? `${ACCENT}1a` : 'transparent', border: `1px solid ${type === t ? ACCENT + '66' : 'rgba(255,255,255,0.08)'}`, color: type === t ? ACCENT : C.dim }}>
                  {t.replace('-', ' ').toUpperCase()}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 460, overflowY: 'auto' }}>
              {ops.map((o, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 11px', background: 'rgba(0,0,0,0.2)', borderRadius: 7, borderLeft: `2px solid ${SEV_COLOR[o.severity]}` }}>
                  <Pill text={o.severity.toUpperCase()} color={SEV_COLOR[o.severity]} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <code style={{ fontFamily: FONT.mono, fontSize: 10, color: C.accent, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.path}{o.line ? `:${o.line}` : ''}</code>
                      <span style={{ fontFamily: FONT.mono, fontSize: 8.5, color: C.dim, flexShrink: 0 }}>{o.metric}</span>
                    </div>
                    <div style={{ fontFamily: FONT.sans, fontSize: 11, color: C.sub, marginTop: 3, lineHeight: 1.4 }}>{o.suggestion}</div>
                  </div>
                </div>
              ))}
              {ops.length === 0 && <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.dim, padding: 10 }}>No opportunities of this type.</span>}
            </div>
          </Card>
        </div>
      )}
    </AnalysisShell>
  )
}
