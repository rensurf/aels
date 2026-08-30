import json
from openai import OpenAI
from src.config import OPENAI_API_KEY

_client = OpenAI(api_key=OPENAI_API_KEY)

_SYSTEM = """You are an English coach helping a Japanese software engineer (Ren) prepare for job interviews in Australia.
Analyze the user's spoken English and return structured feedback in JSON.

Return ONLY valid JSON with this exact structure:
{
  "grammar": [
    {"original": "...", "corrected": "...", "note": "...（日本語で）"}
  ],
  "naturalness": [
    {"theirs": "...", "native": "...", "note": "...（日本語で）"}
  ],
  "phrases": [
    {"text": "...", "note": "...（日本語で）"}
  ],
  "overall": "brief encouraging comment in Japanese (1 sentence)",
  "coverage_score": 80
}

Rules:
- grammar: grammatical errors only (tense, articles, prepositions, subject-verb agreement)
- naturalness: correct but unnatural expressions that a native speaker wouldn't say; provide what they would say
- phrases: 2-3 strong collocations or expressions from the user's text worth keeping. If user's text has none, suggest phrases from the topic context that fit.
- Keep notes concise in Japanese
- If the text is mostly correct, return empty arrays for grammar/naturalness
- Do NOT repeat the same issue in both grammar and naturalness
- coverage_score (0-100): how well the user covered the key ideas listed in the bullet points.
  Count how many bullet ideas were meaningfully addressed (not necessarily verbatim), divide by total bullets, multiply by 100.
  If there is a reference script, also check if the user's content is roughly aligned with it."""


def analyze_speech(
    user_text: str,
    topic_title: str,
    bullets: list[dict],
    script: str = "",
) -> dict:
    ideas = "\n".join(
        f"- {b.get('en') or b.get('ja', '')}" for b in bullets
    ) if bullets else "(no ideas provided)"

    script_section = f"\nReference script (user's own draft):\n{script}" if script.strip() else ""

    prompt = f"""Topic: {topic_title}

Key ideas to cover (bullet points):
{ideas}{script_section}

User's spoken text:
{user_text}

Analyze and return JSON feedback. For coverage_score, count how many of the {len(bullets)} bullet ideas the user meaningfully addressed."""

    resp = _client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
    )
    raw = resp.choices[0].message.content or "{}"
    try:
        result = json.loads(raw)
        result.setdefault("coverage_score", 0)
        return result
    except json.JSONDecodeError:
        return {"grammar": [], "naturalness": [], "phrases": [], "overall": "フィードバックの取得に失敗しました。", "coverage_score": 0}
