import { NextRequest, NextResponse } from 'next/server'
import { authenticate, parseRepoParams, aiJson } from '@/lib/gh'
import { buildRepoContext, renderContextDigest } from '@/lib/repo-context'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StartupIdea {
  title: string
  pitch: string
  targetUser: string
  marketGap: string
  monetization: string
  mvpScope: string
  noveltyScore: number       // 0-100
  feasibilityScore: number   // 0-100
  marketScore: number        // 0-100
  tags: string[]
}

export interface StartupIdeasReport {
  owner: string
  repo: string
  basis: string              // what the ideas were derived from
  ideas: StartupIdea[]
  meta: { aiGenerated: boolean; generatedAt: string }
}

interface AiOut { basis: string; ideas: StartupIdea[] }

export async function GET(req: NextRequest) {
  const auth = await authenticate()
  if (!auth.ok) return auth.response
  const H = auth.headers

  const params = parseRepoParams(new URL(req.url).searchParams)
  if (!params) return NextResponse.json({ error: 'Missing owner/repo' }, { status: 400 })
  const { owner, repo } = params

  try {
    const ctx = await buildRepoContext(owner, repo, H, { maxKeyFiles: 5, excerptLines: 40 })
    if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

    const digest = renderContextDigest(ctx)
    const fallbackIdeas: StartupIdea[] = [
      {
        title: `Managed ${ctx.meta.name} Cloud`,
        pitch: `A hosted, zero-config version of ${ctx.meta.name} so teams can adopt it without running infrastructure.`,
        targetUser: 'Engineering teams who want the capability without ops overhead',
        marketGap: 'Self-hosting friction limits adoption of powerful OSS tools',
        monetization: 'Usage-based SaaS with a free tier',
        mvpScope: 'Wrap the core in a hosted API with auth and a dashboard',
        noveltyScore: 55, feasibilityScore: 70, marketScore: 60,
        tags: [ctx.meta.language ?? 'software', 'SaaS', 'devtools'],
      },
      {
        title: `${ctx.meta.name} for Enterprise`,
        pitch: `Add the compliance, SSO and audit features enterprises need on top of ${ctx.meta.name}.`,
        targetUser: 'Larger organisations with security requirements',
        marketGap: 'OSS projects rarely ship enterprise-grade governance',
        monetization: 'Annual enterprise licences + support',
        mvpScope: 'SSO + role-based access + audit logging layer',
        noveltyScore: 45, feasibilityScore: 60, marketScore: 72,
        tags: ['enterprise', 'B2B', 'security'],
      },
    ]

    const ai = await aiJson<AiOut>(
      `You are a seasoned startup founder and VC. Based on this repository's purpose, tech and ecosystem, brainstorm genuinely interesting startup/product ideas it could inspire or enable. Be specific and commercially grounded — avoid generic "make it SaaS" answers unless truly apt. Produce JSON:
{
  "basis": "<one sentence on what these ideas are derived from>",
  "ideas": [
    {
      "title": "<catchy product name>",
      "pitch": "<2-sentence elevator pitch>",
      "targetUser": "<who buys/uses this>",
      "marketGap": "<the unmet need>",
      "monetization": "<how it makes money>",
      "mvpScope": "<what the first version ships>",
      "noveltyScore": <0-100>,
      "feasibilityScore": <0-100 given this tech>,
      "marketScore": <0-100 market size/demand>,
      "tags": [<2-4 tags>]
    }
    ... exactly 4 ideas, ranked best-first
  ]
}
Ground ideas in what THIS repo actually does and the skills it demonstrates.

=== CONTEXT ===
${digest.slice(0, 9000)}`,
      { basis: `Derived from ${ctx.meta.full_name}'s capabilities and tech stack.`, ideas: fallbackIdeas },
      1600,
    )

    const report: StartupIdeasReport = {
      owner, repo,
      basis: ai.basis ?? fallbackIdeas[0].pitch,
      ideas: (ai.ideas ?? fallbackIdeas).slice(0, 4),
      meta: { aiGenerated: !!process.env.ANTHROPIC_API_KEY, generatedAt: new Date().toISOString() },
    }

    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
