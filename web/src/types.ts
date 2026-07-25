export type Register = 'formal' | 'informal'

export interface VerbPattern {
  code: string
  description: string
  examples: string[]
}

export interface Phrase {
  id: string
  text: string
  japanese: string
  note: string
  verbId: string
  pattern: string
  register: Register
  easeFactor: number
  dueDate: string
  repetitions: number
  interval: number
  memo?: string
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
