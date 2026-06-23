'use client'

import { useState } from 'react'
import {
  useRepoAnalysis, AnalysisShell, Card, ScoreRing, Stat, MiniBars, C, FONT,
} from '@/components/analysis/shell'
import type { TodoReport, TodoItem } from '@/app/api/github/todos/route'

const ACCENT = '#ff9500'
const PRIO_COLOR = { high: C.danger, medium: C.gold, low: C.accent }

export default function TodosPage() {
  const a = useRepoAnalysis<TodoReport>('/api/github/todos')
  const r = a.report
  const [filter, setFilter] = useState<'all' | TodoItem['priority']>('all')

  const items = r ? (filter === 'all' ? r.items : r.items.filter(i => i.priority === filter)) : []

  return (
    <AnalysisShell
      title="TODO Extraction" accent={ACCENT} icon="📝"
      subtitle="Scans the codebase for TODO, FIXME, HACK, BUG and other markers — categorised, prioritised, and ranked into a tech-debt view."
      analyseLabel="EXTRACT TODOS"
      user={a.user} repos={a.repos} selectedRepo={a.selectedRepo} setSelectedRepo={a.setSelectedRepo}
      analysing={a.analysing} onAnalyse={a.analyse} error={a.error} hasReport={!!r}
    >
      {r && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* HERO */}
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 12 }}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <ScoreRing score={r.debtScore} size={110} label="DEBT" />
                <div style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim, letterSpacing: '0.1em', marginTop: 8 }}>TECH-DEBT INDEX</div>
              </div>
            </Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                <Stat label="TOTAL" value={r.total} color={C.text} />
                <Stat label="HIGH" value={r.byPriority.high} color={C.danger} />
                <Stat label="MEDIUM" value={r.byPriority.medium} color={C.gold} />
                <Stat label="LOW" value={r.byPriority.low} color={C.accent} />
              </div>
              <Card title="BY MARKER TYPE" accent={ACCENT} icon="◈">
                <MiniBars data={r.byKind.map(k => ({ label: k.kind, count: k.count }))} color={ACCENT} height={90} />
              </Card>
            </div>
          </div>

          {/* HOTSPOTS */}
          {r.byFile.length > 0 && (
            <Card title="DEBT HOTSPOTS" accent={C.danger} icon="🔥">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {r.byFile.map(f => (
                  <div key={f.path} style={{ display: 'grid', gridTemplateColumns: '1fr 60px', gap: 10, alignItems: 'center' }}>
                    <code style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.path}</code>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, (f.count / r.byFile[0].count) * 100)}%`, background: ACCENT, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontFamily: FONT.orbitron, fontSize: 10, color: ACCENT }}>{f.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* ITEMS with filter */}
          <Card title="EXTRACTED ITEMS" accent={ACCENT} icon="📝">
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {(['all', 'high', 'medium', 'low'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  style={{ padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontFamily: FONT.mono, fontSize: 9, letterSpacing: '0.05em',
                    background: filter === f ? `${f === 'all' ? ACCENT : PRIO_COLOR[f]}1a` : 'transparent',
                    border: `1px solid ${filter === f ? (f === 'all' ? ACCENT : PRIO_COLOR[f]) + '66' : 'rgba(255,255,255,0.08)'}`,
                    color: filter === f ? (f === 'all' ? ACCENT : PRIO_COLOR[f]) : C.dim }}>
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 480, overflowY: 'auto' }}>
              {items.map((it, i) => (
                <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '7px 9px', background: 'rgba(0,0,0,0.2)', borderRadius: 6, borderLeft: `2px solid ${r.byKind.find(k => k.kind === it.kind)?.color ?? C.dim}` }}>
                  <span style={{ fontFamily: FONT.mono, fontSize: 8, fontWeight: 700, color: r.byKind.find(k => k.kind === it.kind)?.color ?? C.dim, flexShrink: 0, width: 64 }}>{it.kind}</span>
                  <span style={{ fontFamily: FONT.sans, fontSize: 11, color: C.sub, flex: 1, lineHeight: 1.4 }}>{it.text}</span>
                  <code style={{ fontFamily: FONT.mono, fontSize: 8.5, color: C.dim, flexShrink: 0, whiteSpace: 'nowrap' }}>{it.path.split('/').pop()}:{it.line}</code>
                </div>
              ))}
              {items.length === 0 && <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.dim, padding: 10 }}>No items match this filter.</span>}
            </div>
          </Card>

          <div style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim, textAlign: 'center' }}>
            Scanned {r.meta.filesScanned} files · {r.meta.filesWithTodos} contained markers
          </div>
        </div>
      )}
    </AnalysisShell>
  )
}
