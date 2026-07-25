import boto3
from boto3.dynamodb.conditions import Key

from src.db import _normalize


class VerbsClient:
    def __init__(self, table_name: str):
        self.table = boto3.resource("dynamodb").Table(table_name)

    def list_verbs(self, user_id: str) -> list[dict]:
        resp = self.table.query(
            KeyConditionExpression=Key("user_id").eq(user_id),
        )
        return [_normalize(item) for item in resp.get("Items", [])]

    def get_verb(self, user_id: str, verb_id: str) -> dict | None:
        resp = self.table.get_item(Key={"user_id": user_id, "verb_id": verb_id})
        item = resp.get("Item")
        return _normalize(item) if item else None
