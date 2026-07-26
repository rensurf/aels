import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

from src.db import _normalize


class PhraseGroupsClient:
    def __init__(self, table_name: str):
        self.table = boto3.resource("dynamodb").Table(table_name)

    def list_groups(self, user_id: str) -> list[dict]:
        resp = self.table.query(
            KeyConditionExpression=Key("user_id").eq(user_id),
        )
        return [_normalize(item) for item in resp.get("Items", [])]

    def get_due_count(self, user_id: str, due_before: str) -> int:
        resp = self.table.query(
            IndexName="user_id-due_date-index",
            KeyConditionExpression=Key("user_id").eq(user_id) & Key("due_date").lte(due_before),
            Select="COUNT",
        )
        return resp.get("Count", 0)

    def put_group(self, user_id: str, japanese: str, alternatives: list[dict]) -> dict:
        group_id = str(uuid.uuid4())
        item: dict = {
            "user_id": user_id,
            "group_id": group_id,
            "japanese": japanese,
            "alternatives": alternatives,
            "ease_factor": Decimal("2.5"),
            "interval": 0,
            "repetitions": 0,
            "due_date": (date.today() + timedelta(days=1)).isoformat(),
            "created_at": datetime.utcnow().isoformat(),
        }
        self.table.put_item(Item=item)
        return _normalize(item)

    def add_alternative(self, user_id: str, group_id: str, alternative: dict) -> dict | None:
        resp = self.table.get_item(Key={"user_id": user_id, "group_id": group_id})
        item = resp.get("Item")
        if not item:
            return None
        alternatives = list(item.get("alternatives", []))
        alternatives.append(alternative)
        result = self.table.update_item(
            Key={"user_id": user_id, "group_id": group_id},
            UpdateExpression="SET alternatives = :alts",
            ExpressionAttributeValues={":alts": alternatives},
            ReturnValues="ALL_NEW",
        )
        return _normalize(result["Attributes"])

    def update_sm2(self, user_id: str, group_id: str, quality: int) -> dict:
        resp = self.table.get_item(Key={"user_id": user_id, "group_id": group_id})
        item = resp.get("Item")
        if not item:
            raise ValueError(f"PhraseGroup {group_id} not found")

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
            Key={"user_id": user_id, "group_id": group_id},
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
