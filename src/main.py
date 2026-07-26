import json
import requests
import boto3
from decimal import Decimal
from src.config import (
    DYNAMODB_SESSION_TABLE, TELEGRAM_BOT_TOKEN, SQS_WORKER_QUEUE_URL,
    DYNAMODB_PHRASES_TABLE, DYNAMODB_VERBS_TABLE, DYNAMODB_THREADS_TABLE, DYNAMODB_STATS_TABLE,
    WEB_API_KEY, WEB_USER_ID,
    COSMOS_ENDPOINT, COSMOS_KEY, COSMOS_DATABASE, COSMOS_GRAPH,
)
from src.session.client import SessionClient
from src.quiz.flow import start_quiz, handle_quiz_answer, handle_quiz_give_up
from src.quiz.intent import detect_intent
from src.tools.memory_tool import do_save_phrases, get_recent_phrases, search_phrases, get_progress
from src.graph.client import GremlinClient
from src.graph import queries as graph_queries
from src.db.phrases import PhrasesClient
from src.db.verbs import VerbsClient
from src.db.threads import ThreadsClient
from src.db.stats import StatsClient
from src.tools.verb_tool import generate_verb_patterns
from src.tools.chat_tool import chat_with_teacher
from src.tools.analyze_tool import analyze_phrase

session_client = SessionClient(table_name=DYNAMODB_SESSION_TABLE)
phrases_client = PhrasesClient(table_name=DYNAMODB_PHRASES_TABLE)
verbs_client = VerbsClient(table_name=DYNAMODB_VERBS_TABLE)
threads_client = ThreadsClient(table_name=DYNAMODB_THREADS_TABLE)
stats_client = StatsClient(table_name=DYNAMODB_STATS_TABLE)
sqs = boto3.client("sqs", region_name="ap-southeast-2")
_graph = GremlinClient(
    endpoint=COSMOS_ENDPOINT,
    key=COSMOS_KEY,
    database=COSMOS_DATABASE,
    graph=COSMOS_GRAPH,
)


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

    elif data.startswith("quiz_count_"):
        count = data.split("_")[-1]
        limit = None if count == "all" else int(count)
        try:
            start_quiz(chat_id, user_id, limit=limit)
        except Exception as e:
            print(f"[quiz_count] start_quiz failed: {e}")
            requests.post(
                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                json={"chat_id": chat_id, "text": f"Something went wrong: {e}"},
            )

    elif data.startswith("add_memo_"):
        phrase_id = data[len("add_memo_"):]
        session_client.set_pending_memo(chat_id, phrase_id)
        requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            json={"chat_id": chat_id, "text": "📝 Type your memo:"},
        )

    elif data == "quiz_give_up":
        try:
            handle_quiz_give_up(chat_id)
        except Exception as e:
            print(f"[quiz_give_up] failed: {e}")

    return {"statusCode": 200}


def _json_response(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body),
    }


def _authorized(event: dict) -> bool:
    if not WEB_API_KEY:
        return False
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    return headers.get("x-api-key") == WEB_API_KEY


def _handle_get_phrases(event: dict) -> dict:
    if not _authorized(event):
        return _json_response(401, {"error": "Unauthorized"})
    if not WEB_USER_ID:
        return _json_response(503, {"error": "WEB_USER_ID not configured"})
    params = event.get("queryStringParameters") or {}
    items = phrases_client.list_phrases(
        user_id=WEB_USER_ID,
        verb_id=params.get("verb_id"),
        pattern=params.get("pattern"),
        due_before=params.get("due_before"),
    )
    return _json_response(200, {"items": items})


def _handle_get_verbs(event: dict) -> dict:
    if not _authorized(event):
        return _json_response(401, {"error": "Unauthorized"})
    if not WEB_USER_ID:
        return _json_response(503, {"error": "WEB_USER_ID not configured"})
    items = verbs_client.list_verbs(user_id=WEB_USER_ID)
    return _json_response(200, {"items": items})


