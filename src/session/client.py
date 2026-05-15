import time

import boto3


class SessionClient:
    def __init__(self, table_name: str):
        self.table= boto3.resource("dynamodb").Table(table_name)
    
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
