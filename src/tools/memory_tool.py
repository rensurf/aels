import uuid
from collections import defaultdict
from typing import Any

from openai import OpenAI
from src.config import COSMOS_DATABASE, COSMOS_ENDPOINT, COSMOS_GRAPH, COSMOS_KEY
from src.graph import queries
from src.graph.client import GremlinClient
from src.graph.queries import _esc


client = GremlinClient(endpoint=COSMOS_ENDPOINT,
                       key=COSMOS_KEY,
                       database=COSMOS_DATABASE,
                       graph=COSMOS_GRAPH)

_VALID_PATTERNS = frozenset({
    "preposition", "phrasal_verb", "collocation",
    "formal_informal", "tense", "modal_verb",
    "article", "verb_pattern", "other"
})


def _ensure_user_exists(user_id: str) -> None:
    existing = client.execute(f"g.V().has('user', 'user_id', '{_esc(user_id)}')")
    if not existing:
        client.execute(queries.create_user(user_id=user_id, name=user_id, goal="Work in Australia"))


def _classify_pattern(text: str, japanese: str, note: str) -> str:
    try:
        oai = OpenAI()
        prompt = f"""Classify this English phrase into exactly one category.

English: {text}
Japanese: {japanese}
Note: {note}

Categories:
- preposition: correct preposition choice (work on/at/in, good at)
- phrasal_verb: verb + particle (look into, deal with, get along with)
- collocation: fixed word combinations (make a decision, pay attention)
- formal_informal: register distinction (Got it vs. Certainly)
- tense: tense or aspect usage (have been working, used to)
- modal_verb: modal verb choice (could/would/should)
- article: a/an/the usage (give feedback vs. give the feedback)
- verb_pattern: verb complement structure (suggest doing, find it hard to)
- other: doesn't fit the above

Respond with exactly one word from the list above."""

        response = oai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=10,
        )
        result = (response.choices[0].message.content or "other").strip().lower()
        return result if result in _VALID_PATTERNS else "other"
    except Exception:
        return "other"


def _get_or_create_pattern(name: str, user_id: str) -> str:
    existing = client.execute(queries.find_pattern(name=name, user_id=user_id))
    if existing:
        return existing[0]["pattern_id"][0]
    pattern_id = str(uuid.uuid4())
    client.execute(queries.create_pattern(pattern_id=pattern_id, name=name, user_id=user_id))
    return pattern_id


def do_save_phrases(phrases: list[dict], user_id: str) -> str:
    """Actually persist phrases to CosmosDB. Called after user confirms via button."""
    _ensure_user_exists(user_id)
    for phrase in phrases:
        phrase_id = str(uuid.uuid4())
        text = phrase.get("text", "")
        japanese = phrase.get("japanese", "")
        note = phrase.get("note", "")

        client.execute(queries.create_phrase(
            phrase_id=phrase_id,
            text=text,
            japanese=japanese,
            note=note,
            user_id=user_id
        ))
        client.execute(queries.link_user_to_phrase(user_id=user_id, phrase_id=phrase_id))

        pattern_name = _classify_pattern(text=text, japanese=japanese, note=note)
        pattern_id = _get_or_create_pattern(name=pattern_name, user_id=user_id)
        client.execute(queries.link_phrase_to_pattern(phrase_id=phrase_id, pattern_id=pattern_id))

    return f"Saved {len(phrases)} phrase(s) successfully."


def save_phrases(phrases: list[dict], user_id: str) -> str:
    """
    Propose English phrases to save. The user will confirm or skip via a button.

    Args:
        phrases: List of phrase objects, each with:
            - text: English phrase (str)
            - japanese: Japanese meaning (str)
            - note: Additional notes (str)
        user_id: The user's Telegram user ID
    """
    from src.session.client import SessionClient
    from src.config import DYNAMODB_SESSION_TABLE
    print(f"[debug] save_phrases called: user_id={user_id} phrases={phrases}")
    SessionClient(table_name=DYNAMODB_SESSION_TABLE).set_pending_phrases(user_id, phrases)
    return f"Queued {len(phrases)} phrase(s) for user confirmation."


def search_phrases(query_text: str, user_id: str) -> list[dict]:
    result = client.execute(queries.search_phrases(user_id=user_id))
    items = [dict(zip(res.keys(), res.values())) for res in result]
    q = query_text.lower()
    return [item for item in items if q in str(item.get("text", "")).lower()]


def get_recent_phrases(user_id: str, limit: int) -> list[dict]:
    result = client.execute(queries.get_recent_phrases(user_id=user_id))
    items = [dict(zip(res.keys(), res.values())) for res in result]
    items.sort(key=lambda x: x.get("created_at", [""])[0], reverse=True)
    return items[:limit]


def get_progress(user_id: str) -> dict:
    from datetime import date
    today = date.today().isoformat()

    phrase_rows = client.execute(queries.get_all_phrases(user_id))
    total_phrases = len(phrase_rows)

    sm2_rows = client.execute(queries.get_all_sm2_data(user_id))
    due_today = sum(1 for r in sm2_rows if r.get("due_date", "9999-99-99") <= today)

    weakness = get_weakness_summary(user_id)

    return {
        "total_phrases": total_phrases,
        "due_today": due_today,
        "weakness": weakness,
    }


def get_weakness_summary(user_id: str) -> dict:
    """
    Summarize the user's weakest patterns based on SM-2 ease_factor.
    ease_factor drops below 2.0 when a phrase has been answered wrong multiple times.

    Args:
        user_id: The user's Telegram user ID
    """
    sm2_rows = client.execute(queries.get_all_sm2_data(user_id))
    sm2_by_phrase = {r["phrase_id"]: r for r in sm2_rows}

    phrase_rows = client.execute(queries.get_all_phrases(user_id))
    phrase_by_id = {p["phrase_id"][0]: p for p in phrase_rows}

    pattern_rows = client.execute(queries.get_phrase_patterns(user_id))
    pattern_by_phrase = {r["phrase_id"]: r["pattern_name"] for r in pattern_rows}

    pattern_data: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for phrase_id, sm2 in sm2_by_phrase.items():
        ease_factor = float(sm2.get("ease_factor", 2.5))
        pattern = pattern_by_phrase.get(phrase_id, "other")
        phrase = phrase_by_id.get(phrase_id, {})
        pattern_data[pattern].append({
            "text": phrase.get("text", [""])[0],
            "japanese": phrase.get("japanese", [""])[0],
            "ease_factor": ease_factor,
        })

    summary: list[dict[str, Any]] = []
    for pattern_name, phrase_list in pattern_data.items():
        weak_phrases = sorted(
            [p for p in phrase_list if p["ease_factor"] < 2.0],
            key=lambda p: p["ease_factor"]
        )
        if weak_phrases:
            summary.append({
                "pattern": pattern_name,
                "weak_phrase_count": len(weak_phrases),
                "examples": [
                    {"text": p["text"], "japanese": p["japanese"]}
                    for p in weak_phrases[:3]
                ],
            })

    summary.sort(key=lambda s: s["weak_phrase_count"], reverse=True)

    if not summary:
        return {"message": "No weak patterns yet. Keep practising and reviewing!", "patterns": []}

    return {"weakest_pattern": summary[0]["pattern"], "patterns": summary}
