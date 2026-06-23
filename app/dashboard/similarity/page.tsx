'use client'

import {
  useRepoAnalysis, AnalysisShell, Card, Pill, Chips, C, FONT,
} from '@/components/analysis/shell'
import type { SimilarityReport } from '@/app/api/github/similarity/route'

const ACCENT = '#ff4466'

export default function SimilarityPage() {
  const a = useRepoAnalysis<SimilarityReport>('/api/github/similarity')
  const r = a.report

  return (
    <AnalysisShell
      title="Repo Similarity Engine" accent={ACCENT} icon="🔍"
      subtitle="Finds the most similar repositories to any project, scored by shared topics, language and description overlap."
      analyseLabel="FIND SIMILAR"
      user={a.user} repos={a.repos} selectedRepo={a.selectedRepo} setSelectedRepo={a.setSelectedRepo}
      analysing={a.analysing} onAnalyse={a.analyse} error={a.error} hasReport={!!r}
    >
      {r && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {r.baseTopics.length > 0 && (
            <Card title="BASE PROFILE" accent={C.purple} icon="◆">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                {r.baseLanguage && <Pill text={r.baseLanguage} color={C.accent} />}
                <Chips items={r.baseTopics.map(t => `#${t}`)} color={C.purple} />
              </div>
            </Card>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {r.similar.map((s, i) => (
              <div key={s.full} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 120px', gap: 12, alignItems: 'center', padding: '11px 13px', background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 9 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: FONT.orbitron, fontSize: 18, fontWeight: 700, color: s.similarity >= 60 ? C.success : s.similarity >= 35 ? C.gold : C.accent }}>{s.similarity}</div>
                  <div style={{ fontFamily: FONT.mono, fontSize: 6.5, color: C.dim }}>% MATCH</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <a href={s.html} target="_blank" rel="noreferrer" style={{ fontFamily: FONT.mono, fontSize: 12, color: C.text, textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                    <span style={{ color: 'rgba(0,229,255,0.35)' }}>{String(i + 1).padStart(2, '0')} </span>{s.full}
                  </a>
                  {s.description && <p style={{ fontFamily: FONT.sans, fontSize: 10.5, color: C.dim, margin: '2px 0 5px', lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.description}</p>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {s.matchReasons.map(m => <Pill key={m} text={m} color={ACCENT} />)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {s.language && <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginBottom: 3 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: s.langColor }} /><span style={{ fontFamily: FONT.mono, fontSize: 9, color: C.dim }}>{s.language}</span></div>}
                  <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.gold }}>★{s.stars.toLocaleString()}</span>
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
