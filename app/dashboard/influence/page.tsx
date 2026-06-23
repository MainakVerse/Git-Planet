'use client'

import {
  useProfileAnalysis, ProfileShell, Card, ScoreRing, Bar, Stat, Pill, AiSummary, C, FONT,
} from '@/components/analysis/shell'
import type { InfluenceReport } from '@/app/api/github/influence/route'

const ACCENT = C.purple

export default function InfluencePage() {
  const a = useProfileAnalysis<InfluenceReport>('/api/github/influence')
  const r = a.report

  return (
    <ProfileShell
      title="Developer Influence" accent={ACCENT} icon="📡"
      subtitle="Measures a developer's reach and gravity in the open-source ecosystem — followers, star gravity, fork reach and signal amplification."
      analyseLabel="MEASURE INFLUENCE"
      loginInput={a.loginInput} setLoginInput={a.setLoginInput}
      analysing={a.analysing} onAnalyse={() => a.analyse()} error={a.error} hasReport={!!r}
    >
      {r && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* HERO */}
          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 12 }}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <img src={r.avatar} alt={r.login} style={{ width: 54, height: 54, borderRadius: '50%', border: `2px solid ${ACCENT}`, marginBottom: 8 }} />
                <div style={{ fontFamily: FONT.orbitron, fontSize: 14, fontWeight: 700, color: C.text }}>{r.name ?? r.login}</div>
                <a href={r.htmlUrl} target="_blank" rel="noreferrer" style={{ fontFamily: FONT.mono, fontSize: 10, color: C.dim, textDecoration: 'none' }}>@{r.login}</a>
                <div style={{ margin: '12px 0' }}><ScoreRing score={r.influence} size={110} /></div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center' }}>
                  <Pill text={r.tier.toUpperCase()} color={r.gradeColor} />
                  <span style={{ fontFamily: FONT.orbitron, fontSize: 16, fontWeight: 700, color: r.gradeColor }}>{r.grade}</span>
                </div>
              </div>
            </Card>
            <Card title="INFLUENCE BREAKDOWN" accent={ACCENT} icon="◈">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {r.components.map(c => (
                  <div key={c.key}>
                    <Bar label={c.label.toUpperCase()} value={c.score} max={c.max} color={c.color} />
                    <div style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim, marginTop: 3 }}>{c.insight}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* STATS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
            <Stat label="FOLLOWERS" value={r.stats.followers.toLocaleString()} color={C.accent} />
            <Stat label="TOTAL STARS" value={r.stats.totalStars.toLocaleString()} color={C.gold} />
            <Stat label="AMPLIFICATION" value={r.stats.amplification} color={C.success} hint="stars/repo" />
            <Stat label="STARS / YEAR" value={r.stats.starsPerYear.toLocaleString()} color={ACCENT} />
            <Stat label="REACH INDEX" value={r.stats.reachIndex} color={C.orange} />
          </div>

          <AiSummary text={r.aiSummary} accent={ACCENT} />

          {/* TOP REPOS */}
          <Card title="MOST INFLUENTIAL REPOS" accent={C.gold} icon="★">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {r.topRepos.map(repo => (
                <a key={repo.name} href={repo.html} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 7, textDecoration: 'none' }}>
                  {repo.lang && <span style={{ width: 8, height: 8, borderRadius: '50%', background: repo.langColor, flexShrink: 0, boxShadow: `0 0 5px ${repo.langColor}` }} />}
                  <span style={{ fontFamily: FONT.mono, fontSize: 11, color: C.sub, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{repo.name}</span>
                  <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.gold }}>★{repo.stars.toLocaleString()}</span>
                  <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.dim }}>⑂{repo.forks}</span>
                </a>
              ))}
            </div>
          </Card>
        </div>
      )}
    </ProfileShell>
  )
}
