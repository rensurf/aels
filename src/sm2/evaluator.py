import json
from dataclasses import dataclass

from src.llm.client import chat

_QUALITY_MAP = {"correct": 5, "close": 3, "wrong": 1}


@dataclass
class EvalResult:
    quality: int
    matched_phrase_id: str | None
    error_type: str | None
    explanation: str


def _normalize(text: str) -> str:
    return text.strip().rstrip(".,!?…").lower()


def evaluate_answer(
    japanese: str,
    candidates: list[dict],
    user_answer: str,
    excluded_phrases: list[str] | None = None,
) -> EvalResult:
    """
    Args:
        candidates: [{"phrase_id": "...", "text": "Got it"}, ...]
        excluded_phrases: other valid translations that must NOT be accepted here
    """
    normalized_answer = _normalize(user_answer)
    for c in candidates:
        if _normalize(c["text"]) == normalized_answer:
            return EvalResult(quality=5, matched_phrase_id=c["phrase_id"], error_type=None, explanation="")

    candidate_lines = "\n".join(
        f'[{i + 1}] "{c["text"]}" (id: {c["phrase_id"]})'
        for i, c in enumerate(candidates)
    )

    excluded_section = ""
    if excluded_phrases:
        excluded_lines = "\n".join(f'  - "{p}"' for p in excluded_phrases)
        excluded_section = f"""
Excluded answers (other saved phrases — do NOT accept these as correct here):
{excluded_lines}
"""

    prompt = f"""You are grading an English learning exercise for a Japanese engineer preparing for work in Australia.

Japanese phrase: {japanese}
User's answer: {user_answer}

Target phrase (the user must match this specifically):
{candidate_lines}
{excluded_section}
## CRITICAL RULE

The user must reproduce the target phrase — not just provide any valid English translation.
Even if the user's answer correctly translates the Japanese, mark it "wrong" unless it closely matches the listed target.
This is a memorisation exercise: we test recall of a specific phrase, not translation ability.

## Judgment criteria

"correct": The answer closely matches the target phrase. Be lenient only on:
  - Contractions: "I'm" = "I am"
  - Minor intensifier differences: "really important" ≈ "very important"
  - British/American spelling: "colour" = "color"
  - Trivial word-order variation with identical meaning and register
  - Obvious typos that do not change pronunciation or meaning (e.g. "inspcetion" → "inspection", "oppotunity" → "opportunity") — MUST be treated as correct even if combined with other minor issues
  - Trailing filler or casual expressions appended after the phrase (e.g. "lol", "haha", "lmao") — ignore completely
  - Missing or extra punctuation at the end (period, "...", "!", etc.)
  - Case differences (uppercase vs lowercase)

"close": Either of the following applies:
  1. ONLY the register/formality level differs from the target (grammar, prepositions, articles, and tense are all correct).
     Example: answering "Got it" when the phrase is "Certainly".
  2. A determiner is swapped for one that is semantically interchangeable in context ("this" ↔ "the", "a" ↔ "the") and everything else matches.
     Example: "Let's take this opportunity to get to know each other" when the target is "Let's take the opportunity to get to know each other".
  Do NOT use "close" for vocabulary, preposition, tense, or verb pattern differences — those are always "wrong".

"wrong": Any of the following applies:
  - The answer is a different phrase, even if it is a valid translation
  - Wrong preposition, article, tense, or verb pattern
  - Missing required particle or word
  - Incorrect or unrelated meaning

## Response format

Set matched_phrase_id to the id of the matching candidate, or null if wrong.

For error_type, choose one: "preposition" | "article" | "tense" | "verb_pattern" | "phrasal_verb" | "register" | "missing_word" | "wrong_meaning" | "other" | null (if correct)

For explanation:
- If correct: empty string
- If close: one sentence on why it is close and when each form is preferred
- If wrong: explain specifically what is wrong and contrast with the correct phrase

Respond in JSON:
{{"matched_phrase_id": "..." | null, "judgment": "correct" | "close" | "wrong", "error_type": "..." | null, "explanation": "..."}}"""

    raw = chat(
        [{"role": "user", "content": prompt}],
        json_mode=True,
        max_tokens=200,
    ) or "{}"
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
