import type { Phrase, Verb } from './types'

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) ?? ''
const API_KEY = (import.meta.env.VITE_API_KEY as string) ?? ''

const headers = { 'x-api-key': API_KEY }

function mapPhrase(r: Record<string, unknown>): Phrase {
  return {
    id: String(r.phrase_id),
    text: String(r.text),
    japanese: String(r.japanese ?? ''),
    note: String(r.note ?? ''),
    verbId: String(r.verb_id ?? ''),
    pattern: String(r.pattern ?? ''),
    register: (r.register as Phrase['register']) ?? 'informal',
    easeFactor: Number(r.ease_factor ?? 2.5),
    dueDate: String(r.due_date ?? ''),
    repetitions: Number(r.repetitions ?? 0),
    interval: Number(r.interval ?? 0),
    memo: r.memo != null ? String(r.memo) : undefined,
  }
}

function mapVerb(r: Record<string, unknown>): Verb {
  return {
    id: String(r.verb_id),
    base: String(r.base),
    patterns: (r.patterns as Verb['patterns']) ?? [],
    confusableWith: (r.confusable_with as string[]) ?? [],
    similarTo: (r.similar_to as string[]) ?? [],
    nounForm: r.noun_form != null ? String(r.noun_form) : undefined,
    adjForm: r.adj_form != null ? String(r.adj_form) : undefined,
  }
}

export async function fetchPhrases(filters?: {
  verb_id?: string
  pattern?: string
  due_before?: string
}): Promise<Phrase[]> {
  const params = new URLSearchParams()
  if (filters?.verb_id) params.set('verb_id', filters.verb_id)
  if (filters?.pattern) params.set('pattern', filters.pattern)
  if (filters?.due_before) params.set('due_before', filters.due_before)
  const qs = params.size ? `?${params}` : ''
  const resp = await fetch(`${API_BASE}/phrases${qs}`, { headers })
  const json = await resp.json() as { items: Record<string, unknown>[] }
  return json.items.map(mapPhrase)
}

export async function fetchVerbs(): Promise<Verb[]> {
  const resp = await fetch(`${API_BASE}/verbs`, { headers })
  const json = await resp.json() as { items: Record<string, unknown>[] }
  return json.items.map(mapVerb)
}

export async function fetchVerb(verbId: string): Promise<Verb | null> {
  const resp = await fetch(`${API_BASE}/verbs/${verbId}`, { headers })
  if (resp.status === 404) return null
  const json = await resp.json() as Record<string, unknown>
  return mapVerb(json)
}
