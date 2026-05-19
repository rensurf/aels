import json
from dataclasses import dataclass

from openai import OpenAI

client = OpenAI()

_QUALITY_MAP = {"correct": 5, "close": 3, "wrong": 1}


@dataclass
class EvalResult:
    quality: int
    matched_phrase_id: str | None
    note: str


def evaluate_answer(japanese: str, candidates: list[dict], user_answer: str) -> EvalResult:
    """
    Args:
        candidates: [{"phrase_id": "...", "text": "Got it"}, ...]
    """
    candidate_lines = "\n".join(
        f'[{i + 1}] "{c["text"]}" (id: {c["phrase_id"]})'
        for i, c in enumerate(candidates)
    )

    prompt = f"""You are grading an English learning exercise. Be strict.

Japanese phrase: {japanese}
User's answer: {user_answer}

Valid English translations (find the best match):
{candidate_lines}

Grade using exactly these criteria:
"correct": Same meaning, grammatically complete. Natural synonyms or paraphrases are OK.
"close": Grammar, tense, prepositions, and articles are all correct — but the register or formality level differs from the matched phrase.
"wrong": Any of the following applies:
  - Missing a required object or subject
  - Wrong or missing article (a / the)
  - Wrong tense
  - Wrong preposition
  - Incorrect or unrelated meaning — does not match any candidate

Set matched_phrase_id to the id of the best-matching candidate, or null if wrong.

Respond in JSON: {{"matched_phrase_id": "..." | null, "judgment": "correct" | "close" | "wrong", "note": "one sentence explaining why if close or wrong, otherwise empty string"}}"""

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=100,
        response_format={"type": "json_object"},
    )

    raw = response.choices[0].message.content or "{}"
    data = json.loads(raw)
    judgment = data.get("judgment", "wrong").strip().lower()
    matched_phrase_id = data.get("matched_phrase_id")
    note = data.get("note", "")

    valid_ids = {c["phrase_id"] for c in candidates}
    if matched_phrase_id not in valid_ids:
        matched_phrase_id = None

    return EvalResult(
        quality=_QUALITY_MAP.get(judgment, 1),
        matched_phrase_id=matched_phrase_id,
        note=note,
    )
