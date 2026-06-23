'use client'

import { useState } from 'react'
import {
  useQueryAnalysis, QueryShell, Card, Pill, Chips, AiSummary, C, FONT,
} from '@/components/analysis/shell'
import type { TechRadarReport, RadarBlip } from '@/app/api/github/tech-radar/route'

const ACCENT = '#ff4466'

function Quadrant({ blips, onHover }: { blips: RadarBlip[]; onHover: (b: RadarBlip | null) => void }) {
  const w = 600, h = 420, pad = 36
  const x = (m: number) => pad + (m / 100) * (w - pad * 2)
  const y = (m: number) => h - pad - (m / 100) * (h - pad * 2)
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      {/* quadrant fills */}
      <rect x={x(50)} y={y(100)} width={(w - pad * 2) / 2} height={(h - pad * 2) / 2} fill="rgba(0,255,136,0.04)" />
      <rect x={pad} y={y(100)} width={(w - pad * 2) / 2} height={(h - pad * 2) / 2} fill="rgba(255,215,0,0.03)" />
      {/* axes */}
      <line x1={x(50)} y1={pad} x2={x(50)} y2={h - pad} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
      <line x1={pad} y1={y(50)} x2={w - pad} y2={y(50)} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="rgba(255,255,255,0.15)" />
      <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="rgba(255,255,255,0.15)" />
      {/* labels */}
      <text x={w - pad} y={h - pad + 22} fontFamily={FONT.mono} fontSize={9} fill={C.dim} textAnchor="end">MOMENTUM →</text>
      <text x={pad - 26} y={pad + 4} fontFamily={FONT.mono} fontSize={9} fill={C.dim} transform={`rotate(-90 ${pad - 26} ${pad + 4})`} textAnchor="end">MATURITY →</text>
      <text x={x(75)} y={y(95)} fontFamily={FONT.orbitron} fontSize={9} fill="rgba(0,255,136,0.5)" textAnchor="middle">ADOPT</text>
      <text x={x(75)} y={y(20)} fontFamily={FONT.orbitron} fontSize={9} fill="rgba(0,229,255,0.5)" textAnchor="middle">TRIAL</text>
      <text x={x(25)} y={y(20)} fontFamily={FONT.orbitron} fontSize={9} fill="rgba(255,215,0,0.5)" textAnchor="middle">ASSESS</text>
      <text x={x(25)} y={y(95)} fontFamily={FONT.orbitron} fontSize={9} fill="rgba(255,136,0,0.5)" textAnchor="middle">HOLD</text>
      {/* blips */}
      {blips.map((b, i) => (
        <circle key={i} cx={x(b.momentum)} cy={y(b.maturity)} r={5 + Math.min(8, b.starsPerDay)} fill={b.langColor} fillOpacity={0.75} stroke="#050505" strokeWidth={1}
          style={{ cursor: 'pointer' }} onMouseEnter={() => onHover(b)} onMouseLeave={() => onHover(null)} />
      ))}
    </svg>
  )
}

export default function TechRadarPage() {
  const a = useQueryAnalysis<TechRadarReport>('/api/github/tech-radar', 'q', 'ai-agents')
  const r = a.report
  const [hover, setHover] = useState<RadarBlip | null>(null)

  return (
    <QueryShell
      title="Emerging Tech Radar" accent={ACCENT} icon="📡"
      subtitle="Plots fast-rising projects in a domain on a momentum × maturity radar — adopt, trial, assess or hold."
      analyseLabel="SCAN RADAR"
      query={a.query} setQuery={a.setQuery}
      analysing={a.analysing} onAnalyse={() => a.analyse()} error={a.error} hasReport={!!r}
      placeholder="e.g. ai-agents, wasm, vector-database" prefix="📡"
    >
      {r && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <AiSummary text={r.summary} accent={ACCENT} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 12 }}>
            <Card title="MOMENTUM × MATURITY" accent={ACCENT} icon="📡">
              <div style={{ position: 'relative' }}>
                <Quadrant blips={r.blips} onHover={setHover} />
                {hover && (
                  <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(5,8,15,0.97)', border: `1px solid ${hover.langColor}66`, borderRadius: 6, padding: '7px 10px', pointerEvents: 'none', maxWidth: 220 }}>
                    <div style={{ fontFamily: FONT.mono, fontSize: 10, color: C.text }}>{hover.full}</div>
                    <div style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim, marginTop: 2 }}>{hover.stars.toLocaleString()}★ · {hover.starsPerDay}/day · {hover.ageMonths}mo</div>
                  </div>
                )}
              </div>
            </Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Card title="RINGS" accent={ACCENT} icon="◎">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {r.rings.map(ring => (
                    <div key={ring.ring} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: ring.color, flexShrink: 0 }} />
                      <span style={{ fontFamily: FONT.mono, fontSize: 9.5, color: C.sub, flex: 1 }}>{ring.label}</span>
                      <span style={{ fontFamily: FONT.orbitron, fontSize: 11, color: ring.color }}>{ring.count}</span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card title="RISING LANGUAGES" accent={C.purple} icon="◈">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {r.risingLanguages.map(l => (
                    <div key={l.name} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: l.color }} />
                      <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.sub, flex: 1 }}>{l.name}</span>
                      <span style={{ fontFamily: FONT.orbitron, fontSize: 10, color: l.color }}>{l.count}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>

          {/* TOP MOVERS */}
          <Card title="TOP MOVERS" accent={C.success} icon="↗">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {r.blips.slice(0, 10).map(b => (
                <a key={b.full} href={b.html} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 6, textDecoration: 'none' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: b.langColor, flexShrink: 0 }} />
                  <span style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.sub, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.full}</span>
                  <Pill text={b.ring} color={r.rings.find(rr => rr.ring === b.ring)?.color} />
                  <span style={{ fontFamily: FONT.mono, fontSize: 9, color: C.success }}>{b.starsPerDay}/d</span>
                </a>
              ))}
            </div>
          </Card>
        </div>
      )}
    </QueryShell>
  )
}
