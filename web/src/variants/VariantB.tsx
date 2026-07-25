import { useState } from 'react'
import type { Phrase, Verb, Register } from '../types'
import { getStrengthColor, getStrengthLabel, today } from '../utils'

type DueFilter = 'all' | 'due' | 'ok'

interface Props {
  verbs: Verb[]
  phrases: Phrase[]
}

export function VariantB({ verbs, phrases }: Props) {
  const [verbFilter, setVerbFilter] = useState('all')
  const [patternFilter, setPatternFilter] = useState('all')
  const [registerFilter, setRegisterFilter] = useState<'all' | Register>('all')
  const [dueFilter, setDueFilter] = useState<DueFilter>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const NOW = today()
  const dueToday = phrases.filter(p => p.dueDate <= NOW)
  const weakest = [...phrases].sort((a, b) => a.easeFactor - b.easeFactor)[0]
  const uniquePatterns = [...new Set(phrases.map(p => p.pattern))].filter(Boolean).sort()

  const filtered = phrases.filter(p => {
    if (verbFilter !== 'all' && p.verbId !== verbFilter) return false
    if (patternFilter !== 'all' && p.pattern !== patternFilter) return false
    if (registerFilter !== 'all' && p.register !== registerFilter) return false
    if (dueFilter === 'due' && p.dueDate > NOW) return false
    if (dueFilter === 'ok' && p.dueDate <= NOW) return false
    return true
  })

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 24px' }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>Phrase Library</h1>
      </div>

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
                {isExpanded && phrase.note && (
                  <div style={{ marginTop: 12, padding: '10px 12px', background: '#f8fafc', borderRadius: 6, fontSize: 13, color: '#475569', borderLeft: '3px solid #cbd5e1' }}>
                    {phrase.note}
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
