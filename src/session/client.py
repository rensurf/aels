import time
from decimal import Decimal

import boto3
from botocore.exceptions import ClientError


def _to_decimal(obj):
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, dict):
        return {k: _to_decimal(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_to_decimal(i) for i in obj]
    return obj


class SessionClient:
    def __init__(self, table_name: str):
        self.table = boto3.resource("dynamodb").Table(table_name)
    
    def load_session(self, chat_id: str) -> list[dict]:
        response = self.table.get_item(Key={"chat_id": chat_id})
        return response.get("Item", {}).get("messages", [])

    
    def save_session(self, chat_id: str, messages: list[dict]) -> None:
        self.table.update_item(
            Key={"chat_id": chat_id},
            UpdateExpression="SET messages = :m, #t = :t",
            ExpressionAttributeNames={"#t": "ttl"},
            ExpressionAttributeValues={
                ":m": _to_decimal(messages),
                ":t": int(time.time()) + 86400,
            },
        )
        
    def clear_session(self, chat_id: str) -> None:
        self.table.delete_item(Key={"chat_id": chat_id})
        
    def get_quiz_state(self, chat_id: str) -> dict | None:
        response = self.table.get_item(Key={"chat_id": chat_id})
        return response.get("Item", {}).get("quiz_state")

    def set_quiz_state(self, chat_id: str, quiz_state: dict) -> None:
        self.table.update_item(
            Key={"chat_id": chat_id},
            UpdateExpression="SET quiz_state = :qs",
            ExpressionAttributeValues={":qs": _to_decimal(quiz_state)}
        )

    def clear_quiz_state(self, chat_id: str) -> None:
        self.table.update_item(
            Key={"chat_id": chat_id},
            UpdateExpression="REMOVE quiz_state"
        )

    def set_pending_phrases(self, chat_id: str, phrases: list[dict]) -> None:
        self.table.update_item(
            Key={"chat_id": chat_id},
            UpdateExpression="SET pending_phrases = :pp",
            ExpressionAttributeValues={":pp": _to_decimal(phrases)},
        )

    def append_pending_phrases(self, chat_id: str, phrases: list[dict]) -> None:
        self.table.update_item(
            Key={"chat_id": chat_id},
            UpdateExpression="SET pending_phrases = list_append(if_not_exists(pending_phrases, :empty), :pp)",
            ExpressionAttributeValues={":empty": [], ":pp": _to_decimal(phrases)},
        )

    def get_pending_phrases(self, chat_id: str) -> list[dict] | None:
        response = self.table.get_item(Key={"chat_id": chat_id})
        return response.get("Item", {}).get("pending_phrases")

    def clear_pending_phrases(self, chat_id: str) -> None:
        self.table.update_item(
            Key={"chat_id": chat_id},
            UpdateExpression="REMOVE pending_phrases"
        )

    def reset_session(self, chat_id: str) -> None:
        self.table.update_item(
            Key={"chat_id": chat_id},
            UpdateExpression="REMOVE messages, chat_messages, turn_count",
        )

    def load_messages(self, chat_id: str) -> list[dict]:
        """Load provider-agnostic chat history (used by DynamoDBHistoryProvider)."""
        response = self.table.get_item(Key={"chat_id": chat_id})
        return response.get("Item", {}).get("chat_messages", [])

    def save_messages(self, chat_id: str, messages: list[dict]) -> None:
        """Append new messages to chat history (called by DynamoDBHistoryProvider after each turn)."""
        self.table.update_item(
            Key={"chat_id": chat_id},
            UpdateExpression=(
                "SET chat_messages = list_append(if_not_exists(chat_messages, :empty), :m), #t = :t"
            ),
            ExpressionAttributeNames={"#t": "ttl"},
            ExpressionAttributeValues={
                ":empty": [],
                ":m": _to_decimal(messages),
                ":t": int(time.time()) + 86400 * 30,
            },
        )

    def get_provider(self, chat_id: str) -> str:
        """Return the current LLM provider for this chat ("openai" or "claude")."""
        response = self.table.get_item(Key={"chat_id": chat_id})
        return str(response.get("Item", {}).get("current_provider", "openai"))

    def set_provider(self, chat_id: str, provider: str) -> None:
        """Persist the chosen LLM provider for this chat."""
        self.table.update_item(
            Key={"chat_id": chat_id},
            UpdateExpression="SET current_provider = :p",
            ExpressionAttributeValues={":p": provider},
        )

    def increment_turn_count(self, chat_id: str) -> int:
        response = self.table.update_item(
            Key={"chat_id": chat_id},
            UpdateExpression="SET turn_count = if_not_exists(turn_count, :zero) + :one",
            ExpressionAttributeValues={":zero": 0, ":one": 1},
            ReturnValues="UPDATED_NEW",
        )
        return int(response["Attributes"]["turn_count"])

    def get_turn_count(self, chat_id: str) -> int:
        response = self.table.get_item(Key={"chat_id": chat_id})
        return int(response.get("Item", {}).get("turn_count", 0))

    def set_last_message(self, chat_id: str, text: str) -> None:
        self.table.update_item(
            Key={"chat_id": chat_id},
            UpdateExpression="SET last_user_text = :t",
            ExpressionAttributeValues={":t": text},
        )

    def get_last_message(self, chat_id: str) -> str:
        response = self.table.get_item(Key={"chat_id": chat_id})
        return str(response.get("Item", {}).get("last_user_text", ""))

    def set_pending_voice_text(self, chat_id: str, text: str) -> None:
        self.table.update_item(
            Key={"chat_id": chat_id},
            UpdateExpression="SET pending_voice_text = :t",
            ExpressionAttributeValues={":t": text},
        )

    def get_pending_voice_text(self, chat_id: str) -> str:
        response = self.table.get_item(Key={"chat_id": chat_id})
        return str(response.get("Item", {}).get("pending_voice_text", ""))

    def clear_pending_voice_text(self, chat_id: str) -> None:
        self.table.update_item(
            Key={"chat_id": chat_id},
            UpdateExpression="REMOVE pending_voice_text",
        )

    def set_pending_memo(self, chat_id: str, phrase_id: str) -> None:
        self.table.update_item(
            Key={"chat_id": chat_id},
            UpdateExpression="SET pending_memo_phrase_id = :p",
            ExpressionAttributeValues={":p": phrase_id},
        )

    def get_pending_memo(self, chat_id: str) -> str:
        response = self.table.get_item(Key={"chat_id": chat_id})
        return str(response.get("Item", {}).get("pending_memo_phrase_id", ""))

    def clear_pending_memo(self, chat_id: str) -> None:
        self.table.update_item(
            Key={"chat_id": chat_id},
            UpdateExpression="REMOVE pending_memo_phrase_id",
        )

    def is_duplicate_update(self, update_id: int) -> bool:
        try:
            self.table.put_item(
                Item={"chat_id": f"upd_{update_id}", "ttl": int(time.time()) + 86400},
                ConditionExpression="attribute_not_exists(chat_id)"
            )
            return False
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                return True
            raise