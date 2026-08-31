import { useState, useEffect, useRef, useCallback } from 'react'
import type { Correction } from '../types'
import { analyzeSpeech, saveCorrections, fetchCorrections, reviewCorrection, deleteCorrection, completeRoutineStep } from '../api'
import type { SpeechAnalysisResult } from '../api'

type Tab = 'submit' | 'log' | 'review'

interface CandidateItem {
  original: string
  corrected: string
  note: string
  checked: boolean
}

// ─── Recording hook ──────────────────────────────────────────────────────────

function useRecorder() {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const mrRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const start = useCallback(async (onDone: (b64: string, mime: string) => void) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mr = new MediaRecorder(stream)
    chunksRef.current = []
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.onstop = () => {
      stream.getTracks().forEach(t => t.stop())
      const mime = mr.mimeType || 'audio/webm'
      const blob = new Blob(chunksRef.current, { type: mime })
      const reader = new FileReader()
      reader.onload = () => {
        const b64 = (reader.result as string).split(',')[1]
        onDone(b64, mime)
      }
      reader.readAsDataURL(blob)
    }
    mrRef.current = mr
    mr.start()
    setRecording(true)
    setSeconds(0)
    timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
  }, [])

  const stop = useCallback(() => {
    mrRef.current?.stop()
    if (timerRef.current) clearInterval(timerRef.current)
    setRecording(false)
  }, [])

  return { recording, seconds, start, stop }
}

// ─── Submit tab ──────────────────────────────────────────────────────────────

type SubmitState =
  | { phase: 'idle' }
  | { phase: 'recording' }
  | { phase: 'transcribing' }
  | { phase: 'transcript'; text: string }
  | { phase: 'analyzing'; text: string }
  | { phase: 'candidates'; text: string; items: CandidateItem[]; summary: string }
  | { phase: 'saving' }
  | { phase: 'done'; count: number }

interface SubmitTabProps {
  onSaved: (corrections: Correction[]) => void
  onWritingStepDone: () => void
}

