import { useState, useEffect, useRef } from 'react'
import type { Phrase, Verb } from '../types'
import { reviewPhrase, completeRoutineStep } from '../api'
import { getStrengthColor, today } from '../utils'
import { readStudyData } from '../hooks/useStudyTimer'

type CardState = 'front' | 'back'

function speak(text: string) {
  window.speechSynthesis.cancel()
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = 'en-AU'
  utter.rate = 0.9
  window.speechSynthesis.speak(utter)
}

function buildCloze(phrase: string, examples: string[]): { before: string; match: string; after: string } | null {
  for (const ex of examples) {
    const idx = ex.toLowerCase().indexOf(phrase.toLowerCase())
    if (idx !== -1) {
      return { before: ex.slice(0, idx), match: ex.slice(idx, idx + phrase.length), after: ex.slice(idx + phrase.length) }
    }
  }
  return null
}

interface Props {
  phrases: Phrase[]
  verbs: Verb[]
  streak: number
  completedDates: string[]
  onPhraseReviewed: (phrase: Phrase) => void
  onStreakUpdated: (streak: number, completedDates: string[]) => void
  onPhraseStepDone?: () => void
}

export function VariantC({ phrases, verbs, streak, completedDates, onPhraseReviewed, onStreakUpdated, onPhraseStepDone }: Props) {
  const NOW = today()
  const dueItems = phrases.filter(p => p.dueDate <= NOW)
  const newToday = phrases.filter(p => p.createdAt?.startsWith(NOW))
  const [queue, setQueue] = useState<Phrase[]>(dueItems)
  const [cardState, setCardState] = useState<CardState>('front')
  const [results, setResults] = useState<{ id: string; correct: boolean }[]>([])
  const [showStats, setShowStats] = useState(false)
  const [showNewSection, setShowNewSection] = useState(true)

  const current = queue[0]
  const done = results.length
  const total = dueItems.length

  // due が 0件でマウントした場合もルーティンを完了させる
  const stepDoneCalledRef = useRef(false)
  useEffect(() => {
    if (dueItems.length === 0 && !stepDoneCalledRef.current) {
      stepDoneCalledRef.current = true
      completeRoutineStep('phrase').catch(() => {})
      onPhraseStepDone?.()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const verbOfDay = verbs.find(v => dueItems.some(p => p.verbId === v.id)) ?? verbs[0]
  const verbOfDayPhrases = verbOfDay ? phrases.filter(p => p.verbId === verbOfDay.id) : []

  async function handleResult(correct: boolean) {
    if (!current) return
    const isLast = queue.length === 1
    setResults(r => [...r, { id: current.id, correct }])
    setQueue(q => q.slice(1))
    setCardState('front')

    try {
      const quality = correct ? 4 : 1
      const result = await reviewPhrase(current.id, quality)
      onPhraseReviewed(result.phrase)
      if (result.streak_updated) {
        const newDate = new Date().toISOString().slice(0, 10)
        const newDates = completedDates.includes(newDate) ? completedDates : [...completedDates, newDate].sort()
        onStreakUpdated(result.streak, newDates)
      }
      if (isLast && !stepDoneCalledRef.current) {
        stepDoneCalledRef.current = true
        await completeRoutineStep('phrase')
        onPhraseStepDone?.()
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
      paddingBottom: 80,
    }}>
      {/* Header */}
      <div style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Today's Session</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Good morning, Ren</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={() => setShowStats(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: '#64748b', display: 'flex', alignItems: 'center', borderRadius: 8 }}
            title="学習記録"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </button>
          <div style={{ textAlign: 'right' }}>
            {streak > 0 && (
              <div style={{ fontSize: 18, fontWeight: 700, color: '#f97316', marginBottom: 2 }}>
                🔥 {streak}日
              </div>
            )}
            <div style={{ fontSize: 20, fontWeight: 700, color: '#ef4444' }}>{total} due</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>phrases today</div>
          </div>
        </div>
      </div>

      {/* Today's new phrases */}
      {showNewSection && newToday.length > 0 && (
        <div style={{ padding: '0 24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#818cf8', letterSpacing: '0.06em' }}>
              📌 今日追加 {newToday.length}件
            </div>
            <button
              onClick={() => setShowNewSection(false)}
              style={{ fontSize: 11, color: '#475569', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              全部見た ✓
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
            {newToday.map(p => (
              <div key={p.id} style={{
                flexShrink: 0, width: 160,
                background: 'rgba(99,102,241,0.08)',
                border: '1px solid rgba(99,102,241,0.2)',
                borderRadius: 10, padding: '10px 12px',
              }}>
                <div style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.5, marginBottom: 4 }}>{p.text}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{p.japanese}</div>
              </div>
            ))}
          </div>
        </div>
      )}

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
            {(() => {
              const cloze = current.examples?.length ? buildCloze(current.text, current.examples) : null
              return (
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
                      <div style={{ fontSize: 19, color: '#f1f5f9', lineHeight: 1.5, marginBottom: cloze ? 16 : 20 }}>
                        {current.japanese}
                      </div>
                      {cloze && (
                        <div style={{ fontSize: 15, color: '#94a3b8', lineHeight: 1.7, marginBottom: 16, fontStyle: 'italic' }}>
                          "{cloze.before}<span style={{ background: '#0f172a', borderRadius: 3, padding: '1px 6px', letterSpacing: '0.15em', color: '#0f172a', border: '1px solid #475569' }}>{'_'.repeat(Math.max(cloze.match.length, 4))}</span>{cloze.after}"
                        </div>
                      )}
                      <div style={{ fontSize: 13, color: '#475569', textAlign: 'center' }}>
                        タップして答えを確認 →
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 13, color: '#818cf8', marginBottom: 12 }}>English</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <div style={{ fontSize: 17, color: '#e0e7ff', lineHeight: 1.6, flex: 1 }}>
                          {current.text.split(' ').map((word, i) => (
                            <span
                              key={i}
                              onClick={e => { e.stopPropagation(); speak(word.replace(/[^a-zA-Z'-]/g, '')) }}
                              style={{ cursor: 'pointer', borderRadius: 3, padding: '0 1px' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(129,140,248,0.15)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >{word}{' '}</span>
                          ))}
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); speak(current.text) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: 6, flexShrink: 0, borderRadius: 8, lineHeight: 1 }}
                          title="フレーズ全体を聞く"
                        >
                          🔊
                        </button>
                      </div>
                      {cloze && (
                        <div style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.7, marginBottom: 14, fontStyle: 'italic' }}>
                          "{cloze.before}<span style={{ color: '#818cf8', textDecoration: 'underline', textUnderlineOffset: 3, fontWeight: 600, fontStyle: 'normal' }}>{cloze.match}</span>{cloze.after}"
                        </div>
                      )}
                      {current.note && (
                        <div style={{ fontSize: 13, color: '#6366f1', background: '#1e1b4b', padding: '10px 14px', borderRadius: 8, lineHeight: 1.6, marginBottom: 14 }}>
                          {current.note}
                        </div>
                      )}
                      {current.alternatives && current.alternatives.length > 0 && (
                        <div style={{ borderTop: '1px solid #334155', paddingTop: 12 }}>
                          <div style={{ fontSize: 11, color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>他の言い方</div>
                          {current.alternatives.map((alt, i) => (
                            <div key={i} style={{ marginBottom: 10 }}>
                              <div style={{ fontSize: 14, color: '#c7d2fe', lineHeight: 1.6 }}>{alt.text}</div>
                              {alt.note && (
                                <div style={{ fontSize: 12, color: '#6366f1', marginTop: 3, lineHeight: 1.5 }}>{alt.note}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{ fontSize: 12, color: '#334155', textAlign: 'center', marginTop: 16 }}>
                        タップして問題に戻る ←
                      </div>
                    </>
                  )}
                </div>
              )
            })()}

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
                {queue.slice(1, 3).map((item, i) => (
                  <div key={item.id} style={{
                    padding: '10px 14px', background: '#1e293b', borderRadius: 8, marginBottom: 6,
                    fontSize: 13, color: '#64748b', opacity: 1 - i * 0.3,
                  }}>
                    {item.japanese}
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

      {/* Stats panel */}
      {showStats && (
        <StatsPanel streak={streak} completedDates={completedDates} onClose={() => setShowStats(false)} />
      )}
    </div>
  )
}

// --- Stats panel ---

function StatsPanel({ streak, completedDates, onClose }: { streak: number; completedDates: string[]; onClose: () => void }) {
  const studyData = readStudyData()

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 520, maxHeight: '88vh', overflowY: 'auto', background: '#0f172a', borderRadius: '20px 20px 0 0', padding: '20px 20px 48px', border: '1px solid #1e293b' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>学習記録</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 4 }}>✕</button>
        </div>
        <MonthlyCalendar streak={streak} completedDates={completedDates} studyData={studyData} />
      </div>
    </div>
  )
}

// --- Monthly calendar ---

const DOW = ['日', '月', '火', '水', '木', '金', '土']

function MonthlyCalendar({ streak, completedDates, studyData }: { streak: number; completedDates: string[]; studyData: Record<string, number> }) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const year = now.getFullYear()
  const month = now.getMonth()
  const completedSet = new Set(completedDates)

  const totalMinutes = Object.values(studyData).reduce((s, m) => s + m, 0)
  const studyDayCount = Object.values(studyData).filter(m => m > 0).length
  const totalHours = (totalMinutes / 60).toFixed(1)

  // Build month grid
  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (string | null)[] = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push(iso)
  }
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  const monthLabel = now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' })

  return (
    <div>
      {/* Stats row */}
      <div style={{ display: 'flex', marginBottom: 20 }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>学習日数</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#f1f5f9', lineHeight: 1 }}>
            {studyDayCount}<span style={{ fontSize: 13, fontWeight: 400, color: '#94a3b8' }}>日</span>
          </div>
        </div>
        <div style={{ width: 1, background: '#334155', margin: '4px 0' }} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>学習時間</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#f1f5f9', lineHeight: 1 }}>
            {totalHours}<span style={{ fontSize: 13, fontWeight: 400, color: '#94a3b8' }}>h</span>
          </div>
        </div>
        {streak > 0 && <>
          <div style={{ width: 1, background: '#334155', margin: '4px 0' }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>ストリーク</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#f97316', lineHeight: 1 }}>
              {streak}<span style={{ fontSize: 13, fontWeight: 400, color: '#94a3b8' }}>日🔥</span>
            </div>
          </div>
        </>}
      </div>

      {/* Month label */}
      <div style={{ fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 10 }}>{monthLabel}</div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {DOW.map((d, i) => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: i === 0 ? '#f87171' : i === 6 ? '#818cf8' : '#475569', paddingBottom: 6 }}>{d}</div>
        ))}
      </div>

      {/* Selected day detail */}
      {selectedDay && (() => {
        const mins = studyData[selectedDay] ?? 0
        const rev = completedSet.has(selectedDay)
        const d = new Date(selectedDay + 'T00:00:00')
        const label = d.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })
        return (
          <div style={{ marginBottom: 14, padding: '12px 16px', background: '#1e293b', borderRadius: 12, border: '1px solid #4f46e5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>{label}</div>
            <div style={{ display: 'flex', gap: 20 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>学習時間</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: mins > 0 ? '#f1f5f9' : '#334155' }}>{mins > 0 ? `${mins}分` : '-'}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>復習</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: rev ? '#22c55e' : '#334155' }}>{rev ? '完了' : '-'}</div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Weeks */}
      {weeks.map((week, wi) => (
        <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 2 }}>
          {week.map((iso, di) => {
            if (!iso) return <div key={di} />

            const minutes = studyData[iso] ?? 0
            const reviewed = completedSet.has(iso)
            const isToday = iso === todayStr
            const isFuture = iso > todayStr
            const active = minutes > 0

            // Band effect: connect adjacent active days
            const prevActive = di > 0 && !!week[di - 1] && (studyData[week[di - 1]!] ?? 0) > 0
            const nextActive = di < 6 && !!week[di + 1] && (studyData[week[di + 1]!] ?? 0) > 0
            const bandRadius = active
              ? (!prevActive && !nextActive) ? '999px'
                : !prevActive ? '999px 0 0 999px'
                  : !nextActive ? '0 999px 999px 0'
                    : '0'
              : '0'

            const dayNum = parseInt(iso.slice(8))

            return (
              <div key={di} onClick={() => setSelectedDay(iso === selectedDay ? null : iso)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 2, paddingBottom: 6, background: iso === selectedDay ? 'rgba(99,102,241,0.35)' : active ? 'rgba(99,102,241,0.18)' : 'none', borderRadius: bandRadius, cursor: 'pointer' }}>
                {/* Date number */}
                <div style={{
                  fontSize: 11, fontWeight: isToday ? 700 : 400,
                  color: isToday ? '#818cf8' : di === 0 ? '#f87171' : di === 6 ? '#6366f1' : '#94a3b8',
                  width: 18, height: 18,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '50%',
                  background: isToday ? '#312e81' : 'none',
                  marginBottom: 3,
                }}>
                  {dayNum}
                </div>

                {/* Circle */}
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: active ? '#4f46e5' : isFuture ? '#0f172a' : '#1e293b',
                  border: active ? '1.5px solid #6366f1' : isFuture ? '1.5px solid #1e293b' : '1.5px solid #334155',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative',
                  boxShadow: active ? '0 0 8px rgba(99,102,241,0.4)' : 'none',
                }}>
                  {active && <span style={{ fontSize: 12, lineHeight: 1 }}>✦</span>}
                  {reviewed && (
                    <div style={{ position: 'absolute', top: -2, right: -2, width: 10, height: 10, borderRadius: '50%', background: '#22c55e', border: '1.5px solid #0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 6, color: '#fff', lineHeight: 1 }}>✓</span>
                    </div>
                  )}
                </div>

                {/* Time */}
                <div style={{ fontSize: 9, color: active ? '#94a3b8' : '#334155', marginTop: 3 }}>
                  {minutes > 0 ? `${minutes}m` : '-'}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// --- Completion ---

function CompletionView({ results, streak, completedDates }: { results: { id: string; correct: boolean }[]; streak: number; completedDates: string[] }) {
  const studyData = readStudyData()
  const correct = results.filter(r => r.correct).length
  const pct = Math.round((correct / results.length) * 100)
  return (
    <div style={{ width: '100%', maxWidth: 480 }}>
      <div style={{ textAlign: 'center', marginTop: 24 }}>
        <div style={{ fontSize: 52 }}>🎉</div>
        <div style={{ fontSize: 26, fontWeight: 800, marginTop: 12, color: '#f1f5f9' }}>Session complete!</div>
        <div style={{ fontSize: 15, color: '#94a3b8', marginTop: 6 }}>{correct}/{results.length} correct · {pct}%</div>
        {streak > 0 && <div style={{ fontSize: 18, fontWeight: 700, color: '#f97316', marginTop: 10 }}>🔥 {streak}日連続達成！</div>}
      </div>
      <div style={{ marginTop: 28 }}>
        <MonthlyCalendar streak={streak} completedDates={completedDates} studyData={studyData} />
      </div>
    </div>
  )
}
