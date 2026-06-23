'use client'

import { useEffect, useRef } from 'react'
import {
  useRepoAnalysis, AnalysisShell, Card, ScoreRing, Stat, Pill, AvatarRow, AiSummary, C, FONT,
} from '@/components/analysis/shell'
import type { ContributorNetworkReport } from '@/app/api/github/contributor-network/route'

const ACCENT = C.purple
const CLUSTER_COLORS = ['#00E5FF', '#7B61FF', '#00ff88', '#FFD700', '#ff8800', '#ff4466', '#41b883', '#f472b6']

function NetworkGraph({ report }: { report: ContributorNetworkReport }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    let cy: { destroy: () => void } | null = null
    let cancelled = false

    import('cytoscape').then(({ default: cytoscape }) => {
      if (cancelled || !containerRef.current) return
      cy = cytoscape({
        container: containerRef.current,
        elements: [
          ...report.nodes.map(n => ({
            data: { id: n.id, label: n.label, size: n.size, color: CLUSTER_COLORS[n.community % CLUSTER_COLORS.length] },
          })),
          ...report.edges.map(e => ({
            data: { id: `${e.source}-${e.target}`, source: e.source, target: e.target, weight: e.weight },
          })),
        ],
        style: [
          { selector: 'node', style: {
            'background-color': 'data(color)', label: 'data(label)', width: 'data(size)', height: 'data(size)',
            color: '#c9d1d9', 'font-size': 9, 'font-family': "'JetBrains Mono', monospace",
            'text-valign': 'bottom', 'text-margin-y': 3, 'border-width': 1.5, 'border-color': '#050505',
            'text-outline-width': 2, 'text-outline-color': '#050505',
          } },
          { selector: 'edge', style: {
            width: 'mapData(weight, 1, 6, 1, 5)', 'line-color': 'rgba(123,97,255,0.3)',
            'curve-style': 'haystack', opacity: 0.6,
          } },
          { selector: 'node:selected', style: { 'border-color': '#00E5FF', 'border-width': 3 } },
        ],
        layout: { name: 'cose', animate: true, animationDuration: 700, nodeRepulsion: 8000, idealEdgeLength: 90, padding: 30 },
        minZoom: 0.3, maxZoom: 2.5, wheelSensitivity: 0.2,
      })
    })

    return () => { cancelled = true; if (cy) cy.destroy() }
  }, [report])

  return <div ref={containerRef} style={{ width: '100%', height: 460, background: 'radial-gradient(circle at center, rgba(123,97,255,0.04), transparent)', borderRadius: 8 }} />
}

export default function ContributorNetworkPage() {
  const a = useRepoAnalysis<ContributorNetworkReport>('/api/github/contributor-network')
  const r = a.report

  return (
    <AnalysisShell
      title="Contributor Network" accent={ACCENT} icon="🕸"
      subtitle="Maps how contributors collaborate by co-editing the same areas of the codebase — revealing hubs, clusters and isolated members."
      analyseLabel="BUILD NETWORK"
      user={a.user} repos={a.repos} selectedRepo={a.selectedRepo} setSelectedRepo={a.setSelectedRepo}
      analysing={a.analysing} onAnalyse={a.analyse} error={a.error} hasReport={!!r}
    >
      {r && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* STATS */}
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12 }}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <ScoreRing score={r.collaborationScore} size={110} label="COLLAB" />
              </div>
            </Card>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, alignContent: 'start' }}>
              <Stat label="CONTRIBUTORS" value={r.nodes.length} color={C.text} />
              <Stat label="CONNECTIONS" value={r.edges.length} color={ACCENT} />
              <Stat label="DENSITY" value={`${r.density}%`} color={C.accent} />
              <Stat label="COMMUNITIES" value={r.communities} color={C.gold} />
              {r.mostConnected && (
                <div style={{ gridColumn: 'span 2' }}>
                  <Card title="MOST CONNECTED HUB" accent={C.success} icon="◉">
                    <AvatarRow avatar={r.mostConnected.avatar} login={r.mostConnected.login}
                      sub={`collaborates with ${r.mostConnected.degree} others`}
                      right={<span style={{ fontFamily: FONT.orbitron, fontSize: 16, fontWeight: 700, color: C.success }}>{r.mostConnected.degree}</span>} />
                  </Card>
                </div>
              )}
              <div style={{ gridColumn: 'span 2' }}>
                <Card title="ISOLATED" accent={C.danger} icon="○">
                  {r.isolatedContributors.length ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {r.isolatedContributors.slice(0, 10).map(l => <Pill key={l} text={l} color={C.danger} />)}
                    </div>
                  ) : <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.success }}>None — everyone is connected.</span>}
                </Card>
              </div>
            </div>
          </div>

          <AiSummary text={r.aiSummary} accent={ACCENT} />

          {/* GRAPH */}
          <Card title="COLLABORATION GRAPH" accent={ACCENT} icon="🕸">
            <div style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim, marginBottom: 6 }}>
              Node size = commit volume · color = community cluster · edges = shared code areas · drag to explore
            </div>
            <NetworkGraph report={r} />
          </Card>
        </div>
      )}
    </AnalysisShell>
  )
}
