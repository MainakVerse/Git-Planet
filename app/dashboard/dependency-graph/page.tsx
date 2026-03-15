'use client'

import { useEffect, useState, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import { useRouter } from 'next/navigation'

// ── Types ──────────────────────────────────────────────────────────────────────

interface GithubUser { login: string; name: string | null; avatar_url: string }
interface GithubRepo {
  id: number; name: string; description: string | null
  language: string | null; stargazers_count: number; forks_count: number
  html_url: string; updated_at: string
}
interface DepNode {
  id: string; label: string; type: 'internal' | 'external' | 'entry'
  inDegree: number; outDegree: number
}
interface DepEdge { from: string; to: string }
interface DepMeta {
  totalFiles: number; filesAnalyzed: number
  internalNodes: number; externalPackages: number; totalEdges: number
}
interface DepInsights {
  hubs: { id: string; label: string; inDegree: number }[]
  circularDeps: string[][]
}
interface GraphData { nodes: DepNode[]; edges: DepEdge[]; meta: DepMeta; insights: DepInsights }

// ── Node color config ──────────────────────────────────────────────────────────

const NODE_STYLE: Record<string, { bg: string; border: string; text: string; shadow: string }> = {
  entry:    { bg: 'rgba(0,229,255,0.18)',   border: '#00E5FF', text: '#00E5FF', shadow: 'rgba(0,229,255,0.4)' },
  internal: { bg: 'rgba(123,97,255,0.15)',  border: '#7B61FF', text: '#c9d1d9', shadow: 'rgba(123,97,255,0.3)' },
  external: { bg: 'rgba(0,255,136,0.10)',   border: '#00ff88', text: '#00ff88', shadow: 'rgba(0,255,136,0.3)' },
}

// ── Cytoscape Graph ────────────────────────────────────────────────────────────

interface CyGraphProps {
  data: GraphData
  layout: 'cose' | 'breadthfirst'
  onNodeSelect: (node: DepNode | null) => void
}
interface CyGraphHandle { exportPng: () => string | null }

const CytoscapeGraph = forwardRef<CyGraphHandle, CyGraphProps>(function CytoscapeGraph(
  { data, layout, onNodeSelect },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<any>(null)
  const onSelectRef = useRef(onNodeSelect)

  useEffect(() => { onSelectRef.current = onNodeSelect }, [onNodeSelect])

  useImperativeHandle(ref, () => ({
    exportPng: () => cyRef.current?.png({ full: true, scale: 2, bg: '#0a0d1a' }) ?? null,
  }))

  useEffect(() => {
    if (!containerRef.current || !data.nodes.length) return
    let cancelled = false

    async function init() {
      const cytoscape = (await import('cytoscape')).default
      if (cancelled || !containerRef.current) return

      const maxDeg = Math.max(...data.nodes.map(n => n.inDegree + n.outDegree + 1))
      const ns = NODE_STYLE

      const cy = cytoscape({
        container: containerRef.current,
        elements: [
          ...data.nodes.map(n => ({
            data: {
              id: n.id,
              label: n.label,
              ntype: n.type,
              sz: 22 + ((n.inDegree + n.outDegree) / maxDeg) * 26,
            },
          })),
          ...data.edges.map(e => ({
            data: { source: e.from, target: e.to, id: `${e.from}__${e.to}` },
          })),
        ],
        style: [
          {
            selector: 'node',
            style: {
              'width': 'data(sz)',
              'height': 'data(sz)',
              'label': 'data(label)',
              'font-family': 'JetBrains Mono, monospace',
              'font-size': '8px',
              'color': '#7d8590',
              'text-valign': 'bottom' as const,
              'text-halign': 'center' as const,
              'text-margin-y': 5,
              'background-color': ns.internal.bg,
              'border-color': ns.internal.border,
              'border-width': 1.5,
              'transition-property': 'background-color, border-color, border-width',
              'transition-duration': 150,
            },
          },
          {
            selector: 'node[ntype = "entry"]',
            style: {
              'background-color': ns.entry.bg,
              'border-color': ns.entry.border,
              'color': ns.entry.text,
              'shape': 'diamond' as const,
              'border-width': 2,
            },
          },
          {
            selector: 'node[ntype = "external"]',
            style: {
              'background-color': ns.external.bg,
              'border-color': ns.external.border,
              'color': ns.external.text,
              'shape': 'ellipse' as const,
              'border-style': 'dashed' as const,
            },
          },
          {
            selector: 'node:selected',
            style: {
              'border-color': '#ffffff',
              'border-width': 2.5,
            },
          },
          {
            selector: 'edge',
            style: {
              'width': 1,
              'line-color': 'rgba(123,97,255,0.25)',
              'target-arrow-color': 'rgba(123,97,255,0.45)',
              'target-arrow-shape': 'triangle' as const,
              'arrow-scale': 0.6,
              'curve-style': 'bezier' as const,
              'transition-property': 'line-color, width',
              'transition-duration': 150,
            },
          },
          {
            selector: 'edge:selected',
            style: {
              'line-color': 'rgba(0,229,255,0.6)',
              'target-arrow-color': '#00E5FF',
              'width': 2,
            },
          },
          {
            selector: '.highlighted',
            style: {
              'border-color': '#ffffff',
              'border-width': 2,
              'line-color': 'rgba(0,229,255,0.5)',
              'target-arrow-color': '#00E5FF',
            },
          },
        ],
        layout:
          layout === 'breadthfirst'
            ? { name: 'breadthfirst', directed: true, padding: 30, spacingFactor: 1.6, avoidOverlap: true }
            : {
                name: 'cose',
                animate: true,
                animationDuration: 800,
                randomize: false,
                componentSpacing: 80,
                nodeRepulsion: () => 12000,
                idealEdgeLength: () => 90,
                edgeElasticity: () => 80,
                nestingFactor: 1.2,
                gravity: 60,
                numIter: 1000,
                padding: 30,
              },
        wheelSensitivity: 0.25,
        minZoom: 0.08,
        maxZoom: 5,
        boxSelectionEnabled: false,
      })

      // Node tap → select & highlight neighbours
      cy.on('tap', 'node', (evt: any) => {
        const id = evt.target.data('id')
        const n = data.nodes.find(node => node.id === id)
        cy.elements().removeClass('highlighted')
        if (n) {
          evt.target.addClass('highlighted')
          evt.target.connectedEdges().addClass('highlighted')
          evt.target.neighbourhood('node').addClass('highlighted')
          onSelectRef.current(n)
        }
      })

      cy.on('tap', (evt: any) => {
        if (evt.target === cy) {
          cy.elements().removeClass('highlighted')
          onSelectRef.current(null)
        }
      })

      cyRef.current = cy
    }

    init()
    return () => {
      cancelled = true
      cyRef.current?.destroy()
      cyRef.current = null
    }
  }, [data, layout])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', background: 'transparent' }} />
      {/* Zoom controls */}
      <div style={{ position: 'absolute', bottom: 14, right: 14, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {([['⌖', 'fit'], ['+', 'in'], ['−', 'out']] as [string, string][]).map(([icon, action]) => (
          <button
            key={action}
            onClick={() => {
              const cy = cyRef.current
              if (!cy) return
              if (action === 'fit') cy.fit(undefined, 30)
              else if (action === 'in') cy.zoom({ level: cy.zoom() * 1.25, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } })
              else cy.zoom({ level: cy.zoom() / 1.25, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } })
            }}
            style={{ width: 26, height: 26, borderRadius: 5, background: 'rgba(13,17,23,0.9)', border: '1px solid rgba(123,97,255,0.2)', color: '#7B61FF', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {icon}
          </button>
        ))}
      </div>
    </div>
  )
})

// ── Node Detail Panel ──────────────────────────────────────────────────────────

function NodeDetail({ node, onClose }: { node: DepNode; onClose: () => void }) {
  const s = NODE_STYLE[node.type]
  return (
    <div style={{ position: 'absolute', top: 10, right: 10, width: 210, background: 'rgba(5,8,15,0.97)', border: `1px solid ${s.border}33`, borderRadius: 7, padding: '10px 12px', zIndex: 10, boxShadow: `0 0 20px ${s.shadow}22` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: node.type === 'external' ? '50%' : 2, background: s.border, boxShadow: `0 0 5px ${s.border}` }} />
          <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 8, color: s.text, letterSpacing: '0.08em' }}>
            {node.type.toUpperCase()}
          </span>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#7d8590', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>✕</button>
      </div>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#e6edf3', marginBottom: 8, wordBreak: 'break-all' }}>
        {node.id}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[['IN-DEGREE', node.inDegree, 'imported by N files'], ['OUT-DEGREE', node.outDegree, 'imports N modules']].map(([k, v, hint]) => (
          <div key={k as string}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#7d8590' }}>{k as string}:</span>
              <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, color: s.text, fontWeight: 700 }}>{v as number}</span>
            </div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: 'rgba(125,133,144,0.5)', marginTop: 1 }}>
              {(hint as string).replace('N', String(v as number))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function DependencyGraphPage() {
  const router = useRouter()
  const [user, setUser] = useState<GithubUser | null>(null)
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRepo, setSelectedRepo] = useState<GithubRepo | null>(null)
  const [generating, setGenerating] = useState(false)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [selectedNode, setSelectedNode] = useState<DepNode | null>(null)
  const [layout, setLayout] = useState<'cose' | 'breadthfirst'>('cose')
  const [downloading, setDownloading] = useState<'png' | 'pdf' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cyGraphRef = useRef<CyGraphHandle>(null)

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

  async function handleGenerate() {
    if (!selectedRepo || !user) return
    setGenerating(true)
    setGraphData(null)
    setSelectedNode(null)
    setError(null)
    try {
      const res = await fetch(`/api/github/dependency-graph?owner=${user.login}&repo=${selectedRepo.name}`)
      if (!res.ok) throw new Error(`Analysis failed (${res.status})`)
      const data: GraphData = await res.json()
      if (!data.nodes?.length) throw new Error('No dependency data found')
      setGraphData(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setGenerating(false)
    }
  }

  const handleNodeSelect = useCallback((node: DepNode | null) => setSelectedNode(node), [])

  async function handleDownload(format: 'png' | 'pdf') {
    setDownloading(format)
    try {
      const dataUrl = cyGraphRef.current?.exportPng()
      if (!dataUrl) throw new Error('No graph to export')
      if (format === 'png') {
        const a = document.createElement('a')
        a.href = dataUrl
        a.download = `${selectedRepo?.name ?? 'dep-graph'}-deps.png`
        a.click()
      } else {
        const { default: jsPDF } = await import('jspdf')
        const img = new Image()
        img.src = dataUrl
        await new Promise<void>(r => { img.onload = () => r() })
        const pdf = new jsPDF({ orientation: img.naturalWidth >= img.naturalHeight ? 'landscape' : 'portrait', unit: 'px', format: [img.naturalWidth, img.naturalHeight], hotfixes: ['px_scaling'] })
        pdf.addImage(dataUrl, 'PNG', 0, 0, img.naturalWidth, img.naturalHeight)
        pdf.save(`${selectedRepo?.name ?? 'dep-graph'}-deps.pdf`)
      }
    } catch { /* silent */ } finally {
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

  const meta = graphData?.meta
  const insights = graphData?.insights

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#050505', color: '#e6edf3', fontFamily: "'Space Grotesk',sans-serif" }}>
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(123,97,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(123,97,255,0.02) 1px,transparent 1px)', backgroundSize: '44px 44px', pointerEvents: 'none', zIndex: 0 }} />

      {/* NAV */}
      <nav style={{ height: 44, flexShrink: 0, position: 'relative', zIndex: 100, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', background: 'rgba(5,5,5,0.96)', borderBottom: '1px solid rgba(123,97,255,0.07)', backdropFilter: 'blur(14px)' }}>
        <button
          onClick={() => router.back()}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: 'transparent', border: '1px solid rgba(123,97,255,0.15)', borderRadius: 5, color: '#7B61FF', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: '0.08em', cursor: 'pointer' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(123,97,255,0.08)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
        >
          ← BACK
        </button>
        <div style={{ width: 1, height: 20, background: 'rgba(123,97,255,0.1)' }} />
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: '#7B61FF', textShadow: '0 0 14px rgba(123,97,255,0.4)' }}>GIT PLANET</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(123,97,255,0.35)' }}>/</span>
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: '#e6edf3' }}>Dependency Grapher</span>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {graphData && (
            <>
              {/* Layout toggle */}
              <div style={{ display: 'flex', gap: 3, padding: '3px', background: 'rgba(123,97,255,0.04)', border: '1px solid rgba(123,97,255,0.12)', borderRadius: 5 }}>
                {(['cose', 'breadthfirst'] as const).map(l => (
                  <button
                    key={l}
                    onClick={() => setLayout(l)}
                    style={{ padding: '2px 8px', borderRadius: 3, cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '0.06em', background: layout === l ? 'rgba(123,97,255,0.2)' : 'transparent', border: `1px solid ${layout === l ? 'rgba(123,97,255,0.5)' : 'transparent'}`, color: layout === l ? '#7B61FF' : '#7d8590', transition: 'all 0.15s' }}
                  >
                    {l === 'cose' ? 'FORCE' : 'TREE'}
                  </button>
                ))}
              </div>
              {/* Export */}
              {(['png', 'pdf'] as const).map(fmt => (
                <button
                  key={fmt}
                  onClick={() => handleDownload(fmt)}
                  disabled={downloading !== null}
                  style={{ padding: '4px 10px', background: 'transparent', border: `1px solid rgba(123,97,255,${downloading === fmt ? '0.15' : '0.25'})`, borderRadius: 5, color: downloading === fmt ? 'rgba(123,97,255,0.4)' : '#7B61FF', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, cursor: downloading !== null ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}
                >
                  {downloading === fmt ? '...' : `↓ ${fmt.toUpperCase()}`}
                </button>
              ))}
              <div style={{ width: 1, height: 20, background: 'rgba(123,97,255,0.1)' }} />
            </>
          )}
          <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, color: '#e6edf3', letterSpacing: '0.06em' }}>
            {(user.name || user.login).toUpperCase()}
          </div>
          <img src={user.avatar_url} style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid rgba(123,97,255,0.3)', objectFit: 'cover' }} alt="" />
        </div>
      </nav>

      {/* MAIN GRID */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: '300px 1fr', gap: 8, padding: '8px 12px' }}>

        {/* LEFT PANEL */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden', minHeight: 0 }}>

          {/* Generator */}
          <div style={{ flexShrink: 0, padding: '13px 14px', background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(123,97,255,0.12)', borderRadius: 9, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: '#7B61FF', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>◈</span> GRAPH GENERATOR
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#7d8590', letterSpacing: '0.07em' }}>REPOSITORY</label>
              <select
                value={selectedRepo?.id || ''}
                onChange={e => {
                  const r = repos.find(r => r.id === Number(e.target.value))
                  if (r) { setSelectedRepo(r); setGraphData(null); setSelectedNode(null); setError(null) }
                }}
                style={{ width: '100%', padding: '7px 9px', background: 'rgba(123,97,255,0.04)', border: '1px solid rgba(123,97,255,0.18)', borderRadius: 5, color: '#e6edf3', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, outline: 'none', cursor: 'pointer' }}
              >
                {repos.map(r => <option key={r.id} value={r.id} style={{ background: '#0d1117' }}>{r.name}</option>)}
              </select>
            </div>
            {selectedRepo && (
              <div style={{ padding: '8px 10px', background: 'rgba(123,97,255,0.03)', border: '1px solid rgba(123,97,255,0.08)', borderRadius: 5, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {([['LANGUAGE', selectedRepo.language || 'Unknown'], ['STARS', String(selectedRepo.stargazers_count)], ['FORKS', String(selectedRepo.forks_count)]] as [string, string][]).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#7d8590' }}>{k}:</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#7B61FF' }}>{v}</span>
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
              onClick={handleGenerate}
              disabled={!selectedRepo || generating}
              style={{ width: '100%', padding: '9px', borderRadius: 6, cursor: selectedRepo && !generating ? 'pointer' : 'not-allowed', background: generating ? 'rgba(123,97,255,0.06)' : 'rgba(123,97,255,0.12)', border: `1px solid ${generating ? 'rgba(123,97,255,0.25)' : 'rgba(123,97,255,0.4)'}`, color: generating ? 'rgba(123,97,255,0.5)' : '#7B61FF', fontFamily: "'Orbitron',monospace", fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', transition: 'all 0.15s' }}
              onMouseEnter={e => { if (!generating) (e.currentTarget as HTMLElement).style.background = 'rgba(123,97,255,0.2)' }}
              onMouseLeave={e => { if (!generating) (e.currentTarget as HTMLElement).style.background = 'rgba(123,97,255,0.12)' }}
            >
              {generating ? '⟳ SCANNING IMPORTS...' : '◈ GENERATE GRAPH'}
            </button>
            {error && (
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#ff4466', padding: '6px 8px', background: 'rgba(255,68,102,0.06)', border: '1px solid rgba(255,68,102,0.15)', borderRadius: 4 }}>
                {error}
              </div>
            )}
          </div>

          {/* Legend */}
          <div style={{ flexShrink: 0, padding: '11px 14px', background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(123,97,255,0.1)', borderRadius: 9, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: '#e6edf3' }}>NODE TYPES</div>
            {([
              ['entry', 'ENTRY POINT', 'index / main / root files', 'diamond'],
              ['internal', 'INTERNAL MODULE', 'source files in the repo', 'square'],
              ['external', 'EXTERNAL PACKAGE', 'npm / pip / dependencies', 'circle'],
            ] as [string, string, string, string][]).map(([type, label, desc, shape]) => (
              <div key={type} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                <div style={{
                  width: 8, height: 8, flexShrink: 0, marginTop: 2,
                  background: NODE_STYLE[type].border,
                  boxShadow: `0 0 5px ${NODE_STYLE[type].border}`,
                  borderRadius: shape === 'circle' ? '50%' : shape === 'diamond' ? 0 : 2,
                  transform: shape === 'diamond' ? 'rotate(45deg)' : 'none',
                  outline: shape === 'circle' ? `1px dashed ${NODE_STYLE[type].border}` : 'none',
                  outlineOffset: 2,
                }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#c9d1d9' }}>{label}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#7d8590' }}>{desc}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Metrics */}
          {meta && (
            <div style={{ flexShrink: 0, padding: '11px 14px', background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(123,97,255,0.15)', borderRadius: 9, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: '#7B61FF' }}>GRAPH METRICS</div>
              {([
                ['TOTAL FILES', meta.totalFiles],
                ['FILES ANALYZED', meta.filesAnalyzed],
                ['INTERNAL NODES', meta.internalNodes],
                ['EXTERNAL PKGS', meta.externalPackages],
                ['TOTAL EDGES', meta.totalEdges],
              ] as [string, number][]).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#7d8590' }}>{k}:</span>
                  <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 12, fontWeight: 700, color: '#7B61FF' }}>{v}</span>
                </div>
              ))}
            </div>
          )}

          {/* Insights */}
          {insights && (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' }}>
              {/* Hubs */}
              {insights.hubs.length > 0 && (
                <div style={{ flexShrink: 0, padding: '11px 14px', background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(0,229,255,0.12)', borderRadius: 9 }}>
                  <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: '#00E5FF', marginBottom: 7 }}>
                    ◈ HUB MODULES
                  </div>
                  {insights.hubs.map(h => (
                    <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: '1px solid rgba(0,229,255,0.04)' }}>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#c9d1d9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{h.label}</span>
                      <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, color: '#00E5FF', fontWeight: 700, flexShrink: 0, marginLeft: 6 }}>×{h.inDegree}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Circular deps */}
              {insights.circularDeps.length > 0 && (
                <div style={{ flex: 1, minHeight: 0, padding: '11px 14px', background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(255,68,102,0.15)', borderRadius: 9, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: '#ff4466', marginBottom: 7, flexShrink: 0 }}>
                    ⚠ CIRCULAR DEPS ({insights.circularDeps.length})
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,68,102,0.2) transparent' }}>
                    {insights.circularDeps.map((cycle, i) => (
                      <div key={i} style={{ marginBottom: 6, padding: '5px 7px', background: 'rgba(255,68,102,0.04)', border: '1px solid rgba(255,68,102,0.1)', borderRadius: 4 }}>
                        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#ff4466', marginBottom: 3 }}>CYCLE {i + 1}</div>
                        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#c9d1d9', lineHeight: 1.5, wordBreak: 'break-all' }}>
                          {cycle.map((node, j) => (
                            <span key={j}>
                              <span style={{ color: '#7d8590' }}>{node.split('/').pop()}</span>
                              {j < cycle.length - 1 && <span style={{ color: 'rgba(255,68,102,0.5)', margin: '0 2px' }}>→</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {insights.hubs.length === 0 && insights.circularDeps.length === 0 && (
                <div style={{ padding: '11px 14px', background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(0,255,136,0.1)', borderRadius: 9 }}>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#00ff88' }}>// GRAPH_HEALTH: OPTIMAL</div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#7d8590', marginTop: 4 }}>No circular deps detected. No dominant hub modules.</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: Graph */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden', minHeight: 0 }}>
          <div style={{ flex: 1, minHeight: 0, background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(123,97,255,0.1)', borderRadius: 9, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

            {/* Header */}
            <div style={{ flexShrink: 0, padding: '8px 14px', borderBottom: '1px solid rgba(123,97,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: graphData ? '#00ff88' : '#7d8590', boxShadow: graphData ? '0 0 5px #00ff88' : 'none' }} />
                <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', color: '#7d8590' }}>
                  {graphData ? `DEPENDENCY GRAPH: ${selectedRepo?.name.toUpperCase()}` : 'AWAITING ANALYSIS'}
                </span>
              </div>
              {meta && (
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(123,97,255,0.4)' }}>
                  {meta.internalNodes} MODULES · {meta.externalPackages} PACKAGES · {meta.totalEdges} EDGES
                </span>
              )}
            </div>

            {/* Graph body */}
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              {generating ? (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                  <div style={{ position: 'relative', width: 56, height: 56 }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{ position: 'absolute', inset: i * 8, borderRadius: '50%', border: `1.5px solid rgba(123,97,255,${0.5 - i * 0.12})`, borderTopColor: i === 0 ? '#7B61FF' : 'transparent', animation: `spin ${0.7 + i * 0.3}s linear infinite${i % 2 === 1 ? ' reverse' : ''}` }} />
                    ))}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: '0.16em', color: 'rgba(123,97,255,0.7)' }}>PARSING AST & RESOLVING IMPORTS...</div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590', marginTop: 5 }}>ts-morph · dependency mapping · graph analysis</div>
                  </div>
                </div>
              ) : graphData ? (
                <>
                  <CytoscapeGraph
                    ref={cyGraphRef}
                    data={graphData}
                    layout={layout}
                    onNodeSelect={handleNodeSelect}
                  />
                  {selectedNode && (
                    <NodeDetail node={selectedNode} onClose={() => setSelectedNode(null)} />
                  )}
                </>
              ) : (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, opacity: 0.45 }}>
                  <div style={{ position: 'relative', width: 90, height: 90 }}>
                    {[40, 28, 16].map((r, i) => (
                      <div key={i} style={{ position: 'absolute', top: '50%', left: '50%', width: r * 2, height: r * 2, transform: 'translate(-50%,-50%)', borderRadius: '50%', border: `1px solid rgba(123,97,255,${0.1 + i * 0.06})` }} />
                    ))}
                    {/* Simulated nodes */}
                    {[[0, -36], [31, 18], [-31, 18], [0, 36], [-31, -18], [31, -18]].map(([x, y], i) => (
                      <div key={i} style={{ position: 'absolute', top: '50%', left: '50%', width: 6, height: 6, borderRadius: '50%', transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`, background: `rgba(123,97,255,${0.15 + i * 0.04})`, boxShadow: `0 0 4px rgba(123,97,255,0.2)` }} />
                    ))}
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 8, height: 8, borderRadius: '50%', background: 'rgba(123,97,255,0.4)', boxShadow: '0 0 10px rgba(123,97,255,0.4)' }} />
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
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, letterSpacing: '0.14em', color: 'rgba(123,97,255,0.3)' }}>
          GIT PLANET | Dependency Grapher | ts-morph AST · Cytoscape.js
        </span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: 'rgba(123,97,255,0.25)' }}>@{user.login}</span>
      </footer>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
