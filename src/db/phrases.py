import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

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

    def put_phrase(self, user_id: str, phrase: dict) -> dict:
        phrase_id = str(uuid.uuid4())
        item: dict = {
            "user_id": user_id,
            "phrase_id": phrase_id,
            "text": phrase.get("text", ""),
            "japanese": phrase.get("japanese", ""),
            "note": phrase.get("note", ""),
            "register": phrase.get("register", "informal"),
            "type": phrase.get("type", "sentence"),
            "ease_factor": Decimal("2.5"),
            "interval": 0,
            "repetitions": 0,
            "due_date": date.today().isoformat(),
            "created_at": datetime.utcnow().isoformat(),
        }
        # GSI keys cannot be empty strings in DynamoDB
        if phrase.get("verb_id"):
            item["verb_id"] = phrase["verb_id"]
        if phrase.get("pattern"):
            item["pattern"] = phrase["pattern"]
        if phrase.get("examples"):
            item["examples"] = phrase["examples"]
        if phrase.get("alternatives"):
            item["alternatives"] = phrase["alternatives"]
        if phrase.get("source"):
            item["source"] = phrase["source"]
        self.table.put_item(Item=item)
        return _normalize(item)

    def get_due_count(self, user_id: str, due_before: str) -> int:
        resp = self.table.query(
            IndexName="user_id-due_date-index",
            KeyConditionExpression=Key("user_id").eq(user_id) & Key("due_date").lte(due_before),
            Select="COUNT",
        )
        return resp.get("Count", 0)

    def update_sm2(self, user_id: str, phrase_id: str, quality: int) -> dict:
        resp = self.table.get_item(Key={"user_id": user_id, "phrase_id": phrase_id})
        item = resp.get("Item")
        if not item:
            raise ValueError(f"Phrase {phrase_id} not found")

        ef = item.get("ease_factor", Decimal("2.5"))
        interval = int(item.get("interval", 0))
        reps = int(item.get("repetitions", 0))

        if quality < 3:
            interval = 0
            reps = 0
        else:
            if reps == 0:
                interval = 1
            elif reps == 1:
                interval = 6
            else:
                interval = round(interval * float(ef))
            reps += 1

        new_ef = float(ef) + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
        new_ef = max(1.3, new_ef)
        due_date = (date.today() + timedelta(days=interval)).isoformat()

        result = self.table.update_item(
            Key={"user_id": user_id, "phrase_id": phrase_id},
            UpdateExpression="SET ease_factor = :ef, #interval = :iv, repetitions = :rp, due_date = :dd",
            ExpressionAttributeNames={"#interval": "interval"},
            ExpressionAttributeValues={
                ":ef": Decimal(str(round(new_ef, 2))),
                ":iv": interval,
                ":rp": reps,
                ":dd": due_date,
            },
            ReturnValues="ALL_NEW",
        )
        return _normalize(result["Attributes"])

    def add_alternative(self, user_id: str, phrase_id: str, alternative: dict) -> dict:
        self.table.update_item(
            Key={"user_id": user_id, "phrase_id": phrase_id},
            UpdateExpression="SET alternatives = list_append(if_not_exists(alternatives, :empty), :alt)",
            ExpressionAttributeValues={":alt": [alternative], ":empty": []},
        )
        resp = self.table.get_item(Key={"user_id": user_id, "phrase_id": phrase_id})
        return _normalize(resp["Item"])

    def delete_phrase(self, user_id: str, phrase_id: str) -> None:
        self.table.delete_item(Key={"user_id": user_id, "phrase_id": phrase_id})

    def update_phrase(self, user_id: str, phrase_id: str, updates: dict) -> dict | None:
        set_parts: list[str] = []
        remove_parts: list[str] = []
        attr_names: dict = {}
        attr_values: dict = {}

        for field in ["text", "japanese", "note", "register", "type", "examples", "source"]:
            if field in updates:
                set_parts.append(f"#{field} = :{field}")
                attr_names[f"#{field}"] = field
                attr_values[f":{field}"] = updates[field]

        # GSI key attributes: REMOVE if empty, SET if non-empty
        for field in ["verb_id", "pattern"]:
            if field in updates:
                if updates[field]:
                    set_parts.append(f"#{field} = :{field}")
                    attr_names[f"#{field}"] = field
                    attr_values[f":{field}"] = updates[field]
                else:
                    remove_parts.append(f"#{field}")
                    attr_names[f"#{field}"] = field

        if not set_parts and not remove_parts:
            return None

        expr = ""
        if set_parts:
            expr += "SET " + ", ".join(set_parts)
        if remove_parts:
            expr += (" " if expr else "") + "REMOVE " + ", ".join(remove_parts)

        kwargs: dict = {
            "Key": {"user_id": user_id, "phrase_id": phrase_id},
            "UpdateExpression": expr,
            "ExpressionAttributeNames": attr_names,
            "ReturnValues": "ALL_NEW",
        }
        if attr_values:
            kwargs["ExpressionAttributeValues"] = attr_values

        resp = self.table.update_item(**kwargs)
        return _normalize(resp["Attributes"])
