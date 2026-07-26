import { useState } from 'react'
import type { Phrase, Verb, Register, PhraseType } from '../types'
import { getStrengthColor, getStrengthLabel, today } from '../utils'
import { analyzePhrase, savePhrase, updatePhrase, addAlternativeToPhrase } from '../api'
import type { AnalyzeResponse } from '../api'

type DueFilter = 'all' | 'due' | 'ok'

const TYPE_LABELS: Record<PhraseType, string> = {
  sentence: '文',
  phrasal_verb: '句動詞',
  idiom: 'イディオム',
  fixed_phrase: '固定表現',
}

const TYPE_COLOR: Record<PhraseType, string> = {
  sentence: '#6366f1',
  phrasal_verb: '#0891b2',
  idiom: '#7c3aed',
  fixed_phrase: '#059669',
}

interface EditState {
  text: string
  japanese: string
  note: string
  verb_id: string
  type: PhraseType
  register: Register
  example: string
}

interface Props {
  verbs: Verb[]
  phrases: Phrase[]
  onPhrasesAdded: (phrases: Phrase[]) => void
  onPhraseUpdated: (phrase: Phrase) => void
}

export function VariantB({ verbs, phrases, onPhrasesAdded, onPhraseUpdated }: Props) {
  const [verbFilter, setVerbFilter] = useState('all')
  const [patternFilter, setPatternFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState<'all' | PhraseType>('all')
  const [registerFilter, setRegisterFilter] = useState<'all' | Register>('all')
  const [dueFilter, setDueFilter] = useState<DueFilter>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState>({ text: '', japanese: '', note: '', verb_id: '', type: 'sentence', register: 'informal', example: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Quick Add state
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [qaInput, setQaInput] = useState('')
  const [qaAnalyzing, setQaAnalyzing] = useState(false)
  const [qaResult, setQaResult] = useState<AnalyzeResponse | null>(null)
  const [qaError, setQaError] = useState<string | null>(null)
  const [qaSaving, setQaSaving] = useState(false)

  // Add alternative state
  const [addingPhraseId, setAddingPhraseId] = useState<string | null>(null)
  const [addAltInput, setAddAltInput] = useState('')
  const [addAltAnalyzing, setAddAltAnalyzing] = useState(false)
  const [addAltResult, setAddAltResult] = useState<AnalyzeResponse | null>(null)
  const [addAltSaving, setAddAltSaving] = useState(false)
  const [addAltError, setAddAltError] = useState<string | null>(null)

  const NOW = today()
  const dueToday = phrases.filter(p => p.dueDate <= NOW)
  const weakest = [...phrases].sort((a, b) => a.easeFactor - b.easeFactor)[0]
  const uniquePatterns = [...new Set(phrases.map(p => p.pattern))].filter(Boolean).sort()

  const filtered = phrases.filter(p => {
    if (verbFilter !== 'all' && p.verbId !== verbFilter) return false
    if (patternFilter !== 'all' && p.pattern !== patternFilter) return false
    if (typeFilter !== 'all' && p.type !== typeFilter) return false
    if (registerFilter !== 'all' && p.register !== registerFilter) return false
    if (dueFilter === 'due' && p.dueDate > NOW) return false
    if (dueFilter === 'ok' && p.dueDate <= NOW) return false
    return true
  })

  async function handleAnalyze() {
    const text = qaInput.trim()
    if (!text) return
    setQaAnalyzing(true)
    setQaResult(null)
    setQaError(null)
    try {
      const result = await analyzePhrase(text)
      setQaResult(result)
    } catch {
      setQaError('分析に失敗しました。もう一度試してください。')
    } finally {
      setQaAnalyzing(false)
    }
  }

  async function handleSave() {
    if (!qaResult) return
    setQaSaving(true)
    try {
      const saved = await savePhrase({
        text: qaInput.trim(),
        japanese: qaResult.japanese,
        note: qaResult.note,
        verb_id: qaResult.verb_id,
        pattern: '',
        register: qaResult.register,
        type: qaResult.type,
        examples: qaResult.example ? [qaResult.example] : undefined,
      })
      onPhrasesAdded([saved])
      setQaInput('')
      setQaResult(null)
      setShowQuickAdd(false)
    } catch {
      setQaError('保存に失敗しました。')
    } finally {
      setQaSaving(false)
    }
  }

  function handleQuickAddKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); void handleAnalyze() }
  }

  async function handleAddAltAnalyze() {
    const text = addAltInput.trim()
    if (!text) return
    setAddAltAnalyzing(true)
    setAddAltResult(null)
    setAddAltError(null)
    try {
      const result = await analyzePhrase(text)
      setAddAltResult(result)
    } catch {
      setAddAltError('分析に失敗しました。')
    } finally {
      setAddAltAnalyzing(false)
    }
  }

  async function handleAddAltSave(phraseId: string) {
    if (!addAltResult) return
    setAddAltSaving(true)
    try {
      const updated = await addAlternativeToPhrase(phraseId, {
        text: addAltInput.trim(),
        note: addAltResult.note,
        verb_id: addAltResult.verb_id,
        register: addAltResult.register,
      })
      onPhraseUpdated(updated)
      setAddingPhraseId(null)
      setAddAltInput('')
      setAddAltResult(null)
    } catch {
      setAddAltError('保存に失敗しました。')
    } finally {
      setAddAltSaving(false)
    }
  }

  function startEdit(phrase: Phrase) {
    setEditingId(phrase.id)
    setEditState({
      text: phrase.text,
      japanese: phrase.japanese,
      note: phrase.note,
      verb_id: phrase.verbId,
      type: phrase.type ?? 'sentence',
      register: phrase.register,
      example: phrase.examples?.[0] ?? '',
    })
    setEditError(null)
  }

  async function handleEditSave(phraseId: string) {
    setEditSaving(true)
    setEditError(null)
    try {
      const updated = await updatePhrase(phraseId, {
        text: editState.text,
        japanese: editState.japanese,
        note: editState.note,
        verb_id: editState.verb_id,
        type: editState.type,
        register: editState.register,
        examples: editState.example ? [editState.example] : [],
      })
      onPhraseUpdated(updated)
      setEditingId(null)
    } catch {
      setEditError('保存に失敗しました。')
    } finally {
      setEditSaving(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>Phrase Library</h1>
        <button
          onClick={() => { setShowQuickAdd(v => !v); setQaResult(null); setQaError(null) }}
          style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: showQuickAdd ? '#e0e7ff' : '#6366f1', color: showQuickAdd ? '#6366f1' : '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
        >
          {showQuickAdd ? '✕ 閉じる' : '+ Quick Add'}
        </button>
      </div>

      {/* Quick Add panel */}
      {showQuickAdd && (
        <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 24px' }}>
          <div style={{ maxWidth: 560, margin: '0 auto' }}>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>
              フレーズを入力すると AI が日本語訳・種類・用法メモを自動で補完します
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={qaInput}
                onChange={e => { setQaInput(e.target.value); setQaResult(null) }}
                onKeyDown={handleQuickAddKeyDown}
                placeholder="例: come across, in need of, have to do with..."
                style={{ flex: 1, padding: '9px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', color: '#0f172a', background: '#fff' }}
              />
              <button
                onClick={() => void handleAnalyze()}
                disabled={!qaInput.trim() || qaAnalyzing}
                style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: qaInput.trim() && !qaAnalyzing ? '#6366f1' : '#e2e8f0', color: qaInput.trim() && !qaAnalyzing ? '#fff' : '#94a3b8', fontWeight: 600, fontSize: 13, cursor: qaInput.trim() && !qaAnalyzing ? 'pointer' : 'default' }}
              >
                {qaAnalyzing ? '分析中...' : '分析'}
              </button>
            </div>

            {qaError && (
              <div style={{ marginTop: 10, fontSize: 13, color: '#ef4444' }}>{qaError}</div>
            )}

            {qaResult && (
              <div style={{ marginTop: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>{qaInput.trim()}</div>
                    <div style={{ fontSize: 14, color: '#475569', marginBottom: 10 }}>{qaResult.japanese}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                      <Tag color={TYPE_COLOR[qaResult.type]}>{TYPE_LABELS[qaResult.type]}</Tag>
                      {qaResult.verb_id && <Tag color="#3b82f6">{qaResult.verb_id}</Tag>}
                      <Tag color={qaResult.register === 'formal' ? '#0369a1' : '#92400e'}>
                        {qaResult.register === 'formal' ? 'Formal' : 'Informal'}
                      </Tag>
                    </div>
                    {qaResult.note && (
                      <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, borderLeft: '3px solid #cbd5e1', paddingLeft: 10, marginBottom: qaResult.example ? 8 : 0 }}>
                        {qaResult.note}
                      </div>
                    )}
                    {qaResult.example && (
                      <div style={{ fontSize: 13, color: '#334155', background: '#f1f5f9', borderRadius: 6, padding: '8px 12px', fontStyle: 'italic' }}>
                        "{qaResult.example}"
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button
                    onClick={() => void handleSave()}
                    disabled={qaSaving}
                    style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', background: qaSaving ? '#e2e8f0' : '#6366f1', color: qaSaving ? '#94a3b8' : '#fff', fontWeight: 600, fontSize: 13, cursor: qaSaving ? 'default' : 'pointer' }}
                  >
                    {qaSaving ? '保存中...' : '保存'}
                  </button>
                  <button
                    onClick={() => { setQaResult(null); setQaInput('') }}
                    style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 13, cursor: 'pointer' }}
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
          <SummaryCard label="保存済み" value={phrases.length} unit="phrases" color="#3b82f6" />
          <SummaryCard label="Due today" value={dueToday.length} unit="phrases" color="#ef4444" />
          <SummaryCard
            label="最弱パターン"
            value={weakest?.verbId ?? '—'}
            unit={weakest ? `(${getStrengthLabel(weakest.easeFactor)})` : ''}
            color="#f59e0b"
          />
        </div>

        {/* Filters */}
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: 16, marginBottom: 20 }}>
          <FilterRow label="種類">
            <Chip active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>All</Chip>
            {(Object.keys(TYPE_LABELS) as PhraseType[]).map(t => (
              <Chip key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>{TYPE_LABELS[t]}</Chip>
            ))}
          </FilterRow>
          <FilterRow label="動詞">
            <Chip active={verbFilter === 'all'} onClick={() => setVerbFilter('all')}>All</Chip>
            {verbs.map(v => (
              <Chip key={v.id} active={verbFilter === v.id} onClick={() => setVerbFilter(v.id)}>{v.base}</Chip>
            ))}
          </FilterRow>
          <FilterRow label="パターン">
            <Chip active={patternFilter === 'all'} onClick={() => setPatternFilter('all')}>All</Chip>
            {uniquePatterns.map(p => (
              <Chip key={p} active={patternFilter === p} onClick={() => setPatternFilter(p)}>{p}</Chip>
            ))}
          </FilterRow>
          <FilterRow label="レジスター">
            {(['all', 'formal', 'informal'] as const).map(r => (
              <Chip key={r} active={registerFilter === r} onClick={() => setRegisterFilter(r)}>
                {r === 'all' ? 'All' : r === 'formal' ? 'Formal' : 'Informal'}
              </Chip>
            ))}
          </FilterRow>
          <FilterRow label="状態" last>
            {(['all', 'due', 'ok'] as const).map(d => (
              <Chip key={d} active={dueFilter === d} onClick={() => setDueFilter(d)}>
                {d === 'all' ? 'All' : d === 'due' ? 'Due now' : 'Not due'}
              </Chip>
            ))}
          </FilterRow>
        </div>

        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>{filtered.length} phrases</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(phrase => {
            const verb = verbs.find(v => v.id === phrase.verbId)
            const isExpanded = expandedId === phrase.id
            const isDue = phrase.dueDate <= NOW

            return (
              <div
                key={phrase.id}
                onClick={() => setExpandedId(isExpanded ? null : phrase.id)}
                style={{
                  background: '#fff',
                  borderRadius: 10,
                  border: `1px solid ${isDue ? '#fecaca' : '#e2e8f0'}`,
                  padding: '14px 16px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, color: '#0f172a', marginBottom: 4 }}>{phrase.text}</div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>{phrase.japanese}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      <Tag color={TYPE_COLOR[phrase.type ?? 'sentence']}>{TYPE_LABELS[phrase.type ?? 'sentence']}</Tag>
                      {verb && <Tag color="#3b82f6">{verb.base}</Tag>}
                      {phrase.pattern && <Tag color="#8b5cf6">{phrase.pattern}</Tag>}
                      <Tag color={phrase.register === 'formal' ? '#0369a1' : '#92400e'}>
                        {phrase.register === 'formal' ? 'Formal' : 'Informal'}
                      </Tag>
                      {isDue && <Tag color="#ef4444">Due</Tag>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <StrengthBar value={phrase.easeFactor} />
                    <div style={{ fontSize: 12, color: getStrengthColor(phrase.easeFactor), marginTop: 4, fontWeight: 600 }}>
                      {getStrengthLabel(phrase.easeFactor)}
                    </div>
                  </div>
                </div>
                {isExpanded && editingId !== phrase.id && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }} onClick={e => e.stopPropagation()}>
                    {phrase.note && (
                      <div style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: 6, fontSize: 13, color: '#475569', borderLeft: '3px solid #cbd5e1' }}>
                        {phrase.note}
                      </div>
                    )}
                    {phrase.examples?.map((ex, i) => (
                      <div key={i} style={{ padding: '8px 12px', background: '#f1f5f9', borderRadius: 6, fontSize: 13, color: '#334155', fontStyle: 'italic' }}>
                        "{ex}"
                      </div>
                    ))}

                    {/* Alternatives */}
                    {phrase.alternatives && phrase.alternatives.length > 0 && (
                      <div style={{ marginTop: 4 }}>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>他の言い方</div>
                        {phrase.alternatives.map((alt, i) => (
                          <div key={i} style={{ padding: '8px 12px', background: '#f8faff', borderRadius: 6, fontSize: 13, color: '#334155', marginBottom: 4, borderLeft: '3px solid #a5b4fc' }}>
                            <div style={{ color: '#0f172a' }}>{alt.text}</div>
                            {alt.note && <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>{alt.note}</div>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add alternative */}
                    {addingPhraseId === phrase.id ? (
                      <div style={{ background: '#f8faff', borderRadius: 8, padding: 12, border: '1px solid #e0e7ff' }}>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                          <input
                            value={addAltInput}
                            onChange={e => setAddAltInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void handleAddAltAnalyze() } }}
                            placeholder="他の英語表現を入力..."
                            style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none' }}
                            autoFocus
                          />
                          <button
                            onClick={() => void handleAddAltAnalyze()}
                            disabled={addAltAnalyzing || !addAltInput.trim()}
                            style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff', fontSize: 13, cursor: 'pointer' }}
                          >
                            {addAltAnalyzing ? '...' : '分析'}
                          </button>
                          <button
                            onClick={() => { setAddingPhraseId(null); setAddAltInput(''); setAddAltResult(null) }}
                            style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#64748b' }}
                          >✕</button>
                        </div>
                        {addAltResult && (
                          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                            <div style={{ fontSize: 13, color: '#0f172a' }}>{addAltInput.trim()}</div>
                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{addAltResult.note}</div>
                            <button
                              onClick={() => void handleAddAltSave(phrase.id)}
                              disabled={addAltSaving}
                              style={{ marginTop: 8, width: '100%', padding: '7px', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                            >
                              {addAltSaving ? '保存中...' : '追加'}
                            </button>
                          </div>
                        )}
                        {addAltError && <div style={{ fontSize: 12, color: '#ef4444' }}>{addAltError}</div>}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <button
                          onClick={() => { setAddingPhraseId(phrase.id); setAddAltInput(''); setAddAltResult(null); setAddAltError(null) }}
                          style={{ fontSize: 12, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        >
                          + 他の言い方を追加
                        </button>
                        <button
                          onClick={() => startEdit(phrase)}
                          style={{ fontSize: 12, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        >
                          編集
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {editingId === phrase.id && (
                  <div onClick={e => e.stopPropagation()} style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <EditField label="English" value={editState.text} onChange={v => setEditState(s => ({ ...s, text: v }))} />
                    <EditField label="日本語" value={editState.japanese} onChange={v => setEditState(s => ({ ...s, japanese: v }))} />
                    <EditField label="例文" value={editState.example} onChange={v => setEditState(s => ({ ...s, example: v }))} placeholder="例: I came across this article while reading." />
                    <EditField label="メモ" value={editState.note} onChange={v => setEditState(s => ({ ...s, note: v }))} multiline />
                    <EditField label="動詞" value={editState.verb_id} onChange={v => setEditState(s => ({ ...s, verb_id: v }))} placeholder="例: come, get, have..." />
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#94a3b8', width: 48, flexShrink: 0 }}>種類</span>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {(Object.keys(TYPE_LABELS) as PhraseType[]).map(t => (
                          <button key={t} onClick={() => setEditState(s => ({ ...s, type: t }))} style={{ padding: '3px 10px', borderRadius: 999, border: editState.type === t ? `1px solid ${TYPE_COLOR[t]}` : '1px solid #e2e8f0', background: editState.type === t ? TYPE_COLOR[t] + '18' : '#fff', color: editState.type === t ? TYPE_COLOR[t] : '#475569', fontSize: 12, cursor: 'pointer', fontWeight: editState.type === t ? 600 : 400 }}>
                            {TYPE_LABELS[t]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#94a3b8', width: 48, flexShrink: 0 }}>Register</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {(['formal', 'informal'] as Register[]).map(r => (
                          <button key={r} onClick={() => setEditState(s => ({ ...s, register: r }))} style={{ padding: '3px 10px', borderRadius: 999, border: editState.register === r ? '1px solid #3b82f6' : '1px solid #e2e8f0', background: editState.register === r ? '#eff6ff' : '#fff', color: editState.register === r ? '#1d4ed8' : '#475569', fontSize: 12, cursor: 'pointer', fontWeight: editState.register === r ? 600 : 400 }}>
                            {r === 'formal' ? 'Formal' : 'Informal'}
                          </button>
                        ))}
                      </div>
                    </div>
                    {editError && <div style={{ fontSize: 12, color: '#ef4444' }}>{editError}</div>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => void handleEditSave(phrase.id)} disabled={editSaving} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: editSaving ? '#e2e8f0' : '#6366f1', color: editSaving ? '#94a3b8' : '#fff', fontWeight: 600, fontSize: 13, cursor: editSaving ? 'default' : 'pointer' }}>
                        {editSaving ? '保存中...' : '保存'}
                      </button>
                      <button onClick={() => setEditingId(null)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 13, cursor: 'pointer' }}>
                        キャンセル
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 14 }}>
              {phrases.length === 0 ? 'No phrases yet. Start chatting with your English teacher!' : 'No matches for the current filters.'}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

function SummaryCard({ label, value, unit, color }: { label: string; value: number | string; unit: string; color: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: 16, borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#94a3b8' }}>{unit}</div>
    </div>
  )
}

function FilterRow({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: last ? 0 : 12, marginBottom: last ? 0 : 12, borderBottom: last ? 'none' : '1px solid #f1f5f9' }}>
      <span style={{ fontSize: 12, color: '#94a3b8', width: 60, flexShrink: 0 }}>{label}</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '4px 12px',
      borderRadius: 999,
      border: active ? '1px solid #3b82f6' : '1px solid #e2e8f0',
      background: active ? '#eff6ff' : '#fff',
      color: active ? '#1d4ed8' : '#475569',
      fontSize: 13,
      cursor: 'pointer',
      fontWeight: active ? 600 : 400,
    }}>
      {children}
    </button>
  )
}

function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, background: color + '18', color, border: `1px solid ${color}30`, fontWeight: 600 }}>
      {children}
    </span>
  )
}

function StrengthBar({ value }: { value: number }) {
  const pct = Math.min(100, ((value - 1.3) / (2.5 - 1.3)) * 100)
  const color = getStrengthColor(value)
  return (
    <div style={{ width: 64, height: 6, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 999 }} />
    </div>
  )
}

function EditField({ label, value, onChange, placeholder, multiline }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  multiline?: boolean
}) {
  const shared: React.CSSProperties = {
    flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid #e2e8f0',
    fontSize: 13, color: '#0f172a', background: '#fff', outline: 'none',
    fontFamily: 'system-ui, sans-serif',
  }
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: multiline ? 'flex-start' : 'center' }}>
      <span style={{ fontSize: 12, color: '#94a3b8', width: 48, flexShrink: 0, paddingTop: multiline ? 8 : 0 }}>{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          style={{ ...shared, resize: 'vertical' }}
        />
      ) : (
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={shared}
        />
      )}
    </div>
  )
}
