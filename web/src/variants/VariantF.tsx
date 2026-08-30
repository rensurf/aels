import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react'

function useIsMobile() {
  return useSyncExternalStore(
    cb => { window.addEventListener('resize', cb); return () => window.removeEventListener('resize', cb) },
    () => window.innerWidth < 768,
  )
}
import type { Topic, SpeechFeedback } from '../types'
import {
  fetchTopics,
  analyzeTopicSpeech,
  reviewTopic,
  savePhrase,
  createTopic,
  updateTopic,
  deleteTopic,
  extractTopicLevels,
  addTopicCorrection,
  deleteTopicCorrection,
} from '../api'

type HintLevel = 'en' | 'script'
type Phase = 'practice' | 'feedback' | 'done'

const today = () => new Date().toISOString().slice(0, 10)

function statusOf(t: Topic): 'due' | 'upcoming' | 'done' {
  if (t.due_date <= today()) return 'due'
  if (t.last_practiced === today()) return 'done'
  return 'upcoming'
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function HintToggle({ level, onChange }: { level: HintLevel; onChange: (l: HintLevel) => void }) {
  const levels: HintLevel[] = ['en', 'script']
  const labels: Record<HintLevel, string> = { en: 'English', script: 'Script' }
  return (
    <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 3, flexShrink: 0 }}>
      {levels.map(l => (
        <button key={l} onClick={() => onChange(l)} style={{
          border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
          background: level === l ? '#6366f1' : 'transparent',
          color: level === l ? '#fff' : '#94a3b8',
          transition: 'all 0.15s',
        }}>{labels[l]}</button>
      ))}
    </div>
  )
}

function MicButton({ recording, onToggle, disabled }: { recording: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button onClick={onToggle} disabled={disabled} title={recording ? '録音停止' : '録音開始'} style={{
      width: 56, height: 56, borderRadius: '50%', border: 'none',
      background: recording ? '#ef4444' : '#6366f1',
      color: '#fff', fontSize: 24, cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.4 : 1,
      boxShadow: recording ? '0 0 0 8px rgba(239,68,68,0.25)' : '0 4px 16px rgba(99,102,241,0.4)',
      transition: 'all 0.2s',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      {recording ? '⏹' : '🎤'}
    </button>
  )
}


type CueChunk = { chunk: string; cues: string[] }
type Levels = Record<string, CueChunk[]>

function CueChips({ cues }: { cues: string[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {cues.map((c, i) => (
        <span key={i} style={{
          background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)',
          color: '#a5b4fc', borderRadius: 6, padding: '3px 10px', fontSize: 13,
        }}>{c}</span>
      ))}
    </div>
  )
}

function LevelView({ topic, onUpdated }: { topic: Topic; onUpdated: (t: Topic) => void }) {
  const levels: Levels = topic.levels ?? {}
  const levelKeys = ['1', '2', '3']

  if (Object.keys(levels).length === 0) return null

  async function handleCueEdit(lk: string, ci: number, cueIdx: number, value: string) {
    const next: Levels = JSON.parse(JSON.stringify(levels))
    next[lk][ci].cues[cueIdx] = value
    const updated = await updateTopic(topic.topic_id, { levels: next })
    onUpdated(updated)
  }

  async function handleCueDelete(lk: string, ci: number, cueIdx: number) {
    const next: Levels = JSON.parse(JSON.stringify(levels))
    next[lk][ci].cues.splice(cueIdx, 1)
    const updated = await updateTopic(topic.topic_id, { levels: next })
    onUpdated(updated)
  }

  async function handleCueAdd(lk: string, ci: number, value: string) {
    const next: Levels = JSON.parse(JSON.stringify(levels))
    next[lk][ci].cues.push(value)
    const updated = await updateTopic(topic.topic_id, { levels: next })
    onUpdated(updated)
  }

  return (
    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {levelKeys.filter(lk => levels[lk]).map(lk => (
        <div key={lk} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 10 }}>LEVEL {lk}</div>
          {levels[lk].map((chunk, ci) => (
            <ChunkEditor key={ci} chunk={chunk} levelKey={lk} chunkIdx={ci}
              onCueEdit={(cueIdx, val) => handleCueEdit(lk, ci, cueIdx, val)}
              onCueDelete={(cueIdx) => handleCueDelete(lk, ci, cueIdx)}
              onCueAdd={(val) => handleCueAdd(lk, ci, val)}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function ChunkEditor({ chunk, onCueEdit, onCueDelete, onCueAdd }: {
  chunk: CueChunk
  levelKey: string
  chunkIdx: number
  onCueEdit: (cueIdx: number, val: string) => void
  onCueDelete: (cueIdx: number) => void
  onCueAdd: (val: string) => void
}) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editVal, setEditVal] = useState('')
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [newCue, setNewCue] = useState('')

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 6 }}>{chunk.chunk}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
        {chunk.cues.map((c, i) => (
          editingIdx === i ? (
            <div key={i} style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              <input value={editVal} onChange={e => setEditVal(e.target.value)} autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') { onCueEdit(i, editVal.trim()); setEditingIdx(null) }
                  if (e.key === 'Escape') setEditingIdx(null)
                }}
                style={{ ...inputStyle, width: 130, padding: '2px 7px', fontSize: 12 }}
              />
              <button onClick={() => { onCueEdit(i, editVal.trim()); setEditingIdx(null) }} style={{ ...smallBtn, color: '#6366f1', fontSize: 11 }}>✓</button>
              <button onClick={() => setEditingIdx(null)} style={{ ...smallBtn, color: '#94a3b8', fontSize: 11 }}>✕</button>
            </div>
          ) : (
            <div key={i} onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)}
              style={{ display: 'flex', alignItems: 'center', gap: 3,
                background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)',
                color: '#a5b4fc', borderRadius: 6, padding: '3px 8px', fontSize: 13 }}>
              <span>{c}</span>
              {hoveredIdx === i && (
                <>
                  <button onClick={() => { setEditingIdx(i); setEditVal(c) }} style={{ ...iconBtn, fontSize: 10 }}>✏️</button>
                  <button onClick={() => onCueDelete(i)} style={{ ...iconBtn, fontSize: 10 }}>🗑</button>
                </>
              )}
            </div>
          )
        ))}
        {adding ? (
          <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
            <input value={newCue} onChange={e => setNewCue(e.target.value)} autoFocus placeholder="new cue"
              onKeyDown={e => {
                if (e.key === 'Enter') { onCueAdd(newCue.trim()); setNewCue(''); setAdding(false) }
                if (e.key === 'Escape') { setAdding(false); setNewCue('') }
              }}
              style={{ ...inputStyle, width: 120, padding: '2px 7px', fontSize: 12 }}
            />
            <button onClick={() => { onCueAdd(newCue.trim()); setNewCue(''); setAdding(false) }} style={{ ...smallBtn, color: '#6366f1', fontSize: 11 }}>追加</button>
            <button onClick={() => { setAdding(false); setNewCue('') }} style={{ ...smallBtn, color: '#94a3b8', fontSize: 11 }}>✕</button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} style={{
            background: 'transparent', border: '1px dashed rgba(99,102,241,0.3)',
            color: '#6366f1', borderRadius: 5, padding: '2px 8px', fontSize: 11, cursor: 'pointer',
          }}>＋</button>
        )}
      </div>
    </div>
  )
}

