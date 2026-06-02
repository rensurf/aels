import json

from src.llm.client import chat


def detect_intent(user_message: str, quiz_state: dict) -> str:
    """
    Returns "answer" or "question".
    When ambiguous, defaults to "question" to avoid advancing the quiz incorrectly.
    """
    current_id = quiz_state.get("current_phrase_id", "")
    phrases = quiz_state.get("phrases", {})
    current_phrase = phrases.get(current_id, {})
    japanese = current_phrase.get("japanese", [""])[0]

    last_feedback = quiz_state.get("last_feedback")
    feedback_context = ""
    if last_feedback:
        feedback_context = f"""
Last answer: "{last_feedback.get('user_answer', '')}"
Last feedback: {last_feedback.get('note', '')} (Expected: "{last_feedback.get('expected', '')}")"""

    prompt = f"""You are helping route a message during an English learning quiz.

Current quiz question: 「{japanese}」{feedback_context}
User's message: "{user_message}"

Classify the user's message into one of three intents:

- "answer": the user is attempting an English translation
- "give_up": the user doesn't know the answer and wants to skip (e.g. "わからない", "skip", "pass", "don't know", "no idea", "教えて", "次へ")
- "question": the user is asking something (why wrong, grammar explanation, clarification, etc.)

When in doubt, choose "question" to avoid advancing the quiz incorrectly.

Respond in JSON: {{"intent": "answer" | "give_up" | "question"}}"""

    raw = chat(
        [{"role": "user", "content": prompt}],
        json_mode=True,
        max_tokens=20,
    ) or "{}"
    data = json.loads(raw)
    intent = data.get("intent", "question").strip().lower()

    return intent if intent in ("answer", "give_up", "question") else "question"
