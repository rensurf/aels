import base64
import json
import os
import tempfile

from openai import OpenAI

_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        from src.config import OPENAI_API_KEY
        _client = OpenAI(api_key=OPENAI_API_KEY)
    return _client


def _ext_from_mime(mime_type: str) -> str:
    if "ogg" in mime_type:
        return "ogg"
    if "mp4" in mime_type or "m4a" in mime_type:
        return "mp4"
    if "wav" in mime_type:
        return "wav"
    return "webm"


def transcribe_audio(audio_base64: str, mime_type: str = "audio/webm") -> str:
    client = _get_client()
    audio_bytes = base64.b64decode(audio_base64)
    ext = _ext_from_mime(mime_type)

    with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as f:
        f.write(audio_bytes)
        tmp_path = f.name

    try:
        with open(tmp_path, "rb") as f:
            response = client.audio.transcriptions.create(
                model="whisper-1",
                file=f,
                language="en",
            )
        return response.text
    finally:
        os.unlink(tmp_path)


_SYSTEM_PROMPT = """\
You are an expert English teacher for Japanese speakers targeting Australian workplaces.

Analyze the English text and identify expressions that sound unnatural — not grammar errors, \
but phrasings that native English speakers rarely use, often because they're direct translations \
from Japanese or overly formal/literal constructions.

Examples of what to flag:
- "I want to know about this" → "I'd like to find out more about this"
  (want sounds blunt; native speakers soften requests)
- "It is very important thing" → "It's a really important thing" / "It matters a lot"
  (article + word choice)
- "I will do my best" → "I'll give it my best shot"
  (set phrase that sounds translated)
- "Please tell me your opinion" → "I'd love to hear your thoughts"
  (overly formal/literal)

Return a JSON object with key "corrections" containing an array. Each item has:
- "original": exact phrase from the text (a few words to a sentence)
- "corrected": the natural English version
- "note": 1-2 sentences on WHY the original sounds unnatural to native speakers

If the text is already natural, return {"corrections": []}.
Return ONLY valid JSON.
"""


def analyze_corrections(transcript: str) -> list[dict]:
    client = _get_client()
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": f"Analyze:\n\n{transcript}"},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
    )
    content = response.choices[0].message.content or "{}"
    data = json.loads(content)
    if isinstance(data, list):
        return data
    return data.get("corrections", [])
