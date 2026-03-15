import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/session'

// ── Types ──────────────────────────────────────────────────────────────────────

interface ArchNode {
  id: string; label: string; sublabel: string
  layer: number; color: string; icon: string
  col: number; totalInLayer: number
  isDb?: boolean
}

// ── Constants ──────────────────────────────────────────────────────────────────

const IGNORE = new Set([
  'node_modules', '.git', '.next', '.nuxt', 'dist', 'build', 'out', 'coverage',
  '.cache', '.vercel', '.turbo', '__pycache__', '.pytest_cache', 'target',
  'vendor', '.idea', '.vscode', 'tmp', 'temp', 'logs', '.DS_Store',
])

const LAYER_COLORS = ['#00E5FF', '#7B61FF', '#00ff88', '#ff9500']

// Folder name → semantic layer
const FOLDER_LAYER: Record<string, number> = {
  // 0 – Entry / UI / Client
  app: 0, pages: 0, src: 0, frontend: 0, client: 0, web: 0, ui: 0,
  views: 0, templates: 0, screens: 0, public: 0, static: 0, assets: 0,
  // 1 – API / Gateway / Controllers
  api: 1, routes: 1, route: 1, controllers: 1, controller: 1, handlers: 1,
  handler: 1, middleware: 1, middlewares: 1, graphql: 1, resolvers: 1,
  server: 1, gateway: 1, endpoints: 1, rest: 1, grpc: 1,
  // 2 – Services / Core Logic
  services: 2, service: 2, lib: 2, utils: 2, util: 2, helpers: 2, helper: 2,
  hooks: 2, hook: 2, core: 2, workers: 2, worker: 2, jobs: 2, job: 2,
  components: 2, component: 2, store: 2, state: 2, context: 2, business: 2,
  domain: 2, logic: 2, common: 2, shared: 2, features: 2,
  // 3 – Data / Infra
  db: 3, database: 3, databases: 3, models: 3, model: 3, repositories: 3,
  repository: 3, prisma: 3, drizzle: 3, schema: 3, schemas: 3, migrations: 3,
  migration: 3, infra: 3, infrastructure: 3, terraform: 3, config: 3,
  configs: 3, data: 3, storage: 3, cache: 3, entities: 3, seeds: 3,
}

