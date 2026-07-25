import { useState, useEffect, useCallback } from 'react'
import { fetchPhrases, fetchVerbs } from './api'
import type { Phrase, Verb } from './types'
import { VariantA } from './variants/VariantA'
import { VariantB } from './variants/VariantB'
import { VariantC } from './variants/VariantC'
import { VariantD } from './variants/VariantD'
import { NavBar } from './components/NavBar'

type View = 'A' | 'B' | 'C' | 'D'

export default function App() {
  const [view, setView] = useState<View>('B')
  const [phrases, setPhrases] = useState<Phrase[]>([])
  const [verbs, setVerbs] = useState<Verb[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetchPhrases(), fetchVerbs()])
      .then(([p, v]) => {
        setPhrases(p)
        setVerbs(v)
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  const handlePhrasesAdded = useCallback((newPhrases: Phrase[]) => {
    setPhrases(prev => [...prev, ...newPhrases])
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'system-ui', color: '#64748b' }}>
        Loading...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'system-ui', color: '#ef4444' }}>
        Error: {error}
      </div>
    )
  }

  return (
    <>
      {view === 'A' && <VariantA verbs={verbs} phrases={phrases} />}
      {view === 'B' && <VariantB verbs={verbs} phrases={phrases} />}
      {view === 'C' && <VariantC phrases={phrases} verbs={verbs} />}
      {view === 'D' && <VariantD onPhrasesAdded={handlePhrasesAdded} />}
      <NavBar current={view} onChange={k => setView(k as View)} />
    </>
  )
}
