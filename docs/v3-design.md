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
| 4 | Verb 登録 API + UI | ✅ 完了 | — |
| 5 | Chat 書き込み API（POST /phrases・POST /chat）+ VariantD 実 API 接続 | ✅ 完了 | — |
| 6 | Chat スレッド管理（履歴保持・スレッド切り替え） | 🔲 次にやる | — |
| 7 | CosmosDB → DynamoDB 移行スクリプト | 🔲 後回し | — |

---

---

## Step 4 完了記録

### 実装済みファイル

| ファイル | 内容 |
|---|---|
| `src/tools/verb_tool.py` | GPT-4o で V1〜V5 パターンを自動生成（新規） |
| `src/db/verbs.py` | `put_verb()` / `delete_verb()` 追加 |
| `src/main.py` | `POST /verbs`・`PUT /verbs/{verb_id}`・`DELETE /verbs/{verb_id}` ハンドラ追加 |
| `web/src/api.ts` | `createVerb()` / `updateVerb()` / `deleteVerb()` 追加 |
| `web/src/types.ts` | `VerbPattern.memo?: string` 追加 |
| `web/src/App.tsx` | `handleVerbUpdated` / `handleVerbDeleted` 追加 |
| `web/src/variants/VariantA.tsx` | 動詞追加フォーム・Edit モード（例文編集・メモ欄・パターン追加・動詞削除） |
| `infrastructure/terraform/modules/aws/api_gateway.tf` | POST/PUT/DELETE ルート追加・CORS 設定追加 |
| `infrastructure/scripts/deploy.sh` | `WEB_API_KEY`・`WEB_USER_ID` を ENV_VARS に追加 |
| `web/.env` | `VITE_API_BASE_URL`・`VITE_API_KEY` を設定（gitignore 対象） |
| `tests/unit/test_verb_tool.py` | 5件 |
| `tests/unit/test_verbs_db.py` | 5件 |
| `tests/unit/test_web_verb_handlers.py` | 10件 |

### 設計変更：パターン記法を V1〜V5 に変更

当初 OALD 記法（`[VN]` `[VN inf]` 等）を予定していたが、日本の5文型（V1〜V5）に変更。

| 記法 | 構造 | 例 |
|---|---|---|
| V1 | S+V（自動詞） | "The sun rises." |
| V2 | S+V+C（連結動詞） | "She became famous." |
| V3 | S+V+O（他動詞・that節・wh節をまとめる） | "I heard a noise." |
| V4 | S+V+O+O（授与動詞） | "She gave me a book." |
| V5 | S+V+O+C（複合他動詞） | "I heard him sing." |

### インフラ作業（このセッションで実施）

Terraform state に登録されていなかったリソースを `terraform apply` で一括作成：
- `aels-phrases` / `aels-verbs` DynamoDB テーブル
- API Gateway 全ルート（GET/POST/PUT）
- S3 + CloudFront（Web UI ホスティング）
- IAM ポリシー（Lambda → DynamoDB アクセス権）
- CORS 設定（ブラウザからの `fetch` を許可）

---

## Step 4 設計メモ（参考・実装済み）

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

## Step 5 設計メモ（次にやること）

### Chat 書き込み API

**エンドポイント**
- `POST /phrases` — フレーズを DynamoDB に保存

**POST /phrases のリクエスト**
```json
{
  "text": "I'll look into it.",
  "japanese": "確認しておきます",
  "note": "ビジネスメールでよく使う",
  "verb_id": "look",
  "pattern": "V3",
  "register": "formal"
}
```

**POST /phrases のレスポンス**
```json
{
  "phrase_id": "uuid-...",
  "user_id": "8438407995",
  "text": "I'll look into it.",
  "japanese": "確認しておきます",
  "note": "ビジネスメールでよく使う",
  "verb_id": "look",
  "pattern": "V3",
  "register": "formal",
  "ease_factor": 2.5,
  "interval": 0,
  "repetitions": 0,
  "due_date": "2026-07-25",
  "created_at": "2026-07-25T..."
}
```

**Lambda の処理**
1. `src/db/phrases.py` に `put_phrase()` を追加
2. `src/main.py` に `_handle_post_phrase` を追加
3. SM-2 初期値（ease_factor=2.5, interval=0, repetitions=0, due_date=今日）を設定

**認証**: 既存の `x-api-key` ヘッダーを使う

### VariantD（Chat UI）への統合

VariantD の「チェックして保存」フローを実際の API に接続する。
現在はモック (`mockAI.ts`) を使っているため、`POST /phrases` に差し替える。

**実装ファイル**
- `src/db/phrases.py` に `put_phrase()` 追加
- `src/main.py` に `POST /phrases` ルーティング追加
- `web/src/api.ts` に `savePhrase(phrase)` 追加
- `web/src/variants/VariantD.tsx` の保存処理を実 API に差し替え
- `infrastructure/terraform/modules/aws/api_gateway.tf` に `POST /phrases` ルート追加

---

## Step 6 ✅（実装済み）

### Chat スレッド管理

- `aels-chat-threads` DynamoDB テーブル（PK: user_id / SK: thread_id）
- `POST /threads` / `GET /threads` / `GET /threads/{thread_id}` エンドポイント
- `POST /chat` が `thread_id` を受け取り、会話履歴を DynamoDB から取得して LLM に渡す
- VariantD にスレッドリストドロップダウン・「+ 新規」ボタン・10ターンバナー
- `localStorage` でページリロード後も最後のスレッドを復元

---

## フレーズ拡張・VariantB 改善 ✅（実装済み）

### type フィールド追加

フレーズに `type` を追加し、動詞文型以外の表現も管理できるようにした。

| type | 説明 | 例 |
|---|---|---|
| `sentence` | V1-V5 文型フレーズ | "I haven't had it in ages." |
| `phrasal_verb` | 句動詞 | come across, get to work |
| `idiom` | イディオム | have to do with, be worth doing |
| `fixed_phrase` | 固定表現・前置詞句 | in need of, on occasion |

### examples フィールド追加

`examples: string[]` でフレーズに例文を紐付けられるようにした。

### Quick Add パネル（VariantB）

- `POST /analyze` エンドポイント（`src/tools/analyze_tool.py`）
- フレーズを貼り付けると AI が japanese / type / verb_id / note / example を補完
- VariantB ヘッダーの「+ Quick Add」から即保存できる

### インライン編集（VariantB）

- `PUT /phrases/{phrase_id}` エンドポイント
- フレーズをタップして展開 → 「編集」ボタン → 全フィールドをインライン編集・保存

### DynamoDB 空文字 GSI キー問題の修正

`verb_id` / `pattern` が空文字の場合は DynamoDB に保存しない（GSI キー属性に空文字不可）。

---

## UI 改善 ✅（実装済み）

### VariantC（フラッシュカード）

- カード表面のヒント（V3・動詞名タグ）を非表示
- カードをタップすると表↔裏を行き来できるように（一方通行を解消）
- カードサイズ縮小（maxWidth 480→400 / minHeight 240→180 / フォントサイズ縮小）

### VariantA（Verb Map）サイドバー

- ✕ ボタンでサイドバーを閉じられる
- 閉じた状態で「☰ [動詞名]」ボタンを押すと再表示
- スマホで動詞を選択すると自動的に閉じる

### NavBar 最小化

- 右端の薄い「✕」でナビゲーションバーを折りたたむ → 「⋯」ドットのみ表示
- ドットをタップすると再展開

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
