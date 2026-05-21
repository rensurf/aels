import os

os.environ.setdefault("TELEGRAM_BOT_TOKEN", "fake-token")
os.environ.setdefault("OPENAI_API_KEY", "fake-key")
os.environ.setdefault("COSMOS_ENDPOINT", "wss://fake.gremlin.cosmos.azure.com:443/")
os.environ.setdefault("COSMOS_KEY", "fake-key")
os.environ.setdefault("COSMOS_DATABASE", "knowledge")
os.environ.setdefault("COSMOS_GRAPH", "main")
os.environ.setdefault("DYNAMODB_SESSION_TABLE", "aels-sessions")
os.environ.setdefault("SQS_WORKER_QUEUE_URL", "https://sqs.ap-southeast-2.amazonaws.com/fake/queue")
os.environ.setdefault("AWS_DEFAULT_REGION", "ap-southeast-2")
