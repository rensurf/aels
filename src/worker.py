import asyncio
import json

from telegram import Bot, InlineKeyboardMarkup, InlineKeyboardButton

from src.adapters.message_types import IncomingMessage
from src.agent.teacher_agent import handle_message
from src.config import DYNAMODB_SESSION_TABLE, TELEGRAM_BOT_TOKEN
from src.session.client import SessionClient

session_client = SessionClient(table_name=DYNAMODB_SESSION_TABLE)

_TURN_ALERT_THRESHOLD = 15
_TURN_ALERT_INTERVAL = 5


def _build_phrase_keyboard(phrases: list[dict]) -> InlineKeyboardMarkup:
    buttons = []
    for i, p in enumerate(phrases):
        mark = "☑" if p.get("selected", False) else "☐"
        label = f"{mark} {p['text']} — {p['japanese']}"
        buttons.append([InlineKeyboardButton(label, callback_data=f"toggle_phrase_{i}")])
    buttons.append([
        InlineKeyboardButton("💾 Save selected", callback_data="confirm_phrases"),
        InlineKeyboardButton("✗ Cancel", callback_data="cancel_phrases"),
    ])
    return InlineKeyboardMarkup(buttons)


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
        turn_count = session_client.increment_turn_count(chat_id)

        raw_pending = session_client.get_pending_phrases(user_id)
        seen: set[str] = set()
        pending = []
        for p in (raw_pending or []):
            if p.get("text") not in seen:
                seen.add(p.get("text", ""))
                pending.append(p)
        if pending:
            full_text = f"{response.text}\n\n📚 Choose phrases to save:"
            await bot.edit_message_text(
                chat_id=chat_id,
                message_id=thinking_message_id,
                text=full_text,
                reply_markup=_build_phrase_keyboard(pending),
            )
        else:
            await bot.edit_message_text(
                chat_id=chat_id,
                message_id=thinking_message_id,
                text=response.text,
            )

        if turn_count >= _TURN_ALERT_THRESHOLD and (turn_count - _TURN_ALERT_THRESHOLD) % _TURN_ALERT_INTERVAL == 0:
            await bot.send_message(
                chat_id=chat_id,
                text="⚠️ Your conversation is getting long. If things slow down, use /reset to start fresh.",
            )

    except Exception as e:
        print(f"[worker] Error: {e}")
        await bot.edit_message_text(
            chat_id=chat_id,
            message_id=thinking_message_id,
            text="❌ Something went wrong. Please try again.",
        )
