import type { Phrase, Verb, PhraseType, PhraseGroup, Alternative } from './types'

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
    type: (r.type as PhraseType) ?? 'sentence',
    easeFactor: Number(r.ease_factor ?? 2.5),
    dueDate: String(r.due_date ?? ''),
    repetitions: Number(r.repetitions ?? 0),
    interval: Number(r.interval ?? 0),
    memo: r.memo != null ? String(r.memo) : undefined,
    examples: Array.isArray(r.examples) ? (r.examples as string[]) : undefined,
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

export async function chatWithTeacher(text: string, threadId?: string): Promise<ChatResponse> {
  const body: Record<string, string> = { text }
  if (threadId) body.thread_id = threadId
  const resp = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) throw new Error(`Chat failed: ${resp.status}`)
  return resp.json() as Promise<ChatResponse>
}

export interface Thread {
  thread_id: string
  created_at: string
}

export interface ThreadDetail extends Thread {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}

export async function createThread(): Promise<Thread> {
  const resp = await fetch(`${API_BASE}/threads`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!resp.ok) throw new Error(`Create thread failed: ${resp.status}`)
  return resp.json() as Promise<Thread>
}

export async function fetchThreads(): Promise<Thread[]> {
  const resp = await fetch(`${API_BASE}/threads`, { headers })
  if (!resp.ok) throw new Error(`Fetch threads failed: ${resp.status}`)
  const json = await resp.json() as { items: Thread[] }
  return json.items
}

export async function fetchThread(threadId: string): Promise<ThreadDetail> {
  const resp = await fetch(`${API_BASE}/threads/${threadId}`, { headers })
  if (!resp.ok) throw new Error(`Fetch thread failed: ${resp.status}`)
  return resp.json() as Promise<ThreadDetail>
}

export async function savePhrase(phrase: {
  text: string
  japanese: string
  note: string
  verb_id: string
  pattern: string
  register: Phrase['register']
  type?: PhraseType
  examples?: string[]
}): Promise<Phrase> {
  const resp = await fetch(`${API_BASE}/phrases`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(phrase),
  })
  if (!resp.ok) throw new Error(`Save phrase failed: ${resp.status}`)
  return mapPhrase(await resp.json() as Record<string, unknown>)
}

export interface AnalyzeResponse {
  japanese: string
  type: PhraseType
  verb_id: string
  note: string
  register: Phrase['register']
  example: string
}

export async function updatePhrase(phraseId: string, updates: {
  text?: string
  japanese?: string
  note?: string
  verb_id?: string
  register?: Phrase['register']
  type?: PhraseType
  examples?: string[]
}): Promise<Phrase> {
  const resp = await fetch(`${API_BASE}/phrases/${phraseId}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!resp.ok) throw new Error(`Update phrase failed: ${resp.status}`)
  return mapPhrase(await resp.json() as Record<string, unknown>)
}

export async function analyzePhrase(text: string): Promise<AnalyzeResponse> {
  const resp = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!resp.ok) throw new Error(`Analyze failed: ${resp.status}`)
  return resp.json() as Promise<AnalyzeResponse>
}

export interface ReviewResponse {
  phrase: Phrase
  remaining_due: number
  streak: number
  streak_updated: boolean
}

export async function reviewPhrase(phraseId: string, quality: number): Promise<ReviewResponse> {
  const resp = await fetch(`${API_BASE}/phrases/${phraseId}/review`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ quality }),
  })
  if (!resp.ok) throw new Error(`Review failed: ${resp.status}`)
  const raw = await resp.json() as { phrase: Record<string, unknown>; remaining_due: number; streak: number; streak_updated: boolean }
  return { ...raw, phrase: mapPhrase(raw.phrase) }
}

export interface Stats {
  current_streak: number
  best_streak: number
  last_completed_date: string | null
  completed_dates: string[]
}

export async function fetchStats(): Promise<Stats> {
  const resp = await fetch(`${API_BASE}/stats`, { headers })
  if (!resp.ok) throw new Error(`Fetch stats failed: ${resp.status}`)
  return resp.json() as Promise<Stats>
}

function mapPhraseGroup(r: Record<string, unknown>): PhraseGroup {
  return {
    id: String(r.group_id),
    japanese: String(r.japanese ?? ''),
    alternatives: (r.alternatives as Alternative[]) ?? [],
    easeFactor: Number(r.ease_factor ?? 2.5),
    dueDate: String(r.due_date ?? ''),
    repetitions: Number(r.repetitions ?? 0),
    interval: Number(r.interval ?? 0),
    createdAt: String(r.created_at ?? ''),
  }
}

export async function fetchPhraseGroups(): Promise<PhraseGroup[]> {
  const resp = await fetch(`${API_BASE}/phrase-groups`, { headers })
  if (!resp.ok) throw new Error(`Fetch phrase groups failed: ${resp.status}`)
  const json = await resp.json() as { items: Record<string, unknown>[] }
  return json.items.map(mapPhraseGroup)
}

export async function savePhraseGroup(group: {
  japanese: string
  alternatives: Alternative[]
}): Promise<PhraseGroup> {
  const resp = await fetch(`${API_BASE}/phrase-groups`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(group),
  })
  if (!resp.ok) throw new Error(`Save phrase group failed: ${resp.status}`)
  return mapPhraseGroup(await resp.json() as Record<string, unknown>)
}

export interface GroupReviewResponse {
  group: PhraseGroup
  remaining_due: number
  streak: number
  streak_updated: boolean
}

export async function reviewPhraseGroup(groupId: string, quality: number): Promise<GroupReviewResponse> {
  const resp = await fetch(`${API_BASE}/phrase-groups/${groupId}/review`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ quality }),
  })
  if (!resp.ok) throw new Error(`Review group failed: ${resp.status}`)
  const raw = await resp.json() as { group: Record<string, unknown>; remaining_due: number; streak: number; streak_updated: boolean }
  return { ...raw, group: mapPhraseGroup(raw.group) }
}

export async function addAlternative(groupId: string, alternative: {
  text: string
  note?: string
  verb_id?: string
  register?: Alternative['register']
}): Promise<PhraseGroup> {
  const resp = await fetch(`${API_BASE}/phrase-groups/${groupId}/alternatives`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(alternative),
  })
  if (!resp.ok) throw new Error(`Add alternative failed: ${resp.status}`)
  return mapPhraseGroup(await resp.json() as Record<string, unknown>)
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
