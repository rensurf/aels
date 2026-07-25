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

  const handlePhraseUpdated = useCallback((updated: Phrase) => {
    setPhrases(prev => prev.map(p => p.id === updated.id ? updated : p))
  }, [])

  const handleVerbAdded = useCallback((verb: Verb) => {
    setVerbs(prev => [...prev, verb])
  }, [])

  const handleVerbUpdated = useCallback((verb: Verb) => {
    setVerbs(prev => prev.map(v => v.id === verb.id ? verb : v))
  }, [])

  const handleVerbDeleted = useCallback((verbId: string) => {
    setVerbs(prev => prev.filter(v => v.id !== verbId))
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
      {view === 'A' && <VariantA verbs={verbs} phrases={phrases} onVerbAdded={handleVerbAdded} onVerbUpdated={handleVerbUpdated} onVerbDeleted={handleVerbDeleted} />}
      {view === 'B' && <VariantB verbs={verbs} phrases={phrases} onPhrasesAdded={handlePhrasesAdded} onPhraseUpdated={handlePhraseUpdated} />}
      {view === 'C' && <VariantC phrases={phrases} verbs={verbs} />}
      {view === 'D' && <VariantD onPhrasesAdded={handlePhrasesAdded} />}
      <NavBar current={view} onChange={k => setView(k as View)} />
    </>
  )
}
