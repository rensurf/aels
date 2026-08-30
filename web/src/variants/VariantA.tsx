import { useState, useEffect } from 'react'
import type { Phrase, Verb, VerbPattern, PhrasalVerb } from '../types'
import { getStrengthColor } from '../utils'
import { createVerb, updateVerb, deleteVerb } from '../api'

const PATTERN_CODES = ['V1', 'V2', 'V3', 'V4', 'V5'] as const

const PALETTE = ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#06b6d4', '#ef4444']

function patternColor(code: string): string {
  let h = 0
  for (const c of code) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return PALETTE[h % PALETTE.length]
}

function verbAvgEase(verbId: string, phrases: Phrase[]): number {
  const ps = phrases.filter(p => p.verbId === verbId)
  if (!ps.length) return 2.5
  return ps.reduce((s, p) => s + p.easeFactor, 0) / ps.length
}

type AddState =
  | { status: 'idle' }
  | { status: 'entering'; input: string }
  | { status: 'generating' }
  | { status: 'preview'; draft: Verb; saving: boolean }
  | { status: 'error'; message: string }

interface Props {
  verbs: Verb[]
  phrases: Phrase[]
  onVerbAdded: (verb: Verb) => void
  onVerbUpdated: (verb: Verb) => void
  onVerbDeleted: (verbId: string) => void
  onVerbStepDone?: () => void
  verbStepAlreadyDone?: boolean
}

type QuizSession = { verbs: Verb[]; index: number; revealed: boolean; source: string; results: { id: string; correct: boolean }[] }

