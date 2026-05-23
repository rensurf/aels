# Lessons Learned

実装中に詰まって・仮説を立てて・解決した経験を記録する。
面接の「苦労したこと」「技術的に難しかったこと」の素材にする。

フォーマット：
- **何を詰まったか**：症状・エラーメッセージ
- **自分の仮説**：最初に何が原因だと思ったか
- **実際の原因**：何が問題だったか
- **解決策**：どう直したか
- **学び**：次に同じ状況になったときに何を見るか

---

<!-- 記録はここから下に追記していく -->

---

## #056 モジュールレベルの boto3 インスタンス化が CI で `NoRegionError` を起こす

**日付**: 2026-05-21
**フェーズ**: CI 修正

**症状**
```
ERROR collecting tests/unit/test_phrase_keyboard.py
botocore.exceptions.NoRegionError: You must specify a region.
```

**自分の最初の仮説**
新しく追加したコードが boto3 を呼んでいる？

**実際の原因**
`quiz/flow.py` がモジュールレベルで `SessionClient(...)` を初期化しており、
その中で `boto3.resource("dynamodb")` がリージョンなしで呼ばれていた。

```python
# quiz/flow.py — モジュールレベルで実行される
_session = SessionClient(table_name=DYNAMODB_SESSION_TABLE)
```

`test_phrase_keyboard.py` が `from src.main import _phrase_keyboard_dict` すると、
`main.py` → `quiz/flow.py` → `SessionClient` → `boto3.resource("dynamodb")` と連鎖し、
CI 環境（`AWS_DEFAULT_REGION` 未設定）でエラーになる。

Lambda 本番では実行環境にリージョンが自動設定されるので気づかない。

**解決策**
`tests/conftest.py` に `AWS_DEFAULT_REGION` を追加。

```python
os.environ.setdefault("AWS_DEFAULT_REGION", "ap-southeast-2")
```

**学び**
- モジュールレベルで AWS クライアントを作ると、インポートしただけで boto3 が走る
- `conftest.py` に fake 環境変数を追加するときは `AWS_DEFAULT_REGION` も忘れずに設定する
- Lambda 本番でしか再現しないバグは CI で検出しにくい。fake 値でいいので CI にも本番と同じ環境変数を揃えておく

---

## #055 Lambda 間でコードを共有しない設計判断

**日付**: 2026-05-21
**フェーズ**: フレーズ個別選択 UI の実装

**状況**
フレーズ選択キーボードを生成する関数を実装するとき、Lambda A（main.py・受信）と Lambda B（worker.py・LLM 処理）の両方から使う必要があった。

**最初に考えたアプローチ**
`_build_phrase_keyboard` を worker.py に定義して、main.py からインポートする。

```python
# main.py
from src.worker import _build_phrase_keyboard
```

**問題**
`src.worker` をインポートすると、モジュールトップレベルの以下が実行される：

```python
from src.agent.teacher_agent import handle_message  # LLM クライアント初期化
session_client = SessionClient(...)
```

Lambda A のコールドスタート時に LLM クライアントが初期化され、不要な遅延と依存が発生する。Lambda A は受信専用で LLM を使わないのに、LLM のセットアップコストを払うことになる。

**解決策**
同じロジックを、返り値の型だけ変えて両ファイルに別々に定義した：

```python
# worker.py — python-telegram-bot の Bot オブジェクト経由で使う
def _build_phrase_keyboard(phrases: list[dict]) -> InlineKeyboardMarkup:
    ...

# main.py — requests で直接 Telegram API を叩く
def _phrase_keyboard_dict(phrases: list[dict]) -> dict:
    ...
```

**学び**
- Lambda を複数に分割したアーキテクチャでは、「共通化のためのインポート」が思わぬコストを生む。モジュールのトップレベルコードは import 時点で実行されるため、不要な初期化を引き込む。
- 10行程度の純粋な UI 生成ロジックなら、重い依存を避けるために二重実装を選ぶのが合理的。DRY より依存の切り離しを優先する場面がある。
- 共通化するなら、重い依存を持たない独立モジュール（例：`src/adapters/keyboards.py`）に切り出すのが正しい方向。

---

## #054 DynamoDB の `if_not_exists` でアトミックインクリメント

**日付**: 2026-05-21
**フェーズ**: セッション管理（ターンカウント）の実装

**状況**
会話ターン数をカウントするために `turn_count` フィールドを DynamoDB に追加した。初回は 0 から、以降は +1 ずつ増やす必要がある。

**最初に考えたアプローチ**
```python
# get_item で現在値を取得 → +1 して update_item で書き戻す
count = session_client.get_turn_count(chat_id)
session_client.set_turn_count(chat_id, count + 1)
```

**問題**
2 回の API コールになる。また、取得と書き込みの間に別のリクエストが入ると競合が起きる可能性がある（このシステムでは1ユーザー1会話なので現実的な問題にはならないが、設計として良くない）。

**解決策**
`UPDATE` 式の `if_not_exists` を使い、初期化とインクリメントを 1 回の API コールで完結させる：

```python
def increment_turn_count(self, chat_id: str) -> int:
    response = self.table.update_item(
        Key={"chat_id": chat_id},
        UpdateExpression="SET turn_count = if_not_exists(turn_count, :zero) + :one",
        ExpressionAttributeValues={":zero": 0, ":one": 1},
        ReturnValues="UPDATED_NEW",
    )
    return int(response["Attributes"]["turn_count"])
```

- `if_not_exists(turn_count, :zero)` — フィールドが存在しなければ 0 として扱う
- `+ :one` — その値に 1 を加算
- `ReturnValues="UPDATED_NEW"` — 更新後の値を返す（別途 `get_item` 不要）

**学び**
- DynamoDB の `UpdateExpression` は SQL の `UPDATE` に近いが、`if_not_exists` でフィールドの初期化も同時にできる。
- `ReturnValues="UPDATED_NEW"` を指定すると更新後の値が返ってくるため、インクリメントと値の取得を 1 回の API コールで済ませられる。
- カウンターのように「初回は初期化・以降は加算」というパターンは DynamoDB では頻出。`if_not_exists` を使うのが定石。

---

## #053 Telegram の `editMessageReplyMarkup` と `editMessageText` の使い分け

**日付**: 2026-05-21
**フェーズ**: フレーズ個別選択 UI の実装（チェックボックストグル）

**状況**
フレーズの ☑/☐ をタップするたびにボタンの表示を更新する必要があった。

**最初に考えたアプローチ**
`editMessageText` でメッセージ本文ごと書き換える。

**問題**
メッセージ本文（先生の返答テキスト）を保持しながらボタンだけ変えるには、元のテキストを取り出して再構築する必要がある。`callback["message"]["text"]` から取れるが、本文とフレーズリストの境界を文字列操作で分割することになり、フォーマットの変化に脆い。

**解決策**
Telegram API には **`editMessageReplyMarkup`** というメソッドがある。本文を一切触らず、インラインキーボードだけを差し替えられる：

```python
# トグル時：キーボードだけ更新
requests.post(
    f"https://api.telegram.org/bot{TOKEN}/editMessageReplyMarkup",
    json={
        "chat_id": chat_id,
        "message_id": message_id,
        "reply_markup": _phrase_keyboard_dict(pending),  # 更新後のキーボード
    }
)

# 保存・キャンセル時：本文も変える必要があるので editMessageText
requests.post(
    f"https://api.telegram.org/bot{TOKEN}/editMessageText",
    json={
        "chat_id": chat_id,
        "message_id": message_id,
        "text": prefix + suffix,  # 本文 + 結果メッセージ
    }
)
```

**使い分けの基準**

| 操作 | 使う API |
|---|---|
| ボタンのラベル・状態だけ変えたい | `editMessageReplyMarkup` |
| 本文も変えたい（ボタンは消えてもいい） | `editMessageText` |
| 本文もボタンも両方変えたい | `editMessageText`（`reply_markup` パラメータも渡す）|

**学び**
- Telegram のメッセージ編集 API は目的別に分かれている。ドキュメントを読まないと `editMessageText` しか使わないまま終わりやすい。
- キーボードだけ更新するなら `editMessageReplyMarkup` が正解。本文の再構築が不要になりコードがシンプルになる。
- `editMessageText` でボタンを残したい場合は `reply_markup` パラメータも渡す必要がある（省略するとボタンが消える）。

---

## #051 保存ボタンが出ない：`put_item` が `pending_phrases` を消していた

**日付**: 2026-05-20
**フェーズ**: SQS 非同期化後のデバッグ

**症状**
- Telegram でメッセージを送るとボットは返答する
- フレーズ保存ボタン（✅ 保存する）が表示されない
- CloudWatch ログでは `[debug] translate_japanese: saved 3 phrases` と `[debug] save_phrases called` が出ているのに、直後に `pending_phrases: None`

**自分の仮説**
- エージェントが `save_phrases` を呼んでいないのでは？
- プロンプトの指示が不十分では？

**実際の原因**
`pending_phrases` は保存されていた。消していたのは `save_session` の `put_item` だった。

実行順序：
```
translate_japanese → DynamoDB に pending_phrases を保存
save_phrases       → DynamoDB に pending_phrases を上書き保存
handle_message 終了
save_session(put_item) → アイテム全体を messages + ttl だけで置き換え → pending_phrases が消える
get_pending_phrases → None
```

`put_item` はアイテム全体を丸ごと置き換えるため、同じキーの他フィールドが消える。

**解決策**
`save_session` を `put_item` から `update_item` に変更。`messages` と `ttl` だけを更新し、他のフィールド（`pending_phrases` など）を残す。

```python
# Before
self.table.put_item(Item={"chat_id": chat_id, "messages": messages, "ttl": ...})

# After
self.table.update_item(
    Key={"chat_id": chat_id},
    UpdateExpression="SET messages = :m, #t = :t",
    ExpressionAttributeNames={"#t": "ttl"},
    ExpressionAttributeValues={":m": messages, ":t": ...},
)
```

**学び**
- DynamoDB の `put_item` と `update_item` は別物。`put_item` はアイテム全体を置き換える（他フィールドが消える）。`update_item` は指定したフィールドだけを更新する。
- 同じ DynamoDB アイテムに複数の用途のデータ（セッション・pending_phrases・quiz_state など）を混在させている場合、書き込み操作が `put_item` か `update_item` かを常に意識する。
- ログに「保存した」と出ているのに「取得したら None」という場合は、保存と取得の間に別の書き込みが入っていないか疑う。

---

## #052 OpenAI Responses API：会話履歴はサーバー側に蓄積される

**日付**: 2026-05-21
**フェーズ**: Rate Limit デバッグ中の発見

**症状**
- 会話を重ねると `429 Rate limit reached (TPM)` が頻発
- DynamoDB のセッションアイテムを見ても会話履歴が入っていない

