import json

from src.llm.client import chat

_SYSTEM = """You extract vocabulary from English text for a Japanese learner (Ren).

Given a passage of English text, identify words and expressions worth learning.
Focus on:
- Nouns (academic, technical, or useful everyday words) → type: "noun"
- Adjectives (especially those expressing nuance or tone) → type: "adjective"
- Collocations (verb+noun, adj+noun pairs that appear naturally together) → type: "collocation"
- Idioms (multi-word fixed expressions) → type: "idiom"

For each item, return:
- "word": the word or phrase (noun/adjective in dictionary form; collocation/idiom as it appears naturally)
- "japanese": natural Japanese translation
- "type": "noun" | "adjective" | "collocation" | "idiom"
- "note": 1-2 sentences in Japanese. Key nuance, typical usage, or a pattern to remember.
- "example": one natural English sentence using the word in context (can be from the text)

Return JSON with a single key "items" containing an array. Aim for 5-10 items.
Skip very basic words (the, is, have, get, go, say, etc.).
Respond with JSON only.
"""

_FEW_SHOT: list[dict] = [
    {
        "role": "user",
        "content": "Those who succeed tend to treat failure as feedback rather than a signal to give up. Be deliberate about your practice. Every cue in your environment can either support or undermine your habits.",
    },
    {
        "role": "assistant",
        "content": '{"items": [{"word": "deliberate", "japanese": "意図的な・故意の", "type": "adjective", "note": "意識的かつ目的をもって行われること。deliberate practiceで意図的な練習という意味で頻出。", "example": "Be deliberate about the habits you want to build."}, {"word": "cue", "japanese": "きっかけ・合図", "type": "noun", "note": "習慣ループのトリガー。habit = cue + routine + rewardという文脈でよく使われる。", "example": "A visual cue can remind you to take action."}, {"word": "treat A as B", "japanese": "AをBとして扱う", "type": "collocation", "note": "AをBとみなして扱うという便利なコロケーション。treat failure as feedbackのように使う。", "example": "Try to treat every mistake as a learning opportunity."}]}',
    },
]


def extract_vocab(text: str) -> list[dict]:
    """Extract vocabulary items from a passage of English text."""
    messages = [
        {"role": "system", "content": _SYSTEM},
        *_FEW_SHOT,
        {"role": "user", "content": text},
    ]
    raw = chat(messages, json_mode=True, max_tokens=2000, provider="openai")
    data = json.loads(raw)
    items = data.get("items", [])
    if not isinstance(items, list):
        return []
    result = []
    for item in items:
        if isinstance(item, dict) and item.get("word"):
            result.append({
                "word": item.get("word", ""),
                "japanese": item.get("japanese", ""),
                "type": item.get("type", "noun"),
                "note": item.get("note", ""),
                "example": item.get("example", ""),
            })
    return result
