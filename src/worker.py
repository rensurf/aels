import asyncio
import json

from telegram import Bot, InlineKeyboardMarkup, InlineKeyboardButton

from src.adapters.message_types import IncomingMessage
from src.agent.teacher_agent import handle_message
from src.config import DYNAMODB_SESSION_TABLE, TELEGRAM_BOT_TOKEN
from src.session.client import SessionClient

session_client = SessionClient(table_name=DYNAMODB_SESSION_TABLE)

_SAVE_KEYBOARD = InlineKeyboardMarkup([
    [
        InlineKeyboardButton("✅ 保存する", callback_data="save_phrases"),
        InlineKeyboardButton("✗ スキップ", callback_data="discard_phrases"),
    ]
])


def worker_handler(event, context):
    for record in event["Records"]:
        payload = json.loads(record["body"])
        asyncio.run(_process(payload))


async def _process(payload: dict) -> None:
    chat_id = payload["chat_id"]
    user_id = payload["user_id"]
    text = payload["text"]
    thinking_message_id = payload["thinking_message_id"]
    quiz_state = payload.get("quiz_state")

    bot = Bot(token=TELEGRAM_BOT_TOKEN)

    try:
        incoming = IncomingMessage(
            text=text,
            user_id=user_id,
            message_id="",
            timestamp=None,
        )

        if quiz_state:
            last_feedback = quiz_state.get("last_feedback")
            if last_feedback:
                incoming.text = (
                    f"[Quiz context]\n"
                    f"Question: 「{last_feedback['japanese']}」\n"
                    f"My answer: \"{last_feedback['user_answer']}\"\n"
                    f"Feedback: {last_feedback['note']} (Expected: \"{last_feedback['expected']}\")\n"
                    f"---\n"
                    f"{text}"
                )

        messages = session_client.load_session(chat_id)
        response, session = await handle_message(incoming, messages)
        session_client.save_session(chat_id, session.to_dict())

        pending = session_client.get_pending_phrases(user_id)
        print(f"[worker] pending_phrases for user_id={user_id}: {pending}")
        if pending:
            phrase_lines = "\n".join(
                f"• {p.get('text', '')} — {p.get('japanese', '')}"
                for p in pending
            )
            full_text = f"{response.text}\n\n📚 以下のフレーズを保存しますか？\n{phrase_lines}"
            await bot.edit_message_text(
                chat_id=chat_id,
                message_id=thinking_message_id,
                text=full_text,
                reply_markup=_SAVE_KEYBOARD,
            )
        else:
            await bot.edit_message_text(
                chat_id=chat_id,
                message_id=thinking_message_id,
                text=response.text,
            )

    except Exception as e:
        print(f"[worker] Error: {e}")
        await bot.edit_message_text(
            chat_id=chat_id,
            message_id=thinking_message_id,
            text="❌ エラーが発生しました。もう一度試してください。",
        )
