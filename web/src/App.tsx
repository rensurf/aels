import { useState, useEffect, useCallback } from 'react'
import { fetchPhrases, fetchVerbs, fetchStats, fetchPhraseGroups } from './api'
import type { Phrase, Verb, PhraseGroup } from './types'
import { VariantA } from './variants/VariantA'
import { VariantB } from './variants/VariantB'
import { VariantC } from './variants/VariantC'
import { VariantD } from './variants/VariantD'
import { NavBar } from './components/NavBar'

type View = 'A' | 'B' | 'C' | 'D'

export default function App() {
  const [view, setView] = useState<View>('B')
  const [phrases, setPhrases] = useState<Phrase[]>([])
  const [phraseGroups, setPhraseGroups] = useState<PhraseGroup[]>([])
  const [verbs, setVerbs] = useState<Verb[]>([])
  const [streak, setStreak] = useState(0)
  const [completedDates, setCompletedDates] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetchPhrases(), fetchVerbs(), fetchStats(), fetchPhraseGroups()])
      .then(([p, v, s, g]) => {
        setPhrases(p)
        setVerbs(v)
        setStreak(s.current_streak)
        setCompletedDates(s.completed_dates)
        setPhraseGroups(g)
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  const handlePhrasesAdded = useCallback((newPhrases: Phrase[]) => {
    setPhrases(prev => [...prev, ...newPhrases])
  }, [])

  const handleGroupAdded = useCallback((group: PhraseGroup) => {
    setPhraseGroups(prev => [group, ...prev])
  }, [])

  const handleGroupUpdated = useCallback((group: PhraseGroup) => {
    setPhraseGroups(prev => prev.map(g => g.id === group.id ? group : g))
  }, [])

  const handlePhraseUpdated = useCallback((updated: Phrase) => {
    setPhrases(prev => prev.map(p => p.id === updated.id ? updated : p))
  }, [])

  const handleStreakUpdated = useCallback((newStreak: number, newDates: string[]) => {
    setStreak(newStreak)
    setCompletedDates(newDates)
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
      {view === 'B' && <VariantB verbs={verbs} phrases={phrases} phraseGroups={phraseGroups} onPhrasesAdded={handlePhrasesAdded} onPhraseUpdated={handlePhraseUpdated} onGroupUpdated={handleGroupUpdated} />}
      {view === 'C' && <VariantC phrases={phrases} phraseGroups={phraseGroups} verbs={verbs} streak={streak} completedDates={completedDates} onPhraseReviewed={handlePhraseUpdated} onGroupReviewed={handleGroupUpdated} onStreakUpdated={handleStreakUpdated} />}
      {view === 'D' && <VariantD onPhrasesAdded={handlePhrasesAdded} onGroupAdded={handleGroupAdded} />}
      <NavBar current={view} onChange={k => setView(k as View)} />
    </>
  )
}