// Package name → data layer node
const DB_PACKAGES: Record<string, { label: string; sublabel: string; icon: string }> = {
  '@neondatabase/serverless': { label: 'NEON DB', sublabel: 'PostgreSQL Serverless', icon: '◫' },
  'pg': { label: 'POSTGRES', sublabel: 'PostgreSQL', icon: '◫' },
  'pg-promise': { label: 'POSTGRES', sublabel: 'pg-promise', icon: '◫' },
  'mysql2': { label: 'MYSQL', sublabel: 'MySQL Database', icon: '◫' },
  'mysql': { label: 'MYSQL', sublabel: 'MySQL Database', icon: '◫' },
  'mongodb': { label: 'MONGODB', sublabel: 'Document Store', icon: '◫' },
  'mongoose': { label: 'MONGOOSE', sublabel: 'MongoDB ORM', icon: '◫' },
  '@planetscale/database': { label: 'PLANETSCALE', sublabel: 'MySQL Serverless', icon: '◫' },
  'better-sqlite3': { label: 'SQLITE', sublabel: 'SQLite Database', icon: '◫' },
  'sqlite3': { label: 'SQLITE', sublabel: 'SQLite Database', icon: '◫' },
  '@libsql/client': { label: 'TURSO', sublabel: 'LibSQL / SQLite', icon: '◫' },
  'redis': { label: 'REDIS', sublabel: 'Cache / KV Store', icon: '◫' },
  'ioredis': { label: 'REDIS', sublabel: 'Cache / KV Store', icon: '◫' },
  '@upstash/redis': { label: 'UPSTASH REDIS', sublabel: 'Serverless KV', icon: '◫' },
  '@prisma/client': { label: 'PRISMA', sublabel: 'ORM', icon: '◫' },
  'drizzle-orm': { label: 'DRIZZLE ORM', sublabel: 'TypeScript ORM', icon: '◫' },
  'typeorm': { label: 'TYPEORM', sublabel: 'ORM', icon: '◫' },
  'sequelize': { label: 'SEQUELIZE', sublabel: 'ORM', icon: '◫' },
  'knex': { label: 'KNEX', sublabel: 'Query Builder', icon: '◫' },
  '@supabase/supabase-js': { label: 'SUPABASE', sublabel: 'Postgres + Auth', icon: '◫' },
  'supabase': { label: 'SUPABASE', sublabel: 'Backend as a Service', icon: '◫' },
  'firebase': { label: 'FIREBASE', sublabel: 'Document Store', icon: '◫' },
  'firebase-admin': { label: 'FIREBASE', sublabel: 'Admin SDK', icon: '◫' },
  'xlsx': { label: 'EXCEL', sublabel: 'Spreadsheet (xlsx)', icon: '▣' },
  'exceljs': { label: 'EXCEL JS', sublabel: 'Spreadsheet', icon: '▣' },
  'node-xlsx': { label: 'NODE XLSX', sublabel: 'Excel Parser', icon: '▣' },
  '@google-cloud/bigquery': { label: 'BIGQUERY', sublabel: 'Google Analytics DB', icon: '◫' },
  'cassandra-driver': { label: 'CASSANDRA', sublabel: 'Wide-Column DB', icon: '◫' },
  '@aws-sdk/client-dynamodb': { label: 'DYNAMODB', sublabel: 'AWS NoSQL', icon: '◫' },
  'dynamoose': { label: 'DYNAMODB', sublabel: 'AWS NoSQL ORM', icon: '◫' },
  'elasticsearch': { label: 'ELASTICSEARCH', sublabel: 'Search Engine', icon: '◫' },
  '@elastic/elasticsearch': { label: 'ELASTICSEARCH', sublabel: 'Search Engine', icon: '◫' },
  'nano': { label: 'COUCHDB', sublabel: 'Document Store', icon: '◫' },
}

// Package → API/middleware layer node
const API_PACKAGES: Record<string, { label: string; sublabel: string }> = {
  'express': { label: 'EXPRESS', sublabel: 'HTTP Server' },
  'fastify': { label: 'FASTIFY', sublabel: 'HTTP Server' },
  'hono': { label: 'HONO', sublabel: 'Edge API' },
  'koa': { label: 'KOA', sublabel: 'HTTP Server' },
  'nestjs': { label: 'NEST.JS', sublabel: 'API Framework' },
  '@nestjs/core': { label: 'NEST.JS', sublabel: 'API Framework' },
  'trpc': { label: 'TRPC', sublabel: 'Type-safe API' },
  '@trpc/server': { label: 'TRPC', sublabel: 'Type-safe API' },
  'graphql': { label: 'GRAPHQL', sublabel: 'Query Language' },
  'apollo-server': { label: 'APOLLO', sublabel: 'GraphQL Server' },
  '@apollo/server': { label: 'APOLLO', sublabel: 'GraphQL Server' },
  'socket.io': { label: 'SOCKET.IO', sublabel: 'WebSocket' },
  'ws': { label: 'WEBSOCKET', sublabel: 'Real-time' },
}

