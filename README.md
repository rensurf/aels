# AELS — Autonomous English Learning System

A Telegram bot that acts as a personal English teacher for Japanese speakers learning English. Unlike flashcard apps, it remembers your conversation history, grades your answers using GPT-4o, and schedules reviews using the SM-2 spaced repetition algorithm.

---

## Demo

```
You:  「承知しました」を英語で教えて
Bot:  Here are a few options depending on the context:
      • "Understood." — formal, widely used in business
      • "Got it." — casual, day-to-day
      • "Noted." — written communication, emails
      Want me to save any of these?

You:  "Got it" を保存して
Bot:  Saved! I'll quiz you on "Got it" in 1 day.

--- next day ---

Bot:  🇯🇵 承知しました
      How do you say this in English?

You:  Got it
Bot:  ✅ Correct! Next review in 6 days.
```

---

## Architecture

```
Telegram
   │
   ▼ HTTPS webhook
AWS API Gateway
   │
   ▼ invoke
AWS Lambda (Python 3.12)
   │
   ├─ TelegramAdapter      — parses incoming messages, routes to agent or quiz
   │
   ├─ TeacherAgent         — Microsoft Agent Framework + GPT-4o
   │      ├─ TranslateTool     JP→EN with multiple register options
   │      ├─ QATool            English grammar Q&A
   │      └─ MemoryTool        read/write phrases to graph DB
   │
   ├─ QuizFlow             — SM-2 spaced repetition review sessions
   │      ├─ SM2 Algorithm     calculates next review interval
   │      └─ GPT-4o Evaluator  grades free-text answers (correct/close/wrong)
   │
   ├─ AWS DynamoDB         — conversation session storage (multi-turn context)
   │
   └─ Azure CosmosDB (Gremlin API)
          — phrase knowledge graph
            (user) -[learned_phrase]-> (phrase {ease_factor, interval, due_date})
```

---

## Tech Stack

| Component | Technology | Version |
|---|---|---|
| Agent Framework | Microsoft Agent Framework | 1.2.1 |
| LLM | OpenAI GPT-4o | openai 2.32.0 |
| Interface | Telegram Bot | python-telegram-bot 22.7 |
| Graph DB | Azure CosmosDB (Gremlin API) | gremlinpython 3.8.1 |
| Session Storage | AWS DynamoDB | boto3 |
| Runtime | AWS Lambda | Python 3.12 |
| IaC | Terraform | azurerm ~> 4.70, aws ~> 5.0 |
| Testing | pytest + pytest-asyncio | pytest-asyncio 1.3.0 |

---

## Setup

### Prerequisites

- Python 3.12
- [`uv`](https://github.com/astral-sh/uv) package manager
- Terraform
- AWS CLI configured (`aws configure`)
- Azure CLI configured (`az login`)

### 1. Install dependencies

```bash
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt
```

### 2. Environment variables

```bash
cp .env.example .env
```

```bash
TELEGRAM_BOT_TOKEN=        # from BotFather
OPENAI_API_KEY=            # from platform.openai.com
COSMOS_ENDPOINT=           # wss://your-account.gremlin.cosmos.azure.com:443/
COSMOS_KEY=                # from Azure Portal
COSMOS_DATABASE=knowledge
COSMOS_GRAPH=main
DYNAMODB_SESSION_TABLE=aels-sessions
AWS_REGION=ap-southeast-2
```

### 3. Deploy infrastructure

```bash
cd infrastructure/terraform
terraform init
terraform plan
terraform apply
```

### 4. Set Telegram webhook

```bash
# Get the URL from Terraform output
terraform output webhook_url

# Register with Telegram
curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook \
  -d "url=<WEBHOOK_URL>/webhook"
```

### 5. Deploy Lambda

```bash
bash infrastructure/scripts/deploy.sh
```

---

## Running Tests

```bash
python -m pytest tests/unit/ -v
```

Test the agent interactively without Telegram or cloud infrastructure:

```bash
python test_agent_local.py "承知しました を英語で"
python test_agent_local.py "if possible と if I can の違いは？"
```
