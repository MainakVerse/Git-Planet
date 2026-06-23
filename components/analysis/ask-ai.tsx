'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { C, FONT } from './shell'

interface ChatMsg { role: 'user' | 'ai'; text: string }

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(`[^`]+`)/)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('`') && p.endsWith('`') && p.length > 2
          ? <code key={i} style={{ fontFamily: FONT.mono, background: 'rgba(0,229,255,0.12)', padding: '1px 4px', borderRadius: 2, color: C.accent, fontSize: 11 }}>{p.slice(1, -1)}</code>
          : <span key={i}>{p}</span>,
      )}
    </>
  )
}

function ChatMarkdown({ text }: { text: string }) {
  const lines = text.split('\n').filter(l => l.trim())
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {lines.map((line, i) => {
        const t = line.trim()
        if (/^#{1,3}\s/.test(t)) return <div key={i} style={{ fontFamily: FONT.orbitron, fontSize: 12, fontWeight: 700, color: C.accent, marginTop: 4 }}>{renderInline(t.replace(/^#{1,3}\s/, ''))}</div>
        if (/^(\d+)\.\s/.test(t)) {
          const num = t.match(/^(\d+)/)?.[1]
          return (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <span style={{ fontFamily: FONT.orbitron, fontSize: 10, color: C.accent, flexShrink: 0, marginTop: 1 }}>{num}.</span>
              <span style={{ fontFamily: FONT.sans, fontSize: 12, color: C.sub, lineHeight: 1.55 }}>{renderInline(t.replace(/^\d+\.\s/, ''))}</span>
            </div>
          )
        }
        if (/^[-•*]\s/.test(t)) {
          return (
            <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
              <span style={{ color: C.accent, flexShrink: 0, marginTop: 3, fontSize: 9 }}>▹</span>
              <span style={{ fontFamily: FONT.sans, fontSize: 12, color: C.sub, lineHeight: 1.55 }}>{renderInline(t.replace(/^[-•*]\s/, ''))}</span>
            </div>
          )
        }
        return <p key={i} style={{ fontFamily: FONT.sans, fontSize: 12, color: C.sub, lineHeight: 1.6, margin: 0 }}>{renderInline(t)}</p>
      })}
    </div>
  )
}

export function AskAI({
  endpoint, payload, accent = C.purple, suggestions = [], title = 'ASK AI', placeholder = 'Ask anything about this repository…', greeting,
}: {
  endpoint: string
  payload: Record<string, unknown>
  accent?: string
  suggestions?: string[]
  title?: string
  placeholder?: string
  greeting?: string
}) {
  const [messages, setMessages] = useState<ChatMsg[]>(greeting ? [{ role: 'ai', text: greeting }] : [])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, loading])

  const send = useCallback(async (text: string) => {
    const msg = text.trim()
    if (!msg || loading) return
    const nextHistory = [...messages, { role: 'user' as const, text: msg }]
    setMessages(nextHistory)
    setInput('')
    setLoading(true)
    try {
      const history = nextHistory.map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text }))
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, message: msg, history }),
      })
      const data = await res.json()
      setMessages(m => [...m, { role: 'ai', text: res.ok ? (data.reply ?? 'No response.') : `⚠ ${data.error ?? 'Request failed.'}` }])
    } catch (e) {
      setMessages(m => [...m, { role: 'ai', text: `⚠ ${e instanceof Error ? e.message : 'Network error.'}` }])
    } finally {
      setLoading(false)
    }
  }, [messages, loading, endpoint, payload])

  return (
    <div style={{ background: 'rgba(13,17,23,0.85)', border: `1px solid ${accent}44`, borderRadius: 12, display: 'flex', flexDirection: 'column', height: 480, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${accent}22`, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 14 }}>✦</span>
        <span style={{ fontFamily: FONT.orbitron, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: accent }}>{title}</span>
        <span style={{ fontFamily: FONT.mono, fontSize: 8, color: C.dim, marginLeft: 'auto' }}>powered by Claude Opus</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && (
          <div style={{ margin: 'auto', textAlign: 'center', opacity: 0.6 }}>
            <div style={{ fontSize: 30, marginBottom: 6 }}>✦</div>
            <div style={{ fontFamily: FONT.mono, fontSize: 10, color: C.dim }}>Ask a question to begin</div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '85%', padding: '9px 12px', borderRadius: 10,
              background: m.role === 'user' ? `${accent}1a` : 'rgba(0,0,0,0.3)',
              border: `1px solid ${m.role === 'user' ? accent + '44' : 'rgba(255,255,255,0.06)'}`,
            }}>
              {m.role === 'user'
                ? <span style={{ fontFamily: FONT.sans, fontSize: 12, color: C.text, lineHeight: 1.5 }}>{m.text}</span>
                : <ChatMarkdown text={m.text} />}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', gap: 4, padding: '4px 2px' }}>
            {[0, 1, 2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: accent, animation: `bounce 1.2s ${i * 0.15}s infinite ease-in-out` }} />)}
            <style>{`@keyframes bounce{0%,80%,100%{opacity:0.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-4px)}}`}</style>
          </div>
        )}
      </div>

      {/* Suggestions */}
      {messages.filter(m => m.role === 'user').length === 0 && suggestions.length > 0 && (
        <div style={{ padding: '0 14px 10px', display: 'flex', flexWrap: 'wrap', gap: 6, flexShrink: 0 }}>
          {suggestions.map(s => (
            <button key={s} onClick={() => send(s)} disabled={loading}
              style={{ fontFamily: FONT.mono, fontSize: 9, padding: '5px 10px', borderRadius: 16, background: `${accent}10`, border: `1px solid ${accent}33`, color: accent, cursor: 'pointer', textAlign: 'left' }}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ padding: 12, borderTop: `1px solid ${accent}22`, display: 'flex', gap: 8, flexShrink: 0 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send(input) }}
          placeholder={placeholder}
          disabled={loading}
          style={{ flex: 1, padding: '9px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.4)', border: `1px solid ${accent}33`, color: C.text, fontFamily: FONT.sans, fontSize: 12, outline: 'none' }}
        />
        <button onClick={() => send(input)} disabled={loading || !input.trim()}
          style={{ padding: '0 16px', borderRadius: 8, background: input.trim() && !loading ? `${accent}1a` : 'transparent', border: `1px solid ${input.trim() && !loading ? accent + '66' : accent + '22'}`, color: accent, cursor: input.trim() && !loading ? 'pointer' : 'not-allowed', fontFamily: FONT.orbitron, fontSize: 10, fontWeight: 600 }}>
          ➤
        </button>
      </div>
    </div>
  )
}
