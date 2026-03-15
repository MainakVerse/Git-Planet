import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/session'

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

  const accessToken = session.access_token as string
  if (!accessToken) {
    return NextResponse.json({ error: 'No access token in session' }, { status: 401 })
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  const [userRes, reposRes] = await Promise.all([
    fetch('https://api.github.com/user', { headers, cache: 'no-store' }),
    fetch('https://api.github.com/user/repos?sort=updated&per_page=20&affiliation=owner', {
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
