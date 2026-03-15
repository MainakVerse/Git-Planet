'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface GithubUser { login: string; name: string | null; avatar_url: string }
interface GithubRepo {
  id: number; name: string; description: string | null
  language: string | null; stargazers_count: number; forks_count: number
  html_url: string; updated_at: string; fork: boolean
}
interface DepMeta {
  totalFiles: number
  filesAnalyzed: number
  internalNodes: number
  externalPackages: number
  totalEdges: number
}

// ── Mermaid diagram component ──────────────────────────────────────────────────

function MermaidDiagram({ definition }: { definition: string }) {
  const [svg, setSvg] = useState('')
  const [error, setError] = useState(false)
  const idRef = useRef(0)

  useEffect(() => {
    if (!definition) return
    let cancelled = false
    setError(false)

    const id = `mermaid-dep-${++idRef.current}`

    import('mermaid').then(async ({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        flowchart: { curve: 'basis', nodeSpacing: 60, rankSpacing: 80, padding: 20, htmlLabels: false },
        themeVariables: {
          darkMode: true,
          background: 'transparent',
          mainBkg: '#0d1117',
          nodeBorder: '#7B61FF',
          clusterBkg: 'rgba(5,5,5,0.6)',
          clusterBorder: 'rgba(123,97,255,0.15)',
          titleColor: '#7d8590',
          edgeLabelBackground: '#050505',
          lineColor: 'rgba(123,97,255,0.4)',
          primaryTextColor: '#e6edf3',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '12px',
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
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(123,97,255,0.15)', borderTopColor: '#7B61FF', animation: 'spin 0.8s linear infinite' }} />
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

export default function DependencyGraphPage() {
  const router = useRouter()
  const [user, setUser] = useState<GithubUser | null>(null)
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRepo, setSelectedRepo] = useState<GithubRepo | null>(null)
  const [generating, setGenerating] = useState(false)
  const [mermaidDef, setMermaidDef] = useState<string>('')
  const [meta, setMeta] = useState<DepMeta | null>(null)
  const [downloading, setDownloading] = useState<'png' | 'pdf' | null>(null)
  const diagramRef = useRef<HTMLDivElement>(null)

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
    try {
      const res = await fetch(`/api/github/dependency-graph?owner=${user.login}&repo=${selectedRepo.name}`)
      if (!res.ok) throw new Error('Analysis failed')
      const data = await res.json()
      setMermaidDef(data.mermaidDef)
      setMeta(data.meta)
    } catch {
      // leave empty — placeholder will show
    } finally {
      setGenerating(false)
    }
  }

  async function captureFullDiagram(): Promise<string> {
    const svgEl = diagramRef.current?.querySelector('svg')
    if (!svgEl) throw new Error('No diagram SVG found')

    const clone = svgEl.cloneNode(true) as SVGElement

    let w = parseFloat(clone.getAttribute('width') || '0')
    let h = parseFloat(clone.getAttribute('height') || '0')
    if (!w || !h) {
      const vb = (clone.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number)
      if (vb.length >= 4) { w = vb[2]; h = vb[3] }
    }
    w = w || 1200
    h = h || 800

    clone.setAttribute('width', String(w))
    clone.setAttribute('height', String(h))
    clone.style.maxWidth = 'none'

    const pad = 48
    const scale = 2
    const canvasW = (w + pad * 2) * scale
    const canvasH = (h + pad * 2) * scale

    clone.querySelectorAll('style').forEach((s) => {
      s.textContent = (s.textContent || '').replace(/@import[^;]+;/g, '').replace(/url\(['"]?https?:\/\/[^)'"]+['"]?\)/g, '')
    })

    const svgStr = new XMLSerializer().serializeToString(clone)
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr)}`

    const canvas = document.createElement('canvas')
    canvas.width = canvasW
    canvas.height = canvasH
    const ctx = canvas.getContext('2d')!

    ctx.fillStyle = '#0d1117'
    ctx.fillRect(0, 0, canvasW, canvasH)

    await new Promise<void>((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        ctx.drawImage(img, pad * scale, pad * scale, w * scale, h * scale)
        resolve()
      }
      img.onerror = () => reject(new Error('SVG failed to render'))
      img.src = url
    })

    return canvas.toDataURL('image/png')
  }

  async function handleDownloadPng() {
    setDownloading('png')
    try {
      const dataUrl = await captureFullDiagram()
      const a = document.createElement('a')
      a.download = `${selectedRepo?.name ?? 'dependency-graph'}-deps.png`
      a.href = dataUrl
      a.click()
    } finally {
      setDownloading(null)
    }
  }

  async function handleDownloadPdf() {
    setDownloading('pdf')
    try {
      const dataUrl = await captureFullDiagram()
      const { default: jsPDF } = await import('jspdf')
      const img = new Image()
      img.src = dataUrl
      await new Promise<void>((resolve) => { img.onload = () => resolve() })
      const w = img.naturalWidth
      const h = img.naturalHeight
      const pdf = new jsPDF({ orientation: w >= h ? 'landscape' : 'portrait', unit: 'px', format: [w, h], hotfixes: ['px_scaling'] })
      pdf.addImage(dataUrl, 'PNG', 0, 0, w, h)
      pdf.save(`${selectedRepo?.name ?? 'dependency-graph'}-deps.pdf`)
    } finally {
      setDownloading(null)
    }
  }

  if (loading) return (
    <div style={{ height: '100vh', background: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid rgba(123,97,255,0.15)', borderTopColor: '#7B61FF', animation: 'spin 0.8s linear infinite' }} />
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: '0.2em', color: 'rgba(123,97,255,0.55)' }}>LOADING...</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  if (!user) return null
  const displayName = (user.name || user.login).toUpperCase()

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#050505', color: '#e6edf3', fontFamily: "'Space Grotesk',sans-serif" }}>
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(123,97,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(123,97,255,0.02) 1px,transparent 1px)', backgroundSize: '44px 44px', pointerEvents: 'none', zIndex: 0 }} />

      {/* NAV */}
      <nav style={{ height: 44, flexShrink: 0, position: 'relative', zIndex: 100, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', background: 'rgba(5,5,5,0.96)', borderBottom: '1px solid rgba(123,97,255,0.07)', backdropFilter: 'blur(14px)' }}>
        <button onClick={() => router.back()} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: 'transparent', border: '1px solid rgba(123,97,255,0.15)', borderRadius: 5, color: '#7B61FF', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: '0.08em', cursor: 'pointer' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(123,97,255,0.08)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
          ← BACK
        </button>
        <div style={{ width: 1, height: 20, background: 'rgba(123,97,255,0.1)' }} />
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: '#7B61FF', textShadow: '0 0 14px rgba(123,97,255,0.4)' }}>GIT PLANET</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(123,97,255,0.35)' }}>/</span>
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: '#e6edf3' }}>DEPENDENCY GRAPH VISUALIZER</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {mermaidDef && (
            <>
              <button
                onClick={handleDownloadPng}
                disabled={downloading !== null}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: downloading === 'png' ? 'rgba(123,97,255,0.1)' : 'transparent', border: '1px solid rgba(123,97,255,0.2)', borderRadius: 5, color: downloading === 'png' ? 'rgba(123,97,255,0.5)' : '#7B61FF', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: '0.08em', cursor: downloading !== null ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={(e) => { if (!downloading) (e.currentTarget as HTMLElement).style.background = 'rgba(123,97,255,0.08)' }}
                onMouseLeave={(e) => { if (!downloading) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                {downloading === 'png' ? '...' : '↓'} PNG
              </button>
              <button
                onClick={handleDownloadPdf}
                disabled={downloading !== null}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: downloading === 'pdf' ? 'rgba(0,229,255,0.12)' : 'transparent', border: '1px solid rgba(0,229,255,0.25)', borderRadius: 5, color: downloading === 'pdf' ? 'rgba(0,229,255,0.5)' : '#00E5FF', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: '0.08em', cursor: downloading !== null ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={(e) => { if (!downloading) (e.currentTarget as HTMLElement).style.background = 'rgba(0,229,255,0.1)' }}
                onMouseLeave={(e) => { if (!downloading) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                {downloading === 'pdf' ? '...' : '↓'} PDF
              </button>
              <div style={{ width: 1, height: 20, background: 'rgba(123,97,255,0.1)' }} />
            </>
          )}
          <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, color: '#e6edf3', letterSpacing: '0.06em' }}>{displayName}</div>
          <img src={user.avatar_url} style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid rgba(123,97,255,0.3)', objectFit: 'cover' }} alt="" />
        </div>
      </nav>

      {/* MAIN GRID */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: '320px 1fr', gap: 8, padding: '8px 12px' }}>

        {/* LEFT PANEL */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, overflow: 'hidden', minHeight: 0 }}>

          {/* Generator */}
          <div style={{ flexShrink: 0, padding: '14px 14px', background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(123,97,255,0.12)', borderRadius: 9, display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: '#7B61FF', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>◈</span> GRAPH GENERATOR
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#7d8590', letterSpacing: '0.08em' }}>SELECT REPOSITORY</label>
              <select
                value={selectedRepo?.id || ''}
                onChange={(e) => {
                  const r = repos.find((r) => r.id === Number(e.target.value))
                  if (r) { setSelectedRepo(r); setMermaidDef(''); setMeta(null) }
                }}
                style={{ width: '100%', padding: '8px 10px', background: 'rgba(123,97,255,0.04)', border: '1px solid rgba(123,97,255,0.18)', borderRadius: 5, color: '#e6edf3', fontFamily: "'JetBrains Mono',monospace", fontSize: 12, outline: 'none', cursor: 'pointer' }}
              >
                {repos.map((r) => <option key={r.id} value={r.id} style={{ background: '#0d1117' }}>{r.name}</option>)}
              </select>
            </div>

            {selectedRepo && (
              <div style={{ padding: '10px', background: 'rgba(123,97,255,0.03)', border: '1px solid rgba(123,97,255,0.08)', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {[['LANGUAGE', selectedRepo.language || 'Unknown'], ['STARS', String(selectedRepo.stargazers_count)], ['FORKS', String(selectedRepo.forks_count)]].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#7d8590' }}>{k}:</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#7B61FF' }}>{v}</span>
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
              style={{ width: '100%', padding: '10px', borderRadius: 6, cursor: selectedRepo && !generating ? 'pointer' : 'not-allowed', background: generating ? 'rgba(123,97,255,0.06)' : 'rgba(123,97,255,0.12)', border: `1px solid ${generating ? 'rgba(123,97,255,0.25)' : 'rgba(123,97,255,0.4)'}`, color: generating ? 'rgba(123,97,255,0.5)' : '#7B61FF', fontFamily: "'Orbitron',monospace", fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', transition: 'all 0.15s' }}
              onMouseEnter={(e) => { if (!generating) (e.currentTarget as HTMLElement).style.background = 'rgba(123,97,255,0.2)' }}
              onMouseLeave={(e) => { if (!generating) (e.currentTarget as HTMLElement).style.background = 'rgba(123,97,255,0.12)' }}
            >
              {generating ? '⟳ SCANNING IMPORTS...' : '◈ GENERATE GRAPH'}
            </button>
          </div>

          {/* Legend */}
          <div style={{ flexShrink: 0, padding: '12px 14px', background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(123,97,255,0.1)', borderRadius: 9, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: '#e6edf3' }}>NODE LEGEND</div>
            {[
              ['#00E5FF', 'ENTRY POINT', 'index / main / root files'],
              ['#7B61FF', 'INTERNAL MODULE', 'source files in the repo'],
              ['#00ff88', 'EXTERNAL PACKAGE', 'npm / pip / imported deps'],
            ].map(([color, label, desc]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                <div style={{ width: 9, height: 9, borderRadius: 2, background: color, boxShadow: `0 0 6px ${color}`, flexShrink: 0, marginTop: 2 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#c9d1d9' }}>{label}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590' }}>{desc}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Metrics */}
          {meta && (
            <div style={{ flexShrink: 0, padding: '12px 14px', background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(123,97,255,0.15)', borderRadius: 9, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: '#7B61FF' }}>GRAPH METRICS</div>
              {[
                ['TOTAL FILES', String(meta.totalFiles)],
                ['FILES ANALYZED', String(meta.filesAnalyzed)],
                ['INTERNAL NODES', String(meta.internalNodes)],
                ['EXTERNAL PKGS', String(meta.externalPackages)],
                ['TOTAL EDGES', String(meta.totalEdges)],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#7d8590' }}>{k}:</span>
                  <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 12, fontWeight: 700, color: '#7B61FF' }}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: Diagram */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, overflow: 'hidden', minHeight: 0 }}>
          <div ref={diagramRef} style={{ flex: 1, minHeight: 0, background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(123,97,255,0.1)', borderRadius: 9, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

            {/* Header */}
            <div style={{ flexShrink: 0, padding: '9px 14px', borderBottom: '1px solid rgba(123,97,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: mermaidDef ? '#00ff88' : '#7d8590', boxShadow: mermaidDef ? '0 0 6px #00ff88' : 'none' }} />
                <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', color: '#7d8590' }}>
                  {mermaidDef ? `DEPENDENCY GRAPH: ${selectedRepo?.name.toUpperCase()}` : 'AWAITING ANALYSIS'}
                </span>
              </div>
              {meta && (
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(123,97,255,0.4)', letterSpacing: '0.05em' }}>
                  {meta.internalNodes} MODULES · {meta.externalPackages} PACKAGES · {meta.totalEdges} EDGES
                </span>
              )}
            </div>

            {/* Diagram body */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px' }}>
              {generating ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                  <div style={{ position: 'relative', width: 56, height: 56 }}>
                    {[0, 1, 2].map((i) => (
                      <div key={i} style={{ position: 'absolute', inset: i * 8, borderRadius: '50%', border: `1.5px solid rgba(123,97,255,${0.5 - i * 0.12})`, borderTopColor: i === 0 ? '#7B61FF' : 'transparent', animation: `spin ${0.7 + i * 0.3}s linear infinite${i % 2 === 1 ? ' reverse' : ''}` }} />
                    ))}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: '0.16em', color: 'rgba(123,97,255,0.7)' }}>RESOLVING IMPORTS & EDGES...</div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590', marginTop: 5 }}>reading source files · tracing imports · mapping packages</div>
                  </div>
                </div>
              ) : mermaidDef ? (
                <MermaidDiagram definition={mermaidDef} />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, opacity: 0.45 }}>
                  <div style={{ position: 'relative', width: 80, height: 80 }}>
                    {[36, 25, 14].map((r, i) => (
                      <div key={i} style={{ position: 'absolute', top: '50%', left: '50%', width: r * 2, height: r * 2, transform: 'translate(-50%,-50%)', borderRadius: '50%', border: `1px solid rgba(123,97,255,${0.12 + i * 0.07})` }} />
                    ))}
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 7, height: 7, borderRadius: '50%', background: 'rgba(123,97,255,0.35)', boxShadow: '0 0 12px rgba(123,97,255,0.35)' }} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 12, letterSpacing: '0.1em', color: '#7d8590', marginBottom: 7 }}>SELECT A REPOSITORY</div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'rgba(123,97,255,0.3)', letterSpacing: '0.06em' }}>AND CLICK GENERATE GRAPH</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer style={{ height: 24, flexShrink: 0, position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderTop: '1px solid rgba(123,97,255,0.06)', background: 'rgba(5,5,5,0.8)' }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, letterSpacing: '0.14em', color: 'rgba(123,97,255,0.3)' }}>GIT PLANET | DEPENDENCY GRAPH VISUALIZER | CODE INTELLIGENCE</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: 'rgba(123,97,255,0.25)' }}>@{user.login}</span>
      </footer>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .mermaid svg { max-width: 100% !important; height: auto !important; }
      `}</style>
    </div>
  )
}
