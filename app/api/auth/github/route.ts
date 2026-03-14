import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createSession, verifySession } from '@/lib/session'

const GITHUB_TOKEN = process.env.GITHUB_ACCESS_TOKEN

// POST /api/auth/github — sign in using the stored PAT
export async function POST() {
  if (!GITHUB_TOKEN) {
    return NextResponse.json(
      { error: 'GitHub token not configured on the server.' },
      { status: 500 }
    )
  }

  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    return NextResponse.json(
      { error: 'GitHub authentication failed. Your access token may be invalid or expired.' },
      { status: 401 }
    )
  }

  const user = await res.json()
  const sessionData = {
    id: user.id,
    login: user.login,
    name: user.name,
    avatar_url: user.avatar_url,
  }

  const session = createSession(sessionData)
  const cookieStore = await cookies()
  cookieStore.set('gh_session', session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  })

  return NextResponse.json({ ok: true, user: sessionData })
}

// GET /api/auth/github — check if session is valid
export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get('gh_session')?.value
  if (!token) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }

  const data = verifySession(token)
  if (!data) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }

  return NextResponse.json({ authenticated: true, user: data })
}
