'use client'

import {
  useRepoAnalysis, AnalysisShell, Card, ScoreRing, Stat, Pill, C, FONT,
} from '@/components/analysis/shell'
import type { PatchTrackingReport } from '@/app/api/github/patch-tracking/route'

const ACCENT = '#FFD700'
const SEV_COLOR: Record<string, string> = { critical: C.danger, high: C.orange, medium: C.gold, low: C.accent }

function fmtDate(d: string) { return new Date(d).toISOString().slice(0, 10) }

export default function PatchTrackingPage() {
  const a = useRepoAnalysis<PatchTrackingReport>('/api/github/patch-tracking')
  const r = a.report

  return (
    <AnalysisShell
      title="Security Patch Tracking" accent={ACCENT} icon="🩹"
      subtitle="Tracks how responsively a project ships security patches — release cadence, security releases and the age of open advisories."
      analyseLabel="TRACK PATCHES"
      user={a.user} repos={a.repos} selectedRepo={a.selectedRepo} setSelectedRepo={a.setSelectedRepo}
      analysing={a.analysing} onAnalyse={a.analyse} error={a.error} hasReport={!!r}
    >
      {r && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* HERO */}
          <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: 12 }}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <ScoreRing score={r.responsivenessScore} size={110} label="RESPONSE" />
                <div style={{ fontFamily: FONT.sans, fontSize: 10, color: C.sub, marginTop: 8, lineHeight: 1.4 }}>{r.patchVelocity}</div>
              </div>
            </Card>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, alignContent: 'start' }}>
              <Stat label="RELEASES" value={r.totalReleases} color={C.text} />
              <Stat label="SECURITY RELEASES" value={r.securityReleases} color={ACCENT} />
              <Stat label="LAST RELEASE" value={r.daysSinceLastRelease !== null ? `${r.daysSinceLastRelease}d` : '—'} color={r.daysSinceLastRelease && r.daysSinceLastRelease > 180 ? C.danger : C.success} />
              <Stat label="MEDIAN GAP" value={r.medianReleaseGapDays !== null ? `${r.medianReleaseGapDays}d` : '—'} color={C.purple} />
              <Stat label="OPEN ADVISORIES" value={r.openAdvisories.length} color={r.openAdvisories.length > 0 ? C.danger : C.success} />
              <Stat label="OLDEST OPEN" value={r.oldestOpenAdvisoryDays !== null ? `${r.oldestOpenAdvisoryDays}d` : '—'} color={C.orange} />
            </div>
          </div>

          {/* OPEN ADVISORIES */}
          {r.openAdvisories.length > 0 && (
            <Card title="OPEN ADVISORIES" accent={C.danger} icon="⚠">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
                {r.openAdvisories.map((adv, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', background: 'rgba(0,0,0,0.22)', borderRadius: 6, borderLeft: `2px solid ${SEV_COLOR[adv.severity] ?? C.dim}` }}>
                    <Pill text={adv.severity.toUpperCase()} color={SEV_COLOR[adv.severity] ?? C.dim} />
                    <code style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.text }}>{adv.package}</code>
                    <span style={{ fontFamily: FONT.sans, fontSize: 10, color: C.dim, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{adv.summary}</span>
                    {adv.hasFix && <Pill text="FIX AVAILABLE" color={C.success} />}
                    <span style={{ fontFamily: FONT.mono, fontSize: 9, color: adv.ageDays > 30 ? C.danger : C.dim }}>{adv.ageDays}d open</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* TIMELINE */}
          <Card title="RELEASE TIMELINE" accent={ACCENT} icon="◈">
            {r.timeline.length === 0 ? (
              <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.dim }}>No published releases found.</span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {r.timeline.map((ev, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', paddingBottom: i === r.timeline.length - 1 ? 0 : 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                      <span style={{ width: 11, height: 11, borderRadius: '50%', background: ev.isSecurity ? C.danger : C.accent, boxShadow: `0 0 6px ${ev.isSecurity ? C.danger : C.accent}` }} />
                      {i < r.timeline.length - 1 && <span style={{ width: 1, flex: 1, minHeight: 22, background: 'rgba(255,255,255,0.1)', marginTop: 2 }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <a href={ev.url} target="_blank" rel="noreferrer" style={{ fontFamily: FONT.mono, fontSize: 11, color: C.text, textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</a>
                        {ev.isSecurity && <Pill text="SECURITY" color={C.danger} />}
                      </div>
                      <span style={{ fontFamily: FONT.mono, fontSize: 8.5, color: C.dim }}>{fmtDate(ev.date)}{ev.tag ? ` · ${ev.tag}` : ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim, textAlign: 'center' }}>{r.meta.note}</div>
        </div>
      )}
    </AnalysisShell>
  )
}
