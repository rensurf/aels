import json

from openai import OpenAI

from src.config import OPENAI_API_KEY

client = OpenAI(api_key=OPENAI_API_KEY)

prompt = """You are an English teacher helping a Japanese software engineer living in Australia.

Given Japanese text, apply these rules:
- Single sentence or short phrase: provide exactly 3 different natural English expressions.
- Multiple sentences: provide exactly one natural English translation per sentence, in the same order.

Always use natural, spoken Australian English. Avoid textbook or overly formal phrasing.
For each item, note why it sounds natural or when to use it.

Return JSON in this exact format:
{
  "translations": [
    {
      "text": "The shower keeps going cold on me.",
      "japanese": "シャワーの水がたまに急に冷たくなること",
      "note": "Sounds natural and relatable — 'on me' adds a sense of personal frustration"
    }
  ]
}
"""

def translate_japanese(japanese_text: str, user_id: str) -> list[dict]:
    """
    Translate Japanese text into natural English options and queue them for saving.
    Single sentence → 3 alternatives. Multiple sentences → one translation per sentence.

    Args:
        japanese_text: The Japanese text to translate
        user_id: The user's Telegram user ID (from [user_id=...] in the message)
    """
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": japanese_text}
        ],
        response_format={"type": "json_object"}
    )
    result = response.choices[0].message.content or "{}"
    translations = json.loads(result).get("translations", [])

    phrases = [
        {
            "text": t.get("text", ""),
            "japanese": t.get("japanese", japanese_text),
            "note": t.get("note", ""),
        }
        for t in translations
    ]

    if phrases:
        from src.session.client import SessionClient
        from src.config import DYNAMODB_SESSION_TABLE
        SessionClient(table_name=DYNAMODB_SESSION_TABLE).append_pending_phrases(user_id, phrases)

    return translations
