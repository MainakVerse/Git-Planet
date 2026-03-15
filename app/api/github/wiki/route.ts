import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/session'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface WikiPage {
  title: string
  slug: string
  icon: string
  content: string
}

export interface WikiReport {
  repoName: string
  repoDescription: string
  owner: string
  defaultBranch: string
  language: string
  stars: number
  forks: number
  topics: string[]
  pages: WikiPage[]
  meta: {
    filesAnalyzed: number
    totalFiles: number
    generatedAt: string
  }
}

// ── Constants ──────────────────────────────────────────────────────────────────

const IGNORE = new Set([
  'node_modules', '.git', '.next', '.nuxt', 'dist', 'build', 'out', 'coverage',
  '.cache', '.vercel', '.turbo', '__pycache__', '.pytest_cache', 'target',
  'vendor', '.idea', '.vscode', 'tmp', 'temp', 'logs',
])

const SOURCE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rb', '.java',
  '.kt', '.swift', '.cs', '.cpp', '.c', '.h', '.rs', '.php',
])

const CONFIG_FILES = new Set([
  'package.json', 'requirements.txt', 'Pipfile', 'go.mod', 'Cargo.toml',
  'pom.xml', 'build.gradle', 'composer.json', 'Gemfile',
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  '.env.example', '.env.sample', 'tsconfig.json', 'jsconfig.json',
  '.eslintrc', '.eslintrc.json', '.eslintrc.js', '.prettierrc',
  'next.config.js', 'next.config.ts', 'next.config.mjs',
  'vite.config.ts', 'vite.config.js', 'webpack.config.js',
  'README.md', 'README.mdx', 'CONTRIBUTING.md', 'CHANGELOG.md',
  '.github/CONTRIBUTING.md',
])

// ── Helpers ────────────────────────────────────────────────────────────────────

function extOf(p: string): string { const i = p.lastIndexOf('.'); return i >= 0 ? p.slice(i) : '' }

function baseName(p: string): string { return p.split('/').pop() ?? p }

async function ghFetch(url: string, headers: Record<string, string>): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 28_000)
  try { return await fetch(url, { headers, cache: 'no-store', signal: ctrl.signal }) }
  finally { clearTimeout(t) }
}

async function fetchFileContent(
  owner: string, repo: string, path: string,
  headers: Record<string, string>
): Promise<string | null> {
  try {
    const r = await ghFetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
      headers
    )
    if (!r.ok) return null
    const data = await r.json()
    if (!data.content) return null
    return Buffer.from(data.content, 'base64').toString('utf-8')
  } catch { return null }
}

function topDirs(paths: string[]): string[] {
  const dirs = new Set<string>()
  for (const p of paths) {
    const parts = p.split('/')
    if (parts.length > 1) dirs.add(parts[0])
  }
  return [...dirs].sort()
}

function detectFramework(pkg: Record<string, unknown> | null, language: string): string {
  if (!pkg) {
    if (language === 'Python') return 'Python'
    if (language === 'Go') return 'Go'
    if (language === 'Ruby') return 'Ruby on Rails / Ruby'
    if (language === 'Java') return 'Java'
    if (language === 'Rust') return 'Rust'
    return language || 'Unknown'
  }
  const deps = { ...(pkg.dependencies as Record<string, string> ?? {}), ...(pkg.devDependencies as Record<string, string> ?? {}) }
  if (deps['next']) return 'Next.js'
  if (deps['nuxt'] || deps['nuxt3']) return 'Nuxt.js'
  if (deps['react'] && !deps['next']) return 'React'
  if (deps['vue']) return 'Vue.js'
  if (deps['svelte']) return 'SvelteKit / Svelte'
  if (deps['@angular/core']) return 'Angular'
  if (deps['express']) return 'Express.js'
  if (deps['fastify']) return 'Fastify'
  if (deps['@nestjs/core']) return 'NestJS'
  if (deps['remix']) return 'Remix'
  return 'Node.js'
}

function extractReadmeSummary(readme: string | null): string {
  if (!readme) return ''
  const lines = readme.split('\n')
  const summaryLines: string[] = []
  let inCodeBlock = false
  let pastTitle = false
  for (const line of lines) {
    if (line.startsWith('```')) { inCodeBlock = !inCodeBlock; continue }
    if (inCodeBlock) continue
    if (line.startsWith('#') && !pastTitle) { pastTitle = true; continue }
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('[!') || trimmed.startsWith('[![')) continue
    if (trimmed.startsWith('#') || trimmed.startsWith('---') || trimmed.startsWith('===')) break
    if (pastTitle && trimmed.length > 20) {
      summaryLines.push(trimmed)
      if (summaryLines.join(' ').length > 400) break
    }
  }
  return summaryLines.join(' ').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').slice(0, 400)
}

function extractReadmeSection(readme: string | null, sectionKeywords: string[]): string {
  if (!readme) return ''
  const lines = readme.split('\n')
  let inSection = false
  let depth = 0
  const sectionLines: string[] = []
  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.*)/)
    if (headingMatch) {
      const lvl = headingMatch[1].length
      const text = headingMatch[2].toLowerCase()
      if (sectionKeywords.some(k => text.includes(k))) {
        inSection = true
        depth = lvl
        continue
      } else if (inSection && lvl <= depth) {
        break
      }
    }
    if (inSection) sectionLines.push(line)
    if (sectionLines.length > 60) break
  }
  return sectionLines.join('\n').trim().slice(0, 2000)
}

