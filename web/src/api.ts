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

export async function deleteVerb(verbId: string): Promise<void> {
  const resp = await fetch(`${API_BASE}/verbs/${verbId}`, {
    method: 'DELETE',
    headers,
  })
  if (!resp.ok) throw new Error(`Failed to delete verb: ${resp.status}`)
}

export async function createVerb(base: string): Promise<Verb> {
  const resp = await fetch(`${API_BASE}/verbs`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ base }),
  })
  if (!resp.ok) throw new Error(`Failed to generate verb: ${resp.status}`)
  return mapVerb(await resp.json() as Record<string, unknown>)
}

export interface ChatResponse {
  message: string
  phrases: Array<{
    text: string
    japanese: string
    note: string
    verb_id: string
    pattern: string
    register: Phrase['register']
  }>
}

export async function chatWithTeacher(text: string): Promise<ChatResponse> {
  const resp = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!resp.ok) throw new Error(`Chat failed: ${resp.status}`)
  return resp.json() as Promise<ChatResponse>
}

export async function savePhrase(phrase: {
  text: string
  japanese: string
  note: string
  verb_id: string
  pattern: string
  register: Phrase['register']
}): Promise<Phrase> {
  const resp = await fetch(`${API_BASE}/phrases`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(phrase),
  })
  if (!resp.ok) throw new Error(`Save phrase failed: ${resp.status}`)
  return mapPhrase(await resp.json() as Record<string, unknown>)
}

export async function updateVerb(verb: Verb): Promise<Verb> {
  const body: Record<string, unknown> = {
    base: verb.base,
    patterns: verb.patterns,
    confusable_with: verb.confusableWith,
    similar_to: verb.similarTo,
  }
  if (verb.nounForm) body.noun_form = verb.nounForm
  if (verb.adjForm) body.adj_form = verb.adjForm
  const resp = await fetch(`${API_BASE}/verbs/${verb.id}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) throw new Error(`Failed to save verb: ${resp.status}`)
  return mapVerb(await resp.json() as Record<string, unknown>)
}
