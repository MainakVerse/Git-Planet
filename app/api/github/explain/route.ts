import { NextRequest, NextResponse } from 'next/server'
import { authenticate, parseRepoParams, aiSummarize, pct } from '@/lib/gh'
import { buildRepoContext, renderContextDigest } from '@/lib/repo-context'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExplainReport {
  owner: string
  repo: string
  description: string | null
  stars: number
  forks: number
  primaryLanguage: string | null

  tldr: string                      // one-liner
  whatItDoes: string                // AI paragraph
  howItWorks: string                // AI paragraph

  techStack: { name: string; category: string; color: string }[]
  components: { name: string; purpose: string; files: number }[]
  languageBreakdown: { ext: string; count: number; pct: number; color: string }[]
  entryPoints: string[]
  quickStart: string[]

  stats: { files: number; directories: number; dependencies: number; hasTests: boolean; hasCI: boolean; hasDocker: boolean }
  meta: { generatedAt: string }
}

const EXT_COLORS: Record<string, string> = {
  ts: '#3178c6', tsx: '#3178c6', js: '#f1e05a', jsx: '#f1e05a', py: '#FFD43B',
  go: '#00ADD8', rs: '#dea584', java: '#b07219', rb: '#701516', php: '#4F5D95',
  css: '#563d7c', html: '#e34c26', md: '#888', json: '#888', yml: '#cb171e', yaml: '#cb171e',
}

const STACK_CATEGORIES: { match: RegExp; category: string; color: string }[] = [
  { match: /^(react|vue|svelte|angular|next|nuxt|gatsby|remix|solid-js)$/i, category: 'Framework', color: '#00E5FF' },
  { match: /^(express|fastify|koa|hono|@nestjs|nest)/i, category: 'Backend', color: '#7B61FF' },
  { match: /(prisma|drizzle|typeorm|sequelize|mongoose|knex)/i, category: 'ORM/DB', color: '#00ff88' },
  { match: /(tailwind|styled-components|emotion|sass|chakra|mui)/i, category: 'Styling', color: '#ff8800' },
  { match: /(jest|vitest|mocha|cypress|playwright|testing-library)/i, category: 'Testing', color: '#FFD700' },
  { match: /(webpack|vite|rollup|esbuild|turbopack|parcel)/i, category: 'Build', color: '#ff4466' },
  { match: /(openai|anthropic|langchain|@google|gemini|groq|ollama)/i, category: 'AI/ML', color: '#a855f7' },
]

