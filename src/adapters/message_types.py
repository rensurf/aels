from dataclasses import dataclass
from datetime import datetime
from typing import Literal

@dataclass
class IncomingMessage:
    text: str
    user_id: str
    message_id: str
    timestamp: datetime | None

@dataclass
class OutgoingMessage:
    text: str
    style: Literal["explanation", "question", "confirmation"]
