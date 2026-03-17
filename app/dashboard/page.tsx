'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { ComposableMap, Geographies, Geography, Graticule, Sphere } from 'react-simple-maps'

interface GithubUser {
  login: string; name: string | null; avatar_url: string; bio: string | null
  location: string | null; company: string | null; blog: string | null
  public_repos: number; public_gists: number; followers: number; following: number
  created_at: string; html_url: string; email: string | null
}

interface GithubRepo {
  id: number; name: string; description: string | null; html_url: string
  stargazers_count: number; forks_count: number; language: string | null
  updated_at: string; private: boolean; fork: boolean
}

const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572A5',
  Rust: '#dea584', Go: '#00ADD8', Java: '#b07219', 'C++': '#f34b7d',
  C: '#888', Ruby: '#701516', PHP: '#4F5D95', Swift: '#ffac45',
  Kotlin: '#A97BFF', CSS: '#563d7c', HTML: '#e34c26', Shell: '#89e051',
  Vue: '#41b883', Svelte: '#ff3e00',
}

const FEATURE_GROUPS = [
  {
    label: 'REPOSITORY PROFILER',
    color: '#00E5FF',
    items: [
      'Auto Architecture Diagram', 'Dependency Grapher', 'Code Quality Analyser',
      'Dead Code Extractor', 'Repo Readme Maker', 'Wiki Generator',
    ],
  },
  {
    label: 'DEVELOPER INTELLIGENCE',
    color: '#7B61FF',
    items: [
      'Developer Intelligence Score', 'Coding Style Fingerprint', 'Developer Influence Score',
      'Career Growth Graph', 'File Ownership Inference', 'Contributor Network Analysis',
    ],
  },
  {
    label: 'COMMUNITY HEALTH',
    color: '#00ff88',
    items: [
      'Maintainer Burnout Detection', 'Bus Factor Analysis', 'Contributor Churn Analysis',
      'Community Engagement Score', 'Issue Lifecycle Analytics', 'Repository Health Score',
    ],
  },
  {
    label: 'AI DOCUMENTATION',
    color: '#ff9500',
    items: [
      'Instant Repo Explanation', 'Onboarding Guide Generator', 'Learning Path Generator',
      'Automatic TODO Extraction', 'PR Impact Prediction', 'Refactor Opportunity Detection',
    ],
  },
  {
    label: 'ECOSYSTEM DISCOVERY',
    color: '#ff4466',
    items: [
      'Repo Ecosystem Map', 'Underrated Repo Finder', 'Repo Similarity Engine',
      'Emerging Tech Radar', 'Startup Ideas from Repos', 'Duplicate Project Detection',
    ],
  },
  {
    label: 'SECURITY',
    color: '#FFD700',
    items: [
      'Vulnerability Scanner', 'Secret & Credential Leak Detection', 'License Compliance Checker',
      'Outdated Dependency Alerts', 'Supply Chain Risk Scoring', 'Security Patch Tracking',
    ],
  },
]

const REGION_DATA: Record<string, { label: string; commits: number; fill: string; hoverFill: string }> = {
  na: { label: 'NORTH AMERICA', commits: 48320, fill: 'rgba(0,229,255,0.13)', hoverFill: 'rgba(0,229,255,0.35)' },
  sa: { label: 'SOUTH AMERICA', commits: 13840, fill: 'rgba(0,200,240,0.11)', hoverFill: 'rgba(0,200,240,0.38)' },
  eu: { label: 'EUROPE',        commits: 41200, fill: 'rgba(0,160,255,0.14)', hoverFill: 'rgba(0,160,255,0.4)'  },
  af: { label: 'AFRICA',        commits:  9640, fill: 'rgba(0,210,200,0.10)', hoverFill: 'rgba(0,210,200,0.36)' },
  me: { label: 'MIDDLE EAST',   commits: 11280, fill: 'rgba(0,230,210,0.12)', hoverFill: 'rgba(0,230,210,0.38)' },
  as: { label: 'ASIA',          commits: 54880, fill: 'rgba(0,140,255,0.13)', hoverFill: 'rgba(0,140,255,0.38)' },
  oc: { label: 'OCEANIA',       commits:  8750, fill: 'rgba(0,220,200,0.12)', hoverFill: 'rgba(0,220,200,0.38)' },
}

