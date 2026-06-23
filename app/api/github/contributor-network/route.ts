import { NextRequest, NextResponse } from 'next/server'
import {
  authenticate, ghJson, parseRepoParams,
  clamp, pct, aiSummarize,
  type GHRepoMeta, type GHCommitListItem, type GHContributor,
} from '@/lib/gh'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NetNode {
  id: string
  label: string
  avatar: string
  commits: number
  degree: number          // number of collaborators
  community: number       // cluster id
  size: number            // viz size
}

export interface NetEdge {
  source: string
  target: string
  weight: number          // shared directories touched
}

export interface ContributorNetworkReport {
  owner: string
  repo: string

  nodes: NetNode[]
  edges: NetEdge[]

  density: number          // 0-100 how connected the graph is
  communities: number      // detected clusters
  collaborationScore: number
  mostConnected: { login: string; avatar: string; degree: number } | null
  isolatedContributors: string[]

  aiSummary: string
  meta: { commitsAnalyzed: number; contributorsAnalyzed: number; generatedAt: string }
}

const IGNORE_DIR = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'vendor'])
const MAX_COMMITS_DETAIL = 70

function topDir(path: string): string {
  const parts = path.split('/')
  if (parts.length === 1) return '(root)'
  return parts.slice(0, Math.min(2, parts.length - 1)).join('/')
}