**発見**
Agent Framework は OpenAI Responses API を使っている。DynamoDB に保存されているのは会話履歴ではなく、サーバー側セッションへの参照だけ。

```json
{
  "session_id": "0f962261-...",
  "type": "session",
  "service_session_id": "resp_043e3de8...",
  "state": {}
}
```

`resp_` で始まる `service_session_id` が OpenAI サーバー上の会話コンテキストを指している。毎回のリクエストでこの ID を渡すと、OpenAI がサーバー側で会話履歴を再構築し、その全トークンが TPM カウントに含まれる。

**挙動のまとめ**
- DynamoDB は軽い（セッション ID のみ）
- 会話が長くなるほど OpenAI 側のコンテキストが大きくなり、TPM を多く消費する
- こちら側でトークン数を制御する手段がない（OpenAI 側に蓄積されているため）

**解消策**
DynamoDB のセッションアイテムを削除すると会話がリセットされ、トークン数が 0 から再スタートする。

```bash
aws dynamodb delete-item \
  --table-name aels-sessions \
  --key '{"chat_id": {"S": "<chat_id>"}}' \
  --region ap-southeast-2
```

**学び**
- Agent Framework のセッション管理は「ローカルに全履歴を保持する」方式ではない
- 「DynamoDB に履歴がない = 全履歴を毎回送っている」という思い込みは間違い
- 長期運用するなら、一定の会話数でセッションをリセットする仕組みが必要

---

## #050 SQS 非同期化：Lambda A（受信）+ Lambda B（処理）への分割

**日付**: 2026-05-20
**フェーズ**: タイムアウト問題の根本解決

**背景**
Telegram webhook の 30 秒制約に対し、LLM を 3〜4 回呼ぶフローがタイムアウトを頻発させていた。

**設計判断**
Lambda を 2 つに分ける Fire-and-forget アーキテクチャを採用した。

```
Lambda A（受信役）: Telegram → 「考えています...」送信 → SQS にキュー → 即 200 返す
Lambda B（処理役）: SQS → handle_message → editMessageText で返答に差し替え
```

**実装上のポイント**
- `thinking_message_id` を SQS ペイロードに含めることで、Lambda B から `editMessageText` が使える（Lambda B は元のメッセージを直接参照できないが、ID があれば上書き可能）
- `quiz_state` は DynamoDB から取得したとき Decimal 型を含むため、SQS への JSON シリアライズに `DecimalEncoder` が必要
- Lambda A の timeout は 29 秒 → 10 秒に短縮できる（SQS 送信だけなので）

**学び**
- Webhook ベースのチャットボットで LLM を複数回呼ぶ場合、非同期化（SQS + 別 Lambda）は必須の設計パターン
- `考えています...` の message_id を保持しておけば、処理完了後に `editMessageText` で自然なUXを維持できる
- DynamoDB から読んだデータをそのまま JSON に渡すと Decimal エラーになる。`put_item` / `update_item` で `_to_decimal` しているのに、読み出し時は Python の Decimal のまま返ってくることを忘れない

---

## #049 gpt-4o-mini への部分切り替えでコスト削減

**日付**: 2026-05-20
**フェーズ**: コスト最適化

**背景**
OpenAI のクレジット切れをきっかけに、全処理が `gpt-4o` を使っていることを見直した。

**判断**
会話・翻訳・クイズ採点は `gpt-4o` を維持。`_classify_pattern`（フレーズのカテゴリ分類）だけ `gpt-4o-mini` に切り替えた。

理由：
- 分類タスクは「preposition / phrasal_verb / collocation ...」の9択に分類するだけで、判断に深いコンテキスト理解は不要
- 単価が約 1/17（$2.50 → $0.15 per 1M input tokens）
- フレーズ保存のたびに呼ばれる処理なので積み重なる

**変更箇所**
[src/tools/memory_tool.py](../src/tools/memory_tool.py) の `_classify_pattern` 内

```python
# Before
model="gpt-4o"
# After
model="gpt-4o-mini"
```

**学び**
- コスト削減は「モデル全切り替え」ではなく「処理の性質に応じた使い分け」が正解
- 単純な分類・構造化タスクは mini で十分。会話・評価・翻訳の品質は落とさない

---

## #048 タイムアウト時に「考えています...」が残り続ける問題

**日付**: 2026-05-20
**フェーズ**: UX 改善

**症状**
Lambda がタイムアウト（29 秒）または例外で終了すると、「考えています...」メッセージが永遠に残る。

**原因（2つ）**

① **例外時**: `except` ブロックで `send_message`（新規メッセージ）を送っており、「考えています...」は上書きされずに残る。

② **タイムアウト時**: Lambda が強制終了するため `except` ブロック自体が実行されない。後処理のチャンスがゼロ。

**解決策**
`asyncio.wait_for` で内部タイムアウトを 24 秒に設定。Lambda の強制終了（29 秒）より 5 秒早く処理を中断し、その時間でメッセージを上書きする。

```python
try:
    await asyncio.wait_for(process(), timeout=24)
except asyncio.TimeoutError:
    await bot.edit_message_text(
        chat_id=chat_id,
        message_id=thinking_message_id,
        text="⏱ 少し時間がかかりすぎました。もう一度試してください。"
    )
except Exception as e:
    print(f"Error: {e}")
    await bot.edit_message_text(
        chat_id=chat_id,
        message_id=thinking_message_id,
        text="❌ エラーが発生しました。もう一度試してください。"
    )
```

**ポイント**
- `send_message` ではなく `edit_message_text` で「考えています...」を上書きする
- タイムアウトは Lambda の制限より数秒短く設定してクリーンアップ時間を確保する

**学び**
- エラー時は「新しいメッセージを送る」ではなく「既存メッセージを上書きする」のが正しい UX
- Lambda タイムアウトに対しては、アプリ側でそれより短い内部タイムアウトを設けてフォールバック処理を走らせる

---

## #047 Telegram インラインキーボード実装：LLM 2回呼び出しによるタイムアウト

**日付**: 2026-05-20
**フェーズ**: Week 2 - UX 改善（ボタン保存機能）

**やりたかったこと**
翻訳後に自動でボタンを表示し、「保存する / スキップ」で決められるようにしたい。毎回「save this」とタイプする手間をなくす。

**試したアプローチと失敗理由**

| アプローチ | 失敗理由 |
|---|---|
| Agent に `save_phrases` ツールを呼ばせる | ツール呼び出し後に LLM が再度呼ばれる（2回呼び出し）→ 合計 20〜30 秒 → タイムアウト |
| レスポンスに `<!--PHRASES:[...]-->` マーカーを埋め込む | GPT-4o がフォーマット指示を無視してマーカーを付けなかった |

**根本原因：Agent ツール呼び出しの仕組み**

Agent Framework でツールを呼ぶと、LLM の呼び出しが最低 2 回発生する：

```
1回目の LLM: ユーザーの入力を処理 → ツールを呼ぶ判断
ツール実行: save_phrases()
2回目の LLM: ツールの結果を受けて最終レスポンスを生成
```

翻訳 + ツール呼び出しで合計 20〜25 秒。コールドスタート（3〜4 秒）を加えると 29 秒タイムアウトに引っかかる。

**最終的な解決策**
`translate_japanese` ツール自身がフレーズを DynamoDB に保存する。Agent の文章に依存しない。

```python
def translate_japanese(japanese_text: str, user_id: str) -> list[dict]:
    # ... GPT-4o で翻訳 ...
    phrases = [{"text": t["text"], "japanese": japanese_text, ...} for t in translations]
    SessionClient(...).set_pending_phrases(user_id, phrases)  # ← ここで保存
    return translations
```

`main.py` は `handle_message` の後に `get_pending_phrases` を確認するだけ。LLM の呼び出しは 1 回で完結する。

**deploy.sh で --prerelease=allow が必要になった**
ボタン機能のデプロイ中に依存関係エラーが発生した。`agent-framework==1.2.1` が `agent-framework-azure-ai-search`（プレリリース）を引き込んでおり、`uv pip install` がデフォルトではプレリリースを許可しないため失敗した。

```bash
# 修正後
uv pip install -r requirements.txt \
  --target $BUILD_DIR \
  --python-platform x86_64-manylinux2014 \
  --python-version 3.12 \
  --prerelease=allow \  # ← 追加
  --quiet
```

以前は通っていた理由不明（おそらく uv のバージョンアップで挙動が変わった）。

**学び**
- Agent にツールを呼ばせると LLM が2回呼ばれる。Telegram の 30 秒制限を意識すると、ツール呼び出しの追加は慎重に
- LLM にフォーマット指示を出すより、ツール自体が副作用（DynamoDB 保存）を持つ方が確実
- `asyncio.wait_for(24秒)` + Lambda タイムアウト(29秒) の組み合わせで安全な終了処理を実現

---

## #046 Telegram インラインキーボードでフレーズ保存の確認 UI を実装

**日付**: 2026-05-19
**フェーズ**: Week 2 - UX 改善

**背景**
フレーズを保存するには毎回「save this」とメッセージを送る必要があった。
翻訳後に自動でボタンを表示し、タイプ不要で保存できる UX に変更した。
Agent が翻訳・説明後に自発的に `save_phrases` を呼ぶようプロンプトを変更し、ボタンを押すだけで保存できるようにした。

**変更後のフロー**
```
Before: Agent → save_phrases() → CosmosDB に即保存 → 完了メッセージ

After:  Agent → save_phrases() → DynamoDB に仮置き
                                      ↓
                          ボタン付きメッセージ表示
                                      ↓
                   [✅ 保存する]  [✗ スキップ]
                       ↙                ↘
              do_save_phrases()      pending 削除
              CosmosDB 保存
```

**Telegram の仕組み：`callback_query` とは**

ボタンクリックは通常の `message` update ではなく `callback_query` という別種の update として届く。

```json
{
  "callback_query": {
    "id": "...",
    "from": {"id": 12345},
    "message": {"message_id": 42, "chat": {"id": 12345}, "text": "..."},
    "data": "save_phrases"
  }
}
```

`lambda_handler` の先頭で `"callback_query" in body` を確認し、分岐処理する。

**`answerCallbackQuery` が必要な理由**

ボタンを押すとユーザー側でローディングインジケーターが表示される。
`answerCallbackQuery` を呼ばないとインジケーターが消えず、ユーザーが「処理中」と誤解したまま固まる。

```python
requests.post(
    f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/answerCallbackQuery",
    json={"callback_query_id": callback_id}
)
```

**DynamoDB を「一時バッファ」として使う理由**

