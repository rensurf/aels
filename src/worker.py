import asyncio
import json

from telegram import Bot, InlineKeyboardButton, InlineKeyboardMarkup

from src.adapters.message_types import IncomingMessage
from src.agent.teacher_agent import handle_message
from src.config import DYNAMODB_SESSION_TABLE, TELEGRAM_BOT_TOKEN
from src.llm.client import transcribe
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


def _build_action_keyboard(provider: str) -> InlineKeyboardMarkup:
    switch_label = "🔄 Switch to Claude" if provider == "openai" else "🔄 Switch to GPT-4o"
    ask_label = "👀 Ask Claude too" if provider == "openai" else "👀 Ask GPT-4o too"
    return InlineKeyboardMarkup([[
        InlineKeyboardButton(switch_label, callback_data="switch_provider"),
        InlineKeyboardButton(ask_label, callback_data="ask_other"),
    ]])


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

    voice_file_id = payload.get("voice_file_id")
    if voice_file_id and not text:
        try:
            text = transcribe(voice_file_id)
        except Exception as e:
            print(f"[voice] transcription failed: {e}")
            await bot.edit_message_text(
                chat_id=chat_id,
                message_id=thinking_message_id,
                text="❌ Couldn't transcribe your voice message. Please try typing.",
            )
            return

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

        provider = payload.get("override_provider") or session_client.get_provider(chat_id)
        response = await handle_message(incoming, chat_id, provider)
        if not payload.get("override_provider"):
            session_client.set_last_message(chat_id, text)
            session_client.increment_turn_count(chat_id)
        turn_count = session_client.get_turn_count(chat_id)

        raw_pending = session_client.get_pending_phrases(user_id)
        seen: set[str] = set()
        pending = []
        for p in (raw_pending or []):
            if p.get("text") not in seen:
                seen.add(p.get("text", ""))
                pending.append(p)
        current_provider = session_client.get_provider(chat_id)
        if pending and not payload.get("override_provider"):
            full_text = f"{response.text}\n\n📚 Choose phrases to save:"
            await bot.edit_message_text(
                chat_id=chat_id,
                message_id=thinking_message_id,
                text=full_text,
                reply_markup=_build_phrase_keyboard(pending),
            )
        else:
            label = "Claude" if provider == "claude" else "GPT-4o"
            await bot.edit_message_text(
                chat_id=chat_id,
                message_id=thinking_message_id,
                text=f"[{label}] {response.text}" if payload.get("override_provider") else response.text,
                reply_markup=_build_action_keyboard(current_provider),
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