// ── Handler ─────────────────────────────────────────────────────────────────────

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

    const [contributorsRaw, commitList] = await Promise.all([
      ghJson<GHContributor[]>(`https://api.github.com/repos/${owner}/${repo}/contributors?per_page=100`, H, []),
      ghJson<GHCommitListItem[]>(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=100`, H, []),
    ])

    const contributors = (contributorsRaw ?? []).filter(c => c?.login && c.type !== 'Bot' && !c.login.endsWith('[bot]'))
    const commitMap = new Map(contributors.map(c => [c.login, c.contributions]))
    const avatarMap = new Map(contributors.map(c => [c.login, c.avatar_url]))

    const shas = commitList.filter(c => c?.sha && c.author?.login).slice(0, MAX_COMMITS_DETAIL)
    if (shas.length === 0) return NextResponse.json({ error: 'No attributable commits found' }, { status: 422 })

    // Map each directory → set of contributors who touched it
    interface CommitDetail { author: { login: string; avatar_url: string } | null; files?: { filename: string }[] }
    const dirContributors = new Map<string, Set<string>>()

    const BATCH = 12
    for (let i = 0; i < shas.length; i += BATCH) {
      const slice = shas.slice(i, i + BATCH)
      const details = await Promise.all(slice.map(c =>
        ghJson<CommitDetail | null>(`https://api.github.com/repos/${owner}/${repo}/commits/${c.sha}`, H, null),
      ))
      for (let j = 0; j < details.length; j++) {
        const d = details[j]
        const login = d?.author?.login ?? slice[j].author?.login
        if (!login || login.endsWith('[bot]')) continue
        if (d?.author?.avatar_url) avatarMap.set(login, d.author.avatar_url)
        if (!commitMap.has(login)) commitMap.set(login, 1)
        for (const f of d?.files ?? []) {
          if (!f.filename || f.filename.split('/').some(seg => IGNORE_DIR.has(seg))) continue
          const dir = topDir(f.filename)
          const set = dirContributors.get(dir) ?? new Set<string>()
          set.add(login)
          dirContributors.set(dir, set)
        }
      }
    }

    // Build co-contribution edges: two contributors linked by shared directories
    const edgeWeight = new Map<string, number>()
    const involved = new Set<string>()
    for (const set of dirContributors.values()) {
      const members = Array.from(set)
      members.forEach(m => involved.add(m))
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const [a, b] = [members[i], members[j]].sort()
          const key = `${a}|${b}`
          edgeWeight.set(key, (edgeWeight.get(key) ?? 0) + 1)
        }
      }
    }

    // Node set = involved contributors (fallback to top contributors if attribution thin)
    const nodeLogins = involved.size >= 2
      ? Array.from(involved)
      : contributors.slice(0, 20).map(c => c.login)

    if (nodeLogins.length === 0) return NextResponse.json({ error: 'Not enough data to build a network' }, { status: 422 })

    // Degree + adjacency
    const adjacency = new Map<string, Set<string>>()
    nodeLogins.forEach(l => adjacency.set(l, new Set()))
    const edges: NetEdge[] = []
    for (const [key, weight] of edgeWeight) {
      const [a, b] = key.split('|')
      if (!adjacency.has(a) || !adjacency.has(b)) continue
      adjacency.get(a)!.add(b)
      adjacency.get(b)!.add(a)
      edges.push({ source: a, target: b, weight })
    }

    // Simple connected-component clustering for "communities"
    const community = new Map<string, number>()
    let clusterId = 0
    for (const start of nodeLogins) {
      if (community.has(start)) continue
      const stack = [start]; community.set(start, clusterId)
      while (stack.length) {
        const cur = stack.pop()!
        for (const nb of adjacency.get(cur) ?? []) {
          if (!community.has(nb)) { community.set(nb, clusterId); stack.push(nb) }
        }
      }
      clusterId++
    }

    const maxCommits = Math.max(1, ...nodeLogins.map(l => commitMap.get(l) ?? 1))
    const nodes: NetNode[] = nodeLogins.map(login => {
      const commits = commitMap.get(login) ?? 1
      const degree = adjacency.get(login)?.size ?? 0
      return {
        id: login, label: login, avatar: avatarMap.get(login) ?? '',
        commits, degree, community: community.get(login) ?? 0,
        size: 20 + Math.round((commits / maxCommits) * 40),
      }
    }).sort((a, b) => b.degree - a.degree)

    // Metrics
    const n = nodes.length
    const maxEdges = (n * (n - 1)) / 2
    const density = maxEdges > 0 ? pct(edges.length, maxEdges) : 0
    const communities = clusterId
    const isolatedContributors = nodes.filter(nd => nd.degree === 0).map(nd => nd.id)
    const avgDegree = n > 0 ? nodes.reduce((s, nd) => s + nd.degree, 0) / n : 0
    const collaborationScore = clamp(Math.round(
      density * 0.4 +
      clamp(avgDegree * 12, 0, 40) +
      (communities <= 1 ? 20 : clamp(20 - (communities - 1) * 4, 0, 20)),
    ), 0, 100)
    const mostConnected = nodes[0] ? { login: nodes[0].id, avatar: nodes[0].avatar, degree: nodes[0].degree } : null

    const fallback =
      `The contributor network of ${owner}/${repo} links ${n} contributors through ${edges.length} collaboration ties, at ${density}% graph density. ` +
      `${communities <= 1 ? 'Everyone works in a single connected cluster — strong cross-pollination.' : `Work splits across ${communities} sub-communities, suggesting siloed teams or feature areas.`} ` +
      `${mostConnected ? `${mostConnected.login} is the most connected hub, collaborating with ${mostConnected.degree} others.` : ''}`

    const aiSummary = await aiSummarize(
      `Write a 3-sentence contributor-network analysis for the GitHub repo ${owner}/${repo}. Analytical prose, no bullets.
${n} contributors, ${edges.length} collaboration edges, density ${density}%, ${communities} communities, ${isolatedContributors.length} isolated. Most connected: ${mostConnected?.login} (degree ${mostConnected?.degree}).
Focus on collaboration structure, hubs, and silos.`,
      fallback,
    )

    const report: ContributorNetworkReport = {
      owner, repo,
      nodes, edges,
      density, communities, collaborationScore,
      mostConnected, isolatedContributors,
      aiSummary,
      meta: { commitsAnalyzed: shas.length, contributorsAnalyzed: n, generatedAt: new Date().toISOString() },
    }

    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
