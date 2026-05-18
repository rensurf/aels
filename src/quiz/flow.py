import requests
from datetime import date

from src.config import TELEGRAM_BOT_TOKEN, COSMOS_ENDPOINT, COSMOS_KEY, COSMOS_DATABASE, COSMOS_GRAPH, DYNAMODB_SESSION_TABLE
from src.graph.client import GremlinClient
from src.graph import queries
from src.session.client import SessionClient
from src.sm2.algorithm import calculate_next_review
from src.sm2.evaluator import evaluate_answer

_session = SessionClient(table_name=DYNAMODB_SESSION_TABLE)
_graph = GremlinClient(
    endpoint=COSMOS_ENDPOINT,
    key=COSMOS_KEY,
    database=COSMOS_DATABASE,
    graph=COSMOS_GRAPH,
)


def start_quiz(chat_id: str, user_id: str) -> None:
    today = date.today().isoformat()

    sm2_rows = _graph.execute(queries.get_all_sm2_data(user_id))
    phrase_rows = _graph.execute(queries.get_all_phrases(user_id))
    phrase_by_id = {p["phrase_id"][0]: p for p in phrase_rows}

    # Merge SM-2 edge data into phrase dicts and filter by due date
    due_phrases = []
    for sm2 in sm2_rows:
        if sm2.get("due_date", "0000-00-00") <= today:
            phrase_id = sm2["phrase_id"]
            phrase = phrase_by_id.get(phrase_id, {})
            due_phrases.append({
                **phrase,
                "ease_factor": [sm2.get("ease_factor", 2.5)],
                "interval": [sm2.get("interval", 0)],
                "repetitions": [sm2.get("repetitions", 0)],
                "due_date": [sm2.get("due_date", today)],
            })

    # Weakest phrases first (lowest ease_factor = answered wrong most often)
    due_phrases.sort(key=lambda p: float(p.get("ease_factor", [2.5])[0]))

    if not due_phrases:
        _send(chat_id, "No phrases due for review today. Keep chatting to learn more!")
        return

    phrase_ids = [p["phrase_id"][0] for p in due_phrases]
    _session.set_quiz_state(chat_id, {
        "pending_phrases": phrase_ids,
        "current_phrase_id": phrase_ids[0],
        "user_id": user_id,
        "phrases": {p["phrase_id"][0]: p for p in due_phrases},
    })

    _send_question(chat_id, due_phrases[0])


def handle_quiz_answer(chat_id: str, user_answer: str) -> None:
    quiz_state = _session.get_quiz_state(chat_id)
    if not quiz_state:
        return

    user_id = quiz_state["user_id"]
    phrase_id = quiz_state["current_phrase_id"]
    phrase = quiz_state["phrases"][phrase_id]

    japanese = phrase["japanese"][0]
    expected = phrase["text"][0]

    quality = evaluate_answer(japanese=japanese, expected=expected, user_answer=user_answer)
    result = calculate_next_review(
        ease_factor=float(phrase.get("ease_factor", [2.5])[0]),
        interval=int(phrase.get("interval", [0])[0]),
        repetitions=int(phrase.get("repetitions", [0])[0]),
        quality=quality,
    )
    _graph.execute(queries.update_sm2(
        user_id=user_id,
        phrase_id=phrase_id,
        ease_factor=result.ease_factor,
        interval=result.interval,
        repetitions=result.repetitions,
        due_date=result.due_date,
    ))

    if quality >= 3:
        _send(chat_id, f"✅ Correct! Next review in {result.interval} day(s).")
    else:
        _send(chat_id, f"❌ The answer was: *{expected}*. You'll see this again soon.")

    pending = quiz_state["pending_phrases"]
    current_index = pending.index(phrase_id)
    remaining = pending[current_index + 1:]

    if not remaining:
        _finish_quiz(chat_id)
        return

    next_id = remaining[0]
    quiz_state["current_phrase_id"] = next_id
    quiz_state["pending_phrases"] = remaining
    _session.set_quiz_state(chat_id, quiz_state)
    _send_question(chat_id, quiz_state["phrases"][next_id])


def _send_question(chat_id: str, phrase: dict) -> None:
    japanese = phrase["japanese"][0]
    _send(chat_id, f"🇯🇵 {japanese}\n\nHow do you say this in English?")


def _finish_quiz(chat_id: str) -> None:
    _session.clear_quiz_state(chat_id)
    _send(chat_id, "🎉 Quiz done! Great work.")


def _send(chat_id: str, text: str) -> None:
    requests.post(
        f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
        json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"},
    )
