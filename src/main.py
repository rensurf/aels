import json
import requests
import boto3
from decimal import Decimal
from src.config import DYNAMODB_SESSION_TABLE, TELEGRAM_BOT_TOKEN, SQS_WORKER_QUEUE_URL
from src.session.client import SessionClient
from src.quiz.flow import start_quiz, handle_quiz_answer
from src.quiz.intent import detect_intent
from src.tools.memory_tool import do_save_phrases

session_client = SessionClient(table_name=DYNAMODB_SESSION_TABLE)
sqs = boto3.client("sqs", region_name="ap-southeast-2")


class _DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)


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
        pending = session_client.get_pending_phrases(user_id)
        if pending:
            try:
                do_save_phrases(pending, user_id)
                session_client.clear_pending_phrases(user_id)
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
        session_client.clear_pending_phrases(user_id)
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
        }, cls=_DecimalEncoder)
    )

    return {"statusCode": 200}
