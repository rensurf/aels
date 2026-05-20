# AELS — Autonomous English Learning System

[![CI](https://github.com/rensurf/aels/actions/workflows/ci.yml/badge.svg)](https://github.com/rensurf/aels/actions/workflows/ci.yml)

A Telegram bot that acts as a personal English teacher. It remembers phrases from your conversations, quizzes you using SM-2 spaced repetition, and grades your answers with GPT-4o.

---

## Demo

<video src="https://github.com/user-attachments/assets/af3cc37a-4dc2-4f25-af0a-c4f0aa9f8728" controls width="600"></video>

This demo shows the full learning loop:

1. Ask AELS how to say 「承知しました」 in English
2. Save "Got it" as a phrase
3. Trigger a review quiz
4. Answer with free text
5. Get GPT-4o evaluation and SM-2 scheduling

> Note: `/review` is used in the demo to trigger the review immediately. In normal use, reviews are scheduled automatically based on due dates.

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
- **Selective phrase saving** — after translation, choose which phrases to save via inline checkboxes; only selected ones are written to the knowledge graph
- **Pattern classification** — each saved phrase is automatically classified into a linguistic pattern (preposition, phrasal verb, collocation, formal/informal, tense, modal verb, article, verb pattern) using GPT-4o
- **Search memory** — recall past phrases by topic or keyword
- **Daily quiz** — proactive review at 8AM via EventBridge cron
- **On-demand review** — `/review` triggers a quiz session anytime
- **Session reset** — `/reset` clears conversation history when the context grows too long
- **SM-2 scheduling** — each phrase tracks `ease_factor`, `interval`, and `due_date`; correct answers push the interval out, wrong answers reset it; weakest phrases are prioritised in quiz order
- **GPT-4o evaluation** — free-text answers are graded as correct / close / wrong (handles paraphrasing)
- **Weakness analysis** — ask "what am I struggling with?" to get a breakdown of patterns with the lowest SM-2 ease_factor

---

## Architecture

```
Telegram
   │
   ▼ HTTPS webhook
AWS API Gateway
   │
   ▼ invoke
Lambda A — aels-teacher  (receiver, fast response)
   │
   ├─ /reset, /review commands — handled inline
   ├─ Inline button callbacks (phrase toggle / confirm / cancel)
   │      └─ AWS DynamoDB    — read/write pending_phrases, quiz_state, session
   │
   └─ Normal messages → SQS queue
                            │
                            ▼
                        Lambda B — aels-worker  (LLM processing)
                            │
                            ├─ TeacherAgent     — Microsoft Agent Framework + GPT-4o
                            │      ├─ TranslateTool   JP→EN with multiple register options
                            │      ├─ QATool          English grammar Q&A
                            │      ├─ MemoryTool      read/write phrases + classify patterns
                            │      └─ WeaknessTool    aggregate SM-2 ease_factor by pattern
                            │
                            ├─ QuizFlow         — SM-2 spaced repetition review sessions
                            │      ├─ SM2 Algorithm     calculates next review interval
                            │      └─ GPT-4o Evaluator  grades free-text answers
                            │
                            └─ AWS DynamoDB     — session (turn_count, messages), pending_phrases

AWS DynamoDB
   — session storage: conversation history, turn count, pending phrases, quiz state

Azure CosmosDB (Gremlin API)
   — phrase knowledge graph
     (user) -[learned_phrase]-> (phrase {ease_factor, interval, due_date})
                                    └─[uses_pattern]→ (pattern {name})

EventBridge (cron 8AM AEST) → aels-quiz-scheduler Lambda
                                   └─ fetches due phrases → sends first question
```

---

## Key Engineering Decisions

**Why a graph database instead of relational?**

Phrases have relationships that go beyond rows and foreign keys. Each phrase is linked to a linguistic pattern node via a `uses_pattern` edge, and SM-2 data lives on the `learned_phrase` edge itself. Weakness analysis works by traversing `user → learned_phrase edge (ease_factor) → phrase → uses_pattern → pattern` and aggregating — a query that maps naturally to graph traversal. CosmosDB's Gremlin API gives managed, scalable graph storage without running infrastructure.

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

- **verb_pattern review** — phrases tagged as `verb_pattern` are reviewed individually like other patterns; set-based review (e.g. "list all complement structures for 'suggest'") requires a separate quiz mode and verb-centric graph structure, not yet implemented
- **No observability** — logging is CloudWatch only; no structured tracing or alerting

---

## Next Steps

- Weekly weakness report sent via Telegram — surface the patterns with the most struggling phrases
- verb_pattern set-based review — quiz the full range of complement structures for a single verb
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
