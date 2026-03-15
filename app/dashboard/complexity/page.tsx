'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { ComplexityReport, FileComplexity } from '@/app/api/github/complexity/route'

// ── Types ──────────────────────────────────────────────────────────────────────

interface GithubUser { login: string; name: string | null; avatar_url: string }
interface GithubRepo {
  id: number; name: string; description: string | null
  language: string | null; stargazers_count: number; forks_count: number
  html_url: string; updated_at: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function shortPath(p: string): string {
  const parts = p.split('/')
  if (parts.length <= 3) return p
  return `…/${parts.slice(-2).join('/')}`
}

function scoreColor(score: number): string {
  if (score <= 20) return '#00ff88'
  if (score <= 40) return '#00E5FF'
  if (score <= 60) return '#f59e0b'
  if (score <= 75) return '#f97316'
  return '#ff4466'
}

function scoreLabel(score: number): string {
  if (score <= 20) return 'SIMPLE'
  if (score <= 40) return 'MANAGEABLE'
  if (score <= 60) return 'MODERATE'
  if (score <= 75) return 'COMPLEX'
  return 'CRITICAL'
}

const ACCENT = '#00E5FF'
const WARN = '#f59e0b'
const DANGER = '#ff4466'
const SUCCESS = '#00ff88'
const ORANGE = '#f97316'

// ── Metric Card ────────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, color, icon }: {
  label: string; value: string | number; sub?: string; color: string; icon: string
}) {
  return (
    <div style={{
      background: 'rgba(13,17,23,0.9)',
      border: `1px solid ${color}33`,
      borderRadius: 8,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      flex: 1,
      minWidth: 130,
      boxShadow: `0 0 20px ${color}08`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 13 }}>{icon}</span>
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 7.5, letterSpacing: '0.12em', color, fontWeight: 600 }}>
          {label}
        </span>
      </div>
      <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 26, fontWeight: 700, color, lineHeight: 1, textShadow: `0 0 16px ${color}55` }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(201,209,217,0.4)', letterSpacing: '0.04em' }}>
          {sub}
        </div>
      )}
    </div>
  )
}

// ── Tab Button ─────────────────────────────────────────────────────────────────

function TabBtn({ label, active, count, onClick }: {
  label: string; active: boolean; count: number; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? `${ACCENT}15` : 'transparent',
        border: `1px solid ${active ? ACCENT + '55' : 'rgba(0,229,255,0.1)'}`,
        borderRadius: 5,
        padding: '5px 12px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        transition: 'all 0.15s',
      }}
    >
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: active ? ACCENT : '#7d8590' }}>
        {label}
      </span>
      <span style={{
        fontFamily: "'Orbitron',monospace",
        fontSize: 8,
        color: active ? '#050505' : '#7d8590',
        background: active ? ACCENT : 'rgba(0,229,255,0.08)',
        borderRadius: 3,
        padding: '1px 5px',
        fontWeight: 700,
      }}>
        {count}
      </span>
    </button>
  )
}

// ── Table helpers ──────────────────────────────────────────────────────────────

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th style={{
      fontFamily: "'Orbitron',monospace",
      fontSize: 7,
      fontWeight: 600,
      letterSpacing: '0.12em',
      color: 'rgba(0,229,255,0.4)',
      padding: '8px 14px',
      textAlign: align,
      whiteSpace: 'nowrap',
    }}>
      {children}
    </th>
  )
}

function Td({ children, align = 'left', muted = false }: { children: React.ReactNode; align?: 'left' | 'right'; muted?: boolean }) {
  return (
    <td style={{
      padding: '7px 14px',
      fontFamily: "'JetBrains Mono',monospace",
      fontSize: 10,
      color: muted ? 'rgba(201,209,217,0.4)' : '#c9d1d9',
      textAlign: align,
      borderBottom: '1px solid rgba(0,229,255,0.04)',
      verticalAlign: 'middle',
    }}>
      {children}
    </td>
  )
}

