# AELS v3 設計ドキュメント

このドキュメントは 2026-07-25 の設計議論をまとめたもの。
次のスレッドでの実装の出発点として使う。

---

## なぜ改修するか

- Telegram bot (v2) をあまり使えていない
- 原因: フレーズは100件溜まっているが、気軽に見返す手段がない
- 解決策: Web UI（一覧・Chat）を追加する

---

## 学習モデル（根幹の設計思想）

英語学習を2つのモードに分ける：

### アウトプット学習
「これ英語でなんていうんだっけ？」を Chat で聞いて保存。
例: 「確認しておきます、って英語でなんていう？」→ フレーズ保存

### インプット学習
動詞を中心に体系的に学ぶ。
例: `hear` は [VN] / [VN inf] / [VN ing] を取れる → 各パターンに例文

**動詞が英語の核**という設計思想。verb ノードを中心に phrase・pattern・関連動詞が繋がる。

---

## 画面構成（プロトタイプで確認済み）

`prototype/ui/` に Vite + React + TypeScript のプロトタイプあり。
`npm run dev` で起動。← → キーでバリアント切り替え。

| Variant | 名称 | 内容 |
|---|---|---|
| A | Verb Map | 動詞サイドバー + パターン・フレーズ・関連動詞の詳細 |
| B | Library | フレーズ一覧（動詞・パターン・レジスター・Due でフィルタ） |
| C | Daily Focus | フラッシュカード + ストリーク |
| D | Chat | 質問→回答→フレーズ選択保存 |

---

## データモデル

### フレーズの属性

```typescript
interface Phrase {
  phrase_id: string
  user_id: string
  text: string           // 英語フレーズ
  japanese: string       // 日本語訳
  note: string           // 使い方・ニュアンスメモ
  verb_id: string        // 紐づく動詞
  pattern: string        // OALD記法（後述）
  register: 'formal' | 'informal'
  created_at: string
  memo?: string          // 個人メモ
  // SM-2
  ease_factor: number
  interval: number
  repetitions: number
  due_date: string
}
```

### 動詞の属性

```typescript
interface Verb {
  verb_id: string        // 例: "hear"
  user_id: string
  base: string           // 原形
  patterns: VerbPattern[] // OALD記法ベース（後述）
  confusable_with: string[] // 混同しやすい動詞
  similar_to: string[]     // 類似表現
  noun_form?: string
  adj_form?: string
  created_at: string
}

interface VerbPattern {
  code: string           // "[VN]", "[VN inf]" など
  description: string    // "他動詞（目的語を取る）"
  examples: string[]     // 例文
}
```

### 文型パターン記法（Oxford Advanced Learner's Dictionary 準拠）

GPT-4oが動詞パターンを生成する際はOALDの記法に従う。

| OALD記法 | 意味 | 例 |
|---|---|---|
| [V] | 自動詞 | "The baby cried." |
| [VN] | 他動詞（V + 名詞） | "I heard a noise." |
| [V-ADJ] | 連結動詞 + 形容詞 | "She became famous." |
| [VNN] | 授与動詞（V + N + N） | "She gave me a book." |
| [VN-ADJ] | 複合他動詞（V + N + 形容詞） | "I found it interesting." |
| [VN inf] | V + N + 不定詞 | "I heard him sing." |
| [VN ing] | V + N + -ing形 | "I heard him singing." |
| [V that] | V + that節 | "I think that..." |
| [V wh] | V + wh節 | "I wonder what..." |
| [VN that] | V + N + that節 | "I told him that..." |

**`hear` の例：**
```
hear
  [VN]     "I heard a noise."            → 音・声を聞く
  [VN inf] "I heard him sing."           → 知覚動詞 + 原形不定詞
  [VN ing] "I heard him singing."        → 知覚動詞 + -ing（進行中の動作）
```

**ユーザーの旧記法との対応（参考）：**
| 旧記法 | OALD記法 |
|---|---|
| V1（自動詞） | [V] |
| V3（他動詞） | [VN] |
| V5（複合他動詞） | [VN-ADJ] / [VN inf] / [VN ing] |

---

## 保存フロー

### フレーズ保存（Chat 経由）
1. Chat で質問
2. AI が回答 + フレーズ候補を提示
3. チェックボックスで選択 → 「○件を保存」
4. Library に即時反映

### 動詞登録（Verb 登録フロー）
1. 動詞名を入力（例: "hear"）
2. GPT-4o が OALD 記法ベースでパターン・例文・関連語を自動生成（叩き台）
3. ユーザーがノートの例文と照らし合わせて確認・編集
4. 保存 → Verb Map に反映

### 添削保存（Chat 経由）
1. 「この英語あってる？」+ 英文を貼る
2. AI が添削 + 正しいバージョンを提案
3. チェックして保存

---

## フレーズの register（レジスター）

英語の formality は「相手の年齢・立場」ではなく「場面」で決まる。

| register | 用途 |
|---|---|
| formal | ビジネスメール・公式な場・プレゼン |
| informal | 会話・Slack・日常的なやり取り |

