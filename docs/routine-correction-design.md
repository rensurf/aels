# ルーティンロック + 音声添削 設計ドキュメント

作成: 2026-08-29

---

## 概要

| 機能 | 内容 |
|---|---|
| **Feature 1: 音声添削 (VariantG)** | 自由スピーチ → Whisper 文字起こし → GPT-4o 添削 → SM-2 で定着 |
| **Feature 2: ルーティンロック** | 毎日の学習ステップを順番に完了しないと次に進めない |

実装順: Feature 2 → Feature 1（ルーティンの枠組みを先に作ることで Feature 1 の「完了条件」が自然に決まる）

---

## Feature 2: ルーティンロック

### 毎日のルーティン（固定・4ステップ）

```
① Verb    — VariantA で動詞を確認し「完了」ボタンを押す
② Phrase  — VariantC で due のフレーズカードを全部消化する
③ Review  — VariantG で due の添削アイテムを全部消化する（初日は空なので即完了）
④ Writing — VariantG で当日のスピーチを1件録音・保存する
```

### ロックのルール

| Variant | ステップ | ロック条件 |
|---|---|---|
| A (Verb Map) | ① Verb | 常時アクセス可 |
| C (Daily Focus) | ② Phrase | ① 未完了ならロック |
| G (Writing) | ③④ Review + Writing | ② 未完了ならロック |
| B / D / E / F | なし | 常時アクセス可（補助機能） |

### 完了条件の定義

| ステップ | 完了トリガー |
|---|---|
| ① Verb | VariantA 内の「今日の Verb 完了 ✓」ボタンを押す |
| ② Phrase | VariantC の due キューが空になる（最後のカードを review したとき） |
| ③ Review | VariantG の due 添削キューが空になる（最後のアイテムを review したとき） |
| ④ Writing | VariantG でスピーチを1件保存する |

### データモデル

`aels-user-stats` テーブルに以下フィールドを追加（新テーブル不要）:

```python
{
  "user_id": "...",
  # 既存フィールド (streak, best_streak, completed_dates, last_completed_date)
  # 追加フィールド
  "routine_date": "2026-08-29",         # 今日の日付
  "routine_completed": {"verb", "phrase"}  # 完了したステップ名の StringSet
}
```

`routine_date` が今日でなければ、ルーティン進捗をリセットして扱う（DynamoDB の更新はしない、クライアント側で判定）。

### API

```
POST /routine/complete   { "step": "verb" | "phrase" | "review" | "writing" }
GET  /routine            → { "date": "2026-08-29", "completed": ["verb", "phrase"] }
```

### NavBar の変更

Props に `completedSteps: string[]` を追加。ロック対象の Variant をクリックしたとき:
- 画面遷移はしない
- 「① Verb を完了してください」のようなメッセージをトースト表示

```tsx
const ROUTINE_LOCK: Record<string, { requires: string; label: string }> = {
  C: { requires: 'verb',   label: 'Verb を完了してください' },
  G: { requires: 'phrase', label: 'Phrase を完了してください' },
}
```

「今日スキップ」ボタン（NavBar 内）を押すと全ステップを完了扱いにする。スキップした日はカレンダーに色違いで記録（将来対応）。

---

## Feature 1: 音声添削 (VariantG)

### フロー

```
① 録音（MediaRecorder）
② Lambda に音声 blob を送信 → Whisper で文字起こし
③ 文字起こし結果を表示（ユーザーが編集可能）
④ 「添削する」ボタン → GPT-4o が不自然な箇所を検出
⑤ 添削結果（original / corrected / note のセット）を保存
⑥ 翌日以降 SM-2 で復習キューに入る
```

### DynamoDB テーブル: `aels-corrections`

```
PK: user_id
SK: correction_id (uuid)
GSI1: user_id-due_date-index    → SM-2 復習キュー
GSI2: user_id-submitted_at-index → ログビュー（日付順）
```

フィールド:

```python
{
  "user_id": str,
  "correction_id": str,           # uuid
  "original": str,                # 自分が言った英語（Whisper 文字起こし後、編集済み）
  "corrected": str,               # 自然な英語（GPT-4o が提案）
  "note": str,                    # なぜそちらが自然か（GPT-4o の説明）
  "submitted_at": str,            # ISO datetime
  # SM-2
  "ease_factor": Decimal,         # 初期 2.5
  "interval": int,                # 初期 0
  "repetitions": int,             # 初期 0
  "due_date": str,                # 翌日から
}
```

### API

```
POST /speech/analyze     音声 → 文字起こし + 添削候補を返す（保存はしない）
POST /corrections        添削アイテムを保存（1件ずつ or まとめて）
GET  /corrections        全件取得（ログビュー用）
GET  /corrections?due_before=YYYY-MM-DD  SM-2 復習キュー用
POST /corrections/{id}/review  { "quality": 1 | 4 }  SM-2 更新
DELETE /corrections/{id}
```

