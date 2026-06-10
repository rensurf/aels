import json

from src.llm.client import chat

prompt = """You are an English teacher helping a Japanese software engineer living in Australia.

When given Japanese text, provide exactly 3 English expressions that native Australian speakers actually use in everyday conversation.
Prioritise natural, spoken expressions — the kind you'd hear at a café, on the street, or chatting with colleagues.
Avoid textbook or overly formal phrasing.
Each "text" must be a complete, grammatically correct phrase or sentence. Do not cut off mid-phrase.
For each option, note why native speakers prefer it or when it sounds most natural.

Return JSON in this exact format:
{
  "translations": [
    {
      "text": "I tend to be easily influenced by others.",
      "note": "Natural and complete — 'tend to' softens the statement, sounds self-aware"
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
        model_tier="light",
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