function getRegionId(name: string): string {
  const n = name.toLowerCase()
  if (/united states|canada|mexico|guatemala|belize|honduras|el salvador|nicaragua|costa rica|panama|cuba|jamaica|haiti|dominican|trinidad|bahamas|barbados|grenada|saint kitts|saint lucia|saint vincent|antigua|dominica|puerto rico/.test(n)) return 'na'
  if (/brazil|argentina|chile|peru|colombia|venezuela|ecuador|bolivia|paraguay|uruguay|guyana|suriname|french guiana/.test(n)) return 'sa'
  if (/germany|france|united kingdom|italy|spain|portugal|netherlands|belgium|switzerland|austria|sweden|norway|denmark|finland|poland|czech|slovakia|hungary|romania|bulgaria|greece|croatia|slovenia|serbia|bosnia|montenegro|macedonia|albania|moldova|ukraine|belarus|estonia|latvia|lithuania|ireland|iceland|luxembourg|malta|cyprus|monaco|liechtenstein|andorra|san marino|russia/.test(n)) return 'eu'
  if (/saudi arabia|iran|iraq|turkey|syria|jordan|lebanon|israel|kuwait|bahrain|qatar|united arab emirates|oman|yemen|palestine|georgia|armenia|azerbaijan|afghanistan/.test(n)) return 'me'
  if (/nigeria|egypt|south africa|kenya|ethiopia|tanzania|uganda|ghana|cameroon|ivoire|mozambique|angola|zambia|zimbabwe|senegal|sudan|morocco|algeria|tunisia|libya|madagascar|namibia|botswana|rwanda|mali|niger|chad|guinea|benin|togo|sierra leone|liberia|burkina|central african|congo|gabon|equatorial|eritrea|djibouti|somalia|malawi|lesotho|eswatini|swaziland|gambia|comoros|cape verde|sahara|mauritius|seychelles|somaliland/.test(n)) return 'af'
  if (/australia|new zealand|papua|fiji|solomon|vanuatu|samoa|tonga|kiribati|micronesia|palau|marshall|nauru|tuvalu/.test(n)) return 'oc'
  return 'as'
}

type ContribFilter = 'WEEK' | 'MONTH' | 'YEAR'

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

/* Seeded pseudo-random for reproducible simulated contributions */
function seededRand(seed: number) {
  let s = seed
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff }
}

function buildContribData(login: string, repos: GithubRepo[], filter: ContribFilter) {
  const rand = seededRand(login.split('').reduce((a, c) => a + c.charCodeAt(0), 0))
  const now = Date.now()
  const DAY = 86400000

  /* baseline daily data: last 365 days */
  const days = Array.from({ length: 365 }, (_, i) => {
    const ts = now - (364 - i) * DAY
    const activeRepo = repos.find((r) => Math.abs(new Date(r.updated_at).getTime() - ts) < 3 * DAY)
    const base = activeRepo ? Math.floor(rand() * 12) + 3 : Math.floor(rand() * 4)
    return { ts, count: base }
  })

  if (filter === 'WEEK') {
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return days.slice(-7).map((d) => ({ label: DAYS[new Date(d.ts).getDay()], count: d.count }))
  }

  if (filter === 'MONTH') {
    const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    /* group last 30 days into 4 weekly buckets */
    const last30 = days.slice(-30)
    return [0, 1, 2, 3].map((w) => ({
      label: `Wk ${w + 1}`,
      count: last30.slice(w * 7, w * 7 + 7).reduce((s, d) => s + d.count, 0),
    }))
  }

  /* YEAR: 12 monthly buckets */
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const buckets: number[] = Array(12).fill(0)
  days.forEach((d) => { buckets[new Date(d.ts).getMonth()] += d.count })
  return MONTHS_SHORT.map((label, i) => ({ label, count: buckets[i] }))
}

/* ── CHART TOOLTIP ── */
function ChartTip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'rgba(13,17,23,0.95)', border: '1px solid rgba(0,229,255,0.2)', borderRadius: 5, padding: '5px 9px' }}>
      {label && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#7d8590', marginBottom: 3 }}>{label}</div>}
      {payload.map((p) => (
        <div key={p.name} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: p.color }}>
          {p.name}: {fmt(p.value)}
        </div>
      ))}
    </div>
  )
}

/* ── INTEL CARDS ── */
function ArchCard() {
  return (
    <div style={S.iCard}>
      <div style={S.iHead}>
        <div style={{ ...S.iIcon, background: 'rgba(0,229,255,0.08)', color: '#00E5FF' }}>[ ]</div>
        <span style={{ ...S.iTitle, color: '#00E5FF' }}>ARCHITECTURE ANALYSIS</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, justifyContent: 'center' }}>
        {[['MODULARITY', 94, '#00E5FF'], ['COUPLING', 22, '#7B61FF']].map(([l, v, c]) => (
          <div key={l as string}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#7d8590' }}>{l as string}:</span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: c as string }}>{l === 'COUPLING' ? 'LOW' : v + '%'}</span>
            </div>
            <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 1 }}>
              <div style={{ width: `${v as number}%`, height: '100%', background: c as string, borderRadius: 1, boxShadow: `0 0 5px ${c}` }} />
            </div>
          </div>
        ))}
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#00ff88' }}>// ARCH_VERIFY: SUCCESS</div>
      </div>
      <p style={S.iDesc}>Deep structural scan of repository organization and design patterns.</p>
    </div>
  )
}

