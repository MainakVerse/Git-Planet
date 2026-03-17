'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { DISReport, DISComponent, DomainScore } from '@/app/api/github/dis/route'
import type { ContributionsReport, ContributionDay } from '@/app/api/github/contributions/route'

// ── Constants ────────────────────────────────────────────────────────────────────

const ACCENT  = '#00E5FF'
const SUCCESS = '#00ff88'
const DANGER  = '#ff4466'
const PURPLE  = '#7B61FF'
const GOLD    = '#FFD700'
const ORANGE  = '#ff8800'

// ── SVG Radar Chart ────────────────────────────────────────────────────────────

function RadarChart({ domains }: { domains: DomainScore[] }) {
  const size   = 200
  const cx     = size / 2
  const cy     = size / 2
  const R      = 72
  const n      = domains.length
  const levels = 4

  function angle(i: number) { return (i / n) * 2 * Math.PI - Math.PI / 2 }
  function pt(i: number, r: number) {
    const a = angle(i)
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
  }
  function poly(scores: number[]): string {
    return domains.map((_, i) => {
      const { x, y } = pt(i, (scores[i] / 100) * R)
      return `${x},${y}`
    }).join(' ')
  }

  const gridColors   = ['#ffffff06', '#ffffff0d', '#ffffff15', '#ffffff20']
  const domainColors = [ACCENT, SUCCESS, ORANGE, PURPLE, GOLD]

  const pad = { t: 20, r: 50, b: 20, l: 50 }
  return (
    <svg
      width="100%"
      viewBox={`${-pad.l} ${-pad.t} ${size + pad.l + pad.r} ${size + pad.t + pad.b}`}
      style={{ display: 'block', overflow: 'visible', maxHeight: 220 }}
    >
      {/* Grid rings */}
      {Array.from({ length: levels }, (_, l) => {
        const r = ((l + 1) / levels) * R
        return (
          <polygon
            key={l}
            points={domains.map((_, i) => { const p = pt(i, r); return `${p.x},${p.y}` }).join(' ')}
            fill="none" stroke={gridColors[l]} strokeWidth={1}
          />
        )
      })}

      {/* Axis lines */}
      {domains.map((_, i) => {
        const { x, y } = pt(i, R)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
      })}

      {/* Score polygon fill */}
      <polygon
        points={poly(domains.map(d => d.score))}
        fill={`${ACCENT}1a`}
        stroke={ACCENT}
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* Vertex glow dots */}
      {domains.map((d, i) => {
        const { x, y } = pt(i, (d.score / 100) * R)
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={7} fill={domainColors[i]} opacity={0.12} />
            <circle cx={x} cy={y} r={4} fill={domainColors[i]} />
          </g>
        )
      })}

      {/* Labels */}
      {domains.map((d, i) => {
        const labelR = R + 26
        const { x, y } = pt(i, labelR)
        const anchor = x < cx - 6 ? 'end' : x > cx + 6 ? 'start' : 'middle'
        return (
          <g key={i}>
            <text
              x={x} y={y - 5} textAnchor={anchor}
              fill={domainColors[i]} fontSize={10}
              fontFamily="'Orbitron',monospace" fontWeight={700} letterSpacing="0.1em"
            >
              {d.domain.toUpperCase()}
            </text>
            <text
              x={x} y={y + 9} textAnchor={anchor}
              fill="rgba(201,209,217,0.55)" fontSize={9}
              fontFamily="'JetBrains Mono',monospace"
            >
              {d.score}
            </text>
          </g>
        )
      })}
    </svg>
  )
}


// ── Language Pie Chart ─────────────────────────────────────────────────────────

