import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/session'

async function ghFetch(url: string, method: string, headers: Record<string, string>, body?: object): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 20_000)
  try {
    return await fetch(url, {
      method, headers, cache: 'no-store', signal: ctrl.signal,
      body: body ? JSON.stringify(body) : undefined,
    })
  } finally { clearTimeout(t) }
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get('gh_session')?.value
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const session = verifySession(token)
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })

  const accessToken = session.access_token as string
  const { owner, repo, testFilePath, testCode, branch = 'main', commitMessage } = await req.json()
  if (!owner || !repo || !testFilePath || !testCode) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const H = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(testFilePath)}`

  // Check if file already exists (need SHA for updates)
  let existingSha: string | undefined
  try {
    const existing = await ghFetch(apiUrl, 'GET', H)
    if (existing.ok) {
      const data = await existing.json()
      existingSha = data.sha
    }
  } catch { /* file doesn't exist, that's fine */ }

  const content = Buffer.from(testCode, 'utf-8').toString('base64')
  const message = commitMessage || `test: add tests for ${testFilePath.split('/').pop()}`

  const body: Record<string, string> = { message, content, branch }
  if (existingSha) body.sha = existingSha

  const res = await ghFetch(apiUrl, 'PUT', H, body)

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Unknown error' }))
    return NextResponse.json({ error: err.message ?? `GitHub API error ${res.status}` }, { status: res.status })
  }

  const data = await res.json()
  const commitUrl = data.commit?.html_url ?? `https://github.com/${owner}/${repo}/blob/${branch}/${testFilePath}`

  return NextResponse.json({ success: true, url: commitUrl, updated: !!existingSha })
}