function EmptyState({ icon, message, color }: { icon: string; message: string; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '40px 0' }}>
      <span style={{ fontSize: 22, color }}>{icon}</span>
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: color + '99' }}>{message}</span>
    </div>
  )
}

// ── Score Bar ──────────────────────────────────────────────────────────────────

function ScoreBar({ score, max = 100 }: { score: number; max?: number }) {
  const pct = Math.round((score / max) * 100)
  const color = scoreColor(score)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        flex: 1,
        height: 6,
        background: 'rgba(255,255,255,0.06)',
        borderRadius: 3,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          borderRadius: 3,
          transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, color, minWidth: 28, textAlign: 'right' }}>
        {score}
      </span>
    </div>
  )
}

// ── Row components ─────────────────────────────────────────────────────────────

function ComplexFileRow({ idx, file }: { idx: number; file: FileComplexity }) {
  const [hov, setHov] = useState(false)
  const color = scoreColor(file.score)
  return (
    <tr
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ background: hov ? 'rgba(0,229,255,0.03)' : 'transparent', transition: 'background 0.1s' }}
    >
      <Td muted>{idx}</Td>
      <Td>
        <span title={file.path} style={{ color: '#e6edf3' }}>{shortPath(file.path)}</span>
      </Td>
      <Td>
        <div style={{ minWidth: 120 }}>
          <ScoreBar score={file.score} />
        </div>
      </Td>
      <Td align="right">
        <span style={{ color: file.cyclomaticComplexity > 20 ? DANGER : file.cyclomaticComplexity > 10 ? WARN : SUCCESS }}>
          {file.cyclomaticComplexity}
        </span>
      </Td>
      <Td align="right">
        <span style={{ color: file.maxNestingDepth > 4 ? DANGER : file.maxNestingDepth > 3 ? WARN : '#c9d1d9' }}>
          {file.maxNestingDepth}
        </span>
      </Td>
      <Td align="right">
        <span style={{ color: file.lines > 400 ? DANGER : file.lines > 200 ? WARN : '#c9d1d9' }}>
          {file.lines}
        </span>
      </Td>
      <Td align="right" muted>{file.importCount}</Td>
      <Td>
        {file.reasons.length > 0 ? (
          <span style={{
            fontFamily: "'Orbitron',monospace",
            fontSize: 7,
            color,
            background: color + '18',
            padding: '2px 6px',
            borderRadius: 3,
            border: `1px solid ${color}33`,
            letterSpacing: '0.05em',
            whiteSpace: 'nowrap',
          }}>
            {file.reasons.length} RISK{file.reasons.length > 1 ? 'S' : ''}
          </span>
        ) : (
          <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 7, color: SUCCESS, background: SUCCESS + '15', padding: '2px 6px', borderRadius: 3, border: `1px solid ${SUCCESS}33` }}>
            CLEAN
          </span>
        )}
      </Td>
    </tr>
  )
}

function LargeFnRow({ idx, fn }: {
  idx: number
  fn: { path: string; name: string; line: number; lines: number; cyclomaticComplexity: number }
}) {
  const [hov, setHov] = useState(false)
  return (
    <tr
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ background: hov ? 'rgba(0,229,255,0.03)' : 'transparent', transition: 'background 0.1s' }}
    >
      <Td muted>{idx}</Td>
      <Td>
        <span title={fn.path} style={{ color: '#c9d1d9' }}>{shortPath(fn.path)}</span>
      </Td>
      <Td>
        <code style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: ACCENT, background: ACCENT + '12', padding: '1px 5px', borderRadius: 3 }}>
          {fn.name}
        </code>
      </Td>
      <Td align="right" muted>:{fn.line}</Td>
      <Td align="right">
        <span style={{ color: fn.lines > 200 ? DANGER : fn.lines > 120 ? ORANGE : WARN }}>
          {fn.lines}L
        </span>
      </Td>
      <Td align="right">
        <span style={{ color: fn.cyclomaticComplexity > 20 ? DANGER : fn.cyclomaticComplexity > 10 ? WARN : '#c9d1d9' }}>
          {fn.cyclomaticComplexity}
        </span>
      </Td>
    </tr>
  )
}

