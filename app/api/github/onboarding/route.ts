import { NextRequest, NextResponse } from 'next/server'
import { authenticate, parseRepoParams, aiJson } from '@/lib/gh'
import { buildRepoContext, renderContextDigest } from '@/lib/repo-context'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OnboardingStep { title: string; detail: string; type: 'setup' | 'read' | 'concept' | 'task' }
export interface ReadingOrderItem { path: string; why: string }
export interface GlossaryTerm { term: string; definition: string }

export interface OnboardingReport {
  owner: string
  repo: string
  estimatedRampHours: number
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  difficultyColor: string

  prerequisites: string[]
  setupSteps: string[]
  readingOrder: ReadingOrderItem[]
  coreConcepts: GlossaryTerm[]
  firstTasks: string[]
  gotchas: string[]

  meta: { aiGenerated: boolean; generatedAt: string }
}

const DIFFICULTY_COLOR = { beginner: '#00ff88', intermediate: '#FFD700', advanced: '#ff4466' }

interface AiOut {
  difficulty: OnboardingReport['difficulty']
  estimatedRampHours: number
  prerequisites: string[]
  readingOrder: ReadingOrderItem[]
  coreConcepts: GlossaryTerm[]
  firstTasks: string[]
  gotchas: string[]
}

export async function GET(req: NextRequest) {
  const auth = await authenticate()
  if (!auth.ok) return auth.response
  const H = auth.headers

  const params = parseRepoParams(new URL(req.url).searchParams)
  if (!params) return NextResponse.json({ error: 'Missing owner/repo' }, { status: 400 })
  const { owner, repo } = params

  try {
    const ctx = await buildRepoContext(owner, repo, H, { maxKeyFiles: 8, excerptLines: 50 })
    if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

    // Computed setup steps from scripts
    const setupSteps: string[] = []
    if (ctx.pkg) {
      setupSteps.push('Clone the repository and `cd` into it')
      setupSteps.push('Run `npm install` to install dependencies')
      const s = ctx.pkg.scripts ?? {}
      if (Object.keys(s).some(k => /env/i.test(k)) || ctx.tree.some(f => /\.env\.example/.test(f.path)))
        setupSteps.push('Copy `.env.example` to `.env` and fill in required values')
      if (s.dev) setupSteps.push('Start the dev server with `npm run dev`')
      else if (s.start) setupSteps.push('Start the app with `npm start`')
      if (s.test) setupSteps.push('Verify your setup with `npm test`')
    } else {
      setupSteps.push('Review the README for language-specific setup instructions')
    }

    const digest = renderContextDigest(ctx)
    const fallbackReading = ctx.keyFiles.slice(0, 5).map(f => ({ path: f.path, why: 'A core entry/source file worth reading early.' }))

    const ai = await aiJson<AiOut>(
      `You are creating an onboarding guide for a developer joining this project. Based on the repository context, produce JSON with this exact shape:
{
  "difficulty": "beginner" | "intermediate" | "advanced",
  "estimatedRampHours": <number, realistic hours to first productive contribution>,
  "prerequisites": [<3-5 skills/tools a new dev should know>],
  "readingOrder": [{"path": "<file path from the repo>", "why": "<one sentence>"}, ... 5-7 items in the order they should be read],
  "coreConcepts": [{"term": "<concept/pattern used in this repo>", "definition": "<one sentence>"}, ... 4-6 items],
  "firstTasks": [<3-5 concrete good-first-issue style tasks for this repo>],
  "gotchas": [<2-4 non-obvious pitfalls or conventions specific to this codebase>]
}
Use ACTUAL file paths and concepts from the context. Be specific to THIS repo, not generic.

=== CONTEXT ===
${digest.slice(0, 11000)}`,
      {
        difficulty: (ctx.fileCount > 400 ? 'advanced' : ctx.fileCount > 120 ? 'intermediate' : 'beginner') as OnboardingReport['difficulty'],
        estimatedRampHours: ctx.fileCount > 400 ? 24 : ctx.fileCount > 120 ? 10 : 4,
        prerequisites: [ctx.meta.language ?? 'Programming basics', 'Git', ...(ctx.pkg ? ['Node.js & npm'] : [])],
        readingOrder: fallbackReading,
        coreConcepts: ctx.topDirs.slice(0, 5).map(d => ({ term: `${d.dir}/`, definition: `Project module containing ${d.files} files.` })),
        firstTasks: ['Read the README end to end', 'Run the project locally', 'Fix a small typo or doc gap to learn the PR flow'],
        gotchas: ['Check for required environment variables before running', 'Review the existing code style before contributing'],
      },
    )

    const difficulty = ai.difficulty ?? 'intermediate'
    const report: OnboardingReport = {
      owner, repo,
      estimatedRampHours: ai.estimatedRampHours ?? 8,
      difficulty,
      difficultyColor: DIFFICULTY_COLOR[difficulty] ?? '#FFD700',
      prerequisites: ai.prerequisites ?? [],
      setupSteps,
      readingOrder: ai.readingOrder ?? fallbackReading,
      coreConcepts: ai.coreConcepts ?? [],
      firstTasks: ai.firstTasks ?? [],
      gotchas: ai.gotchas ?? [],
      meta: { aiGenerated: !!process.env.ANTHROPIC_API_KEY, generatedAt: new Date().toISOString() },
    }

    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
