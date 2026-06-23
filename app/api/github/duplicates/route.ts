import { NextRequest, NextResponse } from 'next/server'
import { authenticate, ghJson, parseRepoParams, clamp, LANG_COLORS, type GHRepoMeta } from '@/lib/gh'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DuplicateMatch {
  full: string
  description: string | null
  html: string
  stars: number
  language: string | null
  langColor: string
  overlapScore: number        // 0-100
  verdict: 'likely-duplicate' | 'strong-overlap' | 'related'
  signals: string[]
  isFork: boolean
}

export interface DuplicatesReport {
  owner: string
  repo: string
  matches: DuplicateMatch[]
  buckets: { likely: number; strong: number; related: number }
  meta: { candidatesScanned: number; generatedAt: string }
}

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'for', 'to', 'of', 'in', 'with', 'is', 'this', 'app', 'tool', 'library', 'cli', 'simple'])
function tokens(s: string | null): Set<string> {
  if (!s) return new Set()
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w)))
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let inter = 0; for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
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

    const nameTokens = tokens(repo.replace(/[-_]/g, ' '))
    const descTokens = tokens(meta.description)
    const topicSet = new Set(meta.topics ?? [])
    const baseTokens = new Set([...nameTokens, ...descTokens])

    // Search by repo name terms + topics — the things duplicates would share
    const nameQuery = [...nameTokens].slice(0, 3).join(' ') || repo
    const queries = [
      `${nameQuery} ${meta.language ? 'language:' + meta.language : ''}`.trim(),
      ...(meta.topics?.length ? [meta.topics.slice(0, 2).map(t => `topic:${t}`).join(' ')] : []),
    ]

    const searches = await Promise.all(queries.map(q =>
      ghJson<{ items?: { full_name: string; description: string | null; html_url: string; stargazers_count: number; language: string | null; topics?: string[]; fork: boolean }[] }>(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=40`, H, {},
      ),
    ))

    const seen = new Set<string>([`${owner}/${repo}`])
    const candidates = searches.flatMap(s => s.items ?? []).filter(it => {
      if (seen.has(it.full_name)) return false
      seen.add(it.full_name); return true
    })

    if (candidates.length === 0) return NextResponse.json({ error: 'No comparable repositories found' }, { status: 404 })

    const matches: DuplicateMatch[] = candidates.map(it => {
      const candName = tokens(it.full_name.split('/')[1].replace(/[-_]/g, ' '))
      const candTokens = new Set([...candName, ...tokens(it.description)])
      const candTopics = new Set(it.topics ?? [])

      const nameSim = jaccard(nameTokens, candName)
      const textSim = jaccard(baseTokens, candTokens)
      const topicSim = jaccard(topicSet, candTopics)
      const langMatch = it.language === meta.language ? 1 : 0

      const overlapScore = clamp(Math.round(nameSim * 40 + textSim * 30 + topicSim * 20 + langMatch * 10), 0, 100)

      const verdict: DuplicateMatch['verdict'] =
        overlapScore >= 65 ? 'likely-duplicate' : overlapScore >= 40 ? 'strong-overlap' : 'related'

      const signals: string[] = []
      if (nameSim > 0.3) signals.push('Similar name')
      if (topicSim > 0.3) signals.push('Overlapping topics')
      if (textSim > 0.25) signals.push('Similar purpose')
      if (langMatch) signals.push('Same language')
      if (it.fork) signals.push('Is a fork')
      if (!signals.length) signals.push('Loose overlap')

      return {
        full: it.full_name, description: it.description, html: it.html_url,
        stars: it.stargazers_count, language: it.language, langColor: LANG_COLORS[it.language ?? ''] ?? '#7d8590',
        overlapScore, verdict, signals, isFork: it.fork,
      }
    }).filter(m => m.overlapScore >= 20).sort((a, b) => b.overlapScore - a.overlapScore).slice(0, 20)

    const buckets = {
      likely: matches.filter(m => m.verdict === 'likely-duplicate').length,
      strong: matches.filter(m => m.verdict === 'strong-overlap').length,
      related: matches.filter(m => m.verdict === 'related').length,
    }

    const report: DuplicatesReport = {
      owner, repo, matches, buckets,
      meta: { candidatesScanned: candidates.length, generatedAt: new Date().toISOString() },
    }
    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
