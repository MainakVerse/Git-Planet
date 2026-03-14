import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/session'

const GITHUB_TOKEN = process.env.GITHUB_ACCESS_TOKEN

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get('gh_session')?.value
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const session = verifySession(token)
  if (!session) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  if (!GITHUB_TOKEN) {
    return NextResponse.json({ error: 'GitHub token not configured' }, { status: 500 })
  }

  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  const [userRes, reposRes] = await Promise.all([
    fetch('https://api.github.com/user', { headers, cache: 'no-store' }),
    fetch('https://api.github.com/user/repos?sort=updated&per_page=6&affiliation=owner', {
      headers,
      cache: 'no-store',
    }),
  ])

  if (!userRes.ok) {
    return NextResponse.json({ error: 'Failed to fetch GitHub user data' }, { status: 500 })
  }

  const user = await userRes.json()
  const repos = reposRes.ok ? await reposRes.json() : []

  return NextResponse.json({ user, repos })
}
