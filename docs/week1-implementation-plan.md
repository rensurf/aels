# Week 1 Implementation Plan

## Overview

This document breaks down Week 1 into **actionable tasks** with a clear implementation order.

**Goal**: By end of Week 1, you can open Telegram and talk to your English teacher.

---

## Directory Structure

```
aels/
├── docs/
│   ├── aels-v2-plan.md                    # Overall design doc
│   ├── week1-architecture.md              # Week 1 architecture (this)
│   └── week1-implementation-plan.md       # Week 1 tasks (this)
│
├── infrastructure/
│   ├── terraform/
│   │   ├── main.tf                        # Root module
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   ├── modules/
│   │   │   ├── aws/
│   │   │   │   ├── lambda.tf              # Lambda function
│   │   │   │   ├── api_gateway.tf         # API Gateway for webhook
│   │   │   │   └── iam.tf                 # IAM roles
│   │   │   └── azure/
│   │   │       ├── cosmosdb.tf            # CosmosDB account + Gremlin
│   │   │       └── resource_group.tf
│   │   └── environments/
│   │       └── dev/
│   │           └── terraform.tfvars
│   └── scripts/
│       └── init_graph_schema.py           # Initial graph setup
│
├── src/
│   ├── main.py                            # Lambda handler entry point
│   ├── adapters/
│   │   ├── __init__.py
│   │   ├── telegram_adapter.py            # Telegram webhook handler
│   │   └── message_types.py               # IncomingMessage, OutgoingMessage
│   ├── agent/
│   │   ├── __init__.py
│   │   ├── teacher_agent.py               # Microsoft Agent Framework setup
│   │   └── prompts.py                     # System prompts
│   ├── tools/
│   │   ├── __init__.py
│   │   ├── translate_tool.py              # JP→EN translation
│   │   ├── qa_tool.py                     # English Q&A
│   │   └── memory_tool.py                 # Graph read/write
│   ├── graph/
│   │   ├── __init__.py
│   │   ├── client.py                      # Gremlin client wrapper
│   │   ├── models.py                      # PhraseNode, UserNode dataclasses
│   │   └── queries.py                     # Gremlin query builders
│   └── config.py                          # Environment variable loading
│
├── tests/
│   ├── unit/
│   │   ├── test_telegram_adapter.py
│   │   ├── test_translate_tool.py
│   │   ├── test_memory_tool.py
│   │   └── test_gremlin_queries.py
│   └── integration/
│       └── test_end_to_end.py             # Full flow test
│
├── requirements.txt                       # Python dependencies
├── pyproject.toml                         # Poetry config (optional)
├── .env.example                           # Example environment variables
├── .gitignore
└── README.md
```

---

## Implementation Order

### Phase 0: Setup (Day 0)

**Before writing any bot code, validate the stack:**

- [x] **Task 0.1**: Create Telegram bot via BotFather
  - Get bot token
  - Test with curl: `curl https://api.telegram.org/bot<TOKEN>/getMe`

- [x] **Task 0.2**: Get OpenAI API key
  - Sign up / get key from platform.openai.com
  - Test with simple completion call

- [x] **Task 0.3**: Microsoft Agent Framework "Hello World"
  - Create minimal agent that responds to text
  - Validate framework setup before integrating with bot
  - Reference: https://github.com/microsoft/agent-framework

- [x] **Task 0.4**: Project structure setup
  - Create directory structure
  - `requirements.txt` with initial dependencies:
    ```
    python-telegram-bot==22.7
    openai==2.32.0
    gremlinpython==3.8.1
    agent-framework==1.2.1  # Microsoft Agent Framework
    python-dotenv==1.0.0
    pytest==8.0.0
    pytest-asyncio==1.3.0
    ```
  - Install with uv (not pip):
    ```bash
    uv venv
    source .venv/bin/activate
    uv pip install -r requirements.txt
    ```

---

### Phase 1: Infrastructure (Day 1-2)

**Goal**: Get CosmosDB and Lambda running

- [x] **Task 1.1**: Terraform - Azure resources
  - `infrastructure/terraform/modules/azure/cosmosdb.tf`
  - Create CosmosDB account with Gremlin API
  - Create database `knowledge`
  - Create graph `main`
  - Apply and verify in Azure Portal

