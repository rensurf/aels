import { useEffect, useState } from 'react'

const VIEWS = [
  { key: 'A', name: 'Verb Map' },
  { key: 'B', name: 'Library' },
  { key: 'C', name: 'Daily Focus' },
  { key: 'D', name: 'Chat' },
  { key: 'E', name: 'Vocab' },
  { key: 'F', name: 'Talk' },
  { key: 'G', name: 'Writing' },
]

// Which completed step is required to access each variant
const LOCK_RULES: Record<string, { requires: string; message: string }> = {
  C: { requires: 'verb',   message: 'Verb Map (A) を完了してください' },
  G: { requires: 'phrase', message: 'Daily Focus (C) を完了してください' },
}

interface Props {
  current: string
  onChange: (key: string) => void
  completedSteps: string[]
}

export function NavBar({ current, onChange, completedSteps }: Props) {
  const [expanded, setExpanded] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  const isLocked = (key: string) => {
    const rule = LOCK_RULES[key]
    return rule ? !completedSteps.includes(rule.requires) : false
  }

  const navigate = (key: string) => {
    const rule = LOCK_RULES[key]
    if (rule && !completedSteps.includes(rule.requires)) {
      setToast(rule.message)
      return
    }
    onChange(key)
  }

  const idx = VIEWS.findIndex(v => v.key === current)

  const prevKey = (() => {
    for (let i = idx - 1; i >= 0; i--) {
      if (!isLocked(VIEWS[i].key)) return VIEWS[i].key
    }
    return VIEWS[idx].key
  })()

  const nextKey = (() => {
    for (let i = idx + 1; i < VIEWS.length; i++) {
      if (!isLocked(VIEWS[i].key)) return VIEWS[i].key
    }
    return VIEWS[idx].key
  })()

  const prev = VIEWS.find(v => v.key === prevKey)!
  const next = VIEWS.find(v => v.key === nextKey)!
  const label = VIEWS[idx]

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (['INPUT', 'TEXTAREA'].includes(tag)) return
      if (e.key === 'ArrowLeft') navigate(prevKey)
      if (e.key === 'ArrowRight') navigate(nextKey)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [prevKey, nextKey])

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{
          position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          width: 36, height: 36, borderRadius: '50%',
          background: '#1e293b', border: 'none', color: '#94a3b8',
          fontSize: 18, cursor: 'pointer', zIndex: 9999,
          boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        title="Show navigation"
      >
        ⋯
      </button>
    )
  }

  return (
    <>
      {toast && (
        <div style={{
          position: 'fixed', bottom: 72, left: '50%', transform: 'translateX(-50%)',
          background: '#1e293b', color: '#f8fafc', borderRadius: 8,
          padding: '8px 16px', fontSize: 13, zIndex: 9999,
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          border: '1px solid #ef4444', whiteSpace: 'nowrap',
        }}>
          🔒 {toast}
        </div>
      )}
      <div style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: '#1e293b',
        color: '#f8fafc',
        borderRadius: 999,
        padding: '8px 14px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        fontFamily: 'monospace',
        fontSize: 13,
        zIndex: 9999,
        userSelect: 'none',
      }}>
        <button onClick={() => navigate(prev.key)} style={btnStyle}>←</button>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {VIEWS.map(v => {
            const locked = isLocked(v.key)
            const active = v.key === current
            return (
              <button
                key={v.key}
                onClick={() => navigate(v.key)}
                title={locked ? `🔒 ${LOCK_RULES[v.key]?.message}` : v.name}
                style={{
                  background: active ? 'rgba(255,255,255,0.15)' : 'none',
                  border: 'none',
                  color: locked ? '#475569' : active ? '#fff' : '#94a3b8',
                  borderRadius: 4,
                  padding: '3px 7px',
                  cursor: locked ? 'not-allowed' : 'pointer',
                  fontSize: 12,
                  fontWeight: active ? 700 : 400,
                  position: 'relative',
                }}
              >
                {locked && <span style={{ fontSize: 9, marginRight: 2 }}>🔒</span>}
                {v.key}
              </button>
            )
          })}
        </div>
        <button onClick={() => navigate(next.key)} style={btnStyle}>→</button>
        <span style={{ opacity: 0.4, fontSize: 11, margin: '0 2px' }}>—</span>
        <span style={{ opacity: 0.5, fontSize: 11 }}>{label?.name}</span>
        <button onClick={() => setExpanded(false)} style={{ ...btnStyle, opacity: 0.4, fontSize: 12, padding: '4px 7px' }} title="Hide">✕</button>
      </div>
    </>
  )
}

const btnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.1)',
  border: 'none',
  color: '#fff',
  borderRadius: 6,
  padding: '4px 10px',
  cursor: 'pointer',
  fontSize: 16,
}
