import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/session'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ReadmeSection {
  id: string
  title: string
  icon: string
  content: string
}

export interface ReadmeReport {
  repoName: string
  repoDescription: string
  owner: string
  defaultBranch: string
  language: string
  stars: number
  forks: number
  topics: string[]
  license: string | null
  framework: string
  packageManager: string
  sections: ReadmeSection[]
  fullMarkdown: string
  meta: {
    filesAnalyzed: number
    totalFiles: number
    hasExistingReadme: boolean
    detectedEnvVars: number
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
  '.env.example', '.env.sample', '.env.local.example',
  'tsconfig.json', 'jsconfig.json',
  '.eslintrc', '.eslintrc.json', '.eslintrc.js', '.prettierrc',
  'next.config.js', 'next.config.ts', 'next.config.mjs',
  'vite.config.ts', 'vite.config.js', 'webpack.config.js',
  'README.md', 'CONTRIBUTING.md', 'LICENSE',
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
  if (deps['astro']) return 'Astro'
  return 'Node.js'
}

function detectPackageManager(allPaths: string[]): string {
  const names = allPaths.map(p => baseName(p))
  if (names.includes('pnpm-lock.yaml')) return 'pnpm'
  if (names.includes('yarn.lock')) return 'yarn'
  if (names.includes('bun.lockb')) return 'bun'
  if (names.includes('package-lock.json')) return 'npm'
  return 'npm'
}

function detectInstallCommand(pkg: Record<string, unknown> | null, pm: string, language: string, allPaths: string[]): string[] {
  const names = allPaths.map(p => baseName(p))
  if (language === 'Python' || names.includes('requirements.txt')) {
    if (names.includes('Pipfile')) return ['pipenv install']
    return ['pip install -r requirements.txt']
  }
  if (language === 'Go' || names.includes('go.mod')) return ['go mod download']
  if (language === 'Ruby' || names.includes('Gemfile')) return ['bundle install']
  if (language === 'Java' || names.includes('pom.xml')) return ['mvn install']
  if (language === 'Rust' || names.includes('Cargo.toml')) return ['cargo build']
  const installCmd = pm === 'pnpm' ? 'pnpm install' : pm === 'yarn' ? 'yarn' : pm === 'bun' ? 'bun install' : 'npm install'
  return [installCmd]
}

function detectDevCommand(pkg: Record<string, unknown> | null, pm: string, language: string): string {
  if (!pkg) {
    if (language === 'Python') return 'python main.py'
    if (language === 'Go') return 'go run .'
    if (language === 'Rust') return 'cargo run'
    return 'npm run dev'
  }
  const scripts = pkg.scripts as Record<string, string> ?? {}
  if (scripts.dev) return `${pm === 'yarn' ? 'yarn' : pm === 'pnpm' ? 'pnpm' : pm === 'bun' ? 'bun' : 'npm run'} dev`
  if (scripts.start) return `${pm === 'yarn' ? 'yarn' : pm === 'pnpm' ? 'pnpm' : pm === 'bun' ? 'bun' : 'npm run'} start`
  return `${pm === 'yarn' ? 'yarn' : pm === 'pnpm' ? 'pnpm' : pm === 'bun' ? 'bun' : 'npm run'} dev`
}

function detectBuildCommand(pkg: Record<string, unknown> | null, pm: string, language: string): string | null {
  if (!pkg) return null
  const scripts = pkg.scripts as Record<string, string> ?? {}
  if (!scripts.build) return null
  return `${pm === 'yarn' ? 'yarn' : pm === 'pnpm' ? 'pnpm' : pm === 'bun' ? 'bun' : 'npm run'} build`
}

function detectTestCommand(pkg: Record<string, unknown> | null, pm: string, language: string, allPaths: string[]): string | null {
  const names = allPaths.map(p => baseName(p))
  if (language === 'Python') {
    if (names.includes('pytest.ini') || allPaths.some(p => p.includes('test_'))) return 'pytest'
    return null
  }
  if (language === 'Go') return 'go test ./...'
  if (language === 'Rust') return 'cargo test'
  if (!pkg) return null
  const scripts = pkg.scripts as Record<string, string> ?? {}
  if (!scripts.test) return null
  return `${pm === 'yarn' ? 'yarn' : pm === 'pnpm' ? 'pnpm' : pm === 'bun' ? 'bun' : 'npm run'} test`
}

function parseEnvVars(envContent: string): string[] {
  const vars: string[] = []
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim()
      if (/^[A-Z_][A-Z0-9_]*$/.test(key)) vars.push(key)
    }
  }
  return vars
}

