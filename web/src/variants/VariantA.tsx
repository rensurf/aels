import { useState } from 'react'
import type { Phrase, Verb, VerbPattern } from '../types'
import { getStrengthColor, getStrengthLabel } from '../utils'

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

interface Props {
  verbs: Verb[]
  phrases: Phrase[]
}

export function VariantA({ verbs, phrases }: Props) {
  const [selectedId, setSelectedId] = useState<string>(verbs[0]?.id ?? '')
  const selectedVerb = verbs.find(v => v.id === selectedId)

  if (!verbs.length) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#64748b', fontFamily: 'system-ui' }}>
        No verbs yet. Add verbs from the Telegram bot first.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif', background: '#0f172a', color: '#e2e8f0' }}>
      {/* Sidebar */}
      <aside style={{ width: 200, background: '#1e293b', borderRight: '1px solid #334155', overflowY: 'auto', flexShrink: 0 }}>
        <div style={{ padding: '16px 12px 8px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748b' }}>
          Verbs
        </div>
        {verbs.map(verb => {
          const avg = verbAvgEase(verb.id, phrases)
          const color = getStrengthColor(avg)
          const count = phrases.filter(p => p.verbId === verb.id).length
          const isSelected = verb.id === selectedId
          return (
            <button
              key={verb.id}
              onClick={() => setSelectedId(verb.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '10px 12px',
                background: isSelected ? '#334155' : 'transparent',
                border: 'none',
                borderLeft: isSelected ? `3px solid ${color}` : '3px solid transparent',
                color: '#e2e8f0',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 14,
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
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflowY: 'auto', padding: 32 }}>
        {selectedVerb
          ? <VerbDetail verb={selectedVerb} phrases={phrases.filter(p => p.verbId === selectedVerb.id)} />
          : <div style={{ color: '#475569' }}>Select a verb</div>
        }
      </main>
    </div>
  )
}

function VerbDetail({ verb, phrases }: { verb: Verb; phrases: Phrase[] }) {
  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: 40, fontWeight: 700, color: '#f1f5f9' }}>{verb.base}</h1>
          {verb.nounForm && <span style={{ fontSize: 14, color: '#64748b' }}>名詞: <em>{verb.nounForm}</em></span>}
          {verb.adjForm && <span style={{ fontSize: 14, color: '#64748b' }}>形容詞: <em>{verb.adjForm}</em></span>}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {verb.patterns.map(vp => (
            <span key={vp.code} style={{
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              background: patternColor(vp.code) + '22',
              color: patternColor(vp.code),
              border: `1px solid ${patternColor(vp.code)}44`,
            }}>{vp.code}</span>
          ))}
        </div>
      </div>

      {/* Relations */}
      {(verb.confusableWith.length > 0 || verb.similarTo.length > 0) && (
        <div style={{ display: 'flex', gap: 32, marginBottom: 32 }}>
          {verb.confusableWith.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>混同注意</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {verb.confusableWith.map(w => (
                  <span key={w} style={{ padding: '4px 10px', borderRadius: 999, background: '#7f1d1d22', color: '#fca5a5', border: '1px solid #7f1d1d44', fontSize: 13 }}>{w}</span>
                ))}
              </div>
            </div>
          )}
          {verb.similarTo.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>類似表現</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {verb.similarTo.map(w => (
                  <span key={w} style={{ padding: '4px 10px', borderRadius: 999, background: '#14532d22', color: '#86efac', border: '1px solid #14532d44', fontSize: 13 }}>{w}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Patterns with phrases */}
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
              {patternPhrases.length === 0 ? (
                <div style={{ padding: '20px', color: '#475569', fontSize: 14, fontStyle: 'italic' }}>
                  まだ例文なし
                </div>
              ) : (
                patternPhrases.map(phrase => (
                  <div key={phrase.id} style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: 16, color: '#f1f5f9', marginBottom: 4 }}>{phrase.text}</div>
                        <div style={{ fontSize: 13, color: '#94a3b8' }}>{phrase.japanese}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                        <div style={{ fontSize: 12, color: getStrengthColor(phrase.easeFactor), fontWeight: 600 }}>
                          {getStrengthLabel(phrase.easeFactor)}
                        </div>
                        <div style={{ fontSize: 11, color: '#475569' }}>due {phrase.dueDate}</div>
                      </div>
                    </div>
                    {phrase.note && (
                      <div style={{ marginTop: 8, fontSize: 12, color: '#64748b', background: '#0f172a', padding: '8px 12px', borderRadius: 6 }}>
                        {phrase.note}
                      </div>
                    )}
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