function SubmitTab({ onSaved, onWritingStepDone }: SubmitTabProps) {
  const [state, setState] = useState<SubmitState>({ phase: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const recorder = useRecorder()

  const handleRecordToggle = () => {
    if (recorder.recording) {
      recorder.stop()
      setState({ phase: 'transcribing' })
    } else {
      setError(null)
      recorder.start(async (b64, mime) => {
        setState({ phase: 'transcribing' })
        try {
          const result = await analyzeSpeech({ audio_base64: b64, mime_type: mime })
          setState({ phase: 'candidates', text: result.transcript, summary: result.summary, items: result.corrections.map(c => ({ ...c, checked: true })) })
        } catch (e) {
          setError(String(e))
          setState({ phase: 'idle' })
        }
      }).catch(e => {
        setError(String(e))
        setState({ phase: 'idle' })
      })
      setState({ phase: 'recording' })
    }
  }

  const handleAnalyzeText = async (text: string) => {
    setState({ phase: 'analyzing', text })
    try {
      const result: SpeechAnalysisResult = await analyzeSpeech({ text })
      setState({ phase: 'candidates', text, summary: result.summary, items: result.corrections.map(c => ({ ...c, checked: true })) })
    } catch (e) {
      setError(String(e))
      setState({ phase: 'transcript', text })
    }
  }

  const toggleCandidate = (i: number) => {
    if (state.phase !== 'candidates') return
    const items = state.items.map((c, j) => j === i ? { ...c, checked: !c.checked } : c)
    setState({ ...state, items })
  }

  const handleSave = async () => {
    if (state.phase !== 'candidates') return
    const selected = state.items.filter(c => c.checked)
    if (selected.length === 0) {
      setState({ phase: 'done', count: 0 })
      onWritingStepDone()
      return
    }
    setState({ phase: 'saving' })
    try {
      const saved = await saveCorrections(selected.map(({ original, corrected, note }) => ({ original, corrected, note })))
      onSaved(saved)
      await completeRoutineStep('writing')
      onWritingStepDone()
      setState({ phase: 'done', count: saved.length })
    } catch (e) {
      setError(String(e))
      setState({ phase: 'candidates', text: state.text, items: state.items })
    }
  }

  const reset = () => { setState({ phase: 'idle' }); setError(null) }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px' }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: '#f1f5f9' }}>Daily Speaking</h2>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>
        話したことを録音するか、英語を直接入力してください。AI が不自然な表現を検出します。
      </p>

      {error && (
        <div style={{ background: '#1e293b', border: '1px solid #ef4444', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#ef4444' }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 8, background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}>✕</button>
        </div>
      )}

      {/* Phase: idle */}
      {state.phase === 'idle' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <button onClick={handleRecordToggle} style={recordBtnStyle(false)}>
            🎤 録音を開始
          </button>
          <div style={{ textAlign: 'center', color: '#475569', fontSize: 12 }}>または</div>
          <TextInputMode onAnalyze={handleAnalyzeText} />
        </div>
      )}

      {/* Phase: recording */}
      {state.phase === 'recording' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>
            録音中... {recorder.seconds}s
          </div>
          <button onClick={handleRecordToggle} style={recordBtnStyle(true)}>
            ⏹ 停止して送信
          </button>
        </div>
      )}

      {/* Phase: transcribing / analyzing */}
      {(state.phase === 'transcribing' || state.phase === 'analyzing') && (
        <div style={{ textAlign: 'center', color: '#64748b', fontSize: 14 }}>
          {state.phase === 'transcribing' ? '文字起こし中...' : 'AI が分析中...'}
        </div>
      )}

      {/* Phase: transcript (edit before analyzing) */}
      {state.phase === 'transcript' && (
        <TranscriptEditor
          text={state.text}
          onAnalyze={handleAnalyzeText}
          onCancel={reset}
        />
      )}

      {/* Phase: candidates */}
      {state.phase === 'candidates' && (
        <div>
          {state.summary && (
            <div style={{ background: '#0f2027', border: '1px solid #1e3a5f', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#38bdf8', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>AI フィードバック</div>
              <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{state.summary}</div>
            </div>
          )}

          <div style={{ background: '#1e293b', borderRadius: 8, padding: '12px 14px', marginBottom: 20, fontSize: 13, color: '#94a3b8' }}>
            <span style={{ color: '#64748b', fontSize: 11, display: 'block', marginBottom: 4 }}>あなたの英語</span>
            {state.text}
          </div>

          {state.items.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#22c55e', fontSize: 14, marginBottom: 20 }}>
              ✓ Natural! 不自然な表現は見つかりませんでした。
            </div>
          ) : (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                保存する添削を選択してください ({state.items.filter(c => c.checked).length}/{state.items.length})
              </div>
              {state.items.map((item, i) => (
                <CandidateCard key={i} item={item} onToggle={() => toggleCandidate(i)} />
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleSave} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              {state.items.filter(c => c.checked).length > 0 ? `${state.items.filter(c => c.checked).length}件を保存` : '完了（保存なし）'}
            </button>
            <button onClick={reset} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #334155', background: 'none', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>
              やり直す
            </button>
          </div>
        </div>
      )}

      {/* Phase: saving */}
      {state.phase === 'saving' && (
        <div style={{ textAlign: 'center', color: '#64748b', fontSize: 14 }}>保存中...</div>
      )}

      {/* Phase: done */}
      {state.phase === 'done' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#f1f5f9', marginBottom: 8 }}>
            {state.count > 0 ? `${state.count}件を保存しました` : '今日のスピーキング完了！'}
          </div>
          <button onClick={reset} style={{ marginTop: 16, padding: '8px 20px', borderRadius: 8, border: '1px solid #334155', background: 'none', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>
            もう1件録音する
          </button>
        </div>
      )}
    </div>
  )
}

function TextInputMode({ onAnalyze }: { onAnalyze: (text: string) => void }) {
  const [text, setText] = useState('')
  return (
    <div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="英語を入力してください..."
        rows={5}
        style={{ width: '100%', boxSizing: 'border-box', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 14, padding: '12px', resize: 'vertical', outline: 'none', fontFamily: 'system-ui' }}
      />
      <button
        onClick={() => { if (text.trim()) onAnalyze(text.trim()) }}
        disabled={!text.trim()}
        style={{ marginTop: 10, width: '100%', padding: '10px 0', borderRadius: 8, border: 'none', background: text.trim() ? '#4f46e5' : '#1e293b', color: text.trim() ? '#fff' : '#475569', fontSize: 14, fontWeight: 600, cursor: text.trim() ? 'pointer' : 'default' }}
      >
        AI に添削を依頼
      </button>
    </div>
  )
}

function TranscriptEditor({ text, onAnalyze, onCancel }: { text: string; onAnalyze: (t: string) => void; onCancel: () => void }) {
  const [val, setVal] = useState(text)
  return (
    <div>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>文字起こし結果を確認・修正してください</div>
      <textarea
        value={val}
        onChange={e => setVal(e.target.value)}
        rows={6}
        style={{ width: '100%', boxSizing: 'border-box', background: '#1e293b', border: '1px solid #475569', borderRadius: 8, color: '#f1f5f9', fontSize: 14, padding: 12, resize: 'vertical', outline: 'none', fontFamily: 'system-ui' }}
      />
      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        <button onClick={() => onAnalyze(val.trim())} disabled={!val.trim()} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: val.trim() ? '#4f46e5' : '#1e293b', color: val.trim() ? '#fff' : '#475569', fontSize: 14, fontWeight: 600, cursor: val.trim() ? 'pointer' : 'default' }}>
          分析する
        </button>
        <button onClick={onCancel} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #334155', background: 'none', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>
          キャンセル
        </button>
      </div>
    </div>
  )
}

function CandidateCard({ item, onToggle }: { item: CandidateItem; onToggle: () => void }) {
  return (
    <div
      onClick={onToggle}
      style={{ display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 8, marginBottom: 10, background: item.checked ? '#1e293b' : '#0f172a', border: `1px solid ${item.checked ? '#4f46e5' : '#1e293b'}`, cursor: 'pointer' }}
    >
      <span style={{ fontSize: 18, flexShrink: 0, marginTop: 2 }}>{item.checked ? '☑' : '☐'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: '#fca5a5', marginBottom: 4, wordBreak: 'break-word' }}>
          ✗ {item.original}
        </div>
        <div style={{ fontSize: 13, color: '#86efac', marginBottom: 6, wordBreak: 'break-word' }}>
          ✓ {item.corrected}
        </div>
        <div style={{ fontSize: 11, color: '#64748b', wordBreak: 'break-word' }}>{item.note}</div>
      </div>
    </div>
  )
}

const recordBtnStyle = (active: boolean): React.CSSProperties => ({
  width: '100%',
  padding: '14px 0',
  borderRadius: 12,
  border: 'none',
  background: active ? '#dc2626' : '#4f46e5',
  color: '#fff',
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background 0.2s',
})

// ─── Log tab ─────────────────────────────────────────────────────────────────

function LogTab({ corrections, onDelete }: { corrections: Correction[]; onDelete: (id: string) => void }) {
  const sorted = [...corrections].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))

  const grouped = sorted.reduce<Record<string, Correction[]>>((acc, c) => {
    const day = c.submittedAt.slice(0, 10)
    ;(acc[day] ??= []).push(c)
    return acc
  }, {})

  if (sorted.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#475569', fontSize: 14, paddingTop: 60 }}>
        まだ添削がありません。<br />Submit タブで録音してみましょう。
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px' }}>
      {Object.entries(grouped).map(([day, items]) => (
        <div key={day} style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 10, letterSpacing: '0.05em' }}>
            {day}
          </div>
          {items.map(c => (
            <LogCard key={c.id} correction={c} onDelete={() => onDelete(c.id)} />
          ))}
        </div>
      ))}
    </div>
  )
}

