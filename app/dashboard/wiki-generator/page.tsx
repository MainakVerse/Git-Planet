'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { WikiReport, WikiPage } from '@/app/api/github/wiki/route'

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

// ── Helpers ────────────────────────────────────────────────────────────────────

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function countLines(text: string): number {
  return text.split('\n').length
}

// ── Minimal markdown renderer ──────────────────────────────────────────────────

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
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      nodes.push(
        <pre key={key()} style={{
          background: 'rgba(0,0,0,0.5)',
          border: '1px solid rgba(0,229,255,0.12)',
          borderRadius: 6,
          padding: '12px 16px',
          overflow: 'auto',
          margin: '10px 0',
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 11,
          color: '#e6edf3',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}>
          {lang && (
            <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 7, color: ACCENT + '66', display: 'block', marginBottom: 6, letterSpacing: '0.1em' }}>
              {lang.toUpperCase()}
            </span>
          )}
          {codeLines.join('\n')}
        </pre>
      )
      i++
      continue
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      nodes.push(<hr key={key()} style={{ border: 'none', borderTop: '1px solid rgba(0,229,255,0.08)', margin: '16px 0' }} />)
      i++; continue
    }

    // H1
    if (line.startsWith('# ')) {
      nodes.push(
        <h1 key={key()} style={{ fontFamily: "'Orbitron',monospace", fontSize: 18, fontWeight: 700, color: ACCENT, letterSpacing: '0.08em', margin: '8px 0 14px', textShadow: `0 0 20px ${ACCENT}44` }}>
          {inlineRender(line.slice(2))}
        </h1>
      )
      i++; continue
    }

    // H2
    if (line.startsWith('## ')) {
      nodes.push(
        <h2 key={key()} style={{ fontFamily: "'Orbitron',monospace", fontSize: 13, fontWeight: 700, color: ACCENT + 'cc', letterSpacing: '0.06em', margin: '18px 0 8px', paddingBottom: 5, borderBottom: `1px solid ${ACCENT}18` }}>
          {inlineRender(line.slice(3))}
        </h2>
      )
      i++; continue
    }

    // H3
    if (line.startsWith('### ')) {
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
          borderLeft: `3px solid ${ACCENT}55`,
          margin: '10px 0',
          padding: '8px 14px',
          background: `${ACCENT}06`,
          borderRadius: '0 4px 4px 0',
          fontFamily: "'Space Grotesk',sans-serif",
          fontSize: 12,
          color: '#c9d1d9',
          fontStyle: 'italic',
        }}>
          {inlineRender(line.slice(2))}
        </blockquote>
      )
      i++; continue
    }

    // Table
    if (line.startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
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
                    <th key={hi} style={{
                      fontFamily: "'Orbitron',monospace",
                      fontSize: 7,
                      fontWeight: 600,
                      letterSpacing: '0.1em',
                      color: ACCENT + '88',
                      padding: '7px 12px',
                      textAlign: 'left',
                      borderBottom: `1px solid ${ACCENT}20`,
                      whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, ri) => (
                  <tr key={ri} style={{ borderBottom: '1px solid rgba(0,229,255,0.04)' }}>
                    {parseRow(row).map((cell, ci) => (
                      <td key={ci} style={{
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: 10,
                        color: '#c9d1d9',
                        padding: '6px 12px',
                        verticalAlign: 'top',
                      }}>
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

    // List item
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
        <ol key={key()} style={{ margin: '6px 0', paddingLeft: 20 }}>
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
    if (!line.trim()) {
      nodes.push(<div key={key()} style={{ height: 6 }} />)
      i++; continue
    }

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

function inlineRender(text: string): React.ReactNode {
  // Split by inline code, bold, italic, links
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g)
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} style={{
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 10,
          color: ACCENT,
          background: ACCENT + '12',
          padding: '1px 5px',
          borderRadius: 3,
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
        <a key={i} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" style={{ color: ACCENT, textDecoration: 'underline', textDecorationColor: ACCENT + '44' }}>
          {linkMatch[1]}
        </a>
      )
    }
    return part
  })
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, color, icon }: {
  label: string; value: string | number; sub?: string; color: string; icon: string
}) {
  return (
    <div style={{
      background: 'rgba(13,17,23,0.9)',
      border: `1px solid ${color}33`,
      borderRadius: 8,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      flex: 1,
      minWidth: 130,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 13 }}>{icon}</span>
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 7.5, letterSpacing: '0.12em', color, fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 24, fontWeight: 700, color, lineHeight: 1, textShadow: `0 0 16px ${color}55` }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(201,209,217,0.4)', letterSpacing: '0.04em' }}>
          {sub}
        </div>
      )}
    </div>
  )
}

