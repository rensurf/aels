import uuid
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Key


class ThreadsClient:
    def __init__(self, table_name: str):
        self._table = boto3.resource("dynamodb", region_name="ap-southeast-2").Table(table_name)

    def create_thread(self, user_id: str) -> dict:
        thread_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()
        item = {
            "user_id": user_id,
            "thread_id": thread_id,
            "messages": [],
            "created_at": created_at,
        }
        self._table.put_item(Item=item)
        return {"thread_id": thread_id, "created_at": created_at}

    def get_thread(self, user_id: str, thread_id: str) -> dict | None:
        resp = self._table.get_item(Key={"user_id": user_id, "thread_id": thread_id})
        return resp.get("Item")

    def list_threads(self, user_id: str) -> list[dict]:
        resp = self._table.query(
            IndexName="user_id-created_at-index",
            KeyConditionExpression=Key("user_id").eq(user_id),
            ScanIndexForward=False,
        )
        return resp.get("Items", [])

    def append_messages(self, user_id: str, thread_id: str, new_messages: list[dict]) -> None:
        self._table.update_item(
            Key={"user_id": user_id, "thread_id": thread_id},
            UpdateExpression="SET messages = list_append(if_not_exists(messages, :empty), :msgs)",
            ExpressionAttributeValues={":msgs": new_messages, ":empty": []},
        )
