import { useState, useMemo, useCallback } from 'react'
import type { Phrase } from '../types'
import { savePhrase, extractVocab, reviewPhrase } from '../api'
import type { VocabExtractItem } from '../api'

type VocabType = 'noun' | 'adjective' | 'collocation' | 'idiom'
const VOCAB_TYPES: VocabType[] = ['noun', 'adjective', 'collocation', 'idiom']

const TYPE_COLOR: Record<VocabType, string> = {
  noun: '#3b82f6',
  adjective: '#10b981',
  collocation: '#f59e0b',
  idiom: '#8b5cf6',
}
const TYPE_LABEL: Record<VocabType, string> = {
  noun: '名詞',
  adjective: '形容詞',
  collocation: 'コロケーション',
  idiom: 'イディオム',
}

interface ExtractedItem extends VocabExtractItem {
  itemId: string
  checked: boolean
}

interface Props {
  phrases: Phrase[]
  onPhrasesAdded: (phrases: Phrase[]) => void
  onPhraseReviewed: (phrase: Phrase) => void
}

function makeCloze(sentence: string, word: string): string {
  if (!word || !sentence) return sentence
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const result = sentence.replace(new RegExp(escaped, 'i'), '___')
  if (result !== sentence) return result
  const firstWord = word.split(/\s+/)[0]
  if (firstWord && firstWord !== word) {
    const escaped2 = firstWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return sentence.replace(new RegExp(escaped2, 'i'), '___')
  }
  return sentence
}

function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 999, fontSize: 11,
      background: `${color}18`, color, border: `1px solid ${color}30`, fontWeight: 600,
    }}>
      {children}
    </span>
  )
}

function StrengthBar({ value }: { value: number }) {
  const pct = Math.min(100, ((value - 1.3) / (2.5 - 1.3)) * 100)
  const color = value < 1.8 ? '#ef4444' : value < 2.2 ? '#f59e0b' : '#22c55e'
  return (
    <div style={{ width: 48, height: 4, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color }} />
    </div>
  )
}

function SidebarItem({ label, active, due, onClick }: { label: string; active: boolean; due: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '9px 16px', background: active ? '#f8fafc' : 'transparent', border: 'none',
        borderLeft: active ? '3px solid #6366f1' : '3px solid transparent',
        cursor: 'pointer', textAlign: 'left', width: '100%',
      }}
    >
      <span style={{
        fontSize: 13, color: active ? '#4f46e5' : '#475569', fontWeight: active ? 600 : 400,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
      }}>
        {label}
      </span>
      {due > 0 && (
        <span style={{ fontSize: 10, color: '#ef4444', background: '#fef2f2', padding: '1px 6px', borderRadius: 999, fontWeight: 600, flexShrink: 0, marginLeft: 4 }}>
          {due}
        </span>
      )}
    </button>
  )
}

function TypeChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12,
        fontWeight: active ? 600 : 400,
        border: active ? '1px solid #6366f1' : '1px solid #e2e8f0',
        background: active ? '#eff6ff' : 'transparent',
        color: active ? '#4f46e5' : '#64748b',
      }}
    >
      {children}
    </button>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 6,
  border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', color: '#0f172a', background: '#fff',
}

interface ManualAddFormProps {
  word: string
  japanese: string
  type: VocabType
  note: string
  saving: boolean
  onWordChange: (v: string) => void
  onJapaneseChange: (v: string) => void
  onTypeChange: (v: VocabType) => void
  onNoteChange: (v: string) => void
  onSave: () => void
  onCancel: () => void
}