Lambda はステートレス。callback_query が来たとき（別の Lambda 呼び出し）にフレーズデータを参照できる場所が必要。
モジュールレベルの変数は同じコンテナが使われるときだけ有効で信頼性が低い。
すでに使っている DynamoDB の `pending_phrases` フィールドに保存することで、異なる Lambda 呼び出しをまたいでデータを引き継げる。

```python
# save_phrases ツール（Agent が呼ぶ）
SessionClient(...).set_pending_phrases(user_id, phrases)
return "Queued N phrase(s) for user confirmation."

# callback_query ハンドラ（ボタンクリック時）
pending = session_client.get_pending_phrases(chat_id)
do_save_phrases(pending, user_id)  # ← ここで初めて CosmosDB に保存
session_client.clear_pending_phrases(chat_id)
```

**`save_phrases`（ツール）と `do_save_phrases`（実行）の分離理由**

Agent が呼べるツール（= public 関数）と「実際に保存するロジック」を分けることで、
- ツール呼び出し時は「保留」だけして終わる
- 実際の保存は `main.py` がボタン確認後に制御する

という責任分離が実現できる。Agent 自身は「保存がキューに入った」ことしか知らない。

**プロンプト変更のポイント**

変更前: 「confirm it and save it to memory」
変更後: 「call save_phrases — do NOT tell him it's saved yet. The UI will show him a confirmation button.」

プロンプトを変えないと Agent が「保存しました」とユーザーに言ってしまい、ボタン確認 UI と矛盾するメッセージになる。

**面接での答え方**
「Telegram のボタンクリックは `callback_query` という別種の update として届きます。Lambda はステートレスなので、フレーズデータを DynamoDB に仮置きして、ボタンクリック時に取り出して保存する二段階の設計にしました。」

**学び**
- Telegram の update には `message` と `callback_query` の2種類がある。`lambda_handler` で最初に分岐する
- `answerCallbackQuery` を忘れるとボタンのローディングが消えない
- Lambda 間でデータを引き継ぐには、モジュール変数ではなく外部ストア（DynamoDB など）を使う

---

## #045 CosmosDB サーバーレス移行（TODO）

**日付**: 2026-05-19
**フェーズ**: インフラ改善（未着手）

**背景**
現在 CosmosDB は `throughput = 400 RU/s` のプロビジョニングモードで動いており、使用量に関係なく月 $23〜46 かかっている。個人利用なのでサーバーレスモード（操作量課金）に切り替えると月 $1〜2 程度になる見込み。

**やること**
1. CosmosDB のフレーズ・SM-2 データをエクスポート（スクリプトを書く）
2. `cosmosdb.tf` を serverless モードに変更して `terraform apply`
3. 新アカウントの endpoint / primary_key を `.env` に更新
4. `deploy.sh` で Lambda の env vars を再設定
5. データを再インポート

**なぜ今日やらなかったか**
`terraform plan` で確認したところ、CosmosDB アカウントが in-place 変更ではなく **destroy → recreate** になることが判明。apply するとフレーズと SM-2 スコアが全消えする。また Lambda の env vars も Terraform state のズレで全削除される計画になっていた。データ移行の準備なしには実行できない。

**serverless 化の Terraform 変更内容（参考）**
```hcl
# azurerm_cosmosdb_account に追加
capabilities {
  name = "EnableServerless"
}

# database・graph から throughput を削除
# throughput = 400  ← 削除
```

---

## #044 deploy.sh でも `agent_framework` の `__init__.py` が空になる

**日付**: 2026-05-19
**フェーズ**: デプロイ

**症状**
デプロイ後にメッセージを送っても何も返ってこない。CloudWatch ログを確認すると：
```
Runtime.ImportModuleError: Unable to import module 'main': cannot import name 'Agent' from 'agent_framework'
```

**原因（2つ重なった）**

① `agent-framework`（傘パッケージ）が `agent-framework-core` の `__init__.py` を空で上書きする（#001 と同じ現象）。Linux 向けインストール（`--python-platform x86_64-manylinux2014`）でも発生する。uv の依存解決によってインストール順が変わると再発する。

② Lambda のウォームコンテナが問題を隠していた。一度正常に起動したコンテナは再利用されるため、`__init__.py` が壊れていても既存コンテナでは動き続ける。デプロイを行うと**全コンテナがリセット**されて全て最初から起動し直すため、そのタイミングで初めてインポートエラーが表れる。

**なぜ前まで動いていたか**
- 以前のデプロイでは uv がたまたま `agent-framework-core` を後にインストールしており、正しい `__init__.py` が残っていた
- その後のリクエストはウォームコンテナを再利用していたため問題が表面化しなかった
- 新たなデプロイでコンテナがリセットされた瞬間に、潜在していた問題が顕在化した

**解決策**
`deploy.sh` で `requirements.txt` のインストール後に `agent-framework-core` を強制再インストールするステップを追加：

```bash
uv pip install agent-framework-core==1.2.1 \
  --target $BUILD_DIR \
  --python-platform x86_64-manylinux2014 \
  --python-version 3.12 \
  --reinstall \
  --quiet
```

`--reinstall` で強制的に後から上書きすることで、インストール順に関わらず正しい `__init__.py` が保証される。

**学び**
- Lambda のウォームコンテナは潜在的なバグを隠す。デプロイ後に正常動作していても、コンテナリセット（次のデプロイや長時間放置後のコールドスタート）で突然壊れることがある
- `ImportModuleError` はデプロイ直後のコールドスタートでのみ表れることがある。ウォームスタートでは再現しない
- 同じ名前空間を共有するパッケージ（`agent-framework` 系）はインストール順が重要。依存解決の順番に頼らず、`--reinstall` で明示的に順番を固定する

---

## #043 同じ日本語に複数フレーズがある場合のクイズ判定の改善

**日付**: 2026-05-19
**フェーズ**: Week 2 - クイズ品質改善

**背景**
「承知しました」に対して `"Understood"` / `"Got it"` / `"I'll get right on it"` の3フレーズを保存した場合、クイズで3回同じ日本語が出題される。ease_factor 順で出題されるため保存順と出題順が異なり、ユーザーが正しいフレーズを答えても期待値と一致しないとして ❌ になる問題があった。

**変更前の動作**
```
出題：「承知しました」→ expected: "I'll get right on it"
回答：「Understood」← 自分が保存した正解なのに ❌
```

**解決策**
評価時に `expected`（1つ）ではなく、同じ日本語を持つ pending フレーズ全部を `candidates` として渡す。GPT-4o がどのフレーズにマッチしたかを `phrase_id` で返し、マッチしたフレーズの SM-2 を更新・queue から除外する。

```python
# 変更前
evaluate_answer(japanese, expected="Got it", user_answer)
# → quality: int

# 変更後
evaluate_answer(japanese, candidates=[
    {"phrase_id": "id1", "text": "Understood"},
    {"phrase_id": "id2", "text": "Got it"},
    {"phrase_id": "id3", "text": "I'll get right on it"},
], user_answer)
# → EvalResult(quality, matched_phrase_id, note)
```

**wrong のときの処理**
マッチするフレーズがない（`matched_phrase_id=None`）場合は `current_phrase_id` を wrong として処理。SM-2 がリセットされ、翌日また出題される。

**UX の改善**
同じ日本語が複数回出題されるとユーザーが混乱するため、残り件数を表示：
```
🇯🇵 承知しました（あと3フレーズ）
```

**GPT-4o の幻覚対策**
`matched_phrase_id` が candidates の id 一覧に含まれない値を返すケースに備え、返ってきた id をバリデーションして不正なら `None` に補正する。

```python
valid_ids = {c["phrase_id"] for c in candidates}
if matched_phrase_id not in valid_ids:
    matched_phrase_id = None
```

**学び**
- 1対多の関係（日本語1つ：英語フレーズ複数）をクイズで扱うとき、出題順と記録対象を切り離す設計が必要
- LLM に選択肢を渡して「どれにマッチするか」を返させるパターンは、順不同マッチングに有効
- LLM が返す ID は必ずバリデーションする。存在しない ID を返すことがある

---

## #042 クイズ採点プロンプトの厳格化と評価結果の構造化

**日付**: 2026-05-19
**フェーズ**: Week 2 - クイズ品質改善

**背景**
実際に使ってみると、動詞の目的語が抜けていたり冠詞が間違っていても `close`（惜しい）と判定されるケースがあった。
練習目的では「なんとなく通じる」ではなく、正確な英語が身につくことが重要。

**変更した基準**

| 判定 | 変更前 | 変更後 |
|---|---|---|
| `correct` | 意味が同じなら OK | 意味が同じ・文法的に完全・自然な言い換えOK |
| `close` | 意味は合ってるが不自然・不完全 | 文法・時制・前置詞・冠詞がすべて正しいが、フォーマリティが違う |
| `wrong` | 意味が違う | 目的語抜け / 冠詞ミス(a,the) / 時制ズレ / 前置詞ミス / 意味違い |

`close` の条件を「フォーマリティの差だけ」に絞ったことで、文法的に不完全な回答は確実に `wrong` に落ちるようになった。

**evaluator.py の変更**

`int` を返していたのを `EvalResult(quality, note)` に変更。GPT-4o に JSON で返させることで、採点理由も取得できるようにした。

```python
@dataclass
class EvalResult:
    quality: int
    note: str   # close/wrong のときに理由を一文で返す
```

プロンプトで `wrong` の条件を明示的に列挙することが重要。曖昧な定義のままだと LLM は寛大な方向に解釈しやすい。

**flow.py の変更**

フィードバックを3パターンに出し分け、`note` を毎回表示するようにした：

```
✅ Correct! Next review in N day(s).
🟡 Close! Expected: *...* \n {note} \n Next review in N day(s).
❌ The answer was: *...* \n {note} \n You'll see this again soon.
```

`wrong` にも note を表示することで「なぜ不正解か」が分かり、学習効果が上がる。

**学び**
- LLM の採点は「何が正解か」より「何が不正解か」を明示する方が精度が上がる。`wrong` の条件を列挙する設計が効果的
- 採点結果を `int` 一つで返すと、理由をユーザーに伝えられない。`(quality, note)` のペアにすることで UX が改善する
- `response_format={"type": "json_object"}` を使うと、判定と理由を一度の API 呼び出しで取得できる

---

## #041 DynamoDB に float を渡すと `Float types are not supported` エラー

**日付**: 2026-05-19
**フェーズ**: Week 2 - /review デバッグ

**症状**
`/review` を送っても何も返ってこない。エラーハンドリングを追加して再デプロイすると：
```
エラーが発生しました: Float types are not supported. Use Decimal types instead.
```

**原因**
DynamoDB は Python の `float` 型を拒否する。CosmosDB（Gremlin）から取得した `ease_factor`（例: `2.5`）が `float` のまま `set_quiz_state` に渡され、DynamoDB への保存で失敗していた。

