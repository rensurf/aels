import json
from src.llm.client import chat

_SYSTEM = """You are a professional English teacher and linguist.
Given a verb, return a JSON object describing its usage patterns using the Japanese 5-sentence-pattern (五文型) system.

JSON format:
{
  "patterns": [
    {
      "code": "V3",
      "description": "他動詞（目的語を取る）",
      "examples": ["I heard a noise.", "Did you hear that?"]
    }
  ],
  "confusable_with": ["listen"],
  "similar_to": ["catch", "pick up"],
  "noun_form": "hearing",
  "adj_form": null
}

Pattern codes and their meanings (only include patterns the verb actually uses):
- V1: S+V — 自動詞（目的語なし）e.g. "The sun rises."
- V2: S+V+C — 連結動詞（主語補語を取る）e.g. "She became famous."
- V3: S+V+O — 他動詞（名詞・that節・wh節すべてV3でまとめる）e.g. "I heard a noise." / "I heard that she left."
- V4: S+V+O+O — 授与動詞（目的語を2つ取る）e.g. "She gave me a book."
- V5: S+V+O+C — 複合他動詞（目的語と補語を取る。原形不定詞・-ing・形容詞・名詞補語を含む）e.g. "I heard him sing." / "I found it interesting."

Rules:
- descriptions must be in Japanese
- Include 1-2 natural, varied example sentences per pattern
- Only set noun_form / adj_form to a string if they exist, otherwise null
- confusable_with: verbs commonly confused with this one (empty list if none)
- similar_to: synonyms or near-synonyms (empty list if none)
"""


def generate_verb_patterns(base: str) -> dict:
    """Call LLM to generate OALD-style patterns for a verb. Always uses OpenAI for consistency."""
    messages = [
        {"role": "system", "content": _SYSTEM},
        {"role": "user", "content": f"Verb: {base}"},
    ]
    raw = chat(messages, json_mode=True, max_tokens=1200, provider="openai")
    data = json.loads(raw)
    verb: dict = {
        "verb_id": base.lower(),
        "base": base.lower(),
        "patterns": data.get("patterns", []),
        "confusable_with": data.get("confusable_with", []),
        "similar_to": data.get("similar_to", []),
    }
    if data.get("noun_form"):
        verb["noun_form"] = data["noun_form"]
    if data.get("adj_form"):
        verb["adj_form"] = data["adj_form"]
    return verb
