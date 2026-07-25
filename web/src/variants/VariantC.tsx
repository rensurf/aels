import { useState } from 'react'
import type { Phrase, Verb } from '../types'
import { reviewPhrase } from '../api'
import { getStrengthColor, today } from '../utils'

type CardState = 'front' | 'back'

interface Props {
  phrases: Phrase[]
  verbs: Verb[]
  streak: number
  completedDates: string[]
  onPhraseReviewed: (phrase: Phrase) => void
  onStreakUpdated: (streak: number, completedDates: string[]) => void
}

export function VariantC({ phrases, verbs, streak, completedDates, onPhraseReviewed, onStreakUpdated }: Props) {
  const NOW = today()
  const due = phrases.filter(p => p.dueDate <= NOW)
  const [queue, setQueue] = useState<Phrase[]>(due)
  const [cardState, setCardState] = useState<CardState>('front')
  const [results, setResults] = useState<{ id: string; correct: boolean }[]>([])

  const current = queue[0]
  const done = results.length
  const total = due.length

  const verbOfDay = verbs.find(v => due.some(p => p.verbId === v.id)) ?? verbs[0]
  const verbOfDayPhrases = verbOfDay ? phrases.filter(p => p.verbId === verbOfDay.id) : []

  async function handleResult(correct: boolean) {
    if (!current) return
    setResults(r => [...r, { id: current.id, correct }])
    setQueue(q => q.slice(1))
    setCardState('front')

    try {
      const quality = correct ? 4 : 1
      const result = await reviewPhrase(current.id, quality)
      onPhraseReviewed(result.phrase)
      if (result.streak_updated) {
        const newDate = new Date().toISOString().slice(0, 10)
        const newDates = completedDates.includes(newDate)
          ? completedDates
          : [...completedDates, newDate].sort()
        onStreakUpdated(result.streak, newDates)
      }
    } catch {
      // SM-2 update is best-effort; UI already updated
    }
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
          {streak > 0 && (
            <div style={{ fontSize: 18, fontWeight: 700, color: '#f97316', marginBottom: 2 }}>
              🔥 {streak}日
            </div>
          )}
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
          <CompletionView results={results} streak={streak} completedDates={completedDates} />
        ) : current ? (
          <>
            <div
              onClick={() => setCardState(s => s === 'front' ? 'back' : 'front')}
              style={{
                width: '100%',
                maxWidth: 400,
                minHeight: 180,
                background: cardState === 'front' ? '#1e293b' : '#312e81',
                borderRadius: 16,
                padding: '24px 20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                cursor: 'pointer',
                border: cardState === 'front' ? '1px solid #334155' : '1px solid #4338ca',
                transition: 'background 0.3s, border 0.3s',
                boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
              }}
            >
              {cardState === 'front' ? (
                <>
                  <div style={{ fontSize: 19, color: '#f1f5f9', lineHeight: 1.5, marginBottom: 20 }}>
                    {current.japanese}
                  </div>
                  <div style={{ fontSize: 13, color: '#475569', textAlign: 'center' }}>
                    タップして英語を確認 →
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: '#818cf8', marginBottom: 12 }}>English</div>
                  <div style={{ fontSize: 17, color: '#e0e7ff', lineHeight: 1.6, marginBottom: 14 }}>
                    {current.text}
                  </div>
                  {current.note && (
                    <div style={{ fontSize: 13, color: '#6366f1', background: '#1e1b4b', padding: '10px 14px', borderRadius: 8, lineHeight: 1.6 }}>
                      {current.note}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: '#334155', textAlign: 'center', marginTop: 20 }}>
                    タップして問題に戻る ←
                  </div>
                </>
              )}
            </div>

            {cardState === 'back' && (
              <div style={{ display: 'flex', gap: 12, marginTop: 24, width: '100%', maxWidth: 480 }}>
                <button onClick={e => { e.stopPropagation(); void handleResult(false) }} style={{
                  flex: 1, padding: 16, borderRadius: 12,
                  background: '#7f1d1d22', border: '1px solid #7f1d1d66',
                  color: '#fca5a5', fontSize: 16, fontWeight: 600, cursor: 'pointer',
                }}>✗ もう一度</button>
                <button onClick={e => { e.stopPropagation(); void handleResult(true) }} style={{
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

// --- Calendar (GitHub-style) ---

function ReviewCalendar({ completedDates }: { completedDates: string[] }) {
  const completedSet = new Set(completedDates)
  const WEEKS = 12
  const DAYS = 7

  // Build grid: last WEEKS*DAYS days, aligned to Mon–Sun columns
  const today = new Date()
  // Find the Sunday that ends the grid
  const endDate = new Date(today)
  // Align grid end to today, pad to fill last column
  const dayOfWeek = today.getDay() // 0=Sun
  // We want columns = weeks, rows = Mon(1)..Sun(0)
  // Let's go Mon-indexed: Mon=0..Sun=6
  const monIndex = (today.getDay() + 6) % 7  // Mon=0
  const gridDays: { date: string; completed: boolean }[] = []
  const totalCells = WEEKS * DAYS
  for (let i = totalCells - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const iso = d.toISOString().slice(0, 10)
    gridDays.push({ date: iso, completed: completedSet.has(iso) })
  }

  // Pad front to fill first column from Mon
  const firstDayMonIdx = (new Date(gridDays[0].date).getDay() + 6) % 7
  const padFront = firstDayMonIdx  // how many empty cells before first real day

  const CELL = 12
  const GAP = 3
  const monthLabels: { label: string; col: number }[] = []
  let lastMonth = -1
  gridDays.forEach((d, i) => {
    const col = Math.floor((i + padFront) / DAYS)
    const m = new Date(d.date).getMonth()
    if (m !== lastMonth) {
      monthLabels.push({ label: new Date(d.date).toLocaleDateString('en-US', { month: 'short' }), col })
      lastMonth = m
    }
  })

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Review history
      </div>
      {/* Month labels */}
      <div style={{ display: 'flex', marginLeft: 0, marginBottom: 4, position: 'relative', height: 16 }}>
        {monthLabels.map(({ label, col }) => (
          <span key={`${label}-${col}`} style={{
            position: 'absolute',
            left: col * (CELL + GAP),
            fontSize: 10,
            color: '#475569',
          }}>{label}</span>
        ))}
      </div>
      {/* Grid: columns = weeks, rows = Mon-Sun */}
      <div style={{ display: 'flex', gap: GAP }}>
        {Array.from({ length: WEEKS }).map((_, weekIdx) => (
          <div key={weekIdx} style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
            {Array.from({ length: DAYS }).map((_, dayIdx) => {
              const cellIdx = weekIdx * DAYS + dayIdx - padFront
              const cell = gridDays[cellIdx]
              if (!cell) {
                return <div key={dayIdx} style={{ width: CELL, height: CELL }} />
              }
              return (
                <div
                  key={dayIdx}
                  title={cell.date}
                  style={{
                    width: CELL,
                    height: CELL,
                    borderRadius: 2,
                    background: cell.completed ? '#4f46e5' : '#1e293b',
                    border: cell.completed ? '1px solid #6366f1' : '1px solid #334155',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 8,
                    color: cell.completed ? '#a5b4fc' : 'transparent',
                  }}
                >
                  {cell.completed ? '✓' : ''}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
        <div style={{ width: CELL, height: CELL, borderRadius: 2, background: '#1e293b', border: '1px solid #334155' }} />
        <span style={{ fontSize: 10, color: '#475569' }}>なし</span>
        <div style={{ width: CELL, height: CELL, borderRadius: 2, background: '#4f46e5', border: '1px solid #6366f1', marginLeft: 8 }} />
        <span style={{ fontSize: 10, color: '#475569' }}>完了</span>
      </div>
    </div>
  )
}

// --- Completion ---

function CompletionView({
  results, streak, completedDates,
}: {
  results: { id: string; correct: boolean }[]
  streak: number
  completedDates: string[]
}) {
  const correct = results.filter(r => r.correct).length
  const pct = Math.round((correct / results.length) * 100)
  return (
    <div style={{ width: '100%', maxWidth: 480 }}>
      <div style={{ textAlign: 'center', marginTop: 24 }}>
        <div style={{ fontSize: 52 }}>🎉</div>
        <div style={{ fontSize: 26, fontWeight: 800, marginTop: 12, color: '#f1f5f9' }}>Session complete!</div>
        <div style={{ fontSize: 15, color: '#94a3b8', marginTop: 6 }}>{correct}/{results.length} correct · {pct}%</div>
        {streak > 0 && (
          <div style={{ fontSize: 18, fontWeight: 700, color: '#f97316', marginTop: 10 }}>
            🔥 {streak}日連続達成！
          </div>
        )}
      </div>
      <ReviewCalendar completedDates={completedDates} />
    </div>
  )
}
