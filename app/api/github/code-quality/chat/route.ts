import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/session'

// ── Context builder ────────────────────────────────────────────────────────────

function buildContext(report: any, repoName: string): string {
  if (!report) return 'No analysis report is available yet — user has not run the analysis.'

  const lines: string[] = [
    `Repo: ${repoName || 'unknown'}`,
    `Score: ${report.score}/100 — structural ${report.breakdown.structuralScore}/40, testing ${report.breakdown.testingScore}/40, practices ${report.breakdown.practicesScore}/20`,
    `Files: ${report.meta.sourceFiles} source + ${report.meta.testFiles} test (${report.meta.totalLines} total lines)`,
    `Coverage: ${report.testing.coveragePercent}% modules tested | ratio: ${report.testing.testToCodeRatio} | frameworks: ${report.testing.testFrameworks.join(', ') || 'none detected'}`,
    `Mocks: ${report.practices.hasMocks ? report.practices.mockCount : 'none'} | integration tests: ${report.practices.hasIntegrationTests ? report.practices.integrationCount : 'none'} | assertion density: ${report.practices.assertionDensity}/file`,
  ]

  if (report.structural.largeFunctions?.length > 0) {
    lines.push(`Large functions (>80 lines): ${report.structural.largeFunctions.slice(0, 5).map((f: any) => `${f.name} in ${f.path.split('/').pop()} (${f.lines}L)`).join('; ')}`)
  }
  if (report.structural.complexFiles?.length > 0) {
    lines.push(`Complex files (>8 fns): ${report.structural.complexFiles.slice(0, 4).map((f: any) => `${f.path.split('/').pop()} (${f.functionCount} fns, avg ${f.avgFunctionLines}L)`).join('; ')}`)
  }
  if (report.structural.duplicateBlocks?.length > 0) {
    lines.push(`Duplicate code: ${report.structural.duplicateBlocks.length} block(s) across files — ${report.structural.duplicateBlocks.slice(0, 2).map((d: any) => d.files.map((f: string) => f.split('/').pop()).join(' & ')).join('; ')}`)
  }
  if (report.testing.criticalUntested?.length > 0) {
    lines.push(`Critical modules without tests: ${report.testing.criticalUntested.join(', ')}`)
  }
  if (report.testing.untestedModules?.length > 0) {
    lines.push(`Other untested modules: ${report.testing.untestedModules.slice(0, 8).join(', ')}`)
  }

  return '\n\nAnalysis context:\n' + lines.join('\n')
}

// ── POST handler ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get('gh_session')?.value
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const session = verifySession(token)
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Add ANTHROPIC_API_KEY to your .env file to enable the AI advisor.' }, { status: 503 })

  const body = await req.json()
  const { message, report, repoName } = body
  if (!message?.trim()) return NextResponse.json({ error: 'Empty message' }, { status: 400 })

  const context = buildContext(report, repoName)

  const system = `You are a concise code quality advisor. A developer is asking about improving their codebase based on a real static analysis report.${context}

Strict response rules:
- Total response must be 5 lines or fewer
- For generic questions (e.g. "how to improve", "what should I fix"): respond with exactly 5 bullet points, each on its own line starting with "- "
- For specific questions about a named function, file, or module: respond with a single short paragraph of 2-3 sentences
- Never use ** for bold text
- Never use ## for headers
- Use - for bullets, 1. 2. 3. for ordered steps, and backtick for code/filenames
- Be direct, specific, and actionable — not abstract`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 320,
        system,
        messages: [{ role: 'user', content: message.trim() }],
      }),
    })

    if (!res.ok) {
      const txt = await res.text()
      throw new Error(`Anthropic ${res.status}: ${txt.slice(0, 120)}`)
    }

    const data = await res.json()
    const reply = data.content?.[0]?.text ?? 'No response generated.'
    return NextResponse.json({ reply })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 503 })
  }
}
