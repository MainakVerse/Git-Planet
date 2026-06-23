'use client'

import {
  useRepoAnalysis, AnalysisShell, Card, ScoreRing, Stat, Pill, AvatarRow, AiSummary, C, FONT,
} from '@/components/analysis/shell'
import type { FileOwnershipReport } from '@/app/api/github/file-ownership/route'

const ACCENT = C.purple

export default function FileOwnershipPage() {
  const a = useRepoAnalysis<FileOwnershipReport>('/api/github/file-ownership')
  const r = a.report

  return (
    <AnalysisShell
      title="File Ownership" accent={ACCENT} icon="🗂"
      subtitle="Infers who owns which directories from commit file-change attribution — surfacing knowledge silos and cross-training gaps."
      analyseLabel="MAP OWNERSHIP"
      user={a.user} repos={a.repos} selectedRepo={a.selectedRepo} setSelectedRepo={a.setSelectedRepo}
      analysing={a.analysing} onAnalyse={a.analyse} error={a.error} hasReport={!!r}
    >
      {r && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* HERO */}
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 12 }}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <ScoreRing score={r.knowledgeDistribution} size={120} label="SHARED" />
                <div style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim, letterSpacing: '0.1em', marginTop: 8 }}>KNOWLEDGE DISTRIBUTION</div>
              </div>
            </Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                <Stat label="DIRECTORIES" value={r.directories.length} color={C.text} />
                <Stat label="SILOED" value={r.siloedDirs} color={r.siloedDirs > 0 ? C.danger : C.success} hint="1 owner ≥80%" />
                <Stat label="SHARED" value={r.sharedDirs} color={C.success} />
              </div>
              <Card title="TOP OWNERS" accent={ACCENT} icon="◈">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {r.topOwners.map(o => (
                    <AvatarRow key={o.login} avatar={o.avatar} login={o.login}
                      sub={`${o.dirsOwned} dirs · ${o.totalChanges} changes`}
                      right={<span style={{ fontFamily: FONT.orbitron, fontSize: 12, fontWeight: 700, color: ACCENT }}>{o.dirsOwned}</span>} />
                  ))}
                </div>
              </Card>
            </div>
          </div>

          <AiSummary text={r.aiSummary} accent={ACCENT} />

          {/* DIRECTORY OWNERSHIP */}
          <Card title="DIRECTORY OWNERSHIP MAP" accent={ACCENT} icon="🗂">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {r.directories.map(d => (
                <div key={d.path} style={{ padding: '9px 11px', background: d.isSiloed ? 'rgba(255,68,102,0.05)' : 'rgba(0,0,0,0.2)', border: `1px solid ${d.isSiloed ? 'rgba(255,68,102,0.2)' : 'rgba(255,255,255,0.05)'}`, borderRadius: 7 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontFamily: FONT.mono, fontSize: 11, color: C.sub }}>{d.path}/</span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {d.isSiloed && <Pill text="SILOED" color={C.danger} />}
                      <Pill text={`bus ${d.busFactor}`} color={d.busFactor <= 1 ? C.danger : d.busFactor <= 2 ? C.gold : C.success} />
                      <span style={{ fontFamily: FONT.mono, fontSize: 9, color: C.dim }}>{d.totalChanges} changes</span>
                    </div>
                  </div>
                  {/* ownership bar */}
                  <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'rgba(255,255,255,0.04)' }}>
                    {d.owners.map((o, i) => (
                      <div key={o.login} title={`${o.login}: ${o.sharePct}%`}
                        style={{ width: `${o.sharePct}%`, background: OWNER_COLORS[i % OWNER_COLORS.length], boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.3)' }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                    {d.owners.slice(0, 4).map((o, i) => (
                      <span key={o.login} style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: FONT.mono, fontSize: 8, color: C.dim }}>
                        <span style={{ width: 7, height: 7, borderRadius: 2, background: OWNER_COLORS[i % OWNER_COLORS.length] }} />
                        {o.login} {o.sharePct}%
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim, textAlign: 'center' }}>{r.meta.note}</div>
        </div>
      )}
    </AnalysisShell>
  )
}

const OWNER_COLORS = ['#00E5FF', '#7B61FF', '#00ff88', '#FFD700', '#ff8800', '#ff4466']
