import { NextRequest, NextResponse } from 'next/server'
import { authenticate, ghJson, parseRepoParams, clamp, pct, LANG_COLORS, type GHRepoMeta } from '@/lib/gh'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SimilarRepo {
  full: string
  description: string | null
  html: string
  stars: number
  language: string | null
  langColor: string
  similarity: number          // 0-100
  sharedTopics: string[]
  matchReasons: string[]
}

export interface SimilarityReport {
  owner: string
  repo: string
  baseTopics: string[]
  baseLanguage: string | null
  similar: SimilarRepo[]
  meta: { candidatesScanned: number; generatedAt: string }
}

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'for', 'to', 'of', 'in', 'with', 'is', 'this', 'that', 'on', 'by', 'app', 'tool', 'library', 'simple', 'easy', 'using'])

function tokens(s: string | null): Set<string> {
  if (!s) return new Set()
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w)))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
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

    const baseTopics = meta.topics ?? []
    const baseLang = meta.language
    const baseDesc = tokens(meta.description)
    const baseTopicSet = new Set(baseTopics)

    // Candidate pool: search across base topics, then by language+keywords
    const queries: string[] = []
    if (baseTopics.length) queries.push(baseTopics.slice(0, 3).map(t => `topic:${t}`).join(' '))
    if (baseLang) {
      const keyword = (meta.description ?? repo).split(/[^a-z0-9]+/i).filter(w => w.length > 3 && !STOP.has(w.toLowerCase()))[0]
      queries.push(`language:${baseLang}${keyword ? ' ' + keyword : ''}`)
    }
    if (queries.length === 0) queries.push(repo)

    const searches = await Promise.all(queries.map(q =>
      ghJson<{ items?: { full_name: string; description: string | null; html_url: string; stargazers_count: number; language: string | null; topics?: string[] }[] }>(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=40`, H, {},
      ),
    ))

    const seen = new Set<string>([`${owner}/${repo}`])
    const candidates = searches.flatMap(s => s.items ?? []).filter(it => {
      if (seen.has(it.full_name)) return false
      seen.add(it.full_name); return true
    })

    if (candidates.length === 0) {
      return NextResponse.json({ error: 'No comparable repositories found' }, { status: 404 })
    }

    const similar: SimilarRepo[] = candidates.map(it => {
      const candTopics = new Set(it.topics ?? [])
      const topicSim = jaccard(baseTopicSet, candTopics)
      const descSim = jaccard(baseDesc, tokens(it.description))
      const langMatch = it.language && it.language === baseLang ? 1 : 0

      const similarity = clamp(Math.round(topicSim * 50 + descSim * 30 + langMatch * 20), 0, 100)
      const shared = [...candTopics].filter(t => baseTopicSet.has(t))

      const reasons: string[] = []
      if (shared.length) reasons.push(`${shared.length} shared topic${shared.length > 1 ? 's' : ''}`)
      if (langMatch) reasons.push(`Same language (${baseLang})`)
      if (descSim > 0.15) reasons.push('Similar description')
      if (reasons.length === 0) reasons.push('Same niche')

      return {
        full: it.full_name, description: it.description, html: it.html_url,
        stars: it.stargazers_count, language: it.language, langColor: LANG_COLORS[it.language ?? ''] ?? '#7d8590',
        similarity, sharedTopics: shared, matchReasons: reasons,
      }
    }).filter(s => s.similarity > 0).sort((a, b) => b.similarity - a.similarity).slice(0, 20)

    const report: SimilarityReport = {
      owner, repo, baseTopics, baseLanguage: baseLang, similar,
      meta: { candidatesScanned: candidates.length, generatedAt: new Date().toISOString() },
    }
    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
