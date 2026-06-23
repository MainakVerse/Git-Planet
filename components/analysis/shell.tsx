'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// ── Shared types ──────────────────────────────────────────────────────────────

export interface GithubUser { login: string; name: string | null; avatar_url: string }
export interface GithubRepo {
  id: number; name: string; description: string | null
  language: string | null; stargazers_count: number; forks_count: number
  html_url: string; updated_at: string; fork: boolean
}

export const C = {
  accent: '#00E5FF', success: '#00ff88', danger: '#ff4466',
  purple: '#7B61FF', gold: '#FFD700', orange: '#ff8800',
  text: '#e6edf3', dim: '#7d8590', sub: '#c9d1d9', bg: '#050505',
}

export const FONT = {
  orbitron: "'Orbitron',monospace",
  mono: "'JetBrains Mono',monospace",
  sans: "'Space Grotesk',sans-serif",
}

// ── useRepoAnalysis hook ──────────────────────────────────────────────────────
//
// Encapsulates: load user+repos, select a repo, run an analysis endpoint.
// Every Community-Health / Dev-Intelligence page uses this.

export function useRepoAnalysis<T>(endpoint: string) {
  const router = useRouter()
  const [user, setUser] = useState<GithubUser | null>(null)
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [selectedRepo, setSelectedRepo] = useState<GithubRepo | null>(null)
  const [report, setReport] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [analysing, setAnalysing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/github/user')
      .then(r => { if (r.status === 401) { router.push('/'); return null } return r.json() })
      .then(d => {
        if (!d) return
        setUser(d.user)
        const sorted = [...(d.repos ?? [])]
          .filter((r: GithubRepo) => !r.fork)
          .sort((a: GithubRepo, b: GithubRepo) => b.stargazers_count - a.stargazers_count)
        setRepos(sorted)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [router])

  const analyse = useCallback(async () => {
    if (!selectedRepo || !user) return
    setAnalysing(true); setError(''); setReport(null)
    try {
      const res = await fetch(`${endpoint}?owner=${encodeURIComponent(user.login)}&repo=${encodeURIComponent(selectedRepo.name)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')
      setReport(data as T)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed')
    } finally {
      setAnalysing(false)
    }
  }, [endpoint, selectedRepo, user])

  return {
    user, repos, selectedRepo, setSelectedRepo,
    report, loading, analysing, error, analyse, router,
  }
}

// ── useProfileAnalysis hook (profile-scoped features) ─────────────────────────
//
// For Developer-Intelligence features that analyse a *user* (optionally another
// login), not a repository.

export function useProfileAnalysis<T>(endpoint: string) {
  const router = useRouter()
  const [user, setUser] = useState<GithubUser | null>(null)
  const [loginInput, setLoginInput] = useState('')
  const [report, setReport] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [analysing, setAnalysing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/github/user')
      .then(r => { if (r.status === 401) { router.push('/'); return null } return r.json() })
      .then(d => { if (!d) return; setUser(d.user); setLoginInput(d.user.login); setLoading(false) })
      .catch(() => setLoading(false))
  }, [router])

  const analyse = useCallback(async (overrideLogin?: string) => {
    const login = (overrideLogin ?? loginInput).trim()
    if (!login) return
    setAnalysing(true); setError(''); setReport(null)
    try {
      const res = await fetch(`${endpoint}?login=${encodeURIComponent(login)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')
      setReport(data as T)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed')
    } finally {
      setAnalysing(false)
    }
  }, [endpoint, loginInput])

  return { user, loginInput, setLoginInput, report, loading, analysing, error, analyse, router }
}

// ── useQueryAnalysis hook (free-text query features) ──────────────────────────
//
// For discovery features that take an arbitrary query (topic, language, keyword)
// rather than a specific repo or user.

export function useQueryAnalysis<T>(endpoint: string, param = 'q', initial = '') {
  const router = useRouter()
  const [query, setQuery] = useState(initial)
  const [report, setReport] = useState<T | null>(null)
  const [analysing, setAnalysing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // ensure auth; redirect if not logged in
    fetch('/api/github/user').then(r => { if (r.status === 401) router.push('/') }).catch(() => {})
  }, [router])

  const analyse = useCallback(async (override?: string) => {
    const q = (override ?? query).trim()
    if (!q) return
    setAnalysing(true); setError(''); setReport(null)
    try {
      const res = await fetch(`${endpoint}?${param}=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')
      setReport(data as T)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed')
    } finally {
      setAnalysing(false)
    }
  }, [endpoint, param, query])

  return { query, setQuery, report, analysing, error, analyse, router }
}

// ── Profile shell ──────────────────────────────────────────────────────────────

export function ProfileShell({
  title, subtitle, accent, icon,
  loginInput, setLoginInput, analysing, analyseLabel, onAnalyse, error, hasReport, children,
}: {
  title: string; subtitle: string; accent: string; icon: string
  loginInput: string; setLoginInput: (v: string) => void
  analysing: boolean; analyseLabel: string; onAnalyse: () => void
  error: string; hasReport: boolean; children: React.ReactNode
}) {
  const router = useRouter()
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: FONT.sans }}>
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(0,229,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,0.02) 1px,transparent 1px)', backgroundSize: '44px 44px', pointerEvents: 'none', zIndex: 0 }} />
      <nav style={{ height: 44, position: 'sticky', top: 0, zIndex: 100, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', background: 'rgba(5,5,5,0.96)', borderBottom: '1px solid rgba(0,229,255,0.07)', backdropFilter: 'blur(14px)' }}>
        <button onClick={() => router.push('/dashboard')} style={{ background: 'transparent', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 5, color: C.accent, fontSize: 11, cursor: 'pointer', padding: '4px 10px', fontFamily: FONT.mono }}>← BACK</button>
        <span style={{ fontFamily: FONT.orbitron, fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: C.accent, textShadow: '0 0 14px rgba(0,229,255,0.4)' }}>GIT PLANET</span>
        <span style={{ fontFamily: FONT.mono, fontSize: 9, color: C.dim, letterSpacing: '0.1em' }}>/ {title.toUpperCase()}</span>
      </nav>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1180, margin: '0 auto', padding: 16 }}>
        {/* Header + input */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ fontSize: 20, color: accent }}>{icon}</span>
              <h1 style={{ fontFamily: FONT.orbitron, fontSize: 18, fontWeight: 700, color: C.text, margin: 0, letterSpacing: '0.03em' }}>{title}</h1>
            </div>
            <p style={{ fontFamily: FONT.sans, fontSize: 12, color: C.dim, margin: '5px 0 0', maxWidth: 560, lineHeight: 1.45 }}>{subtitle}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', height: 36, background: 'rgba(13,17,23,0.8)', border: `1px solid ${accent}33`, borderRadius: 7 }}>
              <span style={{ color: `${accent}88`, fontSize: 12 }}>@</span>
              <input
                value={loginInput}
                onChange={e => setLoginInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') onAnalyse() }}
                placeholder="github username"
                style={{ width: 180, background: 'transparent', border: 'none', outline: 'none', fontFamily: FONT.mono, fontSize: 12, color: C.text }}
              />
            </div>
            <button
              onClick={onAnalyse}
              disabled={!loginInput.trim() || analysing}
              style={{ height: 36, padding: '0 16px', borderRadius: 7, cursor: loginInput.trim() && !analysing ? 'pointer' : 'not-allowed', background: analysing ? `${accent}10` : `${accent}1a`, border: `1px solid ${loginInput.trim() && !analysing ? accent + '66' : accent + '22'}`, color: analysing ? `${accent}88` : accent, fontFamily: FONT.orbitron, fontSize: 10, fontWeight: 600, letterSpacing: '0.08em' }}
            >
              {analysing ? 'ANALYSING…' : analyseLabel}
            </button>
          </div>
        </div>

        {error && (
          <div style={{ marginBottom: 12, padding: '10px 12px', background: 'rgba(255,68,102,0.08)', border: '1px solid rgba(255,68,102,0.25)', borderRadius: 8, fontFamily: FONT.mono, fontSize: 10, color: C.danger }}>{error}</div>
        )}

        {analysing && <LoadingPanel accent={accent} />}
        {!analysing && !hasReport && !error && <EmptyPanel accent={accent} icon={icon} />}
        {!analysing && hasReport && children}
      </div>
    </div>
  )
}

// ── Query shell (free-text discovery features) ────────────────────────────────

export function QueryShell({
  title, subtitle, accent, icon,
  query, setQuery, analysing, analyseLabel, onAnalyse, error, hasReport, children,
  placeholder = 'topic, language or keyword…', prefix = '⌕', inputWidth = 220,
}: {
  title: string; subtitle: string; accent: string; icon: string
  query: string; setQuery: (v: string) => void
  analysing: boolean; analyseLabel: string; onAnalyse: () => void
  error: string; hasReport: boolean; children: React.ReactNode
  placeholder?: string; prefix?: string; inputWidth?: number
}) {
  const router = useRouter()
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: FONT.sans }}>
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(0,229,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,0.02) 1px,transparent 1px)', backgroundSize: '44px 44px', pointerEvents: 'none', zIndex: 0 }} />
      <nav style={{ height: 44, position: 'sticky', top: 0, zIndex: 100, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', background: 'rgba(5,5,5,0.96)', borderBottom: '1px solid rgba(0,229,255,0.07)', backdropFilter: 'blur(14px)' }}>
        <button onClick={() => router.push('/dashboard')} style={{ background: 'transparent', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 5, color: C.accent, fontSize: 11, cursor: 'pointer', padding: '4px 10px', fontFamily: FONT.mono }}>← BACK</button>
        <span style={{ fontFamily: FONT.orbitron, fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: C.accent, textShadow: '0 0 14px rgba(0,229,255,0.4)' }}>GIT PLANET</span>
        <span style={{ fontFamily: FONT.mono, fontSize: 9, color: C.dim, letterSpacing: '0.1em' }}>/ {title.toUpperCase()}</span>
      </nav>
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1180, margin: '0 auto', padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ fontSize: 20, color: accent }}>{icon}</span>
              <h1 style={{ fontFamily: FONT.orbitron, fontSize: 18, fontWeight: 700, color: C.text, margin: 0, letterSpacing: '0.03em' }}>{title}</h1>
            </div>
            <p style={{ fontFamily: FONT.sans, fontSize: 12, color: C.dim, margin: '5px 0 0', maxWidth: 560, lineHeight: 1.45 }}>{subtitle}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', height: 36, background: 'rgba(13,17,23,0.8)', border: `1px solid ${accent}33`, borderRadius: 7 }}>
              <span style={{ color: `${accent}88`, fontSize: 12 }}>{prefix}</span>
              <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onAnalyse() }}
                placeholder={placeholder}
                style={{ width: inputWidth, background: 'transparent', border: 'none', outline: 'none', fontFamily: FONT.mono, fontSize: 12, color: C.text }} />
            </div>
            <button onClick={onAnalyse} disabled={!query.trim() || analysing}
              style={{ height: 36, padding: '0 16px', borderRadius: 7, cursor: query.trim() && !analysing ? 'pointer' : 'not-allowed', background: analysing ? `${accent}10` : `${accent}1a`, border: `1px solid ${query.trim() && !analysing ? accent + '66' : accent + '22'}`, color: analysing ? `${accent}88` : accent, fontFamily: FONT.orbitron, fontSize: 10, fontWeight: 600, letterSpacing: '0.08em' }}>
              {analysing ? 'SEARCHING…' : analyseLabel}
            </button>
          </div>
        </div>
        {error && <div style={{ marginBottom: 12, padding: '10px 12px', background: 'rgba(255,68,102,0.08)', border: '1px solid rgba(255,68,102,0.25)', borderRadius: 8, fontFamily: FONT.mono, fontSize: 10, color: C.danger }}>{error}</div>}
        {analysing && <LoadingPanel accent={accent} />}
        {!analysing && !hasReport && !error && <EmptyPanel accent={accent} icon={icon} />}
        {!analysing && hasReport && children}
      </div>
    </div>
  )
}

// ── Page shell (nav + sidebar repo picker + content slot) ─────────────────────

export function AnalysisShell({
  title, subtitle, accent, icon,
  user, repos, selectedRepo, setSelectedRepo,
  analysing, analyseLabel, onAnalyse, error, hasReport,
  children, sidebarExtra,
}: {
  title: string
  subtitle: string
  accent: string
  icon: string
  user: GithubUser | null
  repos: GithubRepo[]
  selectedRepo: GithubRepo | null
  setSelectedRepo: (r: GithubRepo | null) => void
  analysing: boolean
  analyseLabel: string
  onAnalyse: () => void
  error: string
  hasReport: boolean
  children: React.ReactNode
  sidebarExtra?: React.ReactNode
}) {
  const router = useRouter()

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: FONT.sans }}>
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(0,229,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,0.02) 1px,transparent 1px)', backgroundSize: '44px 44px', pointerEvents: 'none', zIndex: 0 }} />

      {/* NAV */}
      <nav style={{ height: 44, position: 'sticky', top: 0, zIndex: 100, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', background: 'rgba(5,5,5,0.96)', borderBottom: '1px solid rgba(0,229,255,0.07)', backdropFilter: 'blur(14px)' }}>
        <button onClick={() => router.push('/dashboard')} style={{ background: 'transparent', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 5, color: C.accent, fontSize: 11, cursor: 'pointer', padding: '4px 10px', fontFamily: FONT.mono }}>← BACK</button>
        <span style={{ fontFamily: FONT.orbitron, fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: C.accent, textShadow: '0 0 14px rgba(0,229,255,0.4)' }}>GIT PLANET</span>
        <span style={{ fontFamily: FONT.mono, fontSize: 9, color: C.dim, letterSpacing: '0.1em' }}>/ {title.toUpperCase()}</span>
      </nav>

      {/* GRID */}
      <div style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: '300px 1fr', gap: 12, padding: 16, alignItems: 'start' }}>

        {/* SIDEBAR */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'sticky', top: 60 }}>
          <div style={{ padding: 14, background: 'rgba(13,17,23,0.8)', border: `1px solid ${accent}33`, borderRadius: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 16, color: accent }}>{icon}</span>
              <h1 style={{ fontFamily: FONT.orbitron, fontSize: 14, fontWeight: 700, color: C.text, margin: 0, letterSpacing: '0.04em' }}>{title}</h1>
            </div>
            <p style={{ fontFamily: FONT.sans, fontSize: 11, color: C.dim, lineHeight: 1.45, margin: '0 0 12px' }}>{subtitle}</p>

            <label style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim, letterSpacing: '0.1em', display: 'block', marginBottom: 5 }}>SELECT REPOSITORY</label>
            <select
              value={selectedRepo?.id || ''}
              onChange={e => setSelectedRepo(repos.find(r => r.id === Number(e.target.value)) ?? null)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.4)', border: `1px solid ${accent}33`, color: C.text, fontFamily: FONT.mono, fontSize: 11, outline: 'none', cursor: 'pointer' }}
            >
              <option value="" style={{ background: '#0d1117' }}>— choose —</option>
              {repos.map(r => <option key={r.id} value={r.id} style={{ background: '#0d1117' }}>{r.name}</option>)}
            </select>

            {selectedRepo && (
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5 }}>
                {([['LANG', selectedRepo.language || '—'], ['★', String(selectedRepo.stargazers_count)], ['⑂', String(selectedRepo.forks_count)]] as [string, string][]).map(([k, v]) => (
                  <div key={k} style={{ padding: '5px 6px', background: 'rgba(0,0,0,0.3)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontFamily: FONT.mono, fontSize: 7, color: C.dim }}>{k}</div>
                    <div style={{ fontFamily: FONT.mono, fontSize: 10, color: C.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={onAnalyse}
              disabled={!selectedRepo || analysing}
              style={{ width: '100%', marginTop: 12, padding: 10, borderRadius: 6, cursor: selectedRepo && !analysing ? 'pointer' : 'not-allowed', background: analysing ? `${accent}10` : `${accent}1a`, border: `1px solid ${selectedRepo && !analysing ? accent + '66' : accent + '22'}`, color: analysing ? `${accent}88` : accent, fontFamily: FONT.orbitron, fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', transition: 'all 0.15s' }}
            >
              {analysing ? 'ANALYSING…' : analyseLabel}
            </button>

            {error && (
              <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(255,68,102,0.08)', border: '1px solid rgba(255,68,102,0.25)', borderRadius: 6, fontFamily: FONT.mono, fontSize: 9, color: C.danger, lineHeight: 1.4 }}>
                {error}
              </div>
            )}
          </div>
          {sidebarExtra}
        </div>

        {/* CONTENT */}
        <div style={{ minHeight: 400 }}>
          {analysing && <LoadingPanel accent={accent} />}
          {!analysing && !hasReport && !error && <EmptyPanel accent={accent} icon={icon} />}
          {!analysing && hasReport && children}
        </div>
      </div>
    </div>
  )
}

function LoadingPanel({ accent }: { accent: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, height: 400 }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', border: `2px solid ${accent}22`, borderTopColor: accent, animation: 'spin 0.8s linear infinite', boxShadow: `0 0 16px ${accent}40` }} />
      <span style={{ fontFamily: FONT.mono, fontSize: 9, letterSpacing: '0.2em', color: `${accent}99` }}>CRUNCHING SIGNALS…</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function EmptyPanel({ accent, icon }: { accent: string; icon: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, height: 400, opacity: 0.5 }}>
      <span style={{ fontSize: 48, color: accent }}>{icon}</span>
      <span style={{ fontFamily: FONT.mono, fontSize: 10, letterSpacing: '0.15em', color: C.dim }}>SELECT A REPOSITORY TO BEGIN</span>
    </div>
  )
}

// ── Reusable presentational primitives ────────────────────────────────────────

export function Card({ title, accent, icon, children, span }: {
  title?: string; accent?: string; icon?: string; children: React.ReactNode; span?: number
}) {
  return (
    <div style={{ gridColumn: span ? `span ${span}` : undefined, padding: 14, background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(0,229,255,0.1)', borderRadius: 10 }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingBottom: 9, marginBottom: 11, borderBottom: '1px solid rgba(0,229,255,0.07)' }}>
          {icon && <span style={{ fontSize: 13, color: accent ?? C.accent }}>{icon}</span>}
          <span style={{ fontFamily: FONT.orbitron, fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: accent ?? C.accent }}>{title}</span>
        </div>
      )}
      {children}
    </div>
  )
}

export function ScoreRing({ score, size = 110, label = '/ 100' }: { score: number; size?: number; label?: string }) {
  const stroke = size * 0.08
  const radius = size / 2 - stroke
  const circ = 2 * Math.PI * radius
  const dash = (Math.max(0, Math.min(100, score)) / 100) * circ
  const color = score >= 75 ? C.success : score >= 50 ? C.accent : score >= 30 ? C.gold : C.danger
  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(0,229,255,0.07)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 8px ${color})`, transition: 'stroke-dasharray 1s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: FONT.orbitron, fontSize: size * 0.26, fontWeight: 700, color, lineHeight: 1, textShadow: `0 0 14px ${color}` }}>{Math.round(score)}</span>
        <span style={{ fontFamily: FONT.mono, fontSize: 7, color: 'rgba(0,229,255,0.45)', letterSpacing: '0.1em', marginTop: 2 }}>{label}</span>
      </div>
    </div>
  )
}

export function Bar({ label, value, max = 100, color = C.accent, suffix }: {
  label: string; value: number; max?: number; color?: string; suffix?: string
}) {
  const p = Math.round((value / max) * 100)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 9, color: C.dim }}>{label}</span>
        <span style={{ fontFamily: FONT.orbitron, fontSize: 10, fontWeight: 700, color }}>{value}{suffix ?? (max === 100 ? '' : `/${max}`)}</span>
      </div>
      <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(100, p)}%`, background: color, borderRadius: 3, boxShadow: `0 0 6px ${color}`, transition: 'width 0.8s ease' }} />
      </div>
    </div>
  )
}

export function Stat({ label, value, color = C.text, hint }: { label: string; value: string | number; color?: string; hint?: string }) {
  return (
    <div style={{ padding: '9px 11px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 7 }}>
      <div style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim, letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontFamily: FONT.orbitron, fontSize: 18, fontWeight: 700, color, lineHeight: 1.2 }}>{value}</div>
      {hint && <div style={{ fontFamily: FONT.mono, fontSize: 7, color: 'rgba(125,133,144,0.7)', marginTop: 1 }}>{hint}</div>}
    </div>
  )
}

export function Pill({ text, color, positive }: { text: string; color?: string; positive?: boolean }) {
  const c = color ?? (positive === false ? C.danger : positive ? C.success : C.dim)
  return (
    <span style={{ fontFamily: FONT.mono, fontSize: 9, padding: '3px 9px', borderRadius: 20, background: `${c}14`, border: `1px solid ${c}44`, color: c, whiteSpace: 'nowrap' }}>{text}</span>
  )
}

export function AvatarRow({ avatar, login, html, right, sub }: {
  avatar: string; login: string; html?: string; right?: React.ReactNode; sub?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <img src={avatar} alt={login} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(0,229,255,0.25)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <a href={html} target="_blank" rel="noreferrer" style={{ fontFamily: FONT.mono, fontSize: 11, color: C.sub, textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{login}</a>
        {sub && <div style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim }}>{sub}</div>}
      </div>
      {right}
    </div>
  )
}

export function MiniBars({ data, color = C.accent, height = 90 }: {
  data: { label: string; count: number }[]; color?: string; height?: number
}) {
  const max = Math.max(1, ...data.map(d => d.count))
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height, paddingTop: 6 }}>
      {data.map(d => (
        <div key={d.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
          <span style={{ fontFamily: FONT.orbitron, fontSize: 10, fontWeight: 700, color }}>{d.count}</span>
          <div style={{ width: '100%', height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? 3 : 0, background: `linear-gradient(180deg, ${color}, ${color}55)`, borderRadius: '3px 3px 0 0', boxShadow: `0 0 6px ${color}66`, transition: 'height 0.8s ease' }} />
          <span style={{ fontFamily: FONT.mono, fontSize: 7, color: C.dim, textAlign: 'center', lineHeight: 1.2, height: 16 }}>{d.label}</span>
        </div>
      ))}
    </div>
  )
}

export function DualBars({ data, height = 110 }: {
  data: { month: string; opened: number; closed: number }[]; height?: number
}) {
  const max = Math.max(1, ...data.flatMap(d => [d.opened, d.closed]))
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height, paddingTop: 6 }}>
        {data.map(d => (
          <div key={d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
            <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', width: '100%', height: '100%', justifyContent: 'center' }}>
              <div style={{ width: '40%', height: `${(d.opened / max) * 100}%`, minHeight: d.opened > 0 ? 3 : 0, background: C.accent, borderRadius: '2px 2px 0 0', boxShadow: `0 0 5px ${C.accent}66` }} title={`${d.opened} opened`} />
              <div style={{ width: '40%', height: `${(d.closed / max) * 100}%`, minHeight: d.closed > 0 ? 3 : 0, background: C.success, borderRadius: '2px 2px 0 0', boxShadow: `0 0 5px ${C.success}66` }} title={`${d.closed} closed`} />
            </div>
            <span style={{ fontFamily: FONT.mono, fontSize: 7, color: C.dim }}>{d.month.slice(5)}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 8 }}>
        <Legend color={C.accent} label="OPENED" />
        <Legend color={C.success} label="CLOSED" />
      </div>
    </div>
  )
}

export function LineArea({ points, color = C.accent, height = 140, yKey, xLabels }: {
  points: number[]; color?: string; height?: number; yKey?: string; xLabels?: string[]
}) {
  const w = 600, h = height, pad = 24
  const max = Math.max(1, ...points)
  const n = points.length
  const x = (i: number) => pad + (i / Math.max(1, n - 1)) * (w - pad * 2)
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2)
  const line = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ')
  const area = `${line} L${x(n - 1)},${h - pad} L${x(0)},${h - pad} Z`
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`la-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#la-${color.replace('#', '')})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
      {points.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill={color} />
      ))}
      {xLabels && xLabels.map((lb, i) => (
        i % Math.ceil(n / 8) === 0 ? <text key={i} x={x(i)} y={h - 6} fontFamily={FONT.mono} fontSize={8} fill={C.dim} textAnchor="middle">{lb}</text> : null
      ))}
      {yKey && <text x={pad} y={14} fontFamily={FONT.mono} fontSize={8} fill={C.dim}>{yKey}: {max}</text>}
    </svg>
  )
}

