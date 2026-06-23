'use client'

import {
  useRepoAnalysis, AnalysisShell, Card, ScoreRing, Stat, Pill, AvatarRow, MiniBars, AiSummary, C, FONT,
} from '@/components/analysis/shell'
import type { BurnoutReport } from '@/app/api/github/burnout/route'

const ACCENT = C.success
const SEV_COLOR = { ok: C.success, watch: C.gold, risk: C.danger }

export default function BurnoutPage() {
  const a = useRepoAnalysis<BurnoutReport>('/api/github/burnout')
  const r = a.report

  return (
    <AnalysisShell
      title="Maintainer Burnout" accent={ACCENT} icon="🔥"
      subtitle="Detects unsustainable maintenance patterns — off-hours work, weekend commits, solo load and declining cadence."
      analyseLabel="DETECT BURNOUT"
      user={a.user} repos={a.repos} selectedRepo={a.selectedRepo} setSelectedRepo={a.setSelectedRepo}
      analysing={a.analysing} onAnalyse={a.analyse} error={a.error} hasReport={!!r}
    >
      {r && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* HERO */}
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 12 }}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <ScoreRing score={r.burnoutRisk} size={120} label="RISK" />
                <div style={{ marginTop: 10 }}><Pill text={r.riskLabel.toUpperCase()} color={r.riskColor} /></div>
              </div>
            </Card>
            <Card title="WARNING SIGNALS" accent={ACCENT} icon="⚠">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {r.signals.map(s => (
                  <div key={s.key} style={{ display: 'grid', gridTemplateColumns: '170px 70px 1fr', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.sub }}>{s.label}</span>
                    <span style={{ fontFamily: FONT.orbitron, fontSize: 12, fontWeight: 700, color: SEV_COLOR[s.severity] }}>{s.value}</span>
                    <span style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim, lineHeight: 1.3 }}>{s.detail}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* STATS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
            <Stat label="SOLO LOAD" value={`${r.soloMaintainerPct}%`} color={r.soloMaintainerPct >= 60 ? C.danger : C.text} />
            <Stat label="OFF-HOURS" value={`${r.offHoursPct}%`} color={r.offHoursPct >= 30 ? C.danger : C.text} />
            <Stat label="WEEKEND" value={`${r.weekendPct}%`} color={r.weekendPct >= 30 ? C.danger : C.text} />
            <Stat label="TREND" value={r.recentTrend.toUpperCase()} color={r.recentTrend === 'declining' ? C.danger : r.recentTrend === 'accelerating' ? C.gold : C.success} />
          </div>

          <AiSummary text={r.aiSummary} accent={ACCENT} />

          {/* CADENCE + HOURS */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
            <Card title="WEEKLY COMMIT CADENCE" accent={ACCENT} icon="◈">
              <MiniBars data={r.cadence.map(c => ({ label: c.week.slice(5), count: c.commits }))} color={ACCENT} height={100} />
            </Card>
            <Card title="COMMIT HOUR (UTC)" accent={C.purple} icon="🕐">
              <HourHistogram hist={r.hourHistogram} />
            </Card>
          </div>

          {/* MAINTAINERS */}
          <Card title="MAINTAINER LOAD" accent={C.orange} icon="◈">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {r.maintainers.map(m => (
                <div key={m.login} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 70px 90px', gap: 10, alignItems: 'center' }}>
                  <AvatarRow avatar={m.avatar} login={m.login} html={m.html} sub={`active ${m.lastActiveDays}d ago`} />
                  <MiniStat v={`${m.sharePct}%`} l="share" c={m.sharePct >= 50 ? C.danger : C.text} />
                  <MiniStat v={`${m.offHoursPct}%`} l="off-hrs" c={m.offHoursPct >= 35 ? C.danger : C.dim} />
                  <MiniStat v={`${m.weekendPct}%`} l="wknd" c={m.weekendPct >= 35 ? C.danger : C.dim} />
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontFamily: FONT.orbitron, fontSize: 13, fontWeight: 700, color: m.burnoutRisk >= 60 ? C.danger : m.burnoutRisk >= 35 ? C.gold : C.success }}>{m.burnoutRisk}</span>
                    <div style={{ fontFamily: FONT.mono, fontSize: 7, color: C.dim }}>risk</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </AnalysisShell>
  )
}

function MiniStat({ v, l, c }: { v: string; l: string; c: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontFamily: FONT.orbitron, fontSize: 11, fontWeight: 700, color: c }}>{v}</div>
      <div style={{ fontFamily: FONT.mono, fontSize: 7, color: C.dim }}>{l}</div>
    </div>
  )
}

function HourHistogram({ hist }: { hist: number[] }) {
  const max = Math.max(1, ...hist)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 90, paddingTop: 6 }}>
      {hist.map((v, h) => {
        const isOff = h < 7 || h >= 22
        return (
          <div key={h} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }} title={`${h}:00 — ${v} commits`}>
            <div style={{ width: '100%', height: `${(v / max) * 100}%`, minHeight: v > 0 ? 2 : 0, background: isOff ? C.danger : C.purple, borderRadius: '1px 1px 0 0', opacity: isOff ? 0.9 : 0.7 }} />
            {h % 6 === 0 && <span style={{ fontFamily: FONT.mono, fontSize: 6, color: C.dim, marginTop: 2 }}>{h}</span>}
          </div>
        )
      })}
    </div>
  )
}