function ManualAddForm({ word, japanese, type, note, saving, onWordChange, onJapaneseChange, onTypeChange, onNoteChange, onSave, onCancel }: ManualAddFormProps) {
  const canSave = word.trim() && !saving
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 12 }}>手動で追加</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input value={word} onChange={e => onWordChange(e.target.value)} placeholder="単語・表現（英語）" style={inputStyle} />
        <input value={japanese} onChange={e => onJapaneseChange(e.target.value)} placeholder="日本語訳" style={inputStyle} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {VOCAB_TYPES.map(t => (
            <TypeChip key={t} active={type === t} onClick={() => onTypeChange(t)}>{TYPE_LABEL[t]}</TypeChip>
          ))}
        </div>
        <textarea
          value={note}
          onChange={e => onNoteChange(e.target.value)}
          placeholder="メモ（任意）"
          rows={2}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'system-ui', lineHeight: 1.5 }}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          onClick={onCancel}
          style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 13, cursor: 'pointer' }}
        >
          キャンセル
        </button>
        <button
          onClick={onSave}
          disabled={!canSave}
          style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', background: canSave ? '#6366f1' : '#e2e8f0', color: canSave ? '#fff' : '#94a3b8', fontWeight: 600, fontSize: 13, cursor: canSave ? 'pointer' : 'default' }}
        >
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  )
}

