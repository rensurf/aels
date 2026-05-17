from openai import OpenAI

client = OpenAI()

_QUALITY_MAP = {"correct": 5, "close": 3, "wrong": 1}


def evaluate_answer(japanese: str, expected: str, user_answer: str) -> int:
    prompt = f"""You are grading an English learning exercise.

Japanese phrase: {japanese}
Expected English: {expected}
User's answer: {user_answer}

Is the user's answer correct, close, or wrong?
- "correct": means the same thing, even if worded differently
- "close": the meaning is right but phrasing is unnatural or incomplete
- "wrong": incorrect or unrelated

Respond with exactly one word: correct, close, or wrong."""

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=10,
    )

    judgment = response.choices[0].message.content.strip().lower()

    return _QUALITY_MAP.get(judgment, 1)  # default to "wrong" if unexpected response