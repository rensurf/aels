import type { Phrase, Verb, PhraseType, Alternative, PhrasalVerb, Topic, SpeechFeedback, RoutineProgress, RoutineStep, Correction } from './types'

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
    alternatives: Array.isArray(r.alternatives) ? (r.alternatives as Alternative[]) : undefined,
    source: r.source != null ? String(r.source) : undefined,
    createdAt: r.created_at != null ? String(r.created_at) : undefined,
  }
}

function mapVerb(r: Record<string, unknown>): Verb {
  const rawPatterns = (r.patterns as Verb['patterns']) ?? []
  return {
    id: String(r.verb_id),
    base: String(r.base),
    patterns: rawPatterns.map(p => ({ ...p, examples: p.examples ?? [] })),
    confusableWith: (r.confusable_with as string[]) ?? [],
    similarTo: (r.similar_to as string[]) ?? [],
    phrasalVerbs: ((r.phrasal_verbs as PhrasalVerb[]) ?? []).map(pv => ({
      phrase: pv.phrase ?? '',
      pattern: pv.pattern ?? '',
      definition: pv.definition ?? '',
      example: pv.example ?? '',
    })),
    tags: (r.tags as string[]) ?? [],
    nounForm: r.noun_form != null ? String(r.noun_form) : undefined,
    adjForm: r.adj_form != null ? String(r.adj_form) : undefined,
    memo: r.memo != null ? String(r.memo) : undefined,
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
  alternatives?: Alternative[]
  source?: string
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

export async function addAlternativeToPhrase(phraseId: string, alternative: {
  text: string
  note?: string
  verb_id?: string
  register?: Alternative['register']
}): Promise<Phrase> {
  const resp = await fetch(`${API_BASE}/phrases/${phraseId}/alternatives`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(alternative),
  })
  if (!resp.ok) throw new Error(`Add alternative failed: ${resp.status}`)
  return mapPhrase(await resp.json() as Record<string, unknown>)
}

export async function deletePhrase(phraseId: string): Promise<void> {
  const resp = await fetch(`${API_BASE}/phrases/${phraseId}`, {
    method: 'DELETE',
    headers,
  })
  if (!resp.ok) throw new Error(`Failed to delete phrase: ${resp.status}`)
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
  study_minutes_by_date: Record<string, number>
}

export async function fetchStats(): Promise<Stats> {
  const resp = await fetch(`${API_BASE}/stats`, { headers })
  if (!resp.ok) throw new Error(`Fetch stats failed: ${resp.status}`)
  return resp.json() as Promise<Stats>
}

export async function postStudyTime(date: string, minutes: number): Promise<void> {
  await fetch(`${API_BASE}/stats/study-time`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, minutes }),
  })
}

export interface VocabExtractItem {
  word: string
  japanese: string
  type: PhraseType
  note: string
  example: string
}

export async function extractVocab(text: string): Promise<VocabExtractItem[]> {
  const resp = await fetch(`${API_BASE}/vocab/extract`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!resp.ok) throw new Error(`Extract vocab failed: ${resp.status}`)
  const json = await resp.json() as { items: VocabExtractItem[] }
  return json.items
}

export async function updateVerb(verb: Verb): Promise<Verb> {
  const body: Record<string, unknown> = {
    base: verb.base,
    patterns: verb.patterns,
    confusable_with: verb.confusableWith,
    similar_to: verb.similarTo,
    phrasal_verbs: verb.phrasalVerbs,
    tags: verb.tags,
  }
  if (verb.nounForm) body.noun_form = verb.nounForm
  if (verb.adjForm) body.adj_form = verb.adjForm
  if (verb.memo) body.memo = verb.memo
  const resp = await fetch(`${API_BASE}/verbs/${verb.id}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) throw new Error(`Failed to save verb: ${resp.status}`)
  return mapVerb(await resp.json() as Record<string, unknown>)
}

// ─── Topics ──────────────────────────────────────────────────────────────────

export async function fetchTopics(): Promise<Topic[]> {
  const resp = await fetch(`${API_BASE}/topics`, { headers })
  if (!resp.ok) throw new Error(`Failed to fetch topics: ${resp.status}`)
  return resp.json() as Promise<Topic[]>
}

export async function fetchTopicsToday(): Promise<Topic[]> {
  const resp = await fetch(`${API_BASE}/topics/today`, { headers })
  if (!resp.ok) throw new Error(`Failed to fetch today's topics: ${resp.status}`)
  return resp.json() as Promise<Topic[]>
}

export async function addTopicBullet(
  topicId: string,
  bullet: { ja: string; en?: string; example?: string },
): Promise<Topic> {
  const resp = await fetch(`${API_BASE}/topics/${topicId}/bullets`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(bullet),
  })
  if (!resp.ok) throw new Error(`Failed to add bullet: ${resp.status}`)
  return resp.json() as Promise<Topic>
}

export async function updateTopicBullet(
  topicId: string,
  bulletId: string,
  updates: { ja?: string; en?: string; example?: string },
): Promise<Topic> {
  const resp = await fetch(`${API_BASE}/topics/${topicId}/bullets/${bulletId}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!resp.ok) throw new Error(`Failed to update bullet: ${resp.status}`)
  return resp.json() as Promise<Topic>
}

export async function deleteTopicBullet(topicId: string, bulletId: string): Promise<Topic> {
  const resp = await fetch(`${API_BASE}/topics/${topicId}/bullets/${bulletId}`, {
    method: 'DELETE',
    headers,
  })
  if (!resp.ok) throw new Error(`Failed to delete bullet: ${resp.status}`)
  return resp.json() as Promise<Topic>
}

export async function analyzeTopicSpeech(topicId: string, text: string): Promise<SpeechFeedback> {
  const resp = await fetch(`${API_BASE}/topics/${topicId}/session`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!resp.ok) throw new Error(`Failed to analyze speech: ${resp.status}`)
  return resp.json() as Promise<SpeechFeedback>
}

export async function createTopic(title: string, number?: number): Promise<Topic> {
  const resp = await fetch(`${API_BASE}/topics`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, number }),
  })
  if (!resp.ok) throw new Error(`Failed to create topic: ${resp.status}`)
  return resp.json() as Promise<Topic>
}

export async function updateTopic(
  topicId: string,
  updates: { title?: string; number?: number; script?: string; levels?: Record<string, { chunk: string; cues: string[] }[]> },
): Promise<Topic> {
  const resp = await fetch(`${API_BASE}/topics/${topicId}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!resp.ok) throw new Error(`Failed to update topic: ${resp.status}`)
  return resp.json() as Promise<Topic>
}

