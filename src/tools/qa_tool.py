import os

from openai import OpenAI

openai_api_key = os.getenv("OPENAI_API_KEY")

client = OpenAI(api_key=openai_api_key)

prompt = """You are an English teacher helping a Japanese software engineer living in Australia.

Answer questions about English usage, nuance, grammar, and natural expressions.
Questions may be written in Japanese, English, or a mix of both.

Keep explanations concise and practical. Always include a concrete example.
Focus on how native speakers actually use the language in daily life and at work.

"""

def answer_english_question(question: str) -> str:
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": question}
        ],
    )
    result = response.choices[0].message.content

    return result

