import json
import asyncio
import requests
from telegram import Bot
from src.adapters.telegram_adapter import TelegramAdapter
from src.agent.teacher_agent import handle_message
from src.config import DYNAMODB_SESSION_TABLE, TELEGRAM_BOT_TOKEN
from src.session.client import SessionClient

adapter = TelegramAdapter(token=TELEGRAM_BOT_TOKEN)
session_client = SessionClient(table_name=DYNAMODB_SESSION_TABLE)


def _send_thinking(chat_id: str) -> int:
    resp = requests.post(
        f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
        json={"chat_id": chat_id, "text": "考えています..."}
    )
    return resp.json()["result"]["message_id"]


def lambda_handler(event, context):
    body = json.loads(event["body"])
    chat_id = str(body["message"]["chat"]["id"])

    # Send "考えています..." synchronously before asyncio.run()
    # This returns 200 to Telegram within 1s and prevents retries
    try:
        thinking_message_id = _send_thinking(chat_id)
    except Exception as e:
        print(f"Failed to send thinking message: {e}")
        return {"statusCode": 200}

    async def main():
        bot = Bot(token=TELEGRAM_BOT_TOKEN)
        try:
            incoming = adapter.receive(body)
            messages = session_client.load_session(chat_id)
            response, session = await handle_message(incoming, messages)
            session_client.save_session(chat_id, session.to_dict())

            await bot.edit_message_text(
                chat_id=chat_id,
                message_id=thinking_message_id,
                text=response.text
            )
        except Exception as e:
            print(f"Error: {e}")
            await bot.send_message(chat_id=chat_id, text="エラーが発生しました。もう一度試してください。")

        return {"statusCode": 200}

    return asyncio.run(main())
