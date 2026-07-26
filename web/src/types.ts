export type Register = 'formal' | 'informal'
export type PhraseType = 'sentence' | 'phrasal_verb' | 'idiom' | 'fixed_phrase'

export interface VerbPattern {
  code: string
  description: string
  examples: string[]
  memo?: string
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
}

export interface Alternative {
  text: string
  note: string
  verb_id: string
  register: Register
}

export interface PhraseGroup {
  id: string
  japanese: string
  alternatives: Alternative[]
  easeFactor: number
  dueDate: string
  repetitions: number
  interval: number
  createdAt: string
}

export interface Verb {
  id: string
  base: string
  patterns: VerbPattern[]
  confusableWith: string[]
  similarTo: string[]
  nounForm?: string
  adjForm?: string
}
