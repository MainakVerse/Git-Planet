import { NextRequest, NextResponse } from 'next/server'
import { authenticate, ghJson, parseRepoParams, fetchPackageJson, fetchSbom, aiSummarize, type GHRepoMeta } from '@/lib/gh'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EcoNode { id: string; label: string; group: 'root' | 'dependency' | 'related' | 'ecosystem'; size: number; meta?: string }
export interface EcoEdge { source: string; target: string; kind: 'depends' | 'related' | 'topic' }

export interface EcosystemReport {
  owner: string
  repo: string
  nodes: EcoNode[]
  edges: EcoEdge[]
  stats: {
    directDependencies: number
    devDependencies: number
    relatedRepos: number
    ecosystems: { name: string; count: number; color: string }[]
    topics: string[]
  }
  relatedRepos: { full: string; stars: number; description: string | null; html: string }[]
  summary: string
  meta: { generatedAt: string }
}

const ECO_COLORS: Record<string, string> = {
  npm: '#cb3837', pip: '#3776ab', go: '#00ADD8', maven: '#c71a36', cargo: '#dea584',
  rubygems: '#701516', composer: '#4F5D95', nuget: '#004880', unknown: '#7d8590',
}

export async function GET(req: NextRequest) {
  const auth = await authenticate()
  if (!auth.ok) return auth.response
  const H = auth.headers

  const params = parseRepoParams(new URL(req.url).searchParams)
  if (!params) return NextResponse.json({ error: 'Missing owner/repo' }, { status: 400 })
  const { owner, repo } = params

  try {
    const meta = await ghJson<GHRepoMeta | null>(`https://api.github.com/repos/${owner}/${repo}`, H, null)
    if (!meta) return NextResponse.json({ error: 'Repo not found' }, { status: 404 })

    const topics = meta.topics ?? []
    const lang = meta.language

    const [pkg, sbom, relatedSearch] = await Promise.all([
      fetchPackageJson(owner, repo, H),
      fetchSbom(owner, repo, H),
      // related repos by primary topic or language
      ghJson<{ items?: { full_name: string; stargazers_count: number; description: string | null; html_url: string }[] }>(
        topics.length
          ? `https://api.github.com/search/repositories?q=${encodeURIComponent('topic:' + topics[0])}&sort=stars&order=desc&per_page=8`
          : `https://api.github.com/search/repositories?q=${encodeURIComponent('language:' + (lang ?? 'javascript'))}&sort=stars&order=desc&per_page=8`,
        H, {},
      ),
    ])

    const rootId = `${owner}/${repo}`
    const nodes: EcoNode[] = [{ id: rootId, label: repo, group: 'root', size: 60, meta: `${meta.stargazers_count}★` }]
    const edges: EcoEdge[] = []

    // Dependencies — prefer package.json (with prod/dev split), fall back to SBOM
    const directDeps = pkg ? Object.keys(pkg.dependencies ?? {}) : []
    const devDeps = pkg ? Object.keys(pkg.devDependencies ?? {}) : []
    const ecoCounts = new Map<string, number>()

    const depList = directDeps.length || devDeps.length
      ? [...directDeps.map(d => ({ name: d, eco: 'npm', dev: false })), ...devDeps.map(d => ({ name: d, eco: 'npm', dev: true }))]
      : sbom.map(p => ({ name: p.name, eco: p.ecosystem, dev: false }))

    for (const d of depList.slice(0, 22)) {
      const id = `dep:${d.name}`
      nodes.push({ id, label: d.name, group: 'dependency', size: d.dev ? 18 : 26, meta: d.eco })
      edges.push({ source: rootId, target: id, kind: 'depends' })
      ecoCounts.set(d.eco, (ecoCounts.get(d.eco) ?? 0) + 1)
    }

    // Related repos
    const relatedRepos = (relatedSearch.items ?? [])
      .filter(r => r.full_name !== rootId)
      .slice(0, 7)
      .map(r => ({ full: r.full_name, stars: r.stargazers_count, description: r.description, html: r.html_url }))

    for (const r of relatedRepos.slice(0, 6)) {
      const id = `rel:${r.full}`
      nodes.push({ id, label: r.full.split('/')[1], group: 'related', size: 22, meta: `${r.stars}★` })
      edges.push({ source: rootId, target: id, kind: 'related' })
    }

    // Topic nodes
    for (const t of topics.slice(0, 5)) {
      const id = `topic:${t}`
      nodes.push({ id, label: `#${t}`, group: 'ecosystem', size: 16 })
      edges.push({ source: rootId, target: id, kind: 'topic' })
    }

    const ecosystems = Array.from(ecoCounts.entries()).map(([name, count]) => ({ name, count, color: ECO_COLORS[name] ?? ECO_COLORS.unknown }))

    const fallback =
      `${rootId} sits in a ${lang ?? 'software'} ecosystem with ${directDeps.length} direct and ${devDeps.length} dev dependencies. ` +
      `${relatedRepos.length ? `It shares space with related projects like ${relatedRepos.slice(0, 2).map(r => r.full).join(' and ')}.` : ''} ` +
      `${topics.length ? `Topics ${topics.slice(0, 3).map(t => '#' + t).join(', ')} place it in a recognisable niche.` : ''}`

    const summary = await aiSummarize(
      `Write a 2-3 sentence ecosystem summary for ${rootId} (${lang}). Topics: ${topics.join(', ') || 'none'}. ${directDeps.length} deps. Related repos: ${relatedRepos.map(r => r.full).join(', ')}. Describe where this repo sits in its ecosystem and its notable dependencies/neighbours. No bullets.`,
      fallback,
    )

    const report: EcosystemReport = {
      owner, repo, nodes, edges,
      stats: { directDependencies: directDeps.length, devDependencies: devDeps.length, relatedRepos: relatedRepos.length, ecosystems, topics },
      relatedRepos, summary,
      meta: { generatedAt: new Date().toISOString() },
    }

    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
