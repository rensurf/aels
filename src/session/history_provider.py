import json
from collections.abc import Sequence
from typing import TYPE_CHECKING, Any

from agent_framework._sessions import HistoryProvider
from agent_framework._types import Message

if TYPE_CHECKING:
    from src.session.client import SessionClient


def _normalize_message(m: dict) -> dict:
    """Ensure function_call arguments are always a JSON string, not a dict.

    Claude saves arguments as a dict; OpenAI requires a JSON string.
    Normalizing at save time keeps the stored format provider-agnostic.
    """
    contents = m.get("contents")
    if not contents:
        return m
    normalized = []
    for c in contents:
        if c.get("type") == "function_call" and isinstance(c.get("arguments"), dict):
            c = {**c, "arguments": json.dumps(c["arguments"])}
        normalized.append(c)
    return {**m, "contents": normalized}


class DynamoDBHistoryProvider(HistoryProvider):
    """Stores conversation history in DynamoDB.

    Both the OpenAI and Claude agents share the same provider instance,
    so switching providers preserves the full conversation history.
    """

    def __init__(self, chat_id: str, db: "SessionClient") -> None:
        super().__init__(source_id="dynamodb_history")
        self.chat_id = chat_id
        self.db = db

    async def get_messages(
        self, session_id: str | None, *, state: dict[str, Any] | None = None, **kwargs: Any
    ) -> list[Message]:
        raw = self.db.load_messages(self.chat_id)
        messages: list[Message] = []
        for m in raw:
            try:
                messages.append(Message.from_dict(m))
            except Exception:
                pass
        return messages

    async def save_messages(
        self,
        session_id: str | None,
        messages: Sequence[Message],
        *,
        state: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> None:
        if messages:
            self.db.save_messages(self.chat_id, [_normalize_message(m.to_dict()) for m in messages])