export function VariantA({ verbs, phrases, onVerbAdded, onVerbUpdated, onVerbDeleted, onVerbStepDone, verbStepAlreadyDone }: Props) {
  const [selectedId, setSelectedId] = useState<string>(verbs[0]?.id ?? '')
  const [addState, setAddState] = useState<AddState>({ status: 'idle' })
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 640)
  const [sourceFilter, setSourceFilter] = useState<string | null>(null)
  const [quiz, setQuiz] = useState<QuizSession | null>(null)
  const [quizCompleted, setQuizCompleted] = useState(verbStepAlreadyDone ?? false)

  const selectedVerb = verbs.find(v => v.id === selectedId)
  const isAdding = addState.status !== 'idle'

  // Collect unique tags across all verbs
  const allTags = [...new Set(verbs.flatMap(v => v.tags))]

  const filteredVerbs = sourceFilter
    ? verbs.filter(v => v.tags.includes(sourceFilter))
    : verbs

  const startQuiz = () => {
    if (filteredVerbs.length === 0) return
    const sorted = [...filteredVerbs].sort((a, b) => verbAvgEase(a.id, phrases) - verbAvgEase(b.id, phrases))
    setQuiz({ verbs: sorted, index: 0, revealed: false, source: sourceFilter ?? 'All verbs', results: [] })
    setSidebarOpen(false)
  }

  const handleGenerate = async (base: string) => {
    setAddState({ status: 'generating' })
    try {
      const verb = await createVerb(base)
      setAddState({ status: 'preview', draft: verb, saving: false })
    } catch (e) {
      setAddState({ status: 'error', message: String(e) })
    }
  }

  const handleSave = async () => {
    if (addState.status !== 'preview') return
    const { draft } = addState
    setAddState({ status: 'preview', draft, saving: true })
    try {
      const saved = await updateVerb(draft)
      onVerbAdded(saved)
      setSelectedId(saved.id)
      setAddState({ status: 'idle' })
    } catch (e) {
      setAddState({ status: 'error', message: String(e) })
    }
  }

  const handleCancel = () => setAddState({ status: 'idle' })
  const handleDraftChange = (draft: Verb) => setAddState({ status: 'preview', draft, saving: false })

  const selectVerb = (id: string) => {
    if (addState.status === 'preview' && addState.saving) return
    setSelectedId(id)
    setAddState({ status: 'idle' })
    if (window.innerWidth < 640) setSidebarOpen(false)
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif', background: '#0f172a', color: '#e2e8f0', paddingBottom: 70, boxSizing: 'border-box' }}>
      {/* Sidebar */}
      <aside style={{ width: sidebarOpen ? 200 : 0, background: '#1e293b', borderRight: sidebarOpen ? '1px solid #334155' : 'none', display: 'flex', flexDirection: 'column', flexShrink: 0, overflowX: 'hidden', transition: 'width 0.2s ease' }}>
        <div style={{ width: 200, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div style={{ padding: '16px 12px 8px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Verbs</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => { if (!isAdding) setAddState({ status: 'entering', input: '' }) }}
              title="Add verb"
              style={{ background: 'none', border: 'none', color: '#64748b', cursor: isAdding ? 'default' : 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px', opacity: isAdding ? 0.4 : 1 }}
            >+</button>
            <button
              onClick={() => setSidebarOpen(false)}
              title="Close sidebar"
              style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}
            >✕</button>
          </div>
        </div>

        {addState.status === 'entering' && (
          <div style={{ padding: '4px 12px 8px' }}>
            <input
              autoFocus
              value={addState.input}
              onChange={e => setAddState({ status: 'entering', input: e.target.value })}
              onKeyDown={e => {
                if (e.key === 'Enter' && addState.input.trim()) handleGenerate(addState.input.trim())
                if (e.key === 'Escape') handleCancel()
              }}
              placeholder="e.g. hear"
              style={{ width: '100%', boxSizing: 'border-box', background: '#0f172a', border: '1px solid #3b82f6', borderRadius: 4, color: '#e2e8f0', fontSize: 13, padding: '6px 8px', outline: 'none' }}
            />
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 3 }}>Enter · Esc to cancel</div>
          </div>
        )}

        {addState.status === 'generating' && (
          <div style={{ padding: '4px 12px 8px', fontSize: 13, color: '#64748b', fontStyle: 'italic' }}>Generating...</div>
        )}

        {addState.status === 'error' && (
          <div style={{ padding: '4px 12px 8px' }}>
            <div style={{ fontSize: 12, color: '#ef4444' }}>{addState.message}</div>
            <button onClick={handleCancel} style={{ fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 2 }}>Dismiss</button>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {/* SOURCES filter */}
          <div style={{ padding: '12px 12px 6px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#475569', marginBottom: 6 }}>Sources</div>
            <button
              onClick={() => setSourceFilter(null)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, marginBottom: 2, background: sourceFilter === null ? '#334155' : 'transparent', color: sourceFilter === null ? '#e2e8f0' : '#64748b', fontWeight: sourceFilter === null ? 600 : 400 }}
            >
              All verbs <span style={{ color: '#475569', fontWeight: 400 }}>({verbs.length})</span>
            </button>
            {allTags.map(tag => {
              const count = verbs.filter(v => v.tags.includes(tag)).length
              const active = sourceFilter === tag
              return (
                <button
                  key={tag}
                  onClick={() => setSourceFilter(tag)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, marginBottom: 2, background: active ? '#334155' : 'transparent', color: active ? '#e2e8f0' : '#64748b', fontWeight: active ? 600 : 400 }}
                >
                  {tag} <span style={{ color: '#475569', fontWeight: 400 }}>({count})</span>
                </button>
              )
            })}
          </div>

          {/* Quiz start */}
          <div style={{ padding: '6px 12px 10px' }}>
            <button
              onClick={startQuiz}
              disabled={filteredVerbs.length === 0}
              style={{ width: '100%', padding: '7px 0', borderRadius: 6, border: 'none', background: filteredVerbs.length > 0 ? '#4f46e5' : '#1e293b', color: filteredVerbs.length > 0 ? '#fff' : '#475569', fontSize: 12, fontWeight: 600, cursor: filteredVerbs.length > 0 ? 'pointer' : 'default' }}
            >
              ▶ Quiz ({filteredVerbs.length}問)
            </button>
          </div>

          <div style={{ borderTop: '1px solid #1e293b', margin: '0 0 6px' }} />

          {/* Verb list */}
          {filteredVerbs.map(verb => {
            const avg = verbAvgEase(verb.id, phrases)
            const color = getStrengthColor(avg)
            const count = phrases.filter(p => p.verbId === verb.id).length
            const isSelected = verb.id === selectedId
            return (
              <button
                key={verb.id}
                onClick={() => selectVerb(verb.id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '10px 12px',
                  background: isSelected ? '#334155' : 'transparent',
                  border: 'none', borderLeft: isSelected ? `3px solid ${color}` : '3px solid transparent',
                  color: '#e2e8f0', cursor: 'pointer', textAlign: 'left', fontSize: 14,
                }}
              >
                <span style={{ fontWeight: isSelected ? 600 : 400 }}>{verb.base}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: '#64748b' }}>{count}p</span>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                </span>
              </button>
            )
          })}
        </div>

        {onVerbStepDone && (
          <div style={{ padding: '8px 12px', borderTop: '1px solid #334155' }}>
            <button
              onClick={quizCompleted ? onVerbStepDone : undefined}
              title={quizCompleted ? undefined : 'クイズを完了してください'}
              style={{ width: '100%', padding: '8px 0', borderRadius: 6, border: 'none', background: quizCompleted ? '#16a34a' : '#1e293b', color: quizCompleted ? '#fff' : '#475569', fontSize: 12, fontWeight: 600, cursor: quizCompleted ? 'pointer' : 'not-allowed' }}
            >
              {quizCompleted ? '✓ Verb 完了' : '🔒 クイズを完了してください'}
            </button>
          </div>
        )}
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflowY: 'auto', padding: 24, minWidth: 0 }}>
        {/* Quiz session */}
        {quiz && <QuizOverlay quiz={quiz} onUpdate={setQuiz} onClose={() => { if (quiz.index >= quiz.verbs.length) setQuizCompleted(true); setQuiz(null); setSidebarOpen(true) }} />}

        {!quiz && !sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, padding: '6px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}
          >
            ☰ {selectedVerb?.base ?? 'Verbs'}
          </button>
        )}
        {!quiz && (addState.status === 'preview'
          ? <AddVerbPreview draft={addState.draft} saving={addState.saving} allTags={allTags} onDraftChange={handleDraftChange} onSave={handleSave} onCancel={handleCancel} />
          : selectedVerb
            ? <VerbDetail
                verb={selectedVerb}
                phrases={phrases.filter(p => p.verbId === selectedVerb.id)}
                onUpdated={onVerbUpdated}
                onDeleted={(id) => {
                  onVerbDeleted(id)
                  const remaining = verbs.filter(v => v.id !== id)
                  setSelectedId(remaining[0]?.id ?? '')
                }}
              />
            : verbs.length === 0
              ? <div style={{ color: '#475569', paddingTop: 80, textAlign: 'center', fontSize: 14 }}>No verbs yet. Click <strong style={{ color: '#94a3b8' }}>+</strong> to add your first verb.</div>
              : <div style={{ color: '#475569' }}>Select a verb</div>
        )}
      </main>
    </div>
  )
}

// ── Verb tags row ─────────────────────────────────────────────────────────────

