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
    phrases_map = {p["phrase_id"][0]: p for p in due_phrases}

    due_ids = set(phrase_ids)
    not_due_hints: dict[str, list[str]] = {}
    for pid, phrase in phrase_by_id.items():
        if pid not in due_ids:
            jp = phrase["japanese"][0]
            if any(phrases_map[did]["japanese"][0] == jp for did in due_ids):
                not_due_hints.setdefault(jp, []).append(phrase["text"][0])

    _session.set_quiz_state(chat_id, {
        "pending_phrases": phrase_ids,
        "current_phrase_id": phrase_ids[0],
        "user_id": user_id,
        "phrases": phrases_map,
        "not_due_hints": not_due_hints,
    })

    hints = _build_hints(phrases_map, phrase_ids, due_phrases[0]["japanese"][0], not_due_hints)
    _send_question(chat_id, due_phrases[0], hints)


def handle_quiz_answer(chat_id: str, user_answer: str) -> None:
    quiz_state = _session.get_quiz_state(chat_id)
    if not quiz_state:
        return

    user_id = quiz_state["user_id"]
    current_id = quiz_state["current_phrase_id"]
    current_phrase = quiz_state["phrases"][current_id]
    japanese = current_phrase["japanese"][0]
    pending = list(quiz_state["pending_phrases"])

    # Build candidates from all pending phrases with same Japanese
    candidates = [
        {"phrase_id": pid, "text": quiz_state["phrases"][pid]["text"][0]}
        for pid in pending
        if quiz_state["phrases"][pid]["japanese"][0] == japanese
    ]

    eval_result = evaluate_answer(japanese=japanese, candidates=candidates, user_answer=user_answer)

    # Determine which phrase to record: matched one, or current if wrong
    target_id = eval_result.matched_phrase_id if eval_result.matched_phrase_id else current_id
    target_phrase = quiz_state["phrases"][target_id]

    result = calculate_next_review(
        ease_factor=float(target_phrase.get("ease_factor", [2.5])[0]),
        interval=int(target_phrase.get("interval", [0])[0]),
        repetitions=int(target_phrase.get("repetitions", [0])[0]),
        quality=eval_result.quality,
    )
    _graph.execute(queries.update_sm2(
        user_id=user_id,
        phrase_id=target_id,
        ease_factor=result.ease_factor,
        interval=result.interval,
        repetitions=result.repetitions,
        due_date=result.due_date,
    ))

    # Sync updated SM-2 values into quiz_state so re-attempts use fresh data
    quiz_state["phrases"][target_id] = {
        **quiz_state["phrases"][target_id],
        "ease_factor": [result.ease_factor],
        "interval": [result.interval],
        "repetitions": [result.repetitions],
        "due_date": [result.due_date],
    }

    target_text = target_phrase["text"][0]
    if eval_result.quality == 5:
        _send(chat_id, f"✅ Correct! Next review in {result.interval} day(s).")
    elif eval_result.quality == 3:
        lines = [f"🟡 Close! The answer was: *{target_text}*", ""]
        lines.append(f"Your answer: \"{user_answer}\"")
        if eval_result.explanation:
            lines.append(eval_result.explanation)
        lines.append(f"Next review in {result.interval} day(s).")
        _send(chat_id, "\n".join(lines))
    else:
        lines = [f"❌ The answer was: *{target_text}*", ""]
        lines.append(f"Your answer: \"{user_answer}\"")
        if eval_result.error_type:
            lines.append(f"Problem: {eval_result.error_type.replace('_', ' ').title()}")
        if eval_result.explanation:
            lines.append(eval_result.explanation)
        lines.append("You'll see this again shortly.")
        _send(chat_id, "\n".join(lines))

    quiz_state["last_feedback"] = {
        "japanese": japanese,
        "user_answer": user_answer,
        "expected": target_text,
        "note": eval_result.explanation,
    }

    pending.remove(target_id)

    # Re-queue wrong answers for another attempt in this session
    if eval_result.quality == 1:
        pending.append(target_id)

    if not pending:
        _finish_quiz(chat_id)
        return

    next_id = pending[0]
    quiz_state["pending_phrases"] = pending
    quiz_state["current_phrase_id"] = next_id
    _session.set_quiz_state(chat_id, quiz_state)

    next_phrase = quiz_state["phrases"][next_id]
    next_japanese = next_phrase["japanese"][0]
    hints = _build_hints(quiz_state["phrases"], pending, next_japanese, quiz_state.get("not_due_hints", {}))
    _send_question(chat_id, next_phrase, hints)


def handle_quiz_give_up(chat_id: str) -> None:
    quiz_state = _session.get_quiz_state(chat_id)
    if not quiz_state:
        return

    user_id = quiz_state["user_id"]
    current_id = quiz_state["current_phrase_id"]
    current_phrase = quiz_state["phrases"][current_id]
    target_text = current_phrase["text"][0]
    pending = list(quiz_state["pending_phrases"])

    _send(chat_id, f"❌ The answer was: *{target_text}*\nYou'll see this again shortly.")

    result = calculate_next_review(
        ease_factor=float(current_phrase.get("ease_factor", [2.5])[0]),
        interval=int(current_phrase.get("interval", [0])[0]),
        repetitions=int(current_phrase.get("repetitions", [0])[0]),
        quality=1,
    )
    _graph.execute(queries.update_sm2(
        user_id=user_id,
        phrase_id=current_id,
        ease_factor=result.ease_factor,
        interval=result.interval,
        repetitions=result.repetitions,
        due_date=result.due_date,
    ))

    quiz_state["phrases"][current_id] = {
        **quiz_state["phrases"][current_id],
        "ease_factor": [result.ease_factor],
        "interval": [result.interval],
        "repetitions": [result.repetitions],
        "due_date": [result.due_date],
    }

    pending.remove(current_id)

    if not pending:
        _finish_quiz(chat_id)
        return

    next_id = pending[0]
    quiz_state["pending_phrases"] = pending
    quiz_state["current_phrase_id"] = next_id
    _session.set_quiz_state(chat_id, quiz_state)

    next_phrase = quiz_state["phrases"][next_id]
    next_japanese = next_phrase["japanese"][0]
    hints = _build_hints(quiz_state["phrases"], pending, next_japanese, quiz_state.get("not_due_hints", {}))
    _send_question(chat_id, next_phrase, hints)


def _build_hints(phrases_map: dict, pending: list, japanese: str, not_due_hints: dict) -> list[str]:
    completed = [
        phrases_map[pid]["text"][0]
        for pid in phrases_map
        if pid not in pending and phrases_map[pid]["japanese"][0] == japanese
    ]
    static = not_due_hints.get(japanese, [])
    return completed + static


def _send_question(chat_id: str, phrase: dict, hints: list[str] = []) -> None:
    japanese = phrase["japanese"][0]
    lines = [f"🇯🇵 {japanese}"]
    if hints:
        not_str = ", ".join(f'"{t}"' for t in hints)
        lines.append(f"\n_(Not: {not_str})_")
    lines.append("\nHow do you say this in English?")
    _send(chat_id, "\n".join(lines))


def _finish_quiz(chat_id: str) -> None:
    _session.clear_quiz_state(chat_id)
    _send(chat_id, "🎉 Quiz done! Great work.")


def _send(chat_id: str, text: str) -> None:
    requests.post(
        f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
        json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"},
    )