export function Radar({ data, color = C.accent, size = 240 }: {
  data: { skill: string; level: number }[]; color?: string; size?: number
}) {
  const cx = size / 2, cy = size / 2, R = size * 0.32, n = data.length, levels = 4
  const angle = (i: number) => (i / n) * 2 * Math.PI - Math.PI / 2
  const pt = (i: number, r: number) => ({ x: cx + r * Math.cos(angle(i)), y: cy + r * Math.sin(angle(i)) })
  const poly = (vals: number[]) => vals.map((v, i) => { const p = pt(i, (v / 100) * R); return `${p.x},${p.y}` }).join(' ')
  const grid = ['#ffffff06', '#ffffff0d', '#ffffff15', '#ffffff20']
  return (
    <svg width="100%" viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', overflow: 'visible', maxHeight: size }}>
      {Array.from({ length: levels }, (_, l) => (
        <polygon key={l} points={data.map((_, i) => { const p = pt(i, ((l + 1) / levels) * R); return `${p.x},${p.y}` }).join(' ')} fill="none" stroke={grid[l]} strokeWidth={1} />
      ))}
      {data.map((_, i) => { const p = pt(i, R); return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.07)" strokeWidth={1} /> })}
      <polygon points={poly(data.map(d => d.level))} fill={`${color}26`} stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {data.map((d, i) => { const p = pt(i, (d.level / 100) * R); return <circle key={i} cx={p.x} cy={p.y} r={3} fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }} /> })}
      {data.map((d, i) => {
        const p = pt(i, R + 16)
        return <text key={i} x={p.x} y={p.y} fontFamily={FONT.mono} fontSize={8} fill={C.dim} textAnchor={Math.abs(p.x - cx) < 12 ? 'middle' : p.x > cx ? 'start' : 'end'} dominantBaseline="middle">{d.skill.length > 14 ? d.skill.slice(0, 13) + '…' : d.skill}</text>
      })}
    </svg>
  )
}