function detectApiRoutes(paths: string[]): Array<{ method: string; path: string; file: string }> {
  const routes: Array<{ method: string; path: string; file: string }> = []
  for (const p of paths) {
    // Next.js App Router: app/api/*/route.ts
    const nextApiMatch = p.match(/app\/api\/(.+)\/route\.[jt]sx?$/)
    if (nextApiMatch) {
      const routePath = '/api/' + nextApiMatch[1]
      routes.push({ method: 'GET/POST', path: routePath, file: p })
      continue
    }
    // Next.js Pages Router: pages/api/*.ts
    const pagesApiMatch = p.match(/pages\/api\/(.+)\.[jt]sx?$/)
    if (pagesApiMatch) {
      const routePath = '/api/' + pagesApiMatch[1]
      routes.push({ method: 'GET/POST', path: routePath, file: p })
      continue
    }
    // Express-style routes: routes/*.ts
    const expressMatch = p.match(/(?:routes?|controllers?)\/(.+)\.[jt]sx?$/)
    if (expressMatch) {
      routes.push({ method: 'REST', path: '/' + expressMatch[1], file: p })
    }
  }
  return routes
}

function refineApiMethods(
  routes: Array<{ method: string; path: string; file: string }>,
  fileContents: Record<string, string>
): Array<{ method: string; path: string; file: string; description: string }> {
  return routes.map(route => {
    const content = fileContents[route.file] ?? ''
    const methods: string[] = []
    if (/export\s+async\s+function\s+GET|export\s+function\s+GET/.test(content)) methods.push('GET')
    if (/export\s+async\s+function\s+POST|export\s+function\s+POST/.test(content)) methods.push('POST')
    if (/export\s+async\s+function\s+PUT|export\s+function\s+PUT/.test(content)) methods.push('PUT')
    if (/export\s+async\s+function\s+DELETE|export\s+function\s+DELETE/.test(content)) methods.push('DELETE')
    if (/export\s+async\s+function\s+PATCH|export\s+function\s+PATCH/.test(content)) methods.push('PATCH')
    const method = methods.length > 0 ? methods.join(', ') : route.method
    // Extract a description hint from the file content
    const descMatch = content.match(/\/\/\s*─+\s*([^\n]{5,60})/) || content.match(/\/\*\*?\s*\n\s*\*\s*([^\n]{5,60})/)
    const description = descMatch ? descMatch[1].replace(/[*\/]/g, '').trim() : ''
    return { ...route, method, description }
  })
}

function describeDirectory(dir: string, files: string[]): string {
  const ext = [...new Set(files.map(f => extOf(f)).filter(Boolean))].join(', ')
  const count = files.length

  const knownDirs: Record<string, string> = {
    'app': 'Next.js App Router pages and API routes',
    'pages': 'Next.js Pages Router entries and API handlers',
    'components': 'Reusable UI components',
    'lib': 'Shared utilities, helpers, and library code',
    'utils': 'Utility functions and helpers',
    'hooks': 'Custom React hooks',
    'store': 'State management (Redux / Zustand / Context)',
    'context': 'React context providers',
    'services': 'Business logic and external service integrations',
    'api': 'API client wrappers and server handlers',
    'types': 'TypeScript type definitions and interfaces',
    'models': 'Data models and database schemas',
    'middleware': 'Request middleware and interceptors',
    'config': 'Configuration files and constants',
    'public': 'Static assets served directly',
    'assets': 'Images, fonts, and other static resources',
    'styles': 'CSS, SCSS, and style files',
    'tests': 'Test suites and test utilities',
    'scripts': 'Build, migration, and automation scripts',
    'docs': 'Project documentation',
    'prisma': 'Prisma ORM schema and migrations',
    'migrations': 'Database migration files',
    'seeds': 'Database seed data',
    'routes': 'Route definitions',
    'controllers': 'Request handlers and controllers',
    'views': 'View templates',
    'helpers': 'Helper functions',
    'validators': 'Input validation logic',
  }
  const known = knownDirs[dir.toLowerCase()]
  if (known) return `${known} (${count} file${count !== 1 ? 's' : ''}, ${ext})`
  return `${count} file${count !== 1 ? 's' : ''} (${ext})`
}

// ── Wiki Page Generators ───────────────────────────────────────────────────────

