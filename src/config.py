import os
from dotenv import load_dotenv

load_dotenv()

def _require(key: str) -> str:
    value = os.getenv(key)
    if not value:
        raise ValueError(f"Missing required environment variable: {key}")
    return value

TELEGRAM_BOT_TOKEN = _require("TELEGRAM_BOT_TOKEN")
OPENAI_API_KEY = _require("OPENAI_API_KEY")
COSMOS_ENDPOINT = _require("COSMOS_ENDPOINT")
COSMOS_KEY = _require("COSMOS_KEY")
COSMOS_DATABASE = _require("COSMOS_DATABASE")
COSMOS_GRAPH = _require("COSMOS_GRAPH")
DYNAMODB_SESSION_TABLE = _require("DYNAMODB_SESSION_TABLE")
SQS_WORKER_QUEUE_URL = _require("SQS_WORKER_QUEUE_URL")
