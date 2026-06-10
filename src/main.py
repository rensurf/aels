import json
import requests
import boto3
from decimal import Decimal
from src.config import DYNAMODB_SESSION_TABLE, TELEGRAM_BOT_TOKEN, SQS_WORKER_QUEUE_URL
from src.session.client import SessionClient
from src.quiz.flow import start_quiz, handle_quiz_answer, handle_quiz_give_up
from src.quiz.intent import detect_intent
from src.tools.memory_tool import do_save_phrases, get_recent_phrases, search_phrases, get_progress

session_client = SessionClient(table_name=DYNAMODB_SESSION_TABLE)
sqs = boto3.client("sqs", region_name="ap-southeast-2")


def _v(item: dict, key: str) -> str:
    v = item.get(key, "")
    return v[0] if isinstance(v, list) and v else str(v)


class _DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)


def _send_thinking(chat_id: str) -> int:
    resp = requests.post(
        f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
        json={"chat_id": chat_id, "text": "Thinking..."}
    )
    return resp.json()["result"]["message_id"]


def _phrase_keyboard_dict(phrases: list[dict]) -> dict:
    buttons = []
    for i, p in enumerate(phrases):
        mark = "☑" if p.get("selected", False) else "☐"
        label = f"{mark} {p['text']} — {p['japanese']}"
        buttons.append([{"text": label, "callback_data": f"toggle_phrase_{i}"}])
    buttons.append([
        {"text": "💾 Save selected", "callback_data": "confirm_phrases"},
        {"text": "✗ Cancel", "callback_data": "cancel_phrases"},
    ])
    return {"inline_keyboard": buttons}


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

    if data.startswith("toggle_phrase_"):
        idx = int(data.split("_")[-1])
        pending = session_client.get_pending_phrases(user_id)
        if pending and 0 <= idx < len(pending):
            pending[idx]["selected"] = not pending[idx].get("selected", False)
            session_client.set_pending_phrases(user_id, pending)
            requests.post(
                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/editMessageReplyMarkup",
                json={
                    "chat_id": chat_id,
                    "message_id": message_id,
                    "reply_markup": _phrase_keyboard_dict(pending),
                }
            )

    elif data == "confirm_phrases":
        pending = session_client.get_pending_phrases(user_id)
        to_save = [p for p in pending if p.get("selected", False)] if pending else []
        if to_save:
            try:
                do_save_phrases(to_save, user_id)
                saved_lines = "\n".join(f"• {p['text']} — {p['japanese']}" for p in to_save)
                suffix = f"\n\n✅ Saved {len(to_save)} phrase(s)!\n{saved_lines}"
            except Exception as e:
                print(f"[callback] do_save_phrases failed: {e}")
                suffix = "\n\n❌ Failed to save. Please try again."
        else:
            suffix = "\n\n✅ No phrases selected."
        session_client.clear_pending_phrases(user_id)
        prefix = original_text.split("\n\n📚")[0]
        requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/editMessageText",
            json={"chat_id": chat_id, "message_id": message_id, "text": prefix + suffix}
        )

    elif data == "cancel_phrases":
        session_client.clear_pending_phrases(user_id)
        prefix = original_text.split("\n\n📚")[0]
        requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/editMessageText",
            json={"chat_id": chat_id, "message_id": message_id, "text": prefix + "\n\n✗ Skipped."}
        )

    elif data == "switch_provider":
        current = session_client.get_provider(chat_id)
        new_provider = "claude" if current == "openai" else "openai"
        session_client.set_provider(chat_id, new_provider)
        label = "Claude (claude-sonnet-4-6)" if new_provider == "claude" else "GPT-4o"
        requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            json={"chat_id": chat_id, "text": f"🔄 Switched to {label}. Your conversation history carries over."},
        )

    elif data == "ask_other":
        current = session_client.get_provider(chat_id)
        other = "claude" if current == "openai" else "openai"
        last_text = session_client.get_last_message(chat_id)
        if last_text:
            thinking_id = _send_thinking(chat_id)
            sqs.send_message(
                QueueUrl=SQS_WORKER_QUEUE_URL,
                MessageBody=json.dumps({
                    "chat_id": chat_id,
                    "user_id": user_id,
                    "text": last_text,
                    "thinking_message_id": thinking_id,
                    "quiz_state": None,
                    "override_provider": other,
                })
            )

    elif data == "confirm_voice":
        text = session_client.get_pending_voice_text(chat_id)
        session_client.clear_pending_voice_text(chat_id)
        if text:
            quiz_state = session_client.get_quiz_state(chat_id)
            if quiz_state:
                try:
                    intent = detect_intent(text, quiz_state)
                except Exception:
                    intent = "answer"
                if intent == "give_up":
                    handle_quiz_give_up(chat_id)
                else:
                    handle_quiz_answer(chat_id, text)
            else:
                thinking_id = _send_thinking(chat_id)
                sqs.send_message(
                    QueueUrl=SQS_WORKER_QUEUE_URL,
                    MessageBody=json.dumps({
                        "chat_id": chat_id,
                        "user_id": user_id,
                        "text": text,
                        "thinking_message_id": thinking_id,
                        "quiz_state": None,
                        "voice_file_id": None,
                    }),
                )

    elif data == "redo_voice":
        session_client.clear_pending_voice_text(chat_id)
        requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            json={"chat_id": chat_id, "text": "🎤 Send your voice message again."},
        )

    elif data == "quiz_give_up":
        try:
            handle_quiz_give_up(chat_id)
        except Exception as e:
            print(f"[quiz_give_up] failed: {e}")

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

    voice_file_id = body["message"].get("voice", {}).get("file_id") if not text else None

    if text == "/review":
        try:
            start_quiz(chat_id, user_id)
        except Exception as e:
            print(f"[/review] start_quiz failed: {e}")
            requests.post(
                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                json={"chat_id": chat_id, "text": f"Something went wrong: {e}"},
            )
        return {"statusCode": 200}

    if text == "/reset":
        session_client.reset_session(chat_id)
        requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            json={"chat_id": chat_id, "text": "🔄 Conversation reset. Let's start fresh!"},
        )
        return {"statusCode": 200}

    if text == "/stop":
        quiz_state = session_client.get_quiz_state(chat_id)
        if quiz_state:
            session_client.clear_quiz_state(chat_id)
            msg = "⏹ Quiz stopped. Feel free to keep chatting!"
        else:
            msg = "No quiz in progress."
        requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            json={"chat_id": chat_id, "text": msg},
        )
        return {"statusCode": 200}

    if text.startswith("/list"):
        keyword = text[5:].strip()
        try:
            if keyword:
                phrases = search_phrases(keyword, user_id)
                header = f'📚 Search results for "{keyword}"'
            else:
                phrases = get_recent_phrases(user_id, limit=10)
                header = "📚 Recent phrases (10)"
            if phrases:
                lines = [header, ""]
                for p in phrases:
                    line = f"• {_v(p, 'text')} — {_v(p, 'japanese')}"
                    lines.append(line)
                msg = "\n".join(lines)
            elif keyword:
                msg = f'No phrases found for "{keyword}".'
            else:
                msg = "No phrases saved yet. Start chatting to learn!"
        except Exception as e:
            print(f"[/list] error: {e}")
            msg = "Something went wrong."
        requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            json={"chat_id": chat_id, "text": msg},
        )
        return {"statusCode": 200}

    if text == "/progress":
        try:
            data = get_progress(user_id)
            total = data["total_phrases"]
            due = data["due_today"]
            weakness = data["weakness"]

            lines = ["📊 Your progress", ""]
            lines.append(f"Total phrases saved: {total}")
            due_line = f"Due for review today: {due}"
            if due == 0:
                due_line += " 🎉 All caught up!"
            lines.append(due_line)

            patterns = weakness.get("patterns", [])
            if patterns:
                lines += ["", f"Weakest pattern: {patterns[0]['pattern']}"]
                for ex in patterns[0].get("examples", []):
                    lines.append(f"• {ex['text']} — {ex['japanese']}")
            else:
                lines += ["", "No weak patterns yet. Keep it up!"]

            msg = "\n".join(lines)
        except Exception as e:
            print(f"[/progress] error: {e}")
            msg = "Something went wrong."
        requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            json={"chat_id": chat_id, "text": msg},
        )
        return {"statusCode": 200}

    quiz_state = session_client.get_quiz_state(chat_id)
    if quiz_state and not voice_file_id:
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
                    json={"chat_id": chat_id, "text": f"Something went wrong during the quiz: {e}"},
                )
            return {"statusCode": 200}

        if intent == "give_up":
            try:
                handle_quiz_give_up(chat_id)
            except Exception as e:
                print(f"[quiz] handle_quiz_give_up failed: {e}")
                requests.post(
                    f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                    json={"chat_id": chat_id, "text": f"Something went wrong during the quiz: {e}"},
                )
            return {"statusCode": 200}

    try:
        thinking_message_id = _send_thinking(chat_id)
    except Exception as e:
        print(f"Failed to send thinking message: {e}")
        return {"statusCode": 200}

    sqs.send_message(
        QueueUrl=SQS_WORKER_QUEUE_URL,
        MessageBody=json.dumps({
            "chat_id": chat_id,
            "user_id": user_id,
            "text": text,
            "thinking_message_id": thinking_message_id,
            "quiz_state": quiz_state,
            "voice_file_id": voice_file_id,
        }, cls=_DecimalEncoder)
    )

    return {"statusCode": 200}
