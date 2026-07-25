import { useEffect } from 'react'

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

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      background: '#1e293b',
      color: '#f8fafc',
      borderRadius: 999,
      padding: '10px 20px',
      boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      fontFamily: 'monospace',
      fontSize: 13,
      zIndex: 9999,
      userSelect: 'none',
    }}>
      <button onClick={() => onChange(prev.key)} style={btnStyle}>←</button>
      <span style={{ minWidth: 140, textAlign: 'center' }}>
        <strong>{label?.key}</strong>
        <span style={{ opacity: 0.5 }}> — {label?.name}</span>
      </span>
      <button onClick={() => onChange(next.key)} style={btnStyle}>→</button>
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
