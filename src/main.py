import json
import os
import asyncio
from dotenv import load_dotenv
from telegram import Bot
from src.adapters.telegram_adapter import TelegramAdapter
from src.agent.teacher_agent import handle_message
from src.session.client import SessionClient

load_dotenv()

bot = Bot(token=os.getenv("TELEGRAM_BOT_TOKEN"))
adapter = TelegramAdapter(token=os.getenv("TELEGRAM_BOT_TOKEN"))
session_client = SessionClient(table_name=os.getenv("DYNAMODB_SESSION_TABLE"))

def lambda_handler(event, context):
    async def main():
        # 1. Parse webhook
        body = json.loads(event["body"])
        incoming = adapter.receive(body)
        chat_id = str(body["message"]["chat"]["id"])

        # 2. Send "考えています..."
        sent = await bot.send_message(chat_id=chat_id, text="考えています...")

        # 3. Load session from DynamoDB
        messages = session_client.load_session(chat_id)

        # 4. Run agent
        response, session = await handle_message(incoming, messages)

        # 5. Save session to DynamoDB
        session_client.save_session(chat_id, session.to_dict())

        # 6. Edit message with final response
        await bot.edit_message_text(
            chat_id=chat_id,
            message_id=sent.message_id,
            text=response.text
        )

        return {"statusCode": 200}

    return asyncio.run(main())
