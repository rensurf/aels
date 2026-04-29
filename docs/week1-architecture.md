# Week 1 Architecture: Foundation + Teacher Skeleton

## Overview

Week 1 delivers a **working English teacher bot on Telegram** with basic conversation capabilities and minimal memory.

### What works by end of Week 1:
- User sends Japanese text → Teacher replies with English translation + explanation
- User asks English questions → Teacher answers
- Teacher remembers phrases in the knowledge graph
- Teacher can recall past phrases ("You asked about this before")

### What doesn't work yet:
- Spaced repetition quiz (Week 2)
- Weakness analysis (Week 3)
- Proactive suggestions (Week 3)
- Advanced agent behaviors (Week 3-4)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                            User                                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ Telegram
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AWS Lambda                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Telegram Adapter                              │  │
│  │  • Receives webhook                                        │  │
│  │  • 即座に sendMessage("考えています...") を送信            │  │
│  │  • 処理完了後 editMessageText で最終応答に書き換え         │  │
│  └──────────────┬──────────────────────────────────────────┘  │
│                 │                                               │
│  ┌──────────────▼──────────────────────────────────────────┐  │
│  │              Session Storage Client                       │  │
│  │  • chat_id で会話履歴(messages)を DynamoDB から取得       │  │
│  │  • Agent Framework session に注入                         │  │
│  │  • 応答後に更新した messages を書き戻す                   │  │
│  └──────────────┬──────────────────────────────────────────┘  │
│                 │                                               │
│  ┌──────────────▼──────────────────────────────────────────┐  │
│  │              Teacher Agent                                │  │
│  │  • Powered by Microsoft Agent Framework                  │  │
│  │  • 注入された messages でマルチターン会話を維持           │  │
│  │  • Routes to appropriate tool                            │  │
│  │  • LLM: GPT-4o                                           │  │
│  └──────────────┬──────────────────────────────────────────┘  │
│                 │                                               │
│  ┌──────────────▼──────────────────────────────────────────┐  │
│  │              Agent Tools                                  │  │
│  │  • TranslateTool (JP→EN)                                 │  │
│  │  • QATool (English questions)                            │  │
│  │  • MemoryTool (save/recall phrases)                      │  │
│  └──────────────┬──────────────────────────────────────────┘  │
└─────────────────┼───────────────────────────────────────────────┘
                  │
        ┌─────────┴──────────┐
        │ Gremlin queries    │ boto3 (session read/write)
        ▼                    ▼
┌────────────────┐  ┌────────────────────────────────┐
│  Azure         │  │  AWS DynamoDB                  │
│  CosmosDB      │  │  table: aels-sessions          │
│  (Gremlin API) │  │  • chat_id (PK)                │
│  長期記憶       │  │  • messages (会話履歴)          │
│  フレーズ保存   │  │  • pending_choices             │
│  グラフ構造     │  │  • TTL: 24時間                 │
└────────────────┘  └────────────────────────────────┘
```

---

## Data Flow

### Flow 1: Japanese → English translation

```
1. User: "承知しました を英語で"
   ↓
2. Telegram → Lambda (webhook)
   ↓
3. TelegramAdapter.receive()
   → IncomingMessage(text="承知しました を英語で", user_id="12345")
   ↓
4. TeacherAgent.handle(message)
   → Agent decides to use TranslateTool
   ↓
5. TranslateTool.execute(text="承知しました")
   → Calls GPT-4o with translation prompt
   → Returns: [
       {"phrase": "Got it", "context": "casual", "note": "..."},
       {"phrase": "Understood", "context": "formal", "note": "..."}
     ]
   ↓
6. Agent asks user: "どれを保存する？"
   ↓
7. User: "両方"
   ↓
8. MemoryTool.save_phrases([...])
   → Gremlin: Creates phrase nodes + relationships
   ↓
9. Agent: "保存しました。オーストラリアの職場では Got it がよく使われますよ"
   ↓
10. TelegramAdapter.send(OutgoingMessage)
   → Telegram API call
```

### Flow 2: Recalling past phrases

```
1. User: "blocked on って前に聞いた？"
   ↓
2. Agent → MemoryTool.search_phrases("blocked on")
   ↓
3. Gremlin query:
   g.V().hasLabel('phrase')
        .has('text', containing('blocked on'))
        .where(in('learned_phrase').has('user_id', '12345'))
   ↓
4. Returns: [PhraseNode(text="I'm blocked on this", saved_at="2026-04-15")]
   ↓
5. Agent: "はい、4月15日に聞きました。'I'm blocked on this' を保存しています"
```

---

## Components

### 1. Telegram Adapter

**Responsibility**: Convert between Telegram API format and internal message format

```python
class TelegramAdapter:
    def receive(self, telegram_update: dict) -> IncomingMessage:
        """Convert Telegram update to internal format"""

    def send(self, message: OutgoingMessage) -> None:
        """Send message via Telegram Bot API"""