// Package → entry/service layer
const SERVICE_PACKAGES: Record<string, { label: string; sublabel: string; layer: number }> = {
  'next-auth': { label: 'NEXT AUTH', sublabel: 'Authentication', layer: 1 },
  '@auth/core': { label: 'AUTH.JS', sublabel: 'Authentication', layer: 1 },
  '@clerk/nextjs': { label: 'CLERK', sublabel: 'Auth Provider', layer: 1 },
  'clerk': { label: 'CLERK', sublabel: 'Auth Provider', layer: 1 },
  'stripe': { label: 'STRIPE', sublabel: 'Payments', layer: 1 },
  '@stripe/stripe-js': { label: 'STRIPE', sublabel: 'Payments', layer: 1 },
  'openai': { label: 'OPENAI', sublabel: 'AI / LLM', layer: 2 },
  '@anthropic-ai/sdk': { label: 'CLAUDE AI', sublabel: 'AI / LLM', layer: 2 },
  'langchain': { label: 'LANGCHAIN', sublabel: 'AI Framework', layer: 2 },
  'resend': { label: 'RESEND', sublabel: 'Email Service', layer: 2 },
  'nodemailer': { label: 'NODEMAILER', sublabel: 'Email Service', layer: 2 },
  'aws-sdk': { label: 'AWS SDK', sublabel: 'Cloud Services', layer: 3 },
  '@aws-sdk/client-s3': { label: 'AWS S3', sublabel: 'File Storage', layer: 3 },
  'cloudinary': { label: 'CLOUDINARY', sublabel: 'Media Storage', layer: 3 },
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function nodeIcon(name: string): string {
  const n = name.toLowerCase()
  if (/^(app|pages|src|frontend|client|web|ui|views|screens)$/.test(n)) return '⬡'
  if (/^(api|routes?|controllers?|handlers?|endpoints?|gateway|server)$/.test(n)) return '⇄'
  if (/^(middleware|guards?|interceptors?)$/.test(n)) return '⊛'
  if (/^(graphql|resolvers?|schema)$/.test(n)) return '◎'
  if (/^(services?|business|domain|core|logic)$/.test(n)) return '[ ]'
  if (/^(lib|utils?|helpers?|shared|common|features?)$/.test(n)) return '◈'
  if (/^(hooks?|store|state|context)$/.test(n)) return '◉'
  if (/^(components?|widgets?|ui)$/.test(n)) return '◫'
  if (/^(db|database|models?|entities|repositories?|prisma|drizzle|migrations?)$/.test(n)) return '◫'
  if (/^(infra|terraform|docker|k8s|deploy|config)$/.test(n)) return '▣'
  if (/^(workers?|jobs?|queue|tasks?)$/.test(n)) return '⋮'
  if (/^(scripts?|bin|cmd|tools?)$/.test(n)) return '>'
  return '▣'
}

function parseImports(src: string): string[] {
  const found: string[] = []
  const re = [
    /(?:^|\n)\s*import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*(?:const|let|var)\s+\S+\s*=\s*require\s*\(\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*export\s+(?:.*?\s+from\s+)['"]([^'"]+)['"]/g,
  ]
  for (const r of re) { let m; while ((m = r.exec(src)) !== null) found.push(m[1]) }
  return found
}

function resolveToFolder(imp: string, src: string, known: Set<string>): string | null {
  const clean = imp.split('?')[0]
  if (clean.startsWith('@/') || clean.startsWith('~/')) {
    const seg = clean.slice(2).split('/')[0]
    return seg && known.has(seg) && seg !== src ? seg : null
  }
  if (clean.startsWith('.')) {
    const parts = [src, ...clean.split('/')]
    const res: string[] = []
    for (const p of parts) {
      if (p === '..') res.pop(); else if (p !== '.' && p !== '') res.push(p)
    }
    const root = res[0]
    return root && known.has(root) && root !== src ? root : null
  }
  const seg = clean.split('/')[0]
  return seg && !seg.startsWith('@') && known.has(seg) && seg !== src ? seg : null
}

async function ghFetch(url: string, headers: Record<string, string>): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 25_000)
  try { return await fetch(url, { headers, cache: 'no-store', signal: ctrl.signal }) }
  finally { clearTimeout(t) }
}

// ── Mermaid builder ────────────────────────────────────────────────────────────

