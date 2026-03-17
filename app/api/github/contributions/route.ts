import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/session'

// ── Types ────────────────────────────────────────────────────────────────────────

export interface ContributionDay {
  date: string          // YYYY-MM-DD
  count: number
  weekday: number       // 0=Sun … 6=Sat
}

export interface ContributionWeek {
  days: ContributionDay[]
}

export interface ContributionsReport {
  login: string
  totalContributions: number
  weeks: ContributionWeek[]
  longestStreak: number
  currentStreak: number
  bestDay: { date: string; count: number } | null
}

// ── GraphQL query ────────────────────────────────────────────────────────────────

const QUERY = `
query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
            weekday
          }
        }
      }
    }
  }
}
`

// ── Main Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get('gh_session')?.value
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const session = verifySession(token)
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })

  const accessToken = session.access_token as string
  const { searchParams } = new URL(req.url)

  // Resolve login
  let login = searchParams.get('login')
  if (!login) {
    const selfRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' },
      cache: 'no-store',
    })
    if (!selfRes.ok) return NextResponse.json({ error: 'Failed to fetch user' }, { status: 401 })
    const self = await selfRes.json()
    login = self.login as string
  }

  // Date range: exactly 1 year back from today
  const to   = new Date()
  const from = new Date(to)
  from.setFullYear(from.getFullYear() - 1)

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 20_000)

  let gqlRes: Response
  try {
    gqlRes = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: QUERY,
        variables: {
          login,
          from: from.toISOString(),
          to: to.toISOString(),
        },
      }),
      cache: 'no-store',
      signal: ctrl.signal,
    })
  } finally {
    clearTimeout(t)
  }

  if (!gqlRes.ok) {
    return NextResponse.json({ error: 'GitHub GraphQL request failed' }, { status: gqlRes.status })
  }

  const gqlData = await gqlRes.json() as {
    data?: {
      user?: {
        contributionsCollection?: {
          contributionCalendar?: {
            totalContributions: number
            weeks: { contributionDays: { date: string; contributionCount: number; weekday: number }[] }[]
          }
        }
      }
    }
    errors?: { message: string }[]
  }

  if (gqlData.errors?.length) {
    return NextResponse.json({ error: gqlData.errors[0].message }, { status: 400 })
  }

  const calendar = gqlData.data?.user?.contributionsCollection?.contributionCalendar
  if (!calendar) return NextResponse.json({ error: 'No contribution data found' }, { status: 404 })

  const weeks: ContributionWeek[] = calendar.weeks.map(w => ({
    days: w.contributionDays.map(d => ({
      date: d.date,
      count: d.contributionCount,
      weekday: d.weekday,
    })),
  }))

  // Calculate streaks & best day
  const allDays = weeks.flatMap(w => w.days).sort((a, b) => a.date.localeCompare(b.date))

  let longestStreak = 0, currentStreak = 0, streak = 0
  let bestDay: { date: string; count: number } | null = null

  const today = new Date().toISOString().slice(0, 10)

  for (let i = allDays.length - 1; i >= 0; i--) {
    const d = allDays[i]
    if (d.count > 0) {
      if (i === allDays.length - 1 || allDays[i + 1].date === today) currentStreak++
      else if (currentStreak > 0) break
    } else {
      break
    }
  }

  for (const d of allDays) {
    if (d.count > 0) {
      streak++
      longestStreak = Math.max(longestStreak, streak)
    } else {
      streak = 0
    }
    if (!bestDay || d.count > bestDay.count) {
      bestDay = { date: d.date, count: d.count }
    }
  }

  const report: ContributionsReport = {
    login,
    totalContributions: calendar.totalContributions,
    weeks,
    longestStreak,
    currentStreak,
    bestDay,
  }

  return NextResponse.json(report)
}