def _handle_post_verb(event: dict) -> dict:
    if not _authorized(event):
        return _json_response(401, {"error": "Unauthorized"})
    if not WEB_USER_ID:
        return _json_response(503, {"error": "WEB_USER_ID not configured"})
    try:
        body = json.loads(event.get("body") or "{}")
        base = body.get("base", "").strip().lower()
        if not base:
            return _json_response(400, {"error": "base is required"})
        verb = generate_verb_patterns(base)
        return _json_response(200, verb)
    except Exception as e:
        print(f"[POST /verbs] error: {e}")
        return _json_response(500, {"error": str(e)})


def _handle_delete_verb(event: dict) -> dict:
    if not _authorized(event):
        return _json_response(401, {"error": "Unauthorized"})
    if not WEB_USER_ID:
        return _json_response(503, {"error": "WEB_USER_ID not configured"})
    try:
        verb_id = (event.get("pathParameters") or {}).get("verb_id", "")
        verbs_client.delete_verb(user_id=WEB_USER_ID, verb_id=verb_id)
        return _json_response(200, {"deleted": verb_id})
    except Exception as e:
        print(f"[DELETE /verbs] error: {e}")
        return _json_response(500, {"error": str(e)})


def _handle_put_verb(event: dict) -> dict:
    if not _authorized(event):
        return _json_response(401, {"error": "Unauthorized"})
    if not WEB_USER_ID:
        return _json_response(503, {"error": "WEB_USER_ID not configured"})
    try:
        verb_id = (event.get("pathParameters") or {}).get("verb_id", "")
        body = json.loads(event.get("body") or "{}")
        body["verb_id"] = verb_id
        body.setdefault("base", verb_id)
        saved = verbs_client.put_verb(user_id=WEB_USER_ID, verb=body)
        return _json_response(200, saved)
    except Exception as e:
        print(f"[PUT /verbs] error: {e}")
        return _json_response(500, {"error": str(e)})


def _handle_put_phrase(event: dict) -> dict:
    if not _authorized(event):
        return _json_response(401, {"error": "Unauthorized"})
    if not WEB_USER_ID:
        return _json_response(503, {"error": "WEB_USER_ID not configured"})
    try:
        phrase_id = (event.get("pathParameters") or {}).get("phrase_id", "")
        body = json.loads(event.get("body") or "{}")
        updated = phrases_client.update_phrase(user_id=WEB_USER_ID, phrase_id=phrase_id, updates=body)
        if updated is None:
            return _json_response(400, {"error": "No updatable fields provided"})
        return _json_response(200, updated)
    except Exception as e:
        print(f"[PUT /phrases] error: {e}")
        return _json_response(500, {"error": str(e)})


def _handle_post_phrase(event: dict) -> dict:
    if not _authorized(event):
        return _json_response(401, {"error": "Unauthorized"})
    if not WEB_USER_ID:
        return _json_response(503, {"error": "WEB_USER_ID not configured"})
    try:
        body = json.loads(event.get("body") or "{}")
        if not body.get("text"):
            return _json_response(400, {"error": "text is required"})
        saved = phrases_client.put_phrase(user_id=WEB_USER_ID, phrase=body)
        return _json_response(201, saved)
    except Exception as e:
        print(f"[POST /phrases] error: {e}")
        return _json_response(500, {"error": str(e)})


def _handle_post_chat(event: dict) -> dict:
    if not _authorized(event):
        return _json_response(401, {"error": "Unauthorized"})
    if not WEB_USER_ID:
        return _json_response(503, {"error": "WEB_USER_ID not configured"})
    try:
        body = json.loads(event.get("body") or "{}")
        text = body.get("text", "").strip()
        if not text:
            return _json_response(400, {"error": "text is required"})
        thread_id = body.get("thread_id", "").strip()
        history: list[dict] = []
        if thread_id:
            thread = threads_client.get_thread(user_id=WEB_USER_ID, thread_id=thread_id)
            if thread:
                history = list(thread.get("messages", []))
        result = chat_with_teacher(text, history=history)
        if thread_id:
            threads_client.append_messages(
                user_id=WEB_USER_ID,
                thread_id=thread_id,
                new_messages=[
                    {"role": "user", "content": text},
                    {"role": "assistant", "content": result["message"]},
                ],
            )
        return _json_response(200, result)
    except Exception as e:
        print(f"[POST /chat] error: {e}")
        return _json_response(500, {"error": str(e)})


