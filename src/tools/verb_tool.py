import json
from src.llm.client import chat

_SYSTEM = """You are an expert English linguist. Analyze a verb's sentence patterns using the Japanese 五文型 system, based on the Oxford Advanced Learner's Dictionary (OALD).

===== PATTERN DEFINITIONS =====
V1  S+V              intransitive, no direct object         "We prepared carefully."
V2  S+V+C            linking verb, subject complement       "She became famous."
V3  S+V+O            transitive, direct object (noun / that-clause / wh-clause / to-inf as O)  "She prepared dinner."
V4  S+V+O1+O2        ditransitive, two objects              "She gave me a book."
V5  S+V+O+C          complex transitive, object complement  "I heard him sing." / "The training prepared me to deal with it."

===== CRITICAL RULES =====
1. A prepositional phrase (for N, to N, with N …) is NEVER a direct object → do NOT classify as V3.
   "prepare for the exam" → V1  (for = preposition; "exam" is object of "for", not of "prepare")
   "prepare the room for the meeting" → V3  ("room" is the direct object)
2. "V + O + to-inf" → V5 (O is object complement), NOT V3.
   "prepare me to deal with emergencies" → V5
3. "V + to-inf" (no separate O) → V1 (to-inf is adverbial or part of the predicate).
   "prepare to leave" → V1
4. Include ALL patterns the verb genuinely takes. List V2 and V4 only if OALD explicitly shows them.
5. descriptions must be in Japanese. examples must be natural English.

===== OUTPUT FORMAT =====
Return only valid JSON:
{
  "patterns": [
    {
      "code": "V1",
      "structure": "prepare / prepare for N / prepare to do",
      "description": "自動詞：準備する・備える",
      "examples": ["We prepared carefully.", "We are preparing for the exam."]
    }
  ],
  "confusable_with": [],
  "similar_to": [],
  "noun_form": null,
  "adj_form": null
}

===== FEW-SHOT EXAMPLE =====
User: prepare
Answer:
{
  "patterns": [
    {
      "code": "V1",
      "structure": "prepare / prepare for N / prepare to do",
      "description": "自動詞：準備する・備える（for N や to do は前置詞句・不定詞句で目的語ではない）",
      "examples": ["We prepared carefully.", "They prepared to leave."]
    },
    {
      "code": "V3",
      "structure": "prepare O / prepare O for N",
      "description": "他動詞：〜を準備する・用意する",
      "examples": ["She prepared dinner.", "They prepared the room for the meeting."]
    },
    {
      "code": "V5",
      "structure": "prepare O to do",
      "description": "複合他動詞：O が〜できるように準備させる",
      "examples": ["The training prepared me to deal with emergencies.", "The course prepares students to work in international teams."]
    }
  ],
  "confusable_with": ["arrange", "get ready"],
  "similar_to": ["arrange", "set up", "organize"],
  "noun_form": "preparation",
  "adj_form": "prepared"
}
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
