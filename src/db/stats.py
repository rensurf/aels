from datetime import date, timedelta
from typing import Literal

import boto3

RoutineStep = Literal["verb", "phrase", "review", "writing"]


class StatsClient:
    def __init__(self, table_name: str):
        self.table = boto3.resource("dynamodb").Table(table_name)

    def get_stats(self, user_id: str) -> dict:
        resp = self.table.get_item(Key={"user_id": user_id})
        item = resp.get("Item")
        if not item:
            return {
                "current_streak": 0,
                "best_streak": 0,
                "last_completed_date": None,
                "completed_dates": [],
            }
        completed = item.get("completed_dates", set())
        return {
            "current_streak": int(item.get("current_streak", 0)),
            "best_streak": int(item.get("best_streak", 0)),
            "last_completed_date": item.get("last_completed_date"),
            "completed_dates": sorted(list(completed)),
        }

    def try_complete_day(self, user_id: str) -> dict:
        """Mark today as completed if not already done. Updates streak and date history."""
        today = date.today().isoformat()
        yesterday = (date.today() - timedelta(days=1)).isoformat()

        stats = self.get_stats(user_id)
        last = stats["last_completed_date"]

        if last == today:
            return stats  # already completed today, no change

        new_streak = stats["current_streak"] + 1 if last == yesterday else 1
        new_best = max(new_streak, stats["best_streak"])

        self.table.update_item(
            Key={"user_id": user_id},
            UpdateExpression=(
                "SET current_streak = :cs, best_streak = :bs, last_completed_date = :lcd"
                " ADD completed_dates :date_set"
            ),
            ExpressionAttributeValues={
                ":cs": new_streak,
                ":bs": new_best,
                ":lcd": today,
                ":date_set": {today},
            },
        )
        return {
            "current_streak": new_streak,
            "best_streak": new_best,
            "last_completed_date": today,
            "completed_dates": sorted([*stats["completed_dates"], today]),
        }

    def get_routine(self, user_id: str) -> dict:
        today = date.today().isoformat()
        resp = self.table.get_item(Key={"user_id": user_id})
        item = resp.get("Item") or {}
        if item.get("routine_date") != today:
            return {"date": today, "completed": []}
        completed = item.get("routine_completed", set())
        return {"date": today, "completed": sorted(list(completed))}

    def complete_routine_step(self, user_id: str, step: RoutineStep) -> dict:
        today = date.today().isoformat()
        self.table.update_item(
            Key={"user_id": user_id},
            UpdateExpression="SET routine_date = :d ADD routine_completed :s",
            ExpressionAttributeValues={":d": today, ":s": {step}},
        )
        return self.get_routine(user_id)
