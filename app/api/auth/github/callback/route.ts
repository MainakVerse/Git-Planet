import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createSession } from '@/lib/session'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  // Verify state to prevent CSRF
  const cookieStore = await cookies()
  const savedState = cookieStore.get('oauth_state')?.value
  cookieStore.delete('oauth_state')

  if (!state || !savedState || state !== savedState) {
    return NextResponse.redirect(`${appUrl}/?error=invalid_state`)
  }

  if (!code) {
    return NextResponse.redirect(`${appUrl}/?error=no_code`)
  }

  const clientId = process.env.GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${appUrl}/?error=oauth_not_configured`)
  }

  // Exchange the code for an access token
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${appUrl}/?error=token_exchange_failed`)
  }

  const tokenData = await tokenRes.json()
  const accessToken: string = tokenData.access_token

  if (!accessToken) {
    return NextResponse.redirect(`${appUrl}/?error=no_access_token`)
  }

  // Fetch the authenticated user's profile
  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    cache: 'no-store',
  })

  if (!userRes.ok) {
    return NextResponse.redirect(`${appUrl}/?error=user_fetch_failed`)
  }

  const user = await userRes.json()

  const session = createSession({
    id: user.id,
    login: user.login,
    name: user.name,
    avatar_url: user.avatar_url,
    access_token: accessToken,
  })

  cookieStore.set('gh_session', session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  })

  return NextResponse.redirect(`${appUrl}/dashboard`)
}