function LogCard({ correction, onDelete }: { correction: Correction; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false)

  return (
    <div style={{ background: '#1e293b', borderRadius: 8, padding: '12px 14px', marginBottom: 10, position: 'relative' }}>
      <div style={{ fontSize: 13, color: '#fca5a5', marginBottom: 6, wordBreak: 'break-word' }}>
        ✗ {correction.original}
      </div>
      <div style={{ fontSize: 13, color: '#86efac', marginBottom: 6, wordBreak: 'break-word' }}>
        ✓ {correction.corrected}
      </div>
      {correction.note && (
        <div style={{ fontSize: 11, color: '#64748b', wordBreak: 'break-word' }}>{correction.note}</div>
      )}
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: '#475569' }}>
          次回: {correction.dueDate}　easeFactor: {correction.easeFactor.toFixed(1)}
        </span>
        {confirming ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onDelete} style={{ fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>削除する</button>
            <button onClick={() => setConfirming(false)} style={{ fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}>キャンセル</button>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)} style={{ fontSize: 11, color: '#475569', background: 'none', border: 'none', cursor: 'pointer' }}>削除</button>
        )}
      </div>
    </div>
  )
}

// ─── Review tab ───────────────────────────────────────────────────────────────

interface ReviewTabProps {
  corrections: Correction[]
  onReviewed: (updated: Correction) => void
  onReviewStepDone: () => void
}

