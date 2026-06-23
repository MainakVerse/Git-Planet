'use client'

import { useEffect, useRef } from 'react'
import {
  useRepoAnalysis, AnalysisShell, Card, Stat, Pill, AiSummary, C, FONT,
} from '@/components/analysis/shell'
import type { EcosystemReport } from '@/app/api/github/ecosystem-map/route'

const ACCENT = '#ff4466'
const GROUP_COLOR = { root: '#ff4466', dependency: '#00E5FF', related: '#7B61FF', ecosystem: '#FFD700' }

function EcoGraph({ report }: { report: EcosystemReport }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    let cy: { destroy: () => void } | null = null
    let cancelled = false
    import('cytoscape').then(({ default: cytoscape }) => {
      if (cancelled || !ref.current) return
      cy = cytoscape({
        container: ref.current,
        elements: [
          ...report.nodes.map(n => ({ data: { id: n.id, label: n.label, size: n.size, color: GROUP_COLOR[n.group] } })),
          ...report.edges.map(e => ({ data: { id: `${e.source}->${e.target}`, source: e.source, target: e.target, kind: e.kind } })),
        ],
        style: [
          { selector: 'node', style: { 'background-color': 'data(color)', label: 'data(label)', width: 'data(size)', height: 'data(size)', color: '#c9d1d9', 'font-size': 9, 'font-family': "'JetBrains Mono',monospace", 'text-valign': 'bottom', 'text-margin-y': 3, 'border-width': 1.5, 'border-color': '#050505', 'text-outline-width': 2, 'text-outline-color': '#050505' } },
          { selector: 'edge[kind="depends"]', style: { width: 1.5, 'line-color': 'rgba(0,229,255,0.3)', 'curve-style': 'straight' } },
          { selector: 'edge[kind="related"]', style: { width: 1.5, 'line-color': 'rgba(123,97,255,0.3)', 'line-style': 'dashed', 'curve-style': 'straight' } },
          { selector: 'edge[kind="topic"]', style: { width: 1, 'line-color': 'rgba(255,215,0,0.25)', 'line-style': 'dotted', 'curve-style': 'straight' } },
        ],
        layout: { name: 'concentric', concentric: (n: { data: (k: string) => number }) => n.data('size'), levelWidth: () => 2, minNodeSpacing: 30, animate: true, animationDuration: 700 },
        minZoom: 0.3, maxZoom: 2.5, wheelSensitivity: 0.2,
      })
    })
    return () => { cancelled = true; if (cy) cy.destroy() }
  }, [report])
  return <div ref={ref} style={{ width: '100%', height: 480, background: 'radial-gradient(circle at center, rgba(255,68,102,0.04), transparent)', borderRadius: 8 }} />
}

export default function EcosystemMapPage() {
  const a = useRepoAnalysis<EcosystemReport>('/api/github/ecosystem-map')
  const r = a.report

  return (
    <AnalysisShell
      title="Ecosystem Map" accent={ACCENT} icon="🌐"
      subtitle="Maps a repository's place in its ecosystem — its dependencies, sibling projects and topic neighbourhood as an interactive graph."
      analyseLabel="MAP ECOSYSTEM"
      user={a.user} repos={a.repos} selectedRepo={a.selectedRepo} setSelectedRepo={a.setSelectedRepo}
      analysing={a.analysing} onAnalyse={a.analyse} error={a.error} hasReport={!!r}
    >
      {r && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
            <Stat label="DIRECT DEPS" value={r.stats.directDependencies} color={C.accent} />
            <Stat label="DEV DEPS" value={r.stats.devDependencies} color={C.purple} />
            <Stat label="RELATED REPOS" value={r.stats.relatedRepos} color={ACCENT} />
            <Stat label="TOPICS" value={r.stats.topics.length} color={C.gold} />
          </div>

          <AiSummary text={r.summary} accent={ACCENT} />

          <Card title="ECOSYSTEM GRAPH" accent={ACCENT} icon="🌐">
            <div style={{ display: 'flex', gap: 14, marginBottom: 8, flexWrap: 'wrap' }}>
              {Object.entries(GROUP_COLOR).map(([g, c]) => (
                <span key={g} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
                  <span style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim }}>{g.toUpperCase()}</span>
                </span>
              ))}
            </div>
            <EcoGraph report={r} />
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {r.stats.ecosystems.length > 0 && (
              <Card title="PACKAGE ECOSYSTEMS" accent={C.accent} icon="◈">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {r.stats.ecosystems.map(e => (
                    <div key={e.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: e.color }} />
                      <span style={{ fontFamily: FONT.mono, fontSize: 11, color: C.sub, flex: 1 }}>{e.name}</span>
                      <span style={{ fontFamily: FONT.orbitron, fontSize: 11, color: e.color }}>{e.count}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            <Card title="RELATED PROJECTS" accent={C.purple} icon="◈">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {r.relatedRepos.map(rr => (
                  <a key={rr.full} href={rr.html} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
                    <span style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.purple, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rr.full}</span>
                    <span style={{ fontFamily: FONT.mono, fontSize: 9, color: C.gold }}>★{rr.stars.toLocaleString()}</span>
                  </a>
                ))}
              </div>
            </Card>
          </div>

          {r.stats.topics.length > 0 && (
            <Card title="TOPIC NEIGHBOURHOOD" accent={C.gold} icon="🏷">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {r.stats.topics.map(t => <Pill key={t} text={`#${t}`} color={C.gold} />)}
              </div>
            </Card>
          )}
        </div>
      )}
    </AnalysisShell>
  )
}
