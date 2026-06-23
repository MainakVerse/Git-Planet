import {
  ghJson, fetchTree, fetchFileContent, fetchPackageJson,
  type GHRepoMeta, type RepoTreeFile, type PackageJson,
} from '@/lib/gh'

// Shared deep-context builder for AI documentation features.
// Pulls repo meta, file tree, package.json, README and a sample of key source
// files, then renders a compact text digest suitable for grounding an LLM.

export interface RepoContext {
  meta: GHRepoMeta
  branch: string
  tree: RepoTreeFile[]
  pkg: PackageJson | null
  readme: string | null
  keyFiles: { path: string; excerpt: string }[]
  languages: Record<string, number>
  fileCount: number
  topDirs: { dir: string; files: number }[]
}

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|rs|java|kt|php|swift|c|cpp|h)$/
const ENTRY_NAMES = ['index', 'main', 'app', 'server', 'route', 'page', 'cli', '__init__', 'mod']

export async function buildRepoContext(
  owner: string, repo: string, headers: Record<string, string>,
  { maxKeyFiles = 6, excerptLines = 60 } = {},
): Promise<RepoContext | { error: string; status: number }> {
  const meta = await ghJson<GHRepoMeta | null>(`https://api.github.com/repos/${owner}/${repo}`, headers, null)
  if (!meta) return { error: 'Repo not found', status: 404 }
  const branch = meta.default_branch || 'main'

  const [tree, pkg, readmeData] = await Promise.all([
    fetchTree(owner, repo, branch, headers),
    fetchPackageJson(owner, repo, headers),
    ghJson<{ content?: string }>(`https://api.github.com/repos/${owner}/${repo}/readme`, headers, {}),
  ])

  const blobs = tree.filter(f => f.type === 'blob')
  let readme: string | null = null
  if (readmeData.content) {
    try { readme = Buffer.from(readmeData.content, 'base64').toString('utf-8').slice(0, 4000) } catch { readme = null }
  }

  // Language histogram by extension
  const languages: Record<string, number> = {}
  for (const f of blobs) {
    const ext = f.path.includes('.') ? f.path.split('.').pop()! : ''
    if (ext) languages[ext] = (languages[ext] ?? 0) + 1
  }

  // Top-level directory histogram
  const dirCount: Record<string, number> = {}
  for (const f of blobs) {
    const parts = f.path.split('/')
    if (parts.length > 1) dirCount[parts[0]] = (dirCount[parts[0]] ?? 0) + 1
  }
  const topDirs = Object.entries(dirCount).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([dir, files]) => ({ dir, files }))

  // Pick key files: entry-like names, shallow, source extensions
  const scored = blobs
    .filter(f => SOURCE_EXT.test(f.path))
    .map(f => {
      const base = (f.path.split('/').pop() ?? '').replace(/\.[^.]+$/, '').toLowerCase()
      const depth = f.path.split('/').length
      let score = 0
      if (ENTRY_NAMES.includes(base)) score += 10
      if (depth <= 2) score += 5
      else if (depth <= 3) score += 2
      return { path: f.path, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxKeyFiles)

  const keyFiles = (await Promise.all(scored.map(async s => {
    const content = await fetchFileContent(owner, repo, s.path, headers)
    if (!content) return null
    return { path: s.path, excerpt: content.split('\n').slice(0, excerptLines).join('\n') }
  }))).filter((x): x is { path: string; excerpt: string } => x !== null)

  return {
    meta, branch, tree, pkg, readme, keyFiles,
    languages, fileCount: blobs.length, topDirs,
  }
}

/** Render a compact text digest of a RepoContext for LLM grounding. */
export function renderContextDigest(ctx: RepoContext): string {
  const langs = Object.entries(ctx.languages).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([e, c]) => `${e} (${c})`).join(', ')
  const deps = ctx.pkg ? Object.keys({ ...ctx.pkg.dependencies, ...ctx.pkg.devDependencies }).slice(0, 40) : []
  const scripts = ctx.pkg?.scripts ? Object.keys(ctx.pkg.scripts) : []

  return [
    `REPOSITORY: ${ctx.meta.full_name}`,
    ctx.meta.description ? `DESCRIPTION: ${ctx.meta.description}` : '',
    `STARS: ${ctx.meta.stargazers_count} | FORKS: ${ctx.meta.forks_count} | PRIMARY LANG: ${ctx.meta.language ?? 'n/a'}`,
    `FILE COUNT: ${ctx.fileCount} | FILE TYPES: ${langs}`,
    `TOP DIRECTORIES: ${ctx.topDirs.map(d => `${d.dir}/ (${d.files})`).join(', ')}`,
    ctx.meta.topics?.length ? `TOPICS: ${ctx.meta.topics.join(', ')}` : '',
    deps.length ? `KEY DEPENDENCIES: ${deps.join(', ')}` : '',
    scripts.length ? `NPM SCRIPTS: ${scripts.join(', ')}` : '',
    ctx.readme ? `\nREADME (truncated):\n${ctx.readme.slice(0, 2000)}` : '',
    ctx.keyFiles.length ? `\nKEY SOURCE FILES:\n${ctx.keyFiles.map(f => `--- ${f.path} ---\n${f.excerpt}`).join('\n\n')}` : '',
  ].filter(Boolean).join('\n')
}
