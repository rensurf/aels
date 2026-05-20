import json

from openai import OpenAI

from src.config import OPENAI_API_KEY

client = OpenAI(api_key=OPENAI_API_KEY)

prompt = """You are an English teacher helping a Japanese software engineer living in Australia.

When given Japanese text, provide 2-3 English translation options.
Cover a range of situations — casual conversations, workplace settings, social interactions.
For each option, note where it would naturally be used.

Return JSON in this exact format:
{
  "translations": [
    {
      "text": "Got it",
      "context": "casual",
      "note": "Works in everyday conversation and at work"
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
    response = client.chat.completions.create(
        model="gpt-4o",
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
            "japanese": japanese_text,
            "context": t.get("context", ""),
            "note": t.get("note", ""),
        }
        for t in translations
    ]

    if phrases:
        from src.session.client import SessionClient
        from src.config import DYNAMODB_SESSION_TABLE
        SessionClient(table_name=DYNAMODB_SESSION_TABLE).set_pending_phrases(user_id, phrases)

    return translations
