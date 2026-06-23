'use client'

import {
  useRepoAnalysis, AnalysisShell, Card, Stat, Pill, C, FONT,
} from '@/components/analysis/shell'
import type { DuplicatesReport } from '@/app/api/github/duplicates/route'

const ACCENT = '#ff4466'
const VERDICT_COLOR = { 'likely-duplicate': C.danger, 'strong-overlap': C.orange, related: C.gold }

export default function DuplicatesPage() {
  const a = useRepoAnalysis<DuplicatesReport>('/api/github/duplicates')
  const r = a.report

  return (
    <AnalysisShell
      title="Duplicate Detection" accent={ACCENT} icon="👥"
      subtitle="Finds repositories that overlap heavily with a project — potential duplicates, clones or convergent efforts in the same space."
      analyseLabel="FIND DUPLICATES"
      user={a.user} repos={a.repos} selectedRepo={a.selectedRepo} setSelectedRepo={a.setSelectedRepo}
      analysing={a.analysing} onAnalyse={a.analyse} error={a.error} hasReport={!!r}
    >
      {r && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            <Stat label="LIKELY DUPLICATES" value={r.buckets.likely} color={C.danger} hint="≥65% overlap" />
            <Stat label="STRONG OVERLAP" value={r.buckets.strong} color={C.orange} hint="40-65%" />
            <Stat label="RELATED" value={r.buckets.related} color={C.gold} hint="20-40%" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {r.matches.map(m => (
              <div key={m.full} style={{ display: 'grid', gridTemplateColumns: '64px 1fr 130px', gap: 12, alignItems: 'center', padding: '11px 13px', background: 'rgba(13,17,23,0.8)', border: `1px solid ${VERDICT_COLOR[m.verdict]}33`, borderRadius: 9, borderLeft: `3px solid ${VERDICT_COLOR[m.verdict]}` }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: FONT.orbitron, fontSize: 19, fontWeight: 700, color: VERDICT_COLOR[m.verdict] }}>{m.overlapScore}</div>
                  <div style={{ fontFamily: FONT.mono, fontSize: 6.5, color: C.dim }}>% OVERLAP</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <a href={m.html} target="_blank" rel="noreferrer" style={{ fontFamily: FONT.mono, fontSize: 12, color: C.text, textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{m.full}{m.isFork && <span style={{ color: C.dim, fontSize: 9 }}> ⑂ fork</span>}</a>
                  {m.description && <p style={{ fontFamily: FONT.sans, fontSize: 10.5, color: C.dim, margin: '2px 0 5px', lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.description}</p>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {m.signals.map(s => <Pill key={s} text={s} color={VERDICT_COLOR[m.verdict]} />)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Pill text={m.verdict.replace('-', ' ').toUpperCase()} color={VERDICT_COLOR[m.verdict]} />
                  <div style={{ fontFamily: FONT.mono, fontSize: 9, color: C.gold, marginTop: 4 }}>★{m.stars.toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim, textAlign: 'center' }}>Compared against {r.meta.candidatesScanned} candidate repositories.</div>
        </div>
      )}
    </AnalysisShell>
  )
}