function ReviewTab({ corrections, onReviewed, onReviewStepDone }: ReviewTabProps) {
  const NOW = new Date().toISOString().slice(0, 10)
  const dueItems = corrections.filter(c => c.dueDate <= NOW)
  const [queue, setQueue] = useState<Correction[]>(dueItems)
  const [flipped, setFlipped] = useState(false)
  const stepDoneRef = useRef(false)

  useEffect(() => {
    if (dueItems.length === 0 && !stepDoneRef.current) {
      stepDoneRef.current = true
      completeRoutineStep('review').catch(() => {})
      onReviewStepDone()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const current = queue[0]

  const handleResult = async (correct: boolean) => {
    if (!current) return
    const isLast = queue.length === 1
    setQueue(q => q.slice(1))
    setFlipped(false)

    try {
      const quality = correct ? 4 : 1
      const result = await reviewCorrection(current.id, quality)
      onReviewed(result.correction)
      if (isLast && !stepDoneRef.current) {
        stepDoneRef.current = true
        await completeRoutineStep('review')
        onReviewStepDone()
      }
    } catch {
      // best-effort
    }
  }

  if (dueItems.length === 0) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 60 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: 16, color: '#f1f5f9', fontWeight: 600 }}>今日の添削復習は完了！</div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 8 }}>
          次の復習は tomorrow 以降です
        </div>
      </div>
    )
  }

  if (!current) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 60 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🎉</div>
        <div style={{ fontSize: 16, color: '#f1f5f9', fontWeight: 600 }}>セッション完了！</div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 8 }}>{dueItems.length} 件を復習しました</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ fontSize: 12, color: '#64748b', textAlign: 'right', marginBottom: 12 }}>
        {queue.length} / {dueItems.length} 残り
      </div>

      <div
        onClick={() => setFlipped(f => !f)}
        style={{ background: '#1e293b', borderRadius: 16, padding: '32px 24px', minHeight: 200, cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
      >
        {!flipped ? (
          <div>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>あなたが言った英語</div>
            <div style={{ fontSize: 18, color: '#fca5a5', lineHeight: 1.6, wordBreak: 'break-word' }}>
              {current.original}
            </div>
            <div style={{ fontSize: 12, color: '#475569', marginTop: 16 }}>タップして答えを見る</div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>自然な英語</div>
            <div style={{ fontSize: 18, color: '#86efac', lineHeight: 1.6, wordBreak: 'break-word', marginBottom: 16 }}>
              {current.corrected}
            </div>
            {current.note && (
              <div style={{ fontSize: 12, color: '#64748b', borderTop: '1px solid #334155', paddingTop: 12, wordBreak: 'break-word' }}>
                {current.note}
              </div>
            )}
          </div>
        )}
      </div>

      {flipped && (
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <button
            onClick={() => handleResult(false)}
            style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: 'none', background: '#7f1d1d', color: '#fca5a5', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            ✗ もう一度
          </button>
          <button
            onClick={() => handleResult(true)}
            style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: 'none', background: '#14532d', color: '#86efac', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            ✓ 覚えた
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main VariantG ────────────────────────────────────────────────────────────

interface Props {
  onReviewStepDone?: () => void
  onWritingStepDone?: () => void
}

export function VariantG({ onReviewStepDone, onWritingStepDone }: Props) {
  const [tab, setTab] = useState<Tab>('submit')
  const [corrections, setCorrections] = useState<Correction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCorrections()
      .then(setCorrections)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSaved = (saved: Correction[]) => {
    setCorrections(prev => [...saved, ...prev])
  }

  const handleReviewed = (updated: Correction) => {
    setCorrections(prev => prev.map(c => c.id === updated.id ? updated : c))
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteCorrection(id)
      setCorrections(prev => prev.filter(c => c.id !== id))
    } catch { /* best-effort */ }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', fontFamily: 'system-ui, sans-serif', color: '#e2e8f0', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ padding: '20px 16px 0', maxWidth: 600, margin: '0 auto' }}>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>Writing & Correction</div>
        <div style={{ display: 'flex', gap: 4, marginTop: 16 }}>
          {(['submit', 'review', 'log'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{ padding: '6px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === t ? 600 : 400, background: tab === t ? '#4f46e5' : '#1e293b', color: tab === t ? '#fff' : '#64748b' }}
            >
              {t === 'submit' ? 'Submit' : t === 'review' ? `Review${corrections.filter(c => c.dueDate <= new Date().toISOString().slice(0, 10)).length > 0 ? ` (${corrections.filter(c => c.dueDate <= new Date().toISOString().slice(0, 10)).length})` : ''}` : 'Log'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#475569', paddingTop: 40 }}>Loading...</div>
        ) : (
          <>
            {tab === 'submit' && <SubmitTab onSaved={handleSaved} onWritingStepDone={() => onWritingStepDone?.()} />}
            {tab === 'review' && <ReviewTab corrections={corrections} onReviewed={handleReviewed} onReviewStepDone={() => onReviewStepDone?.()} />}
            {tab === 'log' && <LogTab corrections={corrections} onDelete={handleDelete} />}
          </>
        )}
      </div>
    </div>
  )
}
