import { NextRequest, NextResponse } from 'next/server'
import { aiChat, authenticate, type ChatTurn } from '@/lib/gh'
import { GIT_GPT_FEATURES, findGitGptFeature, normalizeCommandToken, type GitGptFeature } from '@/lib/git-gpt-features'

export const dynamic = 'force-dynamic'

interface GitGptContext {
  login?: string
  repo?: {
    owner?: string
    name?: string
    fullName?: string
    language?: string | null
  } | null
}

interface GitGptBody {
  message?: string
  history?: ChatTurn[]
  context?: GitGptContext
}

function parseCommand(message: string): { token: string; args: string } | null {
  const trimmed = message.trim()
  if (!trimmed.startsWith('/')) return null
  const match = trimmed.match(/^\/([^\s]+)\s*(.*)$/)
  if (!match) return null
  return { token: match[1], args: match[2]?.trim() ?? '' }
}

function parseRepoArg(args: string): { owner: string; repo: string; rest: string } | null {
  const [first, ...rest] = args.trim().split(/\s+/)
  if (!first || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(first)) return null
  const [owner, repo] = first.split('/')
  return { owner, repo, rest: rest.join(' ') }
}

function selectedRepo(context?: GitGptContext) {
  const full = context?.repo?.fullName
  if (full?.includes('/')) {
    const [owner, name] = full.split('/')
    return { owner, name, language: context?.repo?.language ?? null }
  }
  if (context?.repo?.owner && context.repo.name) {
    return { owner: context.repo.owner, name: context.repo.name, language: context.repo.language ?? null }
  }
  if (context?.login && context.repo?.name) {
    return { owner: context.login, name: context.repo.name, language: context.repo.language ?? null }
  }
  return null
}

function buildToolUrl(feature: GitGptFeature, origin: string, args: string, context?: GitGptContext): { url: URL; target: string } | { error: string } {
  const url = new URL(`/api/github/${feature.route}`, origin)

  if (feature.scope === 'repo') {
    const explicit = parseRepoArg(args)
    const repo = explicit ? { owner: explicit.owner, name: explicit.repo, language: context?.repo?.language ?? null } : selectedRepo(context)
    if (!repo) return { error: `Select a repository before running /${feature.slug}.` }
    url.searchParams.set('owner', repo.owner)
    url.searchParams.set('repo', repo.name)
    return { url, target: `${repo.owner}/${repo.name}` }
  }

  if (feature.scope === 'user') {
    const first = args.trim().split(/\s+/)[0]
    const login = first && !first.includes('/') ? first.replace(/^@/, '') : context?.login
    if (!login) return { error: `I need a GitHub login before running /${feature.slug}.` }
    url.searchParams.set('login', login)
    return { url, target: `@${login}` }
  }

  const query = args.trim() || context?.repo?.language || 'javascript'
  url.searchParams.set('q', query)
  return { url, target: query }
}

function compactJson(value: unknown): string {
  const seen = new WeakSet<object>()
  return JSON.stringify(value, (_key, child) => {
    if (typeof child === 'string') return child.length > 700 ? `${child.slice(0, 700)}...` : child
    if (Array.isArray(child)) return child.slice(0, 8)
    if (child && typeof child === 'object') {
      if (seen.has(child)) return undefined
      seen.add(child)
    }
    return child
  }, 2).slice(0, 12_000)
}

function fallbackToolSummary(feature: GitGptFeature, target: string, data: unknown): string {
  const json = compactJson(data)
  return [
    `Ran /${feature.slug} (${feature.label}) for ${target}.`,
    '',
    'The tool completed successfully. Here is the compact result payload:',
    '',
    '```json',
    json,
    '```',
  ].join('\n')
}

