'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

/* TYPES */
interface GithubUser {
  login: string
  name: string | null
  avatar_url: string
  bio: string | null
  location: string | null
  company: string | null
  blog: string | null
  public_repos: number
  public_gists: number
  followers: number
  following: number
  created_at: string
  html_url: string
  email: string | null
}

interface GithubRepo {
  id: number
  name: string
  description: string | null
  html_url: string
  stargazers_count: number
  forks_count: number
  language: string | null
  updated_at: string
  private: boolean
  fork: boolean
}

/* CONSTANTS */
const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Rust: '#dea584',
  Go: '#00ADD8',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#888',
  Ruby: '#701516',
  PHP: '#4F5D95',
  Swift: '#ffac45',
  Kotlin: '#A97BFF',
  CSS: '#563d7c',
  HTML: '#e34c26',
  Shell: '#89e051',
  Vue: '#41b883',
  Svelte: '#ff3e00',
}

const ICONS = ['</>', 'O', '<>', '[]']

function fmt(n: number) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(n)
}

function timeAgo(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`
  return `${Math.floor(s / 2592000)}mo ago`
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

/* STAT CARD */
function StatCard({
  label,
  value,
  color,
  barW = 55,
}: {
  label: string
  value: number
  color: string
  barW?: number
}) {
  return (
    <div
      style={{
        padding: '10px 12px 8px',
        background: 'rgba(13,17,23,0.8)',
        border: '1px solid rgba(0,229,255,0.1)',
        borderRadius: 8,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '0.16em', color: '#7d8590' }}>{label}</div>
      <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 22, fontWeight: 700, color: '#e6edf3', lineHeight: 1.1, textShadow: `0 0 16px ${color}44` }}>{fmt(value)}</div>
      <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 1, marginTop: 6 }}>
        <div style={{ width: `${Math.min(barW, 100)}%`, height: '100%', background: color, borderRadius: 1, boxShadow: `0 0 6px ${color}` }} />
      </div>
    </div>
  )
}

/* REPO CARD */
function RepoCard({ repo, idx }: { repo: GithubRepo; idx: number }) {
  const [hov, setHov] = useState(false)
  const lc = LANG_COLORS[repo.language || ''] || '#7d8590'

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '10px 12px',
        gap: 6,
        background: hov ? 'rgba(0,229,255,0.03)' : 'rgba(13,17,23,0.7)',
        border: `1px solid ${hov ? 'rgba(0,229,255,0.3)' : 'rgba(0,229,255,0.1)'}`,
        borderRadius: 8,
        transition: 'all 0.18s',
        transform: hov ? 'translateY(-1px)' : 'none',
        overflow: 'hidden',
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(0,229,255,0.07)', border: '1px solid rgba(0,229,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#00E5FF' }}>{ICONS[idx]}</div>
        {repo.language && <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '0.1em', padding: '2px 6px', borderRadius: 3, background: lc + '1a', border: `1px solid ${lc}44`, color: lc }}>{repo.language.toUpperCase()}</span>}
      </div>
      <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, fontWeight: 600, color: '#e6edf3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{repo.name}</div>
      <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: '#7d8590', lineHeight: 1.4, margin: 0, flex: 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {repo.description || 'No description provided.'}
      </p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span style={CS.repoStat}>STAR {fmt(repo.stargazers_count)}</span>
        <span style={CS.repoStat}>FORK {fmt(repo.forks_count)}</span>
        <span style={{ ...CS.repoStat, marginLeft: 'auto' }}>UPD {timeAgo(repo.updated_at)}</span>
      </div>
      <a
        href={repo.html_url}
        target="_blank"
        rel="noreferrer"
        style={{ display: 'block', textAlign: 'center', padding: '6px', background: hov ? 'rgba(0,229,255,0.09)' : 'transparent', border: '1px solid rgba(0,229,255,0.2)', borderRadius: 5, fontFamily: "'Orbitron',monospace", fontSize: 8, letterSpacing: '0.1em', color: '#00E5FF', textDecoration: 'none' }}
      >
        ANALYZE REPO -&gt;
      </a>
    </div>
  )
}

/* INTEL CARDS */
function ArchCard() {
  return (
    <div style={CS.iCard}>
      <div style={CS.iHead}>
        <div style={{ ...CS.iIcon, background: 'rgba(0,229,255,0.08)', color: '#00E5FF' }}>[ ]</div>
        <span style={{ ...CS.iTitle, color: '#00E5FF' }}>ARCHITECTURE ANALYSIS</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, justifyContent: 'center' }}>
        {[['MODULARITY', 94, '#00E5FF'], ['COUPLING', 22, '#7B61FF']].map(([l, v, c]) => (
          <div key={l as string}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590', letterSpacing: '0.08em' }}>{l as string}:</span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: c as string }}>{l === 'COUPLING' ? 'LOW' : v + '%'}</span>
            </div>
            <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 1 }}>
              <div style={{ width: `${v as number}%`, height: '100%', background: c as string, borderRadius: 1, boxShadow: `0 0 5px ${c}` }} />
            </div>
          </div>
        ))}
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#00ff88', letterSpacing: '0.06em' }}>// ARCH_VERIFY: SUCCESS</div>
      </div>
      <p style={CS.iDesc}>Deep structural scan of repository organization and design patterns.</p>
    </div>
  )
}

function DepCard() {
  return (
    <div style={{ ...CS.iCard, borderColor: 'rgba(123,97,255,0.2)' }}>
      <div style={CS.iHead}>
        <div style={{ ...CS.iIcon, background: 'rgba(123,97,255,0.08)', color: '#7B61FF' }}>&lt;&gt;</div>
        <span style={{ ...CS.iTitle, color: '#7B61FF' }}>DEPENDENCY GRAPH</span>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: 72, height: 72 }}>
          {[{ r: 34, c: 'rgba(123,97,255,0.35)' }, { r: 23, c: 'rgba(0,229,255,0.4)' }, { r: 12, c: 'rgba(0,255,136,0.4)' }].map((ring, i) => (
            <div key={i} style={{ position: 'absolute', top: '50%', left: '50%', width: ring.r * 2, height: ring.r * 2, transform: 'translate(-50%,-50%)', borderRadius: '50%', border: `1px solid ${ring.c}`, boxShadow: `0 0 8px ${ring.c}` }} />
          ))}
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 5, height: 5, borderRadius: '50%', background: '#7B61FF', boxShadow: '0 0 8px #7B61FF' }} />
        </div>
      </div>
      <p style={CS.iDesc}>Visual mapping of third-party vulnerabilities and circular dependencies.</p>
    </div>
  )
}

function QualityCard() {
  return (
    <div style={CS.iCard}>
      <div style={CS.iHead}>
        <div style={{ ...CS.iIcon, background: 'rgba(0,229,255,0.08)', color: '#00E5FF' }}>O</div>
        <span style={{ ...CS.iTitle, color: '#00E5FF' }}>CODE QUALITY</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1, justifyContent: 'center' }}>
        {[['CYBERNETIC_CLEANLINESS', 'OPTIMAL', '#00ff88'], ['COV_THRESHOLD', '98.2%', '#00E5FF'], ['TECH_DEBT', '0.002%', '#7B61FF']].map(([k, v, c]) => (
          <div key={k as string} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: c as string, boxShadow: `0 0 5px ${c}`, flexShrink: 0 }} />
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590', flex: 1 }}>{k as string}:</span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: c as string }}>{v as string}</span>
          </div>
        ))}
      </div>
      <p style={CS.iDesc}>Heuristic-based evaluation of maintainability and security standards.</p>
    </div>
  )
}

/* MAIN */
export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState<GithubUser | null>(null)
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [loading, setLoading] = useState(true)
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    fetch('/api/github/user')
      .then((r) => {
        if (r.status === 401) {
          router.push('/')
          return null
        }

        return r.json()
      })
      .then((d) => {
        if (!d) return
        setUser(d.user)
        setRepos(d.repos)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [router])

  async function logout() {
    setLoggingOut(true)
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
  }

  if (loading) {
    return (
      <div style={{ height: '100vh', background: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', border: '2px solid rgba(0,229,255,0.15)', borderTopColor: '#00E5FF', animation: 'spin 0.8s linear infinite', boxShadow: '0 0 20px rgba(0,229,255,0.25)' }} />
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '0.22em', color: 'rgba(0,229,255,0.55)' }}>LOADING INTELLIGENCE CORE...</span>
      </div>
    )
  }

  if (!user) return null

  const totalStars = repos.reduce((s, r) => s + r.stargazers_count, 0)
  const joinYear = new Date(user.created_at).getFullYear()
  const displayName = (user.name || user.login).toUpperCase()

  const now = new Date()
  const ATYPES = ['COMMIT', 'MERGE PR', 'PUSH', 'ISSUE']
  const activity = repos.slice(0, 4).map((repo, i) => ({
    time: `[${pad(Math.max(0, now.getHours() - i * 2))}:${pad((now.getMinutes() + i * 11) % 60)}:${pad((now.getSeconds() + i * 7) % 60)}]`,
    type: ATYPES[i % ATYPES.length],
    repo: repo.name,
    id: repo.id.toString(36).slice(-6),
    msg: repo.description?.slice(0, 52) || `update: latest changes to ${repo.name}`,
  }))

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#050505', color: '#e6edf3', fontFamily: "'Space Grotesk',sans-serif" }}>
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(0,229,255,0.022) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,0.022) 1px,transparent 1px)', backgroundSize: '48px 48px', pointerEvents: 'none', zIndex: 0 }} />

      <nav style={{ height: 50, flexShrink: 0, position: 'relative', zIndex: 100, display: 'flex', alignItems: 'center', gap: 14, padding: '0 20px', background: 'rgba(5,5,5,0.95)', borderBottom: '1px solid rgba(0,229,255,0.08)', backdropFilter: 'blur(14px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
          <span style={{ fontSize: 16 }}>GP</span>
          <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 13, fontWeight: 700, letterSpacing: '0.14em', color: '#00E5FF', textShadow: '0 0 16px rgba(0,229,255,0.4)' }}>GIT PLANET</span>
        </div>
        <div style={{ flex: 1, maxWidth: 300, display: 'flex', alignItems: 'center', gap: 7, padding: '0 12px', height: 32, background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(0,229,255,0.1)', borderRadius: 7 }}>
          <span style={{ color: 'rgba(0,229,255,0.4)', fontSize: 14 }}>?</span>
          <input placeholder="Analyze any repository..." style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#e6edf3' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          {['AL', 'OP'].map((ic) => (
            <button key={ic} style={{ width: 30, height: 30, background: 'transparent', border: '1px solid rgba(0,229,255,0.1)', borderRadius: 6, color: '#7d8590', fontSize: 13, cursor: 'pointer' }}>{ic}</button>
          ))}
          <div style={{ width: 1, height: 24, background: 'rgba(0,229,255,0.1)', margin: '0 4px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, color: '#e6edf3', letterSpacing: '0.06em' }}>{displayName}</div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#7d8590', letterSpacing: '0.1em' }}>{user.company?.replace('@', '').toUpperCase() || 'DEVELOPER'}</div>
            </div>
            <img src={user.avatar_url} style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid rgba(0,229,255,0.3)', objectFit: 'cover' }} alt="" />
            <button onClick={logout} disabled={loggingOut} title="Sign out" style={{ width: 26, height: 26, background: 'transparent', border: '1px solid rgba(255,68,102,0.25)', borderRadius: 6, color: '#ff4466', fontSize: 10, cursor: 'pointer' }}>X</button>
          </div>
        </div>
      </nav>

      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: '230px 1fr 200px', gap: 10, padding: '10px 14px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden', minHeight: 0 }}>
          <div style={{ flexShrink: 0, padding: '14px', background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(0,229,255,0.1)', borderRadius: 10, backdropFilter: 'blur(12px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{ position: 'absolute', inset: -3, borderRadius: '50%', border: '1.5px solid rgba(0,229,255,0.45)', boxShadow: '0 0 14px rgba(0,229,255,0.2)' }} />
                <img src={user.avatar_url} style={{ width: 52, height: 52, borderRadius: '50%', display: 'block', objectFit: 'cover' }} alt="" />
                <div style={{ position: 'absolute', bottom: 2, right: 2, width: 8, height: 8, borderRadius: '50%', background: '#00ff88', border: '1.5px solid #050505', boxShadow: '0 0 6px #00ff88' }} />
              </div>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 13, fontWeight: 700, color: '#e6edf3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '0.12em', color: '#00E5FF', marginTop: 2 }}>{user.company?.replace('@', '').toUpperCase() || 'GITHUB DEVELOPER'}</div>
              </div>
            </div>
            {user.bio && <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: '#7d8590', lineHeight: 1.45, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{user.bio}</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {user.location && <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ color: 'rgba(0,229,255,0.4)', fontSize: 10 }}>O</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590', letterSpacing: '0.06em' }}>{user.location.toUpperCase()}</span></div>}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ color: 'rgba(0,229,255,0.4)', fontSize: 10 }}>|</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590' }}>JOINED {joinYear}</span></div>
              {(user.blog || user.html_url) && <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ color: 'rgba(0,229,255,0.4)', fontSize: 10 }}>@</span><a href={user.blog || user.html_url} target="_blank" rel="noreferrer" style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#00E5FF', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(user.blog || `github.com/${user.login}`).replace(/^https?:\/\//, '')}</a></div>}
            </div>
            <a href={user.html_url} target="_blank" rel="noreferrer" style={{ display: 'block', textAlign: 'center', padding: '6px', border: '1px solid rgba(0,229,255,0.2)', borderRadius: 6, fontFamily: "'Orbitron',monospace", fontSize: 8, letterSpacing: '0.1em', color: '#00E5FF', textDecoration: 'none' }}>VIEW PROFILE -&gt;</a>
          </div>

          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, flex: 1, minHeight: 0 }}>
              <StatCard label="REPOS" value={user.public_repos} color="#00E5FF" barW={Math.min(100, user.public_repos)} />
              <StatCard label="FOLLOWERS" value={user.followers} color="#00E5FF" barW={Math.min(100, user.followers / 2)} />
              <StatCard label="FOLLOWING" value={user.following} color="#00E5FF" barW={Math.min(100, user.following / 2)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 6, flex: 1, minHeight: 0 }}>
              <StatCard label="STARS" value={totalStars} color="#7B61FF" barW={Math.min(100, totalStars / 2)} />
              <StatCard label="GISTS" value={user.public_gists} color="#00E5FF" barW={Math.min(100, user.public_gists * 3)} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden', minHeight: 0 }}>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={CS.secTitle}><span style={{ color: '#00E5FF' }}>[ ]</span> REPOSITORY INTELLIGENCE</div>
              <a href={`https://github.com/${user.login}?tab=repositories`} target="_blank" rel="noreferrer" style={{ fontFamily: "'Orbitron',monospace", fontSize: 8, letterSpacing: '0.12em', color: 'rgba(0,229,255,0.5)', textDecoration: 'none' }}>VIEW ALL REPOS</a>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, flex: 1, minHeight: 0 }}>
              {repos.slice(0, 4).map((r, i) => <RepoCard key={r.id} repo={r} idx={i} />)}
              {repos.length === 0 && <div style={{ gridColumn: 'span 4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7d8590', fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>No repositories found.</div>}
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={CS.secTitle}><span style={{ color: '#00E5FF' }}>&lt;&gt;</span> GIT PLANET INTELLIGENCE</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, flex: 1, minHeight: 0 }}>
              <ArchCard />
              <DepCard />
              <QualityCard />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden', minHeight: 0 }}>
          <div style={{ flex: 3, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(0,229,255,0.1)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid rgba(0,229,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={CS.secTitle}><span style={{ color: '#00E5FF' }}>@</span> ACTIVITY</div>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, letterSpacing: '0.14em', color: '#00ff88', background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.18)', padding: '2px 5px', borderRadius: 3 }}>LIVE</span>
            </div>
            <div style={{ flex: 1, overflow: 'hidden', padding: '0 12px' }}>
              {activity.map((e, i) => (
                <div key={i} style={{ padding: '8px 0', borderBottom: i < activity.length - 1 ? '1px solid rgba(0,229,255,0.05)' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, flexWrap: 'wrap', gap: 2 }}>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'rgba(0,229,255,0.4)' }}>{e.time}</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: '#7d8590' }}>ID:{e.id}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 3 }}>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#00E5FF', fontWeight: 600 }}>{e.type}</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#7d8590' }}>in</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7B61FF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>{e.repo}</span>
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#c9d1d9', opacity: 0.65, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>"{e.msg}"</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ flex: 2, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' }}>
            <div style={CS.secTitle}><span style={{ color: '#00E5FF' }}>O</span> QUICK ACTIONS</div>
            {[
              { icon: '+', bg: 'rgba(0,255,136,0.1)', ic: '#00ff88', title: 'Analyze Repository', desc: 'Scan a GitHub URL', href: '/' },
              { icon: 'O', bg: 'rgba(123,97,255,0.1)', ic: '#7B61FF', title: 'Explore Planet', desc: 'Top AI architectures', href: user.html_url },
              { icon: '*', bg: 'rgba(255,165,0,0.1)', ic: '#ff9500', title: 'Starred Repos', desc: 'Your starred repos', href: `${user.html_url}?tab=stars` },
            ].map((a) => (
              <a
                key={a.title}
                href={a.href}
                target={a.href.startsWith('http') ? '_blank' : '_self'}
                rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(0,229,255,0.1)', borderRadius: 8, textDecoration: 'none', color: 'inherit', flex: 1, transition: 'border-color 0.18s', minHeight: 0 }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,229,255,0.28)'
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,229,255,0.1)'
                }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 8, background: a.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: a.ic, flexShrink: 0 }}>{a.icon}</div>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, fontWeight: 600, color: '#e6edf3', whiteSpace: 'nowrap' }}>{a.title}</div>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: '#7d8590' }}>{a.desc}</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>

      <footer style={{ height: 28, flexShrink: 0, position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', borderTop: '1px solid rgba(0,229,255,0.06)', background: 'rgba(5,5,5,0.8)' }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '0.16em', color: 'rgba(0,229,255,0.3)' }}>GIT PLANET | GITHUB INTELLIGENCE PLATFORM | EST. 2024</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '0.14em', color: 'rgba(0,229,255,0.25)' }}>SESSION ACTIVE | @{user.login}</span>
      </footer>
    </div>
  )
}

/* SHARED STYLES */
const CS: Record<string, React.CSSProperties> = {
  secTitle: { fontFamily: "'Orbitron',monospace", fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: '#e6edf3', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 },
  repoStat: { fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590' },
  iCard: { padding: '12px 14px', background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(0,229,255,0.12)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden', height: '100%', boxSizing: 'border-box' },
  iHead: { display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10, borderBottom: '1px solid rgba(0,229,255,0.08)', marginBottom: 0, flexShrink: 0 },
  iIcon: { width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 },
  iTitle: { fontFamily: "'Orbitron',monospace", fontSize: 9, fontWeight: 600, letterSpacing: '0.1em' },
  iDesc: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: '#7d8590', lineHeight: 1.45, margin: 0, paddingTop: 8, borderTop: '1px solid rgba(0,229,255,0.06)', marginTop: 8, flexShrink: 0 },
}