- [x] **Task 1.2**: Terraform - AWS resources
  - `infrastructure/terraform/modules/aws/lambda.tf`
  - Create Lambda function (Python 3.12)
  - Create IAM role with CloudWatch logs permission
  - Package deployment: initially just `def lambda_handler(event, context): return {"statusCode": 200}`

- [x] **Task 1.3**: Terraform - API Gateway
  - `infrastructure/terraform/modules/aws/api_gateway.tf`
  - Create HTTP API
  - Route `POST /webhook` → Lambda
  - Get webhook URL from output

- [x] **Task 1.4**: Connect Telegram webhook
  - Set webhook: `curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook -d "url=<API_GATEWAY_URL>"`
  - Test: Send message to bot → should trigger Lambda → check CloudWatch logs

- [x] **Task 1.5**: Test CosmosDB connection
  - Write `infrastructure/scripts/init_graph_schema.py`
  - Connect to CosmosDB via Gremlin
  - Create a test vertex and query it back
  - Verify connection works

- [x] **Task 1.6**: Terraform - DynamoDB for session storage
  - `infrastructure/terraform/modules/aws/dynamodb.tf`
  - Create DynamoDB table: `aels-sessions`
  - Schema: `chat_id` (PK, String), `messages`, `pending_choices`, `last_activity`, `ttl`
  - Enable TTL on `ttl` attribute (24時間で自動削除)
  - Verify read/write with AWS CLI or boto3 script

**Deliverable**: Infrastructure fully provisioned, webhook receives messages, CosmosDB accessible, DynamoDB session table ready

---

### Phase 2: Core Components (Day 3-4)

**Goal**: Build the foundational code (no agent yet)