function VerbTagsRow({ tags, onAdd, onRemove }: {
  tags: string[]
  onAdd: (tag: string) => Promise<void>
  onRemove: (tag: string) => Promise<void>
}) {
  const [input, setInput] = useState('')
  const [adding, setAdding] = useState(false)

  const commit = async () => {
    if (!input.trim()) { setAdding(false); return }
    await onAdd(input.trim())
    setInput('')
    setAdding(false)
  }

  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      {tags.map(tag => (
        <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px 3px 10px', borderRadius: 999, fontSize: 11, background: '#1e293b', color: '#94a3b8', border: '1px solid #334155' }}>
          {tag}
          <button onClick={() => void onRemove(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', fontSize: 12, lineHeight: 1, padding: 0 }}
            onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
            onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
          >✕</button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void commit(); if (e.key === 'Escape') { setAdding(false); setInput('') } }}
          onBlur={() => void commit()}
          placeholder="例: Murphy's Grammar"
          style={{ padding: '3px 8px', borderRadius: 999, fontSize: 11, background: '#0f172a', border: '1px solid #6366f1', color: '#e2e8f0', outline: 'none', width: 150 }}
        />
      ) : (
        <button onClick={() => setAdding(true)} style={{ padding: '3px 8px', borderRadius: 999, fontSize: 11, background: 'none', color: '#475569', border: '1px dashed #334155', cursor: 'pointer' }}>
          + ソース追加
        </button>
      )}
    </div>
  )
}

// ── Quiz session overlay ───────────────────────────────────────────────────────

