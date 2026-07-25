export function getStrengthLabel(easeFactor: number): string {
  if (easeFactor >= 2.5) return 'Strong'
  if (easeFactor >= 2.0) return 'OK'
  if (easeFactor >= 1.7) return 'Weak'
  return 'Critical'
}

export function getStrengthColor(easeFactor: number): string {
  if (easeFactor >= 2.5) return '#22c55e'
  if (easeFactor >= 2.0) return '#f59e0b'
  if (easeFactor >= 1.7) return '#ef4444'
  return '#991b1b'
}

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}
