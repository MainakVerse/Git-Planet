'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ReadmeReport, ReadmeSection } from '@/app/api/github/readme/route'

// ── Types ──────────────────────────────────────────────────────────────────────

interface GithubUser { login: string; name: string | null; avatar_url: string }
interface GithubRepo {
  id: number; name: string; description: string | null
  language: string | null; stargazers_count: number; forks_count: number
  html_url: string; updated_at: string
}

// ── Constants ──────────────────────────────────────────────────────────────────

const ACCENT = '#00E5FF'
const SUCCESS = '#00ff88'
const DANGER = '#ff4466'
const PURPLE = '#7B61FF'
const GOLD = '#FFD700'

// ── Markdown Renderer ──────────────────────────────────────────────────────────

function inlineRender(text: string): React.ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g)
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={i} style={{
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: ACCENT,
          background: ACCENT + '12', padding: '1px 5px', borderRadius: 3,
          border: `1px solid ${ACCENT}20`,
        }}>
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ color: '#e6edf3', fontWeight: 700 }}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('*') && part.endsWith('*') && !part.startsWith('**')) {
      return <em key={i} style={{ color: '#c9d1d9', fontStyle: 'italic' }}>{part.slice(1, -1)}</em>
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (linkMatch) {
      return (
        <a key={i} href={linkMatch[2]} target="_blank" rel="noopener noreferrer"
          style={{ color: ACCENT, textDecoration: 'underline', textDecorationColor: ACCENT + '44' }}>
          {linkMatch[1]}
        </a>
      )
    }
    return part
  })
}

