import time

import boto3
from botocore.exceptions import ClientError


class SessionClient:
    def __init__(self, table_name: str):
        self.table = boto3.resource("dynamodb").Table(table_name)
    
    def load_session(self, chat_id: str) -> list[dict]:
        response = self.table.get_item(Key={"chat_id": chat_id})
        return response.get("Item", {}).get("messages", [])

    
    def save_session(self, chat_id: str, messages: list[dict]) -> None:
        self.table.put_item(Item={
            "chat_id": chat_id,
            "messages": messages,
            "ttl": int(time.time()) + 86400
        })
        
    def clear_session(self, chat_id: str) -> None:
        self.table.delete_item(Key={"chat_id": chat_id})
        
    def get_quiz_state(self, chat_id: str) -> dict | None:
        response = self.table.get_item(Key={"chat_id": chat_id})
        return response.get("Item", {}).get("quiz_state")

    def set_quiz_state(self, chat_id: str, quiz_state: dict) -> None:
        self.table.update_item(
            Key={"chat_id": chat_id},
            UpdateExpression="SET quiz_state = :qs",
            ExpressionAttributeValues={":qs": quiz_state}
        )

    def clear_quiz_state(self, chat_id: str) -> None:
        self.table.update_item(
            Key={"chat_id": chat_id},
            UpdateExpression="REMOVE quiz_state"
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