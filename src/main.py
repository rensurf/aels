import json
import asyncio
import requests
from telegram import Bot
from src.adapters.telegram_adapter import TelegramAdapter
from src.agent.teacher_agent import handle_message
from src.config import DYNAMODB_SESSION_TABLE, TELEGRAM_BOT_TOKEN
from src.session.client import SessionClient
from src.quiz.flow import start_quiz, handle_quiz_answer

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
    update_id = body.get("update_id", 0)
    if session_client.is_duplicate_update(update_id):
        return {"statusCode": 200}

    chat_id = str(body["message"]["chat"]["id"])
    user_id = str(body["message"]["from"]["id"])
    text = body["message"].get("text", "")

    # --- routing ---
    if text == "/review":
        start_quiz(chat_id, user_id)
        return {"statusCode": 200}

    quiz_state = session_client.get_quiz_state(chat_id)
    if quiz_state:
        handle_quiz_answer(chat_id, text)
        return {"statusCode": 200}
    # --- end routing ---

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