function renderMarkdown(md: string): React.ReactNode[] {
  const lines = md.split('\n')
  const nodes: React.ReactNode[] = []
  let i = 0
  let keyIdx = 0
  const key = () => keyIdx++

  while (i < lines.length) {
    const line = lines[i]

    // Code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++ }
      nodes.push(
        <pre key={key()} style={{
          background: 'rgba(0,0,0,0.5)', border: `1px solid ${ACCENT}18`,
          borderRadius: 6, padding: '12px 16px', overflow: 'auto', margin: '10px 0',
          fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#e6edf3',
          lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>
          {lang && <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 7, color: ACCENT + '66', display: 'block', marginBottom: 6, letterSpacing: '0.1em' }}>{lang.toUpperCase()}</span>}
          {codeLines.join('\n')}
        </pre>
      )
      i++; continue
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      nodes.push(<hr key={key()} style={{ border: 'none', borderTop: `1px solid ${ACCENT}10`, margin: '16px 0' }} />)
      i++; continue
    }

    // H1
    if (line.startsWith('# ') && !line.startsWith('## ')) {
      nodes.push(
        <h1 key={key()} style={{ fontFamily: "'Orbitron',monospace", fontSize: 20, fontWeight: 700, color: ACCENT, letterSpacing: '0.06em', margin: '8px 0 14px', textShadow: `0 0 20px ${ACCENT}44` }}>
          {inlineRender(line.slice(2))}
        </h1>
      )
      i++; continue
    }

    // H2
    if (line.startsWith('## ') && !line.startsWith('### ')) {
      nodes.push(
        <h2 key={key()} style={{ fontFamily: "'Orbitron',monospace", fontSize: 13, fontWeight: 700, color: ACCENT + 'cc', letterSpacing: '0.05em', margin: '20px 0 8px', paddingBottom: 6, borderBottom: `1px solid ${ACCENT}18` }}>
          {inlineRender(line.slice(3))}
        </h2>
      )
      i++; continue
    }

    // H3
    if (line.startsWith('### ') && !line.startsWith('#### ')) {
      nodes.push(
        <h3 key={key()} style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, fontWeight: 700, color: PURPLE + 'cc', letterSpacing: '0.05em', margin: '14px 0 6px' }}>
          {inlineRender(line.slice(4))}
        </h3>
      )
      i++; continue
    }

    // H4
    if (line.startsWith('#### ')) {
      nodes.push(
        <h4 key={key()} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 700, color: '#e6edf3', margin: '12px 0 4px' }}>
          {inlineRender(line.slice(5))}
        </h4>
      )
      i++; continue
    }

    // Blockquote
    if (line.startsWith('> ')) {
      nodes.push(
        <blockquote key={key()} style={{
          borderLeft: `3px solid ${ACCENT}55`, margin: '10px 0', padding: '8px 14px',
          background: `${ACCENT}06`, borderRadius: '0 4px 4px 0',
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: '#c9d1d9', fontStyle: 'italic',
        }}>
          {inlineRender(line.slice(2))}
        </blockquote>
      )
      i++; continue
    }

    // Table
    if (line.startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) { tableLines.push(lines[i]); i++ }
      const rows = tableLines.filter(l => !/^\|[-| :]+\|$/.test(l.trim()))
      if (rows.length > 0) {
        const parseRow = (row: string) => row.split('|').slice(1, -1).map(c => c.trim())
        const headers = parseRow(rows[0])
        const bodyRows = rows.slice(1)
        nodes.push(
          <div key={key()} style={{ overflowX: 'auto', margin: '10px 0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  {headers.map((h, hi) => (
                    <th key={hi} style={{ fontFamily: "'Orbitron',monospace", fontSize: 7, fontWeight: 600, letterSpacing: '0.1em', color: ACCENT + '88', padding: '7px 12px', textAlign: 'left', borderBottom: `1px solid ${ACCENT}20`, whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, ri) => (
                  <tr key={ri} style={{ borderBottom: `1px solid rgba(0,229,255,0.05)` }}>
                    {parseRow(row).map((cell, ci) => (
                      <td key={ci} style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: '#c9d1d9', padding: '6px 12px' }}>
                        {inlineRender(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
      continue
    }

    // Badge line (shield.io images)
    if (line.includes('shields.io') || (line.includes('![') && line.includes('img.shields'))) {
      nodes.push(
        <div key={key()} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0' }}>
          {line.split(/(?=!\[)/).filter(Boolean).map((badge, bi) => {
            const match = badge.match(/!\[([^\]]*)\]\(([^)]+)\)/)
            if (!match) return null
            return (
              <span key={bi} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'rgba(0,229,255,0.06)', border: `1px solid ${ACCENT}20`,
                borderRadius: 4, padding: '2px 8px',
                fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: ACCENT + 'bb',
              }}>
                🏷️ {match[1] || 'badge'}
              </span>
            )
          })}
        </div>
      )
      i++; continue
    }

    // Unordered list
    if (/^(\s*)[-*+]\s/.test(line)) {
      const listItems: string[] = []
      while (i < lines.length && /^(\s*)[-*+]\s/.test(lines[i])) {
        listItems.push(lines[i].replace(/^(\s*)[-*+]\s/, ''))
        i++
      }
      nodes.push(
        <ul key={key()} style={{ margin: '6px 0', paddingLeft: 20, listStyle: 'none' }}>
          {listItems.map((item, li) => (
            <li key={li} style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: '#c9d1d9', margin: '3px 0', paddingLeft: 12, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 0, color: ACCENT + '88' }}>›</span>
              {inlineRender(item)}
            </li>
          ))}
        </ul>
      )
      continue
    }

    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      const listItems: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\d+\.\s/, ''))
        i++
      }
      nodes.push(
        <ol key={key()} style={{ margin: '6px 0', paddingLeft: 22 }}>
          {listItems.map((item, li) => (
            <li key={li} style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: '#c9d1d9', margin: '4px 0', paddingLeft: 4 }}>
              {inlineRender(item)}
            </li>
          ))}
        </ol>
      )
      continue
    }

    // Empty line
    if (!line.trim()) { nodes.push(<div key={key()} style={{ height: 6 }} />); i++; continue }

    // Paragraph
    nodes.push(
      <p key={key()} style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: '#c9d1d9', margin: '4px 0', lineHeight: 1.65 }}>
        {inlineRender(line)}
      </p>
    )
    i++
  }

  return nodes
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, color, icon }: {
  label: string; value: string | number; sub?: string; color: string; icon: string
}) {
  return (
    <div style={{
      background: 'rgba(13,17,23,0.9)', border: `1px solid ${color}33`,
      borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 120,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 13 }}>{icon}</span>
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 7.5, letterSpacing: '0.12em', color, fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 22, fontWeight: 700, color, lineHeight: 1, textShadow: `0 0 16px ${color}55` }}>
        {value}
      </div>
      {sub && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(201,209,217,0.4)', letterSpacing: '0.04em' }}>{sub}</div>}
    </div>
  )
}

