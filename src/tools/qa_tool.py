from src.llm.client import chat

prompt = """You are an English teacher helping a Japanese software engineer living in Australia.

Answer questions about English usage, nuance, grammar, and natural expressions.
Questions may be written in Japanese, English, or a mix of both.

Keep explanations concise and practical. Always include a concrete example.
Focus on how native speakers actually use the language in daily life and at work.

"""

def answer_english_question(question: str) -> str:
    print(f"[debug] answer_english_question called: question={question[:80]}")
    result = chat(
        [
            {"role": "system", "content": prompt},
            {"role": "user", "content": question},
        ],
        max_tokens=500,
    )

    return result or ""

