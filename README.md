# AELS - Autonomous English Learning System

A Telegram bot that acts as a personal English teacher for Japanese speakers living in Australia.

## Architecture

```
Telegram → API Gateway → Lambda
                              └─ TelegramAdapter
                                     └─ TeacherAgent (Microsoft Agent Framework + GPT-4o)
                                            ├─ TranslateTool  (JP→EN translation)
                                            ├─ QATool         (English Q&A)
                                            └─ MemoryTool     (phrase storage)
                                                    └─ Azure CosmosDB (Gremlin API)
                                     └─ SessionClient (DynamoDB)
```

## Tech Stack

| Component | Technology |
|---|---|
| Agent Framework | Microsoft Agent Framework 1.2.1 |
| LLM | OpenAI GPT-4o |
| Interface | Telegram Bot (python-telegram-bot 22.7) |
| Graph DB | Azure CosmosDB (Gremlin API) |
| Session Storage | AWS DynamoDB |
| Runtime | AWS Lambda (Python 3.12) |
| IaC | Terraform (AWS + Azure) |

## Setup

### 1. Prerequisites

- Python 3.12
- `uv` package manager
- Terraform
- AWS CLI configured
- Azure CLI configured

### 2. Install dependencies

```bash
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt
```

### 3. Environment variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

Required variables:
```bash
TELEGRAM_BOT_TOKEN=      # from BotFather
OPENAI_API_KEY=          # from platform.openai.com
COSMOS_ENDPOINT=         # wss://your-account.gremlin.cosmos.azure.com:443/
COSMOS_KEY=              # from Azure Portal
COSMOS_DATABASE=knowledge
COSMOS_GRAPH=main
DYNAMODB_SESSION_TABLE=aels-sessions
AWS_REGION=ap-southeast-2
```

### 4. Deploy infrastructure

```bash
cd infrastructure/terraform
terraform init
terraform plan
terraform apply
```

### 5. Set Telegram webhook

```bash
curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook \
  -d "url=<API_GATEWAY_URL>/webhook"
```

Get `API_GATEWAY_URL` from Terraform outputs:
```bash
terraform output webhook_url
```

### 6. Deploy Lambda

Package and upload `src/` to the Lambda function created by Terraform.

## Local Testing

Test the agent locally without Telegram or infrastructure:

```bash
python test_agent_local.py "承知しました を英語で"
python test_agent_local.py "if possible と if I can の違いは？"
```

## Running Tests

```bash
python -m pytest tests/unit/ -v
```

## Usage

Send messages to the bot on Telegram:

- Japanese text → receive English translation options
- English grammar question → receive explanation with examples
- "保存して" → save the phrase to your knowledge graph
- "最近学んだフレーズは？" → recall recent phrases