export function VariantE({ phrases, onPhrasesAdded, onPhraseReviewed }: Props) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const [selectedSource, setSelectedSource] = useState<string | null>(null)
  const [showPaste, setShowPaste] = useState(false)
  const [analyzed, setAnalyzed] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([])
  const [sourceInput, setSourceInput] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [typeFilter, setTypeFilter] = useState<VocabType | 'all'>('all')
  const [cardIdx, setCardIdx] = useState(0)
  const [cardFlipped, setCardFlipped] = useState(false)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [savingPhrases, setSavingPhrases] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [showManualAdd, setShowManualAdd] = useState(false)
  const [manualWord, setManualWord] = useState('')
  const [manualJapanese, setManualJapanese] = useState('')
  const [manualType, setManualType] = useState<VocabType>('noun')
  const [manualNote, setManualNote] = useState('')
  const [manualSaving, setManualSaving] = useState(false)

  const vocabPhrases = useMemo(
    () => phrases.filter(p => (VOCAB_TYPES as string[]).includes(p.type)),
    [phrases],
  )

  const sources = useMemo(() => {
    const set = new Set<string>()
    for (const p of vocabPhrases) {
      if (p.source) set.add(p.source)
    }
    return Array.from(set).sort()
  }, [vocabPhrases])

  const dueCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of vocabPhrases) {
      if (p.dueDate <= today && p.source) {
        counts[p.source] = (counts[p.source] ?? 0) + 1
      }
    }
    return counts
  }, [vocabPhrases, today])

  const totalDue = useMemo(() => vocabPhrases.filter(p => p.dueDate <= today).length, [vocabPhrases, today])

  const filteredVocab = useMemo(() => {
    return vocabPhrases.filter(p => {
      if (selectedSource !== null && p.source !== selectedSource) return false
      if (typeFilter !== 'all' && p.type !== typeFilter) return false
      return true
    })
  }, [vocabPhrases, selectedSource, typeFilter])

  const dueInView = useMemo(() => filteredVocab.filter(p => p.dueDate <= today), [filteredVocab, today])
  const currentCard = dueInView[cardIdx] ?? null

  const selectSource = useCallback((src: string | null) => {
    setSelectedSource(src)
    setCardIdx(0)
    setCardFlipped(false)
    setSaveSuccess(false)
    setShowPaste(false)
    setShowManualAdd(false)
  }, [])

  const handleExtract = async () => {
    if (!pasteText.trim()) return
    setExtracting(true)
    setExtractError(null)
    try {
      const items = await extractVocab(pasteText)
      setExtractedItems(items.map((item, i) => ({ ...item, itemId: String(i), checked: true })))
      setAnalyzed(true)
    } catch (e) {
      setExtractError(String(e))
    } finally {
      setExtracting(false)
    }
  }

  const handleSaveExtracted = async () => {
    const toSave = extractedItems.filter(i => i.checked)
    if (toSave.length === 0) return
    setSavingPhrases(true)
    try {
      const saved = await Promise.all(toSave.map(item => savePhrase({
        text: item.example || item.word,
        japanese: item.japanese,
        note: item.word,
        verb_id: '',
        pattern: '',
        register: 'informal',
        type: item.type,
        examples: [],
        source: sourceInput.trim() || undefined,
      })))
      onPhrasesAdded(saved)
      setSaveSuccess(true)
      setShowPaste(false)
      setAnalyzed(false)
      setPasteText('')
      setExtractedItems([])
      if (sourceInput.trim()) setSelectedSource(sourceInput.trim())
    } catch (e) {
      console.error('Save extracted vocab failed:', e)
    } finally {
      setSavingPhrases(false)
    }
  }

  const handleManualSave = async () => {
    if (!manualWord.trim()) return
    setManualSaving(true)
    try {
      const saved = await savePhrase({
        text: manualWord.trim(),
        japanese: manualJapanese.trim(),
        note: manualNote.trim(),
        verb_id: '',
        pattern: '',
        register: 'informal',
        type: manualType,
        source: selectedSource ?? (sourceInput.trim() || undefined),
      })
      onPhrasesAdded([saved])
      setManualWord('')
      setManualJapanese('')
      setManualNote('')
      setShowManualAdd(false)
    } catch (e) {
      console.error('Manual save failed:', e)
    } finally {
      setManualSaving(false)
    }
  }

  const handleReview = async (quality: number) => {
    if (!currentCard || reviewingId) return
    setReviewingId(currentCard.id)
    try {
      const result = await reviewPhrase(currentCard.id, quality)
      onPhraseReviewed(result.phrase)
      setCardIdx(i => i + 1)
      setCardFlipped(false)
    } catch (e) {
      console.error('Review failed:', e)
    } finally {
      setReviewingId(null)
    }
  }

  const checkedCount = extractedItems.filter(i => i.checked).length
  const allChecked = extractedItems.length > 0 && extractedItems.every(i => i.checked)

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif', background: '#f8fafc' }}>
      {/* Sidebar */}
      <aside style={{ width: 220, background: '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto' }}>
        <div style={{ padding: '16px 16px 8px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8' }}>
          Sources
        </div>
        <SidebarItem
          label="すべて"
          active={selectedSource === null && !showPaste}
          due={totalDue}
          onClick={() => selectSource(null)}
        />
        {sources.map(src => (
          <SidebarItem
            key={src}
            label={src}
            active={selectedSource === src && !showPaste}
            due={dueCounts[src] ?? 0}
            onClick={() => selectSource(src)}
          />
        ))}
        <div style={{ marginTop: 'auto', padding: 16, borderTop: '1px solid #f1f5f9' }}>
          <button
            onClick={() => setShowPaste(true)}
            style={{ width: '100%', padding: '8px 0', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            📋 Paste & Extract
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {showPaste ? (
          <div style={{ maxWidth: 640 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Paste & Extract</h2>
              <button onClick={() => { setShowPaste(false); setAnalyzed(false) }} style={{ fontSize: 12, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}>
                ← 戻る
              </button>
            </div>

            {!analyzed ? (
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
                <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b' }}>
                  本・記事・動画からテキストを貼り付けると、覚えるべき単語・表現を自動で抽出します
                </p>
                <textarea
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  placeholder="テキストを貼り付けてください..."
                  rows={6}
                  style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', fontSize: 14, color: '#0f172a', background: '#fff', resize: 'vertical', outline: 'none', fontFamily: 'system-ui', lineHeight: 1.6 }}
                />
                <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#64748b', flexShrink: 0 }}>ソース:</span>
                  <input
                    value={sourceInput}
                    onChange={e => setSourceInput(e.target.value)}
                    placeholder="例: Atomic Habits"
                    style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', maxWidth: 240, color: '#0f172a', background: '#fff' }}
                  />
                  <button
                    onClick={handleExtract}
                    disabled={extracting || !pasteText.trim()}
                    style={{ marginLeft: 'auto', padding: '8px 24px', borderRadius: 8, border: 'none', background: extracting || !pasteText.trim() ? '#e2e8f0' : '#6366f1', color: extracting || !pasteText.trim() ? '#94a3b8' : '#fff', fontWeight: 600, fontSize: 13, cursor: extracting || !pasteText.trim() ? 'default' : 'pointer' }}
                  >
                    {extracting ? '分析中...' : '分析'}
                  </button>
                </div>
                {extractError && <p style={{ color: '#ef4444', fontSize: 13, marginTop: 8 }}>{extractError}</p>}
              </div>
            ) : (
              <div>
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 16 }}>
                  <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                        {sourceInput ? `「${sourceInput}」から ` : ''}{extractedItems.length} 件抽出
                      </div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>保存するものを選択してください</div>
                    </div>
                    <button
                      onClick={() => setExtractedItems(extractedItems.map(i => ({ ...i, checked: !allChecked })))}
                      style={{ fontSize: 12, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      {allChecked ? 'すべて解除' : 'すべて選択'}
                    </button>
                  </div>
                  {extractedItems.map(item => (
                    <label
                      key={item.itemId}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 20px', borderBottom: '1px solid #f8fafc', background: item.checked ? '#fafaff' : '#fff', cursor: 'pointer' }}
                    >
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => setExtractedItems(prev => prev.map(i => i.itemId === item.itemId ? { ...i, checked: !i.checked } : i))}
                        style={{ marginTop: 3, accentColor: '#6366f1' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{item.word}</span>
                          {TYPE_COLOR[item.type as VocabType] && (
                            <Tag color={TYPE_COLOR[item.type as VocabType]}>{TYPE_LABEL[item.type as VocabType]}</Tag>
                          )}
                        </div>
                        <div style={{ fontSize: 13, color: '#475569', marginBottom: 2 }}>{item.japanese}</div>
                        <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>{item.note}</div>
                      </div>
                    </label>
                  ))}
                  <div style={{ padding: '14px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setAnalyzed(false)}
                      style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 13, cursor: 'pointer' }}
                    >
                      やり直す
                    </button>
                    <button
                      onClick={handleSaveExtracted}
                      disabled={checkedCount === 0 || savingPhrases}
                      style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: checkedCount > 0 && !savingPhrases ? '#6366f1' : '#e2e8f0', color: checkedCount > 0 && !savingPhrases ? '#fff' : '#94a3b8', fontWeight: 600, fontSize: 13, cursor: checkedCount > 0 && !savingPhrases ? 'pointer' : 'default' }}
                    >
                      {savingPhrases ? '保存中...' : `保存 (${checkedCount}件)`}
                    </button>
                  </div>
                </div>

                {/* Manual add below extracted list */}
                {!showManualAdd ? (
                  <button
                    onClick={() => setShowManualAdd(true)}
                    style={{ width: '100%', padding: '10px 0', borderRadius: 8, border: '1px dashed #c7d2fe', background: '#fafafa', color: '#6366f1', fontSize: 13, cursor: 'pointer' }}
                  >
                    + 手動で追加
                  </button>
                ) : (
                  <ManualAddForm
                    word={manualWord}
                    japanese={manualJapanese}
                    type={manualType}
                    note={manualNote}
                    saving={manualSaving}
                    onWordChange={setManualWord}
                    onJapaneseChange={setManualJapanese}
                    onTypeChange={setManualType}
                    onNoteChange={setManualNote}
                    onSave={handleManualSave}
                    onCancel={() => setShowManualAdd(false)}
                  />
                )}
              </div>
            )}
          </div>
        ) : (
          <div>
            {saveSuccess && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#15803d' }}>
                ✓ 単語を保存しました。復習は自動でスケジュールされます。
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
                  {selectedSource ?? 'すべての単語'}
                </h2>
                {dueInView.length > 0 && (
                  <div style={{ fontSize: 12, color: '#ef4444', marginTop: 3 }}>{dueInView.length}件 due today</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <TypeChip active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>All</TypeChip>
                {VOCAB_TYPES.map(t => (
                  <TypeChip key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>{TYPE_LABEL[t]}</TypeChip>
                ))}
              </div>
            </div>

            {/* Inline review card */}
            {currentCard && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                  Today's Review ({cardIdx + 1}/{dueInView.length})
                </div>
                <div
                  onClick={() => setCardFlipped(f => !f)}
                  style={{ background: cardFlipped ? '#312e81' : '#1e293b', borderRadius: 12, padding: '24px', cursor: 'pointer', border: cardFlipped ? '1px solid #4338ca' : '1px solid #334155', marginBottom: 8, textAlign: 'center', transition: 'background 0.2s' }}
                >
                  {cardFlipped ? (
                    <div>
                      <div style={{ marginBottom: 6 }}>
                        {TYPE_COLOR[currentCard.type as VocabType] && (
                          <Tag color={TYPE_COLOR[currentCard.type as VocabType]}>{TYPE_LABEL[currentCard.type as VocabType]}</Tag>
                        )}
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 700, color: '#e0e7ff', margin: '8px 0' }}>
                        {currentCard.note || currentCard.text}
                      </div>
                      <div style={{ fontSize: 15, color: '#818cf8', marginBottom: 10 }}>{currentCard.japanese}</div>
                      {currentCard.note && (
                        <div style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic', lineHeight: 1.6 }}>
                          "{currentCard.text}"
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: '#334155', marginTop: 14 }}>タップして問題に戻る ←</div>
                    </div>
                  ) : (
                    <div style={{ color: '#f1f5f9' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                        {TYPE_COLOR[currentCard.type as VocabType] && (
                          <Tag color={TYPE_COLOR[currentCard.type as VocabType]}>{TYPE_LABEL[currentCard.type as VocabType]}</Tag>
                        )}
                        {currentCard.source && (
                          <span style={{ fontSize: 11, color: '#64748b' }}>📖 {currentCard.source}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 18, lineHeight: 1.7 }}>
                        {makeCloze(currentCard.text, currentCard.note ?? '')}
                      </div>
                      <div style={{ fontSize: 12, color: '#475569', marginTop: 12 }}>タップして答えを確認 →</div>
                    </div>
                  )}
                </div>
                {cardFlipped && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleReview(1)}
                      disabled={reviewingId !== null}
                      style={{ flex: 1, padding: 12, borderRadius: 10, background: '#7f1d1d22', border: '1px solid #7f1d1d66', color: '#fca5a5', fontSize: 14, fontWeight: 600, cursor: reviewingId ? 'default' : 'pointer' }}
                    >
                      ✗ もう一度
                    </button>
                    <button
                      onClick={() => handleReview(4)}
                      disabled={reviewingId !== null}
                      style={{ flex: 1, padding: 12, borderRadius: 10, background: '#14532d22', border: '1px solid #14532d66', color: '#86efac', fontSize: 14, fontWeight: 600, cursor: reviewingId ? 'default' : 'pointer' }}
                    >
                      ✓ 覚えた
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Manual add */}
            {!showManualAdd ? (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                <button
                  onClick={() => setShowManualAdd(true)}
                  style={{ padding: '6px 14px', borderRadius: 8, border: '1px dashed #c7d2fe', background: 'transparent', color: '#6366f1', fontSize: 13, cursor: 'pointer' }}
                >
                  + 手動で追加
                </button>
              </div>
            ) : (
              <div style={{ marginBottom: 16 }}>
                <ManualAddForm
                  word={manualWord}
                  japanese={manualJapanese}
                  type={manualType}
                  note={manualNote}
                  saving={manualSaving}
                  onWordChange={setManualWord}
                  onJapaneseChange={setManualJapanese}
                  onTypeChange={setManualType}
                  onNoteChange={setManualNote}
                  onSave={handleManualSave}
                  onCancel={() => setShowManualAdd(false)}
                />
              </div>
            )}

            {/* Word list */}
            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              All ({filteredVocab.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 80 }}>
              {filteredVocab.map(p => {
                const isDue = p.dueDate <= today
                const vocabColor = TYPE_COLOR[p.type as VocabType]
                return (
                  <div
                    key={p.id}
                    style={{ background: '#fff', borderRadius: 8, border: `1px solid ${isDue ? '#fecaca' : '#e2e8f0'}`, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12 }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>{p.note || p.text}</span>
                        {vocabColor && <Tag color={vocabColor}>{TYPE_LABEL[p.type as VocabType]}</Tag>}
                        {p.source && <span style={{ fontSize: 11, color: '#94a3b8' }}>{p.source}</span>}
                        {isDue && <Tag color="#ef4444">Due</Tag>}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{p.japanese}</div>
                      {p.note && (
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.text}</div>
                      )}
                    </div>
                    <StrengthBar value={p.easeFactor} />
                  </div>
                )
              })}
              {filteredVocab.length === 0 && (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 14 }}>
                  {selectedSource ? `「${selectedSource}」に単語はありません` : 'まだ単語がありません'}
                  <div style={{ marginTop: 12, fontSize: 13 }}>
                    📋 Paste & Extract でテキストから抽出するか、手動で追加してください
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