function generateHomePage(
  repoMeta: {
    name: string; owner: string; description: string; language: string
    stars: number; forks: number; topics: string[]; defaultBranch: string
    htmlUrl: string; license: string | null; createdAt: string; updatedAt: string
  },
  readme: string | null,
  framework: string
): string {
  const summary = extractReadmeSummary(readme)
  const topicsLine = repoMeta.topics.length > 0
    ? repoMeta.topics.map(t => `\`${t}\``).join(' ')
    : ''

  const lines: string[] = [
    `# ${repoMeta.name}`,
    '',
    summary ? `> ${summary}` : `> ${repoMeta.description || 'No description provided.'}`,
    '',
    '## Overview',
    '',
    `**${repoMeta.name}** is a **${framework}** project`,
    repoMeta.description ? `that ${repoMeta.description.toLowerCase().replace(/^[A-Z]/, c => c.toLowerCase())}.` : '.',
    '',
    '| Property | Value |',
    '|---|---|',
    `| **Language** | ${repoMeta.language || 'Multiple'} |`,
    `| **Framework** | ${framework} |`,
    `| **Stars** | ⭐ ${repoMeta.stars} |`,
    `| **Forks** | 🍴 ${repoMeta.forks} |`,
    repoMeta.license ? `| **License** | ${repoMeta.license} |` : '',
    `| **Default Branch** | \`${repoMeta.defaultBranch}\` |`,
    `| **Last Updated** | ${repoMeta.updatedAt.slice(0, 10)} |`,
    '',
  ]

  if (topicsLine) {
    lines.push('## Topics', '', topicsLine, '')
  }

  lines.push(
    '## Wiki Sections',
    '',
    '| Page | Description |',
    '|---|---|',
    '| [Architecture Overview](Architecture-Overview) | System design, tech stack, and directory structure |',
    '| [Module Documentation](Module-Documentation) | Detailed breakdown of each module and component |',
    '| [API Endpoints](API-Endpoints) | Available API routes, methods, and request/response formats |',
    '| [Core Workflows](Core-Workflows) | Key execution flows and data pipelines |',
    '| [Setup Guide](Setup-Guide) | Installation, configuration, and running the project |',
    '| [Development Guidelines](Development-Guidelines) | Coding standards, contribution workflow, and best practices |',
    '',
    '## Quick Start',
    '',
    '```bash',
    `# Clone the repository`,
    `git clone ${repoMeta.htmlUrl}.git`,
    `cd ${repoMeta.name}`,
    '',
    '# See the Setup Guide wiki page for full installation instructions',
    '```',
    '',
    '---',
    '',
    `*Wiki auto-generated by [Git Planet](https://git-planet.vercel.app) from repository analysis.*`,
  )

  return lines.filter(l => l !== null && l !== undefined).join('\n')
}

function generateArchitecturePage(
  repoMeta: { name: string; language: string },
  framework: string,
  allPaths: string[],
  fileContents: Record<string, string>,
  pkg: Record<string, unknown> | null
): string {
  const dirs = topDirs(allPaths)
  const filesByDir: Record<string, string[]> = {}
  for (const p of allPaths) {
    const parts = p.split('/')
    if (parts.length > 1) {
      const d = parts[0]
      if (!filesByDir[d]) filesByDir[d] = []
      filesByDir[d].push(p)
    }
  }

  const deps = pkg ? { ...(pkg.dependencies as Record<string, string> ?? {}), ...(pkg.devDependencies as Record<string, string> ?? {}) } : {}
  const notableDeps = Object.keys(deps).filter(d =>
    !d.startsWith('@types/') && !d.startsWith('eslint') && d !== 'typescript'
  ).slice(0, 20)

  const lines: string[] = [
    '# Architecture Overview',
    '',
    `## System Summary`,
    '',
    `**${repoMeta.name}** is built with **${framework}** and primarily uses **${repoMeta.language || 'JavaScript/TypeScript'}**.`,
    '',
  ]

  // Tech stack section
  if (notableDeps.length > 0) {
    lines.push('## Tech Stack', '')
    lines.push('| Package | Version |')
    lines.push('|---|---|')
    for (const dep of notableDeps) {
      lines.push(`| \`${dep}\` | ${(deps[dep] as string).replace('^', '').replace('~', '')} |`)
    }
    lines.push('')
  }

  // Directory structure
  lines.push('## Directory Structure', '')
  lines.push('```')
  lines.push(repoMeta.name + '/')
  for (const dir of dirs.slice(0, 20)) {
    const count = filesByDir[dir]?.length ?? 0
    lines.push(`├── ${dir}/  (${count} files)`)
  }
  const rootFiles = allPaths.filter(p => !p.includes('/'))
  for (const f of rootFiles.slice(0, 10)) {
    lines.push(`├── ${f}`)
  }
  lines.push('```')
  lines.push('')

  // Directory descriptions
  lines.push('## Module Breakdown', '')
  lines.push('| Directory | Purpose |')
  lines.push('|---|---|')
  for (const dir of dirs.slice(0, 20)) {
    const files = filesByDir[dir] ?? []
    const desc = describeDirectory(dir, files)
    lines.push(`| \`${dir}/\` | ${desc} |`)
  }
  lines.push('')

  // Architecture patterns
  lines.push('## Architectural Patterns', '')
  const patterns: string[] = []
  if (framework === 'Next.js') {
    const hasAppDir = allPaths.some(p => p.startsWith('app/'))
    const hasPagesDir = allPaths.some(p => p.startsWith('pages/'))
    if (hasAppDir) patterns.push('**App Router** — Uses the Next.js 13+ App Router with React Server Components')
    if (hasPagesDir) patterns.push('**Pages Router** — Uses the Next.js Pages directory for routing')
    if (allPaths.some(p => p.includes('/api/'))) patterns.push('**API Routes** — Server-side API handlers co-located with the frontend')
  }
  if (fileContents && Object.values(fileContents).some(c => /useContext|createContext/.test(c))) {
    patterns.push('**Context API** — React Context used for state sharing across components')
  }
  if (fileContents && Object.values(fileContents).some(c => /useState|useEffect/.test(c))) {
    patterns.push('**Hooks-based state** — Local component state managed via React hooks')
  }
  if (allPaths.some(p => p.includes('prisma'))) {
    patterns.push('**Prisma ORM** — Database access abstracted through Prisma')
  }
  if (deps['zod']) patterns.push('**Zod** — Runtime schema validation for type-safe data handling')
  if (deps['zustand']) patterns.push('**Zustand** — Lightweight global state management')
  if (patterns.length === 0) patterns.push('Standard modular architecture with separation of concerns')

  for (const p of patterns) lines.push(`- ${p}`)
  lines.push('')

  lines.push('---', '', '*[← Home](Home) | [Module Documentation →](Module-Documentation)*')
  return lines.join('\n')
}

