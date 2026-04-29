Telegram や DynamoDB・CosmosDB を使わずに Teacher Agent をローカルで直接テストします。

## 実行手順

1. `src/agent/teacher_agent.py` の Agent 初期化コードを読み込んでください
2. 以下のモックを適用してください：
   - `src/session/client.py` の DynamoDB 読み書きをモック（空の messages を返す）
   - `src/tools/memory_tool.py` の Gremlin 読み書きをモック（空リストを返す）
   - OpenAI API は **モックしない**（実際に呼び出す）
3. コマンドライン引数 `$ARGUMENTS` のテキストを IncomingMessage として Agent に渡してください
4. Agent のレスポンスと、呼び出されたツール名をターミナルに出力してください

## 使用例

```
/agent-test 承知しました を英語で教えて
/agent-test if possible と if I can の違いは？
/agent-test 今日学んだフレーズを教えて
```

## 前提

- `.env` に `OPENAI_API_KEY` が設定されていること
- `pip install -r requirements.txt` 済みであること
