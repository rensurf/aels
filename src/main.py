import json
import asyncio
import requests
from telegram import Bot, InlineKeyboardMarkup, InlineKeyboardButton
from src.adapters.telegram_adapter import TelegramAdapter
from src.agent.teacher_agent import handle_message
from src.config import DYNAMODB_SESSION_TABLE, TELEGRAM_BOT_TOKEN
from src.session.client import SessionClient
from src.quiz.flow import start_quiz, handle_quiz_answer
from src.quiz.intent import detect_intent
from src.tools.memory_tool import do_save_phrases

adapter = TelegramAdapter(token=TELEGRAM_BOT_TOKEN)
session_client = SessionClient(table_name=DYNAMODB_SESSION_TABLE)

_SAVE_KEYBOARD = InlineKeyboardMarkup([
    [
        InlineKeyboardButton("✅ 保存する", callback_data="save_phrases"),
        InlineKeyboardButton("✗ スキップ", callback_data="discard_phrases"),
    ]
])


def _send_thinking(chat_id: str) -> int:
    resp = requests.post(
        f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
        json={"chat_id": chat_id, "text": "考えています..."}
    )
    return resp.json()["result"]["message_id"]


def _handle_callback_query(body: dict) -> dict:
    callback = body["callback_query"]
    callback_id = callback["id"]
    chat_id = str(callback["message"]["chat"]["id"])
    user_id = str(callback["from"]["id"])
    message_id = callback["message"]["message_id"]
    original_text = callback["message"].get("text", "")
    data = callback.get("data", "")

    requests.post(
        f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/answerCallbackQuery",
        json={"callback_query_id": callback_id}
    )

    if data == "save_phrases":
        pending = session_client.get_pending_phrases(chat_id)
        if pending:
            try:
                do_save_phrases(pending, user_id)
                session_client.clear_pending_phrases(chat_id)
                phrase_lines = "\n".join(
                    f"• {p.get('text', '')} — {p.get('japanese', '')}"
                    for p in pending
                )
                suffix = f"\n\n✅ 保存しました！\n{phrase_lines}"
            except Exception as e:
                print(f"[callback] do_save_phrases failed: {e}")
                suffix = "\n\n❌ 保存中にエラーが発生しました。"
        else:
            suffix = "\n\n✅ 保存しました！"
    else:
        session_client.clear_pending_phrases(chat_id)
        suffix = "\n\n✗ スキップしました。"

    requests.post(
        f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/editMessageText",
        json={
            "chat_id": chat_id,
            "message_id": message_id,
            "text": original_text + suffix,
        }
    )
    return {"statusCode": 200}


def lambda_handler(event, context):
    body = json.loads(event["body"])

    if "callback_query" in body:
        update_id = body.get("update_id", 0)
        if session_client.is_duplicate_update(update_id):
            return {"statusCode": 200}
        return _handle_callback_query(body)

    update_id = body.get("update_id", 0)
    if session_client.is_duplicate_update(update_id):
        return {"statusCode": 200}

    chat_id = str(body["message"]["chat"]["id"])
    user_id = str(body["message"]["from"]["id"])
    text = body["message"].get("text", "")

    # --- routing ---
    if text == "/review":
        try:
            start_quiz(chat_id, user_id)
        except Exception as e:
            print(f"[/review] start_quiz failed: {e}")
            requests.post(
                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                json={"chat_id": chat_id, "text": f"エラーが発生しました: {e}"},
            )
        return {"statusCode": 200}

    quiz_state = session_client.get_quiz_state(chat_id)
    if quiz_state:
        try:
            intent = detect_intent(text, quiz_state)
        except Exception as e:
            print(f"[quiz] detect_intent failed: {e}")
            intent = "answer"

        if intent == "answer":
            try:
                handle_quiz_answer(chat_id, text)
            except Exception as e:
                print(f"[quiz] handle_quiz_answer failed: {e}")
                requests.post(
                    f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                    json={"chat_id": chat_id, "text": f"クイズ処理中にエラーが発生しました: {e}"},
                )
            return {"statusCode": 200}
        # intent == "question": fall through to Teacher Agent with quiz context
    # --- end routing ---

    try:
        thinking_message_id = _send_thinking(chat_id)
    except Exception as e:
        print(f"Failed to send thinking message: {e}")
        return {"statusCode": 200}

    async def main():
        bot = Bot(token=TELEGRAM_BOT_TOKEN)

        async def process():
            incoming = adapter.receive(body)
            if quiz_state:
                last_feedback = quiz_state.get("last_feedback")
                if last_feedback:
                    incoming.text = (
                        f"[Quiz context]\n"
                        f"Question: 「{last_feedback['japanese']}」\n"
                        f"My answer: \"{last_feedback['user_answer']}\"\n"
                        f"Feedback: {last_feedback['note']} (Expected: \"{last_feedback['expected']}\")\n"
                        f"---\n"
                        f"{incoming.text}"
                    )
            messages = session_client.load_session(chat_id)
            response, session = await handle_message(incoming, messages)
            session_client.save_session(chat_id, session.to_dict())

            pending = session_client.get_pending_phrases(chat_id)
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
                    text=response.text
                )

        try:
            await asyncio.wait_for(process(), timeout=24)
        except asyncio.TimeoutError:
            print("Error: process timed out")
            await bot.edit_message_text(
                chat_id=chat_id,
                message_id=thinking_message_id,
                text="⏱ 少し時間がかかりすぎました。もう一度試してください。"
            )
        except Exception as e:
            print(f"Error: {e}")
            await bot.edit_message_text(
                chat_id=chat_id,
                message_id=thinking_message_id,
                text="❌ エラーが発生しました。もう一度試してください。"
            )

        return {"statusCode": 200}

    return asyncio.run(main())
