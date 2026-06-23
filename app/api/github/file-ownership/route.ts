import { NextRequest, NextResponse } from 'next/server'
import {
  authenticate, ghFetch, ghJson, parseRepoParams,
  pct, evenness, aiSummarize,
  type GHRepoMeta, type GHCommitListItem,
} from '@/lib/gh'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OwnerShare { login: string; avatar: string; changes: number; sharePct: number }

export interface DirectoryOwnership {
  path: string
  totalChanges: number
  primaryOwner: string
  primaryAvatar: string
  primarySharePct: number
  busFactor: number          // contributors holding 50% of changes here
  owners: OwnerShare[]
  isSiloed: boolean          // one person owns ≥ 80%
}

export interface FileOwnershipReport {
  owner: string
  repo: string

  directories: DirectoryOwnership[]
  siloedDirs: number
  sharedDirs: number
  knowledgeDistribution: number   // 0-100, higher = more shared

  topOwners: { login: string; avatar: string; dirsOwned: number; totalChanges: number }[]

  aiSummary: string
  meta: { commitsAnalyzed: number; filesAttributed: number; generatedAt: string; note: string }
}

const IGNORE_DIR = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'vendor', 'out', 'coverage'])
const MAX_COMMITS_DETAIL = 60   // bounded individual-commit fetches to respect timeout

function topDir(path: string): string {
  const parts = path.split('/')
  if (parts.length === 1) return '(root)'
  // group by first two levels for meaningful directories
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

    // Recent commit SHAs (single list call)
    const commitList = await ghJson<GHCommitListItem[]>(
      `https://api.github.com/repos/${owner}/${repo}/commits?per_page=100`, H, [],
    )
    const shas = commitList
      .filter(c => c?.sha && c.author?.login)
      .slice(0, MAX_COMMITS_DETAIL)

    if (shas.length === 0) {
      return NextResponse.json({ error: 'No attributable commits found' }, { status: 422 })
    }

    // Fetch individual commits (which include `files`) in bounded parallel batches
    interface CommitDetail { author: { login: string; avatar_url: string } | null; files?: { filename: string }[] }
    const avatarOf = new Map<string, string>()
    const dirOwnership = new Map<string, Map<string, number>>()  // dir → (login → change count)
    let filesAttributed = 0

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
        if (d?.author?.avatar_url) avatarOf.set(login, d.author.avatar_url)
        else if (slice[j].author?.avatar_url) avatarOf.set(login, slice[j].author!.avatar_url)
        for (const f of d?.files ?? []) {
          if (!f.filename) continue
          if (f.filename.split('/').some(seg => IGNORE_DIR.has(seg))) continue
          const dir = topDir(f.filename)
          const m = dirOwnership.get(dir) ?? new Map<string, number>()
          m.set(login, (m.get(login) ?? 0) + 1)
          dirOwnership.set(dir, m)
          filesAttributed++
        }
      }
    }

    if (dirOwnership.size === 0) {
      return NextResponse.json({ error: 'Could not attribute file changes (repo may be too large or commits lack file data)' }, { status: 422 })
    }

    // Build per-directory ownership
    const directories: DirectoryOwnership[] = Array.from(dirOwnership.entries()).map(([path, m]) => {
      const entries = Array.from(m.entries()).sort((a, b) => b[1] - a[1])
      const total = entries.reduce((s, [, c]) => s + c, 0)
      const owners: OwnerShare[] = entries.slice(0, 6).map(([login, changes]) => ({
        login, avatar: avatarOf.get(login) ?? '', changes, sharePct: pct(changes, total),
      }))
      // Bus factor within the dir
      let bf = 0, run = 0
      for (const o of owners) { run += o.sharePct; bf++; if (run >= 50) break }
      const primarySharePct = owners[0]?.sharePct ?? 0
      return {
        path, totalChanges: total,
        primaryOwner: owners[0]?.login ?? '—',
        primaryAvatar: owners[0]?.avatar ?? '',
        primarySharePct, busFactor: bf, owners,
        isSiloed: primarySharePct >= 80,
      }
    }).sort((a, b) => b.totalChanges - a.totalChanges).slice(0, 20)

    const siloedDirs = directories.filter(d => d.isSiloed).length
    const sharedDirs = directories.length - siloedDirs

    // Knowledge distribution: average evenness across directories
    const avgEvenness = directories.reduce((s, d) => s + evenness(d.owners.map(o => o.changes)), 0) / directories.length
    const knowledgeDistribution = Math.round(avgEvenness * 100)

    // Top owners across the repo
    const ownerTotals = new Map<string, { changes: number; dirs: number; avatar: string }>()
    for (const d of directories) {
      for (const o of d.owners) {
        const e = ownerTotals.get(o.login) ?? { changes: 0, dirs: 0, avatar: o.avatar }
        e.changes += o.changes
        if (o.login === d.primaryOwner) e.dirs++
        ownerTotals.set(o.login, e)
      }
    }
    const topOwners = Array.from(ownerTotals.entries())
      .sort((a, b) => b[1].changes - a[1].changes).slice(0, 8)
      .map(([login, e]) => ({ login, avatar: e.avatar, dirsOwned: e.dirs, totalChanges: e.changes }))

    const fallback =
      `Across ${directories.length} directories in ${owner}/${repo}, knowledge distribution scores ${knowledgeDistribution}/100. ` +
      `${siloedDirs > 0 ? `${siloedDirs} directories are siloed (one person owns 80%+), creating localized bus-factor risk.` : 'No single directory is dominated by one contributor — ownership is healthily shared.'} ` +
      `${topOwners[0] ? `${topOwners[0].login} is the primary owner of ${topOwners[0].dirsOwned} directories, the most of any contributor.` : ''}`

    const aiSummary = await aiSummarize(
      `Write a 3-sentence file-ownership analysis for the GitHub repo ${owner}/${repo}. Analytical prose, no bullets.
${directories.length} directories analysed. Knowledge distribution ${knowledgeDistribution}/100. ${siloedDirs} siloed directories, ${sharedDirs} shared. Top owner: ${topOwners[0]?.login} owns ${topOwners[0]?.dirsOwned} dirs.
Most-siloed: ${directories.filter(d => d.isSiloed).slice(0, 3).map(d => `${d.path} (${d.primaryOwner} ${d.primarySharePct}%)`).join(', ') || 'none'}.
Focus on knowledge concentration risk and where cross-training would help.`,
      fallback,
    )

    const report: FileOwnershipReport = {
      owner, repo,
      directories, siloedDirs, sharedDirs, knowledgeDistribution, topOwners,
      aiSummary,
      meta: {
        commitsAnalyzed: shas.length, filesAttributed,
        generatedAt: new Date().toISOString(),
        note: `Attributed from the last ${shas.length} commits' file changes (bounded for performance).`,
      },
    }

    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