```python
# CosmosDB から返ってくる ease_factor は float
due_phrases.append({
    "ease_factor": [sm2.get("ease_factor", 2.5)],  # float!
    ...
})

# そのまま DynamoDB に渡すとエラー
_session.set_quiz_state(chat_id, {"phrases": due_phrases, ...})
```

**なぜエラーに気づかなかったか**
`lambda_handler` のルーティングブロックに try/except がなかったため、`start_quiz` が投げた例外がそのまま Lambda の 500 エラーになり、ユーザーには何も返らなかった。

**解決策（2つセット）**

① `SessionClient.set_quiz_state` で保存前に `float` → `Decimal` に変換：

```python
from decimal import Decimal

def _to_decimal(obj):
    if isinstance(obj, float):
        return Decimal(str(obj))  # str経由でないと精度が狂う
    if isinstance(obj, dict):
        return {k: _to_decimal(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_to_decimal(i) for i in obj]
    return obj

def set_quiz_state(self, chat_id, quiz_state):
    self.table.update_item(
        ...
        ExpressionAttributeValues={":qs": _to_decimal(quiz_state)}
    )
```

② `/review` のルーティングブロックに try/except を追加してエラーをユーザーに返す：

```python
if text == "/review":
    try:
        start_quiz(chat_id, user_id)
    except Exception as e:
        print(f"[/review] start_quiz failed: {e}")
        requests.post(..., json={"chat_id": chat_id, "text": f"エラー: {e}"})
    return {"statusCode": 200}
```

**`Decimal(str(obj))` が正しい理由**
`Decimal(2.5)` は浮動小数点の誤差をそのまま引き継ぐ（`Decimal('2.4999999...')`）。
`Decimal(str(2.5))` = `Decimal('2.5')` — 文字列経由で正確に変換できる。

**学び**
- DynamoDB に数値を保存するときは `float` ではなく `Decimal` を使う（boto3 の仕様）
- ルーティングの分岐（`/review` など）には必ず try/except を入れて、エラーをユーザーに返せるようにする。サイレント失敗は原因特定が難しい
- 「何も返ってこない」＝ 例外が try/except の外で起きている、と疑う

---

## #040 CI（Linux）でのみ `Module "agent_framework" has no attribute "Agent"` が出る

**日付**: 2026-05-18
**フェーズ**: CI/CD

**症状**
```
src/agent/teacher_agent.py:1: error: Module "agent_framework" has no attribute "Agent"
src/agent/teacher_agent.py:1: error: Module "agent_framework" has no attribute "AgentSession"
```
ローカル（macOS）では `uv run --no-project mypy src/` が通るのに CI（ubuntu-latest）だけ失敗する。

**原因**
`agent-framework-core==1.2.1` は macOS と Linux で異なる wheel を配布している。

- **macOS wheel**: `agent_framework/__init__.py` に `Agent`・`AgentSession` のエクスポートが書かれている（11,645 bytes）
- **Linux wheel（CI）**: `__init__.py` が空（0 bytes）。実装は mypyc でコンパイルされた `.so` バイナリに入っている

mypy は `.so` を読めないため、Linux では `agent_framework` が空のモジュールに見える。
`#037` で追加した `ignore_errors = true` override は「agent_framework モジュール内のエラー」を無視するだけで、
`teacher_agent.py` が import するときの `[attr-defined]` エラーには効かない。

**確認方法**
```bash
wc -c .venv/lib/python3.12/site-packages/agent_framework/__init__.py
# macOS: 11645
# Linux: 0  ← CI ではこちら
```

**解決策**
`pyproject.toml` の mypy override に `follow_imports = "skip"` を追加：

```toml
[[tool.mypy.overrides]]
module = ["agent_framework", "agent_framework.*"]
ignore_errors = true
follow_imports = "skip"   ← これを追加
```

`follow_imports = "skip"` は「このモジュールの中身を追わず、すべてのシンボルを `Any` として扱え」という指示。
mypy が空の `__init__.py` を読んで属性を探そうとするのを止めるため、`[attr-defined]` が出なくなる。

**学び**
- `ignore_errors` は「モジュール内のエラーを無視」、`follow_imports = "skip"` は「モジュール自体を追わない」。用途が違う
- macOS と Linux で wheel の中身が違うことがある（特に mypyc コンパイル有無）。ローカルで通っても CI で落ちる原因になる
- 同じ問題の別バリアント: `#001`（ローカルでインストール順による `__init__.py` 上書き）

---

## #039 Phase 3 実装後に保存操作でタイムアウト

**日付**: 2026-05-18
**フェーズ**: Phase 3 デプロイ後

**症状**
「考えています...」のまま応答が来ない。CloudWatch ログに `Status: timeout` / `Duration: 29000.00 ms`。エラーメッセージは出ていない（例外でなくハングして時間切れ）。

**原因（2つ重なった）**

① Phase 3 で `save_phrases` に同期処理を3つ追加した：
- `_classify_pattern`（OpenAI API 呼び出し）
- `_get_or_create_pattern`（Gremlin クエリ）
- `link_phrase_to_pattern`（Gremlin クエリ）

Agent 自身の LLM 呼び出しと合わせて合計が 29 秒（Lambda タイムアウト）を超えた。

② Lambda メモリが 128MB（最小値）だった。Lambda はメモリに比例して CPU を付与するため、128MB は処理が遅い。以前は余裕でギリギリ通っていた処理が追加分で超えた。

**解決策**

Lambda メモリを 128MB → 512MB に変更（CPU が増え全体的に高速化）。
保存操作は 15〜20 秒かかるが タイムアウトせず完了するようになった。

```bash
aws lambda update-function-configuration \
  --function-name aels-teacher \
  --memory-size 512 \
  --region ap-southeast-2
```

**展望・根本対策**

現状は「保存 → パターン分類 → リンク」を直列で実行しているため、保存のたびに 2 回 OpenAI を呼んでいる。Telegram の webhook 制限（30 秒）がある限り、処理を追加するたびにタイムアウトリスクが上がる。

根本対策として検討できること：
- **非同期化**: フレーズ保存のレスポンスを先に返し、パターン分類を別 Lambda に非同期で投げる（SQS や EventBridge 経由）
- **バッチ分類**: 保存時は分類せず、夜間バッチで未分類フレーズをまとめて分類する
- 現時点では 512MB + 直列で許容範囲内なので保留。処理が増えてタイムアウトが再発したら対処する。

**学び**
- Lambda の処理増加はタイムアウトリスクに直結する。機能追加のたびに実行時間を意識する
- ログに何も出ない ＝ 例外でなくハング（外部 API 待ちで時間切れ）と疑う
- `aws logs tail --since 10m` でリアルタイムに確認できる
- 128MB は最小値で CPU も最小。処理が遅いと感じたらまずメモリを上げる

---

## #038 Telegram リトライループ + CosmosDB 接続ハング

**日付**: 2026-05-17
**フェーズ**: 本番運用中

**症状**
Lambda が無音のまま 29 秒でタイムアウトし続ける。ログにエラーメッセージが一切出ない。Telegram がリトライを繰り返してループ状態になる。

**原因（2つ重なった）**

① Gremlin クエリがエラーを返さずハングした（CosmosDB が大量リクエストで詰まった）。Lambda は 29 秒待ち続けてタイムアウト。

② Lambda がタイムアウトすると Telegram は「失敗」と判断してリトライする。リトライが増えるほど Lambda インスタンスが増え、CosmosDB への接続がさらに詰まる。スパイラル状態になった。

**応急処置**
`drop_pending_updates=true` を付けて Webhook を削除することで Telegram のキューに溜まったリトライを全破棄し、ループを止めた。

```bash
curl "https://api.telegram.org/bot<TOKEN>/deleteWebhook?drop_pending_updates=true"
```

`drop_pending_updates` がないと Webhook を削除しても再登録時にキューが流れ込んで再発する。

**未対応（TODO）**

- `update_id` による重複排除 — 同じ `update_id` が来たら即 200 を返して処理しない。Telegram リトライループの根本対策。
- Gremlin 接続タイムアウトの設定 — 現状は無応答でも 29 秒待ち続ける。

**学び**
- Lambda + Telegram webhook の組み合わせでは `update_id` の重複排除が必須
- Webhook 削除は必ず `drop_pending_updates=true` を付ける
- ログに何も出ない場合は「エラーが起きる前にハングしている」と疑う

---

## #037 mypy がサードパーティパッケージの属性を解決できない

**日付**: 2026-05-17
**フェーズ**: CI/CD セットアップ

**症状**
`--ignore-missing-imports` をつけても `agent_framework` の `Agent`・`AgentSession` に対して `Module has no attribute` エラーが出る。CI が通らない。

**原因（2つあった）**

① `--ignore-missing-imports` は型スタブが見つからないモジュールへのインポートを無視するが、モジュール自体がインストール済みの場合は効かない。`agent_framework` はインストール済みだが型情報がなく、属性を解決できない。

② `pyproject.toml` の overrides に `agent_framework.*`（サブモジュール）は書いていたが、トップレベルの `agent_framework` 自体が対象外だった。ワイルドカードはサブモジュールにしか効かない。

**解決策**

`pyproject.toml` の overrides をトップレベルも含めるよう修正：

```toml
[[tool.mypy.overrides]]
module = ["agent_framework", "agent_framework.*"]
ignore_errors = true
```

また CI の `uv run mypy` は `pyproject.toml` に `[project]` テーブルがないと失敗するため、`--no-project` フラグを追加：

```yaml
run: uv run --no-project mypy src/ --ignore-missing-imports
```

**学び**
- `agent_framework.*` は `agent_framework.openai` などには効くが `agent_framework` 本体には効かない。必ずトップレベルも明示する。
- `uv run` は `[project]` テーブルを要求する。pyproject.toml が設定ファイルとしてのみ存在する場合は `--no-project` が必要。

---

## #036 OpenAI API の `message.content` は `str | None`

**日付**: 2026-05-17
**フェーズ**: CI/CD セットアップ（mypy 対応）

**症状**
`response.choices[0].message.content` を直接 `json.loads()` や `return` に渡すと mypy エラー。

**原因**
OpenAI SDK の型定義では `message.content` は `str | None`。ツール呼び出しのみのレスポンスなど、content が存在しないケースがあるため。

**解決策**
`or` でフォールバックを明示する：

```python
result = response.choices[0].message.content or "{}"   # translate_tool
return result or ""                                     # qa_tool
judgment = (response.choices[0].message.content or "").strip().lower()  # evaluator
```

**学び**
OpenAI SDK を使うときは `message.content` が `None` になりうることを常に意識する。mypy を入れると最初に気づける。

---

## #035 GitHub Actions の Ubuntu で `uv pip install --system` が失敗する

