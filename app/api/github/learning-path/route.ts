import { NextRequest, NextResponse } from 'next/server'
import { authenticate, parseRepoParams, aiJson } from '@/lib/gh'
import { buildRepoContext, renderContextDigest } from '@/lib/repo-context'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LearningStage {
  level: 'Beginner' | 'Intermediate' | 'Advanced'
  title: string
  goal: string
  concepts: string[]
  practiceFiles: string[]
  milestone: string
}

export interface SkillRadarPoint { skill: string; level: number }   // 0-100 emphasis in repo

export interface LearningPathReport {
  owner: string
  repo: string
  focus: string
  totalEstimatedHours: number
  skillRadar: SkillRadarPoint[]
  stages: LearningStage[]
  resources: { label: string; type: string }[]
  meta: { aiGenerated: boolean; generatedAt: string }
}

interface AiOut {
  focus: string
  totalEstimatedHours: number
  skillRadar: SkillRadarPoint[]
  stages: LearningStage[]
  resources: { label: string; type: string }[]
}

export async function GET(req: NextRequest) {
  const auth = await authenticate()
  if (!auth.ok) return auth.response
  const H = auth.headers

  const params = parseRepoParams(new URL(req.url).searchParams)
  if (!params) return NextResponse.json({ error: 'Missing owner/repo' }, { status: 400 })
  const { owner, repo } = params

  try {
    const ctx = await buildRepoContext(owner, repo, H, { maxKeyFiles: 6, excerptLines: 40 })
    if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

    const digest = renderContextDigest(ctx)
    const deps = ctx.pkg ? Object.keys({ ...ctx.pkg.dependencies, ...ctx.pkg.devDependencies }) : []

    const fallbackStages: LearningStage[] = [
      { level: 'Beginner', title: `${ctx.meta.language ?? 'Language'} fundamentals`, goal: 'Read and run the project locally', concepts: [ctx.meta.language ?? 'Syntax', 'Project structure', 'Build tooling'], practiceFiles: ctx.keyFiles.slice(0, 2).map(f => f.path), milestone: 'Run the app and trace one user flow' },
      { level: 'Intermediate', title: 'Core architecture', goal: 'Understand how modules interact', concepts: ctx.topDirs.slice(0, 3).map(d => `${d.dir}/ module`), practiceFiles: ctx.keyFiles.slice(2, 4).map(f => f.path), milestone: 'Implement a small feature end to end' },
      { level: 'Advanced', title: 'Mastery & contribution', goal: 'Ship production-quality changes', concepts: deps.slice(0, 3).length ? deps.slice(0, 3) : ['Testing', 'Performance', 'Patterns'], practiceFiles: ctx.keyFiles.slice(4, 6).map(f => f.path), milestone: 'Open a merged pull request' },
    ]

    const ai = await aiJson<AiOut>(
      `Design a learning path for a developer who wants to master the skills this repository teaches. Produce JSON:
{
  "focus": "<the main skill domain, e.g. 'Full-stack TypeScript with Next.js'>",
  "totalEstimatedHours": <number>,
  "skillRadar": [{"skill": "<skill name>", "level": <0-100 how central it is to this repo>}, ... 5-7 skills],
  "stages": [
    {"level": "Beginner"|"Intermediate"|"Advanced", "title": "<stage name>", "goal": "<one sentence>", "concepts": [<3-4 concepts>], "practiceFiles": [<actual file paths to study>], "milestone": "<a concrete achievement>"}
    ... exactly 3 stages, one per level
  ],
  "resources": [{"label": "<topic to study>", "type": "concept"|"tool"|"pattern"}, ... 4-6]
}
Ground everything in THIS repo's actual stack and files.

=== CONTEXT ===
${digest.slice(0, 10000)}`,
      {
        focus: `${ctx.meta.language ?? 'Software'} development with ${deps.slice(0, 2).join(' & ') || 'this stack'}`,
        totalEstimatedHours: 40,
        skillRadar: [
          { skill: ctx.meta.language ?? 'Core lang', level: 90 },
          ...ctx.topDirs.slice(0, 4).map((d, i) => ({ skill: d.dir, level: 70 - i * 10 })),
          { skill: 'Testing', level: ctx.tree.some(f => /\.(test|spec)\./.test(f.path)) ? 60 : 25 },
        ],
        stages: fallbackStages,
        resources: deps.slice(0, 5).map(d => ({ label: d, type: 'tool' as const })),
      },
    )

    const report: LearningPathReport = {
      owner, repo,
      focus: ai.focus ?? fallbackStages[0].title,
      totalEstimatedHours: ai.totalEstimatedHours ?? 40,
      skillRadar: (ai.skillRadar ?? []).slice(0, 7),
      stages: ai.stages ?? fallbackStages,
      resources: ai.resources ?? [],
      meta: { aiGenerated: !!process.env.ANTHROPIC_API_KEY, generatedAt: new Date().toISOString() },
    }

    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
