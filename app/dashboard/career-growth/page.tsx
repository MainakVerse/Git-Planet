'use client'

import {
  useProfileAnalysis, ProfileShell, Card, ScoreRing, Stat, Pill, LineArea, MiniBars, AiSummary, C, FONT,
} from '@/components/analysis/shell'
import type { CareerGrowthReport } from '@/app/api/github/career-growth/route'

const ACCENT = C.purple

export default function CareerGrowthPage() {
  const a = useProfileAnalysis<CareerGrowthReport>('/api/github/career-growth')
  const r = a.report

  return (
    <ProfileShell
      title="Career Growth Graph" accent={ACCENT} icon="📈"
      subtitle="Charts a developer's GitHub trajectory over time — output cadence, star accumulation, language eras and career milestones."
      analyseLabel="CHART GROWTH"
      loginInput={a.loginInput} setLoginInput={a.setLoginInput}
      analysing={a.analysing} onAnalyse={() => a.analyse()} error={a.error} hasReport={!!r}
    >
      {r && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* HERO */}
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 12 }}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <img src={r.avatar} alt={r.login} style={{ width: 48, height: 48, borderRadius: '50%', border: `2px solid ${ACCENT}`, marginBottom: 6 }} />
                <div style={{ fontFamily: FONT.orbitron, fontSize: 13, fontWeight: 700, color: C.text }}>{r.name ?? r.login}</div>
                <div style={{ margin: '10px 0' }}><ScoreRing score={r.growthScore} size={100} label="GROWTH" /></div>
                <Pill text={r.trajectory.toUpperCase()} color={r.trajectoryColor} />
              </div>
            </Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                <Stat label="TENURE" value={`${r.accountAgeYears}y`} color={C.text} />
                <Stat label="TOTAL REPOS" value={r.stats.totalRepos} color={ACCENT} />
                <Stat label="TOTAL STARS" value={r.stats.totalStars.toLocaleString()} color={C.gold} />
                <Stat label="PEAK YEAR" value={r.stats.peakYear} color={C.success} hint={`${r.stats.peakYearRepos} repos`} />
                <Stat label="LANGUAGES" value={r.stats.languagesOverTime} color={C.purple} />
                <Stat label="CURRENT FOCUS" value={r.stats.currentFocus ?? '—'} color={C.orange} />
              </div>
              <Card title="CUMULATIVE STARS" accent={C.gold} icon="★">
                <LineArea points={r.timeline.map(t => t.cumulativeStars)} color={C.gold} height={120}
                  xLabels={r.timeline.map(t => String(t.year))} yKey="max" />
              </Card>
            </div>
          </div>

          <AiSummary text={r.aiSummary} accent={ACCENT} />

          {/* REPOS PER YEAR */}
          <Card title="REPOSITORIES CREATED PER YEAR" accent={ACCENT} icon="◈">
            <MiniBars data={r.timeline.map(t => ({ label: String(t.year).slice(2), count: t.reposCreated }))} color={ACCENT} height={110} />
          </Card>

          {/* LANGUAGE ERAS + MILESTONES */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Card title="LANGUAGE ERAS" accent={C.accent} icon="◈">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {r.languageEras.map(e => {
                  const span = r.timeline.length > 0 ? r.timeline[r.timeline.length - 1].year - r.timeline[0].year : 1
                  const startPct = span > 0 ? ((e.firstYear - r.timeline[0].year) / span) * 100 : 0
                  const widthPct = span > 0 ? ((e.lastYear - e.firstYear) / span) * 100 : 100
                  return (
                    <div key={e.language}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontFamily: FONT.mono, fontSize: 10, color: e.color }}>{e.language}</span>
                        <span style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim }}>{e.firstYear}–{e.lastYear} · {e.repos} repos</span>
                      </div>
                      <div style={{ position: 'relative', height: 6, background: 'rgba(255,255,255,0.04)', borderRadius: 3 }}>
                        <div style={{ position: 'absolute', left: `${startPct}%`, width: `${Math.max(6, widthPct)}%`, height: '100%', background: e.color, borderRadius: 3, boxShadow: `0 0 5px ${e.color}` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
            <Card title="MILESTONES" accent={C.success} icon="◆">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {r.milestones.map((m, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ fontFamily: FONT.orbitron, fontSize: 11, fontWeight: 700, color: ACCENT, flexShrink: 0, width: 40 }}>{m.year}</span>
                    <div>
                      <div style={{ fontFamily: FONT.mono, fontSize: 11, color: C.sub }}>{m.label}</div>
                      <div style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim }}>{m.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}
    </ProfileShell>
  )
}