- [ ] **Task 2.1**: Message types
  - `src/adapters/message_types.py`
  - Define `IncomingMessage` and `OutgoingMessage` dataclasses
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
  ```

- [ ] **Task 2.2**: Telegram adapter
  - `src/adapters/telegram_adapter.py`
  - `TelegramAdapter.receive(update: dict) -> IncomingMessage`
  - `TelegramAdapter.send(message: OutgoingMessage, chat_id: str) -> None`
  - Use `python-telegram-bot` library

- [ ] **Task 2.3**: Session storage client
  - `src/session/client.py`
  - `load_session(chat_id: str) -> list[dict]` — DynamoDB から会話履歴を取得
  - `save_session(chat_id: str, messages: list[dict]) -> None` — 更新後の履歴を書き戻す（TTL を24時間に設定）
  - `clear_session(chat_id: str) -> None` — 会話リセット用

- [ ] **Task 2.4**: Gremlin client wrapper
  - `src/graph/client.py`
  - Wrap `gremlinpython` client
  - Load connection details from env vars
  - Connection pooling / retry logic

- [ ] **Task 2.5**: Graph models
  - `src/graph/models.py`
  - Dataclasses for `UserNode`, `PhraseNode`
  - Helper methods to convert to/from Gremlin vertex properties

- [ ] **Task 2.6**: Gremlin query builders
  - `src/graph/queries.py`
  - `create_user(user_id, name, goal) -> Traversal`
  - `create_phrase(phrase_id, text, japanese, context, note) -> Traversal`
  - `link_user_to_phrase(user_id, phrase_id) -> Traversal`
  - `search_phrases(user_id, query_text) -> list[PhraseNode]`
  - `get_recent_phrases(user_id, limit) -> list[PhraseNode]`

**Deliverable**: Can receive Telegram messages, parse them, and write/read from CosmosDB

---

### Phase 3: Agent + Tools (Day 5-6)

**Goal**: Make the teacher smart

- [ ] **Task 3.1**: TranslateTool
  - `src/tools/translate_tool.py`
  - Takes Japanese text → calls GPT-4o → returns structured translation options
  - Use OpenAI function calling / structured outputs
  - Output format:
  ```python
  [
    {
      "phrase": "Got it",
      "context": "casual",
      "note": "Common in Australian workplaces"
    },
    {
      "phrase": "Understood",
      "context": "formal",
      "note": "Professional setting"
    }
  ]
  ```

- [ ] **Task 3.2**: QATool
  - `src/tools/qa_tool.py`
  - Takes English question → calls GPT-4o → returns explanation
  - Examples:
    - "if possible と if I can の違いは？"
    - "なんで I'm blocked by じゃダメなの？"

- [ ] **Task 3.3**: MemoryTool
  - `src/tools/memory_tool.py`
  - `save_phrases(phrases: list[dict], user_id: str)`
    - Creates phrase nodes in graph
    - Links to user with `learned_phrase` edge
  - `search_phrases(query: str, user_id: str) -> list[Phrase]`
    - Searches graph for matching phrases
  - `get_recent_phrases(user_id: str, limit: int) -> list[Phrase]`

- [ ] **Task 3.4**: Teacher Agent
  - `src/agent/teacher_agent.py`
  - Initialize Microsoft Agent Framework agent
  - System prompt from `src/agent/prompts.py`
  - Register tools: TranslateTool, QATool, MemoryTool
  - Entry point: `async def handle_message(incoming: IncomingMessage) -> OutgoingMessage`

- [ ] **Task 3.5**: Lambda handler integration
  - `src/main.py`
  - `lambda_handler(event, context)`:
    1. Parse Telegram webhook → IncomingMessage
    2. 即座に `sendMessage("考えています...")` を送信（ADR-018）
    3. DynamoDB から `chat_id` で会話履歴（messages）を取得
    4. messages を Agent Framework session に注入して `teacher_agent.handle_message()` を呼び出す
    5. 更新した messages を DynamoDB に書き戻す
    6. `editMessageText` で「考えています...」を最終応答に書き換え
  - Lambda timeout: 29秒に設定

**Deliverable**: Full conversation flow works end-to-end

---

### Phase 4: Polish (Day 7)

**Goal**: Make it production-ready

- [ ] **Task 4.1**: Error handling
  - Lambda try/catch with proper logging
  - Graceful degradation if CosmosDB is down
  - User-friendly error messages in Telegram

- [ ] **Task 4.2**: Unit tests
  - `tests/unit/test_telegram_adapter.py`: Test message parsing
  - `tests/unit/test_translate_tool.py`: Mock GPT-4o responses
  - `tests/unit/test_memory_tool.py`: Mock Gremlin queries
  - `tests/unit/test_gremlin_queries.py`: Test query building logic
  - Target: >80% coverage on core logic

- [ ] **Task 4.3**: Integration test
  - `tests/integration/test_end_to_end.py`
  - Use test CosmosDB instance
  - Send mock webhook → verify response → check graph state

- [ ] **Task 4.4**: Environment configuration
  - `.env.example` with all required variables
  - `src/config.py` to load and validate env vars
  - Terraform outputs for easy copy-paste

- [ ] **Task 4.5**: Documentation
  - `README.md`:
    - How to deploy infrastructure
    - How to set up Telegram bot
    - How to test locally
    - How to deploy Lambda
  - Architecture diagram (optional but recommended)

- [ ] **Task 4.6**: Cost monitoring
  - Add CloudWatch billing alert
  - Log CosmosDB RU consumption
  - Verify weekly cost < $1

**Deliverable**: Production-ready Week 1 system

---

## Testing Strategy

### Local Development

**Option 1: ngrok for local testing**
```bash
# Run Lambda locally with AWS SAM
sam local start-api

# Expose to internet
ngrok http 3000

# Set Telegram webhook to ngrok URL
curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook \
  -d "url=https://abc123.ngrok.io/webhook"
```

**Option 2: Mock Telegram updates**
```python
# tests/integration/test_end_to_end.py
def test_translation_flow():
    update = {
        "message": {
            "text": "承知しました を英語で",
            "from": {"id": 12345},
            "message_id": 1,
            "date": 1234567890
        }
    }

    response = lambda_handler({"body": json.dumps(update)}, {})

    assert response["statusCode"] == 200
    # Verify phrase saved in graph
```

### Cloud Testing

After deploying to AWS:
1. Send message to bot on Telegram
2. Check CloudWatch logs for Lambda execution
3. Query CosmosDB to verify phrase was saved
4. Ask bot "did I learn X?" → should recall it

---

## Dependencies

### Python Packages

```txt
# Core
python-telegram-bot==22.7
openai==2.32.0
gremlinpython==3.8.1
agent-framework==1.2.1  # Microsoft Agent Framework
python-dotenv==1.0.0