function DepCard() {
  return (
    <div style={{ ...S.iCard, borderColor: 'rgba(123,97,255,0.2)' }}>
      <div style={S.iHead}>
        <div style={{ ...S.iIcon, background: 'rgba(123,97,255,0.08)', color: '#7B61FF' }}>&lt;&gt;</div>
        <span style={{ ...S.iTitle, color: '#7B61FF' }}>DEPENDENCY GRAPH</span>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: 60, height: 60 }}>
          {[{ r: 28, c: 'rgba(123,97,255,0.35)' }, { r: 19, c: 'rgba(0,229,255,0.4)' }, { r: 10, c: 'rgba(0,255,136,0.4)' }].map((ring, i) => (
            <div key={i} style={{ position: 'absolute', top: '50%', left: '50%', width: ring.r * 2, height: ring.r * 2, transform: 'translate(-50%,-50%)', borderRadius: '50%', border: `1px solid ${ring.c}`, boxShadow: `0 0 6px ${ring.c}` }} />
          ))}
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 4, height: 4, borderRadius: '50%', background: '#7B61FF', boxShadow: '0 0 8px #7B61FF' }} />
        </div>
      </div>
      <p style={S.iDesc}>Visual mapping of third-party vulnerabilities and circular dependencies.</p>
    </div>
  )
}

function QualityCard() {
  return (
    <div style={S.iCard}>
      <div style={S.iHead}>
        <div style={{ ...S.iIcon, background: 'rgba(0,229,255,0.08)', color: '#00E5FF' }}>◎</div>
        <span style={{ ...S.iTitle, color: '#00E5FF' }}>CODE QUALITY</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, justifyContent: 'center' }}>
        {[['CYBERNETIC_CLEANLINESS', 'OPTIMAL', '#00ff88'], ['COV_THRESHOLD', '98.2%', '#00E5FF'], ['TECH_DEBT', '0.002%', '#7B61FF']].map(([k, v, c]) => (
          <div key={k as string} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: c as string, boxShadow: `0 0 4px ${c}`, flexShrink: 0 }} />
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#7d8590', flex: 1 }}>{k as string}:</span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: c as string }}>{v as string}</span>
          </div>
        ))}
      </div>
      <p style={S.iDesc}>Heuristic-based evaluation of maintainability and security standards.</p>
    </div>
  )
}

