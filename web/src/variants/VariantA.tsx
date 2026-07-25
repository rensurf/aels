import { useState, useEffect } from 'react'
import type { Phrase, Verb, VerbPattern } from '../types'
import { getStrengthColor, getStrengthLabel } from '../utils'
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
}

export function VariantA({ verbs, phrases, onVerbAdded, onVerbUpdated, onVerbDeleted }: Props) {
  const [selectedId, setSelectedId] = useState<string>(verbs[0]?.id ?? '')
  const [addState, setAddState] = useState<AddState>({ status: 'idle' })

  const selectedVerb = verbs.find(v => v.id === selectedId)
  const isAdding = addState.status !== 'idle'

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
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif', background: '#0f172a', color: '#e2e8f0' }}>
      {/* Sidebar */}
      <aside style={{ width: 200, background: '#1e293b', borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '16px 12px 8px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Verbs</span>
          <button
            onClick={() => { if (!isAdding) setAddState({ status: 'entering', input: '' }) }}
            title="Add verb"
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: isAdding ? 'default' : 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px', opacity: isAdding ? 0.4 : 1 }}
          >+</button>
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

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {verbs.map(verb => {
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
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflowY: 'auto', padding: 32 }}>
        {addState.status === 'preview'
          ? <AddVerbPreview draft={addState.draft} saving={addState.saving} onDraftChange={handleDraftChange} onSave={handleSave} onCancel={handleCancel} />
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
        }
      </main>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 700, color, fontSize: 13 }}>{vp.code}</span>
          <span style={{ color: '#94a3b8', fontSize: 13 }}>{vp.description}</span>
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
    </>
  )
}

// ── Add flow ───────────────────────────────────────────────────────────────────

function AddVerbPreview({ draft, saving, onDraftChange, onSave, onCancel }: {
  draft: Verb; saving: boolean
  onDraftChange: (v: Verb) => void; onSave: () => void; onCancel: () => void
}) {
  return (
    <div>
      <h1 style={{ margin: '0 0 4px', fontSize: 40, fontWeight: 700, color: '#f1f5f9' }}>{draft.base}</h1>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>GPT-4o が生成した叩き台です。確認・編集して保存してください。</div>
      <VerbMetaEditor draft={draft} onDraftChange={onDraftChange} />
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

function VerbDetail({ verb, phrases, onUpdated, onDeleted }: {
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
    const already = draft.patterns.some(p => p.code === newCode)
    const code = already ? `${newCode}′` : newCode
    setDraft({ ...draft, patterns: [...draft.patterns, { code, description: newDesc.trim(), examples: [] }] })
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
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
              <h1 style={{ margin: 0, fontSize: 40, fontWeight: 700, color: '#f1f5f9' }}>{verb.base}</h1>
              {verb.nounForm && <span style={{ fontSize: 14, color: '#64748b' }}>名詞: <em>{verb.nounForm}</em></span>}
              {verb.adjForm && <span style={{ fontSize: 14, color: '#64748b' }}>形容詞: <em>{verb.adjForm}</em></span>}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {verb.patterns.map(vp => (
                <span key={vp.code} style={{ padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: patternColor(vp.code) + '22', color: patternColor(vp.code), border: `1px solid ${patternColor(vp.code)}44` }}>{vp.code}</span>
              ))}
            </div>
          </div>
          <button
            onClick={() => setEditing(true)}
            style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', fontSize: 13, cursor: 'pointer', flexShrink: 0 }}
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

      {/* Patterns */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {verb.patterns.map((vp: VerbPattern) => {
          const patternPhrases = phrases.filter(p => p.pattern === vp.code)
          const color = patternColor(vp.code)
          return (
            <div key={vp.code} style={{ background: '#1e293b', borderRadius: 12, overflow: 'hidden', border: `1px solid ${color}33` }}>
              <div style={{ padding: '12px 20px', borderBottom: `1px solid ${color}33`, background: color + '11', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 700, color, fontSize: 13 }}>{vp.code}</span>
                <span style={{ color: '#94a3b8', fontSize: 13 }}>{vp.description}</span>
              </div>

              {/* Examples from the verb definition */}
              {vp.examples.length > 0 && (
                <div style={{ padding: '10px 20px 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {vp.examples.filter(ex => ex.trim()).map((ex, i) => (
                    <div key={i} style={{ fontSize: 13, color: '#64748b', fontStyle: 'italic' }}>"{ex}"</div>
                  ))}
                </div>
              )}

              {/* Memo */}
              {vp.memo && (
                <div style={{ padding: '8px 20px 0' }}>
                  <div style={{ fontSize: 12, color: '#475569', background: '#0f172a', padding: '6px 10px', borderRadius: 6 }}>{vp.memo}</div>
                </div>
              )}

              {/* Saved phrases */}
              {patternPhrases.length === 0 ? (
                <div style={{ padding: '16px 20px', color: '#334155', fontSize: 13, fontStyle: 'italic' }}>まだ保存フレーズなし</div>
              ) : (
                patternPhrases.map(phrase => (
                  <div key={phrase.id} style={{ padding: '14px 20px', borderTop: '1px solid #334155' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: 16, color: '#f1f5f9', marginBottom: 4 }}>{phrase.text}</div>
                        <div style={{ fontSize: 13, color: '#94a3b8' }}>{phrase.japanese}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                        <div style={{ fontSize: 12, color: getStrengthColor(phrase.easeFactor), fontWeight: 600 }}>{getStrengthLabel(phrase.easeFactor)}</div>
                        <div style={{ fontSize: 11, color: '#475569' }}>due {phrase.dueDate}</div>
                      </div>
                    </div>
                    {phrase.note && <div style={{ marginTop: 8, fontSize: 12, color: '#64748b', background: '#0f172a', padding: '8px 12px', borderRadius: 6 }}>{phrase.note}</div>}
                  </div>
                ))
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
