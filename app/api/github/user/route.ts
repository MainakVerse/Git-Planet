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

  const userRes = await fetch('https://api.github.com/user', { headers, cache: 'no-store' })

  if (!userRes.ok) {
    return NextResponse.json({ error: 'Failed to fetch GitHub user data' }, { status: 500 })
  }

  const user = await userRes.json()

  // Paginate through all repos (GitHub max per_page is 100)
  const allRepos: unknown[] = []
  let page = 1
  while (true) {
    const res = await fetch(
      `https://api.github.com/user/repos?sort=updated&per_page=100&page=${page}&affiliation=owner`,
      { headers, cache: 'no-store' }
    )
    if (!res.ok) break
    const batch = await res.json()
    if (!Array.isArray(batch) || batch.length === 0) break
    allRepos.push(...batch)
    if (batch.length < 100) break
    page++
  }

  return NextResponse.json({ user, repos: allRepos })
}
