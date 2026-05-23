from dataclasses import dataclass
from datetime import datetime


@dataclass
class UserNode:
    user_id: str
    name: str
    goal: str
    
    def to_dict(self) -> dict:
        return {
            "user_id": self.user_id,
            "name": self.name,
            "goal": self.goal
        }

@dataclass
class PhraseNode:
    phrase_id: str
    text: str        # English phrase e.g. "Got it"
    japanese: str    # Japanese equivalent e.g. "承知しました"
    note: str        # e.g. "Common in Australian workplaces"
    created_at: datetime
    
    def to_dict(self) -> dict:
        return {
            "phrase_id": self.phrase_id,
            "text": self.text,
            "japanese": self.japanese,
            "note": self.note,
            "created_at": self.created_at.isoformat()
        }