function LanguagePieChart({ languages }: { languages: { name: string; pct: number; color: string }[] }) {
  const size  = 190
  const cx    = size / 2
  const cy    = size / 2
  const R     = 76
  const inner = 46

  let cumAngle = -Math.PI / 2
  const slices = languages.map(lang => {
    const sweep = (lang.pct / 100) * 2 * Math.PI
    const start = cumAngle
    cumAngle += sweep
    return { ...lang, start, sweep }
  })

  function donutArc(start: number, sweep: number): string {
    const x1o = cx + R     * Math.cos(start)
    const y1o = cy + R     * Math.sin(start)
    const x2o = cx + R     * Math.cos(start + sweep)
    const y2o = cy + R     * Math.sin(start + sweep)
    const x1i = cx + inner * Math.cos(start + sweep)
    const y1i = cy + inner * Math.sin(start + sweep)
    const x2i = cx + inner * Math.cos(start)
    const y2i = cy + inner * Math.sin(start)
    const large = sweep > Math.PI ? 1 : 0
    return `M ${x1o} ${y1o} A ${R} ${R} 0 ${large} 1 ${x2o} ${y2o} L ${x1i} ${y1i} A ${inner} ${inner} 0 ${large} 0 ${x2i} ${y2i} Z`
  }

  return (
    <svg width="100%" viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      {/* Slices */}
      {slices.map((s, i) => {
        const midAngle = s.start + s.sweep / 2
        const labelR = (R + inner) / 2
        const lx = cx + labelR * Math.cos(midAngle)
        const ly = cy + labelR * Math.sin(midAngle)
        return (
          <g key={i}>
            <path d={donutArc(s.start, s.sweep)} fill={s.color} opacity={0.92}
              style={{ filter: `drop-shadow(0 0 4px ${s.color}55)` }} />
            {s.sweep > 0.25 && (
              <text x={lx} y={ly + 4} textAnchor="middle"
                fontFamily="'Orbitron',monospace" fontSize={9} fontWeight={700}
                fill="white" style={{ pointerEvents: 'none' }}>
                {s.pct}%
              </text>
            )}
          </g>
        )
      })}

      {/* Center hole */}
      <circle cx={cx} cy={cy} r={inner - 1} fill="#0d1117" />

      {/* Center labels */}
      {slices.map((s, i) => {
        const lineH = 15
        const totalH = slices.length * lineH
        const y = cy - totalH / 2 + i * lineH + 10
        return (
          <g key={`lbl${i}`}>
            <circle cx={cx - 22} cy={y - 3} r={3.5} fill={s.color}
              style={{ filter: `drop-shadow(0 0 3px ${s.color})` }} />
            <text x={cx - 15} y={y} fontFamily="'JetBrains Mono',monospace"
              fontSize={9} fontWeight={700} fill={s.color}>
              {s.name.length > 10 ? s.name.slice(0, 9) + '…' : s.name}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Contribution Heatmap (GitHub-style) ───────────────────────────────────────

const HEAT_COLORS = [
  'rgba(255,255,255,0.05)',   // 0  — empty
  'rgba(0,255,136,0.18)',     // 1–3
  'rgba(0,255,136,0.40)',     // 4–6
  'rgba(0,255,136,0.68)',     // 7–9
  'rgba(0,255,136,0.92)',     // 10+
]

function heatColor(count: number): string {
  if (count === 0) return HEAT_COLORS[0]
  if (count <= 3)  return HEAT_COLORS[1]
  if (count <= 6)  return HEAT_COLORS[2]
  if (count <= 9)  return HEAT_COLORS[3]
  return HEAT_COLORS[4]
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const CELL = 11; const GAP = 3; const SLOT = CELL + GAP
const LEFT_PAD = 28; const TOP_PAD = 20

function ContributionHeatmap({ data }: { data: ContributionsReport }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; date: string; count: number } | null>(null)

  const gridW = data.weeks.length * SLOT + LEFT_PAD
  const gridH = 7 * SLOT + TOP_PAD + 16   // +16 for month row

  // Month label positions — first day of each month
  const monthLabels: { label: string; x: number }[] = []
  data.weeks.forEach((week, wi) => {
    week.days.forEach(day => {
      if (day.date.slice(8) === '01') {
        const m = parseInt(day.date.slice(5, 7), 10) - 1
        const x = wi * SLOT + LEFT_PAD
        if (!monthLabels.length || monthLabels[monthLabels.length - 1].x < x - 24) {
          monthLabels.push({ label: MONTHS[m], x })
        }
      }
    })
  })

  return (
    <div style={{ position: 'relative', overflowX: 'auto' }}>
      <svg
        width={gridW}
        height={gridH}
        style={{ display: 'block', cursor: 'crosshair' }}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Day-of-week labels */}
        {[1, 3, 5].map(dow => (
          <text
            key={dow}
            x={LEFT_PAD - 4}
            y={TOP_PAD + dow * SLOT + CELL * 0.75}
            textAnchor="end"
            fontSize={7}
            fill="rgba(201,209,217,0.3)"
            fontFamily="'JetBrains Mono',monospace"
          >
            {DAY_LABELS[dow]}
          </text>
        ))}

        {/* Month labels */}
        {monthLabels.map(ml => (
          <text
            key={ml.label + ml.x}
            x={ml.x}
            y={TOP_PAD - 6}
            fontSize={8}
            fill="rgba(201,209,217,0.45)"
            fontFamily="'JetBrains Mono',monospace"
          >
            {ml.label}
          </text>
        ))}

        {/* Cells */}
        {data.weeks.map((week, wi) =>
          week.days.map((day, di) => {
            const cx = wi * SLOT + LEFT_PAD
            const cy = day.weekday * SLOT + TOP_PAD
            const color = heatColor(day.count)
            const isHighlighted = data.bestDay?.date === day.date
            return (
              <rect
                key={day.date}
                x={cx} y={cy}
                width={CELL} height={CELL}
                rx={2}
                fill={color}
                stroke={isHighlighted ? SUCCESS : 'transparent'}
                strokeWidth={isHighlighted ? 1.5 : 0}
                onMouseEnter={e => {
                  const svg = (e.currentTarget as SVGElement).closest('svg')!
                  const rect = svg.getBoundingClientRect()
                  setTooltip({ x: cx + CELL / 2, y: cy - 6, date: day.date, count: day.count })
                }}
              />
            )
          })
        )}

        {/* Tooltip */}
        {tooltip && (() => {
          const label = `${tooltip.count} contribution${tooltip.count !== 1 ? 's' : ''} on ${tooltip.date}`
          const tw = label.length * 5.5 + 16
          const tx = Math.max(LEFT_PAD, Math.min(tooltip.x - tw / 2, gridW - tw - 4))
          const ty = tooltip.y - 22
          return (
            <g>
              <rect x={tx} y={ty} width={tw} height={18} rx={3} fill="rgba(13,17,23,0.95)" stroke="rgba(0,255,136,0.3)" strokeWidth={1} />
              <text x={tx + tw / 2} y={ty + 12} textAnchor="middle" fontSize={8} fill={SUCCESS} fontFamily="'JetBrains Mono',monospace">
                {label}
              </text>
            </g>
          )
        })()}
      </svg>

      {/* Heat legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, justifyContent: 'flex-end' }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7.5, color: 'rgba(201,209,217,0.3)' }}>Less</span>
        {HEAT_COLORS.map((c, i) => (
          <div key={i} style={{ width: CELL, height: CELL, borderRadius: 2, background: c, border: '1px solid rgba(255,255,255,0.04)' }} />
        ))}
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7.5, color: 'rgba(201,209,217,0.3)' }}>More</span>
      </div>
    </div>
  )
}

// ── Belt Badge ────────────────────────────────────────────────────────────────

function BeltBadge({ dis, belt, beltColor, beltEmoji, confidence }: {
  dis: number; belt: string; beltColor: string; beltEmoji: string; confidence: number
}) {
  const r = 72; const stroke = 10
  const circ = 2 * Math.PI * r
  const pct = dis / 100

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, position: 'relative' }}>
      <svg width={180} height={180} viewBox="0 0 180 180">
        {/* Track */}
        <circle cx={90} cy={90} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
        {/* Progress */}
        <circle
          cx={90} cy={90} r={r}
          fill="none"
          stroke={beltColor === '#1a1a2e' ? '#aaaaaa' : beltColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circ * pct} ${circ * (1 - pct)}`}
          transform="rotate(-90 90 90)"
          style={{ filter: `drop-shadow(0 0 8px ${beltColor}88)` }}
        />
        {/* Inner glow */}
        <circle cx={90} cy={90} r={60} fill={`${beltColor}08`} />
        {/* Score */}
        <text x={90} y={84} textAnchor="middle" fontFamily="'Orbitron',monospace" fontSize={36} fontWeight={700} fill={beltColor === '#1a1a2e' ? '#cccccc' : beltColor}
          style={{ filter: `drop-shadow(0 0 12px ${beltColor}88)` }}>
          {dis}
        </text>
        <text x={90} y={100} textAnchor="middle" fontFamily="'Orbitron',monospace" fontSize={9} fill="rgba(201,209,217,0.4)" letterSpacing="0.15em">
          DIS SCORE
        </text>
        {/* Emoji */}
        <text x={90} y={122} textAnchor="middle" fontSize={20}>{beltEmoji}</text>
      </svg>

      <div style={{
        background: beltColor === '#1a1a2e' ? 'rgba(170,170,170,0.1)' : `${beltColor}18`,
        border: `1px solid ${beltColor === '#1a1a2e' ? 'rgba(170,170,170,0.3)' : beltColor + '44'}`,
        borderRadius: 6, padding: '4px 14px',
        fontFamily: "'Orbitron',monospace", fontSize: 9, fontWeight: 700,
        color: beltColor === '#1a1a2e' ? '#cccccc' : beltColor,
        letterSpacing: '0.12em',
      }}>
        {belt.toUpperCase()}
      </div>

      {/* Confidence */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(201,209,217,0.4)' }}>CONFIDENCE</span>
        <div style={{ width: 60, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${confidence}%`, height: '100%', background: confidence > 70 ? SUCCESS : confidence > 40 ? GOLD : DANGER, borderRadius: 2, transition: 'width 1s ease' }} />
        </div>
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 8, color: confidence > 70 ? SUCCESS : confidence > 40 ? GOLD : DANGER }}>{confidence}%</span>
      </div>
    </div>
  )
}

// ── Component Card ─────────────────────────────────────────────────────────────

function ComponentCard({ comp, hovered, onHover }: { comp: DISComponent; hovered: boolean; onHover: (v: boolean) => void }) {
  const pct = (comp.score / comp.max) * 100
  const color = pct >= 75 ? SUCCESS : pct >= 45 ? GOLD : pct >= 25 ? ORANGE : DANGER
  return (
    <div
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{
        background: hovered ? `${color}0a` : 'rgba(13,17,23,0.7)',
        border: `1px solid ${hovered ? color + '44' : 'rgba(255,255,255,0.06)'}`,
        borderRadius: 8, padding: '10px 14px', transition: 'all 0.15s', cursor: 'default',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 8, color: 'rgba(201,209,217,0.7)', letterSpacing: '0.1em' }}>{comp.label.toUpperCase()}</span>
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, fontWeight: 700, color }}>
          {comp.score}<span style={{ fontSize: 7, color: 'rgba(201,209,217,0.3)', marginLeft: 1 }}>/{comp.max}</span>
        </span>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
        <div style={{
          width: `${pct}%`, height: '100%', background: color,
          borderRadius: 2, boxShadow: `0 0 6px ${color}55`, transition: 'width 0.8s ease',
        }} />
      </div>
      {hovered && (
        <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(201,209,217,0.55)', margin: 0, lineHeight: 1.5 }}>
          {comp.insight}
        </p>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: hovered ? 4 : 0 }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'rgba(201,209,217,0.25)' }}>weight {comp.weight}%</span>
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 8, color }}>
          {Math.round(pct)}%
        </span>
      </div>
    </div>
  )
}