async function runFeature(req: NextRequest, feature: GitGptFeature, args: string, context?: GitGptContext) {
  const built = buildToolUrl(feature, req.nextUrl.origin, args, context)
  if ('error' in built) return NextResponse.json({ error: built.error }, { status: 400 })

  const toolRes = await fetch(built.url, {
    headers: {
      cookie: req.headers.get('cookie') ?? '',
    },
    cache: 'no-store',
  })

  const contentType = toolRes.headers.get('content-type') ?? ''
  const data = contentType.includes('application/json') ? await toolRes.json() : { text: await toolRes.text() }
  if (!toolRes.ok) {
    return NextResponse.json({
      error: data?.error ?? `${feature.label} failed with ${toolRes.status}.`,
      tool: { slug: feature.slug, label: feature.label, target: built.target, status: toolRes.status },
    }, { status: toolRes.status })
  }

  const compact = compactJson(data)
  const synthesis = await aiChat(
    `You are Git GPT, an agentic GitHub assistant inside Git Planet.
You just invoked a product feature tool. Explain the result like ChatGPT: concise, helpful, specific, and action-oriented.
Do not claim to see fields that are not in the JSON. Do not include raw JSON unless the user explicitly asked for it.`,
    [
      {
        role: 'user',
        content: `Feature: ${feature.label}
Slash command: /${feature.slug}
Target: ${built.target}
Tool JSON:
${compact}

Summarize the result with the most important signals, risks, and next actions.`,
      },
    ],
    { maxTokens: 900 },
  )

  return NextResponse.json({
    reply: synthesis.ok && synthesis.reply ? synthesis.reply : fallbackToolSummary(feature, built.target, data),
    tool: { slug: feature.slug, label: feature.label, target: built.target, status: toolRes.status },
  })
}

export async function POST(req: NextRequest) {
  const auth = await authenticate()
  if (!auth.ok) return auth.response

  const body = await req.json().catch(() => ({})) as GitGptBody
  const message = body.message?.trim()
  if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 })

  const command = parseCommand(message)
  if (command) {
    if (!command.token) {
      return NextResponse.json({
        reply: `Use a slash command like /code-quality or /vuln-scan. Available commands: ${GIT_GPT_FEATURES.map((f) => `/${f.slug}`).join(', ')}`,
      })
    }
    const feature = findGitGptFeature(command.token)
    if (!feature) {
      const near = GIT_GPT_FEATURES
        .filter((f) => normalizeCommandToken(f.slug).includes(normalizeCommandToken(command.token)) || normalizeCommandToken(f.label).includes(normalizeCommandToken(command.token)))
        .slice(0, 6)
      return NextResponse.json({
        error: `Unknown command /${command.token}.`,
        suggestions: near.map((f) => ({ slug: f.slug, label: f.label })),
      }, { status: 400 })
    }
    return runFeature(req, feature, command.args, body.context)
  }

  const featureList = GIT_GPT_FEATURES.map((feature) => `/${feature.slug} - ${feature.label} (${feature.scope})`).join('\n')
  const repo = selectedRepo(body.context)
  const contextLine = [
    body.context?.login ? `User: @${body.context.login}` : null,
    repo ? `Selected repo: ${repo.owner}/${repo.name}` : null,
  ].filter(Boolean).join('\n')

  const history = (body.history ?? [])
    .filter((turn) => turn.role === 'user' || turn.role === 'assistant')
    .slice(-12)

  const result = await aiChat(
    `You are Git GPT, a ChatGPT-like agentic assistant for Git Planet.
Answer general questions directly. When the user wants analysis, tell them the exact slash command to run.
You can invoke these 36 Git Planet features only when the user sends a slash command:
${featureList}

Current context:
${contextLine || 'No repository selected.'}

Keep answers clear and useful. Do not invent tool results before a slash command has run.`,
    history.length ? history : [{ role: 'user', content: message }],
    { maxTokens: 900 },
  )

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Git GPT failed.' }, { status: result.status ?? 503 })
  }

  return NextResponse.json({ reply: result.reply })
}
