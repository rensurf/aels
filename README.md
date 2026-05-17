# AELS — Autonomous English Learning System

A Telegram bot that acts as a personal English teacher. It remembers phrases from your conversations, quizzes you using SM-2 spaced repetition, and grades your answers with GPT-4o.

---

## Demo

<video src="assets/demo.mp4" controls width="600"></video>

---

## Why I built this

I had already built v1 of this project: an MCP-based phrase saver. It worked. I stopped using it within weeks.

The failure wasn't technical. I had built a tool, not a product. I designed the save feature but never designed the experience of actually sticking with it. Phrases piled up with no review. Notifications arrived with no habit behind them.

v2 starts from the opposite direction. Before writing any code, I asked: *why didn't I keep using v1?* The answer was that the tool waited for me — I had to go to it. So v2 comes to me. It messages me for reviews. It remembers what I struggled with. It quizzes me on phrases I saved days ago.

The goal isn't a smarter flashcard app. It's a teacher that shows up.

---

## What it can do today

- **Translate** — ask in Japanese, get multiple English options with context notes
- **Q&A** — ask about grammar, nuance, or usage in natural language
- **Save phrases** — the teacher saves phrases to a graph database during conversation
- **Search memory** — recall past phrases by topic or keyword
- **Daily quiz** — proactive review at 8AM via EventBridge cron
- **On-demand review** — `/review` triggers a quiz session anytime
- **SM-2 scheduling** — each phrase tracks `ease_factor`, `interval`, and `due_date`; correct answers push the interval out, wrong answers reset it
- **GPT-4o evaluation** — free-text answers are graded as correct / close / wrong (handles paraphrasing)

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

EventBridge (cron 8AM AEST) → Quiz Scheduler Lambda
                                   └─ fetches due phrases → sends first question
```

---

## Key Engineering Decisions

**Why a graph database instead of relational?**
Phrases have relationships — a phrase can belong to multiple topics, link to related phrases, and connect to a user's learning history. Graph traversal makes queries like "find phrases related to what I'm struggling with" natural. CosmosDB's Gremlin API gives managed, scalable graph storage without running infrastructure.

**Why SM-2 for review scheduling?**
SM-2 is the algorithm behind Anki. It tracks per-phrase `ease_factor`, `interval`, and `repetitions`, and adjusts how soon you see a phrase again based on how well you answered. Correct answers push the interval out exponentially; wrong answers reset it. This concentrates review time where it's actually needed.

**Why Agent Framework instead of raw API calls?**
The agent pattern cleanly separates concerns: the `Client` handles the LLM API, the `Agent` defines instructions and tools, and the `Session` holds conversation history. Swapping GPT-4o for another model only requires changing the `Client`. Tool functions are plain Python — no special decorators, just type annotations and docstrings that become the schema.

**Why AWS Lambda instead of a server?**
A Telegram bot has bursty, unpredictable traffic. Lambda scales to zero when idle (cost: $0), and scales out instantly on demand. The 29-second timeout is set to match Telegram's 30-second webhook deadline.

**Why split AWS and Azure?**
AWS Lambda + DynamoDB for compute and sessions (region: ap-southeast-2). Azure CosmosDB for the graph because the Gremlin API is unique to CosmosDB — no equivalent in AWS. Terraform manages both providers in one `apply`.

---

## Tech Stack

| Component | Technology |
|---|---|
| Agent Framework | Microsoft Agent Framework 1.2.1 |
| LLM | OpenAI GPT-4o |
| Interface | Telegram Bot |
| Graph DB | Azure CosmosDB (Gremlin API) |
| Session Storage | AWS DynamoDB |
| Runtime | AWS Lambda + Python 3.12 |
| IaC | Terraform (azurerm + aws) |
| CI | GitHub Actions (ruff + mypy + pytest) |

---

## Current Limitations

- **Shallow graph usage** — phrases and SM-2 data are stored, but pattern relationships (e.g. "blocked on / depends on / work on → same preposition pattern") are not yet modelled as graph nodes
- **Single user** — user routing assumes one user; multi-user support requires session isolation
- **No observability** — logging is CloudWatch only; no structured tracing or alerting

---

## Next Steps

- Add `mistake_pattern` nodes to the graph to surface recurring error patterns
- Weakness analysis report sent weekly via Telegram
- Teaching style adaptation based on conversation history

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
terraform output webhook_url

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
uv run pytest tests/unit/ -v
```

Test the agent locally without Telegram or cloud infrastructure:

```bash
python test_agent_local.py "承知しました を英語で"
python test_agent_local.py "if possible と if I can の違いは？"
```