// ── Main Page ──────────────────────────────────────────────────────────────────

export default function DeveloperIntelligenceScorePage() {
  const router = useRouter()
  const [user, setUser] = useState<{ login: string; avatar_url: string; name: string | null } | null>(null)
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<DISReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hoveredComp, setHoveredComp] = useState<string | null>(null)
  const [contributions, setContributions] = useState<ContributionsReport | null>(null)
  const [contribLoading, setContribLoading] = useState(false)

  useEffect(() => {
    fetch('/api/github/user', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) { router.push('/'); return }
        setUser(d.user)
      })
      .catch(() => router.push('/'))
  }, [router])

  async function generateDIS() {
    if (!user) return
    setLoading(true)
    setContribLoading(true)
    setReport(null)
    setContributions(null)
    setError(null)
    try {
      // Fetch DIS + contribution calendar in parallel
      const [disRes, contribRes] = await Promise.all([
        fetch(`/api/github/dis?login=${user.login}`, { credentials: 'include' }),
        fetch(`/api/github/contributions?login=${user.login}`, { credentials: 'include' }),
      ])
      const disData = await disRes.json()
      if (!disRes.ok) { setError(disData.error ?? 'Analysis failed'); return }
      setReport(disData)

      if (contribRes.ok) {
        const cData = await contribRes.json()
        setContributions(cData)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
      setContribLoading(false)
    }
  }

  return (
    <div style={{
      height: '100vh', overflow: 'hidden', background: '#050505',
      color: '#c9d1d9', fontFamily: "'JetBrains Mono',monospace",
      display: 'flex', flexDirection: 'column',
    }}>
      <style>{`
        @keyframes spin    { to { transform: rotate(360deg) } }
        @keyframes pulse   { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
        @keyframes floatUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
        ::-webkit-scrollbar { width: 5px; height: 5px }
        ::-webkit-scrollbar-track { background: transparent }
        ::-webkit-scrollbar-thumb { background: rgba(0,229,255,0.15); border-radius: 3px }
        ::-webkit-scrollbar-thumb:hover { background: rgba(0,229,255,0.3) }
      `}</style>

      {/* ── TOPBAR ── */}
      <div style={{
        height: 48, borderBottom: '1px solid rgba(0,229,255,0.08)',
        display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12,
        background: 'rgba(13,17,23,0.95)', flexShrink: 0,
      }}>
        <button
          onClick={() => router.push('/dashboard')}
          style={{
            background: 'transparent', border: '1px solid rgba(0,229,255,0.15)',
            borderRadius: 5, padding: '4px 10px', cursor: 'pointer',
            color: 'rgba(0,229,255,0.6)', fontFamily: "'JetBrains Mono',monospace",
            fontSize: 10, display: 'flex', alignItems: 'center', gap: 5,
          }}
        >
          ← BACK
        </button>

        <div style={{ width: 1, height: 20, background: 'rgba(0,229,255,0.1)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🧠</span>
          <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: PURPLE }}>
            DEVELOPER INTELLIGENCE SCORE
          </span>
        </div>

        {report && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(0,229,255,0.4)' }}>
              {report.meta.reposAnalyzed} repos · {report.meta.eventsAnalyzed} events
            </span>
            <span style={{
              background: `${report.beltColor === '#1a1a2e' ? 'rgba(170,170,170,0.1)' : report.beltColor + '18'}`,
              border: `1px solid ${report.beltColor === '#1a1a2e' ? 'rgba(170,170,170,0.3)' : report.beltColor + '44'}`,
              borderRadius: 4, padding: '3px 10px',
              fontFamily: "'Orbitron',monospace", fontSize: 8, fontWeight: 700,
              color: report.beltColor === '#1a1a2e' ? '#cccccc' : report.beltColor,
              letterSpacing: '0.1em',
            }}>
              {report.beltEmoji} {report.belt.toUpperCase()}
            </span>
          </div>
        )}

        {user && (
          <div style={{ marginLeft: report ? 0 : 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src={user.avatar_url} alt="" width={24} height={24} style={{ borderRadius: '50%', border: `1px solid ${PURPLE}33` }} />
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'rgba(201,209,217,0.6)' }}>{user.login}</span>
          </div>
        )}
      </div>

      {/* ── BODY ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* ── NO REPORT: Landing ── */}
        {!report && !loading && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 32, padding: 40,
          }}>
            {/* Belt preview row */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              {[
                { label: 'White', color: '#e0e0e0', emoji: '🤍' },
                { label: 'Yellow', color: '#FFD700', emoji: '💛' },
                { label: 'Orange', color: '#ff8800', emoji: '🧡' },
                { label: 'Green', color: '#00cc66', emoji: '💚' },
                { label: 'Blue', color: '#0099ff', emoji: '💙' },
                { label: 'Purple', color: '#7B61FF', emoji: '💜' },
                { label: 'Brown', color: '#8B4513', emoji: '🤎' },
                { label: 'Black', color: '#aaaaaa', emoji: '🥋' },
              ].map(b => (
                <div key={b.label} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: b.color === '#e0e0e0' ? 'rgba(224,224,224,0.15)' : `${b.color}22`,
                    border: `2px solid ${b.color}55`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16,
                  }}>
                    {b.emoji}
                  </div>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: b.color, opacity: 0.7 }}>{b.label}</span>
                </div>
              ))}
            </div>

            <div style={{ textAlign: 'center', maxWidth: 520 }}>
              <h1 style={{ fontFamily: "'Orbitron',monospace", fontSize: 22, fontWeight: 700, color: PURPLE, margin: '0 0 12px', letterSpacing: '0.08em' }}>
                Developer Intelligence Score
              </h1>
              <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'rgba(201,209,217,0.55)', lineHeight: 1.7, margin: 0 }}>
                A 0–100 score built from 7 weighted dimensions — Repo Influence, Technical Breadth,
                Consistency, Collaboration, Community Impact, Code Depth, and Domain Expertise.
                Mapped to the Karate Belt system with explainable insights.
              </p>
            </div>

            {/* Dimension pills */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 580 }}>
              {[
                { label: 'Repo Influence', color: ACCENT },
                { label: 'Tech Breadth', color: SUCCESS },
                { label: 'Consistency', color: GOLD },
                { label: 'Collaboration', color: PURPLE },
                { label: 'Community Impact', color: ORANGE },
                { label: 'Code Depth', color: '#ff6b9d' },
                { label: 'Domain Expertise', color: '#00ffcc' },
              ].map(d => (
                <span key={d.label} style={{
                  background: `${d.color}12`, border: `1px solid ${d.color}33`,
                  borderRadius: 4, padding: '4px 10px',
                  fontFamily: "'Orbitron',monospace", fontSize: 7.5,
                  color: d.color, letterSpacing: '0.08em',
                }}>
                  {d.label.toUpperCase()}
                </span>
              ))}
            </div>

            <button
              onClick={generateDIS}
              style={{
                background: `${PURPLE}22`, border: `1px solid ${PURPLE}66`,
                borderRadius: 8, padding: '12px 32px', cursor: 'pointer',
                color: PURPLE, fontFamily: "'Orbitron',monospace", fontSize: 11,
                fontWeight: 700, letterSpacing: '0.12em',
                boxShadow: `0 0 24px ${PURPLE}22`, transition: 'all 0.2s',
              }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLButtonElement; el.style.background = `${PURPLE}33`; el.style.boxShadow = `0 0 32px ${PURPLE}44` }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLButtonElement; el.style.background = `${PURPLE}22`; el.style.boxShadow = `0 0 24px ${PURPLE}22` }}
            >
              🧠 ANALYZE MY PROFILE
            </button>
          </div>
        )}

        {/* ── LOADING ── */}
        {loading && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            <div style={{
              width: 64, height: 64, border: `3px solid ${PURPLE}22`,
              borderTopColor: PURPLE, borderRadius: '50%',
              animation: 'spin 0.9s linear infinite',
            }} />
            <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, color: PURPLE, letterSpacing: '0.15em', animation: 'pulse 1.8s ease infinite' }}>
              COMPUTING INTELLIGENCE SCORE…
            </div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'rgba(201,209,217,0.35)' }}>
              Analysing repos · events · PRs · community signal
            </div>
          </div>
        )}

        {/* ── ERROR ── */}
        {error && !loading && (
          <div style={{ padding: '20px 24px' }}>
            <div style={{
              background: `${DANGER}08`, border: `1px solid ${DANGER}33`,
              borderRadius: 8, padding: '12px 16px',
              fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: DANGER,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>⚠</span> {error}
              <button onClick={generateDIS} style={{ marginLeft: 'auto', background: `${DANGER}18`, border: `1px solid ${DANGER}44`, borderRadius: 4, padding: '3px 10px', cursor: 'pointer', color: DANGER, fontFamily: "'Orbitron',monospace", fontSize: 8 }}>RETRY</button>
            </div>
          </div>
        )}

        {/* ── REPORT ── */}
        {report && !loading && (
          <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14, animation: 'floatUp 0.4s ease' }}>

            {/* ── ROW 1: Bento — Hero | Radar | Stats+Langs ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 1fr 230px', gap: 10 }}>

              {/* Col 1 — Belt Hero */}
              <div style={{
                background: 'rgba(13,17,23,0.9)', border: `1px solid ${PURPLE}22`,
                borderRadius: 10, padding: '16px 18px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                flexShrink: 0, width: 200,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                  <img src={report.avatar} alt="" width={36} height={36} style={{ borderRadius: '50%', border: `2px solid ${PURPLE}44`, flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 12, fontWeight: 700, color: '#e6edf3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{report.name ?? report.login}</div>
                    <a href={report.htmlUrl} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: PURPLE + '99', textDecoration: 'none' }}>@{report.login}</a>
                  </div>
                </div>

                <BeltBadge dis={report.dis} belt={report.belt} beltColor={report.beltColor} beltEmoji={report.beltEmoji} confidence={report.confidence} />

                {report.bio && (
                  <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'rgba(201,209,217,0.4)', textAlign: 'justify', margin: 0, lineHeight: 1.6, width: '100%' }}>
                    {report.bio}
                  </p>
                )}
                {(report.location || report.company) && (
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'rgba(201,209,217,0.35)', textAlign: 'center' }}>
                    {[report.company, report.location].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>

              {/* Col 2 — Domain Radar */}
              <div style={{
                background: 'rgba(13,17,23,0.9)', border: '1px solid rgba(0,229,255,0.08)',
                borderRadius: 10, padding: '12px 20px 12px 20px',
                display: 'flex', flexDirection: 'column', gap: 8,
                overflow: 'visible',
              }}>
                <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 8, color: 'rgba(0,229,255,0.5)', letterSpacing: '0.1em' }}>DOMAIN EXPERTISE RADAR</div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', maxHeight: 240 }}>
                  <RadarChart domains={report.domains} />
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 6 }}>
                  {report.domains.map((d, i) => {
                    const colors = [ACCENT, SUCCESS, ORANGE, PURPLE, GOLD]
                    return (
                      <div key={d.domain} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: colors[i], boxShadow: `0 0 3px ${colors[i]}88` }} />
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7.5, color: 'rgba(201,209,217,0.5)' }}>{d.domain} <span style={{ color: colors[i] }}>({d.repos})</span></span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Col 3 — AI Account Summary */}
              <div style={{
                background: 'rgba(13,17,23,0.9)', border: `1px solid ${PURPLE}22`,
                borderRadius: 10, padding: '16px 18px',
                display: 'flex', flexDirection: 'column', gap: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>🤖</span>
                  <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 8, color: `${PURPLE}cc`, letterSpacing: '0.1em' }}>AI ACCOUNT SUMMARY</span>
                  <span style={{
                    marginLeft: 'auto', background: `${PURPLE}18`, border: `1px solid ${PURPLE}33`,
                    borderRadius: 3, padding: '2px 7px',
                    fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: `${PURPLE}99`,
                  }}>claude haiku</span>
                </div>

                <div style={{
                  flex: 1,
                  borderLeft: `2px solid ${PURPLE}33`,
                  paddingLeft: 12,
                }}>
                  <p style={{
                    fontFamily: "'JetBrains Mono',monospace", fontSize: 11,
                    color: 'rgba(201,209,217,0.75)', lineHeight: 1.8,
                    margin: 0, textAlign: 'justify',
                  }}>
                    {report.aiSummary}
                  </p>
                </div>

                <div style={{
                  borderTop: `1px solid rgba(255,255,255,0.05)`, paddingTop: 10,
                  display: 'flex', flexWrap: 'wrap', gap: 6,
                }}>
                  {report.dominantDomains.map(d => (
                    <span key={d} style={{
                      background: `${PURPLE}14`, border: `1px solid ${PURPLE}30`,
                      borderRadius: 4, padding: '3px 9px',
                      fontFamily: "'Orbitron',monospace", fontSize: 7.5, color: `${PURPLE}cc`, letterSpacing: '0.08em',
                    }}>{d.toUpperCase()}</span>
                  ))}
                  <span style={{
                    background: `${ACCENT}10`, border: `1px solid ${ACCENT}28`,
                    borderRadius: 4, padding: '3px 9px',
                    fontFamily: "'Orbitron',monospace", fontSize: 7.5, color: `${ACCENT}99`, letterSpacing: '0.08em',
                  }}>{report.belt.toUpperCase()}</span>
                </div>
              </div>

              {/* Col 4 — Language Pie + Stats */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                {/* Top Languages Pie */}
                <div style={{
                  background: 'rgba(13,17,23,0.9)', border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 8, color: 'rgba(0,229,255,0.5)', letterSpacing: '0.1em' }}>TOP LANGUAGES</div>
                  <LanguagePieChart languages={report.stats.topLanguages} />
                </div>

                {/* User Stats */}
                <div style={{
                  background: 'rgba(13,17,23,0.9)', border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 7, flex: 1,
                }}>
                  <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 8, color: 'rgba(0,229,255,0.5)', letterSpacing: '0.1em' }}>STATS</div>
                  {[
                    { label: 'Total Stars',  value: report.stats.totalStars.toLocaleString(),   color: GOLD,    icon: '★' },
                    { label: 'Commits',      value: report.stats.totalCommits.toLocaleString(), color: ACCENT,  icon: '⬡' },
                    { label: 'Total PRs',    value: report.stats.totalPRs.toLocaleString(),     color: PURPLE,  icon: '⤴' },
                    { label: 'Merged PRs',   value: report.stats.mergedPRs.toLocaleString(),    color: SUCCESS, icon: '✓' },
                    { label: 'Code Reviews', value: report.stats.codeReviews.toLocaleString(),  color: ORANGE,  icon: '◎' },
                    { label: 'Total Gists',  value: report.stats.totalGists.toLocaleString(),   color: DANGER,  icon: '{}' },
                  ].map(stat => (
                    <div key={stat.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: stat.color, width: 16, textAlign: 'center', flexShrink: 0 }}>{stat.icon}</span>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'rgba(201,209,217,0.55)', flex: 1 }}>{stat.label}</span>
                      <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 12, fontWeight: 700, color: stat.color }}>{stat.value}</span>
                    </div>
                  ))}
                </div>

              </div>
            </div>

            {/* ── ROW 2: Component Breakdown ── */}
            <div style={{
              background: 'rgba(13,17,23,0.9)', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 10, padding: '14px 18px',
            }}>
              <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, color: 'rgba(0,229,255,0.5)', letterSpacing: '0.12em', marginBottom: 10 }}>SCORE BREAKDOWN — hover for details</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
                {report.components.map(comp => (
                  <ComponentCard
                    key={comp.key}
                    comp={comp}
                    hovered={hoveredComp === comp.key}
                    onHover={v => setHoveredComp(v ? comp.key : null)}
                  />
                ))}
              </div>
            </div>

            {/* ── ROW 3: Heatmap + Insights ── */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>

              {/* Heatmap */}
              {contributions && (
                <div style={{
                  background: 'rgba(13,17,23,0.9)', border: '1px solid rgba(0,255,136,0.1)',
                  borderRadius: 10, padding: '16px 20px', flex: 2, minWidth: 300, overflow: 'hidden',
                }}>
                  {/* Header row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, color: 'rgba(0,255,136,0.6)', letterSpacing: '0.12em' }}>
                        CONTRIBUTION ACTIVITY — last 12 months
                      </div>
                      <span style={{
                        background: 'rgba(0,255,136,0.12)', border: '1px solid rgba(0,255,136,0.25)',
                        borderRadius: 4, padding: '2px 8px',
                        fontFamily: "'Orbitron',monospace", fontSize: 8, color: SUCCESS,
                      }}>
                        {contributions.totalContributions.toLocaleString()} total
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 16 }}>
                      {[
                        { label: 'Current Streak', value: `${contributions.currentStreak}d`, color: ACCENT },
                        { label: 'Longest Streak', value: `${contributions.longestStreak}d`, color: GOLD },
                        { label: 'Best Day', value: contributions.bestDay ? `${contributions.bestDay.count} on ${contributions.bestDay.date.slice(5)}` : '—', color: SUCCESS },
                      ].map(s => (
                        <div key={s.label} style={{ textAlign: 'right' }}>
                          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7.5, color: 'rgba(201,209,217,0.35)', marginBottom: 2 }}>{s.label}</div>
                          <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, fontWeight: 700, color: s.color }}>{s.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <ContributionHeatmap data={contributions} />
                </div>
              )}

              {/* Insights */}
              <div style={{
                background: 'rgba(13,17,23,0.9)', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 10, padding: '14px 18px', flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 12,
              }}>
                <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, color: 'rgba(0,229,255,0.5)', letterSpacing: '0.12em' }}>INSIGHTS</div>

                {/* Strengths */}
                <div>
                  <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 8, color: SUCCESS, letterSpacing: '0.1em', marginBottom: 6 }}>✦ STRENGTHS</div>
                  {report.strengths.map((s, i) => (
                    <div key={i} style={{
                      fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(201,209,217,0.6)',
                      lineHeight: 1.55, marginBottom: 4, paddingLeft: 10, borderLeft: `2px solid ${SUCCESS}44`,
                    }}>
                      {s}
                    </div>
                  ))}
                </div>

                {/* Weaknesses */}
                <div>
                  <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 8, color: ORANGE, letterSpacing: '0.1em', marginBottom: 6 }}>⚑ AREAS TO GROW</div>
                  {report.weaknesses.map((w, i) => (
                    <div key={i} style={{
                      fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(201,209,217,0.6)',
                      lineHeight: 1.55, marginBottom: 4, paddingLeft: 10, borderLeft: `2px solid ${ORANGE}44`,
                    }}>
                      {w}
                    </div>
                  ))}
                </div>

                {/* Highlights */}
                {report.highlights.length > 0 && (
                  <div>
                    <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 8, color: GOLD, letterSpacing: '0.1em', marginBottom: 6 }}>★ NOTABLE CONTRIBUTIONS</div>
                    {report.highlights.map((h, i) => (
                      <div key={i} style={{
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(201,209,217,0.6)',
                        lineHeight: 1.55, marginBottom: 4, paddingLeft: 10, borderLeft: `2px solid ${GOLD}44`,
                      }}>
                        {h}
                      </div>
                    ))}
                  </div>
                )}

                {/* Dominant domains */}
                {report.dominantDomains.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    {report.dominantDomains.map(d => (
                      <span key={d} style={{
                        background: `${PURPLE}18`, border: `1px solid ${PURPLE}33`,
                        borderRadius: 4, padding: '3px 8px',
                        fontFamily: "'Orbitron',monospace", fontSize: 7.5, color: PURPLE, letterSpacing: '0.08em',
                      }}>
                        {d.toUpperCase()}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── ROW 4: Regenerate + meta ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(201,209,217,0.25)' }}>
                Generated {new Date(report.meta.generatedAt).toLocaleString()} · {report.meta.reposAnalyzed} repos analysed
              </span>
              <button
                onClick={generateDIS}
                style={{
                  background: `${PURPLE}12`, border: `1px solid ${PURPLE}33`,
                  borderRadius: 5, padding: '5px 14px', cursor: 'pointer',
                  color: PURPLE, fontFamily: "'Orbitron',monospace", fontSize: 8, letterSpacing: '0.08em',
                }}
              >
                ↺ RE-ANALYSE
              </button>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
