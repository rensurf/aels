import { useState } from 'react'
import type { Phrase, Verb } from '../types'
import { getStrengthColor, today } from '../utils'

type CardState = 'front' | 'back'

interface Props {
  phrases: Phrase[]
  verbs: Verb[]
}

export function VariantC({ phrases, verbs }: Props) {
  const NOW = today()
  const due = phrases.filter(p => p.dueDate <= NOW)
  const [queue, setQueue] = useState<Phrase[]>(due)
  const [cardState, setCardState] = useState<CardState>('front')
  const [results, setResults] = useState<{ id: string; correct: boolean }[]>([])

  const current = queue[0]
  const done = results.length
  const total = due.length

  // Verb of the day: verb with most due phrases, or first verb
  const verbOfDay = verbs.find(v =>
    due.some(p => p.verbId === v.id)
  ) ?? verbs[0]
  const verbOfDayPhrases = verbOfDay ? phrases.filter(p => p.verbId === verbOfDay.id) : []

  function handleResult(correct: boolean) {
    if (!current) return
    setResults(r => [...r, { id: current.id, correct }])
    setQueue(q => q.slice(1))
    setCardState('front')
  }

  const allDone = queue.length === 0 && done > 0

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
      fontFamily: 'system-ui, sans-serif',
      color: '#e2e8f0',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Today's Session</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Good morning, Ren</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#ef4444' }}>{due.length} due</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>phrases today</div>
        </div>
      </div>

      {/* Progress */}
      <div style={{ padding: '0 24px', marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 6 }}>
          <span>{done} done</span>
          <span>{queue.length} remaining</span>
        </div>
        <div style={{ height: 6, background: '#1e293b', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
            borderRadius: 999,
            width: `${total ? (done / total) * 100 : 0}%`,
            transition: 'width 0.4s ease',
          }} />
        </div>
      </div>

      {/* Card area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 24px' }}>
        {allDone ? (
          <CompletionView results={results} />
        ) : current ? (
          <>
            <div
              onClick={cardState === 'front' ? () => setCardState('back') : undefined}
              style={{
                width: '100%',
                maxWidth: 480,
                minHeight: 240,
                background: cardState === 'front' ? '#1e293b' : '#312e81',
                borderRadius: 20,
                padding: 32,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                cursor: cardState === 'front' ? 'pointer' : 'default',
                border: cardState === 'front' ? '1px solid #334155' : '1px solid #4338ca',
                transition: 'background 0.3s, border 0.3s',
                boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
              }}
            >
              {cardState === 'front' ? (
                <>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16, display: 'flex', gap: 8 }}>
                    {current.pattern && (
                      <span style={{ padding: '2px 8px', background: '#6366f111', border: '1px solid #6366f133', borderRadius: 999, color: '#818cf8' }}>
                        {current.pattern}
                      </span>
                    )}
                    <span style={{ padding: '2px 8px', background: '#0f172a', border: '1px solid #334155', borderRadius: 999 }}>
                      {current.verbId}
                    </span>
                  </div>
                  <div style={{ fontSize: 22, color: '#f1f5f9', lineHeight: 1.5, marginBottom: 24 }}>
                    {current.japanese}
                  </div>
                  <div style={{ fontSize: 13, color: '#475569', textAlign: 'center' }}>
                    タップして英語を確認 →
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: '#818cf8', marginBottom: 12 }}>English</div>
                  <div style={{ fontSize: 20, color: '#e0e7ff', lineHeight: 1.6, marginBottom: 16 }}>
                    {current.text}
                  </div>
                  {current.note && (
                    <div style={{ fontSize: 13, color: '#6366f1', background: '#1e1b4b', padding: '10px 14px', borderRadius: 8, lineHeight: 1.6 }}>
                      {current.note}
                    </div>
                  )}
                </>
              )}
            </div>

            {cardState === 'back' && (
              <div style={{ display: 'flex', gap: 12, marginTop: 24, width: '100%', maxWidth: 480 }}>
                <button onClick={() => handleResult(false)} style={{
                  flex: 1, padding: 16, borderRadius: 12,
                  background: '#7f1d1d22', border: '1px solid #7f1d1d66',
                  color: '#fca5a5', fontSize: 16, fontWeight: 600, cursor: 'pointer',
                }}>✗ もう一度</button>
                <button onClick={() => handleResult(true)} style={{
                  flex: 1, padding: 16, borderRadius: 12,
                  background: '#14532d22', border: '1px solid #14532d66',
                  color: '#86efac', fontSize: 16, fontWeight: 600, cursor: 'pointer',
                }}>✓ 覚えた</button>
              </div>
            )}

            {queue.length > 1 && cardState === 'front' && (
              <div style={{ marginTop: 24, width: '100%', maxWidth: 480 }}>
                <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>Next up</div>
                {queue.slice(1, 3).map((p, i) => (
                  <div key={p.id} style={{
                    padding: '10px 14px', background: '#1e293b', borderRadius: 8, marginBottom: 6,
                    fontSize: 13, color: '#64748b', opacity: 1 - i * 0.3,
                  }}>
                    {p.japanese}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{ color: '#475569', marginTop: 40 }}>No phrases due today! 🎉</div>
        )}
      </div>

      {/* Verb of the day */}
      {verbOfDay && (
        <div style={{ padding: 24, borderTop: '1px solid #1e293b', marginTop: 16 }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Verb focus — <strong style={{ color: '#818cf8' }}>{verbOfDay.base}</strong>
          </div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {verbOfDayPhrases.map(p => (
              <div key={p.id} style={{
                flexShrink: 0, background: '#1e293b', borderRadius: 8, padding: '10px 14px', maxWidth: 220, border: '1px solid #334155',
              }}>
                <div style={{ fontSize: 13, color: '#c7d2fe', marginBottom: 4 }}>{p.text}</div>
                <div style={{ fontSize: 11, color: '#475569' }}>{p.japanese.slice(0, 24)}{p.japanese.length > 24 ? '…' : ''}</div>
                <div style={{ marginTop: 6, width: 48, height: 3, background: '#0f172a', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${((p.easeFactor - 1.3) / 1.2) * 100}%`, height: '100%', background: getStrengthColor(p.easeFactor) }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CompletionView({ results }: { results: { id: string; correct: boolean }[] }) {
  const correct = results.filter(r => r.correct).length
  const pct = Math.round((correct / results.length) * 100)
  return (
    <div style={{ textAlign: 'center', marginTop: 40 }}>
      <div style={{ fontSize: 60 }}>🎉</div>
      <div style={{ fontSize: 28, fontWeight: 800, marginTop: 16, color: '#f1f5f9' }}>Session complete!</div>
      <div style={{ fontSize: 16, color: '#94a3b8', marginTop: 8 }}>{correct}/{results.length} correct · {pct}%</div>
    </div>
  )
}