function getLanguageInstallNote(language: string): string {
  if (language === 'Python') return '- [Python 3.8+](https://python.org)'
  if (language === 'Go') return '- [Go 1.21+](https://golang.org)'
  if (language === 'Rust') return '- [Rust (stable)](https://rustup.rs)'
  if (language === 'Java') return '- [Java 17+](https://adoptium.net)'
  if (language === 'Ruby') return '- [Ruby 3.0+](https://ruby-lang.org)'
  return '- [Node.js 18+](https://nodejs.org)'
}

function detectKeyFeatures(
  pkg: Record<string, unknown> | null,
  framework: string,
  allPaths: string[],
  language: string,
  repoDesc: string
): string[] {
  const features: string[] = []
  const names = allPaths.map(p => baseName(p))
  const dirs = topDirs(allPaths)

  if (pkg) {
    const deps = { ...(pkg.dependencies as Record<string, string> ?? {}), ...(pkg.devDependencies as Record<string, string> ?? {}) }
    if (deps['tailwindcss']) features.push('Tailwind CSS styling')
    if (deps['typescript'] || allPaths.some(p => p.endsWith('.ts') || p.endsWith('.tsx'))) features.push('TypeScript support')
    if (deps['prisma'] || deps['@prisma/client']) features.push('Prisma ORM database integration')
    if (deps['next-auth'] || deps['@auth/core']) features.push('Built-in authentication')
    if (deps['stripe'] || deps['@stripe/stripe-js']) features.push('Stripe payment processing')
    if (deps['socket.io'] || deps['ws']) features.push('Real-time WebSocket communication')
    if (deps['redis'] || deps['ioredis']) features.push('Redis caching layer')
    if (deps['zod']) features.push('Zod schema validation')
    if (deps['react-query'] || deps['@tanstack/react-query']) features.push('React Query data fetching')
    if (deps['zustand'] || deps['jotai'] || deps['recoil']) features.push('Client-side state management')
    if (deps['jest'] || deps['vitest']) features.push('Automated testing suite')
    if (deps['storybook'] || deps['@storybook/react']) features.push('Storybook component library')
  }

  if (names.includes('Dockerfile') || names.includes('docker-compose.yml')) features.push('Docker containerization support')
  if (names.includes('.github')) features.push('GitHub Actions CI/CD pipeline')
  if (dirs.includes('api') || allPaths.some(p => p.includes('/api/'))) features.push('RESTful API endpoints')
  if (dirs.includes('docs') || dirs.includes('documentation')) features.push('Comprehensive documentation')
  if (allPaths.some(p => p.includes('.test.') || p.includes('.spec.') || p.includes('/test/') || p.includes('/__tests__/'))) features.push('Test coverage')

  // Deduplicate and limit
  return [...new Set(features)].slice(0, 8)
}

