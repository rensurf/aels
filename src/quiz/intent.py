import json

from openai import OpenAI

client = OpenAI()


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

Is this message a quiz answer (the user is attempting to answer the question) or a follow-up question (the user is asking about the quiz, grammar, or a previous feedback)?

- "answer": the user is attempting an English translation
- "question": the user is asking something (why wrong, grammar explanation, clarification, etc.)

When in doubt, choose "question" to avoid advancing the quiz incorrectly.

Respond in JSON: {{"intent": "answer" | "question"}}"""

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=20,
        response_format={"type": "json_object"},
    )

    raw = response.choices[0].message.content or "{}"
    data = json.loads(raw)
    intent = data.get("intent", "question").strip().lower()

    return intent if intent in ("answer", "question") else "question"
