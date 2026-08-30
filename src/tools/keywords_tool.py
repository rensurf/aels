import json
from openai import OpenAI
from src.config import OPENAI_API_KEY

_client = OpenAI(api_key=OPENAI_API_KEY)

_SYSTEM = """You are a language coach helping a Japanese learner practice speaking English for Australian job interviews.

From the given script, generate a 3-level cue structure to help the learner recall the content while speaking.
Each level has named "chunks" (topic segments), each with a list of cue words/phrases.
Fewer cues appear at higher levels — the learner should be able to speak with less scaffolding over time.

Rules:
- Identify 2-4 natural "chunks" (topic segments) in the script
- Level 1: 5-8 cues per chunk (detailed, close to the original phrasing)
- Level 2: 3-4 cues per chunk (key ideas only)
- Level 3: 1-3 cues per chunk (bare minimum memory triggers)
- Cues should be short phrases or keywords, not full sentences
- Keep chunk names short (2-5 words)

Return ONLY valid JSON:
{
  "levels": {
    "1": [{"chunk": "...", "cues": ["...", "..."]}],
    "2": [{"chunk": "...", "cues": ["...", "..."]}],
    "3": [{"chunk": "...", "cues": ["...", "..."]}]
  }
}"""


def extract_levels(script: str) -> dict:
    resp = _client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": f"Script:\n{script}"},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
    )
    raw = resp.choices[0].message.content or "{}"
    try:
        return json.loads(raw).get("levels", {})
    except json.JSONDecodeError:
        return {}