/* ── WORLD MAP WIDGET ── */
function WorldMapWidget() {
  const [hoveredRegionId, setHoveredRegionId] = useState<string | null>(null)
  const [hoveredCountry, setHoveredCountry] = useState<string>('')
  const [tip, setTip] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  const total = Object.values(REGION_DATA).reduce((s, r) => s + r.commits, 0)
  const activeRegion = hoveredRegionId ? REGION_DATA[hoveredRegionId] : null

  function handleMouseMove(e: React.MouseEvent) {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setTip({ x: x + 12 > rect.width - 140 ? x - 148 : x + 12, y: Math.max(4, y - 52) })
  }

  return (
    <div
      ref={containerRef}
      style={{ ...S.chartCard, position: 'relative', padding: '8px 9px', gap: 4 }}
      onMouseMove={handleMouseMove}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={S.chartLabel}>GLOBAL COMMIT DISTRIBUTION</div>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: 'rgba(0,229,255,0.35)', letterSpacing: '0.08em' }}>
          {fmt(total)} TOTAL
        </span>
      </div>

      {/* Map */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        <ComposableMap
          projectionConfig={{ scale: 148, center: [10, 5] }}
          style={{ width: '100%', height: '100%' }}
        >
          {/* Ocean background */}
          <Sphere id="rsm-sphere" fill="rgba(0,15,30,0.6)" stroke="rgba(0,229,255,0.08)" strokeWidth={0.5} />
          {/* Graticule grid */}
          <Graticule stroke="rgba(0,229,255,0.06)" strokeWidth={0.4} />

          <Geographies geography="/countries-110m.json">
            {({ geographies }) =>
              geographies.map((geo) => {
                const name = geo.properties.name || ''
                const rid = getRegionId(name)
                const rd = REGION_DATA[rid]
                const isHovered = hoveredRegionId === rid
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={isHovered ? rd.hoverFill : rd.fill}
                    stroke={isHovered ? 'rgba(0,229,255,0.7)' : 'rgba(0,229,255,0.18)'}
                    strokeWidth={isHovered ? 0.6 : 0.3}
                    style={{ default: { outline: 'none' }, hover: { outline: 'none' }, pressed: { outline: 'none' } }}
                    onMouseEnter={() => { setHoveredRegionId(rid); setHoveredCountry(name) }}
                    onMouseLeave={() => { setHoveredRegionId(null); setHoveredCountry('') }}
                  />
                )
              })
            }
          </Geographies>
        </ComposableMap>

        {/* Hover tooltip */}
        {activeRegion && (
          <div style={{
            position: 'absolute', top: tip.y, left: tip.x, pointerEvents: 'none', zIndex: 20,
            background: 'rgba(5,8,15,0.97)', border: '1px solid rgba(0,229,255,0.35)',
            borderRadius: 5, padding: '6px 11px', boxShadow: '0 0 16px rgba(0,229,255,0.18)',
            minWidth: 130,
          }}>
            {hoveredCountry && (
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: '#7d8590', marginBottom: 2, letterSpacing: '0.06em' }}>
                {hoveredCountry.toUpperCase()}
              </div>
            )}
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#00E5FF', marginBottom: 3, letterSpacing: '0.08em' }}>
              {activeRegion.label}
            </div>
            <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 13, color: '#e6edf3', fontWeight: 700 }}>
              {fmt(activeRegion.commits)}
            </div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: '#7d8590', marginTop: 2 }}>
              commits · {((activeRegion.commits / total) * 100).toFixed(1)}% global
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ flexShrink: 0, display: 'flex', flexWrap: 'wrap', gap: '2px 8px' }}>
        {Object.entries(REGION_DATA).map(([rid, rd]) => (
          <div key={rid} style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'default' }}
            onMouseEnter={() => setHoveredRegionId(rid)} onMouseLeave={() => setHoveredRegionId(null)}>
            <div style={{ width: 6, height: 6, borderRadius: 1, background: hoveredRegionId === rid ? '#00E5FF' : rd.fill.replace(/[\d.]+\)$/, '0.6)'), border: '1px solid rgba(0,229,255,0.3)', transition: 'background 0.15s' }} />
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 6, color: hoveredRegionId === rid ? '#00E5FF' : '#7d8590', letterSpacing: '0.04em', transition: 'color 0.15s' }}>
              {rd.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

interface YTVideo { id: string; title: string; thumbnail: string; date: string }

/* ── MAIN ── */
export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState<GithubUser | null>(null)
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [loading, setLoading] = useState(true)
  const [loggingOut, setLoggingOut] = useState(false)
  const [contribFilter, setContribFilter] = useState<ContribFilter>('WEEK')
  const [videos, setVideos] = useState<YTVideo[]>([])
  const [activeVideoId, setActiveVideoId] = useState<string>('')
  const [activeModule, setActiveModule] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/github/user')
      .then((r) => { if (r.status === 401) { router.push('/'); return null } return r.json() })
      .then((d) => { if (!d) return; setUser(d.user); setRepos(d.repos); setLoading(false) })
      .catch(() => setLoading(false))
  }, [router])

  useEffect(() => {
    fetch('/api/github/videos')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d) && d.length) {
          setVideos(d)
          setActiveVideoId(d[0].id)
        }
      })
      .catch(() => {})
  }, [])

  async function logout() {
    setLoggingOut(true)
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
  }

  const contribData = useMemo(
    () => (user ? buildContribData(user.login, repos, contribFilter) : []),
    [user, repos, contribFilter]
  )

  if (loading) {
    return (
      <div style={{ height: '100vh', background: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid rgba(0,229,255,0.15)', borderTopColor: '#00E5FF', animation: 'spin 0.8s linear infinite', boxShadow: '0 0 16px rgba(0,229,255,0.25)' }} />
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '0.2em', color: 'rgba(0,229,255,0.55)' }}>LOADING INTELLIGENCE CORE...</span>
      </div>
    )
  }

  if (!user) return null

  const totalStars = repos.reduce((s, r) => s + r.stargazers_count, 0)
  const joinYear = new Date(user.created_at).getFullYear()
  const displayName = (user.name || user.login).toUpperCase()

  /* language donut — top 5 */
  const langMap: Record<string, number> = {}
  repos.forEach((r) => { if (r.language) langMap[r.language] = (langMap[r.language] || 0) + 1 })
  const langData = Object.entries(langMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, value]) => ({ name, value, color: LANG_COLORS[name] || '#7d8590' }))


  const stats = [
    { label: 'INTELLIGENCE', value: fmt(user.public_repos) },
    { label: 'FOLLOWERS', value: fmt(user.followers) },
    { label: 'FOLLOWING', value: fmt(user.following) },
    { label: 'STARS', value: fmt(totalStars) },
    { label: 'GISTS', value: fmt(user.public_gists) },
  ]

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#050505', color: '#e6edf3', fontFamily: "'Space Grotesk',sans-serif" }}>
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(0,229,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,0.02) 1px,transparent 1px)', backgroundSize: '44px 44px', pointerEvents: 'none', zIndex: 0 }} />

      {/* NAV */}
      <nav style={{ height: 44, flexShrink: 0, position: 'relative', zIndex: 100, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', background: 'rgba(5,5,5,0.96)', borderBottom: '1px solid rgba(0,229,255,0.07)', backdropFilter: 'blur(14px)' }}>
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: '#00E5FF', textShadow: '0 0 14px rgba(0,229,255,0.4)', flexShrink: 0 }}>GIT PLANET</span>
        <div style={{ flex: 1, maxWidth: 280, display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', height: 28, background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(0,229,255,0.1)', borderRadius: 6 }}>
          <span style={{ color: 'rgba(0,229,255,0.35)', fontSize: 12 }}>⌕</span>
          <input placeholder="Analyze any repository..." style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#e6edf3' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          {['◫', '⊙'].map((ic) => (
            <button key={ic} style={{ width: 26, height: 26, background: 'transparent', border: '1px solid rgba(0,229,255,0.1)', borderRadius: 5, color: '#7d8590', fontSize: 12, cursor: 'pointer' }}>{ic}</button>
          ))}
          <div style={{ width: 1, height: 20, background: 'rgba(0,229,255,0.1)', margin: '0 2px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, color: '#e6edf3', letterSpacing: '0.06em' }}>{displayName}</div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: '#7d8590' }}>{user.company?.replace('@', '').toUpperCase() || 'GITHUB DEVELOPER'}</div>
            </div>
            <img src={user.avatar_url} style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid rgba(0,229,255,0.3)', objectFit: 'cover' }} alt="" />
            <button onClick={logout} disabled={loggingOut} title="Sign out" style={{ width: 22, height: 22, background: 'transparent', border: '1px solid rgba(255,68,102,0.25)', borderRadius: 5, color: '#ff4466', fontSize: 9, cursor: 'pointer' }}>✕</button>
          </div>
        </div>
      </nav>

      {/* MAIN GRID */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: '250px 1fr', gap: 8, padding: '8px 12px' }}>

        {/* ── LEFT PANEL ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden', minHeight: 0 }}>
          {/* Profile card */}
          <div style={{ flexShrink: 0, padding: '11px 12px', background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(0,229,255,0.1)', borderRadius: 9, backdropFilter: 'blur(12px)', display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{ position: 'absolute', inset: -3, borderRadius: '50%', border: '1.5px solid rgba(0,229,255,0.45)', boxShadow: '0 0 12px rgba(0,229,255,0.2)' }} />
                <img src={user.avatar_url} style={{ width: 44, height: 44, borderRadius: '50%', display: 'block', objectFit: 'cover' }} alt="" />
                <div style={{ position: 'absolute', bottom: 1, right: 1, width: 7, height: 7, borderRadius: '50%', background: '#00ff88', border: '1.5px solid #050505', boxShadow: '0 0 5px #00ff88' }} />
              </div>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 13, fontWeight: 700, color: '#e6edf3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '0.1em', color: '#00E5FF', marginTop: 2 }}>{user.company?.replace('@', '').toUpperCase() || 'LIVE INTELLIGENCE TRAVELER'}</div>
              </div>
            </div>
            {user.bio && <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: '#7d8590', lineHeight: 1.4, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{user.bio}</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {user.location && (
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  <span style={{ color: 'rgba(0,229,255,0.4)', fontSize: 11 }}>◎</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#7d8590' }}>{user.location.toUpperCase()}</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                <span style={{ color: 'rgba(0,229,255,0.4)', fontSize: 11 }}>◈</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#7d8590' }}>JOINED {joinYear}</span>
              </div>
            </div>
            {/* Stats 3+2 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 3 }}>
              {stats.slice(0, 3).map(({ label, value }) => (
                <div key={label} style={{ padding: '5px 6px', background: 'rgba(0,229,255,0.03)', border: '1px solid rgba(0,229,255,0.08)', borderRadius: 4 }}>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '0.06em', color: '#7d8590' }}>{label}</div>
                  <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 15, fontWeight: 700, color: '#e6edf3', lineHeight: 1.1 }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 3 }}>
              {stats.slice(3).map(({ label, value }) => (
                <div key={label} style={{ padding: '5px 6px', background: 'rgba(123,97,255,0.04)', border: '1px solid rgba(123,97,255,0.1)', borderRadius: 4 }}>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '0.06em', color: '#7d8590' }}>{label}</div>
                  <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 15, fontWeight: 700, color: '#e6edf3', lineHeight: 1.1 }}>{value}</div>
                </div>
              ))}
            </div>
            <a href={user.html_url} target="_blank" rel="noreferrer" style={{ display: 'block', textAlign: 'center', padding: '4px', border: '1px solid rgba(0,229,255,0.2)', borderRadius: 5, fontFamily: "'Orbitron',monospace", fontSize: 9, letterSpacing: '0.1em', color: '#00E5FF', textDecoration: 'none' }}>
              VIEW PROFILE →
            </a>
          </div>

          {/* Top 20 Repos */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(0,229,255,0.1)', borderRadius: 9, overflow: 'hidden' }}>
            <div style={{ padding: '8px 11px 6px', borderBottom: '1px solid rgba(0,229,255,0.07)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={S.secTitle}><span style={{ color: '#00E5FF' }}>[ ]</span> TOP REPOSITORIES</div>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(0,229,255,0.35)' }}>{Math.min(repos.length, 20)}</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,229,255,0.2) transparent' }}>
              {[...repos].sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 20).map((repo, i) => {
                const lc = LANG_COLORS[repo.language || ''] || '#7d8590'
                return (
                  <a key={repo.id} href={repo.html_url} target="_blank" rel="noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 11px', textDecoration: 'none', borderBottom: '1px solid rgba(0,229,255,0.04)', transition: 'background 0.15s' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,229,255,0.04)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'rgba(0,229,255,0.3)', width: 20, flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}.</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#c9d1d9', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{repo.name}</span>
                    {repo.language && <span style={{ width: 7, height: 7, borderRadius: '50%', background: lc, flexShrink: 0, boxShadow: `0 0 4px ${lc}` }} />}
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#7d8590', flexShrink: 0 }}>★{fmt(repo.stargazers_count)}</span>
                  </a>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── CENTER PANEL ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, overflow: 'hidden', minHeight: 0 }}>

          {/* TOP: YouTube + charts */}
          <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>

            {/* YouTube — latest GitHub videos */}
            <div style={{ ...S.chartCard, padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ padding: '6px 10px', borderBottom: '1px solid rgba(0,229,255,0.07)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff4466', boxShadow: '0 0 6px #ff4466', flexShrink: 0 }} />
                <span style={S.chartLabel}>LATEST GITHUB NEWS</span>
              </div>
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 130px', minHeight: 0, overflow: 'hidden' }}>
                {/* Player */}
                {activeVideoId ? (
                  <iframe
                    key={`yt-${activeVideoId}`}
                    src={`https://www.youtube.com/embed/${activeVideoId}?autoplay=1&modestbranding=1&rel=0&origin=${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}`}
                    style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title="GitHub News"
                  />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590' }}>
                    LOADING...
                  </div>
                )}
                {/* Video list */}
                <div style={{ overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,229,255,0.15) transparent', borderLeft: '1px solid rgba(0,229,255,0.07)' }}>
                  {videos.map((v) => (
                    <div
                      key={v.id}
                      onClick={() => setActiveVideoId(v.id)}
                      style={{
                        padding: '6px 8px', cursor: 'pointer', borderBottom: '1px solid rgba(0,229,255,0.05)',
                        background: activeVideoId === v.id ? 'rgba(0,229,255,0.07)' : 'transparent',
                        borderLeft: activeVideoId === v.id ? '2px solid #00E5FF' : '2px solid transparent',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => { if (activeVideoId !== v.id) (e.currentTarget as HTMLElement).style.background = 'rgba(0,229,255,0.03)' }}
                      onMouseLeave={(e) => { if (activeVideoId !== v.id) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: activeVideoId === v.id ? '#e6edf3' : '#c9d1d9', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: 3 }}>
                        {v.title}
                      </div>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: 'rgba(0,229,255,0.4)' }}>{v.date}</div>
                    </div>
                  ))}
                  {videos.length === 0 && (
                    <div style={{ padding: '12px 8px', fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#7d8590', textAlign: 'center' }}>FETCHING...</div>
                  )}
                </div>
              </div>
            </div>

            {/* Charts — contribution + language side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 6, minHeight: 0 }}>

            {/* Contribution graph */}
            <div style={S.chartCard}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div style={S.chartLabel}>CONTRIBUTION ACTIVITY</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['WEEK', 'MONTH', 'YEAR'] as ContribFilter[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => setContribFilter(f)}
                      style={{
                        padding: '2px 8px', borderRadius: 3, cursor: 'pointer', fontSize: 7,
                        fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.08em',
                        background: contribFilter === f ? 'rgba(0,229,255,0.15)' : 'transparent',
                        border: `1px solid ${contribFilter === f ? 'rgba(0,229,255,0.5)' : 'rgba(0,229,255,0.15)'}`,
                        color: contribFilter === f ? '#00E5FF' : '#7d8590',
                        transition: 'all 0.15s',
                      }}
                    >{f}</button>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height="100%">
                {contribFilter === 'WEEK' ? (
                  <BarChart data={contribData} margin={{ top: 6, right: 6, bottom: 0, left: -22 }} barCategoryGap="25%">
                    <defs>
                      <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#00E5FF" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#00E5FF" stopOpacity={0.3} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, fill: '#7d8590' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, fill: '#7d8590' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTip />} />
                    <Bar dataKey="count" name="contributions" fill="url(#barGrad)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                ) : (
                  <AreaChart data={contribData} margin={{ top: 6, right: 6, bottom: 0, left: -22 }}>
                    <defs>
                      <linearGradient id="contribGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00E5FF" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#00E5FF" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, fill: '#7d8590' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, fill: '#7d8590' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTip />} />
                    <Area type="monotone" dataKey="count" name="contributions" stroke="#00E5FF" strokeWidth={1.5} fill="url(#contribGrad)" dot={{ r: 3, fill: '#00E5FF', strokeWidth: 0 }} activeDot={{ r: 4 }} />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* Language donut */}
            <div style={S.chartCard}>
              <div style={S.chartLabel}>TOP 5 LANGUAGES</div>
              {langData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height="60%">
                    <PieChart>
                      <Pie data={langData} cx="50%" cy="50%" innerRadius="45%" outerRadius="75%" dataKey="value" strokeWidth={0}>
                        {langData.map((entry, i) => <Cell key={i} fill={entry.color} fillOpacity={0.85} />)}
                      </Pie>
                      <Tooltip content={<ChartTip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden' }}>
                    {langData.map((d) => (
                      <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: d.color, flexShrink: 0, boxShadow: `0 0 4px ${d.color}` }} />
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#c9d1d9', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</span>
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: d.color }}>{d.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590' }}>NO DATA</div>
              )}
            </div>
            </div>{/* end charts inner grid */}
          </div>{/* end top row */}

          {/* BOTTOM: Intelligence modules (half-size) + World map */}
          <div style={{ flex: 0.85, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 290px', gap: 6, overflow: 'hidden' }}>

            {/* Left: horizontal navbar + modules grid */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0, overflow: 'hidden' }}>
              {/* Horizontal navbar */}
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(0,229,255,0.1)', borderRadius: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
                <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, color: 'rgba(0,229,255,0.4)', letterSpacing: '0.1em', flexShrink: 0, marginRight: 4 }}>⬡</span>
                <div style={{ width: 1, height: 16, background: 'rgba(0,229,255,0.1)', flexShrink: 0, marginRight: 2 }} />
                {FEATURE_GROUPS.map((g) => (
                  <button
                    key={g.label}
                    onClick={() => setActiveModule(activeModule === g.label ? null : g.label)}
                    style={{
                      padding: '3px 10px', borderRadius: 4, cursor: 'pointer', flexShrink: 0,
                      fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: '0.04em',
                      background: activeModule === g.label ? `${g.color}18` : 'transparent',
                      border: `1px solid ${activeModule === g.label ? g.color + '55' : 'rgba(255,255,255,0.05)'}`,
                      color: activeModule === g.label ? g.color : '#7d8590',
                      transition: 'all 0.15s', whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={(e) => {
                      if (activeModule !== g.label) {
                        const el = e.currentTarget as HTMLButtonElement
                        el.style.color = g.color; el.style.borderColor = `${g.color}33`
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (activeModule !== g.label) {
                        const el = e.currentTarget as HTMLButtonElement
                        el.style.color = '#7d8590'; el.style.borderColor = 'rgba(255,255,255,0.05)'
                      }
                    }}
                  >
                    {g.label}
                  </button>
                ))}
                {activeModule && (
                  <button
                    onClick={() => setActiveModule(null)}
                    style={{ padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, background: 'transparent', border: '1px solid rgba(255,68,102,0.2)', color: '#ff4466', marginLeft: 'auto', flexShrink: 0, whiteSpace: 'nowrap' }}
                  >✕ SHOW ALL</button>
                )}
              </div>

              {/* Modules grid */}
              <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 5, overflow: 'hidden' }}>
                {FEATURE_GROUPS.map((group) => (
                  <div
                    key={group.label}
                    style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, opacity: activeModule && activeModule !== group.label ? 0.25 : 1, transition: 'opacity 0.2s' }}
                  >
                    <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 8, fontWeight: 700, letterSpacing: '0.07em', color: group.color, flexShrink: 0, paddingBottom: 3, borderBottom: `1px solid ${group.color}33`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {group.label}
                    </div>
                    {group.items.map((item) => (
                      <button
                        key={item}
                        onClick={() => {
                          if (item === 'Auto Architecture Diagram') router.push('/dashboard/architecture')
                          else if (item === 'Dependency Grapher') router.push('/dashboard/dependency-graph')
                          else if (item === 'Code Quality Analyser') router.push('/dashboard/code-quality')
                          else if (item === 'Dead Code Extractor') router.push('/dashboard/dead-code')
                          else if (item === 'Repo Readme Maker') router.push('/dashboard/readme-maker')
                          else if (item === 'Wiki Generator') router.push('/dashboard/wiki-generator')
                          else if (item === 'Developer Intelligence Score') router.push('/dashboard/developer-intelligence-score')
                          else if (item === 'Coding Style Fingerprint') router.push('/dashboard/style-fingerprint')
                        }}
                        style={{
                          width: '100%', flex: 1, minHeight: 0,
                          background: 'rgba(13,17,23,0.8)',
                          border: `1px solid ${group.color}22`,
                          borderRadius: 4, cursor: 'pointer',
                          fontFamily: "'JetBrains Mono',monospace",
                          fontSize: 9, color: '#c9d1d9',
                          letterSpacing: '0.02em',
                          textAlign: 'left', padding: '0 6px',
                          transition: 'all 0.15s',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}
                        onMouseEnter={(e) => {
                          const el = e.currentTarget as HTMLButtonElement
                          el.style.background = `${group.color}12`
                          el.style.borderColor = `${group.color}55`
                          el.style.color = group.color
                        }}
                        onMouseLeave={(e) => {
                          const el = e.currentTarget as HTMLButtonElement
                          el.style.background = 'rgba(13,17,23,0.8)'
                          el.style.borderColor = `${group.color}22`
                          el.style.color = '#c9d1d9'
                        }}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Right: World map widget */}
            <WorldMapWidget />
          </div>
        </div>

      </div>

      {/* FOOTER */}
      <footer style={{ height: 24, flexShrink: 0, position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderTop: '1px solid rgba(0,229,255,0.06)', background: 'rgba(5,5,5,0.8)' }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, letterSpacing: '0.14em', color: 'rgba(0,229,255,0.3)' }}>GIT PLANET | BUILT BY MAINAK CHAUDHURI | EST. 2026</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: 'rgba(0,229,255,0.25)' }}>SESSION ACTIVE | @{user.login}</span>
      </footer>
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  secTitle: { fontFamily: "'Orbitron',monospace", fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', color: '#e6edf3', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 },
  chartCard: { padding: '9px 10px', background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(0,229,255,0.1)', borderRadius: 7, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden', height: '100%', boxSizing: 'border-box' },
  chartLabel: { fontFamily: "'Orbitron',monospace", fontSize: 8, fontWeight: 600, letterSpacing: '0.1em', color: '#7d8590', flexShrink: 0 },
  iCard: { padding: '10px 11px', background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(0,229,255,0.12)', borderRadius: 7, display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden', height: '100%', boxSizing: 'border-box' },
  iHead: { display: 'flex', alignItems: 'center', gap: 7, paddingBottom: 8, borderBottom: '1px solid rgba(0,229,255,0.08)', marginBottom: 0, flexShrink: 0 },
  iIcon: { width: 20, height: 20, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, flexShrink: 0 },
  iTitle: { fontFamily: "'Orbitron',monospace", fontSize: 8, fontWeight: 600, letterSpacing: '0.08em' },
  iDesc: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 9, color: '#7d8590', lineHeight: 1.4, margin: 0, paddingTop: 7, borderTop: '1px solid rgba(0,229,255,0.06)', marginTop: 7, flexShrink: 0 },
}