export async function addTopicCorrection(
  topicId: string,
  correction: { original: string; corrected: string; note: string },
): Promise<Topic> {
  const resp = await fetch(`${API_BASE}/topics/${topicId}/corrections`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(correction),
  })
  if (!resp.ok) throw new Error(`Failed to add correction: ${resp.status}`)
  return resp.json() as Promise<Topic>
}

export async function deleteTopicCorrection(topicId: string, correctionId: string): Promise<Topic> {
  const resp = await fetch(`${API_BASE}/topics/${topicId}/corrections/${correctionId}`, {
    method: 'DELETE',
    headers,
  })
  if (!resp.ok) throw new Error(`Failed to delete correction: ${resp.status}`)
  return resp.json() as Promise<Topic>
}

export async function deleteTopic(topicId: string): Promise<void> {
  const resp = await fetch(`${API_BASE}/topics/${topicId}`, {
    method: 'DELETE',
    headers,
  })
  if (!resp.ok) throw new Error(`Failed to delete topic: ${resp.status}`)
}

export async function extractTopicLevels(topicId: string, script: string): Promise<Topic> {
  const resp = await fetch(`${API_BASE}/topics/${topicId}/keywords`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ script }),
  })
  if (!resp.ok) throw new Error(`Failed to extract levels: ${resp.status}`)
  return resp.json() as Promise<Topic>
}

export async function reviewTopic(topicId: string, quality: number): Promise<Topic> {
  const resp = await fetch(`${API_BASE}/topics/${topicId}/review`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ quality }),
  })
  if (!resp.ok) throw new Error(`Failed to review topic: ${resp.status}`)
  return resp.json() as Promise<Topic>
}

export async function fetchRoutine(): Promise<RoutineProgress> {
  const resp = await fetch(`${API_BASE}/routine`, { headers })
  if (!resp.ok) throw new Error(`fetchRoutine failed: ${resp.status}`)
  return resp.json() as Promise<RoutineProgress>
}

function mapCorrection(r: Record<string, unknown>): Correction {
  return {
    id: String(r.correction_id),
    original: String(r.original ?? ''),
    corrected: String(r.corrected ?? ''),
    note: String(r.note ?? ''),
    submittedAt: String(r.submitted_at ?? ''),
    easeFactor: Number(r.ease_factor ?? 2.5),
    interval: Number(r.interval ?? 0),
    repetitions: Number(r.repetitions ?? 0),
    dueDate: String(r.due_date ?? ''),
  }
}

export interface SpeechAnalysisResult {
  transcript: string
  corrections: { original: string; corrected: string; note: string }[]
}

export async function analyzeSpeech(payload: { audio_base64?: string; mime_type?: string; text?: string }): Promise<SpeechAnalysisResult> {
  const resp = await fetch(`${API_BASE}/speech/analyze`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) throw new Error(`analyzeSpeech failed: ${resp.status}`)
  return resp.json() as Promise<SpeechAnalysisResult>
}

export async function fetchCorrections(dueBefore?: string): Promise<Correction[]> {
  const qs = dueBefore ? `?due_before=${dueBefore}` : ''
  const resp = await fetch(`${API_BASE}/corrections${qs}`, { headers })
  if (!resp.ok) throw new Error(`fetchCorrections failed: ${resp.status}`)
  const data = await resp.json() as { items: Record<string, unknown>[] }
  return data.items.map(mapCorrection)
}

export async function saveCorrections(items: { original: string; corrected: string; note: string }[]): Promise<Correction[]> {
  const resp = await fetch(`${API_BASE}/corrections`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  })
  if (!resp.ok) throw new Error(`saveCorrections failed: ${resp.status}`)
  const data = await resp.json() as { items: Record<string, unknown>[] }
  return data.items.map(mapCorrection)
}

export async function reviewCorrection(correctionId: string, quality: number): Promise<{ correction: Correction; remaining_due: number }> {
  const resp = await fetch(`${API_BASE}/corrections/${correctionId}/review`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ quality }),
  })
  if (!resp.ok) throw new Error(`reviewCorrection failed: ${resp.status}`)
  const data = await resp.json() as { correction: Record<string, unknown>; remaining_due: number }
  return { correction: mapCorrection(data.correction), remaining_due: data.remaining_due }
}

export async function deleteCorrection(correctionId: string): Promise<void> {
  const resp = await fetch(`${API_BASE}/corrections/${correctionId}`, {
    method: 'DELETE',
    headers,
  })
  if (!resp.ok) throw new Error(`deleteCorrection failed: ${resp.status}`)
}

export async function completeRoutineStep(step: RoutineStep): Promise<RoutineProgress> {
  const resp = await fetch(`${API_BASE}/routine/complete`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ step }),
  })
  if (!resp.ok) throw new Error(`completeRoutineStep failed: ${resp.status}`)
  return resp.json() as Promise<RoutineProgress>
}
