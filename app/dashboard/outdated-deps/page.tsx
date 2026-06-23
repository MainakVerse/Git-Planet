'use client'

import { useState } from 'react'
import {
  useRepoAnalysis, AnalysisShell, Card, ScoreRing, Stat, Pill, C, FONT,
} from '@/components/analysis/shell'
import type { OutdatedReport, DepStatus } from '@/app/api/github/outdated-deps/route'

const ACCENT = '#FFD700'
const GAP_COLOR = { major: C.danger, minor: C.orange, patch: C.gold, current: C.success, unknown: C.dim }

export default function OutdatedDepsPage() {
  const a = useRepoAnalysis<OutdatedReport>('/api/github/outdated-deps')
  const r = a.report
  const [filter, setFilter] = useState<'all' | DepStatus['gap']>('all')

  const deps = r ? (filter === 'all' ? r.deps : r.deps.filter(d => d.gap === filter)) : []

  return (
    <AnalysisShell
      title="Outdated Dependencies" accent={ACCENT} icon="📦"
      subtitle="Checks every npm dependency against the registry — flagging major, minor and patch updates and an overall freshness score."
      analyseLabel="CHECK UPDATES"
      user={a.user} repos={a.repos} selectedRepo={a.selectedRepo} setSelectedRepo={a.setSelectedRepo}
      analysing={a.analysing} onAnalyse={a.analyse} error={a.error} hasReport={!!r}
    >
      {r && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* HERO */}
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 12 }}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <ScoreRing score={r.freshnessScore} size={110} label="FRESH" />
                <div style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim, letterSpacing: '0.1em', marginTop: 8 }}>FRESHNESS SCORE</div>
              </div>
            </Card>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, alignContent: 'start' }}>
              <Stat label="TOTAL" value={r.total} color={C.text} />
              <Stat label="MAJOR BEHIND" value={r.outdated.major} color={C.danger} />
              <Stat label="MINOR BEHIND" value={r.outdated.minor} color={C.orange} />
              <Stat label="PATCH BEHIND" value={r.outdated.patch} color={C.gold} />
              <Stat label="UP TO DATE" value={r.current} color={C.success} />
            </div>
          </div>

          {/* DEP TABLE */}
          <Card title="DEPENDENCY STATUS" accent={ACCENT} icon="📦">
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              {(['all', 'major', 'minor', 'patch', 'current'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  style={{ padding: '4px 11px', borderRadius: 4, cursor: 'pointer', fontFamily: FONT.mono, fontSize: 9,
                    background: filter === f ? `${f === 'all' ? ACCENT : GAP_COLOR[f]}1a` : 'transparent',
                    border: `1px solid ${filter === f ? (f === 'all' ? ACCENT : GAP_COLOR[f]) + '66' : 'rgba(255,255,255,0.08)'}`,
                    color: filter === f ? (f === 'all' ? ACCENT : GAP_COLOR[f]) : C.dim }}>
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 520, overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 90px', gap: 10, fontFamily: FONT.mono, fontSize: 8, color: C.dim, letterSpacing: '0.06em', paddingBottom: 4, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span>PACKAGE</span><span style={{ textAlign: 'right' }}>CURRENT</span><span style={{ textAlign: 'right' }}>LATEST</span><span style={{ textAlign: 'right' }}>STATUS</span>
              </div>
              {deps.map(d => (
                <div key={d.name} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 90px', gap: 10, alignItems: 'center', padding: '4px 0' }}>
                  <span style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {d.name}{d.dev && <span style={{ color: C.dim, fontSize: 8 }}> dev</span>}
                  </span>
                  <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.dim, textAlign: 'right' }}>{d.current}</span>
                  <span style={{ fontFamily: FONT.mono, fontSize: 10, color: d.gap === 'current' ? C.success : C.text, textAlign: 'right' }}>{d.latest}</span>
                  <div style={{ textAlign: 'right' }}>
                    <Pill text={d.gap === 'major' && d.behind > 1 ? `${d.behind} MAJOR` : d.gap.toUpperCase()} color={GAP_COLOR[d.gap]} />
                  </div>
                </div>
              ))}
              {deps.length === 0 && <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.dim, padding: 10 }}>No dependencies match this filter.</span>}
            </div>
          </Card>

          <div style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim, textAlign: 'center' }}>{r.meta.note}</div>
        </div>
      )}
    </AnalysisShell>
  )
}
