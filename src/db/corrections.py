import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

from src.db import _normalize


class CorrectionsClient:
    def __init__(self, table_name: str):
        self.table = boto3.resource("dynamodb").Table(table_name)

    def list_corrections(self, user_id: str, due_before: str | None = None) -> list[dict]:
        if due_before:
            resp = self.table.query(
                IndexName="user_id-due_date-index",
                KeyConditionExpression=Key("user_id").eq(user_id) & Key("due_date").lte(due_before),
            )
        else:
            resp = self.table.query(
                IndexName="user_id-submitted_at-index",
                KeyConditionExpression=Key("user_id").eq(user_id),
                ScanIndexForward=False,
            )
        return [_normalize(item) for item in resp.get("Items", [])]

    def put_corrections(self, user_id: str, items: list[dict]) -> list[dict]:
        saved = []
        now = datetime.utcnow().isoformat()
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        for item in items:
            correction_id = str(uuid.uuid4())
            record = {
                "user_id": user_id,
                "correction_id": correction_id,
                "original": item.get("original", ""),
                "corrected": item.get("corrected", ""),
                "note": item.get("note", ""),
                "submitted_at": now,
                "ease_factor": Decimal("2.5"),
                "interval": 0,
                "repetitions": 0,
                "due_date": tomorrow,
            }
            self.table.put_item(Item=record)
            saved.append(_normalize(record))
        return saved

    def update_sm2(self, user_id: str, correction_id: str, quality: int) -> dict:
        resp = self.table.get_item(Key={"user_id": user_id, "correction_id": correction_id})
        item = resp.get("Item")
        if not item:
            raise ValueError(f"Correction {correction_id} not found")

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
            Key={"user_id": user_id, "correction_id": correction_id},
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

    def get_due_count(self, user_id: str, due_before: str) -> int:
        resp = self.table.query(
            IndexName="user_id-due_date-index",
            KeyConditionExpression=Key("user_id").eq(user_id) & Key("due_date").lte(due_before),
            Select="COUNT",
        )
        return resp.get("Count", 0)

    def delete_correction(self, user_id: str, correction_id: str) -> None:
        self.table.delete_item(Key={"user_id": user_id, "correction_id": correction_id})
