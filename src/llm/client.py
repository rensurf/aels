import os

from openai import OpenAI

_MODELS: dict[str, dict[str, str]] = {
    "openai": {"main": "gpt-4o", "light": "gpt-4o-mini"},
    "claude": {"main": "claude-sonnet-4-6", "light": "claude-haiku-4-5-20251001"},
}


def _provider() -> str:
    return os.getenv("LLM_PROVIDER", "openai")


def chat(
    messages: list[dict],
    *,
    json_mode: bool = False,
    provider: str | None = None,
    model_tier: str = "main",
    max_tokens: int = 500,
) -> str:
    """Call an LLM with provider-independent interface.

    Args:
        messages: OpenAI-style message list (role/content dicts).
        json_mode: Request structured JSON output.
        provider: "openai" or "claude". Defaults to LLM_PROVIDER env var.
        model_tier: "main" (gpt-4o / claude-sonnet) or "light" (gpt-4o-mini / claude-haiku).
        max_tokens: Maximum tokens in the response.
    """
    p = provider or _provider()
    if p == "claude":
        return _chat_claude(messages, json_mode=json_mode, model_tier=model_tier, max_tokens=max_tokens)
    return _chat_openai(messages, json_mode=json_mode, model_tier=model_tier, max_tokens=max_tokens)


def _chat_openai(
    messages: list[dict],
    *,
    json_mode: bool,
    model_tier: str,
    max_tokens: int,
) -> str:
    client = OpenAI()
    kwargs: dict = {
        "model": _MODELS["openai"][model_tier],
        "messages": messages,
        "max_tokens": max_tokens,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    resp = client.chat.completions.create(**kwargs)
    return resp.choices[0].message.content or ""


def _chat_claude(
    messages: list[dict],
    *,
    json_mode: bool,
    model_tier: str,
    max_tokens: int,
) -> str:
    import anthropic
    from anthropic.types import MessageParam, TextBlock

    client = anthropic.Anthropic()

    system_parts: list[str] = []
    conv: list[MessageParam] = []
    for m in messages:
        if m["role"] == "system":
            system_parts.append(m["content"])
        else:
            conv.append({"role": m["role"], "content": m["content"]})

    system = "\n\n".join(system_parts) if system_parts else ""
    if json_mode:
        json_note = "Respond with valid JSON only. Do not include any explanation or markdown fences."
        system = f"{system}\n\n{json_note}".strip() if system else json_note

    if system:
        resp = client.messages.create(
            model=_MODELS["claude"][model_tier],
            max_tokens=max_tokens,
            messages=conv,
            system=system,
        )
    else:
        resp = client.messages.create(
            model=_MODELS["claude"][model_tier],
            max_tokens=max_tokens,
            messages=conv,
        )
    text_blocks = [b for b in resp.content if isinstance(b, TextBlock)]
    return text_blocks[0].text if text_blocks else ""
