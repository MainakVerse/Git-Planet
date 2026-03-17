'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { StyleFingerprintReport, StyleDimension, CodeSnippet } from '@/app/api/github/style-fingerprint/route'

// ── Palette ───────────────────────────────────────────────────────────────────

const ACCENT  = '#00E5FF'
const PURPLE  = '#7B61FF'
const GREEN   = '#00ff88'
const GOLD    = '#FFD700'
const RED     = '#ff4466'
const ORANGE  = '#ff8800'
const PINK    = '#f472b6'
const VIOLET  = '#a855f7'

// ── Types ─────────────────────────────────────────────────────────────────────

interface GithubUser  { login: string; name: string | null; avatar_url: string }
interface GithubRepo  {
  id: number; name: string; description: string | null
  language: string | null; stargazers_count: number; html_url: string
}

// ── Fingerprint SVG ───────────────────────────────────────────────────────────

function FingerprintSVG({ dimensions, size = 220 }: { dimensions: StyleDimension[]; size?: number }) {
  const cx = size / 2, cy = size / 2
  const R  = size * 0.38
  const n  = dimensions.length
  const levels = 5

  function angle(i: number) { return (i / n) * 2 * Math.PI - Math.PI / 2 }
  function pt(i: number, r: number) {
    const a = angle(i)
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
  }

  // Build the score polygon path
  const scorePts = dimensions.map((d, i) => {
    const { x, y } = pt(i, (d.score / 100) * R)
    return `${x},${y}`
  }).join(' ')

  // Secondary polygon at 50% for reference
  const midPts = dimensions.map((_, i) => {
    const { x, y } = pt(i, R * 0.5)
    return `${x},${y}`
  }).join(' ')

  // Build concentric ring polygons for grid
  const gridRings = Array.from({ length: levels }, (_, l) => {
    const r = ((l + 1) / levels) * R
    return dimensions.map((_, i) => {
      const { x, y } = pt(i, r)
      return `${x},${y}`
    }).join(' ')
  })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
      {/* Outer glow */}
      <defs>
        <radialGradient id="fpGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={ACCENT} stopOpacity={0.08} />
          <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
        </radialGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <circle cx={cx} cy={cy} r={R + 10} fill="url(#fpGlow)" />

      {/* Grid rings */}
      {gridRings.map((pts, l) => (
        <polygon key={l} points={pts} fill="none"
          stroke={`rgba(0,229,255,${0.04 + l * 0.03})`} strokeWidth={1} />
      ))}

      {/* Axis lines */}
      {dimensions.map((_, i) => {
        const { x, y } = pt(i, R)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
      })}

      {/* Mid reference */}
      <polygon points={midPts} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={1} strokeDasharray="3 3" />

      {/* Score area fill */}
      <polygon points={scorePts} fill={`${ACCENT}14`} stroke="none" />

      {/* Score border with glow */}
      <polygon points={scorePts} fill="none" stroke={ACCENT} strokeWidth={2}
        strokeLinejoin="round" filter="url(#glow)" />

      {/* Vertex dots */}
      {dimensions.map((d, i) => {
        const { x, y } = pt(i, (d.score / 100) * R)
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={6} fill={d.color} opacity={0.15} />
            <circle cx={x} cy={y} r={3.5} fill={d.color} filter="url(#glow)" />
          </g>
        )
      })}

      {/* Axis labels */}
      {dimensions.map((d, i) => {
        const { x, y } = pt(i, R + 22)
        const anchor = x < cx - 8 ? 'end' : x > cx + 8 ? 'start' : 'middle'
        return (
          <text key={i} x={x} y={y} textAnchor={anchor}
            fill={d.color} fontSize={8.5}
            fontFamily="'Orbitron',monospace" fontWeight={700} letterSpacing="0.08em">
            {d.label.toUpperCase().split(' ')[0]}
          </text>
        )
      })}
    </svg>
  )
}

// ── Consistency Ring ──────────────────────────────────────────────────────────