def _handle_post_analyze(event: dict) -> dict:
    if not _authorized(event):
        return _json_response(401, {"error": "Unauthorized"})
    try:
        body = json.loads(event.get("body") or "{}")
        text = body.get("text", "").strip()
        if not text:
            return _json_response(400, {"error": "text is required"})
        result = analyze_phrase(text)
        return _json_response(200, result)
    except Exception as e:
        print(f"[POST /analyze] error: {e}")
        return _json_response(500, {"error": str(e)})


def _handle_post_threads(event: dict) -> dict:
    if not _authorized(event):
        return _json_response(401, {"error": "Unauthorized"})
    if not WEB_USER_ID:
        return _json_response(503, {"error": "WEB_USER_ID not configured"})
    try:
        thread = threads_client.create_thread(user_id=WEB_USER_ID)
        return _json_response(201, thread)
    except Exception as e:
        print(f"[POST /threads] error: {e}")
        return _json_response(500, {"error": str(e)})


def _handle_get_threads(event: dict) -> dict:
    if not _authorized(event):
        return _json_response(401, {"error": "Unauthorized"})
    if not WEB_USER_ID:
        return _json_response(503, {"error": "WEB_USER_ID not configured"})
    try:
        items = threads_client.list_threads(user_id=WEB_USER_ID)
        return _json_response(200, {"items": [
            {"thread_id": t["thread_id"], "created_at": t["created_at"]}
            for t in items
        ]})
    except Exception as e:
        print(f"[GET /threads] error: {e}")
        return _json_response(500, {"error": str(e)})


def _handle_get_thread(event: dict) -> dict:
    if not _authorized(event):
        return _json_response(401, {"error": "Unauthorized"})
    if not WEB_USER_ID:
        return _json_response(503, {"error": "WEB_USER_ID not configured"})
    try:
        thread_id = (event.get("pathParameters") or {}).get("thread_id", "")
        thread = threads_client.get_thread(user_id=WEB_USER_ID, thread_id=thread_id)
        if thread is None:
            return _json_response(404, {"error": "Not found"})
        return _json_response(200, {
            "thread_id": thread["thread_id"],
            "created_at": thread["created_at"],
            "messages": list(thread.get("messages", [])),
        })
    except Exception as e:
        print(f"[GET /threads/{'{thread_id}'}] error: {e}")
        return _json_response(500, {"error": str(e)})


def _handle_post_phrase_review(event: dict) -> dict:
    if not _authorized(event):
        return _json_response(401, {"error": "Unauthorized"})
    if not WEB_USER_ID:
        return _json_response(503, {"error": "WEB_USER_ID not configured"})
    try:
        phrase_id = (event.get("pathParameters") or {}).get("phrase_id", "")
        body = json.loads(event.get("body") or "{}")
        quality = int(body.get("quality", 0))
        if not 0 <= quality <= 5:
            return _json_response(400, {"error": "quality must be 0-5"})

        updated = phrases_client.update_sm2(user_id=WEB_USER_ID, phrase_id=phrase_id, quality=quality)

        from datetime import date as _date
        today = _date.today().isoformat()
        remaining = phrases_client.get_due_count(user_id=WEB_USER_ID, due_before=today)
        if remaining == 0:
            stats = stats_client.try_complete_day(user_id=WEB_USER_ID)
            streak_updated = True
        else:
            stats = stats_client.get_stats(user_id=WEB_USER_ID)
            streak_updated = False

        return _json_response(200, {
            "phrase": updated,
            "remaining_due": remaining,
            "streak": stats["current_streak"],
            "streak_updated": streak_updated,
        })
    except Exception as e:
        print(f"[POST /phrases/review] error: {e}")
        return _json_response(500, {"error": str(e)})


