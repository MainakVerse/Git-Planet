import { NextRequest, NextResponse } from 'next/server'
import { authenticate, aiChat, type ChatTurn } from '@/lib/gh'
import { buildRepoContext, renderContextDigest } from '@/lib/repo-context'

export async function POST(req: NextRequest) {
  const auth = await authenticate()
  if (!auth.ok) return auth.response
  const H = auth.headers

  const body = await req.json().catch(() => ({}))
  const { owner, repo, message, history } = body as {
    owner?: string; repo?: string; message?: string; history?: ChatTurn[]
  }
  if (!owner || !repo) return NextResponse.json({ error: 'Missing owner/repo' }, { status: 400 })
  if (!message?.trim()) return NextResponse.json({ error: 'Empty message' }, { status: 400 })

  try {
    const ctx = await buildRepoContext(owner, repo, H, { maxKeyFiles: 6, excerptLines: 50 })
    if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

    const digest = renderContextDigest(ctx)
    const system = `You are a sharp, experienced startup founder and venture investor brainstorming business opportunities inspired by a specific GitHub repository. You have the repo's context below. Help the user explore startup ideas, business models, market positioning, go-to-market, competitive landscape and feasibility — always grounded in what this repo's technology and domain actually enable.

Be commercially concrete: name target customers, pricing models, real competitors, and honest risks. Push back on weak ideas. Reference the repo's actual capabilities when relevant.

Formatting rules:
- Lead with the substantive point.
- Use - for bullets, 1. 2. 3. for ranked options, backticks for product/tech names.
- Never use ** for bold or ## for headers.
- Keep answers tight unless depth is asked for.

=== REPOSITORY CONTEXT ===
${digest.slice(0, 12000)}`

    const turns: ChatTurn[] = (history ?? []).length ? history! : [{ role: 'user', content: message.trim() }]
    const result = await aiChat(system, turns, { model: 'claude-opus-4-8', maxTokens: 1100 })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 503 })
    return NextResponse.json({ reply: result.reply })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
