// Temporary mock responses until Step 5 (real Chat API) is implemented.
import type { Phrase, Register } from '../types'

interface AIPhrase {
  text: string
  japanese: string
  note: string
  verbId: string
  pattern: string
  register: Register
}

interface AIResponse {
  message: string
  phrases: AIPhrase[]
}

let idCounter = 100

export function aiPhraseToPhrase(p: AIPhrase): Phrase {
  return {
    id: `mock_${++idCounter}`,
    text: p.text,
    japanese: p.japanese,
    note: p.note,
    verbId: p.verbId,
    pattern: p.pattern,
    register: p.register,
    type: 'sentence',
    easeFactor: 2.5,
    dueDate: new Date().toISOString().slice(0, 10),
    repetitions: 0,
    interval: 0,
  }
}

const RESPONSES: { keywords: string[]; response: AIResponse }[] = [
  {
    keywords: ['確認', 'チェック', '確かめ'],
    response: {
      message: `「確認する」は場面によって使い分けます。\n\n**Informal（会話・Slack）**\n→ "I'll double-check that." / "Can you check this?"\n\n**Formal（メール・ドキュメント）**\n→ "I'll verify that." / "Please confirm at your earliest convenience."`,
      phrases: [
        { text: "I'll double-check that.", japanese: '念のため確認しておきます。', note: 'double-check = 念のためもう一度確認する。会話・Slackで自然。verify より口語的。', verbId: 'check', pattern: '[VN]', register: 'informal' },
        { text: "I'll verify that.", japanese: '確認いたします。（フォーマル）', note: 'verify = 正式に確認・検証する。メールやドキュメントで使う。', verbId: 'verify', pattern: '[VN]', register: 'formal' },
      ],
    },
  },
  {
    keywords: ['提案', 'おすすめ', 'すすめ'],
    response: {
      message: `「提案する」「おすすめする」の英語表現です。\n\n**Informal**\n→ "Why don't we...?" / "How about...?"\n\n**Formal**\n→ "I'd suggest..." / "I'd recommend..."\n\n"suggest" の後は動名詞（doing）が来ることに注意。`,
      phrases: [
        { text: "I'd suggest starting with a small prototype.", japanese: '小さなプロトタイプから始めることをおすすめします。', note: 'suggest + doing（動名詞）。suggest to do は誤り。', verbId: 'suggest', pattern: '[V that]', register: 'formal' },
        { text: "Why don't we try a different approach?", japanese: '別のアプローチを試してみませんか？', note: 'Why don\'t we...? = 一緒に〜しませんか？ カジュアルな提案。', verbId: 'try', pattern: '[VN]', register: 'informal' },
      ],
    },
  },
  {
    keywords: ['難し', 'きつい', '苦手'],
    response: {
      message: `「難しい」「苦手」を伝える表現です。\n\n**[VN-ADJ]パターン（find it + 形容詞）** を使うと自然です。\n\n→ "I find it hard to..." — 一般的に難しいと感じる\n→ "I struggle with..." — 苦手・苦労している`,
      phrases: [
        { text: 'I find it hard to keep up in fast-paced meetings.', japanese: 'ペースの速い会議についていくのが難しいです。', note: 'find it + adj + to do = [VN-ADJ]パターン。keep up with = ついていく。', verbId: 'find', pattern: '[VN-ADJ]', register: 'informal' },
        { text: 'I struggle with technical explanations in English.', japanese: '英語での技術説明が苦手です。', note: 'struggle with = 〜に苦労する、苦手とする。', verbId: 'struggle', pattern: '[V]', register: 'informal' },
      ],
    },
  },
  {
    keywords: ['ありがとう', '感謝', 'thanks', 'thank'],
    response: {
      message: `「ありがとう」の表現、場面別にまとめます。\n\n**Informal**\n→ "Thanks!" / "Cheers!" (オーストラリアでよく使う)\n\n**Formal**\n→ "I appreciate your help."`,
      phrases: [
        { text: 'Cheers!', japanese: 'ありがとう！（オーストラリア口語）', note: 'オーストラリア英語でカジュアルな感謝。乾杯の意味もある。', verbId: 'cheer', pattern: '[V]', register: 'informal' },
        { text: 'I really appreciate your help.', japanese: 'ご協力に心から感謝します。', note: 'appreciate = 感謝する。メールやフォーマルな場面で自然。', verbId: 'appreciate', pattern: '[VN]', register: 'formal' },
      ],
    },
  },
]

const DEFAULT_RESPONSE: AIResponse = {
  message: `なるほど、その表現についてですね。\n\n具体的に「〜と言いたい」という日本語を教えてもらえると、より的確な例文を出せます！`,
  phrases: [],
}

export function getMockResponse(input: string): AIResponse {
  const lower = input.toLowerCase()
  const match = RESPONSES.find(r => r.keywords.some(k => lower.includes(k) || input.includes(k)))
  return match?.response ?? DEFAULT_RESPONSE
}