**日付**: 2026-05-17
**フェーズ**: CI/CD セットアップ

**症状**
GitHub Actions（ubuntu-latest）で `uv pip install -r requirements.txt --system` を実行すると以下のエラー：
```
error: The interpreter at /usr is externally managed
```

**原因**
Ubuntu（Debian 系）は PEP 668 に従いシステム Python を「外部管理」として保護している。`--system` フラグでのインストールはブロックされる。
また `setup-uv` アクションがすでに仮想環境を作成しているため、`uv venv` を二重に呼ぶと「virtual environment already exists」エラーにもなる。

**解決策**
`--system` と `uv venv` を削除し、`uv pip install` だけにする。コマンド実行は `uv run` 経由にすると自動的に仮想環境が使われる：

```yaml
- name: Install dependencies
  run: uv pip install -r requirements.txt ruff mypy

- name: Test
  run: uv run pytest tests/unit/ -v
```

**学び**
`setup-uv` アクションは仮想環境の作成まで担う。`--system` は CI では使わない。

---

## #034 Agent に `user_id` を渡さないと GPT-4o が値を推測する

**日付**: 2026-05-17
**フェーズ**: Week 2 - save デバッグ

**症状**
`save_phrases` が呼ばれるが、CosmosDB に保存しようとしても `user` 頂点が見つからずエラーになる。
ログを見ると `user_id="Ren"` で呼ばれていた。

**原因**
`teacher_agent.py` は `incoming.text` だけを Agent に渡しており、`user_id` を教えていなかった。
システムプロンプトに「You are Ren's personal English teacher」とあるため、GPT-4o が「Ren」を `user_id` と推測して使っていた。

**解決策**
メッセージの先頭に `[user_id=...]` を付与して Agent に渡す：

```python
text_with_context = f"[user_id={incoming.user_id}] {incoming.text}"
result = await agent.run(text_with_context, session=session)
```

プロンプトにも「Always use the user_id value from [user_id=...] at the start of the message」と明示する。

**面接での答え方**
「Agent Framework のツールに user_id を渡す方法として、メッセージ先頭に hidden context として埋め込みました。プロンプトで使い方を明示しないと LLM が推測して誤った値を使います。」

---

## #033 CosmosDB の `user` 頂点が存在しないと edge 作成が失敗する

**日付**: 2026-05-17
**フェーズ**: Week 2 - save デバッグ

**症状**
フレーズ保存が "technical issue" で失敗する。ログには CosmosDB のエラーなし。

**原因**
`link_user_to_phrase` は `g.V().has('user', 'user_id', '...')` から辺を張ろうとするが、`user` 頂点が一度も作成されていなかった。
Week 1 の保存機能が動いていなかったため、`create_user` が呼ばれたことがなかった。

**解決策**
`save_phrases` の先頭で `user` 頂点の存在を確認し、なければ自動作成する：

```python
def _ensure_user_exists(user_id: str) -> None:
    existing = client.execute(f"g.V().has('user', 'user_id', '{user_id}')")
    if not existing:
        client.execute(queries.create_user(user_id=user_id, name=user_id, goal="Work in Australia"))
```

**学び**
グラフ DB は外部キー制約がない。存在しない頂点に辺を張ろうとしても silent fail になる場合がある。
初回保存時に依存する頂点を作る「upsert」パターンが安全。

---

## #032 CosmosDB Gremlin は `lte()` 述語が文字列に使えない

**日付**: 2026-05-17
**フェーズ**: Week 2 - /review デバッグ

**症状**
```
GraphSyntaxException: Gremlin query syntax error: Missing ')' @ line 5, column 26
```

**原因**
`.has('due_date', lte('{today}'))` を使ったが、CosmosDB Gremlin は文字列に対する `lte()` 述語をサポートしていない（数値のみ対応）。

**解決策**
クライアント側フィルタリングにフォールバック。ISO 日付形式（YYYY-MM-DD）は辞書順 = 日付順なので Python の文字列比較で正確に判定できる：

```python
all_phrases = _graph.execute(queries.get_all_phrases(user_id))
phrases = [p for p in all_phrases if p.get("due_date", ["0000-00-00"])[0] <= today]
```

**学び**
CosmosDB Gremlin は標準 Gremlin の述語を文字列プロパティで使えないケースがある。動かない場合はクライアント側フィルタリングにフォールバックする（TextP と同じパターン）。

---

## #031 Lambda IAM role に `dynamodb:UpdateItem` が必要だった

**日付**: 2026-05-17
**フェーズ**: Week 2 - /review デバッグ

**症状**
```
AccessDeniedException: not authorized to perform: dynamodb:UpdateItem
```

**原因**
Week 1 では `PutItem`・`GetItem`・`DeleteItem` だけで足りていた。Week 2 で `update_item()` を使う `set_quiz_state` と `clear_quiz_state` を追加したが、IAM ポリシーを更新していなかった。

**解決策**
`infrastructure/terraform/modules/aws/iam.tf` に `UpdateItem` を追加して `terraform apply`：

```hcl
Action = [
  "dynamodb:GetItem",
  "dynamodb:PutItem",
  "dynamodb:DeleteItem",
  "dynamodb:UpdateItem"
]
```

**学び**
新しい DynamoDB 操作を追加するときは IAM ポリシーも一緒に更新する。`put_item` → `update_item` に変えただけで権限エラーになる。

---

## #030 Gremlin のイベントループ競合：`ThreadPoolExecutor` で解決

**日付**: 2026-05-17
**フェーズ**: Week 2 - save デバッグ

**症状**
```
RuntimeError: Cannot run the event loop while another loop is running
RuntimeWarning: coroutine 'AiohttpTransport.connect' was never awaited
```

**原因**
Gremlin Python クライアントは aiohttp を使って非同期で接続する。Agent Framework の `asyncio.run()` が実行中のとき、Gremlin が自分のイベントループを起動しようとして競合する。

**解決策**
`GremlinClient.execute()` を `ThreadPoolExecutor` で別スレッドで実行する。新しいスレッドにはイベントループがないため Gremlin が問題なく動く：

```python
def execute(self, query: str) -> list:
    def _run():
        c = client.Client(**self._config)
        try:
            return c.submit(query).all().result()
        finally:
            c.close()

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(_run).result()
```

**面接での答え方**
「Gremlin クライアントが aiohttp を使っているため、asyncio の実行中に呼び出すとイベントループが競合します。`ThreadPoolExecutor` で別スレッドに逃がすことで解決しました。」

---

## #029 CosmosDB のパーティションキーはすべての頂点に必要

**日付**: 2026-05-17
**フェーズ**: Week 2 - save デバッグ

**症状**
```
GraphRuntimeException: Cannot add a vertex where the partition key property has value 'null'
```

**原因**
`create_phrase` クエリに `user_id` プロパティを含めていなかった。CosmosDB はパーティションキー（`user_id`）がすべての頂点に必須。`user` 頂点には書いていたが `phrase` 頂点には忘れていた。

**解決策**
`create_phrase()` に `user_id` パラメータを追加してプロパティとして設定：

```python
def create_phrase(phrase_id, text, japanese, context, note, user_id) -> str:
    query = f"""
    g.addV('phrase')
     .property('phrase_id', '{phrase_id}')
     .property('user_id', '{user_id}')  # ← 必須
     ...
    """
```

**学び**
CosmosDB で新しい頂点ラベルを追加するときは、必ずパーティションキープロパティを含める。

---

## #028 docstring がないと Agent Framework がツールのスキーマを誤解する

**日付**: 2026-05-17
**フェーズ**: Week 2 - ローカルテスト

**症状**
`save_phrases` を呼ぶと `'str' object has no attribute 'get'` エラーが出た。
GPT-4o は `phrases=["Understood", "Got it", ...]`（文字列のリスト）で呼んでいた。

**期待していた動作**
```python
save_phrases(phrases=[{"text": "Understood", "japanese": "承知しました", ...}], user_id="Ren")
```

**実際の動作**
```python
save_phrases(phrases="Understood", user_id="Ren")  # 文字列を渡していた
```

**原因**
Agent Framework はツール関数のスキーマを **型アノテーション + docstring** から自動生成する。
`save_phrases` に docstring がなかったため、GPT-4o が `phrases: list[dict]` の中身の形を理解できなかった。

**解決策**
`save_phrases` に docstring を追加して、各 dict のキーを明示する：

```python
def save_phrases(phrases: list[dict], user_id: str) -> None:
    """
    Save English phrases to the user's knowledge graph.

    Args:
        phrases: List of phrase objects, each with:
            - text: English phrase (str)
            - japanese: Japanese meaning (str)
            - context: Usage context e.g. "formal", "casual" (str)
            - note: Additional notes (str)
        user_id: The user's Telegram user ID
    """
```

追加後、6回の Gremlin クエリが正しく発行された（`addV` + `addE` × 3フレーズ）。

**面接での答え方**
「Agent Framework はツールのスキーマを型アノテーションと docstring から生成します。複雑な型（list[dict] など）は docstring で中身の形を明示しないと、LLM が誤った形式で呼び出します。」

**学び**
- `list[dict]` のように中身が複雑なパラメータは必ず docstring で構造を説明する
- ツールが正しく呼ばれているかは、ローカルテストでモックしながら確認できる

---

## #027 EventBridge で起動する Lambda には Telegram の `body` がない

**日付**: 2026-05-17
**フェーズ**: Week 2 - Phase 6 Quiz scheduler

**誤解していたこと**
`chat_id` は `body["message"]["chat"]["id"]` から取る — と思っていた。

**実際の動作**
EventBridge（cron）が Lambda を起動するとき、Telegram の webhook は来ない。
`event` に `body["message"]` は存在しない。

```python
# webhook Lambda — Telegram が body を送ってくる
body = json.loads(event["body"])
chat_id = str(body["message"]["chat"]["id"])  # ✅

# scheduler Lambda — EventBridge が起動する、body はない
# chat_id をどこか別の場所から取得する必要がある
```

**AELS での解決策**
1-on-1 ボットでは `chat_id == user_id`（Telegram の仕様）。
CosmosDB から `user_id` を取得して、そのまま `chat_id` として使う。

```python
users = _graph.execute(queries.get_all_users())
for user in users:
    user_id = user["user_id"][0]
    chat_id = user_id  # 1-on-1 ボットでは常に同じ
    start_quiz(chat_id, user_id)
```

**面接での答え方**
「EventBridge で起動するスケジューラー Lambda には Telegram の body がありません。1-on-1 ボットなので chat_id と user_id が同じであることを利用して、CosmosDB から user_id を取得して chat_id として使っています。」

---

## #026 Gremlin の `valueMap()` と生の頂点オブジェクトでプロパティの取り方が違う