「年上の人に使う」場合も、場面がカジュアルなら informal で OK。

---

## アーキテクチャ方針

### DB: DynamoDB に一本化（CosmosDB Gremlin は廃止予定）

**理由：**
- verb 間の関係（confusable_with など）は配列属性で持てば十分
- 1〜2ホップの固定クエリしか出てこない
- 単一クラウド（AWS）で Terraform がシンプルになる

**Gremlin が必要になる条件（将来）：**
- 複数ユーザーで横断的なパターン分析
- 動詞ネットワークを動的にN ホップたどりたい場合

現時点では DynamoDB + GSI で全要件を満たせる。

### DynamoDB テーブル設計（案）

**phrases テーブル**
```
PK: user_id
SK: phrase_id
GSI1: (user_id, due_date)    → Due today フィルタ
GSI2: (user_id, verb_id)     → 動詞別フィルタ
GSI3: (user_id, pattern)     → パターン別フィルタ
```

**verbs テーブル**
```
PK: user_id
SK: verb_id
```

**sessions テーブル（既存）**
```
変更なし
```

---

## 実装順（決定済み）

| # | 内容 | 状態 | コミット |
|---|---|---|---|
| 1 | DynamoDB スキーマ + Terraform（phrases/verbs テーブル + IAM） | ✅ 完了 | `5f2ca3b` |
| 2 | 読み取り API（GET /phrases, GET /verbs, GET /verbs/{verb_id}） | ✅ 完了 | `ccfc58b` |
| 3 | S3 + CloudFront Terraform + Web UI 本実装 | ✅ 完了 | `024dfac`, `306bfcf` |
| 4 | Verb 登録 API + UI | 🔲 次にやる | — |
| 5 | Chat 書き込み API（フレーズ保存エンドポイント） | 🔲 未着手 | — |
| 6 | CosmosDB → DynamoDB 移行スクリプト | 🔲 後回し | — |

---

---

## Step 4 設計メモ（次にやること）

### Verb 登録 API

**エンドポイント**
- `POST /verbs` — 動詞を登録（GPT-4o でパターン自動生成）
- `PUT /verbs/{verb_id}` — 動詞を編集（ユーザーが確認・修正後に保存）

**POST /verbs のリクエスト**
```json
{ "base": "hear" }
```

**POST /verbs のレスポンス（GPT-4o が叩き台を返す）**
```json
{
  "verb_id": "hear",
  "base": "hear",
  "patterns": [
    { "code": "[VN]",     "description": "他動詞（音・声を聞く）", "examples": ["I heard a noise."] },
    { "code": "[VN inf]", "description": "知覚動詞 + 原形不定詞",  "examples": ["I heard him sing."] },
    { "code": "[VN ing]", "description": "知覚動詞 + -ing形",      "examples": ["I heard him singing."] }
  ],
  "confusable_with": ["listen"],
  "similar_to": ["catch", "pick up"],
  "noun_form": "hearing"
}
```

**Lambda の処理**
1. GPT-4o に動詞パターン生成を依頼（`src/tools/verb_tool.py` を新規作成）
2. DynamoDB の `aels-verbs` テーブルに書き込む（`src/db/verbs.py` に `put_verb` を追加）
3. レスポンスを返す（ユーザーが UI で確認・編集して PUT で確定）

**認証**: 既存の `x-api-key` ヘッダー（`WEB_API_KEY` env var）を使う

### Verb 登録 UI（VariantA の拡張）

VariantA の動詞サイドバーに「+ Add verb」ボタンを追加。
クリックすると動詞名入力フォームが出て、POST /verbs を叩き、
返ってきた叩き台を編集して PUT /verbs/{verb_id} で保存する。

**実装ファイル**
- `src/api.ts` に `createVerb(base: string)` と `updateVerb(verb: Verb)` を追加
- `web/src/variants/VariantA.tsx` に動詞追加フォームを追加
- `src/main.py` にルーティング追加（POST /verbs, PUT /verbs/{verb_id}）
- `src/tools/verb_tool.py` を新規作成（GPT-4o 呼び出し）
- `infrastructure/terraform/modules/aws/api_gateway.tf` にルート追加

---

## 保留・後回し

- CosmosDB Gremlin → DynamoDB 移行（既存100フレーズ）
- ストリーク機能
- Telegram Mini App 埋め込み
- domain プロパティ（読書語彙の分離）
- セッション履歴の自動トリミング

---

## プロトタイプの場所

```
prototype/ui/         # Vite + React + TypeScript
  src/
    data/mockData.ts  # モックデータ（Phrase・Verb の型定義あり）
    data/mockAI.ts    # モック AI レスポンス
    variants/
      VariantA.tsx    # Verb Map
      VariantB.tsx    # Library（phrases props で受け取る）
      VariantC.tsx    # Daily Focus
      VariantD.tsx    # Chat（チェックボックス選択保存）
    components/
      PrototypeSwitcher.tsx
    App.tsx           # 共有 state（extraPhrases）あり
```
