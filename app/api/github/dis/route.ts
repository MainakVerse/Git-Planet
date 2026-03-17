import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/session'
import Anthropic from '@anthropic-ai/sdk'

// ── Types ───────────────────────────────────────────────────────────────────────

export interface DISComponent {
  key: string
  label: string
  score: number
  max: number
  weight: number   // percentage weight
  insight: string
}

export interface DomainScore {
  domain: string
  score: number    // 0-100
  repos: number
  topLang: string
}

export interface TimelinePoint {
  week: string     // ISO date of Monday
  commits: number
  prs: number
  reviews: number
  issues: number
}

export interface DISReport {
  login: string
  name: string | null
  avatar: string
  bio: string | null
  location: string | null
  company: string | null
  htmlUrl: string

  dis: number           // 0-100 final score
  belt: string          // belt label
  beltColor: string     // hex color
  beltEmoji: string
  confidence: number    // 0-100

  components: DISComponent[]
  domains: DomainScore[]
  timeline: TimelinePoint[]

  strengths: string[]
  weaknesses: string[]
  dominantDomains: string[]
  highlights: string[]   // feature-level contributions

  stats: {
    publicRepos: number
    followers: number
    following: number
    totalStars: number
    totalForks: number
    mergedPRs: number
    totalEvents: number
    accountAgeYears: number
    primaryLanguage: string
    uniqueLanguages: number
    totalSizeKb: number
    totalCommits: number
    totalPRs: number
    codeReviews: number
    totalGists: number
    topLanguages: { name: string; repos: number; pct: number; color: string }[]
  }

  aiSummary: string

  meta: {
    reposAnalyzed: number
    eventsAnalyzed: number
    generatedAt: string
  }
}

// ── Constants ────────────────────────────────────────────────────────────────────

const IGNORE_FORKS = true

const FRONTEND_LANGS = new Set(['JavaScript', 'TypeScript', 'CSS', 'HTML', 'Vue', 'Svelte', 'SCSS', 'Less', 'CoffeeScript'])
const BACKEND_LANGS  = new Set(['Python', 'Go', 'Java', 'Ruby', 'PHP', 'Kotlin', 'Scala', 'Elixir', 'Haskell', 'Clojure', 'Erlang', 'Dart', 'Perl'])
const SYSTEMS_LANGS  = new Set(['C', 'C++', 'Rust', 'Assembly', 'Zig', 'Nim', 'D', 'Fortran', 'Ada'])
const DEVOPS_LANGS   = new Set(['Shell', 'Bash', 'HCL', 'Dockerfile', 'Makefile', 'PowerShell', 'Nix'])
const DATA_LANGS     = new Set(['Python', 'R', 'Julia', 'MATLAB', 'Jupyter Notebook', 'SAS'])

const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#FFD43B',
  Go: '#00ADD8', Rust: '#dea584', Java: '#b07219', 'C++': '#f34b7d',
  C: '#555555', Ruby: '#701516', PHP: '#4F5D95', Swift: '#ffac45',
  Kotlin: '#A97BFF', CSS: '#563d7c', HTML: '#e34c26', Shell: '#89e051',
  Vue: '#41b883', Svelte: '#ff3e00', Dart: '#00B4AB', Scala: '#c22d40',
  R: '#276DC3', 'Jupyter Notebook': '#DA5B0B', Haskell: '#5e5086',
  Elixir: '#6e4a7e', 'C#': '#178600', Lua: '#000080', Perl: '#0298c3',
  Nim: '#ffc200', Zig: '#ec915c', 'F#': '#b845fc',
}

