import json
import asyncio
from telegram import Bot
from src.adapters.telegram_adapter import TelegramAdapter
from src.agent.teacher_agent import handle_message
from src.config import DYNAMODB_SESSION_TABLE, TELEGRAM_BOT_TOKEN
from src.session.client import SessionClient

bot = Bot(token=TELEGRAM_BOT_TOKEN)
adapter = TelegramAdapter(token=TELEGRAM_BOT_TOKEN)
session_client = SessionClient(table_name=DYNAMODB_SESSION_TABLE)

def lambda_handler(event, context):
    async def main():
        chat_id = None
        try:
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
        except Exception as e:
            print(f"Error: {e}")
            if chat_id:
                await bot.send_message(chat_id=chat_id, text="エラーが発生しました。もう一度試してください。")

        return {"statusCode": 200}

    return asyncio.run(main())
