import { useEffect, useState } from 'react'

const VIEWS = [
  { key: 'A', name: 'Verb Map' },
  { key: 'B', name: 'Library' },
  { key: 'C', name: 'Daily Focus' },
  { key: 'D', name: 'Chat' },
]

interface Props {
  current: string
  onChange: (key: string) => void
}

export function NavBar({ current, onChange }: Props) {
  const [expanded, setExpanded] = useState(true)
  const idx = VIEWS.findIndex(v => v.key === current)
  const prev = VIEWS[(idx - 1 + VIEWS.length) % VIEWS.length]
  const next = VIEWS[(idx + 1) % VIEWS.length]
  const label = VIEWS[idx]

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (['INPUT', 'TEXTAREA'].includes(tag)) return
      if (e.key === 'ArrowLeft') onChange(prev.key)
      if (e.key === 'ArrowRight') onChange(next.key)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [prev, next, onChange])

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
      <button onClick={() => onChange(prev.key)} style={btnStyle}>←</button>
      <span style={{ minWidth: 120, textAlign: 'center' }}>
        <strong>{label?.key}</strong>
        <span style={{ opacity: 0.5 }}> — {label?.name}</span>
      </span>
      <button onClick={() => onChange(next.key)} style={btnStyle}>→</button>
      <button onClick={() => setExpanded(false)} style={{ ...btnStyle, opacity: 0.4, fontSize: 12, padding: '4px 7px' }} title="Hide">✕</button>
    </div>
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
