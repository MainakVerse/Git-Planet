'use client'

import {
  useQueryAnalysis, QueryShell, Card, Pill, C, FONT,
} from '@/components/analysis/shell'
import type { UnderratedReport } from '@/app/api/github/underrated/route'

const ACCENT = '#ff4466'

export default function UnderratedPage() {
  const a = useQueryAnalysis<UnderratedReport>('/api/github/underrated', 'q', 'rust')
  const r = a.report

  return (
    <QueryShell
      title="Underrated Repo Finder" accent={ACCENT} icon="💎"
      subtitle="Surfaces hidden-gem repositories — high quality and momentum but still flying under the radar. Search by topic or language."
      analyseLabel="FIND GEMS"
      query={a.query} setQuery={a.setQuery}
      analysing={a.analysing} onAnalyse={() => a.analyse()} error={a.error} hasReport={!!r}
      placeholder="e.g. rust, web-scraping, llm" prefix="💎"
    >
      {r && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontFamily: FONT.mono, fontSize: 9, color: C.dim }}>
            {r.repos.length} gems from {r.meta.candidatesScanned} candidates · query <code style={{ color: ACCENT }}>{r.resolvedQuery}</code>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {r.repos.map((repo, i) => (
              <Card key={repo.full}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flexShrink: 0, textAlign: 'center', width: 44 }}>
                    <div style={{ fontFamily: FONT.orbitron, fontSize: 20, fontWeight: 700, color: repo.underratedScore >= 70 ? C.success : repo.underratedScore >= 50 ? C.gold : C.accent }}>{repo.underratedScore}</div>
                    <div style={{ fontFamily: FONT.mono, fontSize: 6.5, color: C.dim }}>GEM SCORE</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <a href={repo.html} target="_blank" rel="noreferrer" style={{ fontFamily: FONT.mono, fontSize: 12, color: C.text, textDecoration: 'none', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                      <span style={{ color: 'rgba(0,229,255,0.35)' }}>{String(i + 1).padStart(2, '0')} </span>{repo.full}
                    </a>
                    {repo.description && <p style={{ fontFamily: FONT.sans, fontSize: 10.5, color: C.dim, margin: '3px 0 6px', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{repo.description}</p>}
                    <div style={{ display: 'flex', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                      {repo.language && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: FONT.mono, fontSize: 9, color: C.dim }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: repo.langColor }} />{repo.language}</span>}
                      <span style={{ fontFamily: FONT.mono, fontSize: 9, color: C.gold }}>★{repo.stars.toLocaleString()}</span>
                      <span style={{ fontFamily: FONT.mono, fontSize: 9, color: C.dim }}>⑂{repo.forks}</span>
                      <span style={{ fontFamily: FONT.mono, fontSize: 9, color: repo.updatedDays <= 14 ? C.success : C.dim }}>↻ {repo.updatedDays}d</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {repo.reasons.slice(0, 3).map(rs => <Pill key={rs} text={rs} color={C.success} />)}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </QueryShell>
  )
}