function PageTab({ page, active, onClick }: { page: WikiPage; active: boolean; onClick: () => void }) {
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
        borderRadius: 6,
        padding: '9px 12px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        transition: 'all 0.15s',
        textAlign: 'left',
      }}
    >
      <span style={{ fontSize: 14 }}>{page.icon}</span>
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: active ? ACCENT : hov ? '#c9d1d9' : '#7d8590', transition: 'color 0.15s' }}>
        {page.title}
      </span>
      {active && (
        <span style={{ marginLeft: 'auto', width: 5, height: 5, borderRadius: '50%', background: ACCENT, flexShrink: 0 }} />
      )}
    </button>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function WikiGeneratorPage() {
  const router = useRouter()

  const [user, setUser] = useState<GithubUser | null>(null)
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [selectedRepo, setSelectedRepo] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<WikiReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activePage, setActivePage] = useState(0)
  const [viewMode, setViewMode] = useState<'preview' | 'raw'>('preview')
  const [repoOpen, setRepoOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [downloadingZip, setDownloadingZip] = useState(false)

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

  async function generateWiki() {
    if (!selectedRepo || !user) return
    setLoading(true)
    setReport(null)
    setError(null)
    try {
      const res = await fetch(
        `/api/github/wiki?owner=${user.login}&repo=${selectedRepo}`,
        { credentials: 'include' }
      )
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Generation failed'); return }
      setReport(data)
      setActivePage(0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  function copyCurrentPage() {
    if (!report) return
    const page = report.pages[activePage]
    navigator.clipboard.writeText(page.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function downloadPage(page: WikiPage) {
    const blob = new Blob([page.content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${page.slug}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  function downloadAllPages() {
    if (!report) return
    setDownloadingZip(true)
    // Download each page sequentially as individual .md files
    report.pages.forEach((page, idx) => {
      setTimeout(() => downloadPage(page), idx * 100)
    })
    setTimeout(() => setDownloadingZip(false), report.pages.length * 100 + 200)
  }

  const currentPage = report?.pages[activePage]
  const totalWords = report ? report.pages.reduce((s, p) => s + countWords(p.content), 0) : 0
  const totalLines = report ? report.pages.reduce((s, p) => s + countLines(p.content), 0) : 0

  return (
    <div style={{
      height: '100vh',
      overflow: 'hidden',
      background: '#050505',
      color: '#c9d1d9',
      fontFamily: "'JetBrains Mono',monospace",
      display: 'flex',
      flexDirection: 'column',
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
        ::-webkit-scrollbar { width: 5px; height: 5px }
        ::-webkit-scrollbar-track { background: transparent }
        ::-webkit-scrollbar-thumb { background: rgba(0,229,255,0.15); border-radius: 3px }
        ::-webkit-scrollbar-thumb:hover { background: rgba(0,229,255,0.3) }
      `}</style>

      {/* ── TOPBAR ── */}
      <div style={{
        height: 48,
        borderBottom: '1px solid rgba(0,229,255,0.08)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 12,
        background: 'rgba(13,17,23,0.95)',
        flexShrink: 0,
      }}>
        <button
          onClick={() => router.push('/dashboard')}
          style={{
            background: 'transparent',
            border: '1px solid rgba(0,229,255,0.15)',
            borderRadius: 5,
            padding: '4px 10px',
            cursor: 'pointer',
            color: 'rgba(0,229,255,0.6)',
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: 10,
            display: 'flex', alignItems: 'center', gap: 5,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { const el = e.currentTarget as HTMLButtonElement; el.style.borderColor = `${ACCENT}55`; el.style.color = ACCENT }}
          onMouseLeave={e => { const el = e.currentTarget as HTMLButtonElement; el.style.borderColor = 'rgba(0,229,255,0.15)'; el.style.color = 'rgba(0,229,255,0.6)' }}
        >
          ← BACK
        </button>

        <div style={{ width: 1, height: 20, background: 'rgba(0,229,255,0.1)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>📚</span>
          <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: ACCENT }}>
            WIKI GENERATOR
          </span>
        </div>

        {report && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', marginRight: user ? 16 : 'auto' }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(0,229,255,0.4)' }}>
              {report.pages.length} pages · {totalWords.toLocaleString()} words
            </span>
            <button
              onClick={downloadAllPages}
              disabled={downloadingZip}
              style={{
                background: `${PURPLE}18`,
                border: `1px solid ${PURPLE}44`,
                borderRadius: 5,
                padding: '4px 10px',
                cursor: downloadingZip ? 'not-allowed' : 'pointer',
                color: PURPLE,
                fontFamily: "'Orbitron',monospace",
                fontSize: 8,
                letterSpacing: '0.08em',
                display: 'flex', alignItems: 'center', gap: 5,
                transition: 'all 0.15s',
                opacity: downloadingZip ? 0.5 : 1,
              }}
            >
              ↓ DOWNLOAD ALL
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
          background: 'rgba(13,17,23,0.8)',
          border: `1px solid ${ACCENT}18`,
          borderRadius: 10,
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
          flexShrink: 0,
        }}>
          {/* Repo selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, letterSpacing: '0.12em', color: 'rgba(0,229,255,0.4)' }}>
              REPOSITORY
            </span>
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setRepoOpen(o => !o)}
                style={{
                  background: 'rgba(0,0,0,0.4)',
                  border: `1px solid ${repoOpen ? ACCENT + '55' : 'rgba(0,229,255,0.15)'}`,
                  borderRadius: 6,
                  padding: '7px 12px',
                  cursor: 'pointer',
                  color: selectedRepo ? '#e6edf3' : '#7d8590',
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: 11,
                  minWidth: 220,
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  transition: 'border-color 0.15s',
                }}
              >
                {selectedRepo || 'Select a repository…'}
                <span style={{ color: ACCENT + '66', fontSize: 9 }}>{repoOpen ? '▲' : '▼'}</span>
              </button>
              {repoOpen && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  zIndex: 100,
                  background: 'rgba(13,17,23,0.98)',
                  border: `1px solid ${ACCENT}30`,
                  borderRadius: 6,
                  marginTop: 4,
                  maxHeight: 240,
                  overflowY: 'auto',
                  minWidth: 220,
                  boxShadow: `0 8px 32px rgba(0,0,0,0.6)`,
                }}>
                  {repos.map(r => (
                    <button
                      key={r.id}
                      onClick={() => { setSelectedRepo(r.name); setRepoOpen(false) }}
                      style={{
                        width: '100%',
                        background: r.name === selectedRepo ? `${ACCENT}12` : 'transparent',
                        border: 'none',
                        padding: '8px 12px',
                        cursor: 'pointer',
                        color: r.name === selectedRepo ? ACCENT : '#c9d1d9',
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: 10,
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { if (r.name !== selectedRepo) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,229,255,0.06)' }}
                      onMouseLeave={e => { if (r.name !== selectedRepo) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                    >
                      <span>{r.name}</span>
                      {r.language && (
                        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 7, color: ACCENT + '55', background: ACCENT + '10', padding: '1px 5px', borderRadius: 3 }}>
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
            onClick={generateWiki}
            disabled={!selectedRepo || loading}
            style={{
              background: selectedRepo && !loading ? `linear-gradient(135deg, ${ACCENT}20, ${PURPLE}20)` : 'rgba(255,255,255,0.04)',
              border: `1px solid ${selectedRepo && !loading ? ACCENT + '55' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 7,
              padding: '9px 20px',
              cursor: selectedRepo && !loading ? 'pointer' : 'not-allowed',
              color: selectedRepo && !loading ? ACCENT : '#7d8590',
              fontFamily: "'Orbitron',monospace",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.1em',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.2s',
            }}
          >
            {loading ? (
              <>
                <span style={{ width: 12, height: 12, border: `2px solid ${ACCENT}33`, borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                GENERATING…
              </>
            ) : (
              <>📚 GENERATE WIKI</>
            )}
          </button>

          {/* Meta info */}
          {report && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 7, color: 'rgba(0,229,255,0.4)', letterSpacing: '0.1em' }}>FILES ANALYZED</span>
                <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 16, fontWeight: 700, color: SUCCESS }}>{report.meta.filesAnalyzed}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 7, color: 'rgba(0,229,255,0.4)', letterSpacing: '0.1em' }}>TOTAL FILES</span>
                <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 16, fontWeight: 700, color: ACCENT }}>{report.meta.totalFiles}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 7, color: 'rgba(0,229,255,0.4)', letterSpacing: '0.1em' }}>WIKI LINES</span>
                <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 16, fontWeight: 700, color: PURPLE }}>{totalLines.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>

        {/* ── GENERATION ERROR ── */}
        {error && (
          <div style={{
            background: `${DANGER}10`,
            border: `1px solid ${DANGER}33`,
            borderRadius: 8,
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 14 }}>⚠️</span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: DANGER }}>{error}</span>
          </div>
        )}

        {/* ── LOADING ── */}
        {loading && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <div style={{
              width: 60,
              height: 60,
              border: `3px solid ${ACCENT}20`,
              borderTopColor: ACCENT,
              borderRadius: '50%',
              animation: 'spin 0.9s linear infinite',
            }} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 12, color: ACCENT, letterSpacing: '0.12em', animation: 'pulse 2s ease-in-out infinite' }}>
                GENERATING WIKI
              </span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#7d8590' }}>
                Analyzing repository structure and source files…
              </span>
            </div>
            <div style={{ display: 'flex', gap: 24, marginTop: 8 }}>
              {['📁 File tree', '🔍 Source files', '🔌 API routes', '📝 Config files'].map(s => (
                <span key={s} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(0,229,255,0.35)', animation: 'pulse 2s ease-in-out infinite' }}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── RESULTS ── */}
        {report && !loading && (
          <div style={{ flex: 1, display: 'flex', gap: 16, overflow: 'hidden', minHeight: 0 }}>

            {/* Left sidebar: page tabs */}
            <div style={{
              width: 200,
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              overflow: 'auto',
            }}>
              <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 7, letterSpacing: '0.12em', color: 'rgba(0,229,255,0.35)', marginBottom: 4, paddingLeft: 4 }}>
                WIKI PAGES
              </div>
              {report.pages.map((page, idx) => (
                <PageTab key={page.slug} page={page} active={idx === activePage} onClick={() => setActivePage(idx)} />
              ))}

              {/* Repo info */}
              <div style={{
                marginTop: 12,
                background: 'rgba(13,17,23,0.8)',
                border: '1px solid rgba(0,229,255,0.08)',
                borderRadius: 6,
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}>
                <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 7, letterSpacing: '0.1em', color: ACCENT + '55' }}>REPOSITORY</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#e6edf3', wordBreak: 'break-all' }}>
                  {report.owner}/{report.repoName}
                </span>
                {report.language && (
                  <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 7, color: PURPLE, background: PURPLE + '15', padding: '2px 6px', borderRadius: 3, alignSelf: 'flex-start' }}>
                    {report.language}
                  </span>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590' }}>⭐ {report.stars}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590' }}>🍴 {report.forks}</span>
                </div>
              </div>
            </div>

            {/* Main content area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

              {/* Page header */}
              <div style={{
                background: 'rgba(13,17,23,0.8)',
                border: `1px solid ${ACCENT}15`,
                borderRadius: '8px 8px 0 0',
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexShrink: 0,
              }}>
                <span style={{ fontSize: 16 }}>{currentPage?.icon}</span>
                <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, fontWeight: 700, color: ACCENT, letterSpacing: '0.08em' }}>
                  {currentPage?.title}
                </span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590' }}>
                  {currentPage ? countWords(currentPage.content) : 0} words · {currentPage ? countLines(currentPage.content) : 0} lines
                </span>

                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  {/* View mode toggle */}
                  <div style={{ display: 'flex', gap: 2, background: 'rgba(0,0,0,0.3)', borderRadius: 5, padding: 2 }}>
                    {(['preview', 'raw'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => setViewMode(mode)}
                        style={{
                          background: viewMode === mode ? `${ACCENT}20` : 'transparent',
                          border: `1px solid ${viewMode === mode ? ACCENT + '44' : 'transparent'}`,
                          borderRadius: 3,
                          padding: '3px 8px',
                          cursor: 'pointer',
                          color: viewMode === mode ? ACCENT : '#7d8590',
                          fontFamily: "'Orbitron',monospace",
                          fontSize: 7,
                          letterSpacing: '0.08em',
                          transition: 'all 0.15s',
                        }}
                      >
                        {mode === 'preview' ? '👁 PREVIEW' : '</> RAW'}
                      </button>
                    ))}
                  </div>

                  {/* Copy button */}
                  <button
                    onClick={copyCurrentPage}
                    style={{
                      background: copied ? `${SUCCESS}20` : `${ACCENT}10`,
                      border: `1px solid ${copied ? SUCCESS + '44' : ACCENT + '30'}`,
                      borderRadius: 5,
                      padding: '3px 10px',
                      cursor: 'pointer',
                      color: copied ? SUCCESS : ACCENT,
                      fontFamily: "'Orbitron',monospace",
                      fontSize: 7,
                      letterSpacing: '0.08em',
                      transition: 'all 0.15s',
                    }}
                  >
                    {copied ? '✓ COPIED' : '⎘ COPY'}
                  </button>

                  {/* Download button */}
                  <button
                    onClick={() => currentPage && downloadPage(currentPage)}
                    style={{
                      background: `${PURPLE}10`,
                      border: `1px solid ${PURPLE}30`,
                      borderRadius: 5,
                      padding: '3px 10px',
                      cursor: 'pointer',
                      color: PURPLE,
                      fontFamily: "'Orbitron',monospace",
                      fontSize: 7,
                      letterSpacing: '0.08em',
                      transition: 'all 0.15s',
                    }}
                  >
                    ↓ .MD
                  </button>
                </div>
              </div>

              {/* Content */}
              <div style={{
                flex: 1,
                overflow: 'auto',
                background: 'rgba(8,12,18,0.9)',
                border: `1px solid ${ACCENT}10`,
                borderTop: 'none',
                borderRadius: '0 0 8px 8px',
                padding: viewMode === 'preview' ? '20px 28px' : '16px',
              }}>
                {viewMode === 'raw' ? (
                  <pre style={{
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: 11,
                    color: '#c9d1d9',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    lineHeight: 1.6,
                    margin: 0,
                  }}>
                    {currentPage?.content}
                  </pre>
                ) : (
                  <div style={{ maxWidth: 820 }}>
                    {currentPage && renderMarkdown(currentPage.content)}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── EMPTY STATE ── */}
        {!report && !loading && !error && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            <div style={{ fontSize: 48, opacity: 0.3 }}>📚</div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 13, color: 'rgba(0,229,255,0.4)', letterSpacing: '0.12em' }}>
                WIKI GENERATOR
              </span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#7d8590', textAlign: 'center', maxWidth: 420 }}>
                Select a repository and click Generate Wiki to create GitHub-ready Markdown documentation.
              </span>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 560 }}>
              {[
                { icon: '🏠', label: 'Home', desc: 'Project overview & quick links' },
                { icon: '🏗️', label: 'Architecture', desc: 'Tech stack & directory layout' },
                { icon: '📦', label: 'Modules', desc: 'Per-module documentation' },
                { icon: '🔌', label: 'API Endpoints', desc: 'Detected routes & methods' },
                { icon: '⚙️', label: 'Workflows', desc: 'Auth, data flows & CI/CD' },
                { icon: '🚀', label: 'Setup Guide', desc: 'Install & run instructions' },
                { icon: '📋', label: 'Guidelines', desc: 'Contribution & code style' },
              ].map(item => (
                <div key={item.label} style={{
                  background: 'rgba(13,17,23,0.8)',
                  border: '1px solid rgba(0,229,255,0.08)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  minWidth: 200,
                }}>
                  <span style={{ fontSize: 16 }}>{item.icon}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 8, color: ACCENT, letterSpacing: '0.08em' }}>{item.label}</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#7d8590' }}>{item.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── FOOTER ── */}
      <div style={{
        height: 32,
        borderTop: '1px solid rgba(0,229,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 12,
        flexShrink: 0,
      }}>
        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 7, letterSpacing: '0.1em', color: 'rgba(0,229,255,0.2)' }}>
          GIT PLANET / WIKI GENERATOR
        </span>
        {report && (
          <>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(0,229,255,0.2)' }} />
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(0,229,255,0.3)' }}>
              {report.pages.length} pages generated · {totalWords.toLocaleString()} words · ready for GitHub Wiki
            </span>
          </>
        )}
      </div>
    </div>
  )
}
