'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { DeadCodeReport, DeadFileEntry, UnusedFunctionEntry, UnusedExportEntry } from '@/app/api/github/dead-code/route'

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

function extColor(ext: string): string {
  const m: Record<string, string> = {
    '.ts': '#3b82f6', '.tsx': '#06b6d4', '.js': '#f59e0b',
    '.jsx': '#f97316', '.mjs': '#a78bfa', '.cjs': '#6b7280',
  }
  return m[ext] ?? '#6b7280'
}

function kindColor(kind: string): string {
  const m: Record<string, string> = {
    function: '#00E5FF', const: '#a78bfa', class: '#f59e0b',
    type: '#00ff88', interface: '#00ff88', default: '#6b7280', unknown: '#6b7280',
  }
  return m[kind] ?? '#6b7280'
}

const ACCENT = '#00E5FF'
const WARN = '#f59e0b'
const DANGER = '#ff4466'
const SUCCESS = '#00ff88'

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
      minWidth: 0,
      boxShadow: `0 0 20px ${color}08`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 8, letterSpacing: '0.12em', color: color, fontWeight: 600 }}>
          {label}
        </span>
      </div>
      <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 28, fontWeight: 700, color, lineHeight: 1, textShadow: `0 0 16px ${color}66` }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(201,209,217,0.45)', letterSpacing: '0.04em' }}>
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

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function DeadCodePage() {
  const router = useRouter()

  const [user, setUser] = useState<GithubUser | null>(null)
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [selectedRepo, setSelectedRepo] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<DeadCodeReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'dead' | 'functions' | 'exports'>('dead')
  const [repoOpen, setRepoOpen] = useState(false)

  // Load user + repos
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
        `/api/github/dead-code?owner=${user.login}&repo=${selectedRepo}`,
        { credentials: 'include' }
      )
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Analysis failed'); return }
      setReport(data)
      setActiveTab('dead')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  // cleanup color by severity
  const cleanupColor = (pct: number) =>
    pct >= 30 ? DANGER : pct >= 15 ? WARN : pct >= 5 ? ACCENT : SUCCESS

  return (
    <div style={{
      minHeight: '100vh',
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
          <span style={{ fontSize: 16 }}>🔍</span>
          <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: ACCENT }}>
            DEAD CODE EXTRACTOR
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
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px 24px', gap: 16, overflow: 'auto' }}>

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
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, letterSpacing: '0.12em', color: 'rgba(0,229,255,0.4)' }}>
              REPOSITORY
            </span>

            {/* Repo selector */}
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
                SCANNING…
              </>
            ) : '⚡ EXTRACT DEAD CODE'}
          </button>

          {report && (
            <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: SUCCESS }}>
                ✓ {report.summary.filesAnalyzed} / {report.summary.totalFiles} files analyzed
              </span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'rgba(201,209,217,0.35)', maxWidth: 300, textAlign: 'right', lineHeight: 1.4 }}>
                {report.summary.coverageNote}
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
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: DANGER }}>
              {error}
            </span>
          </div>
        )}

        {/* ── LOADING STATE ── */}
        {loading && (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: '60px 0',
          }}>
            <div style={{
              width: 52,
              height: 52,
              border: `3px solid ${ACCENT}20`,
              borderTopColor: ACCENT,
              borderRadius: '50%',
              animation: 'spin 0.9s linear infinite',
            }} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, color: ACCENT, letterSpacing: '0.12em' }}>
                SCANNING REPOSITORY
              </span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(0,229,255,0.35)' }}>
                Building import graph · Detecting dead code…
              </span>
            </div>
          </div>
        )}

        {/* ── RESULTS ── */}
        {report && !loading && (
          <>
            {/* ── METRIC CARDS ── */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <MetricCard
                label="DEAD FILES"
                value={report.summary.deadFiles}
                sub={`out of ${report.summary.filesAnalyzed} analyzed`}
                color={report.summary.deadFiles > 5 ? DANGER : report.summary.deadFiles > 0 ? WARN : SUCCESS}
                icon="🗂️"
              />
              <MetricCard
                label="UNUSED FUNCTIONS"
                value={report.summary.unusedFunctions}
                sub="never called externally"
                color={report.summary.unusedFunctions > 10 ? DANGER : report.summary.unusedFunctions > 3 ? WARN : SUCCESS}
                icon="⚙️"
              />
              <MetricCard
                label="UNUSED EXPORTS"
                value={report.summary.unusedExports}
                sub="exported but not imported"
                color={report.summary.unusedExports > 15 ? DANGER : report.summary.unusedExports > 5 ? WARN : ACCENT}
                icon="📤"
              />
              <MetricCard
                label="POTENTIAL CLEANUP"
                value={`${report.summary.cleanupPercent}%`}
                sub={`~${report.summary.deadLines.toLocaleString()} / ${report.summary.totalLines.toLocaleString()} lines`}
                color={cleanupColor(report.summary.cleanupPercent)}
                icon="🧹"
              />
            </div>

            {/* ── DETAILED TABLE ── */}
            <div style={{
              background: 'rgba(13,17,23,0.8)',
              border: `1px solid rgba(0,229,255,0.1)`,
              borderRadius: 10,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              flex: 1,
              minHeight: 300,
            }}>
              {/* Tab header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 16px',
                borderBottom: '1px solid rgba(0,229,255,0.08)',
                flexShrink: 0,
                background: 'rgba(5,5,5,0.4)',
              }}>
                <TabBtn label="DEAD FILES" active={activeTab === 'dead'} count={report.deadFiles.length} onClick={() => setActiveTab('dead')} />
                <TabBtn label="UNUSED FUNCTIONS" active={activeTab === 'functions'} count={report.unusedFunctions.length} onClick={() => setActiveTab('functions')} />
                <TabBtn label="UNUSED EXPORTS" active={activeTab === 'exports'} count={report.unusedExports.length} onClick={() => setActiveTab('exports')} />
              </div>

              {/* Table content */}
              <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>

                {/* ── Dead Files Tab ── */}
                {activeTab === 'dead' && (
                  report.deadFiles.length === 0 ? (
                    <EmptyState icon="✓" message="No dead files detected" color={SUCCESS} />
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(0,229,255,0.06)' }}>
                          <Th>#</Th>
                          <Th>FILE PATH</Th>
                          <Th>EXT</Th>
                          <Th align="right">LINES</Th>
                          <Th>STATUS</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.deadFiles.map((f, i) => (
                          <DeadFileRow key={f.path} idx={i + 1} file={f} />
                        ))}
                      </tbody>
                    </table>
                  )
                )}

                {/* ── Unused Functions Tab ── */}
                {activeTab === 'functions' && (
                  report.unusedFunctions.length === 0 ? (
                    <EmptyState icon="✓" message="No unused functions detected" color={SUCCESS} />
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(0,229,255,0.06)' }}>
                          <Th>#</Th>
                          <Th>FILE PATH</Th>
                          <Th>FUNCTION NAME</Th>
                          <Th align="right">LINE</Th>
                          <Th align="right">SIZE</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.unusedFunctions.map((f, i) => (
                          <UnusedFnRow key={`${f.path}-${f.name}`} idx={i + 1} fn={f} />
                        ))}
                      </tbody>
                    </table>
                  )
                )}

                {/* ── Unused Exports Tab ── */}
                {activeTab === 'exports' && (
                  report.unusedExports.length === 0 ? (
                    <EmptyState icon="✓" message="No unused exports detected" color={SUCCESS} />
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(0,229,255,0.06)' }}>
                          <Th>#</Th>
                          <Th>FILE PATH</Th>
                          <Th>EXPORT NAME</Th>
                          <Th>KIND</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.unusedExports.map((e, i) => (
                          <UnusedExportRow key={`${e.path}-${e.name}`} idx={i + 1} exp={e} />
                        ))}
                      </tbody>
                    </table>
                  )
                )}
              </div>
            </div>
          </>
        )}

        {/* ── EMPTY STATE (before analysis) ── */}
        {!report && !loading && !error && (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            padding: '60px 0',
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
              🔍
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 12, color: 'rgba(0,229,255,0.5)', letterSpacing: '0.1em' }}>
                SELECT A REPOSITORY
              </span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'rgba(201,209,217,0.3)', textAlign: 'center', maxWidth: 360, lineHeight: 1.6 }}>
                Choose a repository and run the analysis to detect dead files, unused functions, and unexported symbols.
              </span>
            </div>
            <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
              {[
                { icon: '🗂️', label: 'Dead Files' },
                { icon: '⚙️', label: 'Unused Functions' },
                { icon: '📤', label: 'Unused Exports' },
                { icon: '🧹', label: 'Cleanup Estimate' },
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
          GIT PLANET | DEAD CODE EXTRACTOR
        </span>
        {report && (
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: 'rgba(0,229,255,0.25)' }}>
            {report.summary.totalFiles} TOTAL FILES · {report.summary.filesAnalyzed} ANALYZED
          </span>
        )}
      </footer>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

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

