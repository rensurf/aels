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

The user has just recorded or written casual spoken English — like a personal journal entry or self-talk.
Your role is to give meaningful, holistic feedback, NOT to catch every minor imperfection.

STEP 1: Read the ENTIRE passage first to understand context and recurring patterns before judging anything.

STEP 2: Write a "summary" in Japanese (3-5 sentences) covering:
  - What worked well (content coherence, idea flow, vocabulary that landed naturally)
  - 1-2 recurring patterns to be aware of (e.g., overuse of filler words, pronoun ambiguity, direct-translation artifacts from Japanese)
  - One specific encouraging observation about their progress

STEP 3: Select 4-8 of the MOST IMPACTFUL corrections — expressions that:
  - Sound distinctly unnatural to Australian native speakers
  - Likely come from direct Japanese-to-English translation habits
  - Would confuse or noticeably distract a listener

DO NOT flag:
  - Simple contractions ("I will" → "I'll") — perfectly fine in casual speech
  - Filler words like "like", "um", "you know" — expected in informal spoken English
  - Minor word-order tweaks with negligible impact on naturalness
  - Things that are grammatically loose but clearly understood in context

Return ONLY valid JSON in this exact shape:
{
  "summary": "...(Japanese feedback, 3-5 sentences)...",
  "corrections": [
    {
      "original": "exact phrase from the text",
      "corrected": "natural Australian English version",
      "note": "1-2 sentences in English explaining WHY this sounds unnatural to native speakers"
    }
  ]
}
"""


def analyze_corrections(transcript: str) -> dict:
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
    return {
        "summary": data.get("summary", ""),
        "corrections": data.get("corrections", []),
    }
