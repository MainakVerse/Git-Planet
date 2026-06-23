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
    const ctx = await buildRepoContext(owner, repo, H, { maxKeyFiles: 8, excerptLines: 80 })
    if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

    const digest = renderContextDigest(ctx)
    const system = `You are an expert software engineer helping a developer understand a specific GitHub repository. You have been given a digest of the repo's structure, dependencies, README, and key source files below. Answer questions accurately and concretely, grounded ONLY in this context. When you reference code, cite the file path. If something isn't in the context, say so rather than guessing.

Formatting rules:
- Be concise and direct. Lead with the answer.
- Use - for bullets and 1. 2. 3. for steps. Use backticks for code/filenames/commands.
- Never use ** for bold or ## for headers (plain # for occasional section labels is fine).
- Keep most answers under 8 lines unless the question demands depth.

=== REPOSITORY CONTEXT ===
${digest.slice(0, 14000)}`

    // history already includes the latest user message (sent by AskAI component)
    const turns: ChatTurn[] = (history ?? []).length
      ? history!
      : [{ role: 'user', content: message.trim() }]

    const result = await aiChat(system, turns, { model: 'claude-opus-4-8', maxTokens: 1024 })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 503 })
    return NextResponse.json({ reply: result.reply })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