function ScriptView({ topic, onSave, onLevelsExtracted }: {
  topic: Topic
  onSave: (script: string) => void
  onLevelsExtracted: (updated: Topic) => void
}) {
  const [text, setText] = useState(topic.script ?? '')
  const [extracting, setExtracting] = useState(false)

  useEffect(() => {
    setText(topic.script ?? '')
  }, [topic.topic_id, topic.script])

  async function handleExtract() {
    if (!text.trim()) return
    setExtracting(true)
    try {
      const updated = await extractTopicLevels(topic.topic_id, text)
      onLevelsExtracted(updated)
    } catch {
      alert('レベル生成に失敗しました。')
    } finally {
      setExtracting(false)
    }
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10, letterSpacing: '0.06em' }}>
        スクリプトを自由に書いて練習しよう — フォーカスを外すと自動保存
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={() => onSave(text)}
        placeholder="ここに英文スクリプトを書いてください..."
        style={{
          width: '100%', minHeight: 200, background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
          padding: '16px 18px', color: '#e2e8f0', fontSize: 15,
          lineHeight: 1.9, resize: 'vertical', outline: 'none',
          fontFamily: 'inherit', boxSizing: 'border-box',
          whiteSpace: 'pre-wrap',
        }}
      />
      {text.trim() && (
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={handleExtract} disabled={extracting} style={{
            background: 'transparent', border: '1px solid rgba(99,102,241,0.4)',
            color: '#818cf8', borderRadius: 8, padding: '7px 16px',
            fontSize: 13, cursor: extracting ? 'not-allowed' : 'pointer',
            opacity: extracting ? 0.5 : 1,
          }}>
            {extracting ? '生成中...' : '🔑 レベル生成'}
          </button>
        </div>
      )}
      <LevelView topic={topic} onUpdated={onLevelsExtracted} />
    </div>
  )
}