function QuizOverlay({ quiz, onUpdate, onClose }: {
  quiz: QuizSession
  onUpdate: (q: QuizSession) => void
  onClose: () => void
}) {
  const verb = quiz.verbs[quiz.index]
  const isDone = quiz.index >= quiz.verbs.length

  const handleResult = (correct: boolean) => {
    onUpdate({
      ...quiz,
      index: quiz.index + 1,
      revealed: false,
      results: [...quiz.results, { id: verb.id, correct }],
    })
  }

  if (isDone) {
    const correctCount = quiz.results.filter(r => r.correct).length
    const wrongVerbs = quiz.verbs.filter(v => quiz.results.find(r => r.id === v.id && !r.correct))
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', gap: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 52 }}>🎉</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: '#f1f5f9' }}>完了！</div>
        <div style={{ fontSize: 15, color: '#64748b' }}>{correctCount}/{quiz.verbs.length}正解 · {quiz.source}</div>
        {wrongVerbs.length > 0 && (
          <div style={{ marginTop: 8, textAlign: 'left', background: '#1e293b', borderRadius: 12, padding: '16px 24px', minWidth: 200 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>要復習</div>
            {wrongVerbs.map(v => (
              <div key={v.id} style={{ fontSize: 15, color: '#fca5a5', padding: '3px 0', fontWeight: 600 }}>{v.base}</div>
            ))}
          </div>
        )}
        <button onClick={onClose} style={{ marginTop: 16, padding: '10px 28px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', fontSize: 14, cursor: 'pointer' }}>
          戻る
        </button>
      </div>
    )
  }

  const codes = [...new Set(verb.patterns.map(vp => vp.code))]

  return (
    <div style={{ maxWidth: 520, margin: '0 auto' }}>
      {/* Progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
        <div style={{ flex: 1, height: 4, background: '#1e293b', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: '#6366f1', borderRadius: 999, width: `${(quiz.index / quiz.verbs.length) * 100}%`, transition: 'width 0.3s ease' }} />
        </div>
        <span style={{ fontSize: 12, color: '#475569', flexShrink: 0 }}>{quiz.index + 1} / {quiz.verbs.length}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>✕</button>
      </div>

      {/* Card */}
      <div style={{ background: '#1e293b', borderRadius: 20, padding: '32px', textAlign: 'center', border: '1px solid #334155' }}>
        <div style={{ fontSize: 13, color: '#475569', marginBottom: 12 }}>{quiz.source}</div>
        <div style={{ fontSize: 56, fontWeight: 800, color: '#f1f5f9', marginBottom: 4 }}>{verb.base}</div>
        {(verb.nounForm || verb.adjForm) && (
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', fontSize: 13, color: '#64748b', marginBottom: 8 }}>
            {verb.nounForm && <span>名詞: <em>{verb.nounForm}</em></span>}
            {verb.adjForm && <span>形容詞: <em>{verb.adjForm}</em></span>}
          </div>
        )}

        {!quiz.revealed ? (
          <>
            <div style={{ fontSize: 13, color: '#475569', marginTop: 24, marginBottom: 28 }}>このパターンをすべて言えますか？</div>
            <button
              onClick={() => onUpdate({ ...quiz, revealed: true })}
              style={{ padding: '12px 32px', borderRadius: 10, border: 'none', background: '#6366f1', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
            >
              答えを見る
            </button>
          </>
        ) : (
          <>
            {/* Pattern code badges */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', margin: '20px 0 16px' }}>
              {codes.map(code => (
                <span key={code} style={{ padding: '5px 14px', borderRadius: 999, fontSize: 13, fontWeight: 700, background: patternColor(code) + '22', color: patternColor(code), border: `1px solid ${patternColor(code)}44` }}>{code}</span>
              ))}
            </div>

            {/* All patterns — all senses + all examples + memo */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left' }}>
              {codes.map(code => {
                const senses = verb.patterns.filter(vp => vp.code === code)
                return (
                  <div key={code} style={{ padding: '12px 16px', background: '#0f172a', borderRadius: 10, border: `1px solid ${patternColor(code)}22` }}>
                    <div style={{ fontWeight: 700, color: patternColor(code), fontSize: 12, marginBottom: 8 }}>{code}</div>
                    {senses.map((sense, si) => (
                      <div key={si} style={{ marginBottom: si < senses.length - 1 ? 10 : 0 }}>
                        <div style={{ fontSize: 13, color: '#e2e8f0', marginBottom: 4 }}>{sense.description}</div>
                        {sense.examples.filter(ex => ex.trim()).map((ex, i) => (
                          <div key={i} style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', lineHeight: 1.6 }}>"{ex}"</div>
                        ))}
                        {sense.memo && (
                          <div style={{ marginTop: 4, fontSize: 12, color: '#94a3b8', background: '#1e293b', padding: '4px 8px', borderRadius: 4 }}>{sense.memo}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>

            {/* Phrasal verbs */}
            {verb.phrasalVerbs.length > 0 && (
              <div style={{ marginTop: 14, textAlign: 'left' }}>
                <div style={{ fontSize: 11, color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Phrasal Verbs</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {verb.phrasalVerbs.map((pv, i) => (
                    <div key={i} style={{ padding: '8px 12px', background: '#0f172a', borderRadius: 8, border: '1px solid #a78bfa22' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <span style={{ fontWeight: 600, color: '#a78bfa', fontSize: 13 }}>{pv.phrase}</span>
                        {pv.pattern && <span style={{ fontSize: 11, color: patternColor(pv.pattern) }}>{pv.pattern}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: '#e2e8f0' }}>{pv.definition}</div>
                      {pv.example && <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', marginTop: 2 }}>"{pv.example}"</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ✓/✗ buttons */}
      {quiz.revealed && (
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
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
    </div>
  )
}

// ── Shared utilities ───────────────────────────────────────────────────────────

function ChipEditor({ label, chips, color, bg, border, onChange }: {
  label: string; chips: string[]; color: string; bg: string; border: string
  onChange: (chips: string[]) => void
}) {
  const [input, setInput] = useState('')
  return (
    <div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        {chips.map(w => (
          <span key={w} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999, background: bg, color, border: `1px solid ${border}`, fontSize: 12 }}>
            {w}
            <button onClick={() => onChange(chips.filter(c => c !== w))} style={{ background: 'none', border: 'none', color, cursor: 'pointer', fontSize: 10, padding: 0, lineHeight: 1 }}>✕</button>
          </span>
        ))}
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
              e.preventDefault()
              const word = input.trim().replace(/,$/, '')
              if (word && !chips.includes(word)) onChange([...chips, word])
              setInput('')
            }
          }}
          placeholder="+ add"
          style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: 12, padding: '3px 4px', outline: 'none', width: 60 }}
        />
      </div>
    </div>
  )
}

// Editable pattern card — used in both add preview and edit mode
function PatternEditCard({ vp, idx, draft, onDraftChange, removable = true }: {
  vp: VerbPattern; idx: number; draft: Verb
  onDraftChange: (v: Verb) => void; removable?: boolean
}) {
  const color = patternColor(vp.code)

  const updatePattern = (updated: Partial<VerbPattern>) => {
    onDraftChange({
      ...draft,
      patterns: draft.patterns.map((p, i) => i === idx ? { ...p, ...updated } : p),
    })
  }

  const updateExample = (ei: number, value: string) => {
    const examples = vp.examples.map((ex, i) => i === ei ? value : ex)
    updatePattern({ examples })
  }

  const removeExample = (ei: number) => {
    updatePattern({ examples: vp.examples.filter((_, i) => i !== ei) })
  }

  const addExample = () => updatePattern({ examples: [...vp.examples, ''] })

  return (
    <div style={{ background: '#1e293b', borderRadius: 12, overflow: 'hidden', border: `1px solid ${color}33` }}>
      {/* header */}
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${color}33`, background: color + '11', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <select
            value={vp.code}
            onChange={e => updatePattern({ code: e.target.value })}
            style={{ background: color + '22', border: `1px solid ${color}44`, borderRadius: 4, color, fontWeight: 700, fontSize: 13, padding: '2px 6px', outline: 'none', cursor: 'pointer', flexShrink: 0 }}
          >
            {PATTERN_CODES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input
            value={vp.description}
            onChange={e => updatePattern({ description: e.target.value })}
            placeholder="説明（日本語）"
            style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: '1px solid #334155', color: '#94a3b8', fontSize: 13, padding: '2px 4px', outline: 'none', minWidth: 0 }}
          />
        </div>
        {removable && (
          <button
            onClick={() => onDraftChange({ ...draft, patterns: draft.patterns.filter((_, i) => i !== idx) })}
            title="Remove pattern"
            style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 12, padding: '2px 8px', borderRadius: 4 }}
          >✕</button>
        )}
      </div>

      {/* examples */}
      <div style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>例文</div>
        {vp.examples.map((ex, ei) => (
          <div key={ei} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input
              value={ex}
              onChange={e => updateExample(ei, e.target.value)}
              placeholder="Example sentence..."
              style={{ flex: 1, background: '#0f172a', border: '1px solid #334155', borderRadius: 4, color: '#e2e8f0', fontSize: 13, padding: '5px 8px', outline: 'none' }}
            />
            <button
              onClick={() => removeExample(ei)}
              style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 12, padding: '0 6px', flexShrink: 0 }}
            >✕</button>
          </div>
        ))}
        <button
          onClick={addExample}
          style={{ fontSize: 12, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 2 }}
        >＋ 例文を追加</button>

        {/* memo */}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>メモ</div>
          <textarea
            value={vp.memo ?? ''}
            onChange={e => updatePattern({ memo: e.target.value || undefined })}
            placeholder="使い方のコツ・注意点など"
            rows={2}
            style={{ width: '100%', boxSizing: 'border-box', background: '#0f172a', border: '1px solid #334155', borderRadius: 4, color: '#e2e8f0', fontSize: 13, padding: '6px 8px', outline: 'none', resize: 'vertical', fontFamily: 'system-ui' }}
          />
        </div>
      </div>
    </div>
  )
}

// Shared verb-level meta fields (noun/adj form, relation chips)
function VerbMetaEditor({ draft, onDraftChange }: { draft: Verb; onDraftChange: (v: Verb) => void }) {
  return (
    <>
      <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
        {(['nounForm', 'adjForm'] as const).map(key => (
          <label key={key} style={{ fontSize: 13, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 8 }}>
            {key === 'nounForm' ? '名詞形' : '形容詞形'}:
            <input
              value={draft[key] ?? ''}
              onChange={e => onDraftChange({ ...draft, [key]: e.target.value || undefined })}
              placeholder="—"
              style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 4, color: '#e2e8f0', fontSize: 13, padding: '4px 8px', width: 100, outline: 'none' }}
            />
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 32, marginBottom: 20 }}>
        <ChipEditor label="混同注意" chips={draft.confusableWith} color="#fca5a5" bg="#7f1d1d22" border="#7f1d1d44" onChange={chips => onDraftChange({ ...draft, confusableWith: chips })} />
        <ChipEditor label="類似表現" chips={draft.similarTo} color="#86efac" bg="#14532d22" border="#14532d44" onChange={chips => onDraftChange({ ...draft, similarTo: chips })} />
      </div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', marginBottom: 6 }}>メモ</div>
        <textarea
          value={draft.memo ?? ''}
          onChange={e => onDraftChange({ ...draft, memo: e.target.value || undefined })}
          placeholder="覚え方・使い分け・注意点など自由に"
          rows={3}
          style={{ width: '100%', boxSizing: 'border-box', background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', fontSize: 13, padding: '8px 10px', outline: 'none', resize: 'vertical', fontFamily: 'system-ui' }}
        />
      </div>
    </>
  )
}

// ── Phrasal Verbs section ─────────────────────────────────────────────────────

const EMPTY_PV = { phrase: '', pattern: '', definition: '', example: '' }

function PhrasalVerbCard({ pv, onUpdate, onDelete }: {
  pv: PhrasalVerb
  onUpdate: (updated: PhrasalVerb) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(pv)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!draft.phrase.trim() || !draft.definition.trim()) return
    setSaving(true)
    try {
      await onUpdate({ phrase: draft.phrase.trim(), pattern: draft.pattern, definition: draft.definition.trim(), example: draft.example.trim() })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setSaving(true)
    try { await onDelete() } finally { setSaving(false) }
  }

  if (editing) {
    return (
      <div style={{ background: '#1e293b', borderRadius: 8, padding: 16, border: '1px solid #a78bfa33' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              autoFocus
              value={draft.phrase}
              onChange={e => setDraft(d => ({ ...d, phrase: e.target.value }))}
              placeholder="句動詞（例: look after）"
              style={{ flex: 1, background: '#0f172a', border: '1px solid #334155', borderRadius: 4, color: '#e2e8f0', fontSize: 13, padding: '6px 8px', outline: 'none' }}
            />
            <select
              value={draft.pattern}
              onChange={e => setDraft(d => ({ ...d, pattern: e.target.value }))}
              style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 4, color: draft.pattern ? '#e2e8f0' : '#64748b', fontSize: 13, padding: '6px 8px', outline: 'none', width: 70 }}
            >
              <option value="">文型</option>
              {PATTERN_CODES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <input
            value={draft.definition}
            onChange={e => setDraft(d => ({ ...d, definition: e.target.value }))}
            placeholder="日本語の意味"
            style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 4, color: '#e2e8f0', fontSize: 13, padding: '6px 8px', outline: 'none' }}
          />
          <input
            value={draft.example}
            onChange={e => setDraft(d => ({ ...d, example: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setDraft(pv); setEditing(false) } }}
            placeholder="例文（任意）"
            style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 4, color: '#e2e8f0', fontSize: 13, padding: '6px 8px', outline: 'none' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
          <button onClick={handleSave} disabled={saving || !draft.phrase.trim() || !draft.definition.trim()} style={{ fontSize: 13, color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer', padding: 0, opacity: saving ? 0.5 : 1 }}>
            {saving ? '保存中...' : '保存'}
          </button>
          <button onClick={() => { setDraft(pv); setEditing(false) }} disabled={saving} style={{ fontSize: 13, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            キャンセル
          </button>
          <button onClick={handleDelete} disabled={saving} style={{ fontSize: 13, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginLeft: 'auto' }}>
            削除
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '10px 16px', background: '#1e293b', borderRadius: 8, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontWeight: 600, color: '#a78bfa', fontSize: 14 }}>{pv.phrase}</span>
          {pv.pattern && (
            <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: patternColor(pv.pattern) + '22', color: patternColor(pv.pattern), border: `1px solid ${patternColor(pv.pattern)}44` }}>{pv.pattern}</span>
          )}
        </div>
        <div style={{ fontSize: 13, color: '#e2e8f0', marginBottom: 2 }}>{pv.definition}</div>
        {pv.example && <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>"{pv.example}"</div>}
      </div>
      <button onClick={() => setEditing(true)} style={{ fontSize: 12, color: '#475569', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', flexShrink: 0 }}>編集</button>
    </div>
  )
}

function PhrasalVerbsSection({ phrasalVerbs: phrasalVerbsProp, onAdd, onUpdate, onDelete }: {
  phrasalVerbs: PhrasalVerb[]
  onAdd: (pv: PhrasalVerb) => Promise<void>
  onUpdate: (index: number, pv: PhrasalVerb) => Promise<void>
  onDelete: (index: number) => Promise<void>
}) {
  const phrasalVerbs = phrasalVerbsProp ?? []
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState(EMPTY_PV)
  const [saving, setSaving] = useState(false)

  const handleAdd = async () => {
    if (!draft.phrase.trim() || !draft.definition.trim()) return
    setSaving(true)
    try {
      await onAdd({ phrase: draft.phrase.trim(), pattern: draft.pattern, definition: draft.definition.trim(), example: draft.example.trim() })
      setDraft(EMPTY_PV)
      setAdding(false)
    } finally {
      setSaving(false)
    }
  }

  if (phrasalVerbs.length === 0 && !adding) return (
    <div style={{ marginTop: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Phrasal Verbs</div>
        <button onClick={() => setAdding(true)} style={{ fontSize: 12, color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>＋ 追加</button>
      </div>
      <div style={{ fontSize: 13, color: '#334155', fontStyle: 'italic' }}>句動詞なし</div>
    </div>
  )

  return (
    <div style={{ marginTop: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Phrasal Verbs</div>
        {!adding && (
          <button onClick={() => setAdding(true)} style={{ fontSize: 12, color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>＋ 追加</button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {phrasalVerbs.map((pv, idx) => (
          <PhrasalVerbCard
            key={idx}
            pv={pv}
            onUpdate={updated => onUpdate(idx, updated)}
            onDelete={() => onDelete(idx)}
          />
        ))}
      </div>

      {adding && (
        <div style={{ marginTop: 8, background: '#1e293b', borderRadius: 8, padding: 16, border: '1px solid #a78bfa33' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                autoFocus
                value={draft.phrase}
                onChange={e => setDraft(d => ({ ...d, phrase: e.target.value }))}
                placeholder="句動詞（例: look after）"
                style={{ flex: 1, background: '#0f172a', border: '1px solid #334155', borderRadius: 4, color: '#e2e8f0', fontSize: 13, padding: '6px 8px', outline: 'none' }}
              />
              <select
                value={draft.pattern}
                onChange={e => setDraft(d => ({ ...d, pattern: e.target.value }))}
                style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 4, color: draft.pattern ? '#e2e8f0' : '#64748b', fontSize: 13, padding: '6px 8px', outline: 'none', width: 70 }}
              >
                <option value="">文型</option>
                {PATTERN_CODES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <input
              value={draft.definition}
              onChange={e => setDraft(d => ({ ...d, definition: e.target.value }))}
              placeholder="日本語の意味（例: 〜の世話をする）"
              style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 4, color: '#e2e8f0', fontSize: 13, padding: '6px 8px', outline: 'none' }}
            />
            <input
              value={draft.example}
              onChange={e => setDraft(d => ({ ...d, example: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false) }}
              placeholder="例文（任意）"
              style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 4, color: '#e2e8f0', fontSize: 13, padding: '6px 8px', outline: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
            <button onClick={handleAdd} disabled={saving || !draft.phrase.trim() || !draft.definition.trim()} style={{ fontSize: 13, color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer', padding: 0, opacity: saving ? 0.5 : 1 }}>
              {saving ? '保存中...' : '追加'}
            </button>
            <button onClick={() => { setAdding(false); setDraft(EMPTY_PV) }} style={{ fontSize: 13, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Add flow ───────────────────────────────────────────────────────────────────

function AddVerbPreview({ draft, saving, allTags, onDraftChange, onSave, onCancel }: {
  draft: Verb; saving: boolean; allTags: string[]
  onDraftChange: (v: Verb) => void; onSave: () => void; onCancel: () => void
}) {
  const [tagInput, setTagInput] = useState('')

  const addTag = (tag: string) => {
    const t = tag.trim()
    if (!t || draft.tags.includes(t)) { setTagInput(''); return }
    onDraftChange({ ...draft, tags: [...draft.tags, t] })
    setTagInput('')
  }

  const removeTag = (tag: string) => onDraftChange({ ...draft, tags: draft.tags.filter(t => t !== tag) })

  const suggestions = allTags.filter(t => !draft.tags.includes(t) && t.toLowerCase().includes(tagInput.toLowerCase()))

  return (
    <div>
      <h1 style={{ margin: '0 0 4px', fontSize: 40, fontWeight: 700, color: '#f1f5f9' }}>{draft.base}</h1>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>GPT-4o が生成した叩き台です。確認・編集して保存してください。</div>
      <VerbMetaEditor draft={draft} onDraftChange={onDraftChange} />
      {/* Sources (tags) */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', marginBottom: 6 }}>Sources</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: suggestions.length > 0 ? 6 : 0 }}>
          {draft.tags.map(tag => (
            <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 12, background: '#334155', color: '#94a3b8', fontSize: 12 }}>
              {tag}
              <button onClick={() => removeTag(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0, lineHeight: 1, fontSize: 12 }}>✕</button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput) } }}
            placeholder="+ source"
            style={{ background: 'none', border: 'none', outline: 'none', color: '#94a3b8', fontSize: 12, width: 80, padding: '3px 0' }}
          />
        </div>
        {suggestions.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {suggestions.map(tag => (
              <button key={tag} onClick={() => addTag(tag)} style={{ padding: '2px 8px', borderRadius: 10, border: '1px solid #334155', background: 'transparent', color: '#64748b', fontSize: 11, cursor: 'pointer' }}>
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button onClick={onSave} disabled={saving} style={{ padding: '8px 20px', borderRadius: 6, border: 'none', cursor: saving ? 'default' : 'pointer', background: saving ? '#1e3a5f' : '#3b82f6', color: '#fff', fontWeight: 600, fontSize: 14 }}>
          {saving ? 'Saving...' : 'Save verb'}
        </button>
        <button onClick={onCancel} disabled={saving} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #334155', cursor: 'pointer', background: 'transparent', color: '#94a3b8', fontSize: 14 }}>Cancel</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {draft.patterns.map((vp, idx) => (
          <PatternEditCard key={vp.code} vp={vp} idx={idx} draft={draft} onDraftChange={onDraftChange} />
        ))}
      </div>
    </div>
  )
}

// ── Verb detail (view + edit) ──────────────────────────────────────────────────

function VerbDetail({ verb, phrases: _phrases, onUpdated, onDeleted }: {
  verb: Verb; phrases: Phrase[]
  onUpdated: (v: Verb) => void; onDeleted: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Verb>(verb)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirming, setDeleteConfirming] = useState(false)

  // Add pattern form state
  const [addingPattern, setAddingPattern] = useState(false)
  const [newCode, setNewCode] = useState<string>('V3')
  const [newDesc, setNewDesc] = useState('')

  useEffect(() => {
    setDraft(verb)
    setEditing(false)
    setError(null)
    setDeleteConfirming(false)
    setAddingPattern(false)
  }, [verb.id])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const saved = await updateVerb(draft)
      onUpdated(saved)
      setEditing(false)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setDraft(verb)
    setEditing(false)
    setError(null)
    setDeleteConfirming(false)
    setAddingPattern(false)
  }

  const handleDeleteSense = async (code: string, description: string) => {
    const updated = { ...verb, patterns: verb.patterns.filter(p => !(p.code === code && p.description === description)) }
    try {
      const saved = await updateVerb(updated)
      onUpdated(saved)
    } catch (e) {
      setError(String(e))
    }
  }

  const handleTagAdd = async (tag: string) => {
    const trimmed = tag.trim()
    if (!trimmed || verb.tags.includes(trimmed)) return
    const updated = { ...verb, tags: [...verb.tags, trimmed] }
    try {
      const saved = await updateVerb(updated)
      onUpdated(saved)
    } catch (e) {
      setError(String(e))
    }
  }

  const handleTagRemove = async (tag: string) => {
    const updated = { ...verb, tags: verb.tags.filter(t => t !== tag) }
    try {
      const saved = await updateVerb(updated)
      onUpdated(saved)
    } catch (e) {
      setError(String(e))
    }
  }

  const handleDelete = async () => {
    setSaving(true)
    try {
      await deleteVerb(verb.id)
      onDeleted(verb.id)
    } catch (e) {
      setError(String(e))
      setSaving(false)
      setDeleteConfirming(false)
    }
  }

  const handleAddPattern = () => {
    if (!newDesc.trim()) return
    setDraft({ ...draft, patterns: [...draft.patterns, { code: newCode, description: newDesc.trim(), examples: [] }] })
    setNewDesc('')
    setNewCode('V3')
    setAddingPattern(false)
  }

  if (editing) {
    return (
      <div>
        <h1 style={{ margin: '0 0 4px', fontSize: 40, fontWeight: 700, color: '#f1f5f9' }}>{draft.base}</h1>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>編集モード</div>
        <VerbMetaEditor draft={draft} onDraftChange={setDraft} />
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, alignItems: 'center' }}>
          <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', borderRadius: 6, border: 'none', cursor: saving ? 'default' : 'pointer', background: saving ? '#1e3a5f' : '#3b82f6', color: '#fff', fontWeight: 600, fontSize: 14 }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={handleCancel} disabled={saving} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #334155', cursor: 'pointer', background: 'transparent', color: '#94a3b8', fontSize: 14 }}>Cancel</button>
          {error && <span style={{ fontSize: 12, color: '#ef4444' }}>{error}</span>}
        </div>

        {/* Pattern cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {draft.patterns.map((vp, idx) => (
            <PatternEditCard key={`${vp.code}-${idx}`} vp={vp} idx={idx} draft={draft} onDraftChange={setDraft} />
          ))}
        </div>

        {/* Add pattern */}
        <div style={{ marginTop: 16 }}>
          {addingPattern ? (
            <div style={{ background: '#1e293b', borderRadius: 12, padding: '16px', border: '1px solid #334155' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <select
                  value={newCode}
                  onChange={e => setNewCode(e.target.value)}
                  style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 4, color: '#e2e8f0', fontSize: 13, padding: '5px 8px', outline: 'none' }}
                >
                  {PATTERN_CODES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input
                  autoFocus
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddPattern(); if (e.key === 'Escape') setAddingPattern(false) }}
                  placeholder="説明（日本語）例: 自動詞（目的語なし）"
                  style={{ flex: 1, background: '#0f172a', border: '1px solid #334155', borderRadius: 4, color: '#e2e8f0', fontSize: 13, padding: '5px 8px', outline: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={handleAddPattern} style={{ fontSize: 13, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>追加</button>
                <button onClick={() => { setAddingPattern(false); setNewDesc('') }} style={{ fontSize: 13, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>キャンセル</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAddingPattern(true)} style={{ fontSize: 13, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0' }}>
              ＋ パターンを追加
            </button>
          )}
        </div>

        {/* Delete section */}
        <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #1e293b' }}>
          {deleteConfirming ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 13, color: '#94a3b8' }}>本当に削除しますか？</span>
              <button onClick={handleDelete} disabled={saving} style={{ fontSize: 13, color: '#fff', background: '#ef4444', border: 'none', borderRadius: 4, padding: '5px 12px', cursor: 'pointer' }}>削除する</button>
              <button onClick={() => setDeleteConfirming(false)} style={{ fontSize: 13, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>キャンセル</button>
            </div>
          ) : (
            <button onClick={() => setDeleteConfirming(true)} style={{ fontSize: 13, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              この動詞を削除
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── read-only view ──
  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
              <h1 style={{ margin: 0, fontSize: 40, fontWeight: 700, color: '#f1f5f9' }}>{verb.base}</h1>
              {verb.nounForm && <span style={{ fontSize: 14, color: '#64748b' }}>名詞: <em>{verb.nounForm}</em></span>}
              {verb.adjForm && <span style={{ fontSize: 14, color: '#64748b' }}>形容詞: <em>{verb.adjForm}</em></span>}
            </div>

            {/* Pattern badges */}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {[...new Set(verb.patterns.map(vp => vp.code))].map(code => (
                <span key={code} style={{ padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: patternColor(code) + '22', color: patternColor(code), border: `1px solid ${patternColor(code)}44` }}>{code}</span>
              ))}
            </div>

            {/* Source tags */}
            <VerbTagsRow tags={verb.tags} onAdd={handleTagAdd} onRemove={handleTagRemove} />
          </div>

          <button
            onClick={() => setEditing(true)}
            style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', fontSize: 13, cursor: 'pointer', flexShrink: 0, marginLeft: 16 }}
          >Edit</button>
        </div>
      </div>

      {/* Relations */}
      {(verb.confusableWith.length > 0 || verb.similarTo.length > 0) && (
        <div style={{ display: 'flex', gap: 32, marginBottom: 32 }}>
          {verb.confusableWith.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>混同注意</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {verb.confusableWith.map(w => <span key={w} style={{ padding: '4px 10px', borderRadius: 999, background: '#7f1d1d22', color: '#fca5a5', border: '1px solid #7f1d1d44', fontSize: 13 }}>{w}</span>)}
              </div>
            </div>
          )}
          {verb.similarTo.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>類似表現</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {verb.similarTo.map(w => <span key={w} style={{ padding: '4px 10px', borderRadius: 999, background: '#14532d22', color: '#86efac', border: '1px solid #14532d44', fontSize: 13 }}>{w}</span>)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Verb memo */}
      {verb.memo && (
        <div style={{ marginBottom: 28, padding: '12px 16px', background: '#1e293b', borderRadius: 8, borderLeft: '3px solid #334155' }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#475569', marginBottom: 6 }}>メモ</div>
          <div style={{ fontSize: 13, color: '#94a3b8', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{verb.memo}</div>
        </div>
      )}

      {/* Patterns — grouped by code so V1×6 collapses to one V1 block */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {Object.entries(
          verb.patterns.reduce<Record<string, VerbPattern[]>>((acc, vp) => {
            ;(acc[vp.code] ??= []).push(vp)
            return acc
          }, {})
        ).map(([code, senses]) => {
          const color = patternColor(code)
          return (
            <div key={code} style={{ background: '#1e293b', borderRadius: 12, overflow: 'hidden', border: `1px solid ${color}33` }}>
              {/* Header */}
              <div style={{ padding: '12px 20px', borderBottom: `1px solid ${color}22`, background: color + '11', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 700, color, fontSize: 13 }}>{code}</span>
              </div>

              {/* Senses — each with description + examples */}
              <div style={{ padding: '14px 20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {senses.map((vp, si) => (
                  <div key={si} style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: '#e2e8f0', marginBottom: 6, fontWeight: 500 }}>{vp.description}</div>
                      {vp.examples.filter(ex => ex.trim()).map((ex, i) => (
                        <div key={i} style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic', lineHeight: 1.6 }}>"{ex}"</div>
                      ))}
                      {vp.memo && (
                        <div style={{ marginTop: 6, fontSize: 12, color: '#94a3b8', background: '#0f172a', padding: '6px 10px', borderRadius: 6 }}>{vp.memo}</div>
                      )}
                    </div>
                    <button
                      onClick={() => void handleDeleteSense(code, vp.description)}
                      title="このセンスを削除"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#334155', fontSize: 14, padding: '2px 4px', lineHeight: 1, flexShrink: 0, alignSelf: 'flex-start' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#334155')}
                    >✕</button>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <PhrasalVerbsSection
        phrasalVerbs={verb.phrasalVerbs}
        onAdd={async (pv) => {
          const saved = await updateVerb({ ...verb, phrasalVerbs: [...(verb.phrasalVerbs ?? []), pv] })
          onUpdated(saved)
        }}
        onUpdate={async (idx, pv) => {
          const next = (verb.phrasalVerbs ?? []).map((p, i) => i === idx ? pv : p)
          const saved = await updateVerb({ ...verb, phrasalVerbs: next })
          onUpdated(saved)
        }}
        onDelete={async (idx) => {
          const next = (verb.phrasalVerbs ?? []).filter((_, i) => i !== idx)
          const saved = await updateVerb({ ...verb, phrasalVerbs: next })
          onUpdated(saved)
        }}
      />
    </div>
  )
}
