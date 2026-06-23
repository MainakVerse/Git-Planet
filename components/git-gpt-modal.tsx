'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, ChevronDown, Loader2, MessageSquare, Plus, SendHorizontal, X } from 'lucide-react'
import { GIT_GPT_FEATURES, normalizeCommandToken } from '@/lib/git-gpt-features'

interface GithubUser {
  login: string
  name: string | null
  avatar_url: string
}

interface GithubRepo {
  id: number
  name: string
  full_name?: string
  language: string | null
  updated_at: string
  fork: boolean
}

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  tool?: {
    slug: string
    label: string
    target: string
  }
}

function renderInline(text: string) {
  const parts = text.split(/(`[^`]+`)/)
  return parts.map((part, index) => (
    part.startsWith('`') && part.endsWith('`') && part.length > 2
      ? <code key={index} style={styles.inlineCode}>{part.slice(1, -1)}</code>
      : <span key={index}>{part}</span>
  ))
}

function ChatText({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {lines.map((line, index) => {
        const trimmed = line.trim()
        if (!trimmed) return <div key={index} style={{ height: 2 }} />
        if (/^```/.test(trimmed)) return null
        if (/^#{1,3}\s/.test(trimmed)) {
          return <div key={index} style={styles.messageHeading}>{renderInline(trimmed.replace(/^#{1,3}\s/, ''))}</div>
        }
        if (/^[-*]\s/.test(trimmed)) {
          return (
            <div key={index} style={styles.bulletLine}>
              <span style={styles.bulletDot} />
              <span>{renderInline(trimmed.replace(/^[-*]\s/, ''))}</span>
            </div>
          )
        }
        if (/^\d+\.\s/.test(trimmed)) {
          return <div key={index} style={styles.paragraph}>{renderInline(trimmed)}</div>
        }
        return <p key={index} style={styles.paragraph}>{renderInline(trimmed)}</p>
      })}
    </div>
  )
}