function CoverageBar({ score }: { score: number }) {
  const ok = score >= 90
  const color = ok ? '#22c55e' : score >= 60 ? '#fbbf24' : '#f87171'
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          カバレッジ {ok ? '✓ クリア' : ''}
        </span>
        <span style={{ fontSize: 18, fontWeight: 800, color }}>{score}%</span>
      </div>
      <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${score}%`, background: color, borderRadius: 4, transition: 'width 0.4s' }} />
      </div>
    </div>
  )
}

function FeedbackPanel({
  feedback,
  onRate,
  onSavePhrase,
  onSaveCorrection,
  saving,
}: {
  feedback: SpeechFeedback
  onRate: (quality: number) => void
  onSavePhrase: (text: string, note: string) => void
  onSaveCorrection: (original: string, corrected: string, note: string) => void
  saving: boolean
}) {
  const score = feedback.coverage_score ?? 0
  const cleared = score >= 90

  const ratings = [
    { label: '😊 余裕', quality: 5, color: '#22c55e' },
    { label: '😐 普通', quality: 3, color: '#6366f1' },
    { label: '😰 難しい', quality: 1, color: '#ef4444' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <CoverageBar score={score} />

      {cleared && (
        <div style={{
          background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: 10, padding: '14px 18px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, color: '#86efac', fontWeight: 700, marginBottom: 10 }}>
            90% 以上カバー！このトピックはひとまずOK 🎉
          </div>
          <button onClick={() => onRate(5)} style={{
            background: '#22c55e', border: 'none', color: '#fff',
            borderRadius: 8, padding: '10px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>
            ✓ クリアして次へ
          </button>
        </div>
      )}

      {feedback.grammar.length > 0 && (
        <section>
          <h4 style={{ margin: '0 0 8px', color: '#f87171', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>文法</h4>
          {feedback.grammar.map((g, i) => (
            <div key={i} style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 6, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: '#fca5a5' }}><s style={{ opacity: 0.55 }}>{g.original}</s> → <strong>{g.corrected}</strong></div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{g.note}</div>
              </div>
              <button onClick={() => onSaveCorrection(g.original, g.corrected, g.note)} title="記録する" style={{ border: '1px solid rgba(239,68,68,0.4)', background: 'transparent', color: '#f87171', borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>+ 記録</button>
            </div>
          ))}
        </section>
      )}
      {feedback.naturalness.length > 0 && (
        <section>
          <h4 style={{ margin: '0 0 8px', color: '#fbbf24', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>自然さ</h4>
          {feedback.naturalness.map((n, i) => (
            <div key={i} style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 6, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13 }}><span style={{ color: '#fca5a5' }}>✗ {n.theirs}</span></div>
                <div style={{ fontSize: 13, marginTop: 4 }}><span style={{ color: '#86efac' }}>✓ {n.native}</span></div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{n.note}</div>
              </div>
              <button onClick={() => onSaveCorrection(n.theirs, n.native, n.note)} title="記録する" style={{ border: '1px solid rgba(251,191,36,0.4)', background: 'transparent', color: '#fbbf24', borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>+ 記録</button>
            </div>
          ))}
        </section>
      )}
      {feedback.phrases.length > 0 && (
        <section>
          <h4 style={{ margin: '0 0 8px', color: '#34d399', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>抽出フレーズ</h4>
          {feedback.phrases.map((p, i) => (
            <div key={i} style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, color: '#86efac', fontWeight: 600 }}>{p.text}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{p.note}</div>
              </div>
              <button onClick={() => onSavePhrase(p.text, p.note)} disabled={saving} style={{
                border: '1px solid rgba(52,211,153,0.4)', background: 'transparent', color: '#34d399',
                borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                opacity: saving ? 0.5 : 1,
              }}>+ 保存</button>
            </div>
          ))}
        </section>
      )}
      {feedback.overall && (
        <div style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic', padding: '8px 0' }}>{feedback.overall}</div>
      )}
      {!cleared && (
        <div>
          <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 10px', textAlign: 'center' }}>難易度を評価して次の復習日を決める</p>
          <div style={{ display: 'flex', gap: 10 }}>
            {ratings.map(r => (
              <button key={r.quality} onClick={() => onRate(r.quality)} style={{
                flex: 1, padding: '12px 8px', border: `1px solid ${r.color}40`,
                background: `${r.color}15`, color: r.color,
                borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600,
              }}>{r.label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Bullet list with add / edit / delete ────────────────────────────────────


// ─── Speech input ─────────────────────────────────────────────────────────────

function SpeechInput({ onSubmit, submitting }: {
  onSubmit: (text: string) => void
  submitting: boolean
}) {
  const [text, setText] = useState('')
  const [recording, setRecording] = useState(false)
  const recognitionRef = useRef<InstanceType<typeof window.SpeechRecognitionEvent> | null>(null)

  function toggleRecording() {
    if (recording) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(recognitionRef.current as any)?.stop()
      setRecording(false)
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition as (new () => SpeechRecognitionEvent) | undefined
    if (!SR) {
      alert('このブラウザは音声入力に対応していません。テキストを入力してください。')
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new (SR as any)()
    recognition.lang = 'en-US'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = Array.from(e.results).map(r => r[0].transcript).join(' ')
      setText(transcript)
    }
    recognition.onend = () => setRecording(false)
    recognition.start()
    recognitionRef.current = recognition
    setRecording(true)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useEffect(() => () => (recognitionRef.current as any)?.stop(), [])

  return (
    <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 14, padding: '18px 20px' }}>
      <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 14 }}>ヒントを参考に話してみよう（音声 or テキスト）</div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <MicButton recording={recording} onToggle={toggleRecording} disabled={submitting} />
        <div style={{ flex: 1 }}>
          <textarea
            value={text} onChange={e => setText(e.target.value)}
            placeholder="テキストを入力..."
            style={{
              width: '100%', height: 90, background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
              padding: '10px 14px', color: '#e2e8f0', fontSize: 14,
              resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              onClick={() => { if (text.trim()) { onSubmit(text.trim()); setText('') } }}
              disabled={!text.trim() || submitting}
              style={{
                background: '#6366f1', border: 'none', color: '#fff', borderRadius: 8,
                padding: '10px 24px', fontSize: 14, fontWeight: 700,
                cursor: text.trim() && !submitting ? 'pointer' : 'not-allowed',
                opacity: text.trim() && !submitting ? 1 : 0.4,
              }}
            >
              {submitting ? '分析中...' : 'フィードバックをもらう →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function VariantF() {
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hintLevel, setHintLevel] = useState<HintLevel>('en')
  const [phase, setPhase] = useState<Phase>('practice')
  const [feedback, setFeedback] = useState<SpeechFeedback | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [userText, setUserText] = useState('')
  const [addingTopic, setAddingTopic] = useState(false)
  const [newTopicTitle, setNewTopicTitle] = useState('')
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null)
  const [editingTopicTitle, setEditingTopicTitle] = useState('')
  const [hoveredTopicId, setHoveredTopicId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isMobile = useIsMobile()
  const [addingSubForId, setAddingSubForId] = useState<string | null>(null)
  const [newSubTitle, setNewSubTitle] = useState('')
  const [moving, setMoving] = useState(false)

  useEffect(() => {
    fetchTopics()
      .then(data => {
        setTopics(data)
        const due = data.find(t => statusOf(t) === 'due')
        setSelectedId(due?.topic_id ?? data[0]?.topic_id ?? null)
      })
      .finally(() => setLoading(false))
  }, [])

  const selected = topics.find(t => t.topic_id === selectedId) ?? null

  const handleTopicUpdated = useCallback((updated: Topic) => {
    setTopics(prev => prev.map(t => t.topic_id === updated.topic_id ? updated : t))
  }, [])

  async function handleSubmit(text: string) {
    if (!selected) return
    setSubmitting(true)
    setUserText(text)
    try {
      const result = await analyzeTopicSpeech(selected.topic_id, text)
      setFeedback(result)
      setPhase('feedback')
    } catch {
      alert('フィードバックの取得に失敗しました。')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRate(quality: number) {
    if (!selected) return
    const updated = await reviewTopic(selected.topic_id, quality)
    handleTopicUpdated(updated)
    setPhase('done')
  }

  async function handleSavePhrase(text: string, note: string) {
    setSaving(true)
    try {
      await savePhrase({ text, japanese: '', note, verb_id: '', pattern: 'collocation', register: 'informal', type: 'fixed_phrase' })
    } catch {
      alert('フレーズの保存に失敗しました。')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveCorrection(original: string, corrected: string, note: string) {
    if (!selected) return
    const updated = await addTopicCorrection(selected.topic_id, { original, corrected, note })
    handleTopicUpdated(updated)
  }

  async function handleDeleteCorrection(correctionId: string) {
    if (!selected) return
    const updated = await deleteTopicCorrection(selected.topic_id, correctionId)
    handleTopicUpdated(updated)
  }

  async function handleSaveScript(script: string) {
    if (!selected) return
    const updated = await updateTopic(selected.topic_id, { script })
    handleTopicUpdated(updated)
  }

  async function handleCreateTopic() {
    if (!newTopicTitle.trim()) return
    const maxNumber = topics.reduce((m, t) => Math.max(m, t.number), 0)
    const created = await createTopic(newTopicTitle.trim(), maxNumber + 1)
    setTopics(prev => [...prev, created])
    setNewTopicTitle('')
    setAddingTopic(false)
    selectTopic(created.topic_id)
  }

  async function handleUpdateTopicTitle(topicId: string) {
    if (!editingTopicTitle.trim()) return
    const updated = await updateTopic(topicId, { title: editingTopicTitle.trim() })
    handleTopicUpdated(updated)
    setEditingTopicId(null)
  }

  async function handleDeleteTopic(topicId: string) {
    if (!confirm('このトピックを削除しますか？')) return
    await deleteTopic(topicId)
    setTopics(prev => prev.filter(t => t.topic_id !== topicId))
    if (selectedId === topicId) {
      const remaining = topics.filter(t => t.topic_id !== topicId)
      setSelectedId(remaining[0]?.topic_id ?? null)
    }
  }

  async function swapTopicNumbers(a: Topic, b: Topic) {
    const [updA, updB] = await Promise.all([
      updateTopic(a.topic_id, { number: b.number }),
      updateTopic(b.topic_id, { number: a.number }),
    ])
    setTopics(prev => prev.map(t => {
      if (t.topic_id === updA.topic_id) return updA
      if (t.topic_id === updB.topic_id) return updB
      return t
    }).sort((a, b) => a.number - b.number))
  }

  async function swapGroups(numA: number, numB: number) {
    const groupA = topics.filter(t => Math.floor(t.number) === numA)
    const groupB = topics.filter(t => Math.floor(t.number) === numB)
    const results = await Promise.all([
      ...groupA.map(t => updateTopic(t.topic_id, { number: Math.round((numB + t.number % 1) * 10) / 10 })),
      ...groupB.map(t => updateTopic(t.topic_id, { number: Math.round((numA + t.number % 1) * 10) / 10 })),
    ])
    setTopics(prev => {
      const map = new Map(results.map(r => [r.topic_id, r]))
      return prev.map(t => map.get(t.topic_id) ?? t).sort((a, b) => a.number - b.number)
    })
  }

  async function handleMoveUp(topicId: string) {
    if (moving) return
    const curr = topics.find(t => t.topic_id === topicId)
    if (!curr) return
    setMoving(true)
    try {
      if (curr.number % 1 === 0) {
        const parentNums = topics.filter(t => t.number % 1 === 0).map(t => t.number).sort((a, b) => a - b)
        const idx = parentNums.indexOf(curr.number)
        if (idx <= 0) return
        await swapGroups(curr.number, parentNums[idx - 1])
      } else {
        const parentNum = Math.floor(curr.number)
        const subs = topics.filter(t => Math.floor(t.number) === parentNum && t.number % 1 !== 0).sort((a, b) => a.number - b.number)
        const idx = subs.findIndex(t => t.topic_id === topicId)
        if (idx <= 0) return
        await swapTopicNumbers(curr, subs[idx - 1])
      }
    } finally {
      setMoving(false)
    }
  }

  async function handleMoveDown(topicId: string) {
    if (moving) return
    const curr = topics.find(t => t.topic_id === topicId)
    if (!curr) return
    setMoving(true)
    try {
      if (curr.number % 1 === 0) {
        const parentNums = topics.filter(t => t.number % 1 === 0).map(t => t.number).sort((a, b) => a - b)
        const idx = parentNums.indexOf(curr.number)
        if (idx >= parentNums.length - 1) return
        await swapGroups(curr.number, parentNums[idx + 1])
      } else {
        const parentNum = Math.floor(curr.number)
        const subs = topics.filter(t => Math.floor(t.number) === parentNum && t.number % 1 !== 0).sort((a, b) => a.number - b.number)
        const idx = subs.findIndex(t => t.topic_id === topicId)
        if (idx >= subs.length - 1) return
        await swapTopicNumbers(curr, subs[idx + 1])
      }
    } finally {
      setMoving(false)
    }
  }

  async function handleCreateSubTopic() {
    if (!newSubTitle.trim() || !addingSubForId) return
    const parent = topics.find(t => t.topic_id === addingSubForId)
    if (!parent) return
    const parentNum = Math.floor(parent.number)
    const subs = topics.filter(t => Math.floor(t.number) === parentNum && t.number % 1 !== 0)
    const nextNum = subs.length > 0
      ? Math.round((Math.max(...subs.map(t => t.number)) + 0.1) * 10) / 10
      : Math.round((parentNum + 0.1) * 10) / 10
    const created = await createTopic(newSubTitle.trim(), nextNum)
    setTopics(prev => [...prev, created].sort((a, b) => a.number - b.number))
    setNewSubTitle('')
    setAddingSubForId(null)
    selectTopic(created.topic_id)
  }

  function selectTopic(id: string) {
    setSelectedId(id)
    setPhase('practice')
    setFeedback(null)
    setUserText('')
    setSidebarOpen(false)
  }

  const statusColor = { due: '#f87171', upcoming: '#94a3b8', done: '#34d399' }
  const statusLabel = { due: '今日', upcoming: '予定', done: '完了' }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f172a', color: '#94a3b8', fontFamily: 'system-ui' }}>
        Loading...
      </div>
    )
  }

  const sidebarStyle: React.CSSProperties = isMobile ? {
    position: 'fixed', top: 0, left: sidebarOpen ? 0 : -290, width: 280,
    height: '100vh', zIndex: 50, transition: 'left 0.25s ease',
    background: '#1e293b', borderRight: '1px solid rgba(255,255,255,0.06)',
    overflowY: 'auto', paddingTop: 16, paddingBottom: 80, display: 'flex', flexDirection: 'column',
  } : {
    width: 240, flexShrink: 0, background: '#1e293b',
    borderRight: '1px solid rgba(255,255,255,0.06)',
    overflowY: 'auto', paddingTop: 16, paddingBottom: 80, display: 'flex', flexDirection: 'column',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', fontFamily: 'system-ui, sans-serif', color: '#e2e8f0', display: 'flex' }}>

      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 49 }} />
      )}

      {/* Left sidebar — topic list */}
      <div style={sidebarStyle}>
        <div style={{ padding: '0 16px 12px', fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Topics</div>
        <div style={{ flex: 1 }}>
          {(() => {
            const parentTopics = topics.filter(t => t.number % 1 === 0).sort((a, b) => a.number - b.number)
            const subMap: Record<number, Topic[]> = {}
            topics.filter(t => t.number % 1 !== 0).forEach(t => {
              const p = Math.floor(t.number)
              if (!subMap[p]) subMap[p] = []
              subMap[p].push(t)
            })

            const renderRow = (t: Topic, isSub: boolean, canUp: boolean, canDown: boolean) => {
              const st = statusOf(t)
              const isHovered = hoveredTopicId === t.topic_id
              const numLabel = t.number % 1 === 0 ? String(Math.floor(t.number)) : t.number.toFixed(1)
              const indent = isSub ? 24 : 16
              return (
                <div
                  key={t.topic_id}
                  onMouseEnter={() => setHoveredTopicId(t.topic_id)}
                  onMouseLeave={() => setHoveredTopicId(null)}
                  style={{
                    display: 'flex', alignItems: 'center', width: '100%',
                    background: t.topic_id === selectedId ? 'rgba(99,102,241,0.15)' : isHovered ? 'rgba(255,255,255,0.03)' : 'transparent',
                    borderLeft: t.topic_id === selectedId ? '2px solid #6366f1' : '2px solid transparent',
                  }}
                >
                  {editingTopicId === t.topic_id ? (
                    <div style={{ flex: 1, display: 'flex', gap: 4, padding: `6px 8px 6px ${indent}px` }}>
                      <input
                        value={editingTopicTitle}
                        onChange={e => setEditingTopicTitle(e.target.value)}
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleUpdateTopicTitle(t.topic_id)
                          if (e.key === 'Escape') setEditingTopicId(null)
                        }}
                        style={{ ...inputStyle, flex: 1, fontSize: 12, padding: '4px 8px' }}
                      />
                      <button onClick={() => handleUpdateTopicTitle(t.topic_id)} style={{ ...smallBtn, color: '#6366f1', fontSize: 12 }}>✓</button>
                      <button onClick={() => setEditingTopicId(null)} style={{ ...smallBtn, color: '#94a3b8', fontSize: 12 }}>✕</button>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => selectTopic(t.topic_id)} style={{
                        flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        textAlign: 'left', padding: `9px 8px 9px ${indent}px`, border: 'none', cursor: 'pointer',
                        background: 'transparent', color: isSub ? '#94a3b8' : '#e2e8f0', minWidth: 0,
                      }}>
                        <span style={{ fontSize: isSub ? 12 : 13, flex: 1, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          #{numLabel} {t.title}
                        </span>
                        <span style={{ fontSize: 11, color: statusColor[st], fontWeight: 600, marginLeft: 6, whiteSpace: 'nowrap' }}>
                          {statusLabel[st]}
                        </span>
                      </button>
                      {(isHovered || isMobile) && (
                        <div style={{ display: 'flex', gap: 1, paddingRight: 6, flexShrink: 0 }}>
                          {!isMobile && canUp && (
                            <button onClick={() => handleMoveUp(t.topic_id)} title="上へ" disabled={moving} style={{ ...iconBtn, fontSize: 10, opacity: moving ? 0.3 : 0.5 }}>▲</button>
                          )}
                          {!isMobile && canDown && (
                            <button onClick={() => handleMoveDown(t.topic_id)} title="下へ" disabled={moving} style={{ ...iconBtn, fontSize: 10, opacity: moving ? 0.3 : 0.5 }}>▼</button>
                          )}
                          {!isMobile && !isSub && (
                            <button
                              onClick={() => { setAddingSubForId(t.topic_id); setNewSubTitle('') }}
                              title="サブトピック追加"
                              style={{ ...iconBtn, fontSize: 11, opacity: 0.5 }}
                            >⊕</button>
                          )}
                          <button
                            onClick={() => { setEditingTopicId(t.topic_id); setEditingTopicTitle(t.title) }}
                            title="タイトル編集"
                            style={{ ...iconBtn, fontSize: 12 }}
                          >✏️</button>
                          <button
                            onClick={() => handleDeleteTopic(t.topic_id)}
                            title="削除"
                            style={{ ...iconBtn, fontSize: 12 }}
                          >🗑</button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            }

            return parentTopics.map((parent, pIdx) => {
              const subs = (subMap[Math.floor(parent.number)] ?? []).sort((a, b) => a.number - b.number)
              const isAddingSub = addingSubForId === parent.topic_id
              return (
                <div key={parent.topic_id}>
                  {renderRow(parent, false, pIdx > 0, pIdx < parentTopics.length - 1)}
                  {subs.map((sub, sIdx) => renderRow(sub, true, sIdx > 0, sIdx < subs.length - 1))}
                  {isAddingSub && (
                    <div style={{ display: 'flex', gap: 4, padding: '6px 8px 6px 28px', background: 'rgba(99,102,241,0.06)' }}>
                      <input
                        value={newSubTitle}
                        onChange={e => setNewSubTitle(e.target.value)}
                        autoFocus
                        placeholder="サブトピック名"
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleCreateSubTopic()
                          if (e.key === 'Escape') setAddingSubForId(null)
                        }}
                        style={{ ...inputStyle, flex: 1, fontSize: 12, padding: '4px 8px' }}
                      />
                      <button onClick={handleCreateSubTopic} style={{ ...smallBtn, color: '#6366f1', fontSize: 12 }}>✓</button>
                      <button onClick={() => setAddingSubForId(null)} style={{ ...smallBtn, color: '#94a3b8', fontSize: 12 }}>✕</button>
                    </div>
                  )}
                </div>
              )
            })
          })()}
        </div>

        {/* Add topic */}
        <div style={{ padding: '12px 12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {addingTopic ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                value={newTopicTitle}
                onChange={e => setNewTopicTitle(e.target.value)}
                autoFocus
                placeholder="トピック名"
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreateTopic()
                  if (e.key === 'Escape') { setAddingTopic(false); setNewTopicTitle('') }
                }}
                style={{ ...inputStyle, fontSize: 12 }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={handleCreateTopic} style={{ ...smallBtn, color: '#6366f1', fontSize: 12, flex: 1, textAlign: 'center', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 6 }}>追加</button>
                <button onClick={() => { setAddingTopic(false); setNewTopicTitle('') }} style={{ ...smallBtn, color: '#94a3b8', fontSize: 12 }}>✕</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAddingTopic(true)} style={{
              width: '100%', background: 'transparent', border: '1px dashed rgba(99,102,241,0.35)',
              borderRadius: 8, padding: '8px 12px', color: '#6366f1', cursor: 'pointer', fontSize: 13, textAlign: 'center',
            }}>
              ＋ トピックを追加
            </button>
          )}
        </div>
      </div>

      {/* Right — practice area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px 16px 80px' : '24px 32px 100px' }}>
        {/* Mobile: topic selector button */}
        {isMobile && (
          <button onClick={() => setSidebarOpen(true)} style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, padding: '8px 14px', color: '#94a3b8', cursor: 'pointer', fontSize: 13,
          }}>
            ☰ <span>{selected ? `#${selected.number % 1 === 0 ? Math.floor(selected.number) : selected.number.toFixed(1)} ${selected.title}` : 'トピックを選択'}</span>
          </button>
        )}
        {!selected ? (
          <div style={{ color: '#94a3b8', paddingTop: 40 }}>トピックを選択してください</div>
        ) : (
          <div style={{ maxWidth: 680 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                  {statusOf(selected) === 'due' ? '🔴 今日の練習' : `次回 ${selected.due_date}`}
                  {selected.interval > 0 && <span style={{ color: '#64748b', marginLeft: 8 }}>間隔 {selected.interval}日</span>}
                </div>
                <h1 style={{ margin: 0, fontSize: isMobile ? 18 : 22, fontWeight: 700 }}>#{selected.number % 1 === 0 ? Math.floor(selected.number) : selected.number.toFixed(1)} {selected.title}</h1>
              </div>
              <HintToggle level={hintLevel} onChange={setHintLevel} />
            </div>

            {/* Practice phase */}
            {phase === 'practice' && (
              <>
                {hintLevel === 'script' ? (
                  <div style={{ marginBottom: 20 }}>
                    <ScriptView topic={selected} onSave={handleSaveScript} onLevelsExtracted={handleTopicUpdated} />
                  </div>
                ) : (
                  (() => {
                    const levels = selected.levels ?? {}
                    const rep = selected.repetitions ?? 0
                    const lk = rep <= 1 ? '1' : rep <= 3 ? '2' : '3'
                    const chunks = levels[lk]
                    if (!chunks || chunks.length === 0) {
                      return (
                        <div style={{ color: '#64748b', fontSize: 13, fontStyle: 'italic', marginBottom: 20 }}>
                          Script タブでレベルを生成すると、ここにヒントが表示されます。
                        </div>
                      )
                    }
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
                        <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 700, letterSpacing: '0.08em' }}>
                          LEVEL {lk} <span style={{ color: '#64748b', fontWeight: 400 }}>（{rep} 回復習済）</span>
                        </div>
                        {chunks.map((ch, i) => (
                          <div key={i}>
                            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 6 }}>{ch.chunk}</div>
                            <CueChips cues={ch.cues} />
                          </div>
                        ))}
                      </div>
                    )
                  })()
                )}
                {selected.corrections && selected.corrections.length > 0 && (
                  <div style={{ marginBottom: 20, background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 10, padding: '12px 16px' }}>
                    <div style={{ fontSize: 11, color: '#fbbf24', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 10 }}>⚠️ 前回のミス — 意識して話そう</div>
                    {selected.corrections.map(c => (
                      <div key={c.correction_id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12 }}>
                            <s style={{ color: '#f87171', opacity: 0.7 }}>{c.original}</s>
                            <span style={{ color: '#64748b', margin: '0 4px' }}>→</span>
                            <strong style={{ color: '#86efac' }}>{c.corrected}</strong>
                          </div>
                          {c.note && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{c.note}</div>}
                        </div>
                        <button onClick={() => handleDeleteCorrection(c.correction_id)} title="定着したので削除" style={{ background: 'transparent', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <SpeechInput onSubmit={handleSubmit} submitting={submitting} />
              </>
            )}

            {/* Feedback phase */}
            {phase === 'feedback' && feedback && (
              <div>
                <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 16px', marginBottom: 18, fontSize: 14, color: '#94a3b8', lineHeight: 1.7 }}>
                  <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 700, marginBottom: 5 }}>あなたの回答</div>
                  {userText}
                </div>
                <FeedbackPanel
                  feedback={feedback}
                  onRate={handleRate}
                  onSavePhrase={handleSavePhrase}
                  onSaveCorrection={handleSaveCorrection}
                  saving={saving}
                />
              </div>
            )}

            {/* Done phase */}
            {phase === 'done' && (
              <div style={{ textAlign: 'center', paddingTop: 48 }}>
                <div style={{ fontSize: 44, marginBottom: 14 }}>🎉</div>
                <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>お疲れ様！</div>
                <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 28 }}>
                  次の復習: {selected.due_date} （{selected.interval}日後）
                </div>
                <button onClick={() => { setPhase('practice'); setFeedback(null) }} style={{
                  background: '#6366f1', border: 'none', color: '#fff', borderRadius: 10,
                  padding: '12px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
                }}>
                  別のトピックへ
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 6, padding: '7px 10px', color: '#e2e8f0', fontSize: 13, outline: 'none',
  fontFamily: 'inherit', boxSizing: 'border-box',
}

const smallBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: '4px 8px',
}

const iconBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14, opacity: 0.5,
  padding: 2, lineHeight: 1,
}