function buildMermaid(nodesByLayer: ArchNode[][], edges: [string, string][]): string {
  const layerLabels = [
    '⬡  ENTRY / UI', '⇄  API / GATEWAY',
    '[ ]  SERVICES / CORE', '◫  DATA / INFRASTRUCTURE',
  ]
  const lines: string[] = [
    'flowchart TD',
    '  classDef L0 fill:#001a1a,stroke:#00E5FF,stroke-width:1px,color:#e6edf3',
    '  classDef L1 fill:#0d0a1a,stroke:#7B61FF,stroke-width:1px,color:#e6edf3',
    '  classDef L2 fill:#001a0a,stroke:#00ff88,stroke-width:1px,color:#e6edf3',
    '  classDef L3 fill:#1a0d00,stroke:#ff9500,stroke-width:1px,color:#e6edf3',
    '',
  ]

  for (let li = 0; li < 4; li++) {
    const layer = nodesByLayer[li]
    if (!layer?.length) continue
    lines.push(`  subgraph SG${li}["${layerLabels[li]}"]`)
    lines.push('    direction LR')
    for (const n of layer) {
      const safeId = `n_${n.id.replace(/[^a-zA-Z0-9]/g, '_')}`
      const lbl = `${n.label}\\n${n.sublabel}`
      // Cylinder for real databases, stadium for services, rect for folders
      const shape = n.isDb ? `[("${lbl}")]` : `["${lbl}"]`
      lines.push(`    ${safeId}${shape}:::L${li}`)
    }
    lines.push('  end')
    lines.push('')
  }

  // Edges
  for (const [a, b] of edges) {
    const sa = `n_${a.replace(/[^a-zA-Z0-9]/g, '_')}`
    const sb = `n_${b.replace(/[^a-zA-Z0-9]/g, '_')}`
    lines.push(`  ${sa} --> ${sb}`)
  }
  lines.push('')

  // Subgraph styles
  const sgColors = ['#00E5FF22', '#7B61FF22', '#00ff8822', '#ff950022']
  const sgStrokes = ['#00E5FF44', '#7B61FF44', '#00ff8844', '#ff950044']
  for (let li = 0; li < 4; li++) {
    if (!nodesByLayer[li]?.length) continue
    lines.push(`  style SG${li} fill:${sgColors[li]},stroke:${sgStrokes[li]},color:#7d8590`)
  }

  return lines.join('\n')
}

