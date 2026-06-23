import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

export async function GET() {
  const clientId = process.env.GITHUB_CLIENT_ID
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
  const redirectUri =
    process.env.GITHUB_REDIRECT_URI || `${appUrl}/api/auth/github/callback`

  if (!clientId) {
    return NextResponse.json({ error: 'GitHub OAuth not configured.' }, { status: 500 })
  }

  // Generate a random state value to prevent CSRF
  const state = randomBytes(16).toString('hex')

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'read:user repo',
    state,
  })

  const response = NextResponse.redirect(
    `https://github.com/login/oauth/authorize?${params.toString()}`
  )

  response.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  })

  return response
}