```

**Message types:**
```python
@dataclass
class IncomingMessage:
    text: str
    user_id: str
    message_id: str
    timestamp: datetime

@dataclass
class OutgoingMessage:
    text: str
    style: Literal["explanation", "question", "confirmation"]
    choices: list[str] | None  # For future quiz support
```

### 2. Session Storage Client

**Responsibility**: Lambda をまたいだ短期会話状態の永続化（ADR-017参照）

Agent Framework の `session` はインメモリのため Lambda 実行終了で消える。
DynamoDB を使って `chat_id` ↔ 会話履歴を保持し、次の webhook 呼び出し時に復元する。

```python
class SessionClient:
    def load_session(self, chat_id: str) -> list[dict]:
        """DynamoDB から会話履歴を取得。未存在なら空リストを返す"""

    def save_session(self, chat_id: str, messages: list[dict]) -> None:
        """更新した会話履歴を書き戻す。TTL を現在時刻 + 24時間で設定"""

    def clear_session(self, chat_id: str) -> None:
        """会話リセット用"""
```

**DynamoDB スキーマ:**
```
table: aels-sessions
  chat_id       (PK, String)  — Telegram の chat_id
  messages      (List)        — 直近の会話履歴 [{role, content}, ...]
  pending_choices (List)      — 保存待ちフレーズ候補
  last_activity (String)      — ISO8601
  ttl           (Number)      — Unix timestamp（24時間後）
```

**Lambda ハンドラーでの使用パターン:**
```python
async def lambda_handler(event, context):
    # 1. 即時 ack
    await telegram.send_message(chat_id, "考えています...")

    # 2. セッション復元
    messages = session_client.load_session(chat_id)

    # 3. Agent 実行（messages を session に注入）
    session = await agent.create_session()
    session.inject_history(messages)
    result = await agent.run(incoming.text, session=session)

    # 4. セッション保存
    session_client.save_session(chat_id, session.messages)

    # 5. 応答を反映
    await telegram.edit_message(chat_id, message_id, result.text)
```

---

### 3. Teacher Agent

**Responsibility**: Orchestrate conversation and tool usage

**Framework**: Microsoft Agent Framework
- Maintains multi-turn conversation context
- Decides which tool to call based on user intent
- Composes natural responses

**Agent Configuration:**
```python
from agent_framework import Agent
from agent_framework.openai import OpenAIChatClient

# Define tool functions
def translate_japanese(
    text: str,
    context: str | None = None
) -> list[dict]:
    """Translate Japanese to English with multiple options"""
    # Implementation here
    pass

def answer_english_question(question: str) -> str:
    """Answer questions about English grammar, usage, and nuances"""
    # Implementation here
    pass

def save_phrase(phrase: str, japanese: str, context: str, note: str) -> str:
    """Save a learned phrase to the knowledge graph"""
    # Implementation here
    pass

def search_phrases(query: str) -> list[dict]:
    """Search for previously learned phrases"""
    # Implementation here
    pass

# Initialize agent
agent = Agent(
    client=OpenAIChatClient(model="gpt-4o"),
    instructions="""
    You are Ren's personal English teacher.

    Your goal: Help him work in Australia as a software engineer.

    Your capabilities:
    - Translate Japanese to English (provide multiple options with context)
    - Answer English questions (nuances, grammar, usage)
    - Remember phrases he's learned before

    Your personality:
    - Friendly but professional
    - Context-aware (work vs casual situations)
    - Remember past conversations
    """,
    tools=[translate_japanese, answer_english_question, save_phrase, search_phrases]
)
```

### 3. Agent Tools

#### TranslateTool
```python
class TranslateTool:
    """Translate Japanese to English with context"""

    async def execute(self, text: str, context: str | None) -> list[TranslationOption]:
        # Calls GPT-4o with structured output
        # Returns multiple options with usage notes
```

#### QATool
```python
class QATool:
    """Answer English-related questions"""

    async def execute(self, question: str) -> str:
        # Handles questions like:
        # - "if possible と if I can の違いは？"
        # - "なんでこの言い方はダメなの？"
```

#### MemoryTool
```python
class MemoryTool:
    """Save and recall phrases from knowledge graph"""

    async def save_phrases(self, phrases: list[Phrase], user_id: str) -> None:
        # Creates phrase nodes in CosmosDB

    async def search_phrases(self, query: str, user_id: str) -> list[Phrase]:
        # Searches existing phrases via Gremlin

    async def get_recent_phrases(self, user_id: str, limit: int = 5) -> list[Phrase]:
        # Gets recently saved phrases
```

---

## Knowledge Graph Schema (Week 1 Minimal)

### Node Types

#### User Node
```
Label: user
Properties:
  - user_id: string (primary key)
  - telegram_id: string
  - name: string
  - goal: string (e.g., "Work in Australia")
  - created_at: datetime
