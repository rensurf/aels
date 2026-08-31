import { useEffect } from 'react'
import { fetchStats, postStudyTime } from '../api'

const STORAGE_KEY = 'aels_study_time'

export function readStudyData(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, number>
  } catch {
    return {}
  }
}

function writeStudyData(data: Record<string, number>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

// Fetch DynamoDB data and merge into localStorage (DynamoDB wins for each date)
export async function syncStudyDataFromServer(): Promise<void> {
  try {
    const stats = await fetchStats()
    const remote = stats.study_minutes_by_date ?? {}
    const local = readStudyData()
    const merged: Record<string, number> = { ...local }
    for (const [date, minutes] of Object.entries(remote)) {
      // Remote is the source of truth — use max to avoid overwriting
      // data sent from another device that hasn't been reflected locally yet
      merged[date] = Math.max(merged[date] ?? 0, minutes)
    }
    writeStudyData(merged)
  } catch {
    // silent — offline or API unavailable
  }
}

export function useStudyTimer(): void {
  useEffect(() => {
    syncStudyDataFromServer()

    let sessionStart = Date.now()

    async function flush() {
      if (document.hidden) return
      const elapsed = Math.floor((Date.now() - sessionStart) / 60000)
      if (elapsed <= 0) return

      const today = new Date().toISOString().slice(0, 10)
      const data = readStudyData()
      data[today] = (data[today] ?? 0) + elapsed
      writeStudyData(data)
      sessionStart = Date.now()

      // Sync to DynamoDB
      await postStudyTime(today, elapsed).catch(() => {/* silent */})
    }

    function onVisibilityChange() {
      if (document.hidden) {
        flush()
      } else {
        syncStudyDataFromServer()
        sessionStart = Date.now()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', () => { flush() })
    const interval = setInterval(() => { flush() }, 60000)

    return () => {
      flush()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      clearInterval(interval)
    }
  }, [])
}