def _handle_post_phrase_alternatives(event: dict) -> dict:
    if not _authorized(event):
        return _json_response(401, {"error": "Unauthorized"})
    if not WEB_USER_ID:
        return _json_response(503, {"error": "WEB_USER_ID not configured"})
    try:
        phrase_id = (event.get("pathParameters") or {}).get("phrase_id", "")
        body = json.loads(event.get("body") or "{}")
        text = body.get("text", "").strip()
        if not text:
            return _json_response(400, {"error": "text is required"})
        alternative = {
            "text": text,
            "note": body.get("note", ""),
            "verb_id": body.get("verb_id", ""),
            "register": body.get("register", "informal"),
        }
        updated = phrases_client.add_alternative(
            user_id=WEB_USER_ID, phrase_id=phrase_id, alternative=alternative
        )
        return _json_response(200, updated)
    except Exception as e:
        print(f"[POST /phrases/alternatives] error: {e}")
        return _json_response(500, {"error": str(e)})


def _handle_get_stats(event: dict) -> dict:
    if not _authorized(event):
        return _json_response(401, {"error": "Unauthorized"})
    if not WEB_USER_ID:
        return _json_response(503, {"error": "WEB_USER_ID not configured"})
    try:
        return _json_response(200, stats_client.get_stats(user_id=WEB_USER_ID))
    except Exception as e:
        print(f"[GET /stats] error: {e}")
        return _json_response(500, {"error": str(e)})


def _handle_get_verb(event: dict) -> dict:
    if not _authorized(event):
        return _json_response(401, {"error": "Unauthorized"})
    if not WEB_USER_ID:
        return _json_response(503, {"error": "WEB_USER_ID not configured"})
    verb_id = (event.get("pathParameters") or {}).get("verb_id", "")
    verb = verbs_client.get_verb(user_id=WEB_USER_ID, verb_id=verb_id)
    if verb is None:
        return _json_response(404, {"error": "Not found"})
    return _json_response(200, verb)


def lambda_handler(event, context):
    route_key = event.get("routeKey", "")
    if route_key == "GET /phrases":
        return _handle_get_phrases(event)
    if route_key == "POST /phrases":
        return _handle_post_phrase(event)
    if route_key == "PUT /phrases/{phrase_id}":
        return _handle_put_phrase(event)
    if route_key == "POST /phrases/{phrase_id}/review":
        return _handle_post_phrase_review(event)
    if route_key == "POST /chat":
        return _handle_post_chat(event)
    if route_key == "GET /verbs":
        return _handle_get_verbs(event)
    if route_key == "GET /verbs/{verb_id}":
        return _handle_get_verb(event)
    if route_key == "POST /verbs":
        return _handle_post_verb(event)
    if route_key == "PUT /verbs/{verb_id}":
        return _handle_put_verb(event)
    if route_key == "DELETE /verbs/{verb_id}":
        return _handle_delete_verb(event)
    if route_key == "POST /analyze":
        return _handle_post_analyze(event)
    if route_key == "POST /threads":
        return _handle_post_threads(event)
    if route_key == "GET /threads":
        return _handle_get_threads(event)
    if route_key == "GET /threads/{thread_id}":
        return _handle_get_thread(event)
    if route_key == "GET /stats":
        return _handle_get_stats(event)
    if route_key == "POST /phrases/{phrase_id}/alternatives":
        return _handle_post_phrase_alternatives(event)

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

    pending_memo_phrase_id = session_client.get_pending_memo(chat_id)
    if pending_memo_phrase_id and text and not text.startswith("/"):
        session_client.clear_pending_memo(chat_id)
        try:
            _graph.execute(graph_queries.set_phrase_memo(pending_memo_phrase_id, text))
            requests.post(
                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                json={"chat_id": chat_id, "text": "📝 Memo saved!"},
            )
        except Exception as e:
            print(f"[memo] save failed: {e}")
            requests.post(
                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                json={"chat_id": chat_id, "text": "❌ Failed to save memo. Please try again."},
            )
        return {"statusCode": 200}

    if text == "/review":
        requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            json={
                "chat_id": chat_id,
                "text": "How many phrases would you like to review?",
                "reply_markup": {"inline_keyboard": [[
                    {"text": "5", "callback_data": "quiz_count_5"},
                    {"text": "10", "callback_data": "quiz_count_10"},
                    {"text": "20", "callback_data": "quiz_count_20"},
                    {"text": "All", "callback_data": "quiz_count_all"},
                ]]},
            },
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