const BELTS: { min: number; label: string; color: string; emoji: string }[] = [
  { min: 91, label: 'Black Belt',  color: '#1a1a2e', emoji: '🥋' },
  { min: 81, label: 'Brown Belt',  color: '#8B4513', emoji: '🤎' },
  { min: 71, label: 'Purple Belt', color: '#7B61FF', emoji: '💜' },
  { min: 61, label: 'Blue Belt',   color: '#0099ff', emoji: '💙' },
  { min: 46, label: 'Green Belt',  color: '#00cc66', emoji: '💚' },
  { min: 31, label: 'Orange Belt', color: '#ff8800', emoji: '🧡' },
  { min: 16, label: 'Yellow Belt', color: '#FFD700', emoji: '💛' },
  { min: 0,  label: 'White Belt',  color: '#e0e0e0', emoji: '🤍' },
]

// ── Helpers ──────────────────────────────────────────────────────────────────────

async function ghFetch(url: string, headers: Record<string, string>): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 20_000)
  try { return await fetch(url, { headers, cache: 'no-store', signal: ctrl.signal }) }
  finally { clearTimeout(t) }
}

function logScale(value: number, base = 10, factor = 1): number {
  return Math.log10(value + 1) / Math.log10(base) * factor
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function getBelt(score: number) {
  return BELTS.find(b => score >= b.min) ?? BELTS[BELTS.length - 1]
}

function detectDomains(repos: GHRepo[]): DomainScore[] {
  const domains: { name: string; langs: Set<string>; keywords: string[] }[] = [
    { name: 'Frontend',  langs: FRONTEND_LANGS, keywords: ['react', 'vue', 'angular', 'svelte', 'next', 'nuxt', 'gatsby', 'ui', 'web', 'landing'] },
    { name: 'Backend',   langs: BACKEND_LANGS,  keywords: ['api', 'server', 'service', 'backend', 'rest', 'graphql', 'grpc', 'microservice', 'auth'] },
    { name: 'DevOps',    langs: DEVOPS_LANGS,   keywords: ['docker', 'k8s', 'kubernetes', 'ci', 'deploy', 'infra', 'terraform', 'helm', 'pipeline', 'ansible'] },
    { name: 'Data',      langs: DATA_LANGS,     keywords: ['ml', 'ai', 'model', 'data', 'analysis', 'notebook', 'nlp', 'vision', 'predict', 'train', 'dataset'] },
    { name: 'Systems',   langs: SYSTEMS_LANGS,  keywords: ['os', 'kernel', 'embedded', 'driver', 'compiler', 'vm', 'runtime', 'perf', 'low-level', 'memory'] },
  ]

  return domains.map(({ name, langs, keywords }) => {
    const matching = repos.filter(r => {
      const lang = r.language ?? ''
      const desc = (r.description ?? '').toLowerCase()
      const repoName = r.name.toLowerCase()
      const topics = (r.topics ?? []).join(' ')
      const inKeywords = keywords.some(k => desc.includes(k) || repoName.includes(k) || topics.includes(k))
      return langs.has(lang) || inKeywords
    })

    const totalStars = matching.reduce((s, r) => s + r.stargazers_count, 0)
    const primary = matching.reduce<string | null>((best, r) => {
      if (!best && r.language) return r.language
      return best
    }, null)

    // Score: repo count (0-50) + stars log-scaled (0-30) + match quality (0-20)
    const repoScore = clamp(matching.length / repos.length * 100, 0, 50)
    const starScore = clamp(logScale(totalStars, 10, 10), 0, 30)
    const qualityScore = matching.length >= 3 ? 20 : matching.length * 6
    const raw = repoScore + starScore + qualityScore

    return {
      domain: name,
      score: clamp(Math.round(raw), 0, 100),
      repos: matching.length,
      topLang: primary ?? (matching[0]?.language ?? '—'),
    }
  })
}

function buildTimeline(events: GHEvent[]): TimelinePoint[] {
  const weekMap = new Map<string, TimelinePoint>()

  for (const ev of events) {
    const d = new Date(ev.created_at)
    // Round to Monday of that week
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(d)
    monday.setDate(diff)
    monday.setHours(0, 0, 0, 0)
    const week = monday.toISOString().slice(0, 10)

    if (!weekMap.has(week)) weekMap.set(week, { week, commits: 0, prs: 0, reviews: 0, issues: 0 })
    const pt = weekMap.get(week)!

    if (ev.type === 'PushEvent') pt.commits += (ev.payload?.commits?.length ?? 1)
    else if (ev.type === 'PullRequestEvent' && ev.payload?.action === 'opened') pt.prs++
    else if (ev.type === 'PullRequestReviewEvent') pt.reviews++
    else if (ev.type === 'IssuesEvent' || ev.type === 'IssueCommentEvent') pt.issues++
  }

  return Array.from(weekMap.values()).sort((a, b) => a.week.localeCompare(b.week)).slice(-16)
}

// ── GitHub API Types ──────────────────────────────────────────────────────────────

interface GHUser {
  login: string; name: string | null; avatar_url: string; bio: string | null
  location: string | null; company: string | null; html_url: string
  public_repos: number; public_gists: number; followers: number; following: number; created_at: string
}

interface GHRepo {
  name: string; fork: boolean; stargazers_count: number; forks_count: number
  language: string | null; size: number; description: string | null
  topics: string[]; pushed_at: string; created_at: string; html_url: string
  default_branch: string
}

interface GHEvent {
  type: string; created_at: string
  payload?: { action?: string; commits?: unknown[]; review?: unknown }
}

interface SearchResult { total_count: number }

// ── Main Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get('gh_session')?.value
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const session = verifySession(token)
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })

  const accessToken = session.access_token as string
  const { searchParams } = new URL(req.url)
  const loginParam = searchParams.get('login') // optional; defaults to authenticated user

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  // 1. Fetch authenticated user first (for login fallback)
  const selfRes = await ghFetch('https://api.github.com/user', headers)
  if (!selfRes.ok) return NextResponse.json({ error: 'Failed to fetch user' }, { status: selfRes.status })
  const self = await selfRes.json() as GHUser

  const login = loginParam ?? self.login

  // 2. Fetch profile (if different from self, use /users/{login})
  let profile: GHUser
  if (login === self.login) {
    profile = self
  } else {
    const pRes = await ghFetch(`https://api.github.com/users/${login}`, headers)
    if (!pRes.ok) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    profile = await pRes.json() as GHUser
  }

  // 3. Parallel: repos + events + merged PR count + review count
  const [reposRes, eventsRes, mergedPRRes, reviewedPRRes] = await Promise.all([
    ghFetch(`https://api.github.com/users/${login}/repos?type=owner&per_page=100&sort=pushed`, headers),
    ghFetch(`https://api.github.com/users/${login}/events?per_page=100`, headers),
    ghFetch(`https://api.github.com/search/issues?q=is:pr+is:merged+author:${login}&per_page=1`, headers),
    ghFetch(`https://api.github.com/search/issues?q=is:pr+reviewed-by:${login}&per_page=1`, headers),
  ])

  const allRepos: GHRepo[] = reposRes.ok ? await reposRes.json() : []
  const events: GHEvent[]  = eventsRes.ok ? await eventsRes.json() : []
  const mergedCount: number  = mergedPRRes.ok ? ((await mergedPRRes.json()) as SearchResult).total_count : 0
  const reviewCount: number  = reviewedPRRes.ok ? ((await reviewedPRRes.json()) as SearchResult).total_count : 0

  // Filter forks if desired
  const repos = IGNORE_FORKS ? allRepos.filter(r => !r.fork) : allRepos

  // ── Derived Stats ──────────────────────────────────────────────────────────────

  const totalStars  = repos.reduce((s, r) => s + r.stargazers_count, 0)
  const totalForks  = repos.reduce((s, r) => s + r.forks_count, 0)
  const totalSize   = repos.reduce((s, r) => s + r.size, 0)

  // Language distribution
  const langCount = new Map<string, number>()
  for (const r of repos) {
    if (r.language) langCount.set(r.language, (langCount.get(r.language) ?? 0) + 1)
  }
  const sortedLangs  = Array.from(langCount.entries()).sort((a, b) => b[1] - a[1])
  const primaryLang  = sortedLangs[0]?.[0] ?? 'Unknown'
  const uniqueLangs  = langCount.size

  // Event breakdown
  const pushEvents    = events.filter(e => e.type === 'PushEvent')
  const prEvents      = events.filter(e => e.type === 'PullRequestEvent')
  const reviewEvents  = events.filter(e => e.type === 'PullRequestReviewEvent')
  const issueEvents   = events.filter(e => e.type === 'IssuesEvent' || e.type === 'IssueCommentEvent')
  const totalCommits  = pushEvents.reduce((s, e) => s + (e.payload?.commits?.length ?? 1), 0)

  const accountAgeYears = (Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24 * 365.25)

  // ── Component Scoring (12 dimensions, max = 100) ──────────────────────────────

  // 1. Star Power (0-10)
  const c1 = clamp(Math.round(logScale(totalStars, 10, 6.7)), 0, 10)

  // 2. Fork Impact (0-6)
  const c2 = clamp(Math.round(logScale(totalForks, 10, 4)), 0, 6)

  // 3. Language Breadth (0-9)
  const c3 = clamp(Math.round(uniqueLangs * 0.9), 0, 9)

  // 4. Topic Diversity (0-5)
  const topicDiversity = repos.filter(r => (r.topics ?? []).length > 0).length
  const c4 = clamp(Math.round(topicDiversity * 0.25), 0, 5)

  // 5. Account Longevity (0-8)
  const c5 = clamp(Math.round(accountAgeYears * 1.2), 0, 8)

  // 6. Activity Streak (0-6)
  const c6 = clamp(Math.round(events.length * 0.06), 0, 6)

  // 7. Merged PRs (0-11)
  const c7 = clamp(Math.round(logScale(mergedCount, 10, 7.3)), 0, 11)

  // 8. Code Reviews (0-8)
  const c8 = clamp(Math.round(logScale(reviewCount, 10, 5.3)), 0, 8)

  // 9. Issue Engagement (0-5)
  const c9 = clamp(Math.round(issueEvents.length * 0.2), 0, 5)

  // 10. Follower Reach (0-10)
  const c10 = clamp(Math.round(logScale(profile.followers, 10, 6.7)), 0, 10)

  // 11. Code Volume (0-12)
  const largeRepos = repos.filter(r => r.size > 500).length
  const c11 = clamp(Math.round(logScale(totalSize, 10, 5.3) + largeRepos * 0.4), 0, 12)

  // 12. Domain Mastery (0-10)
  const primaryRatio  = sortedLangs.length > 0 ? (sortedLangs[0][1] / repos.length) : 0
  const expertiseConc = clamp(primaryRatio * 6, 0, 6)
  const multiMastery  = sortedLangs.filter(([, c]) => c >= 3).length
  const masteryBonus  = clamp(multiMastery * 0.8, 0, 4)
  const c12 = clamp(Math.round(expertiseConc + masteryBonus), 0, 10)

  const dis = clamp(c1 + c2 + c3 + c4 + c5 + c6 + c7 + c8 + c9 + c10 + c11 + c12, 0, 100)

  // Aliases for insights backward-compat
  const repoInfluence   = c1 + c2
  const techBreadth     = c3 + c4
  const consistency     = c5 + c6
  const collaboration   = c7 + c8 + c9
  const communityImpact = c10
  const codeDepth       = c11
  const domainExpertise = c12

  // ── Confidence Score ──────────────────────────────────────────────────────────

  const repoCoverage  = clamp(repos.length / 10, 0, 1)          // 10+ repos = full repo signal
  const eventCoverage = clamp(events.length / 50, 0, 1)         // 50+ events = full activity signal
  const ageFactor     = clamp(accountAgeYears / 2, 0, 1)        // 2+ years = full age signal
  const confidence    = clamp(Math.round((repoCoverage * 0.4 + eventCoverage * 0.35 + ageFactor * 0.25) * 100), 0, 100)

  // ── Domains ───────────────────────────────────────────────────────────────────

  const domains = detectDomains(repos)

  // ── Timeline ──────────────────────────────────────────────────────────────────

  const timeline = buildTimeline(events)

  // ── Top Languages ──────────────────────────────────────────────────────────────

  const FALLBACK_COLORS = ['#00E5FF', '#7B61FF', '#00ff88', '#FFD700', '#ff8800']
  const topLanguages = sortedLangs.slice(0, 3).map(([name, count], i) => ({
    name,
    repos: count,
    pct: Math.round((count / repos.length) * 100),
    color: LANG_COLORS[name] ?? FALLBACK_COLORS[i],
  }))

  // ── Insights ──────────────────────────────────────────────────────────────────

  const components: DISComponent[] = [
    { key: 'star_power',       label: 'Star Power',          score: c1,  max: 10, weight: 10, insight: `${totalStars.toLocaleString()} total stars across ${repos.length} repos` },
    { key: 'fork_impact',      label: 'Fork Impact',         score: c2,  max: 6,  weight: 6,  insight: `${totalForks.toLocaleString()} times forked by the community` },
    { key: 'lang_breadth',     label: 'Language Breadth',    score: c3,  max: 9,  weight: 9,  insight: `${uniqueLangs} distinct languages used across repos` },
    { key: 'topic_diversity',  label: 'Topic Diversity',     score: c4,  max: 5,  weight: 5,  insight: `${topicDiversity} repos tagged with topics` },
    { key: 'account_longevity',label: 'Account Longevity',   score: c5,  max: 8,  weight: 8,  insight: `${accountAgeYears.toFixed(1)} years active on GitHub` },
    { key: 'activity_streak',  label: 'Activity Streak',     score: c6,  max: 6,  weight: 6,  insight: `${events.length} public events in recent history` },
    { key: 'merged_prs',       label: 'Merged PRs',          score: c7,  max: 11, weight: 11, insight: `${mergedCount} merged pull requests across all repos` },
    { key: 'code_reviews',     label: 'Code Reviews',        score: c8,  max: 8,  weight: 8,  insight: `${reviewCount} pull requests reviewed for others` },
    { key: 'issue_engagement', label: 'Issue Engagement',    score: c9,  max: 5,  weight: 5,  insight: `${issueEvents.length} issue interactions in recent events` },
    { key: 'follower_reach',   label: 'Follower Reach',      score: c10, max: 10, weight: 10, insight: `${profile.followers.toLocaleString()} followers · ${profile.following} following` },
    { key: 'code_volume',      label: 'Code Volume',         score: c11, max: 12, weight: 12, insight: `~${(totalSize / 1024).toFixed(0)} MB total · ${largeRepos} substantial repos (>500KB)` },
    { key: 'domain_mastery',   label: 'Domain Mastery',      score: c12, max: 10, weight: 10, insight: `Primary: ${primaryLang} · ${multiMastery} mastered languages (3+ repos each)` },
  ]

  const belt = getBelt(dis)

  // Strengths = top 3 components by percentage
  const ranked = [...components].sort((a, b) => (b.score / b.max) - (a.score / a.max))
  const strengths  = ranked.slice(0, 3).map(c => `${c.label} — ${c.insight}`)
  const weaknesses = ranked.slice(-2).map(c => `${c.label} — ${c.insight}`)

  const dominantDomains = [...domains]
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .filter(d => d.score > 20)
    .map(d => d.domain)

  // Highlights — detect notable feature-level contributions from repo names/topics
  const highlights: string[] = []
  const allTopics = repos.flatMap(r => r.topics ?? [])
  const allDescs  = repos.map(r => (r.description ?? '').toLowerCase())
  const authRepos = repos.filter(r => r.name.toLowerCase().includes('auth') || allTopics.includes('auth') || (r.description ?? '').toLowerCase().includes('auth'))
  if (authRepos.length) highlights.push(`Authentication systems (${authRepos.length} repo${authRepos.length > 1 ? 's' : ''})`)
  const apiRepos = repos.filter(r => r.name.toLowerCase().includes('api') || allTopics.includes('api') || allTopics.includes('rest'))
  if (apiRepos.length) highlights.push(`API & backend services (${apiRepos.length} repo${apiRepos.length > 1 ? 's' : ''})`)
  const mlRepos = repos.filter(r => allTopics.includes('machine-learning') || allTopics.includes('ml') || allTopics.includes('deep-learning') || allTopics.includes('ai'))
  if (mlRepos.length) highlights.push(`ML / AI contributions (${mlRepos.length} repo${mlRepos.length > 1 ? 's' : ''})`)
  const cliRepos = repos.filter(r => allTopics.includes('cli') || r.name.toLowerCase().includes('cli') || allTopics.includes('command-line'))
  if (cliRepos.length) highlights.push(`CLI tooling (${cliRepos.length} repo${cliRepos.length > 1 ? 's' : ''})`)
  if (repos.some(r => r.size > 2000)) highlights.push('Large-scale project experience (>2MB codebases)')
  if (mergedCount > 10) highlights.push(`Open-source contributor (${mergedCount} merged PRs)`)

  // ── AI Summary ────────────────────────────────────────────────────────────────

  let aiSummary = ''
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Write a sharp 3-sentence developer profile summary for a GitHub user. Be specific, insightful, and use a professional but engaging tone. Do not use bullet points or headers — flowing prose only. Do not start with the user's name.