function ConsistencyRing({ score, size = 80 }: { score: number; size?: number }) {
  const r    = (size / 2) - 8
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  const color = score > 80 ? GREEN : score > 60 ? GOLD : ORANGE

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={5} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'stroke-dasharray 0.9s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: size === 80 ? 18 : 14, fontWeight: 700, color, lineHeight: 1 }}>{score}</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em' }}>/ 100</span>
      </div>
    </div>
  )
}

// ── Score Bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ score, color, height = 4 }: { score: number; color: string; height?: number }) {
  return (
    <div style={{ height, background: 'rgba(255,255,255,0.05)', borderRadius: height, overflow: 'hidden', width: '100%' }}>
      <div style={{
        height: '100%', width: `${score}%`, background: color, borderRadius: height,
        boxShadow: `0 0 6px ${color}60`, transition: 'width 0.9s ease',
      }} />
    </div>
  )
}

// ── Tag chip ──────────────────────────────────────────────────────────────────

function TagChip({ label, positive }: { label: string; positive: boolean }) {
  const color = positive ? GREEN : RED
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px',
      borderRadius: 20, background: `${color}12`, border: `1px solid ${color}40`,
      fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color,
    }}>
      <span style={{ opacity: 0.6 }}>{positive ? '↑' : '↓'}</span>
      {label}
    </span>
  )
}

// ── Section card ──────────────────────────────────────────────────────────────

function Card({ title, accent, icon, children, style: extra }: {
  title: string; accent: string; icon: string; children: React.ReactNode; style?: React.CSSProperties
}) {
  return (
    <div style={{
      background: 'rgba(13,17,23,0.82)', border: `1px solid ${accent}18`, borderRadius: 10,
      overflow: 'hidden', display: 'flex', flexDirection: 'column', ...extra,
    }}>
      <div style={{ padding: '9px 14px', borderBottom: `1px solid ${accent}14`, display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
        <span style={{ fontSize: 12 }}>{icon}</span>
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', color: accent }}>{title}</span>
      </div>
      <div style={{ padding: '12px 14px', flex: 1 }}>{children}</div>
    </div>
  )
}

// ── Metric row ────────────────────────────────────────────────────────────────

function MetricRow({ label, value, color = '#e6edf3' }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590' }}>{label}</span>
      <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, fontWeight: 700, color }}>{value}</span>
    </div>
  )
}

// ── Code snippet viewer ───────────────────────────────────────────────────────