**日付**: 2026-05-17
**フェーズ**: Week 2 - Phase 6 Quiz scheduler

**症状**
`g.V().hasLabel('user')` の結果から `user_id` を取ろうとして、`.get("properties", {}).get("user_id", [{}])[0].get("value")` と書いたが動かなかった。

**原因**
クエリに `valueMap()` をつけているかどうかで、返ってくる構造が違う。

```python
# valueMap() あり → このプロジェクトで統一している形
{"user_id": ["12345"], "name": ["Ren"], ...}
user["user_id"][0]  # ✅

# valueMap() なし → 生の Gremlin 頂点オブジェクト
{"id": "...", "label": "user", "properties": {"user_id": [{"value": "12345"}]}}
user["properties"]["user_id"][0]["value"]  # 別の取り方が必要
```

**解決策**
このプロジェクトは全クエリに `valueMap()` をつける方針で統一する。取り方は常に `vertex["property"][0]`。

**学び**
新しいクエリを書くときは必ず末尾に `.valueMap()` をつける。そうしないと既存のプロパティ取り出しコードと互換性がなくなる。

---

## #025 クイズフローで CosmosDB を毎回叩かない理由

**日付**: 2026-05-17
**フェーズ**: Week 2 - Phase 5 Quiz flow

**設計上の判断**
クイズ開始時に全フレーズのデータを DynamoDB の `quiz_state` に丸ごと保存する。

```python
"phrases": {p["phrase_id"][0]: p for p in phrases}
```

**理由**
`handle_quiz_answer` は答えを評価するたびに日本語と期待値が必要。
毎回 CosmosDB に問い合わせると：
- レイテンシが増える（クイズ1問ごとに Gremlin クエリ）
- CosmosDB の RU（課金単位）を消費する

クイズ開始時に1回だけ取得して DynamoDB にキャッシュする方が速くて安い。

**トレードオフ**
DynamoDB のアイテムサイズが増える。ただし TTL が24時間なので蓄積しない。

---

## #024 `get_due_phrases` が edge のプロパティを返さない理由

**日付**: 2026-05-17
**フェーズ**: Week 2 - Phase 5 Quiz flow

**症状**
`get_due_phrases` の結果に `ease_factor`・`interval`・`repetitions` が含まれない。

**原因**
Gremlin の `valueMap()` は**頂点（vertex）のプロパティ**を返す。
SM-2 の値は `learned_phrase` **エッジ**に保存されているため、`valueMap()` には含まれない。

```
(user) -[learned_phrase {ease_factor, interval, ...}]-> (phrase {text, japanese, ...})
                 ↑ ここ                                          ↑ ここだけ返る
```

**Week 2 の対処**
フレーズが初めて保存されるとき SM-2 のデフォルト値（EF=2.5, interval=0, repetitions=0）を設定するので、
`quiz_state` 内でフォールバックとしてデフォルト値を使う：

```python
ease_factor=float(phrase.get("ease_factor", [2.5])[0])
```

**Week 3 以降の改善**
エッジのプロパティも取得するクエリに変更する：
```
.outE('learned_phrase').project('phrase', 'sm2').by(inV().valueMap()).by(valueMap())
```

**学び**
Gremlin で `valueMap()` を使うときは「頂点か辺か」を意識する。辺のプロパティが必要なら `.outE()` の後で `.valueMap()` を呼ぶ。

---

## #023 DynamoDB を更新するとき `put_item` と `update_item` を使い分ける理由

**日付**: 2026-05-17
**フェーズ**: Week 2 - Phase 2 Quiz state

**疑問**
`quiz_state` を保存するのに `put_item` ではなく `update_item` を使う理由は？

**答え**
`put_item` はアイテム全体を**上書き**する。`quiz_state` だけ書くと `messages` が消える。

```python
# ❌ put_item — messages が消える
table.put_item(Item={"chat_id": chat_id, "quiz_state": quiz_state})

# ✅ update_item — quiz_state だけ変更、messages はそのまま
table.update_item(
    Key={"chat_id": chat_id},
    UpdateExpression="SET quiz_state = :qs",
    ExpressionAttributeValues={":qs": quiz_state}
)
```

`REMOVE` を使うと属性を削除できる（`clear_quiz_state` で使用）：
```python
UpdateExpression="REMOVE quiz_state"
```

**面接での答え方**
「DynamoDB で特定の属性だけ更新するときは `update_item` を使います。`put_item` はアイテム全体を置き換えるので、他の属性が消えます。」

---

## #022 GPT-4o に「1単語で答えろ」と指示するときの注意点

**日付**: 2026-05-17
**フェーズ**: Week 2 - Phase 4 Answer evaluator

**疑問**
GPT-4o に1単語で返させるとき `max_tokens=1` にすればいいのでは？

**答え**
`max_tokens=1` だと、GPT-4o が単語の途中でカットされる場合がある（トークンは文字単位ではなくサブワード単位）。
`max_tokens=10` にすれば "correct" / "close" / "wrong" のどれも確実に収まる。

**フォールバックの考え方**
GPT-4o が予期しない文字列を返した場合、`.get(judgment, 1)` で quality=1（wrong）にフォールバックする。
理由：「わからない」ときは「間違い扱い」にして近いうちに再出題するほうが、「正解扱い」にして長期間出題しないより安全。

**プロンプト設計のポイント**
判定基準を明示しないと GPT-4o が曖昧に判断する：
```
- "correct": means the same thing, even if worded differently  ← 言い換えOKを明示
- "close": the meaning is right but phrasing is unnatural     ← 惜しい の定義
- "wrong": incorrect or unrelated                             ← 不正解
```

**面接での答え方**
「GPT-4o で採点するとき、判定基準をプロンプトに明示しました。また予期しないレスポンスは安全側（wrong）にフォールバックするようにしました。」

---

## #021 SM-2 の `ease_factor` の最低値が 1.3 な理由

**日付**: 2026-05-17
**フェーズ**: Week 2 - SM-2 アルゴリズム実装

**疑問**
`ease_factor = max(1.3, ease_factor)` と書いたが、なぜ 1.3 が下限なのか？

**答え**
`ease_factor` が 1.0 以下になると `interval * ease_factor < interval` になり、復習間隔が**縮んでいく**。
間違えるたびに次の復習が早まり続け、スペースドリピティションが機能しなくなる。

1.3 は SM-2 オリジナル論文（Piotr Woźniak）が実験的に決めた下限。
「どれだけ苦手なフレーズでも、間隔は少しずつ伸びる（1.3倍ずつ）」という保証になっている。

**具体例**
```
ease_factor = 2.5（得意）: interval 1 → 6 → 15 → 37日
ease_factor = 1.3（苦手）: interval 1 → 6 → 8 → 10日
ease_factor < 1.0（下限なし）: interval 1 → 6 → 5 → 4日 ← 壊れる
```

**面接での答え方**
「ease_factor が 1.0 を下回ると間隔が縮み続けてアルゴリズムが壊れるため、SM-2 論文に従い 1.3 を下限にしています。」

---

## #020 SM-2 アルゴリズムの仕組み

**日付**: 2026-05-17
**フェーズ**: Week 2 - SM-2 アルゴリズム実装

**3つの変数**

| 変数 | 意味 | 初期値 |
|---|---|---|
| `ease_factor` | 復習間隔がどれだけ速く伸びるか（難しさ） | 2.5 |
| `interval` | 次の復習まで何日か | 0 |
| `repetitions` | 連続正解回数 | 0 |

**`ease_factor` の正確な意味**
「復習するかどうか」ではなく「**復習間隔がどれだけ速く伸びるか**」を表す。
高いほど間隔が急速に伸び（あまり復習しなくてよい）、低いほどゆっくりしか伸びない（頻繁に復習が必要）。

**間隔の計算ルール**
- 不正解（quality < 3）: `repetitions = 0`, `interval = 1`（リセット）
- 正解 1回目: `interval = 1`
- 正解 2回目: `interval = 6`
- 正解 3回目以降: `interval = round(interval * ease_factor)`

**quality スコアの対応（AELS での使い方）**

| GPT-4o の判定 | quality |
|---|---|
| 正解 | 5 |
| 惜しい（言い換えOK） | 3 |
| 不正解 | 1 |

**面接での答え方**
「SM-2 は ease_factor・interval・repetitions の3変数でフレーズごとの復習スケジュールを管理します。正解するたびに間隔が ease_factor 倍に伸び、間違えるとリセットされます。」

---

## #019 Lambda の `context` パラメータは使わなくてよい

**日付**: 2026-05-17

`lambda_handler(event, context)` の `context` は Lambda ランタイムが渡す必須パラメータだが、使わなくてもエラーにはならない。
IDE が "参照されていません" と警告を出すことがあるが、無視してよい。

`context` には実行環境の情報（残り時間、メモリ上限など）が入っているが、通常のアプリケーションコードで使うことはほぼない。

---

## #018 Telegram リトライ問題の修正方法

**日付**: 2026-05-17
**フェーズ**: Telegram リトライ修正

**解決策**
`asyncio.run()` の前に `requests` で同期的に "考えています..." を送信する。
Telegram は1秒以内にレスポンスを受け取るのでリトライしなくなる。

```python
def _send_thinking(chat_id: str) -> int:
    resp = requests.post(
        f"https://api.telegram.org/bot{TOKEN}/sendMessage",
        json={"chat_id": chat_id, "text": "考えています..."}
    )
    return resp.json()["result"]["message_id"]

def lambda_handler(event, context):
    body = json.loads(event["body"])
    chat_id = str(body["message"]["chat"]["id"])

    thinking_message_id = _send_thinking(chat_id)  # ← 同期・即時

    async def main():
        # ... 処理 ...
        await bot.edit_message_text(
            chat_id=chat_id,
            message_id=thinking_message_id,  # ← これで上書き
            text=response.text
        )

    return asyncio.run(main())
```

**`resp.json()["result"]["message_id"]` の意味**
Telegram API のレスポンスは常にこの構造：
```json
{"ok": true, "result": {"message_id": 42, "text": "考えています..."}}
```
- `resp.json()` → HTTP レスポンスボディを Python dict に変換
- `["result"]` → 送信された Message オブジェクトを取得
- `["message_id"]` → 後で `edit_message_text` するために ID を保存

**urllib vs requests**
`urllib.request` は Python 標準ライブラリだが、`json=` パラメータがなく使いにくい。
`requests` ライブラリは `json=` を直接受け取れるので、JSON を送るときはこちらを使う。

---

## #017 Telegram がリトライして処理が2回走る

**日付**: 2026-05-16
**フェーズ**: Lambda デプロイ・動作確認

**症状**
1回メッセージを送ると、ボットから2回応答が返ってきた。

