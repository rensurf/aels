import json
from dataclasses import dataclass

from openai import OpenAI

client = OpenAI()

_QUALITY_MAP = {"correct": 5, "close": 3, "wrong": 1}


@dataclass
class EvalResult:
    quality: int
    matched_phrase_id: str | None
    error_type: str | None
    explanation: str


def evaluate_answer(japanese: str, candidates: list[dict], user_answer: str) -> EvalResult:
    """
    Args:
        candidates: [{"phrase_id": "...", "text": "Got it"}, ...]
    """
    candidate_lines = "\n".join(
        f'[{i + 1}] "{c["text"]}" (id: {c["phrase_id"]})'
        for i, c in enumerate(candidates)
    )

    prompt = f"""You are grading an English learning exercise for a Japanese engineer preparing for work in Australia.

Japanese phrase: {japanese}
User's answer: {user_answer}

Valid English translations (find the best match):
{candidate_lines}

## Judgment criteria

"correct": The answer is acceptable. Be lenient on these:
  - Contractions are fine: "I'm" = "I am"
  - Minor intensifier differences: "really important" ≈ "very important"
  - British/American spelling: "colour" = "color"
  - Same meaning in different word order
  - Natural synonyms that preserve exact meaning and register

"close": Grammar, prepositions, articles, and tense are ALL correct — but ONLY the register or formality level differs.
  Example: answering "Got it" when the phrase is "Certainly" (same meaning, different formality).
  Do NOT use "close" for any grammar or vocabulary error — those are always "wrong".

"wrong": Any of the following applies:
  - Wrong preposition (e.g. "deal in" instead of "deal with")
  - Wrong or missing article when it changes meaning (e.g. "give the feedback" vs "give feedback")
  - Wrong tense
  - Wrong verb pattern (e.g. "suggest to do" instead of "suggest doing")
  - Missing required particle in a phrasal verb (e.g. "look" instead of "look into")
  - Missing required subject or object
  - Incorrect or unrelated meaning

## Response format

Set matched_phrase_id to the id of the best-matching candidate, or null if wrong.

For error_type, choose one: "preposition" | "article" | "tense" | "verb_pattern" | "phrasal_verb" | "register" | "missing_word" | "wrong_meaning" | "other" | null (if correct)

For explanation:
- If correct: empty string
- If close: one sentence on why it is close and when each form is preferred
- If wrong: explain specifically what is wrong, state the rule or pattern behind it, and contrast the user's answer with the correct one

Respond in JSON:
{{"matched_phrase_id": "..." | null, "judgment": "correct" | "close" | "wrong", "error_type": "..." | null, "explanation": "..."}}"""

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=200,
        response_format={"type": "json_object"},
    )

    raw = response.choices[0].message.content or "{}"
    data = json.loads(raw)
    judgment = data.get("judgment", "wrong").strip().lower()
    matched_phrase_id = data.get("matched_phrase_id")
    error_type = data.get("error_type")
    explanation = data.get("explanation", "")

    valid_ids = {c["phrase_id"] for c in candidates}
    if matched_phrase_id not in valid_ids:
        matched_phrase_id = None

    return EvalResult(
        quality=_QUALITY_MAP.get(judgment, 1),
        matched_phrase_id=matched_phrase_id,
        error_type=error_type,
        explanation=explanation,
    )
