import boto3
from boto3.dynamodb.conditions import Key

from src.db import _normalize


class PhrasesClient:
    def __init__(self, table_name: str):
        self.table = boto3.resource("dynamodb").Table(table_name)

    def list_phrases(
        self,
        user_id: str,
        verb_id: str | None = None,
        pattern: str | None = None,
        due_before: str | None = None,
    ) -> list[dict]:
        if verb_id:
            resp = self.table.query(
                IndexName="user_id-verb_id-index",
                KeyConditionExpression=Key("user_id").eq(user_id) & Key("verb_id").eq(verb_id),
            )
        elif pattern:
            resp = self.table.query(
                IndexName="user_id-pattern-index",
                KeyConditionExpression=Key("user_id").eq(user_id) & Key("pattern").eq(pattern),
            )
        elif due_before:
            resp = self.table.query(
                IndexName="user_id-due_date-index",
                KeyConditionExpression=Key("user_id").eq(user_id) & Key("due_date").lte(due_before),
            )
        else:
            resp = self.table.query(
                KeyConditionExpression=Key("user_id").eq(user_id),
            )
        return [_normalize(item) for item in resp.get("Items", [])]
