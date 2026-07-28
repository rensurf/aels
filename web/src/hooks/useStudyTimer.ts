import { useEffect } from 'react'

const STORAGE_KEY = 'aels_study_time'

export function readStudyData(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, number>
  } catch {
    return {}
  }
}

export function useStudyTimer(): void {
  useEffect(() => {
    let sessionStart = Date.now()

    function flush() {
      if (document.hidden) return
      const elapsed = Math.floor((Date.now() - sessionStart) / 60000)
      if (elapsed <= 0) return
      const today = new Date().toISOString().slice(0, 10)
      const data = readStudyData()
      data[today] = (data[today] ?? 0) + elapsed
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      sessionStart = Date.now()
    }

    function onVisibilityChange() {
      if (document.hidden) {
        flush()
      } else {
        sessionStart = Date.now()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('beforeunload', flush)
    const interval = setInterval(flush, 60000)

    return () => {
      flush()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('beforeunload', flush)
      clearInterval(interval)
    }
  }, [])
}
