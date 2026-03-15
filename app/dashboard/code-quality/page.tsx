'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { QualityReport } from '@/app/api/github/code-quality/route'
import type { GenerateTestsResult } from '@/app/api/github/code-quality/generate-tests/route'

// ── Markdown renderer (no ** or ##) ───────────────────────────────────────────

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(`[^`]+`)/)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('`') && p.endsWith('`') && p.length > 2
          ? <code key={i} style={{ fontFamily: "'JetBrains Mono',monospace", background: 'rgba(0,229,255,0.12)', padding: '1px 4px', borderRadius: 2, color: '#00E5FF', fontSize: 10 }}>{p.slice(1, -1)}</code>
          : <span key={i}>{p}</span>
      )}
    </>
  )
}

function ChatMarkdown({ text }: { text: string }) {
  const lines = text.split('\n').filter(l => l.trim())
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {lines.map((line, i) => {
        const t = line.trim()
        if (/^(\d+)\.\s/.test(t)) {
          const num = t.match(/^(\d+)/)?.[1]
          return (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, color: '#00E5FF', flexShrink: 0, marginTop: 1 }}>{num}.</span>
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: '#c9d1d9', lineHeight: 1.5 }}>{renderInline(t.replace(/^\d+\.\s/, ''))}</span>
            </div>
          )
        }
        if (/^[-•]\s/.test(t)) {
          return (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <span style={{ color: '#00E5FF', flexShrink: 0, marginTop: 2, fontSize: 9 }}>·</span>
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: '#c9d1d9', lineHeight: 1.5 }}>{renderInline(t.replace(/^[-•]\s/, ''))}</span>
            </div>
          )
        }
        return (
          <p key={i} style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: '#c9d1d9', lineHeight: 1.55, margin: 0 }}>
            {renderInline(t)}
          </p>
        )
      })}
    </div>
  )
}

interface ChatMsg { role: 'user' | 'ai'; text: string }

// ── Types ──────────────────────────────────────────────────────────────────────

interface GithubUser { login: string; name: string | null; avatar_url: string }
interface GithubRepo {
  id: number; name: string; description: string | null
  language: string | null; stargazers_count: number; forks_count: number
  html_url: string; updated_at: string
}

// ── Score ring ─────────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const radius = 34
  const circ = 2 * Math.PI * radius
  const dash = (score / 100) * circ
  const color = score >= 75 ? '#00ff88' : score >= 50 ? '#00E5FF' : score >= 25 ? '#f0a500' : '#ff4466'

  return (
    <div style={{ position: 'relative', width: 88, height: 88, margin: '0 auto' }}>
      <svg width={88} height={88} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={44} cy={44} r={radius} fill="none" stroke="rgba(0,229,255,0.07)" strokeWidth={7} />
        <circle
          cx={44} cy={44} r={radius} fill="none"
          stroke={color} strokeWidth={7}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 8px ${color})`, transition: 'stroke-dasharray 1s ease' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 22, fontWeight: 700, color, lineHeight: 1, textShadow: `0 0 14px ${color}` }}>
          {score}
        </span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: 'rgba(0,229,255,0.45)', letterSpacing: '0.1em', marginTop: 2 }}>
          / 100
        </span>
      </div>
    </div>
  )
}

// ── Score bar ──────────────────────────────────────────────────────────────────

function ScoreBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.round((value / max) * 100)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590' }}>{label}</span>
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, fontWeight: 700, color }}>{value}<span style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)' }}>/{max}</span></span>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, boxShadow: `0 0 6px ${color}`, transition: 'width 0.8s ease' }} />
      </div>
    </div>
  )
}

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({ title, accent, icon, children }: {
  title: string; accent: string; icon: string; children: React.ReactNode
}) {
  return (
    <div style={{ background: 'rgba(13,17,23,0.8)', border: `1px solid ${accent}18`, borderRadius: 9, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${accent}14`, display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: accent }}>{icon}</span>
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: accent }}>{title}</span>
      </div>
      <div style={{ padding: '10px 14px', flex: 1 }}>{children}</div>
    </div>
  )
}

// ── Badge ──────────────────────────────────────────────────────────────────────

function Badge({ label, color, dim = false }: { label: string; color: string; dim?: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 7px', borderRadius: 3,
      background: dim ? 'rgba(255,255,255,0.03)' : `${color}14`,
      border: `1px solid ${dim ? 'rgba(255,255,255,0.08)' : color + '44'}`,
      fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
      color: dim ? '#7d8590' : color,
    }}>
      {label}
    </span>
  )
}

// ── Pill row ───────────────────────────────────────────────────────────────────

function PillRow({ items, color, emptyMsg }: { items: string[]; color: string; emptyMsg: string }) {
  if (items.length === 0) return (
    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590' }}>{emptyMsg}</span>
  )
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {items.map((i, idx) => <Badge key={`${i}-${idx}`} label={i} color={color} />)}
    </div>
  )
}

// ── Metric row ─────────────────────────────────────────────────────────────────

function MetricRow({ label, value, color = '#e6edf3' }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590' }}>{label}</span>
      <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, fontWeight: 700, color }}>{value}</span>
    </div>
  )
}

// ── Status dot ────────────────────────────────────────────────────────────────

function StatusDot({ on }: { on: boolean }) {
  return (
    <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: on ? '#00ff88' : '#ff4466', boxShadow: on ? '0 0 6px #00ff88' : '0 0 6px #ff4466' }} />
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function CodeQualityPage() {
  const router = useRouter()
  const [user, setUser] = useState<GithubUser | null>(null)
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRepo, setSelectedRepo] = useState<GithubRepo | null>(null)
  const [analysing, setAnalysing] = useState(false)
  const [report, setReport] = useState<QualityReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  // chat
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)

  // test generator
  const [activeTab, setActiveTab] = useState<'analysis' | 'tests'>('analysis')
  const [generatingPath, setGeneratingPath] = useState<string | null>(null)
  const [generatedTests, setGeneratedTests] = useState<Record<string, GenerateTestsResult>>({})
  const [committingPath, setCommittingPath] = useState<string | null>(null)
  const [commitResults, setCommitResults] = useState<Record<string, 'success' | 'error'>>({})
  const [expandedTest, setExpandedTest] = useState<string | null>(null)
  const [copiedPath, setCopiedPath] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/github/user')
      .then(r => { if (r.status === 401) { router.push('/'); return null } return r.json() })
      .then(d => {
        if (!d) return
        setUser(d.user)
        const sorted = [...d.repos].sort((a: GithubRepo, b: GithubRepo) => b.stargazers_count - a.stargazers_count)
        setRepos(sorted)
        if (sorted.length) setSelectedRepo(sorted[0])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [router])

  async function handleAnalyse() {
    if (!selectedRepo || !user) return
    setAnalysing(true)
    setReport(null)
    setError(null)
    setChatMsgs([])
    setChatInput('')
    setGeneratedTests({})
    setCommitResults({})
    setActiveTab('analysis')
    try {
      const res = await fetch(`/api/github/code-quality?owner=${user.login}&repo=${selectedRepo.name}`)
      if (!res.ok) throw new Error(`Analysis failed (${res.status})`)
      const data: QualityReport = await res.json()
      setReport(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setAnalysing(false)
    }
  }

  const handleSend = useCallback(async () => {
    const msg = chatInput.trim()
    if (!msg || chatLoading) return
    setChatInput('')
    setChatMsgs(prev => [...prev, { role: 'user', text: msg }])
    setChatLoading(true)
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 30)
    try {
      const res = await fetch('/api/github/code-quality/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, report, repoName: selectedRepo?.name ?? '' }),
      })
      const data = await res.json()
      const reply: string = res.ok ? data.reply : (data.error ?? 'Something went wrong.')
      setChatMsgs(prev => [...prev, { role: 'ai', text: reply }])
    } catch {
      setChatMsgs(prev => [...prev, { role: 'ai', text: 'Network error — could not reach AI advisor.' }])
    } finally {
      setChatLoading(false)
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60)
    }
  }, [chatInput, chatLoading, report, selectedRepo])

  async function handleGenerateTest(sourcePath: string) {
    if (!selectedRepo || !user || !report) return
    setGeneratingPath(sourcePath)
    setExpandedTest(sourcePath)
    try {
      const res = await fetch('/api/github/code-quality/generate-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: user.login, repo: selectedRepo.name, sourcePath,
          existingTestPaths: report.testing.existingTestPaths,
          testFrameworks: report.testing.testFrameworks,
          branch: 'main',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')
      setGeneratedTests(prev => ({ ...prev, [sourcePath]: data as GenerateTestsResult }))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Test generation failed')
    } finally {
      setGeneratingPath(null)
    }
  }

  async function handleCommitTest(sourcePath: string) {
    if (!selectedRepo || !user) return
    const gen = generatedTests[sourcePath]
    if (!gen) return
    setCommittingPath(sourcePath)
    try {
      const res = await fetch('/api/github/code-quality/commit-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: user.login, repo: selectedRepo.name,
          testFilePath: gen.suggestedPath, testCode: gen.testCode,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Commit failed')
      setCommitResults(prev => ({ ...prev, [sourcePath]: 'success' }))
      window.open(data.url, '_blank')
    } catch (e) {
      setCommitResults(prev => ({ ...prev, [sourcePath]: 'error' }))
      alert(e instanceof Error ? e.message : 'Commit failed')
    } finally {
      setCommittingPath(null)
    }
  }

  async function handleCopy(sourcePath: string) {
    const gen = generatedTests[sourcePath]
    if (!gen) return
    await navigator.clipboard.writeText(gen.testCode)
    setCopiedPath(sourcePath)
    setTimeout(() => setCopiedPath(p => p === sourcePath ? null : p), 2000)
  }

  if (loading) return (
    <div style={{ height: '100vh', background: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid rgba(0,229,255,0.15)', borderTopColor: '#00E5FF', animation: 'spin 0.8s linear infinite' }} />
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: '0.2em', color: 'rgba(0,229,255,0.55)' }}>LOADING...</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  if (!user) return null

  const scoreColor = report
    ? report.score >= 75 ? '#00ff88' : report.score >= 50 ? '#00E5FF' : report.score >= 25 ? '#f0a500' : '#ff4466'
    : '#00E5FF'

  const scoreLabel = report
    ? report.score >= 75 ? 'EXCELLENT' : report.score >= 50 ? 'GOOD' : report.score >= 25 ? 'FAIR' : 'POOR'
    : '—'

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#050505', color: '#e6edf3', fontFamily: "'Space Grotesk',sans-serif" }}>
      {/* Grid background */}
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(0,229,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,0.02) 1px,transparent 1px)', backgroundSize: '44px 44px', pointerEvents: 'none', zIndex: 0 }} />

      {/* NAV */}
      <nav style={{ height: 44, flexShrink: 0, position: 'relative', zIndex: 100, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', background: 'rgba(5,5,5,0.96)', borderBottom: '1px solid rgba(0,229,255,0.07)', backdropFilter: 'blur(14px)' }}>
        <button
          onClick={() => router.back()}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: 'transparent', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 5, color: '#00E5FF', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: '0.08em', cursor: 'pointer' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,229,255,0.08)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
        >
          ← BACK
        </button>
        <div style={{ width: 1, height: 20, background: 'rgba(0,229,255,0.1)' }} />
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: '#00E5FF', textShadow: '0 0 14px rgba(0,229,255,0.4)' }}>GIT PLANET</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(0,229,255,0.35)' }}>/</span>
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: '#e6edf3' }}>CODE QUALITY ANALYSER</span>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {report && (
            <>
              <div style={{ padding: '3px 10px', borderRadius: 4, background: `${scoreColor}14`, border: `1px solid ${scoreColor}44` }}>
                <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, color: scoreColor, letterSpacing: '0.08em' }}>
                  {scoreLabel} · {report.score}/100
                </span>
              </div>
              <div style={{ width: 1, height: 20, background: 'rgba(0,229,255,0.1)' }} />
            </>
          )}
          <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, color: '#e6edf3', letterSpacing: '0.06em' }}>
            {(user.name || user.login).toUpperCase()}
          </div>
          <img src={user.avatar_url} style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid rgba(0,229,255,0.3)', objectFit: 'cover' }} alt="" />
        </div>
      </nav>

      {/* MAIN GRID */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: '300px 1fr', gap: 8, padding: '8px 12px' }}>

        {/* ── LEFT PANEL ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', overflowX: 'hidden', minHeight: 0, scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,229,255,0.15) transparent' }}>

          {/* Generator card */}
          <div style={{ flexShrink: 0, padding: '13px 14px', background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(0,229,255,0.12)', borderRadius: 9, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: '#00E5FF', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>◎</span> QUALITY ANALYSER
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#7d8590', letterSpacing: '0.07em' }}>REPOSITORY</label>
              <select
                value={selectedRepo?.id || ''}
                onChange={e => {
                  const r = repos.find(r => r.id === Number(e.target.value))
                  if (r) { setSelectedRepo(r); setReport(null); setError(null); setChatMsgs([]); setChatInput(''); setGeneratedTests({}); setCommitResults({}); setActiveTab('analysis') }
                }}
                style={{ width: '100%', padding: '7px 9px', background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.18)', borderRadius: 5, color: '#e6edf3', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, outline: 'none', cursor: 'pointer' }}
              >
                {repos.map(r => <option key={r.id} value={r.id} style={{ background: '#0d1117' }}>{r.name}</option>)}
              </select>
            </div>
            {selectedRepo && (
              <div style={{ padding: '8px 10px', background: 'rgba(0,229,255,0.03)', border: '1px solid rgba(0,229,255,0.08)', borderRadius: 5, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {([['LANGUAGE', selectedRepo.language || 'Unknown'], ['STARS', String(selectedRepo.stargazers_count)], ['FORKS', String(selectedRepo.forks_count)]] as [string, string][]).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#7d8590' }}>{k}:</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#00E5FF' }}>{v}</span>
                  </div>
                ))}
                {selectedRepo.description && (
                  <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: '#7d8590', margin: 0, lineHeight: 1.4, marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {selectedRepo.description}
                  </p>
                )}
              </div>
            )}
            <button
              onClick={handleAnalyse}
              disabled={!selectedRepo || analysing}
              style={{ width: '100%', padding: '9px', borderRadius: 6, cursor: selectedRepo && !analysing ? 'pointer' : 'not-allowed', background: analysing ? 'rgba(0,229,255,0.06)' : 'rgba(0,229,255,0.1)', border: `1px solid ${analysing ? 'rgba(0,229,255,0.25)' : 'rgba(0,229,255,0.4)'}`, color: analysing ? 'rgba(0,229,255,0.5)' : '#00E5FF', fontFamily: "'Orbitron',monospace", fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', transition: 'all 0.15s' }}
              onMouseEnter={e => { if (!analysing) (e.currentTarget as HTMLElement).style.background = 'rgba(0,229,255,0.18)' }}
              onMouseLeave={e => { if (!analysing) (e.currentTarget as HTMLElement).style.background = 'rgba(0,229,255,0.1)' }}
            >
              {analysing ? '⟳ ANALYSING CODE...' : '◎ RUN ANALYSIS'}
            </button>
            {error && (
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#ff4466', padding: '6px 8px', background: 'rgba(255,68,102,0.06)', border: '1px solid rgba(255,68,102,0.15)', borderRadius: 4 }}>
                {error}
              </div>
            )}
          </div>

          {/* Score display */}
          {report && (
            <div style={{ flexShrink: 0, padding: '10px 14px', background: 'rgba(13,17,23,0.8)', border: `1px solid ${scoreColor}22`, borderRadius: 9, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
              <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: '#e6edf3', alignSelf: 'flex-start' }}>
                CODE QUALITY SCORE
              </div>
              <ScoreRing score={report.score} />
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <ScoreBar label="STRUCTURAL" value={report.breakdown.structuralScore} max={40} color="#7B61FF" />
                <ScoreBar label="TESTING" value={report.breakdown.testingScore} max={40} color="#00E5FF" />
                <ScoreBar label="PRACTICES" value={report.breakdown.practicesScore} max={20} color="#00ff88" />
              </div>
            </div>
          )}

          {/* Meta */}
          {report && (
            <div style={{ flexShrink: 0, padding: '9px 14px', background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(0,229,255,0.1)', borderRadius: 9, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', color: '#00E5FF', marginBottom: 4 }}>REPOSITORY STATS</div>
              <MetricRow label="TOTAL FILES" value={report.meta.totalFiles} color="#e6edf3" />
              <MetricRow label="SOURCE FILES" value={report.meta.sourceFiles} color="#7B61FF" />
              <MetricRow label="TEST FILES" value={report.meta.testFiles} color="#00E5FF" />
              <MetricRow label="FILES ANALYSED" value={report.meta.filesAnalyzed} color="#e6edf3" />
              <MetricRow label="TOTAL LINES" value={report.meta.totalLines.toLocaleString()} color="#e6edf3" />
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden', minHeight: 0 }}>
          <div style={{ flex: 1, minHeight: 0, background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(0,229,255,0.1)', borderRadius: 9, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

            {/* Panel header + tabs */}
            <div style={{ flexShrink: 0, padding: '0 14px', borderBottom: '1px solid rgba(0,229,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 40 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: '100%' }}>
                {([
                  ['analysis', '● ANALYSIS'],
                  ['tests', `◈ GENERATE TESTS${report && report.testing.untestedSourcePaths.length > 0 ? ` (${report.testing.untestedSourcePaths.length})` : ''}`],
                ] as [string, string][]).map(([tab, label]) => (
                  <button key={tab} onClick={() => setActiveTab(tab as 'analysis' | 'tests')}
                    style={{
                      height: '100%', padding: '0 14px', background: 'transparent', border: 'none',
                      borderBottom: activeTab === tab ? '2px solid #00E5FF' : '2px solid transparent',
                      cursor: 'pointer', fontFamily: "'Orbitron',monospace", fontSize: 9, fontWeight: 600,
                      letterSpacing: '0.1em', color: activeTab === tab ? '#00E5FF' : '#7d8590',
                      transition: 'all 0.15s',
                    }}
                  >{label}</button>
                ))}
              </div>
              {report && (
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(0,229,255,0.4)' }}>
                  {report.structural.issueCount} ISSUES · {report.testing.coveragePercent}% COVERAGE · {report.testing.testFrameworks.join(', ') || 'NO FRAMEWORK'}
                </span>
              )}
            </div>

            {/* Panel body */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,229,255,0.15) transparent' }}>
              {activeTab === 'tests' && report ? (
                /* ── GENERATE TESTS TAB ── */
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>

                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: '#00E5FF' }}>
                        TEST GENERATOR
                      </span>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590' }}>
                        {report.testing.untestedSourcePaths.length} untested modules · framework: {report.testing.testFrameworks[0] || 'auto-detect'}
                      </span>
                    </div>
                    {report.testing.untestedSourcePaths.length > 1 && (
                      <button
                        onClick={() => report.testing.untestedSourcePaths.slice(0, 5).forEach((p, i) => setTimeout(() => handleGenerateTest(p), i * 400))}
                        disabled={generatingPath !== null}
                        style={{ padding: '5px 12px', background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.3)', borderRadius: 5, cursor: 'pointer', fontFamily: "'Orbitron',monospace", fontSize: 8, fontWeight: 600, color: '#00E5FF', letterSpacing: '0.08em' }}
                      >
                        ⊕ GENERATE ALL
                      </button>
                    )}
                  </div>

                  {/* Untested modules list */}
                  {report.testing.untestedSourcePaths.length === 0 ? (
                    <div style={{ padding: '16px', background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.15)', borderRadius: 7, textAlign: 'center' }}>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#00ff88' }}>// ALL MODULES HAVE TESTS</div>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590', marginTop: 4 }}>No test generation needed for this repository.</div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {report.testing.untestedSourcePaths.map((srcPath, i) => {
                        const modName = srcPath.split('/').pop() ?? srcPath
                        const isCritical = report.testing.criticalUntested.includes(report.testing.untestedModules[i] ?? '')
                        const isGenerating = generatingPath === srcPath
                        const isDone = !!generatedTests[srcPath]
                        const isExpanded = expandedTest === srcPath
                        const commitStatus = commitResults[srcPath]
                        return (
                          <div key={srcPath} style={{ background: 'rgba(13,17,23,0.6)', border: `1px solid ${isDone ? 'rgba(0,229,255,0.2)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 7, overflow: 'hidden' }}>
                            {/* Module row */}
                            <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                              {isCritical && (
                                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#ff4466', background: 'rgba(255,68,102,0.1)', border: '1px solid rgba(255,68,102,0.2)', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>CRITICAL</span>
                              )}
                              <div style={{ flex: 1, overflow: 'hidden' }}>
                                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#e6edf3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{modName}</div>
                                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#7d8590', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{srcPath}</div>
                              </div>
                              <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                                {isDone && (
                                  <button onClick={() => setExpandedTest(isExpanded ? null : srcPath)}
                                    style={{ padding: '4px 9px', background: 'transparent', border: '1px solid rgba(0,229,255,0.2)', borderRadius: 4, cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#00E5FF' }}>
                                    {isExpanded ? '▲ HIDE' : '▼ VIEW'}
                                  </button>
                                )}
                                <button
                                  onClick={() => handleGenerateTest(srcPath)}
                                  disabled={isGenerating || generatingPath !== null}
                                  style={{ padding: '4px 11px', background: isDone ? 'rgba(0,229,255,0.06)' : 'rgba(0,229,255,0.1)', border: `1px solid ${isDone ? 'rgba(0,229,255,0.15)' : 'rgba(0,229,255,0.35)'}`, borderRadius: 4, cursor: isGenerating ? 'not-allowed' : 'pointer', fontFamily: "'Orbitron',monospace", fontSize: 8, fontWeight: 600, color: isDone ? 'rgba(0,229,255,0.5)' : '#00E5FF', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 5 }}
                                >
                                  {isGenerating ? (
                                    <>{[0,1,2].map(k => <span key={k} style={{ width: 4, height: 4, borderRadius: '50%', background: '#00E5FF', display: 'inline-block', animation: `chatdot 1.2s ease-in-out ${k*0.2}s infinite` }} />)}</>
                                  ) : isDone ? '↻ REGEN' : '⊕ GENERATE'}
                                </button>
                              </div>
                            </div>

                            {/* Expanded: file structure + code */}
                            {isDone && isExpanded && generatedTests[srcPath] && (() => {
                              const gen = generatedTests[srcPath]
                              return (
                                <div style={{ borderTop: '1px solid rgba(0,229,255,0.08)' }}>
                                  {/* File structure tree */}
                                  <div style={{ padding: '8px 12px', background: 'rgba(0,229,255,0.03)', borderBottom: '1px solid rgba(0,229,255,0.06)' }}>
                                    <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 8, color: '#00E5FF', letterSpacing: '0.1em', marginBottom: 5 }}>FILE LOCATION</div>
                                    <pre style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#e6edf3', margin: 0, lineHeight: 1.6, background: 'transparent' }}>{gen.tree}</pre>
                                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590' }}>Full path:</span>
                                      <code style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#00E5FF', background: 'rgba(0,229,255,0.08)', padding: '1px 6px', borderRadius: 3 }}>{gen.suggestedPath}</code>
                                    </div>
                                  </div>
                                  {/* Test code */}
                                  <div style={{ position: 'relative' }}>
                                    <pre style={{
                                      margin: 0, padding: '10px 14px',
                                      fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
                                      color: '#c9d1d9', lineHeight: 1.55,
                                      background: 'rgba(0,0,0,0.3)',
                                      overflowX: 'auto',
                                      maxHeight: 320, overflowY: 'auto',
                                      scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,229,255,0.15) transparent',
                                    }}>{gen.testCode}</pre>
                                    {/* Action bar */}
                                    <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(0,229,255,0.07)', display: 'flex', gap: 7, alignItems: 'center' }}>
                                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#7d8590', flex: 1 }}>
                                        {gen.framework} · {gen.testCode.split('\n').length} lines
                                      </span>
                                      <button
                                        onClick={() => handleCopy(srcPath)}
                                        style={{ padding: '4px 12px', background: copiedPath === srcPath ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.04)', border: `1px solid ${copiedPath === srcPath ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 4, cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: copiedPath === srcPath ? '#00ff88' : '#e6edf3' }}
                                      >
                                        {copiedPath === srcPath ? '✓ COPIED' : '⎘ COPY'}
                                      </button>
                                      <button
                                        onClick={() => handleCommitTest(srcPath)}
                                        disabled={committingPath === srcPath}
                                        style={{ padding: '4px 12px', background: commitStatus === 'success' ? 'rgba(0,255,136,0.1)' : commitStatus === 'error' ? 'rgba(255,68,102,0.08)' : 'rgba(0,229,255,0.1)', border: `1px solid ${commitStatus === 'success' ? 'rgba(0,255,136,0.3)' : commitStatus === 'error' ? 'rgba(255,68,102,0.25)' : 'rgba(0,229,255,0.35)'}`, borderRadius: 4, cursor: committingPath === srcPath ? 'not-allowed' : 'pointer', fontFamily: "'Orbitron',monospace", fontSize: 8, fontWeight: 600, color: commitStatus === 'success' ? '#00ff88' : commitStatus === 'error' ? '#ff4466' : '#00E5FF', letterSpacing: '0.06em' }}
                                      >
                                        {committingPath === srcPath ? '...' : commitStatus === 'success' ? '✓ COMMITTED' : commitStatus === 'error' ? '✗ RETRY' : '⬆ COMMIT TO GITHUB'}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )
                            })()}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : analysing ? (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                  <div style={{ position: 'relative', width: 60, height: 60 }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{ position: 'absolute', inset: i * 8, borderRadius: '50%', border: `1.5px solid rgba(0,229,255,${0.5 - i * 0.12})`, borderTopColor: i === 0 ? '#00E5FF' : 'transparent', animation: `spin ${0.7 + i * 0.3}s linear infinite${i % 2 === 1 ? ' reverse' : ''}` }} />
                    ))}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: '0.16em', color: 'rgba(0,229,255,0.7)' }}>SCANNING CODE QUALITY...</div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590', marginTop: 5 }}>AST analysis · duplicate detection · test coverage · scoring</div>
                  </div>
                </div>
              ) : report ? (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: 10 }}>

                  {/* Row 1: Structural + Testing side by side */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>

                    {/* Structural Issues */}
                    <SectionCard title="STRUCTURAL ISSUES" accent="#7B61FF" icon="⬡">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                        {/* Large functions */}
                        <div>
                          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590', letterSpacing: '0.07em', marginBottom: 5 }}>
                            LARGE FUNCTIONS <span style={{ color: report.structural.largeFunctions.length > 0 ? '#f0a500' : '#00ff88' }}>({report.structural.largeFunctions.length} &gt;80 lines)</span>
                          </div>
                          {report.structural.largeFunctions.length === 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <StatusDot on={true} />
                              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#00ff88' }}>No large functions detected</span>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              {report.structural.largeFunctions.slice(0, 5).map((fn, i) => (
                                <div key={i} style={{ padding: '4px 7px', background: 'rgba(240,165,0,0.05)', border: '1px solid rgba(240,165,0,0.12)', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ overflow: 'hidden' }}>
                                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#e6edf3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fn.name}</div>
                                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#7d8590', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fn.path.split('/').slice(-2).join('/')}</div>
                                  </div>
                                  <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, color: '#f0a500', fontWeight: 700, flexShrink: 0, marginLeft: 6 }}>{fn.lines}L</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Complex files */}
                        <div>
                          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590', letterSpacing: '0.07em', marginBottom: 5 }}>
                            COMPLEX FILES <span style={{ color: report.structural.complexFiles.length > 0 ? '#f0a500' : '#00ff88' }}>({report.structural.complexFiles.length} with &gt;8 functions)</span>
                          </div>
                          {report.structural.complexFiles.length === 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <StatusDot on={true} />
                              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#00ff88' }}>No complex files detected</span>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              {report.structural.complexFiles.slice(0, 4).map((cf, i) => (
                                <div key={i} style={{ padding: '4px 7px', background: 'rgba(123,97,255,0.05)', border: '1px solid rgba(123,97,255,0.12)', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ overflow: 'hidden' }}>
                                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#e6edf3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cf.path.split('/').pop()}</div>
                                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#7d8590' }}>avg {cf.avgFunctionLines}L/fn</div>
                                  </div>
                                  <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, color: '#7B61FF', fontWeight: 700, flexShrink: 0, marginLeft: 6 }}>{cf.functionCount} fns</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Duplicate blocks */}
                        <div>
                          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590', letterSpacing: '0.07em', marginBottom: 5 }}>
                            DUPLICATE CODE <span style={{ color: report.structural.duplicateBlocks.length > 0 ? '#ff4466' : '#00ff88' }}>({report.structural.duplicateBlocks.length} blocks)</span>
                          </div>
                          {report.structural.duplicateBlocks.length === 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <StatusDot on={true} />
                              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#00ff88' }}>No duplicate blocks found</span>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {report.structural.duplicateBlocks.slice(0, 3).map((dup, i) => (
                                <div key={i} style={{ padding: '5px 7px', background: 'rgba(255,68,102,0.04)', border: '1px solid rgba(255,68,102,0.12)', borderRadius: 4 }}>
                                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#ff4466', marginBottom: 3 }}>DUPLICATE IN {dup.count} FILES</div>
                                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#7d8590', marginBottom: 3, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {dup.preview[0]}
                                  </div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                    {dup.files.map(f => <Badge key={f} label={f.split('/').pop() ?? f} color="#ff4466" />)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </SectionCard>

                    {/* Testing Health */}
                    <SectionCard title="TESTING HEALTH" accent="#00E5FF" icon="◎">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                        {/* Coverage metrics */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590', letterSpacing: '0.07em', marginBottom: 2 }}>COVERAGE METRICS</div>
                          <div style={{ padding: '8px 10px', background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.1)', borderRadius: 5, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {/* Coverage bar */}
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590' }}>MODULE COVERAGE</span>
                                <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, fontWeight: 700, color: report.testing.coveragePercent >= 70 ? '#00ff88' : report.testing.coveragePercent >= 40 ? '#f0a500' : '#ff4466' }}>
                                  {report.testing.coveragePercent}%
                                </span>
                              </div>
                              <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${report.testing.coveragePercent}%`, background: report.testing.coveragePercent >= 70 ? '#00ff88' : report.testing.coveragePercent >= 40 ? '#f0a500' : '#ff4466', borderRadius: 3, transition: 'width 0.8s ease' }} />
                              </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590' }}>TEST:CODE RATIO</span>
                              <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, fontWeight: 700, color: '#00E5FF' }}>{report.testing.testToCodeRatio.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Test frameworks */}
                        <div>
                          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590', letterSpacing: '0.07em', marginBottom: 5 }}>TEST FRAMEWORKS</div>
                          <PillRow items={report.testing.testFrameworks} color="#00E5FF" emptyMsg="No frameworks detected" />
                        </div>

                        {/* Critical untested */}
                        {report.testing.criticalUntested.length > 0 && (
                          <div>
                            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#ff4466', letterSpacing: '0.07em', marginBottom: 5 }}>
                              ⚠ CRITICAL UNTESTED ({report.testing.criticalUntested.length})
                            </div>
                            <PillRow items={report.testing.criticalUntested} color="#ff4466" emptyMsg="" />
                          </div>
                        )}

                        {/* Untested modules */}
                        <div>
                          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590', letterSpacing: '0.07em', marginBottom: 5 }}>
                            UNTESTED MODULES <span style={{ color: report.testing.untestedModules.length > 0 ? '#f0a500' : '#00ff88' }}>({report.testing.untestedModules.length})</span>
                          </div>
                          {report.testing.untestedModules.length === 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <StatusDot on={true} />
                              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#00ff88' }}>All modules have tests</span>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {report.testing.untestedModules.slice(0, 10).map((m, idx) => <Badge key={`${m}-${idx}`} label={m} color="#f0a500" />)}
                              {report.testing.untestedModules.length > 10 && (
                                <Badge label={`+${report.testing.untestedModules.length - 10} more`} color="#7d8590" dim />
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </SectionCard>
                  </div>

                  {/* Row 2: Testing Practices (full width) */}
                  <SectionCard title="TESTING PRACTICES" accent="#00ff88" icon="✦">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>

                      {/* Unit Tests */}
                      <div style={{ padding: '10px 12px', background: `rgba(0,255,136,${report.practices.hasUnitTests ? '0.05' : '0.01'})`, border: `1px solid rgba(0,255,136,${report.practices.hasUnitTests ? '0.2' : '0.07'})`, borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <StatusDot on={report.practices.hasUnitTests} />
                          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: report.practices.hasUnitTests ? '#00ff88' : '#7d8590' }}>UNIT TESTS</span>
                        </div>
                        <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 20, fontWeight: 700, color: report.practices.hasUnitTests ? '#00ff88' : '#7d8590' }}>
                          {report.practices.hasUnitTests ? 'YES' : 'NO'}
                        </div>
                        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#7d8590', lineHeight: 1.4 }}>
                          describe/it/test patterns found in test files
                        </div>
                      </div>

                      {/* Mock Usage */}
                      <div style={{ padding: '10px 12px', background: `rgba(0,229,255,${report.practices.hasMocks ? '0.05' : '0.01'})`, border: `1px solid rgba(0,229,255,${report.practices.hasMocks ? '0.2' : '0.07'})`, borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <StatusDot on={report.practices.hasMocks} />
                          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: report.practices.hasMocks ? '#00E5FF' : '#7d8590' }}>MOCK USAGE</span>
                        </div>
                        <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 20, fontWeight: 700, color: report.practices.hasMocks ? '#00E5FF' : '#7d8590' }}>
                          {report.practices.mockCount > 0 ? report.practices.mockCount : 'NONE'}
                        </div>
                        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#7d8590', lineHeight: 1.4 }}>
                          jest.fn / vi.fn / sinon stubs detected
                        </div>
                      </div>

                      {/* Integration Tests */}
                      <div style={{ padding: '10px 12px', background: `rgba(123,97,255,${report.practices.hasIntegrationTests ? '0.05' : '0.01'})`, border: `1px solid rgba(123,97,255,${report.practices.hasIntegrationTests ? '0.2' : '0.07'})`, borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <StatusDot on={report.practices.hasIntegrationTests} />
                          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: report.practices.hasIntegrationTests ? '#7B61FF' : '#7d8590' }}>INTEGRATION</span>
                        </div>
                        <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 20, fontWeight: 700, color: report.practices.hasIntegrationTests ? '#7B61FF' : '#7d8590' }}>
                          {report.practices.integrationCount > 0 ? report.practices.integrationCount : 'NONE'}
                        </div>
                        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#7d8590', lineHeight: 1.4 }}>
                          integration / e2e / supertest patterns
                        </div>
                      </div>

                      {/* Assertion Density */}
                      <div style={{ padding: '10px 12px', background: `rgba(240,165,0,${report.practices.assertionDensity > 2 ? '0.05' : '0.01'})`, border: `1px solid rgba(240,165,0,${report.practices.assertionDensity > 2 ? '0.2' : '0.07'})`, borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <StatusDot on={report.practices.assertionDensity > 2} />
                          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: report.practices.assertionDensity > 2 ? '#f0a500' : '#7d8590' }}>ASSERTION DENSITY</span>
                        </div>
                        <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 20, fontWeight: 700, color: report.practices.assertionDensity > 2 ? '#f0a500' : '#7d8590' }}>
                          {report.practices.assertionDensity}<span style={{ fontSize: 11, color: '#7d8590' }}>/file</span>
                        </div>
                        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#7d8590', lineHeight: 1.4 }}>
                          avg expect/assert calls per test file
                        </div>
                      </div>
                    </div>
                  </SectionCard>

                </div>
              ) : (
                /* Empty state */
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, opacity: 0.45 }}>
                  <div style={{ position: 'relative', width: 90, height: 90 }}>
                    {[40, 28, 16].map((r, i) => (
                      <div key={i} style={{ position: 'absolute', top: '50%', left: '50%', width: r * 2, height: r * 2, transform: 'translate(-50%,-50%)', borderRadius: '50%', border: `1px solid rgba(0,229,255,${0.08 + i * 0.05})` }} />
                    ))}
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontFamily: "'Orbitron',monospace", fontSize: 18, color: 'rgba(0,229,255,0.25)', fontWeight: 700 }}>◎</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 12, letterSpacing: '0.1em', color: '#7d8590', marginBottom: 7 }}>SELECT A REPOSITORY</div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'rgba(0,229,255,0.3)', letterSpacing: '0.06em' }}>AND CLICK RUN ANALYSIS</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── CHAT WINDOW ── */}
          <div style={{
            height: 262, flexShrink: 0,
            background: 'rgba(13,17,23,0.9)',
            border: '1px solid rgba(0,229,255,0.13)',
            borderRadius: 9, overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Chat header */}
            <div style={{ flexShrink: 0, height: 34, padding: '0 13px', borderBottom: '1px solid rgba(0,229,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00E5FF', boxShadow: '0 0 6px #00E5FF' }} />
                <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', color: '#00E5FF' }}>CODE ADVISOR</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'rgba(0,229,255,0.3)' }}>· AI-powered · ask anything about your code quality</span>
              </div>
              {chatLoading && (
                <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: '#00E5FF', animation: `chatdot 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                  ))}
                </div>
              )}
            </div>

            {/* Messages area — only this scrolls */}
            <div style={{
              flex: 1, minHeight: 0,
              overflowY: 'auto', overflowX: 'hidden',
              padding: '10px 13px',
              display: 'flex', flexDirection: 'column', gap: 8,
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(0,229,255,0.15) transparent',
            }}>
              {chatMsgs.length === 0 ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(0,229,255,0.2)', letterSpacing: '0.08em' }}>
                    {report ? 'Ask me how to improve your code quality...' : 'Run analysis first, then ask for advice...'}
                  </span>
                </div>
              ) : (
                chatMsgs.map((m, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.06em' }}>
                      {m.role === 'user' ? 'YOU' : 'ADVISOR'}
                    </span>
                    <div style={{
                      maxWidth: '88%',
                      padding: '7px 10px',
                      borderRadius: m.role === 'user' ? '8px 8px 2px 8px' : '8px 8px 8px 2px',
                      background: m.role === 'user'
                        ? 'rgba(0,229,255,0.1)'
                        : 'rgba(255,255,255,0.03)',
                      border: m.role === 'user'
                        ? '1px solid rgba(0,229,255,0.25)'
                        : '1px solid rgba(255,255,255,0.07)',
                    }}>
                      {m.role === 'user' ? (
                        <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: '#e6edf3', lineHeight: 1.5 }}>{m.text}</span>
                      ) : (
                        <ChatMarkdown text={m.text} />
                      )}
                    </div>
                  </div>
                ))
              )}
              {chatLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'rgba(255,255,255,0.2)' }}>ADVISOR</span>
                  <div style={{ padding: '8px 12px', borderRadius: '8px 8px 8px 2px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 4, alignItems: 'center' }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(0,229,255,0.5)', animation: `chatdot 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input row */}
            <div style={{ flexShrink: 0, padding: '7px 10px', borderTop: '1px solid rgba(0,229,255,0.07)', display: 'flex', gap: 7, alignItems: 'center' }}>
              <input
                ref={chatInputRef}
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                placeholder="e.g. How do I improve my test coverage? or What's wrong with handleAuth?"
                disabled={chatLoading}
                style={{
                  flex: 1, height: 30, padding: '0 10px',
                  background: 'rgba(0,229,255,0.04)',
                  border: '1px solid rgba(0,229,255,0.15)',
                  borderRadius: 5, outline: 'none',
                  fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
                  color: '#e6edf3', letterSpacing: '0.02em',
                  opacity: chatLoading ? 0.5 : 1,
                }}
              />
              <button
                onClick={handleSend}
                disabled={!chatInput.trim() || chatLoading}
                style={{
                  height: 30, padding: '0 13px', flexShrink: 0,
                  background: chatInput.trim() && !chatLoading ? 'rgba(0,229,255,0.12)' : 'rgba(0,229,255,0.03)',
                  border: `1px solid ${chatInput.trim() && !chatLoading ? 'rgba(0,229,255,0.4)' : 'rgba(0,229,255,0.1)'}`,
                  borderRadius: 5, cursor: chatInput.trim() && !chatLoading ? 'pointer' : 'not-allowed',
                  fontFamily: "'Orbitron',monospace", fontSize: 9, fontWeight: 600,
                  color: chatInput.trim() && !chatLoading ? '#00E5FF' : 'rgba(0,229,255,0.3)',
                  letterSpacing: '0.08em', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (chatInput.trim() && !chatLoading) (e.currentTarget as HTMLElement).style.background = 'rgba(0,229,255,0.2)' }}
                onMouseLeave={e => { if (chatInput.trim() && !chatLoading) (e.currentTarget as HTMLElement).style.background = 'rgba(0,229,255,0.12)' }}
              >
                SEND →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer style={{ height: 24, flexShrink: 0, position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderTop: '1px solid rgba(0,229,255,0.06)', background: 'rgba(5,5,5,0.8)' }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, letterSpacing: '0.14em', color: 'rgba(0,229,255,0.3)' }}>
          GIT PLANET | CODE QUALITY ANALYSER | ts-morph AST · duplicate detection · test coverage scoring
        </span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: 'rgba(0,229,255,0.25)' }}>@{user.login}</span>
      </footer>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes chatdot { 0%,80%,100% { transform: scale(0.6); opacity: 0.35 } 40% { transform: scale(1); opacity: 1 } }
      `}</style>
    </div>
  )
}