function SnippetPanel({ snippet, onClose }: { snippet: CodeSnippet; onClose: () => void }) {
  const filename = snippet.path.split('/').pop() ?? snippet.path
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div style={{
        background: '#0d1117', border: `1px solid ${ACCENT}30`, borderRadius: 10, maxWidth: 640, width: '90vw',
        maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${ACCENT}14`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, color: ACCENT, letterSpacing: '0.1em' }}>{snippet.label.toUpperCase()}</span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590', marginLeft: 10 }}>{filename}:{snippet.lineStart}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#7d8590', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '14px 16px', overflow: 'auto', flex: 1 }}>
          <pre style={{
            fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#c9d1d9',
            margin: 0, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>{snippet.code}</pre>
        </div>
      </div>
    </div>
  )
}

// ── Dimension card ────────────────────────────────────────────────────────────

function DimensionCard({ dim, onSnippet }: { dim: StyleDimension; onSnippet: (s: CodeSnippet) => void }) {
  return (
    <div style={{
      background: 'rgba(13,17,23,0.6)', border: `1px solid ${dim.color}20`, borderRadius: 8,
      padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', color: dim.color }}>{dim.label.toUpperCase()}</span>
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 13, fontWeight: 700, color: dim.color, lineHeight: 1 }}>{dim.score}</span>
      </div>
      <ScoreBar score={dim.score} color={dim.color} />
      <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: '#7d8590', margin: 0, lineHeight: 1.5 }}>{dim.insight}</p>
      {dim.snippets.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
          {dim.snippets.map((s, i) => (
            <button key={i} onClick={() => onSnippet(s)} style={{
              background: `${dim.color}10`, border: `1px solid ${dim.color}30`, borderRadius: 4,
              fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: dim.color,
              padding: '2px 7px', cursor: 'pointer',
            }}>
              {s.path.split('/').pop()}:{s.lineStart}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Archetype card ────────────────────────────────────────────────────────────

function ArchetypeCard({ name, icon, similarity, description, isPrimary = false }: {
  name: string; icon: string; similarity: number; description: string; isPrimary?: boolean
}) {
  const color = isPrimary ? ACCENT : PURPLE
  return (
    <div style={{
      background: isPrimary ? `${ACCENT}08` : 'rgba(13,17,23,0.5)',
      border: `1px solid ${color}${isPrimary ? '35' : '20'}`,
      borderRadius: 8, padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'flex-start',
    }}>
      <span style={{ fontSize: isPrimary ? 22 : 16, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontFamily: "'Orbitron',monospace", fontSize: isPrimary ? 10 : 9, fontWeight: 700, color }}>{name}</span>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color }}>{similarity}% match</span>
        </div>
        {isPrimary && <ScoreBar score={similarity} color={color} height={3} />}
        <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 9.5, color: '#7d8590', margin: isPrimary ? '6px 0 0' : '3px 0 0', lineHeight: 1.5 }}>{description}</p>
      </div>
    </div>
  )
}

// ── Radar (bar chart variant) ─────────────────────────────────────────────────

function RadarBarChart({ dimensions }: { dimensions: StyleDimension[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {dimensions.map(d => (
        <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: d.color, width: 88, flexShrink: 0 }}>{d.label}</span>
          <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${d.score}%`, background: d.color, borderRadius: 3, boxShadow: `0 0 6px ${d.color}60`, transition: 'width 0.9s ease' }} />
          </div>
          <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, fontWeight: 700, color: d.color, width: 26, textAlign: 'right', flexShrink: 0 }}>{d.score}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function StyleFingerprintPage() {
  const router = useRouter()
  const [user,         setUser]         = useState<GithubUser | null>(null)
  const [repos,        setRepos]        = useState<GithubRepo[]>([])
  const [loading,      setLoading]      = useState(true)
  const [selectedRepo, setSelectedRepo] = useState<GithubRepo | null>(null)
  const [analysing,    setAnalysing]    = useState(false)
  const [report,       setReport]       = useState<StyleFingerprintReport | null>(null)
  const [error,        setError]        = useState<string | null>(null)
  const [activeSnippet, setActiveSnippet] = useState<CodeSnippet | null>(null)
  const [activeTab,    setActiveTab]    = useState<'radar' | 'bars'>('radar')

  // Auth + user data
  useEffect(() => {
    ;(async () => {
      const authRes = await fetch('/api/auth/github')
      if (!authRes.ok) { router.push('/'); return }
      const userRes = await fetch('/api/github/user')
      if (!userRes.ok) { router.push('/'); return }
      const { user: u, repos: r } = await userRes.json()
      setUser(u); setRepos(r.filter((x: GithubRepo) => !('fork' in x && (x as { fork: boolean }).fork)))
      setLoading(false)
    })()
  }, [router])

  async function runAnalysis() {
    if (!selectedRepo || !user) return
    setAnalysing(true); setReport(null); setError(null)
    try {
      const res = await fetch(`/api/github/style-fingerprint?owner=${user.login}&repo=${selectedRepo.name}`)
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Analysis failed'); return }
      setReport(await res.json())
    } catch { setError('Network error — please retry.') }
    finally { setAnalysing(false) }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#010409', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: `2px solid ${ACCENT}30`, borderTop: `2px solid ${ACCENT}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#7d8590' }}>Loading profile…</span>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  // ── Layout ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#010409', color: '#e6edf3', fontFamily: "'Space Grotesk',sans-serif" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0,229,255,0.2); border-radius: 2px; }
      `}</style>

      {activeSnippet && <SnippetPanel snippet={activeSnippet} onClose={() => setActiveSnippet(null)} />}

      {/* ── Nav bar ────────────────────────────────────────────────────────── */}
      <nav style={{ height: 52, borderBottom: '1px solid rgba(0,229,255,0.08)', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 12, position: 'sticky', top: 0, zIndex: 50, background: 'rgba(1,4,9,0.92)', backdropFilter: 'blur(12px)' }}>
        <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 'none', color: '#7d8590', cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
          ← DASHBOARD
        </button>
        <span style={{ color: 'rgba(255,255,255,0.1)' }}>|</span>
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: ACCENT }}>CODING STYLE FINGERPRINT</span>
        <div style={{ flex: 1 }} />
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <img src={user.avatar_url} alt="" width={22} height={22} style={{ borderRadius: '50%', border: `1px solid ${ACCENT}30` }} />
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590' }}>{user.login}</span>
          </div>
        )}
      </nav>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 20px' }}>

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: "'Orbitron',monospace", fontSize: 22, fontWeight: 900, letterSpacing: '0.08em', color: '#e6edf3', margin: '0 0 6px' }}>
            CODING STYLE <span style={{ color: ACCENT }}>FINGERPRINT</span>
          </h1>
          <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: '#7d8590', margin: 0 }}>
            AST-powered style analysis · naming conventions · async patterns · function design · 8-dimension radar
          </p>
        </div>

        {/* ── Repo selector ─────────────────────────────────────────────────── */}
        <div style={{ background: 'rgba(13,17,23,0.8)', border: `1px solid ${ACCENT}18`, borderRadius: 10, padding: '16px 18px', marginBottom: 24, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={{ fontFamily: "'Orbitron',monospace", fontSize: 8.5, color: ACCENT, letterSpacing: '0.12em', display: 'block', marginBottom: 7 }}>SELECT REPOSITORY</label>
            <select
              value={selectedRepo?.name ?? ''}
              onChange={e => {
                const r = repos.find(x => x.name === e.target.value) ?? null
                setSelectedRepo(r); setReport(null); setError(null)
              }}
              style={{
                width: '100%', background: 'rgba(0,0,0,0.4)', border: `1px solid ${ACCENT}25`, borderRadius: 6,
                color: '#e6edf3', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, padding: '7px 10px',
                outline: 'none', appearance: 'none', cursor: 'pointer',
              }}
            >
              <option value="">— choose a repository —</option>
              {repos.map(r => (
                <option key={r.id} value={r.name}>{r.name}{r.language ? ` (${r.language})` : ''}</option>
              ))}
            </select>
          </div>

          <button
            onClick={runAnalysis}
            disabled={!selectedRepo || analysing}
            style={{
              padding: '8px 22px', borderRadius: 6, border: 'none', cursor: selectedRepo && !analysing ? 'pointer' : 'not-allowed',
              background: selectedRepo && !analysing ? ACCENT : 'rgba(255,255,255,0.04)',
              color: selectedRepo && !analysing ? '#010409' : '#7d8590',
              fontFamily: "'Orbitron',monospace", fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em',
              transition: 'all 0.2s', flexShrink: 0,
            }}
          >
            {analysing ? 'ANALYSING…' : 'GENERATE FINGERPRINT'}
          </button>
        </div>

        {/* ── Analysing spinner ─────────────────────────────────────────────── */}
        {analysing && (
          <div style={{ textAlign: 'center', padding: '48px 0', animation: 'fadeUp 0.4s ease' }}>
            <div style={{ width: 44, height: 44, border: `2px solid ${ACCENT}20`, borderTop: `2px solid ${ACCENT}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }} />
            <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, color: ACCENT, letterSpacing: '0.15em', marginBottom: 6 }}>EXTRACTING STYLE PATTERNS</div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590' }}>Parsing AST · analysing naming · computing dimensions…</div>
          </div>
        )}

        {/* ── Error ─────────────────────────────────────────────────────────── */}
        {error && (
          <div style={{ background: `${RED}0e`, border: `1px solid ${RED}30`, borderRadius: 8, padding: '12px 16px', marginBottom: 20 }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: RED }}>{error}</span>
          </div>
        )}

        {/* ── Report ────────────────────────────────────────────────────────── */}
        {report && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: 'fadeUp 0.4s ease' }}>

            {/* ── Row 1: Fingerprint card + Archetype + AI summary ──────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 18, alignItems: 'start' }}>

              {/* Fingerprint visual card */}
              <div style={{
                background: 'rgba(13,17,23,0.9)', border: `1px solid ${ACCENT}22`, borderRadius: 12,
                padding: '20px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
                minWidth: 260,
              }}>
                <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, letterSpacing: '0.15em', color: ACCENT }}>STYLE FINGERPRINT</div>
                <FingerprintSVG dimensions={report.dimensions} size={200} />

                {/* Overall score */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 32, fontWeight: 900, color: ACCENT, lineHeight: 1, textShadow: `0 0 20px ${ACCENT}60` }}>
                    {report.overallStyleScore}
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8.5, color: '#7d8590', letterSpacing: '0.1em', marginTop: 3 }}>OVERALL STYLE SCORE</div>
                </div>

                {/* Repo info */}
                <div style={{ textAlign: 'center', padding: '8px 12px', background: 'rgba(0,229,255,0.04)', borderRadius: 6, border: `1px solid ${ACCENT}14`, width: '100%' }}>
                  <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, color: ACCENT }}>{report.owner}/{report.repo}</div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#7d8590', marginTop: 3 }}>{report.language} · {report.meta.filesAnalyzed} files · {report.meta.totalLines.toLocaleString()} lines</div>
                </div>

                {/* Consistency ring */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <ConsistencyRing score={report.consistencyScore} size={72} />
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#7d8590', letterSpacing: '0.1em' }}>CONSISTENCY</span>
                </div>
              </div>

              {/* Right column: archetype + summary + tags */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Archetype */}
                <Card title="STYLE ARCHETYPE" accent={ACCENT} icon="🎯">
                  <ArchetypeCard
                    name={report.archetype}
                    icon={report.archetypeIcon}
                    similarity={report.similarArchetypes[0]?.similarity ?? 90}
                    description={report.archetypeDescription}
                    isPrimary
                  />
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 8, color: '#7d8590', letterSpacing: '0.1em', marginBottom: 2 }}>SIMILAR PROFILES</div>
                    {report.similarArchetypes.slice(1).map(a => (
                      <ArchetypeCard key={a.name} name={a.name} icon={a.icon} similarity={a.similarity} description={a.description} />
                    ))}
                  </div>
                </Card>

                {/* AI Summary */}
                <Card title="AI STYLE ANALYSIS" accent={PURPLE} icon="✦">
                  <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: '#c9d1d9', lineHeight: 1.7, margin: 0 }}>{report.aiSummary}</p>
                </Card>

                {/* Style Tags */}
                <Card title="STYLE SIGNATURES" accent={GREEN} icon="⬡">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {report.tags.map((t, i) => <TagChip key={i} label={t.label} positive={t.positive} />)}
                    {report.tags.length === 0 && (
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590' }}>No dominant style signals detected</span>
                    )}
                  </div>
                </Card>

              </div>
            </div>

            {/* ── Row 2: Chart + Raw signals ────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>

              {/* Chart */}
              <Card title="DIMENSION CHART" accent={ACCENT} icon="◈">
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  {(['radar', 'bars'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} style={{
                      padding: '4px 12px', borderRadius: 4, border: `1px solid ${activeTab === tab ? ACCENT + '50' : 'rgba(255,255,255,0.08)'}`,
                      background: activeTab === tab ? `${ACCENT}10` : 'transparent',
                      fontFamily: "'Orbitron',monospace", fontSize: 8, color: activeTab === tab ? ACCENT : '#7d8590',
                      cursor: 'pointer', letterSpacing: '0.1em',
                    }}>{tab === 'radar' ? 'SPIDER' : 'BARS'}</button>
                  ))}
                </div>
                {activeTab === 'radar'
                  ? <div style={{ display: 'flex', justifyContent: 'center' }}><FingerprintSVG dimensions={report.dimensions} size={240} /></div>
                  : <RadarBarChart dimensions={report.dimensions} />
                }
              </Card>

              {/* Raw signals */}
              <Card title="RAW SIGNALS" accent={GOLD} icon="⚙">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
                  <MetricRow label="camelCase ratio" value={`${Math.round(report.rawSignals.camelCaseRatio * 100)}%`} color={ACCENT} />
                  <MetricRow label="arrow fn ratio" value={`${Math.round(report.rawSignals.arrowFnRatio * 100)}%`} color={ACCENT} />
                  <MetricRow label="async/await" value={`${report.rawSignals.asyncAwaitPct}%`} color={GREEN} />
                  <MetricRow label="promise chains" value={`${report.rawSignals.promiseChainPct}%`} color={GOLD} />
                  <MetricRow label="try/catch coverage" value={`${report.rawSignals.tryCatchCoverage}%`} color={ORANGE} />
                  <MetricRow label="comment density" value={`${report.rawSignals.commentDensity}%`} color={PURPLE} />
                  <MetricRow label="avg fn length" value={`${report.rawSignals.avgFunctionLines} ln`} color={PINK} />
                  <MetricRow label="avg file lines" value={report.rawSignals.avgFileLines} color={VIOLET} />
                  <MetricRow label="avg line length" value={`${report.rawSignals.avgLineLength} ch`} color={RED} />
                  <MetricRow label="avg nesting" value={report.rawSignals.avgMaxNesting} color={ORANGE} />
                  <MetricRow label="avg imports/file" value={report.rawSignals.avgImports} color={ACCENT} />
                  <MetricRow label="short fn ratio" value={`${Math.round(report.rawSignals.shortFnRatio * 100)}%`} color={GREEN} />
                  <MetricRow label="const/var ratio" value={`${Math.round(report.rawSignals.constVarRatio * 100)}%`} color={GOLD} />
                  <MetricRow label="default exports" value={`${Math.round(report.rawSignals.defaultExportRatio * 100)}%`} color={PURPLE} />
                </div>
              </Card>
            </div>

            {/* ── Row 3: Dimension deep-dive cards ──────────────────────────── */}
            <Card title="DIMENSION BREAKDOWN · click a snippet to view code" accent={PURPLE} icon="◐">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 12 }}>
                {report.dimensions.map(d => (
                  <DimensionCard key={d.key} dim={d} onSnippet={setActiveSnippet} />
                ))}
              </div>
            </Card>

            {/* ── Row 4: Snippet drill-down ──────────────────────────────────── */}
            {(() => {
              const allSnippets = report.dimensions.flatMap(d => d.snippets)
              if (allSnippets.length === 0) return null
              return (
                <Card title="CODE SNIPPETS · representative patterns" accent={GREEN} icon="⟨/⟩">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
                    {allSnippets.map((s, i) => {
                      const dim = report.dimensions.find(d => d.snippets.includes(s))
                      const color = dim?.color ?? ACCENT
                      const filename = s.path.split('/').pop() ?? s.path
                      return (
                        <div key={i} style={{ background: 'rgba(0,0,0,0.35)', border: `1px solid ${color}20`, borderRadius: 7, overflow: 'hidden', cursor: 'pointer' }}
                          onClick={() => setActiveSnippet(s)}>
                          <div style={{ padding: '6px 10px', borderBottom: `1px solid ${color}18`, display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 8, color, letterSpacing: '0.1em' }}>{s.label.toUpperCase()}</span>
                            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#7d8590' }}>{filename}:{s.lineStart}</span>
                          </div>
                          <pre style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#c9d1d9', margin: 0, padding: '8px 10px', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 100, overflow: 'hidden' }}>
                            {s.code}
                          </pre>
                          <div style={{ padding: '4px 10px', background: `${color}08`, textAlign: 'center' }}>
                            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7.5, color }}>click to expand ↗</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </Card>
              )
            })()}

            {/* ── Footer meta ───────────────────────────────────────────────── */}
            <div style={{ textAlign: 'center', paddingTop: 8 }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8.5, color: '#3d444d' }}>
                analysed {report.meta.filesAnalyzed} files · {report.meta.totalLines.toLocaleString()} total lines · {report.meta.totalFunctions} functions · generated {new Date(report.meta.generatedAt).toLocaleString()}
              </span>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