export function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 8, height: 8, borderRadius: 2, background: color, boxShadow: `0 0 5px ${color}` }} />
      <span style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim, letterSpacing: '0.06em' }}>{label}</span>
    </div>
  )
}

export function StepList({ items, accent = C.accent, numbered = true }: {
  items: { title: string; detail?: string }[]; accent?: string; numbered?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
          <div style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: `${accent}18`, border: `1px solid ${accent}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT.orbitron, fontSize: 10, fontWeight: 700, color: accent }}>
            {numbered ? i + 1 : '▹'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: C.text, lineHeight: 1.45, fontWeight: 500 }}>{it.title}</div>
            {it.detail && <div style={{ fontFamily: FONT.sans, fontSize: 11, color: C.dim, lineHeight: 1.5, marginTop: 2 }}>{it.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

export function Chips({ items, color = C.accent, positive }: { items: string[]; color?: string; positive?: boolean }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map((t, i) => <Pill key={i} text={t} color={color} positive={positive} />)}
    </div>
  )
}

export function CodeLine({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: FONT.mono, fontSize: 11, color: C.success, padding: '6px 10px', background: 'rgba(0,0,0,0.35)', borderRadius: 5, border: '1px solid rgba(0,255,136,0.15)' }}>
      <span style={{ color: C.dim }}>$ </span>{children}
    </div>
  )
}

export function AiSummary({ text, accent = C.purple }: { text: string; accent?: string }) {
  if (!text) return null
  return (
    <div style={{ padding: 14, background: `${accent}0a`, border: `1px solid ${accent}33`, borderRadius: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 12 }}>✦</span>
        <span style={{ fontFamily: FONT.orbitron, fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', color: accent }}>AI ANALYSIS</span>
      </div>
      <p style={{ fontFamily: FONT.sans, fontSize: 12, color: C.sub, lineHeight: 1.6, margin: 0 }}>{text}</p>
    </div>
  )
}