function SectionTab({ section, active, onClick }: { section: ReadmeSection; active: boolean; onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: '100%',
        background: active ? `${ACCENT}12` : hov ? 'rgba(0,229,255,0.04)' : 'transparent',
        border: `1px solid ${active ? ACCENT + '44' : hov ? ACCENT + '22' : 'transparent'}`,
        borderRadius: 6, padding: '9px 12px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.15s', textAlign: 'left',
      }}
    >
      <span style={{ fontSize: 14 }}>{section.icon}</span>
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: active ? ACCENT : hov ? '#c9d1d9' : '#7d8590', transition: 'color 0.15s', flex: 1 }}>
        {section.title.toUpperCase()}
      </span>
      {active && <span style={{ width: 5, height: 5, borderRadius: '50%', background: ACCENT, flexShrink: 0 }} />}
    </button>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ReadmeMakerPage() {
  const router = useRouter()

  const [user, setUser] = useState<GithubUser | null>(null)
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [selectedRepo, setSelectedRepo] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<ReadmeReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState(0)
  const [viewMode, setViewMode] = useState<'preview' | 'raw'>('preview')
  const [repoOpen, setRepoOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copiedAll, setCopiedAll] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pushResult, setPushResult] = useState<{ success: boolean; updated: boolean; commitUrl: string | null; fileUrl: string | null; branch: string } | null>(null)
  const [pushError, setPushError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/github/user', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) { router.push('/'); return }
        setUser(data.user)
        setRepos(data.repos ?? [])
      })
      .catch(() => router.push('/'))
  }, [router])

  async function generateReadme() {
    if (!selectedRepo || !user) return
    setLoading(true)
    setReport(null)
    setError(null)
    try {
      const res = await fetch(
        `/api/github/readme?owner=${user.login}&repo=${selectedRepo}`,
        { credentials: 'include' }
      )
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Generation failed'); return }
      setReport(data)
      setActiveSection(0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  function copySection() {
    if (!report) return
    const section = report.sections[activeSection]
    navigator.clipboard.writeText(section.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function copyFullReadme() {
    if (!report) return
    navigator.clipboard.writeText(report.fullMarkdown).then(() => {
      setCopiedAll(true)
      setTimeout(() => setCopiedAll(false), 2000)
    })
  }

  async function pushToGitHub() {
    if (!report || !user) return
    setPushing(true)
    setPushResult(null)
    setPushError(null)
    try {
      const res = await fetch('/api/github/readme', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: user.login,
          repo: selectedRepo,
          markdown: report.fullMarkdown,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setPushError(data.error ?? 'Push failed'); return }
      setPushResult(data)
    } catch (e) {
      setPushError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setPushing(false)
    }
  }

  function downloadReadme() {
    if (!report) return
    const blob = new Blob([report.fullMarkdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'README.md'
    a.click()
    URL.revokeObjectURL(url)
  }

  const currentSection = report?.sections[activeSection]
  const charCount = report?.fullMarkdown.length ?? 0
  const lineCount = report?.fullMarkdown.split('\n').length ?? 0

  return (
    <div style={{
      height: '100vh', overflow: 'hidden', background: '#050505',
      color: '#c9d1d9', fontFamily: "'JetBrains Mono',monospace",
      display: 'flex', flexDirection: 'column',
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
        @keyframes shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
        ::-webkit-scrollbar { width: 5px; height: 5px }
        ::-webkit-scrollbar-track { background: transparent }
        ::-webkit-scrollbar-thumb { background: rgba(0,229,255,0.15); border-radius: 3px }
        ::-webkit-scrollbar-thumb:hover { background: rgba(0,229,255,0.3) }
      `}</style>

      {/* ── TOPBAR ── */}
      <div style={{
        height: 48, borderBottom: '1px solid rgba(0,229,255,0.08)',
        display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12,
        background: 'rgba(13,17,23,0.95)', flexShrink: 0,
      }}>
        <button
          onClick={() => router.push('/dashboard')}
          style={{
            background: 'transparent', border: '1px solid rgba(0,229,255,0.15)',
            borderRadius: 5, padding: '4px 10px', cursor: 'pointer',
            color: 'rgba(0,229,255,0.6)', fontFamily: "'JetBrains Mono',monospace",
            fontSize: 10, display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s',
          }}
          onMouseEnter={e => { const el = e.currentTarget as HTMLButtonElement; el.style.borderColor = `${ACCENT}55`; el.style.color = ACCENT }}
          onMouseLeave={e => { const el = e.currentTarget as HTMLButtonElement; el.style.borderColor = 'rgba(0,229,255,0.15)'; el.style.color = 'rgba(0,229,255,0.6)' }}
        >
          ← BACK
        </button>

        <div style={{ width: 1, height: 20, background: 'rgba(0,229,255,0.1)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>📝</span>
          <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: ACCENT }}>
            REPO README MAKER
          </span>
        </div>

        {report && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', marginRight: user ? 16 : 'auto' }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(0,229,255,0.4)' }}>
              {report.sections.length} sections · {lineCount.toLocaleString()} lines
            </span>
            <button
              onClick={copyFullReadme}
              style={{
                background: `${ACCENT}12`, border: `1px solid ${ACCENT}33`,
                borderRadius: 5, padding: '4px 10px', cursor: 'pointer',
                color: ACCENT, fontFamily: "'Orbitron',monospace", fontSize: 8,
                letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s',
              }}
            >
              {copiedAll ? '✓ COPIED' : '⎘ COPY ALL'}
            </button>
            <button
              onClick={downloadReadme}
              style={{
                background: `${SUCCESS}18`, border: `1px solid ${SUCCESS}44`,
                borderRadius: 5, padding: '4px 10px', cursor: 'pointer',
                color: SUCCESS, fontFamily: "'Orbitron',monospace", fontSize: 8,
                letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s',
              }}
            >
              ↓ DOWNLOAD README.md
            </button>
            <button
              onClick={pushToGitHub}
              disabled={pushing}
              style={{
                background: pushing ? `${PURPLE}08` : `${PURPLE}22`,
                border: `1px solid ${pushing ? PURPLE + '22' : PURPLE + '66'}`,
                borderRadius: 5, padding: '4px 12px', cursor: pushing ? 'not-allowed' : 'pointer',
                color: pushing ? PURPLE + '66' : PURPLE,
                fontFamily: "'Orbitron',monospace", fontSize: 8,
                letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
                boxShadow: pushing ? 'none' : `0 0 14px ${PURPLE}22`,
              }}
            >
              {pushing
                ? <><span style={{ display: 'inline-block', width: 10, height: 10, border: `2px solid ${PURPLE}44`, borderTopColor: PURPLE, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> PUSHING…</>
                : <><span style={{ fontSize: 11 }}>⬆</span> PUSH TO GITHUB</>
              }
            </button>
          </div>
        )}

        {user && (
          <div style={{ marginLeft: report ? 0 : 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src={user.avatar_url} alt="" width={24} height={24} style={{ borderRadius: '50%', border: `1px solid ${ACCENT}33` }} />
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'rgba(0,229,255,0.5)' }}>
              @{user.login}
            </span>
          </div>
        )}
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px 24px', gap: 16, overflow: 'hidden', minHeight: 0 }}>

        {/* ── CONTROL PANEL ── */}
        <div style={{
          background: 'rgba(13,17,23,0.8)', border: `1px solid ${ACCENT}18`,
          borderRadius: 10, padding: '16px 20px', display: 'flex',
          alignItems: 'center', gap: 14, flexWrap: 'wrap', flexShrink: 0,
        }}>
          {/* Repo selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, letterSpacing: '0.12em', color: 'rgba(0,229,255,0.4)' }}>REPOSITORY</span>
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setRepoOpen(o => !o)}
                style={{
                  background: 'rgba(0,0,0,0.4)', border: `1px solid ${repoOpen ? ACCENT + '55' : 'rgba(0,229,255,0.15)'}`,
                  borderRadius: 6, padding: '7px 12px', cursor: 'pointer',
                  color: selectedRepo ? '#e6edf3' : '#7d8590', fontFamily: "'JetBrains Mono',monospace",
                  fontSize: 11, minWidth: 220, textAlign: 'left',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, transition: 'border-color 0.15s',
                }}
              >
                {selectedRepo || 'Select a repository…'}
                <span style={{ color: ACCENT + '66', fontSize: 9 }}>{repoOpen ? '▲' : '▼'}</span>
              </button>
              {repoOpen && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, zIndex: 100,
                  background: 'rgba(13,17,23,0.98)', border: `1px solid ${ACCENT}30`,
                  borderRadius: 6, marginTop: 4, maxHeight: 240, overflowY: 'auto', minWidth: 220,
                }}>
                  {repos.map(r => (
                    <button
                      key={r.id}
                      onClick={() => { setSelectedRepo(r.name); setRepoOpen(false) }}
                      style={{
                        width: '100%', background: selectedRepo === r.name ? `${ACCENT}10` : 'transparent',
                        border: 'none', padding: '8px 12px', cursor: 'pointer',
                        color: selectedRepo === r.name ? ACCENT : '#c9d1d9',
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 11,
                        textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { if (selectedRepo !== r.name) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,229,255,0.04)' }}
                      onMouseLeave={e => { if (selectedRepo !== r.name) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                    >
                      <span>{r.name}</span>
                      {r.language && (
                        <span style={{ fontSize: 9, color: '#7d8590', fontFamily: "'Space Grotesk',sans-serif" }}>
                          {r.language}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={generateReadme}
            disabled={!selectedRepo || loading}
            style={{
              background: !selectedRepo || loading ? 'rgba(0,229,255,0.05)' : `linear-gradient(135deg, ${ACCENT}22, ${PURPLE}22)`,
              border: `1px solid ${!selectedRepo || loading ? 'rgba(0,229,255,0.1)' : ACCENT + '55'}`,
              borderRadius: 7, padding: '10px 22px', cursor: !selectedRepo || loading ? 'not-allowed' : 'pointer',
              color: !selectedRepo || loading ? '#7d8590' : ACCENT,
              fontFamily: "'Orbitron',monospace", fontSize: 10, fontWeight: 700,
              letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s',
              boxShadow: !selectedRepo || loading ? 'none' : `0 0 20px ${ACCENT}15`,
            }}
          >
            {loading
              ? <><span style={{ display: 'inline-block', width: 12, height: 12, border: `2px solid ${ACCENT}44`, borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> GENERATING…</>
              : <><span style={{ fontSize: 14 }}>📝</span> GENERATE README</>
            }
          </button>

          {/* Stack info */}
          {report && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[
                { label: 'FRAMEWORK', value: report.framework, color: ACCENT },
                { label: 'PACKAGE MGR', value: report.packageManager.toUpperCase(), color: PURPLE },
                { label: 'LANGUAGE', value: report.language || 'N/A', color: SUCCESS },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 7, color: color + '66', letterSpacing: '0.1em' }}>{label}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color }}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── ERROR ── */}
        {error && (
          <div style={{
            background: `${DANGER}08`, border: `1px solid ${DANGER}33`,
            borderRadius: 8, padding: '12px 16px', flexShrink: 0,
            fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: DANGER,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span>⚠</span> {error}
          </div>
        )}

        {/* ── PUSH ERROR ── */}
        {pushError && (
          <div style={{
            background: `${DANGER}08`, border: `1px solid ${DANGER}33`,
            borderRadius: 8, padding: '12px 16px', flexShrink: 0,
            fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: DANGER,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span>⚠</span> Push failed: {pushError}</span>
            <button onClick={() => setPushError(null)} style={{ background: 'transparent', border: 'none', color: DANGER + '88', cursor: 'pointer', fontSize: 14, padding: 0 }}>✕</button>
          </div>
        )}

        {/* ── PUSH SUCCESS ── */}
        {pushResult?.success && (
          <div style={{
            background: `${SUCCESS}08`, border: `1px solid ${SUCCESS}33`,
            borderRadius: 8, padding: '12px 18px', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>✅</span>
              <div>
                <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, color: SUCCESS, letterSpacing: '0.1em', marginBottom: 3 }}>
                  README.md {pushResult.updated ? 'UPDATED' : 'CREATED'} ON GITHUB
                </div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'rgba(0,255,136,0.6)' }}>
                  Branch: <span style={{ color: SUCCESS }}>{pushResult.branch}</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {pushResult.fileUrl && (
                <a
                  href={pushResult.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: `${SUCCESS}18`, border: `1px solid ${SUCCESS}44`,
                    borderRadius: 5, padding: '4px 10px', cursor: 'pointer',
                    color: SUCCESS, fontFamily: "'Orbitron',monospace", fontSize: 8,
                    letterSpacing: '0.08em', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  VIEW FILE ↗
                </a>
              )}
              {pushResult.commitUrl && (
                <a
                  href={pushResult.commitUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: `${PURPLE}18`, border: `1px solid ${PURPLE}44`,
                    borderRadius: 5, padding: '4px 10px', cursor: 'pointer',
                    color: PURPLE, fontFamily: "'Orbitron',monospace", fontSize: 8,
                    letterSpacing: '0.08em', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  VIEW COMMIT ↗
                </a>
              )}
              <button
                onClick={() => setPushResult(null)}
                style={{ background: 'transparent', border: 'none', color: SUCCESS + '66', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* ── METRICS ── */}
        {report && (
          <div style={{ display: 'flex', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
            <MetricCard label="FILES ANALYZED" value={report.meta.filesAnalyzed} sub={`of ${report.meta.totalFiles} total`} color={ACCENT} icon="📂" />
            <MetricCard label="README SECTIONS" value={report.sections.length} sub="standard sections" color={PURPLE} icon="📋" />
            <MetricCard label="ENV VARIABLES" value={report.meta.detectedEnvVars} sub="detected vars" color={SUCCESS} icon="⚙️" />
            <MetricCard label="TOTAL LINES" value={lineCount.toLocaleString()} sub={`${charCount.toLocaleString()} chars`} color={GOLD} icon="📄" />
            {report.meta.hasExistingReadme && (
              <div style={{
                background: `${SUCCESS}08`, border: `1px solid ${SUCCESS}22`,
                borderRadius: 8, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontSize: 16 }}>✅</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: SUCCESS }}>
                  EXISTING README<br />DETECTED
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── MAIN PANEL ── */}
        {report && (
          <div style={{ flex: 1, display: 'flex', gap: 16, minHeight: 0 }}>

            {/* Sidebar: section tabs */}
            <div style={{
              width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4,
              overflowY: 'auto', background: 'rgba(13,17,23,0.6)', border: `1px solid ${ACCENT}12`,
              borderRadius: 10, padding: 10,
            }}>
              <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 7.5, color: 'rgba(0,229,255,0.35)', letterSpacing: '0.12em', padding: '4px 4px 8px', borderBottom: `1px solid ${ACCENT}10`, marginBottom: 4 }}>
                SECTIONS
              </div>
              {report.sections.map((section, idx) => (
                <SectionTab
                  key={section.id}
                  section={section}
                  active={activeSection === idx}
                  onClick={() => setActiveSection(idx)}
                />
              ))}

              {/* Topics */}
              {report.topics.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${ACCENT}10` }}>
                  <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 7, color: 'rgba(0,229,255,0.3)', letterSpacing: '0.1em', marginBottom: 8 }}>TOPICS</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {report.topics.slice(0, 8).map(t => (
                      <span key={t} style={{
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                        color: PURPLE + 'cc', background: `${PURPLE}10`,
                        border: `1px solid ${PURPLE}22`, borderRadius: 3, padding: '2px 5px',
                      }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Section viewer */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

              {/* Section header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 12, flexShrink: 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{currentSection?.icon}</span>
                  <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 12, fontWeight: 700, color: ACCENT, letterSpacing: '0.08em' }}>
                    {currentSection?.title.toUpperCase()}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {/* View mode toggle */}
                  {['preview', 'raw'].map(mode => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode as 'preview' | 'raw')}
                      style={{
                        background: viewMode === mode ? `${ACCENT}18` : 'transparent',
                        border: `1px solid ${viewMode === mode ? ACCENT + '55' : 'rgba(0,229,255,0.15)'}`,
                        borderRadius: 5, padding: '4px 10px', cursor: 'pointer',
                        color: viewMode === mode ? ACCENT : '#7d8590',
                        fontFamily: "'Orbitron',monospace", fontSize: 8, letterSpacing: '0.08em',
                        transition: 'all 0.15s',
                      }}
                    >
                      {mode === 'preview' ? '◉ PREVIEW' : '≡ RAW'}
                    </button>
                  ))}
                  <button
                    onClick={copySection}
                    style={{
                      background: 'transparent', border: `1px solid rgba(0,229,255,0.15)`,
                      borderRadius: 5, padding: '4px 10px', cursor: 'pointer',
                      color: copied ? SUCCESS : 'rgba(0,229,255,0.6)',
                      fontFamily: "'Orbitron',monospace", fontSize: 8, letterSpacing: '0.08em',
                      transition: 'all 0.15s',
                    }}
                  >
                    {copied ? '✓ COPIED' : '⎘ COPY'}
                  </button>
                </div>
              </div>

              {/* Section content */}
              <div style={{
                flex: 1, overflow: 'auto', background: 'rgba(13,17,23,0.8)',
                border: `1px solid ${ACCENT}12`, borderRadius: 10, padding: '20px 24px',
              }}>
                {viewMode === 'raw' ? (
                  <pre style={{
                    fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#c9d1d9',
                    lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0,
                  }}>
                    {currentSection?.content}
                  </pre>
                ) : (
                  <div>
                    {currentSection && renderMarkdown(currentSection.content)}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── EMPTY STATE ── */}
        {!report && !loading && !error && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            <div style={{ fontSize: 64, opacity: 0.15 }}>📝</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 14, color: 'rgba(0,229,255,0.4)', letterSpacing: '0.1em', marginBottom: 8 }}>
                README MAKER
              </div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: '#7d8590', maxWidth: 400 }}>
                Select a repository and click <strong style={{ color: ACCENT + '88' }}>Generate README</strong> to create a professional, structured README following GitHub best practices.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 24, marginTop: 12 }}>
              {[
                { icon: '📌', label: 'Title & Badges' },
                { icon: '✨', label: 'Features' },
                { icon: '🚀', label: 'Installation' },
                { icon: '💻', label: 'Usage' },
                { icon: '📁', label: 'Structure' },
                { icon: '⚙️', label: 'Config' },
              ].map(({ icon, label }) => (
                <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: 0.5 }}>
                  <span style={{ fontSize: 24 }}>{icon}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: ACCENT + '66', letterSpacing: '0.06em' }}>{label.toUpperCase()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── LOADING ── */}
        {loading && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <div style={{ width: 40, height: 40, border: `3px solid ${ACCENT}22`, borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, color: ACCENT + '88', letterSpacing: '0.12em', animation: 'pulse 2s ease-in-out infinite' }}>
              ANALYZING REPOSITORY…
            </div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#7d8590' }}>
              Scanning files, detecting stack, generating README sections
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