function generateModulePage(
  allPaths: string[],
  fileContents: Record<string, string>
): string {
  const filesByDir: Record<string, string[]> = {}
  for (const p of allPaths) {
    const parts = p.split('/')
    const dir = parts.length > 1 ? parts[0] : '(root)'
    if (!filesByDir[dir]) filesByDir[dir] = []
    filesByDir[dir].push(p)
  }

  const lines: string[] = ['# Module Documentation', '']
  lines.push('This page documents each major module and its constituent files.')
  lines.push('')

  for (const [dir, files] of Object.entries(filesByDir).slice(0, 15)) {
    lines.push(`## \`${dir}/\``, '')
    lines.push(describeDirectory(dir === '(root)' ? 'root' : dir, files))
    lines.push('')
    lines.push('| File | Description |')
    lines.push('|---|---|')

    for (const file of files.slice(0, 20)) {
      const content = fileContents[file] ?? ''
      const name = baseName(file)
      let desc = ''

      // Try to extract a description from exports or top-level comments
      const commentMatch = content.match(/^\/\/\s*(.{10,80})/m) || content.match(/^\/\*\*?\s*\n?\s*\*?\s*(.{10,80})/m)
      if (commentMatch) {
        desc = commentMatch[1].replace(/[*\/]/g, '').trim()
      } else {
        // Infer from file name conventions
        if (name.includes('route')) desc = 'API route handler'
        else if (name.includes('page')) desc = 'Page component'
        else if (name.includes('layout')) desc = 'Layout component'
        else if (name.includes('component') || name.match(/\.(tsx|jsx)$/)) desc = 'UI component'
        else if (name.includes('hook') || name.startsWith('use')) desc = 'Custom hook'
        else if (name.includes('util') || name.includes('helper')) desc = 'Utility functions'
        else if (name.includes('type') || name.includes('interface')) desc = 'Type definitions'
        else if (name.includes('config')) desc = 'Configuration'
        else if (name.includes('middleware')) desc = 'Middleware handler'
        else if (name.includes('service')) desc = 'Service layer'
        else if (name.includes('model') || name.includes('schema')) desc = 'Data model / schema'
        else desc = 'Module'
      }

      // Count exports
      const exportCount = (content.match(/^export\s/gm) ?? []).length
      if (exportCount > 0) desc += ` · ${exportCount} export${exportCount !== 1 ? 's' : ''}`

      lines.push(`| \`${name}\` | ${desc} |`)
    }

    if (files.length > 20) lines.push(`| *(+${files.length - 20} more files)* | |`)
    lines.push('')
  }

  lines.push('---', '', '*[← Architecture Overview](Architecture-Overview) | [API Endpoints →](API-Endpoints)*')
  return lines.join('\n')
}