### バックエンド: `src/tools/speech_correction_tool.py`（新規）

```python
# Step 1: Whisper 文字起こし
transcript = openai.audio.transcriptions.create(
    model="whisper-1",
    file=audio_file,
    language="en",
)

# Step 2: GPT-4o 添削
corrections = gpt4o_correct(transcript.text)
# → [{ "original": "...", "corrected": "...", "note": "..." }, ...]
```

GPT-4o プロンプト方針:
- 文法エラーより「日本語直訳っぽい表現」「ネイティブが選ばない言い回し」を優先して指摘
- 1回の発話から correction アイテムを 0〜5件程度抽出
- 問題なければ空リストを返す（褒めるだけ）

### VariantG UI（2タブ）

**Tab 1: Submit（毎日の提出 → ルーティン④）**

```
[録音ボタン] → 録音中... → 停止
↓
[文字起こし結果]（テキストエリアで編集可能）
↓
[添削する] → スピナー
↓
添削結果リスト:
  - "I want to go" → "I'd like to go" （ビジネスでは want より would like が自然）
  - "Can you tell me..." → "Could you tell me..." （より丁重）
  ☑ ☑（チェックして保存）
↓
[保存する] → ルーティン④ 完了
```

**Tab 2: Log（過去の提出を振り返る）**

```
2026-08-29
  "I want to go to the meeting." → "I'd like to attend the meeting."
  note: want より would like、go to より attend がフォーマル

2026-08-28
  ...
```

日付でグループ化。フィルター不要（シンプルに全件表示）。

**Tab 3: Review（SM-2 復習 → ルーティン③）**

VariantC と同じカード形式:
- 表: 自分が言った英語（original）
- 裏: 自然な英語（corrected）+ note
- 「✓ 覚えた」「✗ もう一度」ボタン → `POST /corrections/{id}/review`

due が 0件のときは「今日の復習は完了です」を表示 → ルーティン③ 自動完了。

### TypeScript 型

```typescript
export interface Correction {
  id: string           // correction_id
  original: string
  corrected: string
  note: string
  submittedAt: string
  easeFactor: number
  interval: number
  repetitions: number
  dueDate: string
}
```

---

## 実装ステップ

### Step A: ルーティンロック（Feature 2）

| # | 内容 | ファイル |
|---|---|---|
| A-1 | `GET /routine` / `POST /routine/complete` ハンドラ | `src/main.py` |
| A-2 | `aels-user-stats` に routine フィールド追加（DB 変更なし・コードのみ） | `src/db/stats.py` |
| A-3 | NavBar に `completedSteps` props + ロック表示 + トースト | `web/src/components/NavBar.tsx` |
| A-4 | App.tsx でルーティン状態を管理・各 Variant に完了コールバックを渡す | `web/src/App.tsx` |
| A-5 | VariantA に「Verb 完了 ✓」ボタン追加 | `web/src/variants/VariantA.tsx` |
| A-6 | VariantC の due=0 で phrase ステップ自動完了 | `web/src/variants/VariantC.tsx` |
| A-7 | Terraform: API Gateway に `/routine` ルート追加 | `infrastructure/terraform/modules/aws/api_gateway.tf` |

### Step B: 音声添削 (Feature 1)

| # | 内容 | ファイル |
|---|---|---|
| B-1 | `aels-corrections` テーブル Terraform | `infrastructure/terraform/modules/aws/dynamodb.tf` |
| B-2 | `src/db/corrections.py` 新規作成（CRUD + SM-2） | 新規 |
| B-3 | `src/tools/speech_correction_tool.py` 新規作成 | 新規 |
| B-4 | API ハンドラ（POST /speech/analyze, CRUD /corrections） | `src/main.py` |
| B-5 | Terraform: API Gateway ルート追加 + IAM ポリシー更新 | Terraform |
| B-6 | `web/src/types.ts` に `Correction` 型追加 | `web/src/types.ts` |
| B-7 | `web/src/api.ts` に corrections API 関数追加 | `web/src/api.ts` |
| B-8 | `web/src/variants/VariantG.tsx` 新規作成（3タブ） | 新規 |
| B-9 | NavBar に VariantG を追加 | `web/src/components/NavBar.tsx` |
| B-10 | App.tsx に VariantG 組み込み + review 完了コールバック | `web/src/App.tsx` |

---

## 保留・後回し

- スキップした日のカレンダー表示（色違い）
- 曜日別ルーティン
- 音声の長さ上限・エラーハンドリング（ファイルサイズ制限）
- corrections のキーワード検索