# Testing
pytest==8.0.0
pytest-asyncio==1.3.0
pytest-cov==4.1.0
pytest-mock==3.12.0

# Utilities
pydantic==2.6.0  # For data validation
tenacity==8.2.3  # For retry logic
```

### pyproject.toml (pytest-asyncio 1.x 必須設定)

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
```

### Terraform Providers

```hcl
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.70"
    }
  }
}
```

---

## Environment Variables

`.env.example`:
```bash
# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token_here

# OpenAI
OPENAI_API_KEY=your_openai_key_here

# Azure CosmosDB
COSMOS_ENDPOINT=wss://your-account.gremlin.cosmos.azure.com:443/
COSMOS_KEY=your_cosmos_key_here
COSMOS_DATABASE=knowledge
COSMOS_GRAPH=main

# DynamoDB (Session Storage)
DYNAMODB_SESSION_TABLE=aels-sessions

# AWS (for local testing)
AWS_REGION=ap-southeast-2
AWS_PROFILE=your-profile

# Application
LOG_LEVEL=INFO
```

---

## Day-by-Day Breakdown

| Day | Focus | Deliverable |
|---|---|---|
| Day 0 | Setup & validation | Bot token, OpenAI key, Agent framework "hello world" |
| Day 1 | Azure infrastructure | CosmosDB running, can connect via Gremlin |
| Day 2 | AWS infrastructure | Lambda + API Gateway, webhook connected |
| Day 3 | Core components | Message types, adapters, graph queries |
| Day 4 | Tools | TranslateTool, QATool, MemoryTool working |
| Day 5 | Agent integration | Teacher Agent using tools, multi-turn conversation |
| Day 6 | End-to-end flow | Full conversation flow works on Telegram |
| Day 7 | Polish & testing | Tests pass, error handling, documentation |

---

## Success Checklist

### Functional
- [ ] Send "承知しました を英語で" → receive multiple options
- [ ] Reply "両方保存" → both saved to graph
- [ ] Ask "blocked on って前に聞いた？" → bot recalls if previously saved
- [ ] Ask "if possible と if I can の違いは？" → receive explanation
- [ ] Conversation maintains context across multiple messages

### Technical
- [ ] Terraform `apply` succeeds for both AWS and Azure
- [ ] Lambda responds to webhook within 3 seconds (cold start: 10s acceptable)
- [ ] Gremlin queries execute without errors
- [ ] Unit test coverage >80%
- [ ] Integration test passes
- [ ] CloudWatch logs show no errors

### Cost
- [ ] Weekly AWS cost < $0.50
- [ ] Weekly Azure cost < $0.50
- [ ] Total < $1/week

---

## Potential Blockers & Solutions

### Blocker 1: CosmosDB Gremlin syntax unfamiliar
**Solution**:
- Start with official examples: https://learn.microsoft.com/en-us/azure/cosmos-db/gremlin/
- Use CosmosDB Data Explorer to test queries interactively
- Keep Week 1 queries simple (single-hop only)

### Blocker 2: Microsoft Agent Framework not working as expected
**Solution**:
- Fall back to direct OpenAI API calls with function calling
- Revisit framework in Week 2 after v1 works

### Blocker 3: Lambda cold start too slow
**Solution**:
- Accept 10s delay for Week 1
- Add provisioned concurrency in Week 2 if needed (costs more)

### Blocker 4: Telegram webhook timing out (30s limit)
**Solution** (ADR-018で決定済み):
- 受信直後に `sendMessage("考えています...")` を送信して即時応答
- Lambda timeout を 29 秒に設定して同期処理
- 処理完了後に `editMessageText` で最終応答に書き換え
- 29 秒を超えるようであれば Lambda async invoke パターンへの移行を検討

---

## Next Steps

After completing Week 1:

1. **Use it for a few days** - Validate the "先生" feeling works
2. **Check the data** - Look at the graph, see what's being saved
3. **Identify gaps** - What's missing? What feels awkward?
4. **Then start Week 2** - Spaced repetition scheduler

Week 1 is about **validating the core experience**. Don't rush to Week 2 until you've actually used Week 1 enough to know it's working.