function generateApiEndpointsPage(
  allPaths: string[],
  fileContents: Record<string, string>,
  owner: string,
  repoName: string,
  defaultBranch: string
): string {
  const routes = detectApiRoutes(allPaths)
  const refined = refineApiMethods(routes, fileContents)

  const lines: string[] = ['# API Endpoints', '']

  if (refined.length === 0) {
    lines.push('No API routes were detected in this repository.')
    lines.push('')
    lines.push('If this is a frontend-only project or uses a separate backend, refer to the backend service documentation.')
  } else {
    lines.push(`This repository exposes **${refined.length}** API endpoint${refined.length !== 1 ? 's' : ''}.`)
    lines.push('')
    lines.push('## Endpoint Reference', '')
    lines.push('| Method | Endpoint | Source File | Notes |')
    lines.push('|---|---|---|---|')

    for (const route of refined) {
      const fileLink = `[\`${baseName(route.file)}\`](https://github.com/${owner}/${repoName}/blob/${defaultBranch}/${route.file})`
      const notes = route.description ? route.description.slice(0, 60) : '—'
      lines.push(`| \`${route.method}\` | \`${route.path}\` | ${fileLink} | ${notes} |`)
    }
    lines.push('')

    // Group by top-level path segment
    const groups: Record<string, typeof refined> = {}
    for (const route of refined) {
      const seg = route.path.split('/')[2] ?? 'other'
      if (!groups[seg]) groups[seg] = []
      groups[seg].push(route)
    }

    lines.push('## Endpoint Groups', '')
    for (const [group, groupRoutes] of Object.entries(groups)) {
      lines.push(`### \`/${group}\``, '')
      for (const route of groupRoutes) {
        lines.push(`#### \`${route.method} ${route.path}\``, '')
        const content = fileContents[route.file] ?? ''
        // Extract query params
        const qpMatches = [...content.matchAll(/searchParams\.get\(['"](\w+)['"]\)/g)].map(m => m[1])
        if (qpMatches.length > 0) {
          lines.push('**Query Parameters:**', '')
          for (const qp of [...new Set(qpMatches)]) {
            lines.push(`- \`${qp}\` — string`)
          }
          lines.push('')
        }
        // Check for auth
        if (/verifySession|getSession|auth\(|requireAuth|middleware/.test(content)) {
          lines.push('> 🔐 **Authentication required** — include session cookie or auth header.')
          lines.push('')
        }
        if (route.description) {
          lines.push(`${route.description}`, '')
        }
      }
    }
  }

  lines.push('---', '', '*[← Module Documentation](Module-Documentation) | [Core Workflows →](Core-Workflows)*')
  return lines.join('\n')
}

function generateWorkflowsPage(
  allPaths: string[],
  fileContents: Record<string, string>,
  framework: string
): string {
  const lines: string[] = ['# Core Workflows', '']
  lines.push('This page describes the key execution flows and data pipelines in the project.')
  lines.push('')

  const workflows: Array<{ title: string; steps: string[] }> = []

  // Auth workflow detection
  const hasAuth = allPaths.some(p => /auth|login|session|oauth|jwt/i.test(p))
  if (hasAuth) {
    const authPaths = allPaths.filter(p => /auth|login|session|oauth|jwt/i.test(p))
    const authContent = authPaths.map(p => fileContents[p] ?? '').join('\n')
    const steps: string[] = []

    if (/oauth|github.*login|google.*login/i.test(authContent)) {
      steps.push('User clicks "Sign in" → redirected to OAuth provider')
      steps.push('OAuth provider authenticates user and returns authorization code')
      steps.push('Callback endpoint exchanges code for access token')
      if (/cookie|session/i.test(authContent)) {
        steps.push('Session token created and stored in secure HTTP-only cookie')
      }
      steps.push('User redirected to dashboard / protected area')
      steps.push('Subsequent requests: session cookie verified on each API call')
    } else if (/jwt/i.test(authContent)) {
      steps.push('User submits credentials (username/password)')
      steps.push('Server validates credentials against database')
      steps.push('JWT token generated and returned to client')
      steps.push('Client stores token (localStorage / cookie)')
      steps.push('Protected routes check JWT validity on each request')
    } else {
      steps.push('User submits login form')
      steps.push('Server authenticates credentials')
      steps.push('Session created and stored')
      steps.push('User gains access to protected resources')
    }
    if (steps.length > 0) workflows.push({ title: 'Authentication Flow', steps })
  }

  // Data fetching workflow
  const hasFetching = Object.values(fileContents).some(c => /fetch\(|axios\.|useQuery|useSWR/.test(c))
  if (hasFetching) {
    const usesSWR = Object.values(fileContents).some(c => /useSWR/.test(c))
    const usesReactQuery = Object.values(fileContents).some(c => /useQuery|useMutation/.test(c))
    const steps: string[] = []
    if (usesSWR) {
      steps.push('Component mounts → `useSWR` hook initiates fetch')
      steps.push('SWR checks cache for existing data and returns stale data immediately')
      steps.push('Background revalidation fetches fresh data from API')
      steps.push('Component re-renders with updated data')
    } else if (usesReactQuery) {
      steps.push('Component mounts → React Query checks cache for existing data')
      steps.push('If stale/missing, query function executes HTTP request')
      steps.push('Loading state shown during fetch; error state on failure')
      steps.push('Component re-renders with fresh data; cache updated for future requests')
    } else {
      steps.push('User interaction triggers data fetch (button click / page load)')
      steps.push('`fetch()` call made to API endpoint with credentials')
      steps.push('Response parsed and stored in component state via `useState`')
      steps.push('UI re-renders to display new data or error message')
    }
    if (steps.length > 0) workflows.push({ title: 'Data Fetching Flow', steps })
  }

  // Build / deploy workflow
  const hasCICD = allPaths.some(p => p.startsWith('.github/workflows') || p.includes('ci.yml') || p.includes('deploy.yml'))
  if (hasCICD) {
    workflows.push({
      title: 'CI/CD Pipeline',
      steps: [
        'Developer pushes code to feature branch',
        'GitHub Actions workflow triggered on push / pull request',
        'Steps: install dependencies → lint → run tests → build',
        'On merge to main: deployment workflow triggered',
        'Application deployed to production environment',
      ],
    })
  }

  // Framework-specific workflows
  if (framework === 'Next.js') {
    workflows.push({
      title: 'Next.js Request Lifecycle',
      steps: [
        'Incoming HTTP request hits Next.js server',
        'Middleware (if any) runs — auth checks, redirects, rewrites',
        'Route matched to page or API handler',
        'For pages: React component rendered (Server Component or Client Component)',
        'For API routes: handler function invoked, response returned as JSON',
        'For static pages: pre-rendered HTML served from cache',
      ],
    })
  }

  if (workflows.length === 0) {
    lines.push('No specific workflows were automatically detected. Review the source code for application-specific flows.')
  } else {
    for (const workflow of workflows) {
      lines.push(`## ${workflow.title}`, '')
      for (let i = 0; i < workflow.steps.length; i++) {
        lines.push(`${i + 1}. ${workflow.steps[i]}`)
      }
      lines.push('')
    }
  }

  lines.push('---', '', '*[← API Endpoints](API-Endpoints) | [Setup Guide →](Setup-Guide)*')
  return lines.join('\n')
}

function generateSetupPage(
  repoMeta: { name: string; htmlUrl: string; defaultBranch: string },
  fileContents: Record<string, string>,
  pkg: Record<string, unknown> | null,
  framework: string,
  allPaths: string[]
): string {
  const lines: string[] = ['# Setup Guide', '']
  lines.push('Complete installation and local development setup instructions.')
  lines.push('')

  // Prerequisites
  lines.push('## Prerequisites', '')
  const prereqs: string[] = []
  if (pkg) prereqs.push('**Node.js** v18 or later — [nodejs.org](https://nodejs.org)')
  if (fileContents['requirements.txt'] || fileContents['Pipfile']) prereqs.push('**Python** 3.9+ — [python.org](https://python.org)')
  if (fileContents['go.mod']) prereqs.push('**Go** 1.20+ — [go.dev](https://go.dev)')
  if (fileContents['Cargo.toml']) prereqs.push('**Rust** (latest stable) — [rustup.rs](https://rustup.rs)')
  if (fileContents['Dockerfile']) prereqs.push('**Docker** — [docker.com](https://docker.com)')
  if (fileContents['docker-compose.yml'] || fileContents['docker-compose.yaml']) prereqs.push('**Docker Compose** — included with Docker Desktop')
  if (prereqs.length === 0) prereqs.push('See language/runtime requirements in the repository root')

  for (const p of prereqs) lines.push(`- ${p}`)
  lines.push('')

  // Installation
  lines.push('## Installation', '')
  lines.push('```bash')
  lines.push(`# 1. Clone the repository`)
  lines.push(`git clone ${repoMeta.htmlUrl}.git`)
  lines.push(`cd ${repoMeta.name}`)
  lines.push('')

  if (pkg) {
    const pm = allPaths.includes('pnpm-lock.yaml') ? 'pnpm'
      : allPaths.includes('yarn.lock') ? 'yarn'
      : 'npm'
    lines.push(`# 2. Install dependencies`)
    lines.push(`${pm} install`)
  } else if (fileContents['requirements.txt']) {
    lines.push('# 2. Create virtual environment')
    lines.push('python -m venv .venv')
    lines.push('source .venv/bin/activate  # On Windows: .venv\\Scripts\\activate')
    lines.push('')
    lines.push('# 3. Install dependencies')
    lines.push('pip install -r requirements.txt')
  } else if (fileContents['go.mod']) {
    lines.push('# 2. Download Go modules')
    lines.push('go mod download')
  } else if (fileContents['Cargo.toml']) {
    lines.push('# 2. Build with Cargo')
    lines.push('cargo build')
  }
  lines.push('```')
  lines.push('')

  // Environment variables
  const envExample = fileContents['.env.example'] || fileContents['.env.sample']
  if (envExample) {
    lines.push('## Environment Variables', '')
    lines.push('Copy the example environment file and fill in the required values:')
    lines.push('')
    lines.push('```bash')
    lines.push('cp .env.example .env')
    lines.push('```')
    lines.push('')
    lines.push('Required variables:')
    lines.push('')
    lines.push('```env')
    const envLines = envExample.split('\n').filter(l => l.trim() && !l.startsWith('#')).slice(0, 20)
    for (const l of envLines) lines.push(l)
    lines.push('```')
    lines.push('')
  }

  // Scripts from package.json
  if (pkg?.scripts) {
    const scripts = pkg.scripts as Record<string, string>
    lines.push('## Available Scripts', '')
    lines.push('| Script | Command | Description |')
    lines.push('|---|---|---|')
    const scriptDescriptions: Record<string, string> = {
      dev: 'Start development server with hot reload',
      start: 'Start production server',
      build: 'Build for production',
      test: 'Run test suite',
      lint: 'Lint source files',
      format: 'Format code with Prettier',
      'type-check': 'Run TypeScript type checks',
      migrate: 'Run database migrations',
      seed: 'Seed the database',
      clean: 'Clean build artifacts',
    }
    const pm = allPaths.includes('pnpm-lock.yaml') ? 'pnpm'
      : allPaths.includes('yarn.lock') ? 'yarn'
      : 'npm run'
    for (const [name, cmd] of Object.entries(scripts)) {
      const desc = scriptDescriptions[name] ?? cmd
      lines.push(`| \`${name}\` | \`${pm} ${name}\` | ${desc} |`)
    }
    lines.push('')

    const devScript = scripts.dev || scripts.start
    if (devScript) {
      lines.push('## Development Server', '')
      lines.push('```bash')
      const pm2 = allPaths.includes('pnpm-lock.yaml') ? 'pnpm'
        : allPaths.includes('yarn.lock') ? 'yarn'
        : 'npm run'
      lines.push(`${pm2} dev`)
      if (framework === 'Next.js') {
        lines.push('# Open http://localhost:3000')
      }
      lines.push('```')
      lines.push('')
    }
  }

  // Docker
  if (fileContents['Dockerfile']) {
    lines.push('## Docker', '')
    lines.push('```bash')
    lines.push('# Build the Docker image')
    lines.push(`docker build -t ${repoMeta.name} .`)
    lines.push('')
    lines.push('# Run the container')
    lines.push(`docker run -p 3000:3000 ${repoMeta.name}`)
    lines.push('```')
    lines.push('')
    if (fileContents['docker-compose.yml'] || fileContents['docker-compose.yaml']) {
      lines.push('Or with Docker Compose:', '')
      lines.push('```bash')
      lines.push('docker compose up')
      lines.push('```')
      lines.push('')
    }
  }

  // README setup section
  const readmeSetup = extractReadmeSection(
    fileContents['README.md'] || fileContents['README.mdx'] || null,
    ['install', 'setup', 'getting started', 'quick start', 'usage']
  )
  if (readmeSetup && readmeSetup.length > 50) {
    lines.push('## Additional Notes from README', '')
    lines.push(readmeSetup.slice(0, 1000))
    lines.push('')
  }

  lines.push('---', '', '*[← Core Workflows](Core-Workflows) | [Development Guidelines →](Development-Guidelines)*')
  return lines.join('\n')
}

function generateGuidelinesPage(
  allPaths: string[],
  fileContents: Record<string, string>,
  pkg: Record<string, unknown> | null,
  owner: string,
  repoName: string
): string {
  const lines: string[] = ['# Development Guidelines', '']
  lines.push('Coding standards, contribution workflow, and best practices for this project.')
  lines.push('')

  // CONTRIBUTING.md content
  const contributing = fileContents['CONTRIBUTING.md'] || fileContents['.github/CONTRIBUTING.md']
  if (contributing && contributing.length > 100) {
    lines.push('## Contribution Guidelines', '')
    lines.push(contributing.slice(0, 2000))
    lines.push('')
  } else {
    lines.push('## Contribution Workflow', '')
    lines.push('1. Fork the repository')
    lines.push(`2. Clone your fork: \`git clone https://github.com/<your-username>/${repoName}.git\``)
    lines.push('3. Create a feature branch: `git checkout -b feat/your-feature-name`')
    lines.push('4. Make your changes and commit with a descriptive message')
    lines.push('5. Push your branch and open a Pull Request against `main`')
    lines.push('6. Address review feedback and ensure CI checks pass')
    lines.push('')
  }

  // Code style
  lines.push('## Code Style', '')
  const hasEslint = allPaths.some(p => p.includes('.eslintrc') || p === '.eslintrc.json' || p === '.eslintrc.js')
  const hasPrettier = allPaths.some(p => p.includes('.prettierrc') || p.includes('prettier.config'))
  const hasEditorConfig = allPaths.some(p => p === '.editorconfig')

  if (hasEslint) lines.push('- **ESLint** is configured — run `npm run lint` before submitting a PR')
  if (hasPrettier) lines.push('- **Prettier** is configured — run `npm run format` to auto-format code')
  if (hasEditorConfig) lines.push('- **.editorconfig** defines indent style — ensure your editor respects it')
  if (!hasEslint && !hasPrettier) lines.push('- Follow the existing code style in the repository')

  // TypeScript
  if (fileContents['tsconfig.json']) {
    lines.push('- **TypeScript** strict mode — avoid `any` types; use proper interfaces and type guards')
  }
  lines.push('')

  // Commit messages
  lines.push('## Commit Message Format', '')
  lines.push('Use the [Conventional Commits](https://www.conventionalcommits.org/) format:')
  lines.push('')
  lines.push('```')
  lines.push('<type>(<scope>): <short summary>')
  lines.push('')
  lines.push('Types: feat | fix | docs | style | refactor | test | chore | build | ci')
  lines.push('')
  lines.push('Examples:')
  lines.push('  feat(auth): add GitHub OAuth login')
  lines.push('  fix(api): handle missing token in session')
  lines.push('  docs(wiki): update setup guide')
  lines.push('```')
  lines.push('')

  // Testing
  const hasTests = allPaths.some(p => /\.(test|spec)\.[jt]sx?$/.test(p) || p.includes('__tests__') || p.startsWith('tests/'))
  if (hasTests) {
    lines.push('## Testing', '')
    const pm = allPaths.includes('pnpm-lock.yaml') ? 'pnpm'
      : allPaths.includes('yarn.lock') ? 'yarn'
      : 'npm run'
    if (pkg?.scripts && (pkg.scripts as Record<string, string>).test) {
      lines.push(`Run the test suite with: \`${pm} test\``)
    }
    lines.push('')
    lines.push('- Write unit tests for all new utility functions and helpers')
    lines.push('- Write integration tests for API endpoints')
    lines.push('- Ensure all existing tests pass before opening a PR')
    lines.push('')
  }

  // Branch naming
  lines.push('## Branch Naming Conventions', '')
  lines.push('| Type | Pattern | Example |')
  lines.push('|---|---|---|')
  lines.push('| Feature | `feat/<description>` | `feat/wiki-generator` |')
  lines.push('| Bug fix | `fix/<description>` | `fix/auth-cookie-expiry` |')
  lines.push('| Docs | `docs/<description>` | `docs/api-endpoints` |')
  lines.push('| Hotfix | `hotfix/<description>` | `hotfix/production-crash` |')
  lines.push('')

  // File structure
  lines.push('## Adding New Features', '')
  if (allPaths.some(p => p.startsWith('app/api/'))) {
    lines.push('**New API endpoint:**')
    lines.push('```')
    lines.push('app/api/<feature>/route.ts   ← API handler')
    lines.push('app/dashboard/<feature>/page.tsx  ← UI page')
    lines.push('```')
    lines.push('')
  }
  lines.push('Always update this Wiki when adding significant new functionality.')
  lines.push('')

  lines.push('---', '', '*[← Setup Guide](Setup-Guide) | [Home →](Home)*')
  return lines.join('\n')
}

// ── Main GET handler ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get('gh_session')?.value
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const session = verifySession(token)
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })

  const accessToken = session.access_token as string
  const { searchParams } = new URL(req.url)
  const owner = searchParams.get('owner')
  const repo = searchParams.get('repo')
  if (!owner || !repo) return NextResponse.json({ error: 'Missing owner/repo' }, { status: 400 })

  const H = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  try {
    // ── 1. Repo metadata ───────────────────────────────────────────────────────
    const repoRes = await ghFetch(`https://api.github.com/repos/${owner}/${repo}`, H)
    if (!repoRes.ok) return NextResponse.json({ error: 'Repository not found' }, { status: 404 })
    const repoData = await repoRes.json()

    const branch = repoData.default_branch || 'main'
    const repoMeta = {
      name: repoData.name as string,
      owner,
      description: (repoData.description as string) || '',
      language: (repoData.language as string) || '',
      stars: (repoData.stargazers_count as number) || 0,
      forks: (repoData.forks_count as number) || 0,
      topics: (repoData.topics as string[]) || [],
      defaultBranch: branch,
      htmlUrl: repoData.html_url as string,
      license: repoData.license ? (repoData.license as { name: string }).name : null,
      createdAt: (repoData.created_at as string) || '',
      updatedAt: (repoData.updated_at as string) || '',
    }

    // ── 2. Full file tree ──────────────────────────────────────────────────────
    const treeRes = await ghFetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, H
    )
    if (!treeRes.ok) return NextResponse.json({ error: 'Could not read repository tree' }, { status: 500 })
    const { tree: rawTree } = await treeRes.json()

    const allBlobs: { path: string; size: number }[] = (rawTree ?? [])
      .filter((f: { type: string }) => f.type === 'blob')
      .map((f: { path: string; size?: number }) => ({ path: f.path, size: f.size ?? 0 }))
      .filter((f: { path: string }) => !f.path.split('/').some((seg: string) => IGNORE.has(seg)))

    const allPaths = allBlobs.map(f => f.path)
    const totalFiles = allPaths.length

    // ── 3. Identify config + key files to fetch ────────────────────────────────
    const configPaths = allPaths.filter(p => {
      const name = baseName(p)
      return CONFIG_FILES.has(name) || CONFIG_FILES.has(p)
    })

    // Also fetch API route files for endpoint analysis
    const apiPaths = allPaths.filter(p =>
      /app\/api\/.*\/route\.[jt]sx?$|pages\/api\/.*\.[jt]sx?$/.test(p)
    ).slice(0, 20)

    // And a sample of source files for module analysis
    const sourcePaths = allBlobs
      .filter(f => SOURCE_EXTS.has(extOf(f.path)) && !f.path.split('/').some(seg => IGNORE.has(seg)))
      .sort((a, b) => b.size - a.size)
      .slice(0, 25)
      .map(f => f.path)

    const pathsToFetch = [...new Set([...configPaths, ...apiPaths, ...sourcePaths])].slice(0, 50)

    // ── 4. Fetch file contents ─────────────────────────────────────────────────
    const fileContents: Record<string, string> = {}
    await Promise.all(
      pathsToFetch.map(async (path) => {
        const content = await fetchFileContent(owner, repo, path, H)
        if (content) fileContents[path] = content
      })
    )

    const filesAnalyzed = Object.keys(fileContents).length

    // ── 5. Parse package.json ──────────────────────────────────────────────────
    let pkg: Record<string, unknown> | null = null
    const pkgContent = fileContents['package.json']
    if (pkgContent) {
      try { pkg = JSON.parse(pkgContent) } catch { /* ignore */ }
    }

    const framework = detectFramework(pkg, repoMeta.language)

    // ── 6. Readme ─────────────────────────────────────────────────────────────
    const readme = fileContents['README.md'] || fileContents['README.mdx'] || null

    // ── 7. Generate wiki pages ─────────────────────────────────────────────────
    const pages: WikiPage[] = [
      {
        title: 'Home',
        slug: 'Home',
        icon: '🏠',
        content: generateHomePage(repoMeta, readme, framework),
      },
      {
        title: 'Architecture Overview',
        slug: 'Architecture-Overview',
        icon: '🏗️',
        content: generateArchitecturePage(repoMeta, framework, allPaths, fileContents, pkg),
      },
      {
        title: 'Module Documentation',
        slug: 'Module-Documentation',
        icon: '📦',
        content: generateModulePage(allPaths, fileContents),
      },
      {
        title: 'API Endpoints',
        slug: 'API-Endpoints',
        icon: '🔌',
        content: generateApiEndpointsPage(allPaths, fileContents, owner, repoMeta.name, branch),
      },
      {
        title: 'Core Workflows',
        slug: 'Core-Workflows',
        icon: '⚙️',
        content: generateWorkflowsPage(allPaths, fileContents, framework),
      },
      {
        title: 'Setup Guide',
        slug: 'Setup-Guide',
        icon: '🚀',
        content: generateSetupPage(repoMeta, fileContents, pkg, framework, allPaths),
      },
      {
        title: 'Development Guidelines',
        slug: 'Development-Guidelines',
        icon: '📋',
        content: generateGuidelinesPage(allPaths, fileContents, pkg, owner, repoMeta.name),
      },
    ]

    const report: WikiReport = {
      repoName: repoMeta.name,
      repoDescription: repoMeta.description,
      owner,
      defaultBranch: branch,
      language: repoMeta.language,
      stars: repoMeta.stars,
      forks: repoMeta.forks,
      topics: repoMeta.topics,
      pages,
      meta: {
        filesAnalyzed,
        totalFiles,
        generatedAt: new Date().toISOString(),
      },
    }

    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