function DeadFileRow({ idx, file }: { idx: number; file: DeadFileEntry }) {
  const [hov, setHov] = useState(false)
  const color = extColor(file.ext)
  return (
    <tr
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ background: hov ? 'rgba(0,229,255,0.03)' : 'transparent', transition: 'background 0.1s' }}
    >
      <Td muted>{idx}</Td>
      <Td>
        <span title={file.path} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#e6edf3' }}>
          {shortPath(file.path)}
        </span>
      </Td>
      <Td>
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 8, color, background: color + '18', padding: '2px 6px', borderRadius: 3, border: `1px solid ${color}33` }}>
          {file.ext}
        </span>
      </Td>
      <Td align="right">
        <span style={{ color: file.lines > 200 ? DANGER : file.lines > 50 ? WARN : '#c9d1d9' }}>
          {file.lines}
        </span>
      </Td>
      <Td>
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 7, color: DANGER, background: DANGER + '15', padding: '2px 6px', borderRadius: 3, border: `1px solid ${DANGER}33`, letterSpacing: '0.06em' }}>
          NOT IMPORTED
        </span>
      </Td>
    </tr>
  )
}

function UnusedFnRow({ idx, fn }: { idx: number; fn: UnusedFunctionEntry }) {
  const [hov, setHov] = useState(false)
  return (
    <tr
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ background: hov ? 'rgba(0,229,255,0.03)' : 'transparent', transition: 'background 0.1s' }}
    >
      <Td muted>{idx}</Td>
      <Td>
        <span title={fn.path} style={{ fontSize: 10, color: '#c9d1d9' }}>
          {shortPath(fn.path)}
        </span>
      </Td>
      <Td>
        <code style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: ACCENT, background: ACCENT + '12', padding: '1px 5px', borderRadius: 3 }}>
          {fn.name}
        </code>
      </Td>
      <Td align="right" muted>:{fn.line}</Td>
      <Td align="right">
        <span style={{ color: fn.lines > 80 ? DANGER : fn.lines > 30 ? WARN : '#c9d1d9' }}>
          {fn.lines}L
        </span>
      </Td>
    </tr>
  )
}

function UnusedExportRow({ idx, exp }: { idx: number; exp: UnusedExportEntry }) {
  const [hov, setHov] = useState(false)
  const kColor = kindColor(exp.kind)
  return (
    <tr
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ background: hov ? 'rgba(0,229,255,0.03)' : 'transparent', transition: 'background 0.1s' }}
    >
      <Td muted>{idx}</Td>
      <Td>
        <span title={exp.path} style={{ fontSize: 10, color: '#c9d1d9' }}>
          {shortPath(exp.path)}
        </span>
      </Td>
      <Td>
        <code style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: ACCENT, background: ACCENT + '12', padding: '1px 5px', borderRadius: 3 }}>
          {exp.name}
        </code>
      </Td>
      <Td>
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 8, color: kColor, background: kColor + '18', padding: '2px 6px', borderRadius: 3, border: `1px solid ${kColor}33`, letterSpacing: '0.06em' }}>
          {exp.kind}
        </span>
      </Td>
    </tr>
  )
}
