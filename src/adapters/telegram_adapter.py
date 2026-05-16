from datetime import datetime

from telegram import Bot

from src.adapters.message_types import IncomingMessage, OutgoingMessage


class TelegramAdapter:
    def __init__(self, token):
        self.bot = Bot(token=token) 

    def receive(self, update: dict) -> IncomingMessage:
        # Extract relevant information from the Telegram update
        message = update.get("message", {})
        text = message.get("text", "")
        user_id = str(message.get("from", {}).get("id", ""))
        message_id = str(message.get("message_id", ""))
        timestamp = datetime.fromtimestamp(message.get("date", 0))

        return IncomingMessage(
            text=text,
            user_id=user_id,
            message_id=message_id,
            timestamp=timestamp
        )

    async def send(self, message: OutgoingMessage, chat_id: str) -> None:
        await self.bot.send_message(chat_id=chat_id, text=message.text)