Data:
- Login: ${profile.login}
- Name: ${profile.name ?? profile.login}
- Belt rank: ${belt.label} (DIS score: ${dis}/100)
- Public repos: ${profile.public_repos} (${repos.length} analysed)
- Top languages: ${topLanguages.map(l => `${l.name} (${l.pct}%)`).join(', ')}
- Total stars: ${totalStars}, forks: ${totalForks}
- Merged PRs: ${mergedCount}, code reviews: ${reviewCount}
- Dominant domains: ${detectDomains(repos).sort((a,b)=>b.score-a.score).slice(0,2).map(d=>d.domain).join(', ')}
- Account age: ${accountAgeYears.toFixed(1)} years
- Followers: ${profile.followers}
- Strengths: ${strengths.slice(0,2).map(s=>s.split(' — ')[0]).join(', ')}`,
      }],
    })
    aiSummary = (msg.content[0] as { type: string; text: string }).text.trim()
  } catch {
    aiSummary = `A ${belt.label.toLowerCase()} developer with ${profile.public_repos} public repositories, specialising in ${topLanguages[0]?.name ?? 'multiple languages'}. With ${totalStars} stars earned and ${mergedCount} merged pull requests, this profile reflects ${accountAgeYears.toFixed(1)} years of consistent open-source contribution.`
  }

  const report: DISReport = {
    login: profile.login,
    name: profile.name,
    avatar: profile.avatar_url,
    bio: profile.bio,
    location: profile.location,
    company: profile.company,
    htmlUrl: profile.html_url,

    dis,
    belt: belt.label,
    beltColor: belt.color,
    beltEmoji: belt.emoji,
    confidence,

    components,
    domains,
    timeline,
    strengths,
    weaknesses,
    dominantDomains,
    highlights,
    aiSummary,

    stats: {
      publicRepos: profile.public_repos,
      followers: profile.followers,
      following: profile.following,
      totalStars,
      totalForks,
      mergedPRs: mergedCount,
      totalEvents: events.length,
      totalCommits,
      totalPRs: prEvents.length,
      codeReviews: reviewCount,
      totalGists: profile.public_gists,
      accountAgeYears: Math.round(accountAgeYears * 10) / 10,
      primaryLanguage: primaryLang,
      uniqueLanguages: uniqueLangs,
      totalSizeKb: totalSize,
      topLanguages,
    },

    meta: {
      reposAnalyzed: repos.length,
      eventsAnalyzed: events.length,
      generatedAt: new Date().toISOString(),
    },
  }

  return NextResponse.json(report)
}