**原因**
Telegram は webhook に5秒以内にレスポンスが返らないとリトライする。
Lambda の初回実行（コールドスタート含む）が 20+ 秒かかったため、
Telegram が「失敗した」と判断して同じ webhook を再送した。

**コールドスタートとは**
Lambda がゼロからコンテナを立ち上げること。以下の3つの状況で発生する：
1. **初回起動** — コンテナがまだ存在しない
2. **約15分間メッセージなし** — AWS がアイドルコンテナをシャットダウンする
3. **同時リクエスト増加** — 複数ユーザーが同時に送信してスケールアップが必要なとき

ウォームスタート = コンテナが既に起動済みで再利用される。コードはメモリに読み込まれているので初期化をスキップできる。

AELS は自分だけが使うため、15分以上放置した後は毎回コールドスタートになる。

**発生頻度**
- コールドスタート時（数分間メッセージなしの後）: ほぼ確実に2回
- ウォームスタート時: GPT-4o が5秒以内に返せば1回、超えると2回
- 実用上はほぼ毎回2回になる（GPT-4o は通常5〜15秒かかるため）

**現在の回避策**
Week 1 では許容する。

**Week 2 以降の解決策**
Lambda を非同期化する：
1. 受信 Lambda が即座に `{"statusCode": 200}` を返す
2. 別の Lambda を非同期 invoke して実際の処理をさせる
3. 処理完了後に Telegram へ応答を送る

**学び**
- Telegram の webhook タイムアウトは5秒
- Lambda コールドスタートは 3〜5 秒かかる
- 同期処理では応答が遅くなるとリトライが発生する

---

## #016 `Bot` をモジュールレベルで作ると `Event loop is closed` になる

**日付**: 2026-05-16
**フェーズ**: Lambda デプロイ

**症状**
2回目以降の Lambda 呼び出しで以下のエラーが出る：
```
RuntimeError: Event loop is closed
```

**原因**
`Bot` オブジェクトをモジュールレベルで作成していた。
`asyncio.run()` は呼び出し完了後にイベントループを閉じる。
Lambda はモジュールをキャッシュするため、2回目の呼び出しで閉じられたループを持つ `Bot` を再利用しようとしてクラッシュする。

**解決策**
`Bot` を `lambda_handler` 内の `async def main()` の中で作成する：

```python
# ❌ モジュールレベル — ループが閉じられてクラッシュ
bot = Bot(token=TELEGRAM_BOT_TOKEN)

def lambda_handler(event, context):
    async def main():
        await bot.send_message(...)

# ✅ ハンドラー内 — 毎回新しいループで作成
def lambda_handler(event, context):
    async def main():
        bot = Bot(token=TELEGRAM_BOT_TOKEN)
        await bot.send_message(...)
```

**学び**
- Lambda はモジュールをコンテナ内でキャッシュする（ウォームスタート）
- `asyncio.run()` はループを閉じるので、非同期オブジェクトはハンドラー内で作る
- `session_client` や `adapter` は非同期でないので安全にモジュールレベルに置ける

---

## #015 Lambda デプロイの落とし穴まとめ

**日付**: 2026-05-16
**フェーズ**: Lambda デプロイ

### 直接アップロードは 50MB 制限がある
Lambda への直接 zip アップロードは 50MB まで。
それを超える場合は S3 経由でアップロードする：
```bash
aws s3 cp deployment.zip s3://bucket/deployment.zip
aws lambda update-function-code --s3-bucket bucket --s3-key deployment.zip
```

### `--environment` はワンライナーで書く
AWS CLI の `--environment` は改行を含むと parse エラーになる：
```bash
# ❌ 改行入り → エラー
--environment "Variables={
  KEY=value
}"

# ✅ 一行で書く
--environment "Variables={KEY1=val1,KEY2=val2}"
```

### `ResourceConflictException` は待てば解決する
Lambda の更新中に別の設定変更をしようとすると `ResourceConflictException` が出る。
`LastUpdateStatus` が `Successful` になるまで待ってから再実行する：
```bash
aws lambda get-function --function-name aels-teacher \
  --query 'Configuration.{State:State,LastUpdateStatus:LastUpdateStatus}'
```

### `agent-framework` の依存パッケージが肥大化する
`agent-framework` は `claude_agent_sdk`（192MB）や `copilot`（145MB）など不要な大型パッケージを引き込む。
デプロイ時は不要なパッケージを削除してから zip を作る。

---

## #014 `--no-verify-ssl` でも SSL エラーが出る場合は zip サイズを疑う

**日付**: 2026-05-16

`--no-verify-ssl` を付けても `EOF occurred in violation of protocol` が出る場合、
SSL の問題ではなく zip ファイルが大きすぎることが原因の場合がある（直接アップロードの 50MB 制限）。
S3 経由に切り替えることで解決する。

---

## #013 Lambda ハンドラーのパスと `src/` 構造の不一致

**日付**: 2026-05-16
**フェーズ**: Lambda デプロイ

**症状**
Terraform で `handler = "main.lambda_handler"` と設定していたが、実際のファイルは `src/main.py` にある。
Lambda は zip のルートで `main.py` を探すので、`src/main.py` は見つからない。

**原因**
Lambda の `handler` 設定は `<ファイル名>.<関数名>` の形式。
`main.lambda_handler` → zip ルートの `main.py` の中の `lambda_handler` 関数を探す。

**解決策**
プロジェクトルートに薄いラッパー `main.py` を作成する：
```python
# main.py（プロジェクトルート）
from src.main import lambda_handler
```

zip の構造：
```
main.py          ← Lambda がここを見る
src/
  main.py        ← 実際のロジック
  adapters/
  agent/
  ...
<依存パッケージ>  ← pip install --target で展開
```

**学び**
- Lambda の `handler` は zip ルートからのパスで解決される
- `src/` 構造を保ちながらデプロイするには、ルートにラッパーを置くのが最もシンプル
- 代替案: `handler = "src.main.lambda_handler"` にする方法もある

---

## #012 `patch` とは何か

**日付**: 2026-05-16
**フェーズ**: Task 4.2 - test_memory_tool.py

**一言で言うと**
`patch` はテスト中だけ本物のオブジェクトを偽物に差し替える仕組み。

```python
from unittest.mock import patch, MagicMock

mock_client = MagicMock()

with patch("src.tools.memory_tool.client", mock_client):
    # この中では memory_tool.client が mock_client に差し替わっている
    save_phrases(...)

# ここでは memory_tool.client は本物の GremlinClient に戻っている
```

**なぜ `"src.tools.memory_tool.client"` と書くか**
定義された場所ではなく、**使われている場所**をパッチする。
`client` は `memory_tool.py` で使われているので、そこを指定する。

**面接での答え方**
「`patch` で外部依存を差し替えてテストしました。パッチは定義元ではなく使用箇所に当てる必要があります。」

---

## #011 `MagicMock` とは何か

**日付**: 2026-05-16
**フェーズ**: Task 4.2 - test_memory_tool.py

**一言で言うと**
`MagicMock` は「何にでもなれる偽物オブジェクト」。
実際の DB や API に繋がずにテストするために使う。

**動作**
```python
from unittest.mock import MagicMock

mock = MagicMock()
mock.execute("some query")   # クラッシュしない — 呼び出しを記録するだけ
mock.execute.call_count      # → 1（何回呼ばれたか）
mock.execute.return_value = []  # 返り値を設定できる
```

**「Magic」な理由**
アクセスした属性やメソッドを自動で作ってくれる。
存在しない属性にアクセスしても `AttributeError` が出ない。

**このプロジェクトでの使い方**
`GremlinClient` を `MagicMock` に差し替えることで、CosmosDB なしで `memory_tool.py` をテストできる。
「`execute` が2回呼ばれたか？」を確認することで、正しいクエリが発行されているかを検証する。

**面接での答え方**
「外部依存（DB・API）を `MagicMock` で差し替えてユニットテストを書きました。実際の接続なしに呼び出し回数や引数を検証できます。」

---

## #010 何をテストすべきか

**日付**: 2026-05-16
**フェーズ**: Task 4.2 - Unit tests

**3つの判断基準**

**1. 実装ではなく振る舞いをテストする**
「`get_item` を呼んだか？」ではなく「セッションがないとき空リストを返すか？」をテストする。
実装は変わっても振る舞いが同じなら、テストは通り続けるべき。

**2. 境界をテストする**
- 正常系: 普通の入力 → 期待する出力
- 異常系: フィールドなし、空リスト、None
- 型の安全性: integer が入って string が出るか（例: `user_id`）

**3. 自分のコードだけテストする**
`boto3.get_item` が動くかは AWS の責任。GPT-4o が正しく翻訳するかは OpenAI の責任。
自分が書いたロジックだけをテストする。

**このプロジェクトでの適用**
| ファイル | テストする内容 |
|---|---|
| `telegram_adapter.py` | パース処理 — 正しいフィールドを取り出せるか |
| `queries.py` | 文字列生成 — クエリに正しい値が含まれるか |
| `memory_tool.py` | 処理の流れ — 正しいクエリを正しい引数で呼ぶか |
| `translate_tool.py` | スキップ — OpenAI 呼び出しだけなのでユニットテスト不要 |

---

## #009 `response_format` を指定しないと API は何を返すか

**日付**: 2026-05-16
**フェーズ**: Task 3.2 - qa_tool.py

**疑問**
`response_format={"type": "json_object"}` を指定しないと、API は何を返すのか？

**答え**
プレーンテキスト — GPT-4o が自然に書くものをそのまま返す。
散文・箇条書き・Markdown など、プロンプトと GPT-4o の判断次第で形式は変わる。

```python
# response_format なし
response.choices[0].message.content
# → "The difference is that 'if possible' is more polite and indirect..."
```

`response_format={"type": "json_object"}` は「必ず valid JSON を返せ」という強制指示。
コードで parse する必要があるときだけ使う。

**使い分けの基準**
- レスポンスをコードで処理する（ループ・保存など）→ `json_object` を使う
- レスポンスをそのままユーザーに見せる → 指定しない

---

## #008 `client.chat.completions.create` の戻り値は `ChatCompletion` オブジェクト

**日付**: 2026-05-15
**フェーズ**: Task 3.1 - translate_tool.py

**疑問**
`client.chat.completions.create()` は何を返すのか？

**答え**
`ChatCompletion` という Python オブジェクト。dict ではなく属性でアクセスする。

```python
response = client.chat.completions.create(...)

response.choices           # list of Choice objects（なぜリストかは #007 参照）
response.model             # "gpt-4o"
response.usage.total_tokens  # 使用トークン数

# テキストはここ
response.choices[0].message.content  # → str（JSON テキスト）
```

**面接での答え方**
「`create()` は `ChatCompletion` オブジェクトを返します。テキストは `choices[0].message.content` で取得し、JSON なら `json.loads()` で変換します。」

