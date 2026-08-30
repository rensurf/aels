import { useState, useEffect, useCallback } from 'react'
import { fetchPhrases, fetchVerbs, fetchStats, fetchRoutine, completeRoutineStep } from './api'
import type { Phrase, Verb, RoutineStep } from './types'
import { VariantA } from './variants/VariantA'
import { VariantB } from './variants/VariantB'
import { VariantC } from './variants/VariantC'
import { VariantD } from './variants/VariantD'
import { VariantE } from './variants/VariantE'
import { VariantF } from './variants/VariantF'
import { VariantG } from './variants/VariantG'
import { NavBar } from './components/NavBar'
import { useStudyTimer } from './hooks/useStudyTimer'

type View = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'

export default function App() {
  useStudyTimer()
  const [view, setView] = useState<View>('A')
  const [phrases, setPhrases] = useState<Phrase[]>([])
  const [verbs, setVerbs] = useState<Verb[]>([])
  const [streak, setStreak] = useState(0)
  const [completedDates, setCompletedDates] = useState<string[]>([])
  const [completedSteps, setCompletedSteps] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetchPhrases(), fetchVerbs(), fetchStats(), fetchRoutine()])
      .then(([p, v, s, r]) => {
        setPhrases(p)
        setVerbs(v)
        setStreak(s.current_streak)
        setCompletedDates(s.completed_dates)
        setCompletedSteps(r.completed)
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  const handleStepComplete = useCallback(async (step: RoutineStep) => {
    try {
      const routine = await completeRoutineStep(step)
      setCompletedSteps(routine.completed)
    } catch {
      // best-effort
    }
  }, [])

  const handlePhrasesAdded = useCallback((newPhrases: Phrase[]) => {
    setPhrases(prev => [...prev, ...newPhrases])
  }, [])

  const handlePhraseUpdated = useCallback((updated: Phrase) => {
    setPhrases(prev => prev.map(p => p.id === updated.id ? updated : p))
  }, [])

  const handlePhraseDeleted = useCallback((phraseId: string) => {
    setPhrases(prev => prev.filter(p => p.id !== phraseId))
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
      {view === 'A' && <VariantA verbs={verbs} phrases={phrases} onVerbAdded={handleVerbAdded} onVerbUpdated={handleVerbUpdated} onVerbDeleted={handleVerbDeleted} onVerbStepDone={() => handleStepComplete('verb')} verbStepAlreadyDone={completedSteps.includes('verb')} />}
      {view === 'B' && <VariantB verbs={verbs} phrases={phrases} onPhrasesAdded={handlePhrasesAdded} onPhraseUpdated={handlePhraseUpdated} onPhraseDeleted={handlePhraseDeleted} />}
      {view === 'C' && <VariantC phrases={phrases} verbs={verbs} streak={streak} completedDates={completedDates} onPhraseReviewed={handlePhraseUpdated} onStreakUpdated={handleStreakUpdated} onPhraseStepDone={() => handleStepComplete('phrase')} />}
      {view === 'D' && <VariantD onPhrasesAdded={handlePhrasesAdded} />}
      {view === 'E' && <VariantE phrases={phrases} onPhrasesAdded={handlePhrasesAdded} onPhraseReviewed={handlePhraseUpdated} />}
      {view === 'F' && <VariantF />}
      {view === 'G' && <VariantG onReviewStepDone={() => handleStepComplete('review')} onWritingStepDone={() => handleStepComplete('writing')} />}
      <NavBar current={view} onChange={k => setView(k as View)} completedSteps={completedSteps} />
    </>
  )
}