function buildProjectStructure(allPaths: string[], framework: string): string {
  const dirs = topDirs(allPaths)
  const filesByDir: Record<string, number> = {}
  for (const p of allPaths) {
    const parts = p.split('/')
    if (parts.length > 1) {
      const d = parts[0]
      filesByDir[d] = (filesByDir[d] ?? 0) + 1
    }
  }

  const knownDirs: Record<string, string> = {
    'app': 'Next.js App Router pages and API routes',
    'pages': 'Next.js Pages Router and API handlers',
    'src': 'Main source code',
    'components': 'Reusable UI components',
    'lib': 'Shared utilities and library code',
    'utils': 'Utility/helper functions',
    'hooks': 'Custom React hooks',
    'store': 'State management',
    'context': 'React context providers',
    'services': 'Business logic and external integrations',
    'api': 'API client wrappers and handlers',
    'types': 'TypeScript type definitions',
    'models': 'Data models and schemas',
    'middleware': 'Request middleware',
    'config': 'Configuration files',
    'public': 'Static assets (images, fonts, etc.)',
    'assets': 'Images, icons, and other assets',
    'styles': 'CSS/SCSS stylesheets',
    'tests': 'Test suites',
    '__tests__': 'Test files',
    'scripts': 'Build and automation scripts',
    'docs': 'Documentation',
    'prisma': 'Prisma schema and migrations',
    'migrations': 'Database migrations',
    'routes': 'Route definitions',
    'controllers': 'Request controllers',
    'views': 'View templates',
  }

  const lines: string[] = ['```', `${allPaths[0]?.split('/')[0] ? '' : ''}./`]
  for (const d of dirs) {
    const count = filesByDir[d] ?? 0
    const desc = knownDirs[d.toLowerCase()]
    lines.push(`├── ${d}/         ${desc ? '# ' + desc : `# ${count} file${count !== 1 ? 's' : ''}`}`)
  }
  // Root-level config files
  const rootFiles = allPaths.filter(p => !p.includes('/')).slice(0, 8)
  for (const f of rootFiles) {
    lines.push(`├── ${f}`)
  }
  lines.push('```')
  return lines.join('\n')
}

// ── README Section Generators ──────────────────────────────────────────────────

function generateTitleSection(meta: {
  name: string; owner: string; description: string; language: string
  stars: number; forks: number; license: string | null; defaultBranch: string
  topics: string[]
}, framework: string): string {
  const desc = meta.description || `A ${framework} project by ${meta.owner}.`
  const lines: string[] = [
    `# ${meta.name}`,
    '',
    desc,
    '',
  ]

  // Badges
  const badges: string[] = []
  if (meta.language) badges.push(`![Language](https://img.shields.io/badge/language-${encodeURIComponent(meta.language)}-blue)`)
  if (meta.license) badges.push(`![License](https://img.shields.io/badge/license-${encodeURIComponent(meta.license)}-green)`)
  badges.push(`![Stars](https://img.shields.io/github/stars/${meta.owner}/${meta.name}?style=social)`)
  badges.push(`![Forks](https://img.shields.io/github/forks/${meta.owner}/${meta.name}?style=social)`)

  lines.push(badges.join(' '), '')
  return lines.join('\n')
}

function generateTableOfContents(): string {
  return [
    '## Table of Contents',
    '',
    '- [Features](#features)',
    '- [Installation](#installation)',
    '- [Usage](#usage)',
    '- [Project Structure](#project-structure)',
    '- [Configuration](#configuration)',
    '- [Contributing](#contributing)',
    '- [License](#license)',
    '',
  ].join('\n')
}

function generateFeaturesSection(features: string[], framework: string, desc: string): string {
  const lines: string[] = ['## Features', '']
  if (features.length > 0) {
    for (const f of features) lines.push(`- ✅ ${f}`)
  } else {
    lines.push(`- Built with **${framework}**`)
    if (desc) lines.push(`- ${desc}`)
  }
  lines.push('')
  return lines.join('\n')
}

function generateInstallSection(
  repoMeta: { name: string; owner: string; htmlUrl: string; defaultBranch: string },
  installCmds: string[],
  devCmd: string,
  buildCmd: string | null,
  language: string,
  pm: string,
  hasEnvFile: boolean
): string {
  const lines: string[] = [
    '## Installation',
    '',
    '### Prerequisites',
    '',
    getLanguageInstallNote(language),
  ]

  if (language === 'JavaScript' || language === 'TypeScript') {
    const pmNote = pm === 'pnpm' ? '- [pnpm](https://pnpm.io)' : pm === 'yarn' ? '- [yarn](https://yarnpkg.com)' : pm === 'bun' ? '- [Bun](https://bun.sh)' : ''
    if (pmNote) lines.push(pmNote)
  }

  lines.push(
    '',
    '### Setup',
    '',
    '```bash',
    `# Clone the repository`,
    `git clone https://github.com/${repoMeta.owner}/${repoMeta.name}.git`,
    `cd ${repoMeta.name}`,
    '',
    `# Install dependencies`,
    ...installCmds,
  )

  if (hasEnvFile) {
    lines.push('', `# Copy environment variables`, `cp .env.example .env`)
    lines.push(`# Edit .env with your values`)
  }

  lines.push(
    '',
    `# Start development server`,
    devCmd,
    '```',
    '',
  )

  if (buildCmd) {
    lines.push(
      '### Build for Production',
      '',
      '```bash',
      buildCmd,
      '```',
      '',
    )
  }

  return lines.join('\n')
}

function generateUsageSection(
  repoMeta: { name: string; defaultBranch: string },
  devCmd: string,
  testCmd: string | null,
  framework: string,
  pkg: Record<string, unknown> | null,
  pm: string
): string {
  const lines: string[] = [
    '## Usage',
    '',
  ]

  if (framework.includes('Next.js') || framework.includes('Nuxt') || framework.includes('React') || framework.includes('Vue')) {
    lines.push(
      '### Development',
      '',
      '```bash',
      devCmd,
      '```',
      '',
      `Open [http://localhost:3000](http://localhost:3000) in your browser.`,
      '',
    )
  } else {
    lines.push(
      '### Running the application',
      '',
      '```bash',
      devCmd,
      '```',
      '',
    )
  }

  if (pkg) {
    const scripts = pkg.scripts as Record<string, string> ?? {}
    const scriptEntries = Object.entries(scripts).slice(0, 6)
    if (scriptEntries.length > 0) {
      lines.push('### Available Scripts', '', '| Script | Description |', '|--------|-------------|')
      for (const [name, cmd] of scriptEntries) {
        const runPrefix = pm === 'yarn' ? 'yarn' : pm === 'pnpm' ? 'pnpm' : pm === 'bun' ? 'bun' : 'npm run'
        lines.push(`| \`${runPrefix} ${name}\` | ${cmd} |`)
      }
      lines.push('')
    }
  }

  if (testCmd) {
    lines.push(
      '### Testing',
      '',
      '```bash',
      testCmd,
      '```',
      '',
    )
  }

  return lines.join('\n')
}

function generateStructureSection(allPaths: string[], framework: string): string {
  return [
    '## Project Structure',
    '',
    buildProjectStructure(allPaths, framework),
    '',
  ].join('\n')
}

function generateConfigSection(envVars: string[], hasEnvFile: boolean, framework: string): string {
  const lines: string[] = [
    '## Configuration',
    '',
  ]

  if (hasEnvFile || envVars.length > 0) {
    lines.push(
      'Create a `.env` file in the root directory based on `.env.example`:',
      '',
      '```env',
    )
    if (envVars.length > 0) {
      for (const v of envVars) {
        lines.push(`${v}=your_value_here`)
      }
    } else {
      lines.push('# Add your environment variables here')
    }
    lines.push('```', '')

    if (envVars.length > 0) {
      lines.push('### Environment Variables', '', '| Variable | Description | Required |', '|----------|-------------|----------|')
      for (const v of envVars) {
        lines.push(`| \`${v}\` | *Description* | Yes |`)
      }
      lines.push('')
    }
  } else {
    lines.push('No environment variables are required for basic usage.', '')
  }

  return lines.join('\n')
}

function generateContributingSection(repoMeta: { name: string; owner: string; defaultBranch: string }): string {
  return [
    '## Contributing',
    '',
    'Contributions are welcome! Please follow these steps:',
    '',
    '1. Fork the repository',
    `2. Create a feature branch: \`git checkout -b feature/your-feature-name\``,
    '3. Make your changes and commit: `git commit -m "feat: add your feature"`',
    '4. Push to your fork: `git push origin feature/your-feature-name`',
    `5. Open a Pull Request to \`${repoMeta.defaultBranch}\``,
    '',
    '### Guidelines',
    '',
    '- Follow the existing code style and conventions',
    '- Write clear commit messages (we use [Conventional Commits](https://www.conventionalcommits.org))',
    '- Add tests for new features when applicable',
    '- Update documentation as needed',
    '',
  ].join('\n')
}

function generateLicenseSection(license: string | null, owner: string): string {
  const year = new Date().getFullYear()
  const licenseName = license || 'MIT'
  return [
    '## License',
    '',
    `This project is licensed under the **${licenseName} License** — see the [LICENSE](LICENSE) file for details.`,
    '',
    `© ${year} [${owner}](https://github.com/${owner})`,
    '',
  ].join('\n')
}

// ── Main GET Handler ───────────────────────────────────────────────────────────

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
  if (!owner || !repo) return NextResponse.json({ error: 'Missing owner or repo' }, { status: 400 })

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  // 1. Fetch repo metadata
  const repoRes = await ghFetch(`https://api.github.com/repos/${owner}/${repo}`, headers)
  if (!repoRes.ok) return NextResponse.json({ error: 'Failed to fetch repository' }, { status: repoRes.status })
  const repoData = await repoRes.json()

  const repoMeta = {
    name: repoData.name as string,
    owner: owner,
    description: (repoData.description ?? '') as string,
    language: (repoData.language ?? '') as string,
    stars: repoData.stargazers_count as number,
    forks: repoData.forks_count as number,
    topics: (repoData.topics ?? []) as string[],
    license: repoData.license?.spdx_id ?? null as string | null,
    defaultBranch: (repoData.default_branch ?? 'main') as string,
    htmlUrl: repoData.html_url as string,
  }

  // 2. Fetch file tree
  const treeRes = await ghFetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${repoMeta.defaultBranch}?recursive=1`,
    headers
  )
  if (!treeRes.ok) return NextResponse.json({ error: 'Failed to fetch file tree' }, { status: treeRes.status })
  const treeData = await treeRes.json()
  const allTreeItems = (treeData.tree ?? []) as Array<{ path: string; type: string; size?: number }>

  const allPaths = allTreeItems
    .filter(item => item.type === 'blob' && !item.path.split('/').some(seg => IGNORE.has(seg)))
    .map(item => item.path)

  const sourcePaths = allPaths.filter(p => SOURCE_EXTS.has(extOf(p)))
  const configPaths = allPaths.filter(p => CONFIG_FILES.has(baseName(p)))

  // 3. Fetch key config files
  const filesToFetch = [...new Set([
    'package.json', 'requirements.txt', 'go.mod', 'Cargo.toml',
    'README.md', '.env.example', '.env.sample',
    'Dockerfile', 'docker-compose.yml',
  ])].filter(f => configPaths.some(p => baseName(p) === f || p === f))

  const fileContents: Record<string, string> = {}
  await Promise.all(
    filesToFetch.slice(0, 15).map(async (filename) => {
      const matchedPath = configPaths.find(p => baseName(p) === filename || p === filename)
      if (!matchedPath) return
      const content = await fetchFileContent(owner, repo, matchedPath, headers)
      if (content) fileContents[filename] = content
    })
  )

  // 4. Parse key files
  let pkg: Record<string, unknown> | null = null
  if (fileContents['package.json']) {
    try { pkg = JSON.parse(fileContents['package.json']) } catch { /* ignore */ }
  }

  const hasExistingReadme = 'README.md' in fileContents
  const envContent = fileContents['.env.example'] ?? fileContents['.env.sample'] ?? ''
  const envVars = envContent ? parseEnvVars(envContent) : []
  const hasEnvFile = Boolean(envContent) || allPaths.some(p => baseName(p) === '.env.example' || baseName(p) === '.env.sample')

  // 5. Detect stack
  const framework = detectFramework(pkg, repoMeta.language)
  const pm = detectPackageManager(allPaths)
  const installCmds = detectInstallCommand(pkg, pm, repoMeta.language, allPaths)
  const devCmd = detectDevCommand(pkg, pm, repoMeta.language)
  const buildCmd = detectBuildCommand(pkg, pm, repoMeta.language)
  const testCmd = detectTestCommand(pkg, pm, repoMeta.language, allPaths)
  const features = detectKeyFeatures(pkg, framework, allPaths, repoMeta.language, repoMeta.description)

  // 6. Generate README sections
  const titleContent = generateTitleSection(repoMeta, framework)
  const tocContent = generateTableOfContents()
  const featuresContent = generateFeaturesSection(features, framework, repoMeta.description)
  const installContent = generateInstallSection(repoMeta, installCmds, devCmd, buildCmd, repoMeta.language, pm, hasEnvFile)
  const usageContent = generateUsageSection(repoMeta, devCmd, testCmd, framework, pkg, pm)
  const structureContent = generateStructureSection(allPaths, framework)
  const configContent = generateConfigSection(envVars, hasEnvFile, framework)
  const contributingContent = generateContributingSection(repoMeta)
  const licenseContent = generateLicenseSection(repoMeta.license, owner)

  const sections: ReadmeSection[] = [
    { id: 'title', title: 'Title & Description', icon: '📌', content: titleContent },
    { id: 'toc', title: 'Table of Contents', icon: '📋', content: tocContent },
    { id: 'features', title: 'Features', icon: '✨', content: featuresContent },
    { id: 'installation', title: 'Installation', icon: '🚀', content: installContent },
    { id: 'usage', title: 'Usage', icon: '💻', content: usageContent },
    { id: 'structure', title: 'Project Structure', icon: '📁', content: structureContent },
    { id: 'config', title: 'Configuration', icon: '⚙️', content: configContent },
    { id: 'contributing', title: 'Contributing', icon: '🤝', content: contributingContent },
    { id: 'license', title: 'License', icon: '📄', content: licenseContent },
  ]

  const fullMarkdown = sections.map(s => s.content).join('\n') + '\n---\n\n*README auto-generated by [Git Planet](https://github.com) from repository analysis.*\n'

  const report: ReadmeReport = {
    repoName: repoMeta.name,
    repoDescription: repoMeta.description,
    owner,
    defaultBranch: repoMeta.defaultBranch,
    language: repoMeta.language,
    stars: repoMeta.stars,
    forks: repoMeta.forks,
    topics: repoMeta.topics,
    license: repoMeta.license,
    framework,
    packageManager: pm,
    sections,
    fullMarkdown,
    meta: {
      filesAnalyzed: Math.min(sourcePaths.length, 60),
      totalFiles: allPaths.length,
      hasExistingReadme,
      detectedEnvVars: envVars.length,
      generatedAt: new Date().toISOString(),
    },
  }

  return NextResponse.json(report)
}

// ── POST: Push README.md to the repository ─────────────────────────────────────

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get('gh_session')?.value
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const session = verifySession(token)
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })

  const accessToken = session.access_token as string

  let body: { owner: string; repo: string; markdown: string; branch?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { owner, repo, markdown, branch } = body
  if (!owner || !repo || !markdown) {
    return NextResponse.json({ error: 'Missing owner, repo, or markdown' }, { status: 400 })
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }

  // Resolve default branch if not provided
  let targetBranch = branch
  if (!targetBranch) {
    const repoRes = await ghFetch(`https://api.github.com/repos/${owner}/${repo}`, headers)
    if (!repoRes.ok) return NextResponse.json({ error: 'Failed to fetch repository info' }, { status: repoRes.status })
    const repoData = await repoRes.json()
    targetBranch = repoData.default_branch as string
  }

  // Check if README.md already exists (need its SHA to update)
  let existingSha: string | null = null
  const checkRes = await ghFetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/README.md?ref=${targetBranch}`,
    headers
  )
  if (checkRes.ok) {
    const existing = await checkRes.json()
    existingSha = existing.sha as string
  }

  // Base64-encode the markdown content
  const contentBase64 = Buffer.from(markdown, 'utf-8').toString('base64')

  const putBody: Record<string, unknown> = {
    message: existingSha
      ? 'docs: update README.md via Git Planet'
      : 'docs: add README.md via Git Planet',
    content: contentBase64,
    branch: targetBranch,
  }
  if (existingSha) putBody.sha = existingSha

  // Use fetch directly for PUT (ghFetch only handles GET semantics)
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 28_000)
  let pushRes: Response
  try {
    pushRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/README.md`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify(putBody),
        cache: 'no-store',
        signal: ctrl.signal,
      }
    )
  } finally {
    clearTimeout(t)
  }

  if (!pushRes.ok) {
    const errData = await pushRes.json().catch(() => ({}))
    return NextResponse.json(
      { error: (errData as { message?: string }).message ?? 'Failed to push README.md' },
      { status: pushRes.status }
    )
  }

  const result = await pushRes.json()
  return NextResponse.json({
    success: true,
    updated: Boolean(existingSha),
    commitUrl: (result.commit as { html_url?: string })?.html_url ?? null,
    fileUrl: (result.content as { html_url?: string })?.html_url ?? null,
    branch: targetBranch,
  })
}