---

## #007 OpenAI API は JSON を返さない — 文字列を返す

**日付**: 2026-05-15
**フェーズ**: Task 3.1 - translate_tool.py

**誤解していたこと**
`response_format={"type": "json_object"}` を指定すれば、API が Python の dict を返してくれると思っていた。

**実際の動作**
API のレスポンスは常に**文字列**。`response_format` は「JSON の形式で文字列を返せ」という指示であり、Python の型は変わらない。

```python
response.choices[0].message.content
# → '{"translations": [{"phrase": "Got it", ...}]}'  ← str 型
```

`json.loads()` で初めて Python の dict/list に変換できる。

```python
# 変換の流れ
API → str（JSON テキスト） → json.loads() → dict → ["translations"] → list
```

**面接での答え方**
「OpenAI API はテキストを返します。`response_format` は出力形式の指定であり、`json.loads()` で Python オブジェクトに変換する必要があります。」

---

## #006 `from datetime import time` と `import time` の違い

**日付**: 2026-05-15
**フェーズ**: Task 2.3 - session/client.py

**症状**
`int(time.time()) + 86400` で TTL を計算しようとしたら動かなかった。

**原因**
`from datetime import time` を使っていた。
これは `datetime` モジュールの `time` クラス（時刻を表すオブジェクト）で、`time.time()` メソッドを持たない。

**正しいインポート**
```python
# ❌ datetime モジュールの time クラス（時刻オブジェクト）
from datetime import time
time(14, 30, 0)  # = 14:30:00

# ✅ time モジュール（Unix タイムスタンプを返す）
import time
time.time()  # = 1715000000.0（現在の秒数）
```

**学び**
名前が同じでも全く別物。TTL や経過時間の計算には `import time` を使う。

---

## #005 `user_id` と `message_id` を文字列として扱う理由

**日付**: 2026-05-15
**フェーズ**: Task 2.2 - telegram_adapter.py

**疑問**
Telegram の webhook は `user_id` や `message_id` を integer で送ってくるのに、なぜ `str()` に変換するのか？

**理由 1: ID は識別子であって数値ではない**
ID 同士を足したり比較したりすることはない。`str` にすることで「これは識別子だ」という意図が明確になる。
また、どこかで文字列として扱われている ID と比較するときの型不一致バグも防げる。

**理由 2: DynamoDB のパーティションキーは String 型**
DynamoDB の `aels-sessions` テーブルは `chat_id` を String 型のパーティションキーとして定義している。
integer のまま渡すと boto3 が型エラーを投げる。

**原則**
「境界で変換、内部では一貫した型を使う」— webhook が届いた瞬間に変換しておけば、それ以降のコードは型を意識しなくて済む。

**面接での答え方**
「ID は数値演算に使わないので識別子として string で持ちます。また DynamoDB のキーが String 型なので、受信時点で変換しておく方が安全です。」

---

## #004 `@dataclass` はバリデーションをしない

**日付**: 2026-05-15
**フェーズ**: Task 2.1 - message_types.py

**誤解していたこと**
`@dataclass` は「ユーザーの入力をバリデーションするもの」だと思っていた。

**実際の動作**
`@dataclass` は `__init__`・`__repr__`・`__eq__` を自動生成するだけ。
型アノテーション（`str`, `datetime`）は Python が実行時に強制しない — ただのヒント。

```python
@dataclass
class IncomingMessage:
    text: str
    user_id: str  # 型が違っても RuntimeError にはならない
```

**バリデーションが必要なら**
Pydantic の `BaseModel` を使う（`pydantic==2.6.0` が requirements.txt に入っているのはそのため）。

**面接での答え方**
「`@dataclass` は `__init__` などのボイラープレートを自動生成します。バリデーションは Pydantic を使います。」

---

## #003 大きなファイルを git commit してしまい push が失敗した

**日付**: 2026-05-14
**フェーズ**: Task 1.2 - AWS Lambda Terraform

**症状**
```
remote: error: File ...terraform-provider-aws_v6.44.0_x5 is 769.79 MB;
this exceeds GitHub's file size limit of 100.00 MB
```

**原因**
`.gitignore` がルートの `.terraform/` のみを除外していた。
`modules/aws/` 内に `terraform init` で生成された `.terraform/` が別途できており、そちらが git に含まれてしまった。

**解決策**
`.gitignore` のパスを特定ディレクトリではなく glob パターンに変更：
```
# Before（特定パスのみ）
infrastructure/terraform/.terraform/

# After（全サブディレクトリをカバー）
**/.terraform/
**/terraform.tfstate
**/terraform.tfstate.backup
```

`git reset HEAD~N` で問題のコミットを取り消し、正しい内容で再コミット。

**学び**
- `terraform init` は実行したディレクトリに `.terraform/` を作る。モジュール内で実行すると別の場所に生成される
- `.gitignore` は特定パスではなく `**/.terraform/` のように glob で書く方が安全
- `git reset HEAD~N` は N 個前のコミットを取り消す。`--soft` はステージを保持、デフォルト（mixed）はステージを解除、`--hard` は変更を破棄

---

## #002 requirements.txt のバージョンピン留めで依存関係の衝突

**日付**: 2026-04-29
**フェーズ**: Task 0.4 - プロジェクト構造セットアップ

**症状**
```
uv pip install -r requirements.txt で No solution found
agent-framework==1.2.1 depends on python-dotenv>=1.1.1
you require python-dotenv==1.0.0 → unsatisfiable
```

**疑問（なぜ hello_agent.py は動いたのか）**
`requirements.txt` に `python-dotenv==1.0.0` と書いていたのに、`hello_agent.py` は問題なく動いていた。

**実際の原因**
最初に `uv pip install agent-framework==1.2.1` を直接実行したとき、uv が依存関係を自動解決して `python-dotenv>=1.1.1` を venv に入れていた。
`hello_agent.py` はすでに正しいバージョンが入っている venv を使っていたので動いた。
衝突したのは `uv pip install -r requirements.txt` で requirements.txt の全制約を同時に満たそうとしたとき。

**解決策**
`requirements.txt` の `python-dotenv==1.0.0` を `python-dotenv>=1.1.1` に変更。

**学び**
- `uv pip install <package>` は依存関係を自動解決するが、`requirements.txt` は書いた制約をそのまま守ろうとする
- バージョンをピン留めするときは依存パッケージとの整合性まで確認が必要
- `==` で固定する場合は慎重に。`>=` の方が柔軟で衝突しにくい

---

## #001 agent-framework インストール直後に `ImportError: cannot import name 'Agent'`

**日付**: 2026-04-29  
**フェーズ**: Task 0.3 - Agent Framework Hello World

**症状**
```
ImportError: cannot import name 'Agent' from 'agent_framework'
```

**自分の最初の仮説**
インポートパスが間違っている？

**実際の原因**
`agent-framework`（傘パッケージ）と `agent-framework-core` が同じ `agent_framework/` 名前空間を共有している。
インストール順によって傘パッケージの空の `__init__.py`（0バイト）が、core の正しい `__init__.py`（11645バイト）を上書きしてしまう。

確認方法：
```bash
wc -c .venv/lib/python3.12/site-packages/agent_framework/__init__.py
# 0 なら上書きされている
```

**解決策**
```bash
uv pip install --reinstall agent-framework-core==1.2.1
```

**学び**
- 傘パッケージ（メタパッケージ）と実装パッケージが同じ Python namespace を使う場合、インストール順で衝突する
- `ImportError` が出たらまずパッケージの `__init__.py` のファイルサイズを確認する
- `--reinstall` で core を後から入れ直すと解決する

---

## #019 Terraform と Lambda 環境変数の管理 — `ignore_changes` は応急処置

**日付**: 2026-05-23
**フェーズ**: CD パイプライン構築

### 問題

Lambda の環境変数（`OPENAI_API_KEY`、`COSMOS_KEY`、`TELEGRAM_BOT_TOKEN` 等）を AWS コンソールで手動設定していた。
Terraform の `lambda.tf` には `LOG_LEVEL = "INFO"` しか書いていなかったため、`terraform apply` を実行すると環境変数が全削除されてボットが壊れる状態だった。

`terraform plan` の出力：
```
~ environment {
    ~ variables = {
        - "COSMOS_KEY"        = "..." -> null
        - "OPENAI_API_KEY"    = "..." -> null
        - "TELEGRAM_BOT_TOKEN" = "..." -> null
        + "LOG_LEVEL"         = "INFO"
      }
  }
```

### 最初の対処（応急処置）

`lifecycle { ignore_changes = [environment] }` を各 Lambda リソースに追加。
Terraform に「environment ブロックは変更しない」と指示することで apply しても消えないようにした。

```hcl
lifecycle {
  ignore_changes = [environment, filename]
}
```

### なぜこれが best ではないか

- `terraform destroy → apply` でインフラを再構築すると env vars が消える（再現性がない）
- env vars がどこにも文書化されていない（コンソールの中にしか存在しない）
- Terraform の状態と実態が乖離している（drift）

### 正しい解決策：GitHub Secrets → CD で注入

**方針**: Terraform は env vars を管理しない。CD ジョブが deploy 時に `aws lambda update-function-configuration` で env vars を設定する。

```
GitHub Secrets（一元管理）
  OPENAI_API_KEY, COSMOS_KEY, TELEGRAM_BOT_TOKEN ...
       │
       ▼
GitHub Actions deploy ジョブ
  aws lambda update-function-configuration \
    --function-name aels-teacher \
    --environment "Variables={OPENAI_API_KEY=${{ secrets.OPENAI_API_KEY }}, ...}"
```

**この構造のメリット**:
- secrets の管理場所が GitHub Secrets に一元化される
- インフラを再構築しても CD を流せば env vars が復元される（再現性がある）
- Terraform は IAM・ネットワーク等のインフラのみ管理するという責務が明確になる

### 代替案との比較

| 方法 | 再現性 | secrets の管理場所 | 向いている場面 |
|---|---|---|---|
| コンソール手動 + `ignore_changes` | × | コンソール（属人的） | 応急処置のみ |
| `terraform.tfvars`（gitignore） | ○ | ローカルファイル | 個人・シンプルさ重視 |
| **GitHub Secrets → CD 注入**（採用） | ○ | GitHub Secrets | CD がある場合 |
| AWS SSM Parameter Store | ○ | SSM | 本番・チーム開発 |

### 学び

- Terraform と実態の乖離（drift）は `terraform plan` で必ず検出できる。apply 前に plan を読む習慣が重要
- `ignore_changes` は「Terraform に管理させない」という宣言であり、問題を解決するのではなく先送りにする
- secrets の管理場所は「一か所」に集約するのが原則。CD があるなら GitHub Secrets が自然な選択