function HotspotRow({ idx, hs }: {
  idx: number
  hs: { path: string; score: number; issues: string[] }
}) {
  const [hov, setHov] = useState(false)
  const color = scoreColor(hs.score)
  return (
    <tr
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ background: hov ? 'rgba(255,68,102,0.03)' : 'transparent', transition: 'background 0.1s' }}
    >
      <Td muted>{idx}</Td>
      <Td>
        <span title={hs.path} style={{ color: '#e6edf3' }}>{shortPath(hs.path)}</span>
      </Td>
      <Td>
        <div style={{ minWidth: 120 }}>
          <ScoreBar score={hs.score} />
        </div>
      </Td>
      <Td>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {hs.issues.map((issue, i) => (
            <span key={i} style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 8,
              color,
              background: color + '12',
              border: `1px solid ${color}25`,
              borderRadius: 3,
              padding: '2px 5px',
              whiteSpace: 'nowrap',
            }}>
              {issue}
            </span>
          ))}
        </div>
      </Td>
    </tr>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ComplexityPage() {
  const router = useRouter()

  const [user, setUser] = useState<GithubUser | null>(null)
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [selectedRepo, setSelectedRepo] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<ComplexityReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'files' | 'functions' | 'hotspots'>('files')
  const [repoOpen, setRepoOpen] = useState(false)

  useEffect(() => {
    fetch('/api/github/user', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) { router.push('/'); return }
        setUser(data.user)
        setRepos(data.repos ?? [])
      })
      .catch(() => router.push('/'))
  }, [router])

  async function runAnalysis() {
    if (!selectedRepo || !user) return
    setLoading(true)
    setReport(null)
    setError(null)
    try {
      const res = await fetch(
        `/api/github/complexity?owner=${user.login}&repo=${selectedRepo}`,
        { credentials: 'include' }
      )
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Analysis failed'); return }
      setReport(data)
      setActiveTab('files')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  // Chart data from most complex files
  const chartData = report
    ? report.mostComplexFiles.slice(0, 12).map(f => ({
        name: f.path.split('/').pop() ?? f.path,
        score: f.score,
        cc: f.cyclomaticComplexity,
      }))
    : []

  return (
    <div style={{
      height: '100vh',
      overflow: 'hidden',
      background: '#050505',
      color: '#c9d1d9',
      fontFamily: "'JetBrains Mono',monospace",
      display: 'flex',
      flexDirection: 'column',
    }}>

      {/* ── TOPBAR ── */}
      <div style={{
        height: 48,
        borderBottom: '1px solid rgba(0,229,255,0.08)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 12,
        background: 'rgba(13,17,23,0.95)',
        flexShrink: 0,
      }}>
        <button
          onClick={() => router.push('/dashboard')}
          style={{
            background: 'transparent',
            border: '1px solid rgba(0,229,255,0.15)',
            borderRadius: 5,
            padding: '4px 10px',
            cursor: 'pointer',
            color: 'rgba(0,229,255,0.6)',
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.borderColor = `${ACCENT}55`
            el.style.color = ACCENT
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.borderColor = 'rgba(0,229,255,0.15)'
            el.style.color = 'rgba(0,229,255,0.6)'
          }}
        >
          ← BACK
        </button>

        <div style={{ width: 1, height: 20, background: 'rgba(0,229,255,0.1)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>📊</span>
          <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: ACCENT }}>
            COMPLEXITY SCORING
          </span>
        </div>

        {user && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src={user.avatar_url} alt="" width={24} height={24} style={{ borderRadius: '50%', border: `1px solid ${ACCENT}33` }} />
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'rgba(0,229,255,0.5)' }}>
              @{user.login}
            </span>
          </div>
        )}
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px 24px', gap: 16, overflow: 'hidden', minHeight: 0 }}>

        {/* ── ANALYSIS PANEL ── */}
        <div style={{
          background: 'rgba(13,17,23,0.8)',
          border: `1px solid ${ACCENT}18`,
          borderRadius: 10,
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, letterSpacing: '0.12em', color: 'rgba(0,229,255,0.4)' }}>
              REPOSITORY
            </span>

            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setRepoOpen(o => !o)}
                style={{
                  background: 'rgba(5,5,5,0.8)',
                  border: `1px solid ${repoOpen ? ACCENT + '55' : 'rgba(0,229,255,0.15)'}`,
                  borderRadius: 6,
                  padding: '7px 32px 7px 10px',
                  cursor: 'pointer',
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: 11,
                  color: selectedRepo ? '#e6edf3' : 'rgba(0,229,255,0.35)',
                  minWidth: 220,
                  textAlign: 'left',
                  position: 'relative',
                  transition: 'border-color 0.15s',
                }}
              >
                {selectedRepo || 'Select a repository…'}
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(0,229,255,0.4)', fontSize: 10 }}>
                  {repoOpen ? '▲' : '▼'}
                </span>
              </button>

              {repoOpen && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  zIndex: 100,
                  background: '#0d1117',
                  border: `1px solid ${ACCENT}33`,
                  borderRadius: 6,
                  minWidth: 280,
                  maxHeight: 260,
                  overflowY: 'auto',
                  boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 20px ${ACCENT}08`,
                  marginTop: 2,
                }}>
                  {repos.length === 0 ? (
                    <div style={{ padding: '10px 12px', fontSize: 11, color: '#7d8590' }}>No repositories found</div>
                  ) : repos.map(r => (
                    <button
                      key={r.id}
                      onClick={() => { setSelectedRepo(r.name); setRepoOpen(false); setReport(null); setError(null) }}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 12px',
                        background: selectedRepo === r.name ? `${ACCENT}15` : 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: 11,
                        color: selectedRepo === r.name ? ACCENT : '#c9d1d9',
                        borderBottom: '1px solid rgba(0,229,255,0.05)',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { if (selectedRepo !== r.name) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,229,255,0.06)' }}
                      onMouseLeave={e => { if (selectedRepo !== r.name) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                    >
                      <div style={{ fontWeight: selectedRepo === r.name ? 700 : 400 }}>{r.name}</div>
                      {r.language && (
                        <div style={{ fontSize: 9, color: 'rgba(0,229,255,0.35)', marginTop: 1 }}>{r.language}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button
            onClick={runAnalysis}
            disabled={!selectedRepo || loading}
            style={{
              background: (!selectedRepo || loading) ? 'rgba(0,229,255,0.05)' : `${ACCENT}18`,
              border: `1px solid ${(!selectedRepo || loading) ? 'rgba(0,229,255,0.1)' : ACCENT + '55'}`,
              borderRadius: 6,
              padding: '9px 20px',
              cursor: (!selectedRepo || loading) ? 'not-allowed' : 'pointer',
              fontFamily: "'Orbitron',monospace",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: (!selectedRepo || loading) ? 'rgba(0,229,255,0.3)' : ACCENT,
              transition: 'all 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => {
              if (!selectedRepo || loading) return
              const el = e.currentTarget as HTMLButtonElement
              el.style.background = `${ACCENT}28`
              el.style.boxShadow = `0 0 18px ${ACCENT}22`
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.background = (!selectedRepo || loading) ? 'rgba(0,229,255,0.05)' : `${ACCENT}18`
              el.style.boxShadow = 'none'
            }}
          >
            {loading ? (
              <>
                <span style={{ display: 'inline-block', width: 10, height: 10, border: `2px solid ${ACCENT}40`, borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                ANALYSING…
              </>
            ) : '⚡ SCORE COMPLEXITY'}
          </button>

          {report && (
            <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: SUCCESS }}>
                ✓ {report.meta.filesAnalyzed} / {report.meta.totalFiles} files analysed
              </span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'rgba(201,209,217,0.35)' }}>
                {report.meta.totalFunctions} functions · {report.meta.totalLines.toLocaleString()} lines
              </span>
            </div>
          )}
        </div>

        {/* ── ERROR ── */}
        {error && (
          <div style={{
            background: `${DANGER}12`,
            border: `1px solid ${DANGER}44`,
            borderRadius: 8,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <span style={{ color: DANGER, fontSize: 14 }}>✗</span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: DANGER }}>{error}</span>
          </div>
        )}

        {/* ── LOADING ── */}
        {loading && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <div style={{ width: 52, height: 52, border: `3px solid ${ACCENT}20`, borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.9s linear infinite' }} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, color: ACCENT, letterSpacing: '0.12em' }}>
                COMPUTING COMPLEXITY
              </span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(0,229,255,0.35)' }}>
                Parsing AST · Measuring cyclomatic paths · Scoring files…
              </span>
            </div>
          </div>
        )}

        {/* ── RESULTS ── */}
        {report && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 16, minHeight: 0 }}>
            {/* ── SCORE SHOWCASE ── */}
            <div style={{
              background: 'rgba(13,17,23,0.85)',
              border: `1px solid ${scoreColor(report.score)}25`,
              borderRadius: 10,
              padding: '20px 24px',
              display: 'flex',
              alignItems: 'center',
              gap: 24,
              flexWrap: 'wrap',
              flexShrink: 0,
              boxShadow: `0 0 40px ${scoreColor(report.score)}08`,
            }}>
              {/* Big score */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 7, letterSpacing: '0.18em', color: 'rgba(201,209,217,0.4)', marginBottom: 4 }}>
                    COMPLEXITY INDEX
                  </div>
                  <div style={{
                    fontFamily: "'Orbitron',monospace",
                    fontSize: 72,
                    fontWeight: 900,
                    color: scoreColor(report.score),
                    lineHeight: 1,
                    textShadow: `0 0 40px ${scoreColor(report.score)}44`,
                  }}>
                    {report.score}
                  </div>
                  <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, letterSpacing: '0.14em', color: scoreColor(report.score) + 'bb', marginTop: 4 }}>
                    {scoreLabel(report.score)}
                  </div>
                </div>

                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 7, letterSpacing: '0.18em', color: 'rgba(201,209,217,0.4)', marginBottom: 4 }}>
                    GRADE
                  </div>
                  <div style={{
                    fontFamily: "'Orbitron',monospace",
                    fontSize: 64,
                    fontWeight: 900,
                    color: scoreColor(report.score),
                    lineHeight: 1,
                    textShadow: `0 0 30px ${scoreColor(report.score)}44`,
                    width: 56,
                    textAlign: 'center',
                  }}>
                    {report.grade}
                  </div>
                </div>
              </div>

              <div style={{ width: 1, height: 80, background: 'rgba(0,229,255,0.08)', flexShrink: 0 }} />

              {/* Averages */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 180 }}>
                <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 7, letterSpacing: '0.14em', color: 'rgba(0,229,255,0.35)' }}>
                  AVERAGE METRICS
                </span>
                {[
                  { label: 'Cyclomatic Complexity', value: report.averages.cyclomaticComplexity, warn: 10, danger: 20 },
                  { label: 'Max Nesting Depth', value: report.averages.nestingDepth, warn: 3, danger: 5 },
                  { label: 'File Size (lines)', value: report.averages.fileSize, warn: 200, danger: 400 },
                  { label: 'Import Count', value: report.averages.importCount, warn: 10, danger: 15 },
                ].map(m => (
                  <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(201,209,217,0.5)', minWidth: 160 }}>
                      {m.label}
                    </span>
                    <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.min((m.value / (m.danger * 1.5)) * 100, 100)}%`,
                        height: '100%',
                        background: m.value >= m.danger ? DANGER : m.value >= m.warn ? WARN : SUCCESS,
                        borderRadius: 2,
                        transition: 'width 0.4s',
                      }} />
                    </div>
                    <span style={{
                      fontFamily: "'Orbitron',monospace",
                      fontSize: 9,
                      fontWeight: 700,
                      color: m.value >= m.danger ? DANGER : m.value >= m.warn ? WARN : SUCCESS,
                      minWidth: 30,
                      textAlign: 'right',
                    }}>
                      {m.value}
                    </span>
                  </div>
                ))}
              </div>

              {/* Mini bar chart */}
              {chartData.length > 0 && (
                <>
                  <div style={{ width: 1, height: 80, background: 'rgba(0,229,255,0.08)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 200, minHeight: 80 }}>
                    <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 7, letterSpacing: '0.14em', color: 'rgba(0,229,255,0.35)', marginBottom: 6 }}>
                      FILE COMPLEXITY DISTRIBUTION
                    </div>
                    <ResponsiveContainer width="100%" height={72}>
                      <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                        <XAxis dataKey="name" hide />
                        <YAxis hide domain={[0, 100]} />
                        <Tooltip
                          contentStyle={{ background: '#0d1117', border: `1px solid ${ACCENT}33`, borderRadius: 6, fontFamily: "'JetBrains Mono',monospace", fontSize: 10 }}
                          labelStyle={{ color: ACCENT }}
                          formatter={(v: number) => [v, 'Score']}
                        />
                        <Bar dataKey="score" radius={[2, 2, 0, 0]}>
                          {chartData.map((entry, i) => (
                            <Cell key={i} fill={scoreColor(entry.score)} fillOpacity={0.8} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </div>

            {/* ── METRIC CARDS ── */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
              <MetricCard
                label="AVG CYCLOMATIC"
                value={report.averages.cyclomaticComplexity}
                sub="branching paths per file"
                color={report.averages.cyclomaticComplexity > 20 ? DANGER : report.averages.cyclomaticComplexity > 10 ? WARN : SUCCESS}
                icon="🔀"
              />
              <MetricCard
                label="HIGH-RISK FILES"
                value={report.highRiskFileCount}
                sub={`of ${report.meta.filesAnalyzed} analysed`}
                color={report.highRiskFileCount > 10 ? DANGER : report.highRiskFileCount > 4 ? WARN : SUCCESS}
                icon="⚠️"
              />
              <MetricCard
                label="LARGE FUNCTIONS"
                value={report.largestFunctions.length}
                sub=">80 lines each"
                color={report.largestFunctions.length > 10 ? DANGER : report.largestFunctions.length > 3 ? WARN : ACCENT}
                icon="📏"
              />
              <MetricCard
                label="HOTSPOTS"
                value={report.hotspots.length}
                sub="multi-factor risk files"
                color={report.hotspots.length > 8 ? DANGER : report.hotspots.length > 3 ? ORANGE : ACCENT}
                icon="🔥"
              />
            </div>

            {/* ── DETAIL TABLES ── */}
            <div style={{
              background: 'rgba(13,17,23,0.8)',
              border: '1px solid rgba(0,229,255,0.1)',
              borderRadius: 10,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              flex: 1,
              minHeight: 0,
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 16px',
                borderBottom: '1px solid rgba(0,229,255,0.08)',
                flexShrink: 0,
                background: 'rgba(5,5,5,0.4)',
              }}>
                <TabBtn label="COMPLEX FILES" active={activeTab === 'files'} count={report.mostComplexFiles.length} onClick={() => setActiveTab('files')} />
                <TabBtn label="LARGEST FUNCTIONS" active={activeTab === 'functions'} count={report.largestFunctions.length} onClick={() => setActiveTab('functions')} />
                <TabBtn label="DEBT HOTSPOTS" active={activeTab === 'hotspots'} count={report.hotspots.length} onClick={() => setActiveTab('hotspots')} />
              </div>

              <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>

                {/* Complex Files Tab */}
                {activeTab === 'files' && (
                  report.mostComplexFiles.length === 0 ? (
                    <EmptyState icon="✓" message="No complex files detected" color={SUCCESS} />
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(0,229,255,0.06)', position: 'sticky', top: 0, background: '#0a0e14', zIndex: 1 }}>
                          <Th>#</Th>
                          <Th>FILE PATH</Th>
                          <Th>COMPLEXITY</Th>
                          <Th align="right">CYCLOMATIC</Th>
                          <Th align="right">NESTING</Th>
                          <Th align="right">LINES</Th>
                          <Th align="right">IMPORTS</Th>
                          <Th>STATUS</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.mostComplexFiles.map((f, i) => (
                          <ComplexFileRow key={f.path} idx={i + 1} file={f} />
                        ))}
                      </tbody>
                    </table>
                  )
                )}

                {/* Largest Functions Tab */}
                {activeTab === 'functions' && (
                  report.largestFunctions.length === 0 ? (
                    <EmptyState icon="✓" message="No oversized functions detected" color={SUCCESS} />
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(0,229,255,0.06)', position: 'sticky', top: 0, background: '#0a0e14', zIndex: 1 }}>
                          <Th>#</Th>
                          <Th>FILE PATH</Th>
                          <Th>FUNCTION NAME</Th>
                          <Th align="right">LINE</Th>
                          <Th align="right">LENGTH</Th>
                          <Th align="right">FILE CC</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.largestFunctions.map((fn, i) => (
                          <LargeFnRow key={`${fn.path}-${fn.name}-${fn.line}`} idx={i + 1} fn={fn} />
                        ))}
                      </tbody>
                    </table>
                  )
                )}

                {/* Hotspots Tab */}
                {activeTab === 'hotspots' && (
                  report.hotspots.length === 0 ? (
                    <EmptyState icon="✓" message="No technical-debt hotspots found" color={SUCCESS} />
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(0,229,255,0.06)', position: 'sticky', top: 0, background: '#0a0e14', zIndex: 1 }}>
                          <Th>#</Th>
                          <Th>FILE PATH</Th>
                          <Th>SCORE</Th>
                          <Th>RISK FACTORS</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.hotspots.map((hs, i) => (
                          <HotspotRow key={hs.path} idx={i + 1} hs={hs} />
                        ))}
                      </tbody>
                    </table>
                  )
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── EMPTY STATE ── */}
        {!report && !loading && !error && (
          <div style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
          }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: `${ACCENT}10`,
              border: `1px solid ${ACCENT}25`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
            }}>
              📊
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 12, color: 'rgba(0,229,255,0.5)', letterSpacing: '0.1em' }}>
                SELECT A REPOSITORY
              </span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'rgba(201,209,217,0.3)', textAlign: 'center', maxWidth: 400, lineHeight: 1.6 }}>
                Choose a repository and run the analysis to score cyclomatic complexity, nesting depth, function length, and more.
              </span>
            </div>
            <div style={{ display: 'flex', gap: 20, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {[
                { icon: '🔀', label: 'Cyclomatic Complexity' },
                { icon: '📏', label: 'Function Length' },
                { icon: '🌲', label: 'Nesting Depth' },
                { icon: '🔥', label: 'Debt Hotspots' },
                { icon: '📦', label: 'Dependency Count' },
              ].map(item => (
                <div key={item.label} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 5,
                  padding: '10px 14px',
                  background: `${ACCENT}06`,
                  border: `1px solid ${ACCENT}15`,
                  borderRadius: 7,
                }}>
                  <span style={{ fontSize: 18 }}>{item.icon}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(0,229,255,0.4)' }}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── FOOTER ── */}
      <footer style={{
        height: 24,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        borderTop: '1px solid rgba(0,229,255,0.06)',
        background: 'rgba(5,5,5,0.8)',
      }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, letterSpacing: '0.14em', color: 'rgba(0,229,255,0.3)' }}>
          GIT PLANET | COMPLEXITY SCORING
        </span>
        {report && (
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: 'rgba(0,229,255,0.25)' }}>
            {report.meta.totalFiles} TOTAL FILES · {report.meta.filesAnalyzed} ANALYSED · GRADE {report.grade}
          </span>
        )}
      </footer>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
