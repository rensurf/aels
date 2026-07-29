import boto3
from boto3.dynamodb.conditions import Key
from datetime import datetime, timezone

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

    def delete_verb(self, user_id: str, verb_id: str) -> None:
        self.table.delete_item(Key={"user_id": user_id, "verb_id": verb_id})

    def put_verb(self, user_id: str, verb: dict) -> dict:
        """Write a verb to DynamoDB. verb_id is the base form (e.g. "hear")."""
        item: dict = {
            "user_id": user_id,
            "verb_id": verb["verb_id"],
            "base": verb.get("base", verb["verb_id"]),
            "patterns": verb.get("patterns", []),
            "confusable_with": verb.get("confusable_with", []),
            "similar_to": verb.get("similar_to", []),
            "phrasal_verbs": verb.get("phrasal_verbs", []),
            "tags": verb.get("tags", []),
            "created_at": verb.get("created_at", datetime.now(timezone.utc).isoformat()),
        }
        if verb.get("noun_form"):
            item["noun_form"] = verb["noun_form"]
        if verb.get("adj_form"):
            item["adj_form"] = verb["adj_form"]
        self.table.put_item(Item=item)
        return _normalize(item)
