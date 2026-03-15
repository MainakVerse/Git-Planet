'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface GithubUser { login: string; name: string | null; avatar_url: string }
interface GithubRepo {
  id: number; name: string; description: string | null
  language: string | null; stargazers_count: number; forks_count: number
  html_url: string; updated_at: string; fork: boolean
}
interface ArchMeta {
  totalFiles: number; framework: string; filesRead: string[]; depsDetected: string[]
}

const LAYER_COLORS = ['#00E5FF', '#7B61FF', '#00ff88', '#ff9500']
const LAYER_LABELS = ['ENTRY / UI', 'API / GATEWAY', 'SERVICES / CORE', 'DATA / INFRA']

// ── Mermaid diagram component ──────────────────────────────────────────────────

function MermaidDiagram({ definition }: { definition: string }) {
  const [svg, setSvg] = useState('')
  const [error, setError] = useState(false)
  const idRef = useRef(0)

  useEffect(() => {
    if (!definition) return
    let cancelled = false
    setError(false)

    const id = `mermaid-arch-${++idRef.current}`

    import('mermaid').then(async ({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        flowchart: { curve: 'basis', nodeSpacing: 70, rankSpacing: 90, padding: 20, htmlLabels: true },
        themeVariables: {
          darkMode: true,
          background: 'transparent',
          mainBkg: '#0d1117',
          nodeBorder: '#00E5FF',
          clusterBkg: 'rgba(5,5,5,0.6)',
          clusterBorder: 'rgba(0,229,255,0.15)',
          titleColor: '#7d8590',
          edgeLabelBackground: '#050505',
          lineColor: 'rgba(0,229,255,0.4)',
          primaryTextColor: '#e6edf3',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '13px',
        },
      })
      try {
        const { svg: rendered } = await mermaid.render(id, definition)
        if (!cancelled) setSvg(rendered)
      } catch {
        if (!cancelled) setError(true)
      }
    })

    return () => { cancelled = true }
  }, [definition])

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#ff4466' }}>
      RENDER ERROR — TRY ANOTHER REPO
    </div>
  )

  if (!svg) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(0,229,255,0.15)', borderTopColor: '#00E5FF', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  return (
    <div
      dangerouslySetInnerHTML={{ __html: svg }}
      style={{ width: '100%', height: '100%', overflow: 'auto' }}
    />
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ArchitecturePage() {
  const router = useRouter()
  const [user, setUser] = useState<GithubUser | null>(null)
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRepo, setSelectedRepo] = useState<GithubRepo | null>(null)
  const [generating, setGenerating] = useState(false)
  const [mermaidDef, setMermaidDef] = useState<string>('')
  const [meta, setMeta] = useState<ArchMeta | null>(null)
  const [layers, setLayers] = useState<{ label: string; color: string; count: number }[]>([])

  useEffect(() => {
    fetch('/api/github/user')
      .then((r) => { if (r.status === 401) { router.push('/'); return null } return r.json() })
      .then((d) => {
        if (!d) return
        setUser(d.user)
        const sorted = [...d.repos].sort((a: GithubRepo, b: GithubRepo) => b.stargazers_count - a.stargazers_count)
        setRepos(sorted)
        if (sorted.length) setSelectedRepo(sorted[0])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [router])

  async function handleGenerate() {
    if (!selectedRepo || !user) return
    setGenerating(true)
    setMermaidDef('')
    setMeta(null)
    setLayers([])
    try {
      const res = await fetch(`/api/github/architecture?owner=${user.login}&repo=${selectedRepo.name}`)
      if (!res.ok) throw new Error('Analysis failed')
      const data = await res.json()
      setMermaidDef(data.mermaidDef)
      setMeta(data.meta)
      // Compute layer summary from nodes
      const layerCount = [0, 0, 0, 0]
      for (const n of data.nodes) layerCount[n.layer]++
      setLayers(LAYER_LABELS.map((label, i) => ({ label, color: LAYER_COLORS[i], count: layerCount[i] })))
    } catch {
      // leave empty — placeholder will show
    } finally {
      setGenerating(false)
    }
  }

  if (loading) return (
    <div style={{ height: '100vh', background: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid rgba(0,229,255,0.15)', borderTopColor: '#00E5FF', animation: 'spin 0.8s linear infinite' }} />
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: '0.2em', color: 'rgba(0,229,255,0.55)' }}>LOADING...</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  if (!user) return null
  const displayName = (user.name || user.login).toUpperCase()

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#050505', color: '#e6edf3', fontFamily: "'Space Grotesk',sans-serif" }}>
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(0,229,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,0.02) 1px,transparent 1px)', backgroundSize: '44px 44px', pointerEvents: 'none', zIndex: 0 }} />

      {/* NAV */}
      <nav style={{ height: 44, flexShrink: 0, position: 'relative', zIndex: 100, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', background: 'rgba(5,5,5,0.96)', borderBottom: '1px solid rgba(0,229,255,0.07)', backdropFilter: 'blur(14px)' }}>
        <button onClick={() => router.back()} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: 'transparent', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 5, color: '#00E5FF', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: '0.08em', cursor: 'pointer' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,229,255,0.08)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
          ← BACK
        </button>
        <div style={{ width: 1, height: 20, background: 'rgba(0,229,255,0.1)' }} />
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: '#00E5FF', textShadow: '0 0 14px rgba(0,229,255,0.4)' }}>GIT PLANET</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(0,229,255,0.35)' }}>/</span>
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: '#e6edf3' }}>AUTO ARCHITECTURE DIAGRAM</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, color: '#e6edf3', letterSpacing: '0.06em' }}>{displayName}</div>
          <img src={user.avatar_url} style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid rgba(0,229,255,0.3)', objectFit: 'cover' }} alt="" />
        </div>
      </nav>

      {/* MAIN GRID */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: '320px 1fr', gap: 8, padding: '8px 12px' }}>

        {/* LEFT PANEL */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, overflow: 'hidden', minHeight: 0 }}>

          {/* Generator */}
          <div style={{ flexShrink: 0, padding: '14px 14px', background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(0,229,255,0.12)', borderRadius: 9, display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: '#00E5FF', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>[ ]</span> DIAGRAM GENERATOR
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#7d8590', letterSpacing: '0.08em' }}>SELECT REPOSITORY</label>
              <select
                value={selectedRepo?.id || ''}
                onChange={(e) => {
                  const r = repos.find((r) => r.id === Number(e.target.value))
                  if (r) { setSelectedRepo(r); setMermaidDef(''); setMeta(null); setLayers([]) }
                }}
                style={{ width: '100%', padding: '8px 10px', background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.18)', borderRadius: 5, color: '#e6edf3', fontFamily: "'JetBrains Mono',monospace", fontSize: 12, outline: 'none', cursor: 'pointer' }}
              >
                {repos.map((r) => <option key={r.id} value={r.id} style={{ background: '#0d1117' }}>{r.name}</option>)}
              </select>
            </div>

            {selectedRepo && (
              <div style={{ padding: '10px', background: 'rgba(0,229,255,0.03)', border: '1px solid rgba(0,229,255,0.08)', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {[['LANGUAGE', selectedRepo.language || 'Unknown'], ['STARS', String(selectedRepo.stargazers_count)], ['FORKS', String(selectedRepo.forks_count)]].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#7d8590' }}>{k}:</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#00E5FF' }}>{v}</span>
                  </div>
                ))}
                {selectedRepo.description && (
                  <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: '#7d8590', margin: 0, lineHeight: 1.4, marginTop: 3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {selectedRepo.description}
                  </p>
                )}
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={!selectedRepo || generating}
              style={{ width: '100%', padding: '10px', borderRadius: 6, cursor: selectedRepo && !generating ? 'pointer' : 'not-allowed', background: generating ? 'rgba(0,229,255,0.06)' : 'rgba(0,229,255,0.12)', border: `1px solid ${generating ? 'rgba(0,229,255,0.25)' : 'rgba(0,229,255,0.4)'}`, color: generating ? 'rgba(0,229,255,0.5)' : '#00E5FF', fontFamily: "'Orbitron',monospace", fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', transition: 'all 0.15s' }}
              onMouseEnter={(e) => { if (!generating) (e.currentTarget as HTMLElement).style.background = 'rgba(0,229,255,0.2)' }}
              onMouseLeave={(e) => { if (!generating) (e.currentTarget as HTMLElement).style.background = 'rgba(0,229,255,0.12)' }}
            >
              {generating ? '⟳ SCANNING REPO...' : '⬡ GENERATE DIAGRAM'}
            </button>
          </div>

          {/* Layer summary */}
          {layers.length > 0 && (
            <div style={{ flexShrink: 0, padding: '12px 14px', background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(0,229,255,0.1)', borderRadius: 9, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: '#e6edf3' }}>DETECTED LAYERS</div>
              {layers.map((l, i) => l.count > 0 && (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{ width: 9, height: 9, borderRadius: 2, background: l.color, boxShadow: `0 0 6px ${l.color}`, flexShrink: 0 }} />
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#c9d1d9', flex: 1 }}>{l.label}</span>
                  <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, fontWeight: 700, color: l.color }}>{l.count}</span>
                </div>
              ))}
            </div>
          )}

          {/* Metrics */}
          {meta && (
            <div style={{ flexShrink: 0, padding: '12px 14px', background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(123,97,255,0.15)', borderRadius: 9, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: '#7B61FF' }}>ANALYSIS METRICS</div>
              {[
                ['TOTAL FILES', String(meta.totalFiles)],
                ['FILES READ', String(meta.filesRead.length)],
                ['DEPS DETECTED', String(meta.depsDetected.length)],
                ...(meta.framework ? [['FRAMEWORK', meta.framework]] : []),
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#7d8590' }}>{k}:</span>
                  <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 12, fontWeight: 700, color: '#7B61FF' }}>{v}</span>
                </div>
              ))}
            </div>
          )}

          {/* Deps detected */}
          {meta && meta.depsDetected.length > 0 && (
            <div style={{ flex: 1, minHeight: 0, padding: '12px 14px', background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(0,229,255,0.08)', borderRadius: 9, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' }}>
              <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: '#00E5FF', flexShrink: 0 }}>DETECTED PACKAGES</div>
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,229,255,0.2) transparent' }}>
                {meta.depsDetected.map((d) => (
                  <div key={d} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#7d8590', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ color: 'rgba(0,255,136,0.5)', flexShrink: 0 }}>›</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Diagram */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, overflow: 'hidden', minHeight: 0 }}>
          <div style={{ flex: 1, minHeight: 0, background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(0,229,255,0.1)', borderRadius: 9, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

            {/* Header */}
            <div style={{ flexShrink: 0, padding: '9px 14px', borderBottom: '1px solid rgba(0,229,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: mermaidDef ? '#00ff88' : '#7d8590', boxShadow: mermaidDef ? '0 0 6px #00ff88' : 'none' }} />
                <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', color: '#7d8590' }}>
                  {mermaidDef ? `ARCHITECTURE: ${selectedRepo?.name.toUpperCase()}` : 'AWAITING ANALYSIS'}
                </span>
              </div>
              {meta && (
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(0,229,255,0.4)', letterSpacing: '0.05em' }}>
                  {meta.totalFiles} FILES · {meta.depsDetected.length} DEPS MAPPED · {meta.framework || selectedRepo?.language || ''}
                </span>
              )}
            </div>

            {/* Diagram body */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px' }}>
              {generating ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                  <div style={{ position: 'relative', width: 56, height: 56 }}>
                    {[0, 1, 2].map((i) => (
                      <div key={i} style={{ position: 'absolute', inset: i * 8, borderRadius: '50%', border: `1.5px solid rgba(0,229,255,${0.5 - i * 0.12})`, borderTopColor: i === 0 ? '#00E5FF' : 'transparent', animation: `spin ${0.7 + i * 0.3}s linear infinite${i % 2 === 1 ? ' reverse' : ''}` }} />
                    ))}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: '0.16em', color: 'rgba(0,229,255,0.7)' }}>SCANNING FILES & IMPORTS...</div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590', marginTop: 5 }}>analyzing package.json · file tree · source imports</div>
                  </div>
                </div>
              ) : mermaidDef ? (
                <MermaidDiagram definition={mermaidDef} />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, opacity: 0.45 }}>
                  <div style={{ position: 'relative', width: 80, height: 80 }}>
                    {[36, 25, 14].map((r, i) => (
                      <div key={i} style={{ position: 'absolute', top: '50%', left: '50%', width: r * 2, height: r * 2, transform: 'translate(-50%,-50%)', borderRadius: '50%', border: `1px solid rgba(0,229,255,${0.12 + i * 0.07})` }} />
                    ))}
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 7, height: 7, borderRadius: '50%', background: 'rgba(0,229,255,0.35)', boxShadow: '0 0 12px rgba(0,229,255,0.35)' }} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 12, letterSpacing: '0.1em', color: '#7d8590', marginBottom: 7 }}>SELECT A REPOSITORY</div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'rgba(0,229,255,0.3)', letterSpacing: '0.06em' }}>AND CLICK GENERATE DIAGRAM</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer style={{ height: 24, flexShrink: 0, position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderTop: '1px solid rgba(0,229,255,0.06)', background: 'rgba(5,5,5,0.8)' }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, letterSpacing: '0.14em', color: 'rgba(0,229,255,0.3)' }}>GIT PLANET | AUTO ARCHITECTURE DIAGRAM | CODE INTELLIGENCE</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: 'rgba(0,229,255,0.25)' }}>@{user.login}</span>
      </footer>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .mermaid svg { max-width: 100% !important; height: auto !important; }
      `}</style>
    </div>
  )
}