export function GitGptModal({ user, repos }: { user: GithubUser; repos: GithubRepo[] }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(repos.find((repo) => !repo.fork)?.id ?? repos[0]?.id ?? null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const selectedRepo = useMemo(
    () => repos.find((repo) => repo.id === selectedRepoId) ?? repos.find((repo) => !repo.fork) ?? repos[0] ?? null,
    [repos, selectedRepoId],
  )

  const commandToken = useMemo(() => {
    const match = input.match(/(?:^|\s)\/([^\s]*)$/)
    return match?.[1] ?? null
  }, [input])

  const commandMatches = useMemo(() => {
    if (commandToken === null) return []
    const needle = normalizeCommandToken(commandToken)
    return GIT_GPT_FEATURES
      .filter((feature) => {
        if (!needle) return true
        const haystack = [feature.slug, feature.label, feature.group, ...feature.aliases].map(normalizeCommandToken).join(' ')
        return haystack.includes(needle)
      })
      .slice(0, 8)
  }, [commandToken])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60)
  }, [open])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage(text = input) {
    const message = text.trim()
    if (!message || loading) return

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', text: message }]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/git-gpt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          history: nextMessages.map((item) => ({ role: item.role, content: item.text })),
          context: {
            login: user.login,
            repo: selectedRepo ? {
              owner: user.login,
              name: selectedRepo.name,
              fullName: selectedRepo.full_name ?? `${user.login}/${selectedRepo.name}`,
              language: selectedRepo.language,
            } : null,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Git GPT request failed.')
      setMessages((current) => [...current, {
        role: 'assistant',
        text: data.reply ?? 'No response.',
        tool: data.tool,
      }])
    } catch (error) {
      setMessages((current) => [...current, {
        role: 'assistant',
        text: error instanceof Error ? error.message : 'Network error.',
      }])
    } finally {
      setLoading(false)
    }
  }

  function insertCommand(slug: string) {
    setInput((current) => {
      if (/(?:^|\s)\/[^\s]*$/.test(current)) {
        return current.replace(/(?:^|\s)\/[^\s]*$/, (match) => `${match.startsWith(' ') ? ' ' : ''}/${slug} `)
      }
      return `${current}${current && !current.endsWith(' ') ? ' ' : ''}/${slug} `
    })
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Open Git GPT"
        aria-label="Open Git GPT"
        style={styles.navButton}
      >
        <Bot size={15} strokeWidth={1.8} />
      </button>

      {open && (
        <div style={styles.overlay} role="dialog" aria-modal="true" aria-label="Git GPT">
          <div style={styles.modal}>
            <aside style={styles.sidebar}>
              <div style={styles.sidebarTop}>
                <div style={styles.sidebarBrand}>
                  <div style={styles.brandIcon}><Bot size={17} /></div>
                  <span>Git GPT</span>
                </div>
                <button
                  onClick={() => setMessages([])}
                  style={styles.newChatButton}
                  title="New chat"
                  aria-label="New chat"
                >
                  <Plus size={15} />
                </button>
              </div>

              <div style={styles.commandList}>
                {GIT_GPT_FEATURES.map((feature) => (
                  <button key={feature.slug} onClick={() => insertCommand(feature.slug)} style={styles.commandItem}>
                    <span style={styles.commandSlug}>/{feature.slug}</span>
                    <span style={styles.commandLabel}>{feature.label}</span>
                  </button>
                ))}
              </div>
            </aside>

            <section style={styles.chatPanel}>
              <header style={styles.chatHeader}>
                <div style={styles.headerTitle}>
                  <MessageSquare size={18} />
                  <span>Git GPT</span>
                </div>
                <label style={styles.repoSelectShell}>
                  <select
                    value={selectedRepo?.id ?? ''}
                    onChange={(event) => setSelectedRepoId(Number(event.target.value))}
                    style={styles.repoSelect}
                  >
                    {repos.map((repo) => (
                      <option key={repo.id} value={repo.id}>{repo.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} style={styles.selectIcon} />
                </label>
                <button onClick={() => setOpen(false)} style={styles.closeButton} title="Close" aria-label="Close">
                  <X size={18} />
                </button>
              </header>

              <div ref={scrollRef} style={styles.messages}>
                {messages.length === 0 && (
                  <div style={styles.emptyState}>
                    <div style={styles.emptyMark}><Bot size={34} /></div>
                    <h2 style={styles.emptyTitle}>Git GPT</h2>
                  </div>
                )}

                {messages.map((message, index) => (
                  <div key={`${message.role}-${index}`} style={message.role === 'user' ? styles.userRow : styles.assistantRow}>
                    {message.role === 'assistant' && <div style={styles.assistantAvatar}><Bot size={16} /></div>}
                    <div style={message.role === 'user' ? styles.userBubble : styles.assistantBubble}>
                      {message.tool && (
                        <div style={styles.toolPill}>{message.tool.label} | {message.tool.target}</div>
                      )}
                      {message.role === 'assistant' ? <ChatText text={message.text} /> : message.text}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div style={styles.assistantRow}>
                    <div style={styles.assistantAvatar}><Bot size={16} /></div>
                    <div style={styles.loadingBubble}>
                      <Loader2 size={16} style={{ animation: 'gitGptSpin 0.9s linear infinite' }} />
                      <span>Thinking</span>
                    </div>
                  </div>
                )}
              </div>

              <div style={styles.inputDock}>
                {commandMatches.length > 0 && (
                  <div style={styles.commandPicker}>
                    {commandMatches.map((feature) => (
                      <button key={feature.slug} onClick={() => insertCommand(feature.slug)} style={styles.commandPickItem}>
                        <span style={styles.commandPickSlash}>/{feature.slug}</span>
                        <span style={styles.commandPickName}>{feature.label}</span>
                        <span style={styles.commandPickScope}>{feature.scope}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div style={styles.inputShell}>
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        sendMessage()
                      }
                    }}
                    placeholder="Message Git GPT or type /"
                    rows={1}
                    disabled={loading}
                    style={styles.textarea}
                  />
                  <button
                    onClick={() => sendMessage()}
                    disabled={loading || !input.trim()}
                    style={{
                      ...styles.sendButton,
                      opacity: loading || !input.trim() ? 0.45 : 1,
                      cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                    }}
                    title="Send"
                    aria-label="Send"
                  >
                    <SendHorizontal size={17} />
                  </button>
                </div>
              </div>
            </section>
          </div>
          <style>{`@keyframes gitGptSpin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}
    </>
  )
}

const styles: Record<string, React.CSSProperties> = {
  navButton: {
    width: 30,
    height: 30,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(13,17,23,0.9)',
    border: '1px solid rgba(0,229,255,0.28)',
    borderRadius: 8,
    color: '#e6edf3',
    cursor: 'pointer',
    boxShadow: '0 0 16px rgba(0,229,255,0.08)',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    background: 'rgba(0,0,0,0.62)',
    backdropFilter: 'blur(10px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  modal: {
    width: 'min(1080px, 96vw)',
    height: 'min(760px, 92vh)',
    borderRadius: 12,
    overflow: 'hidden',
    background: '#212121',
    border: '1px solid rgba(255,255,255,0.12)',
    boxShadow: '0 28px 90px rgba(0,0,0,0.62)',
    display: 'grid',
    gridTemplateColumns: '260px 1fr',
    color: '#ececec',
  },
  sidebar: {
    minWidth: 0,
    background: '#171717',
    borderRight: '1px solid rgba(255,255,255,0.08)',
    display: 'flex',
    flexDirection: 'column',
  },
  sidebarTop: {
    height: 56,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px',
    flexShrink: 0,
  },
  sidebarBrand: {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    fontFamily: "'Space Grotesk',sans-serif",
    fontSize: 14,
    fontWeight: 700,
  },
  brandIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    background: '#303030',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newChatButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'transparent',
    color: '#ececec',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  commandList: {
    padding: '6px 8px 12px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  commandItem: {
    minHeight: 42,
    borderRadius: 8,
    border: 0,
    background: 'transparent',
    color: '#ececec',
    cursor: 'pointer',
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: '5px 9px',
  },
  commandSlug: {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 11,
    color: '#f2f2f2',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  commandLabel: {
    fontFamily: "'Space Grotesk',sans-serif",
    fontSize: 11,
    color: '#a9a9a9',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  chatPanel: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    background: '#212121',
  },
  chatHeader: {
    height: 56,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '0 16px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    fontFamily: "'Space Grotesk',sans-serif",
    fontSize: 16,
    fontWeight: 700,
  },
  repoSelectShell: {
    position: 'relative',
    marginLeft: 'auto',
    width: 210,
    height: 34,
  },
  repoSelect: {
    width: '100%',
    height: '100%',
    appearance: 'none',
    border: '1px solid rgba(255,255,255,0.1)',
    background: '#303030',
    borderRadius: 8,
    color: '#ececec',
    padding: '0 32px 0 11px',
    outline: 'none',
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 11,
  },
  selectIcon: {
    position: 'absolute',
    top: 10,
    right: 10,
    pointerEvents: 'none',
    color: '#a9a9a9',
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'transparent',
    color: '#ececec',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  messages: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '30px clamp(20px, 8vw, 96px) 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: 22,
  },
  emptyState: {
    margin: 'auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyMark: {
    width: 58,
    height: 58,
    borderRadius: 16,
    background: '#303030',
    color: '#ececec',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    margin: 0,
    fontFamily: "'Space Grotesk',sans-serif",
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: 0,
  },
  userRow: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  assistantRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
  },
  assistantAvatar: {
    width: 30,
    height: 30,
    borderRadius: '50%',
    background: '#303030',
    color: '#ececec',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  userBubble: {
    maxWidth: '72%',
    padding: '10px 14px',
    borderRadius: 18,
    background: '#303030',
    color: '#f4f4f4',
    fontFamily: "'Space Grotesk',sans-serif",
    fontSize: 14,
    lineHeight: 1.55,
    overflowWrap: 'anywhere',
  },
  assistantBubble: {
    maxWidth: '84%',
    color: '#ececec',
    fontFamily: "'Space Grotesk',sans-serif",
    fontSize: 14,
    lineHeight: 1.62,
    overflowWrap: 'anywhere',
  },
  loadingBubble: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: '#cfcfcf',
    fontFamily: "'Space Grotesk',sans-serif",
    fontSize: 14,
    paddingTop: 4,
  },
  toolPill: {
    display: 'inline-flex',
    alignItems: 'center',
    maxWidth: '100%',
    padding: '4px 8px',
    borderRadius: 999,
    background: 'rgba(255,255,255,0.08)',
    color: '#cfcfcf',
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 10,
    marginBottom: 9,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  inputDock: {
    flexShrink: 0,
    padding: '0 clamp(20px, 8vw, 96px) 22px',
    position: 'relative',
  },
  inputShell: {
    minHeight: 54,
    borderRadius: 18,
    background: '#303030',
    border: '1px solid rgba(255,255,255,0.12)',
    display: 'flex',
    alignItems: 'flex-end',
    gap: 10,
    padding: '8px 8px 8px 16px',
    boxShadow: '0 8px 26px rgba(0,0,0,0.18)',
  },
  textarea: {
    flex: 1,
    height: 34,
    maxHeight: 120,
    resize: 'none',
    border: 0,
    outline: 0,
    background: 'transparent',
    color: '#f4f4f4',
    fontFamily: "'Space Grotesk',sans-serif",
    fontSize: 14,
    lineHeight: '34px',
    padding: 0,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: '50%',
    border: 0,
    background: '#f4f4f4',
    color: '#171717',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  commandPicker: {
    position: 'absolute',
    left: 'clamp(20px, 8vw, 96px)',
    right: 'clamp(20px, 8vw, 96px)',
    bottom: 86,
    maxHeight: 318,
    overflowY: 'auto',
    background: '#2b2b2b',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12,
    boxShadow: '0 18px 40px rgba(0,0,0,0.42)',
    padding: 6,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  commandPickItem: {
    height: 42,
    display: 'grid',
    gridTemplateColumns: '170px 1fr 58px',
    alignItems: 'center',
    gap: 10,
    border: 0,
    borderRadius: 8,
    background: 'transparent',
    color: '#ececec',
    cursor: 'pointer',
    padding: '0 10px',
    textAlign: 'left',
  },
  commandPickSlash: {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 12,
    color: '#f4f4f4',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  commandPickName: {
    fontFamily: "'Space Grotesk',sans-serif",
    fontSize: 13,
    color: '#cfcfcf',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  commandPickScope: {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 10,
    color: '#8f8f8f',
    textAlign: 'right',
  },
  paragraph: {
    margin: 0,
    color: '#ececec',
    fontFamily: "'Space Grotesk',sans-serif",
    fontSize: 14,
    lineHeight: 1.62,
  },
  bulletLine: {
    display: 'flex',
    gap: 9,
    color: '#ececec',
    fontFamily: "'Space Grotesk',sans-serif",
    fontSize: 14,
    lineHeight: 1.55,
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: '#ececec',
    marginTop: 9,
    flexShrink: 0,
  },
  messageHeading: {
    color: '#f4f4f4',
    fontFamily: "'Space Grotesk',sans-serif",
    fontSize: 16,
    fontWeight: 700,
    lineHeight: 1.35,
  },
  inlineCode: {
    fontFamily: "'JetBrains Mono',monospace",
    background: 'rgba(255,255,255,0.08)',
    color: '#f4f4f4',
    borderRadius: 4,
    padding: '1px 5px',
    fontSize: 12,
  },
}
