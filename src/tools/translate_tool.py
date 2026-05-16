import json
import os

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

openai_api_key = os.getenv("OPENAI_API_KEY")

client = OpenAI(api_key=openai_api_key)

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

def translate_japanese(japanese_text: str) -> list[dict]:
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": japanese_text}
        ],
        response_format={"type": "json_object"}  # forces JSON output
    )
    result = response.choices[0].message.content  # string of JSON

    return json.loads(result)["translations"]