// ── Handler ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await authenticate()
  if (!auth.ok) return auth.response
  const H = auth.headers

  const params = parseRepoParams(new URL(req.url).searchParams)
  if (!params) return NextResponse.json({ error: 'Missing owner/repo' }, { status: 400 })
  const { owner, repo } = params

  try {
    const ctx = await buildRepoContext(owner, repo, H)
    if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

    const blobs = ctx.tree.filter(f => f.type === 'blob')
    const allDeps = ctx.pkg ? { ...ctx.pkg.dependencies, ...ctx.pkg.devDependencies } : {}
    const depNames = Object.keys(allDeps)

    // Tech stack classification
    const techStack: ExplainReport['techStack'] = []
    const seen = new Set<string>()
    for (const dep of depNames) {
      for (const sc of STACK_CATEGORIES) {
        if (sc.match.test(dep) && !seen.has(sc.category + dep)) {
          seen.add(sc.category + dep)
          techStack.push({ name: dep, category: sc.category, color: sc.color })
        }
      }
    }

    // Components from top directories
    const DIR_PURPOSE: Record<string, string> = {
      api: 'HTTP/API route handlers', app: 'Application pages & routing', src: 'Core source code',
      components: 'Reusable UI components', lib: 'Shared utilities & helpers', utils: 'Helper functions',
      hooks: 'React hooks', pages: 'Page-level routes', server: 'Server-side logic', services: 'Business logic services',
      models: 'Data models', db: 'Database layer', config: 'Configuration', public: 'Static assets',
      styles: 'Stylesheets', tests: 'Test suites', test: 'Test suites', docs: 'Documentation', scripts: 'Build/utility scripts',
    }
    const components = ctx.topDirs.slice(0, 8).map(d => ({
      name: d.dir, purpose: DIR_PURPOSE[d.dir.toLowerCase()] ?? 'Project module', files: d.files,
    }))

    // Language breakdown
    const totalCounted = Object.values(ctx.languages).reduce((s, v) => s + v, 0)
    const languageBreakdown = Object.entries(ctx.languages)
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([ext, count]) => ({ ext, count, pct: pct(count, totalCounted), color: EXT_COLORS[ext] ?? '#7d8590' }))

    // Entry points
    const entryPoints = blobs
      .filter(f => /(^|\/)(index|main|app|server|cli)\.(ts|tsx|js|py|go|rs)$/.test(f.path) || f.path.endsWith('package.json'))
      .map(f => f.path).slice(0, 8)

    // Detected features
    const hasTests = blobs.some(f => /\.(test|spec)\.|\/(tests?|__tests__)\//.test(f.path))
    const hasCI = blobs.some(f => /\.github\/workflows\//.test(f.path) || /\.(gitlab-ci|travis|circleci)/.test(f.path))
    const hasDocker = blobs.some(f => /(^|\/)Dockerfile|docker-compose/.test(f.path))
    const dirCount = new Set(blobs.map(f => f.path.split('/').slice(0, -1).join('/')).filter(Boolean)).size

    // Quick start from scripts
    const quickStart: string[] = []
    if (ctx.pkg?.scripts) {
      const s = ctx.pkg.scripts
      quickStart.push('npm install')
      if (s.dev) quickStart.push('npm run dev')
      else if (s.start) quickStart.push('npm start')
      if (s.build) quickStart.push('npm run build')
      if (s.test) quickStart.push('npm test')
    }

    // AI explanations
    const digest = renderContextDigest(ctx)
    const tldrFallback = ctx.meta.description ?? `A ${ctx.meta.language ?? 'software'} project with ${ctx.fileCount} files.`
    const tldr = await aiSummarize(
      `In ONE punchy sentence (max 20 words), describe what this repository is. No preamble.\n\n${digest.slice(0, 3500)}`,
      tldrFallback, 60,
    )
    const whatItDoes = await aiSummarize(
      `Explain what this repository does in 2-3 sentences for a developer seeing it for the first time. Flowing prose, no bullets, no headers.\n\n${digest.slice(0, 5000)}`,
      `This is ${ctx.meta.full_name}, a ${ctx.meta.language ?? 'software'} project${ctx.meta.description ? `: ${ctx.meta.description}` : '.'} It contains ${ctx.fileCount} files across ${dirCount} directories${techStack.length ? `, built with ${techStack.slice(0, 3).map(t => t.name).join(', ')}.` : '.'}`,
    )
    const howItWorks = await aiSummarize(
      `Explain HOW this repository is architected and how its parts fit together, in 2-3 sentences. Reference the actual directories and entry points. Flowing prose, no bullets.\n\n${digest.slice(0, 5000)}`,
      `The codebase is organised into ${components.slice(0, 4).map(c => `${c.name}/ (${c.purpose.toLowerCase()})`).join(', ')}. Entry points include ${entryPoints.slice(0, 2).join(' and ') || 'the main module'}, and the project ${hasTests ? 'includes a test suite' : 'has no detected tests'}${hasCI ? ' with CI automation' : ''}.`,
    )

    const report: ExplainReport = {
      owner, repo,
      description: ctx.meta.description,
      stars: ctx.meta.stargazers_count, forks: ctx.meta.forks_count,
      primaryLanguage: ctx.meta.language,
      tldr, whatItDoes, howItWorks,
      techStack: techStack.slice(0, 16), components, languageBreakdown, entryPoints, quickStart,
      stats: { files: ctx.fileCount, directories: dirCount, dependencies: depNames.length, hasTests, hasCI, hasDocker },
      meta: { generatedAt: new Date().toISOString() },
    }

    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
