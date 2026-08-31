import json

from src.llm.client import chat

_SYSTEM = """You analyze English phrases and expressions for a Japanese learner (Ren).

Given an English phrase or expression, return JSON with these fields:
- "japanese": natural Japanese translation (concise, 1 phrase max)
- "type": classify the expression:
    "sentence"      — complete sentence or clause (e.g. "I haven't had it in ages")
    "phrasal_verb"  — verb + particle (e.g. "come across", "get to work", "look forward to")
    "idiom"         — multi-word idiom (e.g. "have to do with", "be worth doing", "make up for")
    "fixed_phrase"  — prepositional/adverbial fixed expression (e.g. "in need of", "on occasion", "by all means")
- "verb_id": main verb in base form, lowercase. Use "" for fixed_phrase with no clear main verb.
- "note": 1–2 sentences in Japanese. When/how to use it, key nuance, or a common pattern to remember.
- "register": "formal" or "informal"
- "example": one natural English sentence showing how to use the expression in context.

Respond with JSON only. No explanation outside the JSON.
"""

_FEW_SHOT: list[dict] = [
    {"role": "user", "content": "come across"},
    {"role": "assistant", "content": '{"japanese":"〜を偶然見つける・出会う","type":"phrasal_verb","verb_id":"come","note":"人や物を偶然発見する時に使う。come across as ... で「〜という印象を与える」という意味にもなる。","register":"informal","example":"I came across this article while browsing the internet."}'},
    {"role": "user", "content": "in need of"},
    {"role": "assistant", "content": '{"japanese":"〜を必要としている","type":"fixed_phrase","verb_id":"","note":"be in need of ... の形で使うことが多い。「困っている・欠乏している」というニュアンス。","register":"informal","example":"The shelter is in need of volunteers and donations."}'},
    {"role": "user", "content": "have to do with"},
    {"role": "assistant", "content": '{"japanese":"〜と関係がある","type":"idiom","verb_id":"have","note":"What does this have to do with ...? の形でよく使う。「関係がない」なら have nothing to do with。","register":"informal","example":"What does this have to do with the project deadline?"}'},
    {"role": "user", "content": "on occasion"},
    {"role": "assistant", "content": '{"japanese":"時々・たまに","type":"fixed_phrase","verb_id":"","note":"sometimes より少し書き言葉寄り。「特定の場面で」というニュアンスもある。","register":"informal","example":"On occasion, we grab lunch together as a team."}'},
    {"role": "user", "content": "get to work"},
    {"role": "assistant", "content": '{"japanese":"仕事にとりかかる・作業を始める","type":"phrasal_verb","verb_id":"get","note":"Let\'s get to work. のように「さあ始めよう」という場面で使う。get down to work も同じ意味。","register":"informal","example":"Alright, let\'s get to work — we have a lot to cover today."}'},
]


def analyze_phrase(text: str) -> dict:
    """Analyze an English phrase and return metadata for saving."""
    messages = [
        {"role": "system", "content": _SYSTEM},
        *_FEW_SHOT,
        {"role": "user", "content": text},
    ]
    raw = chat(messages, json_mode=True, max_tokens=400, provider="openai")
    data = json.loads(raw)
    return {
        "japanese": data.get("japanese", ""),
        "type": data.get("type", "sentence"),
        "verb_id": data.get("verb_id", ""),
        "note": data.get("note", ""),
        "register": data.get("register", "informal"),
        "example": data.get("example", ""),
    }
