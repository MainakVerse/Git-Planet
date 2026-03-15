import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/session'

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

  // Don't expose the access_token to the client
  const { access_token: _, ...user } = data as Record<string, unknown>
  return NextResponse.json({ authenticated: true, user })
}
