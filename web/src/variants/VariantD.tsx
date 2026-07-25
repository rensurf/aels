// TODO(Step 5): Replace getMockResponse with real POST /chat API call
import { useState, useRef, useEffect } from 'react'
import type { Phrase } from '../types'
import { getMockResponse, aiPhraseToPhrase } from '../data/mockAI'

interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
  proposedPhrases?: Phrase[]
}

interface Props {
  onPhrasesAdded: (phrases: Phrase[]) => void
}

export function VariantD({ onPhrasesAdded }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'intro',
      role: 'assistant',
      text: 'こんにちは、Ren！\n\n英語で言いたいことがあれば日本語で気軽に聞いてください。気に入ったフレーズを選んで保存できます。\n\n例：「確認しておきます、って英語でなんていう？」',
    },
  ])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [selections, setSelections] = useState<Record<string, Set<string>>>({})
  const [savedMessages, setSavedMessages] = useState<Set<string>>(new Set())
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  async function handleSend() {
    const text = input.trim()
    if (!text) return

    const userMsg: Message = { id: `u${Date.now()}`, role: 'user', text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsTyping(true)

    await new Promise(r => setTimeout(r, 800 + Math.random() * 600))

    const response = getMockResponse(text)
    const proposed = response.phrases.map(aiPhraseToPhrase)
    const msgId = `a${Date.now()}`

    if (proposed.length > 0) {
      setSelections(prev => ({ ...prev, [msgId]: new Set(proposed.map(p => p.id)) }))
    }

    setIsTyping(false)
    setMessages(prev => [...prev, { id: msgId, role: 'assistant', text: response.message, proposedPhrases: proposed.length > 0 ? proposed : undefined }])
  }

  function togglePhrase(msgId: string, phraseId: string) {
    setSelections(prev => {
      const current = new Set(prev[msgId] ?? [])
      if (current.has(phraseId)) current.delete(phraseId)
      else current.add(phraseId)
      return { ...prev, [msgId]: current }
    })
  }

  function handleSavePhrases(msg: Message) {
    const selected = selections[msg.id] ?? new Set()
    const toSave = (msg.proposedPhrases ?? []).filter(p => selected.has(p.id))
    if (!toSave.length) return
    onPhrasesAdded(toSave)
    setSavedMessages(prev => new Set([...prev, msg.id]))
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#fff', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🎓</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>English Teacher</div>
          <div style={{ fontSize: 12, color: '#22c55e' }}>● Online</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {messages.map(msg => (
          <div key={msg.id}>
            <div style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {msg.role === 'assistant' && (
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0, marginRight: 8, marginTop: 4 }}>🎓</div>
              )}
              <div style={{
                maxWidth: '72%', padding: '12px 16px',
                borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                background: msg.role === 'user' ? '#6366f1' : '#f1f5f9',
                color: msg.role === 'user' ? '#fff' : '#1e293b',
                fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap',
              }}>
                <MarkdownText text={msg.text} isUser={msg.role === 'user'} />
              </div>
            </div>

            {msg.proposedPhrases && msg.proposedPhrases.length > 0 && (
              <div style={{ marginLeft: 36, marginTop: 8, maxWidth: '72%' }}>
                {savedMessages.has(msg.id) ? (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#16a34a', fontWeight: 600 }}>
                    ✓ {(msg.proposedPhrases ?? []).filter(p => (selections[msg.id] ?? new Set()).has(p.id)).length}件保存しました
                  </div>
                ) : (
                  <div style={{ background: '#fafafa', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ padding: '10px 14px', fontSize: 12, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>保存するフレーズを選択</div>
                    {msg.proposedPhrases.map(p => {
                      const isChecked = (selections[msg.id] ?? new Set()).has(p.id)
                      return (
                        <div key={p.id} onClick={() => togglePhrase(msg.id, p.id)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: isChecked ? '#f8faff' : '#fff' }}>
                          <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 2, border: `2px solid ${isChecked ? '#6366f1' : '#cbd5e1'}`, background: isChecked ? '#6366f1' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {isChecked && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, color: '#0f172a' }}>{p.text}</div>
                            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{p.japanese}</div>
                          </div>
                          <span style={{ flexShrink: 0, fontSize: 11, padding: '2px 8px', borderRadius: 999, background: p.register === 'formal' ? '#dbeafe' : '#fef9c3', color: p.register === 'formal' ? '#1d4ed8' : '#854d0e', fontWeight: 600 }}>
                            {p.register === 'formal' ? 'Formal' : 'Informal'}
                          </span>
                        </div>
                      )
                    })}
                    <div style={{ padding: '10px 14px' }}>
                      <button
                        onClick={() => handleSavePhrases(msg)}
                        disabled={(selections[msg.id]?.size ?? 0) === 0}
                        style={{ width: '100%', padding: 8, background: (selections[msg.id]?.size ?? 0) > 0 ? '#6366f1' : '#e2e8f0', color: (selections[msg.id]?.size ?? 0) > 0 ? '#fff' : '#94a3b8', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: (selections[msg.id]?.size ?? 0) > 0 ? 'pointer' : 'default' }}
                      >
                        {(selections[msg.id]?.size ?? 0) > 0 ? `${selections[msg.id]?.size}件を保存` : '選択してください'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {isTyping && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🎓</div>
            <div style={{ background: '#f1f5f9', borderRadius: '18px 18px 18px 4px', padding: '12px 16px' }}>
              <TypingDots />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding: '12px 16px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8, background: '#fff' }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="日本語で質問してみよう... (Enter で送信)"
          rows={1}
          style={{ flex: 1, padding: '10px 14px', borderRadius: 12, border: '1px solid #e2e8f0', resize: 'none', fontSize: 14, fontFamily: 'system-ui, sans-serif', outline: 'none', lineHeight: 1.5, color: '#0f172a', background: '#fff' }}
        />
        <button
          onClick={() => void handleSend()}
          disabled={!input.trim() || isTyping}
          style={{ width: 40, height: 40, borderRadius: '50%', background: input.trim() && !isTyping ? '#6366f1' : '#e2e8f0', border: 'none', cursor: input.trim() && !isTyping ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0, alignSelf: 'flex-end', color: '#fff' }}
        >↑</button>
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#94a3b8', animation: `bounce 1.2s infinite ${i * 0.2}s` }} />
      ))}
      <style>{`@keyframes bounce { 0%,60%,100% { transform:translateY(0) } 30% { transform:translateY(-6px) } }`}</style>
    </div>
  )
}

function MarkdownText({ text, isUser }: { text: string; isUser: boolean }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} style={{ color: isUser ? '#fff' : '#0f172a' }}>{part.slice(2, -2)}</strong>
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}