// ── GET Handler ────────────────────────────────────────────────────────────────

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
    // ── 1. Default branch ────────────────────────────────────────────────────
    const repoRes = await ghFetch(`https://api.github.com/repos/${owner}/${repo}`, H)
    if (!repoRes.ok) return NextResponse.json({ error: 'Repo not found' }, { status: 404 })
    const { default_branch, language: repoLang } = await repoRes.json()
    const branch = default_branch || 'main'

    // ── 2. Fetch package.json + file tree in parallel ────────────────────────
    const [pkgRes, treeRes] = await Promise.all([
      ghFetch(`https://api.github.com/repos/${owner}/${repo}/contents/package.json`, H),
      ghFetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, H),
    ])

    // Parse package.json
    let allDeps: string[] = []
    let framework = ''
    if (pkgRes.ok) {
      try {
        const pkgData = await pkgRes.json()
        if (pkgData.content) {
          const pkg = JSON.parse(Buffer.from(pkgData.content, 'base64').toString('utf-8'))
          allDeps = [
            ...Object.keys(pkg.dependencies || {}),
            ...Object.keys(pkg.devDependencies || {}),
          ]
          if (allDeps.includes('next')) framework = 'Next.js'
          else if (allDeps.includes('nuxt') || allDeps.includes('nuxt3')) framework = 'Nuxt.js'
          else if (allDeps.includes('react')) framework = 'React'
          else if (allDeps.includes('vue')) framework = 'Vue'
          else if (allDeps.includes('svelte')) framework = 'Svelte'
          else if (allDeps.includes('express')) framework = 'Express'
          else if (allDeps.includes('@nestjs/core')) framework = 'NestJS'
          else if (allDeps.includes('fastify')) framework = 'Fastify'
        }
      } catch { /* non-fatal */ }
    }

    // Parse file tree
    if (!treeRes.ok) return NextResponse.json({ error: 'Tree fetch failed' }, { status: 500 })
    const { tree: rawTree } = await treeRes.json()
    const allPaths: string[] = (rawTree ?? [])
      .filter((f: { type: string }) => f.type === 'blob')
      .map((f: { path: string }) => f.path)
      .filter((p: string) => !p.split('/').some((seg: string) => IGNORE.has(seg)))

    // ── 3. Count files per folder (folder-based nodes) ───────────────────────
    const fileCount: Record<string, number> = {}
    for (const p of allPaths) {
      const parts = p.split('/')
      if (parts.length < 2) continue
      const top = parts[0]
      fileCount[top] = (fileCount[top] ?? 0) + 1
      // src/* sub-folders
      if (top === 'src' && parts.length >= 3) {
        fileCount[parts[1]] = (fileCount[parts[1]] ?? 0) + 1
      }
      // app/api/* → api layer
      if (top === 'app' && parts[1] === 'api') {
        fileCount['api'] = (fileCount['api'] ?? 0) + 1
      }
    }

    // ── 4. Build layer buckets ───────────────────────────────────────────────
    const buckets: { id: string; label: string; sublabel: string; layer: number; isDb?: boolean }[][] = [[], [], [], []]
    const usedIds = new Set<string>()

    // Folder-based nodes
    for (const [name, count] of Object.entries(fileCount).sort((a, b) => b[1] - a[1])) {
      if (IGNORE.has(name)) continue
      const layer = FOLDER_LAYER[name.toLowerCase().replace(/-/g, '_')]
      if (layer === undefined) continue
      if (buckets[layer].length >= 3) continue
      if (usedIds.has(name)) continue
      usedIds.add(name)
      buckets[layer].push({ id: name, label: name.toUpperCase(), sublabel: `${count} files`, layer })
    }

    // Package-based: API/service nodes
    for (const [pkg, def] of Object.entries(API_PACKAGES)) {
      if (!allDeps.includes(pkg)) continue
      const id = `pkg_${pkg.replace(/[^a-zA-Z0-9]/g, '_')}`
      if (usedIds.has(id)) continue
      usedIds.add(id)
      buckets[1].push({ id, label: def.label, sublabel: def.sublabel, layer: 1 })
      if (buckets[1].length >= 3) break
    }

    // Package-based: service/auth nodes
    for (const [pkg, def] of Object.entries(SERVICE_PACKAGES)) {
      if (!allDeps.includes(pkg)) continue
      const id = `pkg_${pkg.replace(/[^a-zA-Z0-9]/g, '_')}`
      if (usedIds.has(id)) continue
      usedIds.add(id)
      buckets[def.layer].push({ id, label: def.label, sublabel: def.sublabel, layer: def.layer })
      if (buckets[def.layer].length >= 4) break
    }

    // Package-based: DB nodes
    const addedDbPkgs = new Set<string>()
    for (const [pkg, def] of Object.entries(DB_PACKAGES)) {
      if (!allDeps.includes(pkg)) continue
      if (addedDbPkgs.has(def.label)) continue  // deduplicate (pg + pg-promise → same DB)
      addedDbPkgs.add(def.label)
      const id = `pkg_${pkg.replace(/[^a-zA-Z0-9]/g, '_')}`
      if (usedIds.has(id)) continue
      usedIds.add(id)
      buckets[3].push({ id, label: def.label, sublabel: def.sublabel, layer: 3, isDb: true })
      if (buckets[3].length >= 4) break
    }

    // ── 5. Guarantee entry layer ─────────────────────────────────────────────
    if (buckets[0].length === 0) {
      const entryLabel = framework || repoLang || 'SOURCE'
      const sublabel = framework ? `${framework} App` : `${repoLang || 'Repository'}`
      buckets[0].push({ id: 'entry', label: entryLabel.toUpperCase(), sublabel, layer: 0 })
    }

    // ── 6. Import analysis for edges ─────────────────────────────────────────
    const knownFolderIds = new Set(
      Object.entries(fileCount).filter(([name]) => FOLDER_LAYER[name.toLowerCase().replace(/-/g, '_')] !== undefined).map(([name]) => name)
    )

    const PRIO = ['index.ts','index.tsx','index.js','page.tsx','layout.tsx','route.ts','app.ts','server.ts','main.ts','main.py','main.go']
    const filesToFetch: { folder: string; path: string }[] = []
    for (const folder of knownFolderIds) {
      const candidates = allPaths.filter(p =>
        (p.startsWith(`${folder}/`) && p.split('/').length === 2) ||
        (p.startsWith(`src/${folder}/`) && p.split('/').length === 3)
      )
      if (!candidates.length) continue
      const picked = PRIO.map(n => candidates.find(c => c.endsWith(`/${n}`))).find(Boolean)
        || candidates.find(c => /\.(ts|tsx|js|jsx|py|go|rb)$/.test(c))
      if (picked) filesToFetch.push({ folder, path: picked })
    }

    const folderDeps: Record<string, Set<string>> = {}
    for (const { folder } of filesToFetch.slice(0, 8)) folderDeps[folder] = new Set()

    await Promise.all(
      filesToFetch.slice(0, 8).map(async ({ folder, path }) => {
        try {
          const r = await ghFetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, H)
          if (!r.ok) return
          const { content } = await r.json()
          if (!content) return
          const src = Buffer.from(content, 'base64').toString('utf-8')
          for (const imp of parseImports(src)) {
            const tgt = resolveToFolder(imp, folder, knownFolderIds)
            if (tgt) folderDeps[folder].add(tgt)
          }
        } catch { /* non-fatal */ }
      })
    )

    // ── 7. Build edges ───────────────────────────────────────────────────────
    const allNodeIds = new Set(buckets.flat().map(n => n.id))
    const edgeSet = new Set<string>()
    const edges: [string, string][] = []

    function addEdge(a: string, b: string) {
      const k = `${a}→${b}`
      if (!edgeSet.has(k) && allNodeIds.has(a) && allNodeIds.has(b) && a !== b) {
        edgeSet.add(k); edges.push([a, b])
      }
    }

    // Real import edges
    for (const [src, targets] of Object.entries(folderDeps)) {
      for (const tgt of targets) addEdge(src, tgt)
    }

    // Layer-sequential edges (connect each populated layer to the next)
    for (let li = 0; li < 3; li++) {
      const next = [li + 1, li + 2, li + 3].find(j => buckets[j]?.length > 0)
      if (next === undefined) continue
      for (const src of buckets[li]) {
        for (const dst of buckets[next]) {
          addEdge(src.id, dst.id)
        }
      }
    }

    // Connect package-based DB nodes to ORM/folder nodes in layer 3
    for (const n of buckets[3]) {
      if (!n.isDb) continue
      for (const other of buckets[3]) {
        if (other.id === n.id || other.isDb) continue
        addEdge(other.id, n.id) // ORM → DB
      }
    }

    // ── 8. Finalise ArchNode arrays ──────────────────────────────────────────
    const nodesByLayer: ArchNode[][] = buckets.map((layer, li) =>
      layer.map((n, ci) => ({
        id: n.id,
        label: n.label,
        sublabel: n.sublabel,
        layer: li,
        color: LAYER_COLORS[li],
        icon: nodeIcon(n.id),
        col: ci,
        totalInLayer: layer.length,
        isDb: n.isDb,
      }))
    )

    const mermaidDef = buildMermaid(nodesByLayer, edges)

    return NextResponse.json({
      nodes: nodesByLayer.flat(),
      edges,
      mermaidDef,
      meta: {
        totalFiles: allPaths.length,
        framework,
        filesRead: filesToFetch.slice(0, 8).map(f => f.path),
        depsDetected: allDeps.filter(d => DB_PACKAGES[d] || API_PACKAGES[d] || SERVICE_PACKAGES[d]),
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
