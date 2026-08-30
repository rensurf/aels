import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

from src.db import _normalize


class TopicsClient:
    def __init__(self, table_name: str):
        self.table = boto3.resource("dynamodb").Table(table_name)

    def list_topics(self, user_id: str) -> list[dict]:
        resp = self.table.query(
            KeyConditionExpression=Key("user_id").eq(user_id),
        )
        items = [_normalize(item) for item in resp.get("Items", [])]
        return sorted(items, key=lambda t: t.get("number", 0))

    def get_topic(self, user_id: str, topic_id: str) -> dict | None:
        resp = self.table.get_item(Key={"user_id": user_id, "topic_id": topic_id})
        item = resp.get("Item")
        return _normalize(item) if item else None

    def get_due_topics(self, user_id: str) -> list[dict]:
        today = date.today().isoformat()
        resp = self.table.query(
            IndexName="user_id-due_date-index",
            KeyConditionExpression=Key("user_id").eq(user_id) & Key("due_date").lte(today),
        )
        items = [_normalize(item) for item in resp.get("Items", [])]
        return sorted(items, key=lambda t: t.get("due_date", ""))

    def put_topic(self, user_id: str, topic: dict) -> dict:
        topic_id = str(uuid.uuid4())
        item: dict = {
            "user_id": user_id,
            "topic_id": topic_id,
            "number": Decimal(str(topic.get("number", 0))),
            "title": topic.get("title", ""),
            "bullets": topic.get("bullets", []),
            "ease_factor": Decimal("2.5"),
            "interval": 0,
            "repetitions": 0,
            "due_date": date.today().isoformat(),
            "created_at": datetime.utcnow().isoformat(),
        }
        self.table.put_item(Item=item)
        return _normalize(item)

    def add_bullet(self, user_id: str, topic_id: str, bullet: dict) -> dict:
        bullet_id = str(uuid.uuid4())
        new_bullet = {
            "bullet_id": bullet_id,
            "ja": bullet.get("ja", ""),
            "en": bullet.get("en", ""),
            "example": bullet.get("example", ""),
        }
        self.table.update_item(
            Key={"user_id": user_id, "topic_id": topic_id},
            UpdateExpression="SET bullets = list_append(if_not_exists(bullets, :empty), :b)",
            ExpressionAttributeValues={":b": [new_bullet], ":empty": []},
        )
        topic = self.get_topic(user_id, topic_id)
        return topic or {}

    def update_bullet(self, user_id: str, topic_id: str, bullet_id: str, updates: dict) -> dict:
        topic = self.get_topic(user_id, topic_id)
        if not topic:
            return {}
        bullets = topic.get("bullets", [])
        for i, b in enumerate(bullets):
            if b.get("bullet_id") == bullet_id:
                bullets[i] = {**b, **{k: v for k, v in updates.items() if k in ("ja", "en", "example")}}
                break
        self.table.update_item(
            Key={"user_id": user_id, "topic_id": topic_id},
            UpdateExpression="SET bullets = :b",
            ExpressionAttributeValues={":b": bullets},
        )
        return self.get_topic(user_id, topic_id) or {}

    def delete_bullet(self, user_id: str, topic_id: str, bullet_id: str) -> dict:
        topic = self.get_topic(user_id, topic_id)
        if not topic:
            return {}
        bullets = [b for b in topic.get("bullets", []) if b.get("bullet_id") != bullet_id]
        self.table.update_item(
            Key={"user_id": user_id, "topic_id": topic_id},
            UpdateExpression="SET bullets = :b",
            ExpressionAttributeValues={":b": bullets},
        )
        return self.get_topic(user_id, topic_id) or {}

    def delete_topic(self, user_id: str, topic_id: str) -> None:
        self.table.delete_item(Key={"user_id": user_id, "topic_id": topic_id})

    def update_topic(self, user_id: str, topic_id: str, updates: dict) -> dict:
        expressions = []
        values: dict = {}
        names: dict = {}
        if "title" in updates:
            expressions.append("title = :t")
            values[":t"] = updates["title"]
        if "number" in updates:
            expressions.append("#n = :n")
            values[":n"] = Decimal(str(updates["number"]))
            names["#n"] = "number"
        if "script" in updates:
            expressions.append("script = :s")
            values[":s"] = updates["script"]
        if "levels" in updates:
            expressions.append("levels = :lv")
            values[":lv"] = updates["levels"]
        if not expressions:
            return self.get_topic(user_id, topic_id) or {}
        kwargs: dict = {
            "Key": {"user_id": user_id, "topic_id": topic_id},
            "UpdateExpression": "SET " + ", ".join(expressions),
            "ExpressionAttributeValues": values,
        }
        if names:
            kwargs["ExpressionAttributeNames"] = names
        self.table.update_item(**kwargs)
        return self.get_topic(user_id, topic_id) or {}

    def add_correction(self, user_id: str, topic_id: str, correction: dict) -> dict:
        correction_id = str(uuid.uuid4())
        new_correction = {
            "correction_id": correction_id,
            "original": correction.get("original", ""),
            "corrected": correction.get("corrected", ""),
            "note": correction.get("note", ""),
            "saved_at": date.today().isoformat(),
        }
        self.table.update_item(
            Key={"user_id": user_id, "topic_id": topic_id},
            UpdateExpression="SET corrections = list_append(if_not_exists(corrections, :empty), :c)",
            ExpressionAttributeValues={":c": [new_correction], ":empty": []},
        )
        return self.get_topic(user_id, topic_id) or {}

    def delete_correction(self, user_id: str, topic_id: str, correction_id: str) -> dict:
        topic = self.get_topic(user_id, topic_id)
        if not topic:
            return {}
        corrections = [c for c in topic.get("corrections", []) if c.get("correction_id") != correction_id]
        self.table.update_item(
            Key={"user_id": user_id, "topic_id": topic_id},
            UpdateExpression="SET corrections = :c",
            ExpressionAttributeValues={":c": corrections},
        )
        return self.get_topic(user_id, topic_id) or {}

    def update_sm2(self, user_id: str, topic_id: str, quality: int) -> dict:
        """Update SM-2 fields after a practice session. quality: 0-5."""
        topic = self.get_topic(user_id, topic_id)
        if not topic:
            return {}

        ease = float(topic.get("ease_factor", 2.5))
        interval = int(topic.get("interval", 0))
        reps = int(topic.get("repetitions", 0))

        if quality >= 3:
            if reps == 0:
                interval = 1
            elif reps == 1:
                interval = 3
            else:
                interval = round(interval * ease)
            reps += 1
        else:
            interval = 1
            reps = 0

        ease = max(1.3, ease + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
        due_date = (date.today() + timedelta(days=interval)).isoformat()

        self.table.update_item(
            Key={"user_id": user_id, "topic_id": topic_id},
            UpdateExpression="SET ease_factor = :e, #iv = :i, repetitions = :r, due_date = :d, last_practiced = :lp",
            ExpressionAttributeNames={"#iv": "interval"},
            ExpressionAttributeValues={
                ":e": Decimal(str(round(ease, 2))),
                ":i": interval,
                ":r": reps,
                ":d": due_date,
                ":lp": date.today().isoformat(),
            },
        )
        return self.get_topic(user_id, topic_id) or {}
