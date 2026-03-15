import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'

export async function GET() {
  const clientId = process.env.GITHUB_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'GitHub OAuth not configured.' }, { status: 500 })
  }

  // Generate a random state value to prevent CSRF
  const state = randomBytes(16).toString('hex')

  const cookieStore = await cookies()
  cookieStore.set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 minutes
    path: '/',
  })

  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'read:user repo',
    state,
  })

  return NextResponse.redirect(
    `https://github.com/login/oauth/authorize?${params.toString()}`
  )
}
