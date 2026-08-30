export type Register = 'formal' | 'informal'
export type PhraseType = 'sentence' | 'phrasal_verb' | 'idiom' | 'fixed_phrase' | 'noun' | 'adjective' | 'collocation'

export interface VerbPattern {
  code: string
  description: string
  examples: string[]
  memo?: string
}

export interface Alternative {
  text: string
  note: string
  verb_id: string
  register: Register
}

export interface Phrase {
  id: string
  text: string
  japanese: string
  note: string
  verbId: string
  pattern: string
  register: Register
  type: PhraseType
  easeFactor: number
  dueDate: string
  repetitions: number
  interval: number
  memo?: string
  examples?: string[]
  alternatives?: Alternative[]
  source?: string
  createdAt?: string
}

export interface PhrasalVerb {
  phrase: string
  pattern: string
  definition: string
  example: string
}

export interface TopicBullet {
  bullet_id: string
  ja: string
  en: string
  example: string
}

export interface TopicCorrection {
  correction_id: string
  original: string
  corrected: string
  note: string
  saved_at: string
}

export interface Topic {
  topic_id: string
  number: number
  title: string
  bullets: TopicBullet[]
  script?: string
  levels?: Record<string, { chunk: string; cues: string[] }[]>
  corrections?: TopicCorrection[]
  ease_factor: number
  interval: number
  repetitions: number
  due_date: string
  last_practiced?: string
}

export interface SpeechFeedback {
  grammar: { original: string; corrected: string; note: string }[]
  naturalness: { theirs: string; native: string; note: string }[]
  phrases: { text: string; note: string }[]
  overall: string
  coverage_score: number
}

export interface Correction {
  id: string          // correction_id
  original: string
  corrected: string
  note: string
  submittedAt: string
  easeFactor: number
  interval: number
  repetitions: number
  dueDate: string
}

export type RoutineStep = 'verb' | 'phrase' | 'review' | 'writing'

export interface RoutineProgress {
  date: string
  completed: RoutineStep[]
}

export interface Verb {
  id: string
  base: string
  patterns: VerbPattern[]
  confusableWith: string[]
  similarTo: string[]
  phrasalVerbs: PhrasalVerb[]
  tags: string[]
  nounForm?: string
  adjForm?: string
  memo?: string
}