```

#### Phrase Node
```
Label: phrase
Properties:
  - phrase_id: string (UUID)
  - text: string (the English phrase)
  - japanese: string (original Japanese)
  - context: string (e.g., "workplace", "casual", "formal")
  - note: string (usage note)
  - created_at: datetime
```

### Edge Types

```
(user) -[learned_phrase]-> (phrase)
Properties:
  - learned_at: datetime
```

### Week 1 Limitations (Intentional)
- No error pattern nodes yet (Week 3)
- No relationship between phrases (Week 3)
- No SM-2 properties yet (Week 2)
- No session summary nodes yet (Week 3)

---

## Infrastructure (Terraform)

### AWS Resources

```hcl
# Lambda function for bot
resource "aws_lambda_function" "teacher_bot" {
  function_name = "aels-teacher-bot"
  runtime       = "python3.12"
  handler       = "main.lambda_handler"
  timeout       = 30

  environment {
    variables = {
      TELEGRAM_BOT_TOKEN = var.telegram_bot_token
      COSMOS_ENDPOINT    = var.cosmos_endpoint
      COSMOS_KEY         = var.cosmos_key
      OPENAI_API_KEY     = var.openai_api_key
    }
  }
}

# API Gateway for Telegram webhook
resource "aws_apigatewayv2_api" "telegram_webhook" {
  name          = "aels-telegram-webhook"
  protocol_type = "HTTP"
}
```

### Azure Resources

```hcl
# CosmosDB account
resource "azurerm_cosmosdb_account" "aels" {
  name                = "aels-knowledge-graph"
  resource_group_name = azurerm_resource_group.aels.name
  location            = "Australia East"
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"

  capabilities {
    name = "EnableGremlin"
  }

  consistency_policy {
    consistency_level = "Session"
  }

  geo_location {
    location          = "Australia East"
    failover_priority = 0
  }
}

# Gremlin database
resource "azurerm_cosmosdb_gremlin_database" "knowledge" {
  name                = "knowledge"
  resource_group_name = azurerm_cosmosdb_account.aels.resource_group_name
  account_name        = azurerm_cosmosdb_account.aels.name
  throughput          = 400  # Minimal for dev
}

# Gremlin graph
resource "azurerm_cosmosdb_gremlin_graph" "main" {
  name                = "main"
  resource_group_name = azurerm_cosmosdb_account.aels.resource_group_name
  account_name        = azurerm_cosmosdb_account.aels.name
  database_name       = azurerm_cosmosdb_gremlin_database.knowledge.name
  partition_key_path  = "/user_id"
  throughput          = 400

  index_policy {
    automatic      = true
    indexing_mode  = "consistent"
    included_paths = ["/*"]
    excluded_paths = ["/\"_etag\"/?"]
  }
}
```

---

## What's NOT in Week 1

To keep scope tight and ship quickly:

❌ **Spaced repetition scheduler** (Week 2)
❌ **Quiz delivery** (Week 2)
❌ **Weakness analysis** (Week 3)
❌ **Pattern connection** (Week 3)
❌ **Curriculum planning** (Week 4)
❌ **Teaching style adaptation** (Week 4)

Week 1 delivers: **A teacher you can talk to, who remembers what you learned.**

That alone is valuable and testable.

---

## Success Criteria for Week 1

### Functional
- [ ] User can send Japanese → receive English options
- [ ] User can ask English questions → receive answers
- [ ] User can save phrases → they appear in the graph
- [ ] User can ask "did I learn X before?" → teacher recalls it
- [ ] Conversation context is maintained (multi-turn works)

### Technical
- [ ] Terraform deploys all infrastructure successfully
- [ ] Lambda が `sendMessage("考えています...")` を 3 秒以内に送信し、最終応答を 29 秒以内に `editMessageText` で返す
- [ ] Gremlin queries execute without errors
- [ ] Agent Framework handles tool calls correctly
- [ ] Error logging works (CloudWatch)

### Cost
- [ ] Weekly cost < $1 (CosmosDB 400 RU/s + Lambda + API Gateway)

---

## Risk Mitigation

### Risk 1: Microsoft Agent Framework learning curve
**Mitigation**: Build a "Hello World" agent first (Day 0) before integrating with the bot

### Risk 2: CosmosDB Gremlin query complexity
**Mitigation**: Keep Week 1 queries extremely simple (single-hop only)

### Risk 3: Lambda cold start latency
**Mitigation**: 受信直後に `sendMessage("考えています...")` を送信するため、コールドスタートの遅延はユーザー体験に影響しない。Lambda timeout を 29 秒に設定し、その範囲内で処理を完了させる（ADR-018参照）。

### Risk 4: GPT-4o cost
**Mitigation**: Track token usage. Set budget alert at $10/month.

---

## Next: Implementation Plan

This architecture document defines **what** we're building.

Next document will define **how** to build it:
- Directory structure
- Task breakdown
- Day-by-day implementation order
