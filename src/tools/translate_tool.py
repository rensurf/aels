import json

from src.llm.client import chat

prompt = """You are an English teacher helping a Japanese software engineer.

When given Japanese text, provide exactly 3 natural English expressions.
Each expression should sound like something a native English speaker would naturally say in everyday conversation.
Each "text" must be a complete, grammatically correct phrase or sentence. Do not cut off mid-phrase.
For each option, briefly note when it's most natural or how it differs from the others.

Return JSON in this exact format:
{
  "translations": [
    {
      "text": "I tend to be easily influenced by others.",
      "note": "Natural and conversational — 'tend to' softens the statement"
    }
  ]
}
"""

def translate_japanese(japanese_text: str, user_id: str) -> list[dict]:
    """
    Translate Japanese text into natural English options and queue them for saving.

    Args:
        japanese_text: The Japanese text to translate
        user_id: The user's Telegram user ID (from [user_id=...] in the message)
    """
    result = chat(
        [
            {"role": "system", "content": prompt},
            {"role": "user", "content": japanese_text},
        ],
        json_mode=True,
        model_tier="main",
    ) or "{}"
    translations = json.loads(result).get("translations", [])

    phrases = [
        {
            "text": t.get("text", ""),
            "japanese": japanese_text,
            "note": t.get("note", ""),
        }
        for t in translations
    ]

    if phrases:
        from src.session.client import SessionClient
        from src.config import DYNAMODB_SESSION_TABLE
        SessionClient(table_name=DYNAMODB_SESSION_TABLE).append_pending_phrases(user_id, phrases)

    return translations
