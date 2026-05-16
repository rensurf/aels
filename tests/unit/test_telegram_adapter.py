from src.adapters.telegram_adapter import TelegramAdapter
from src.adapters.message_types import IncomingMessage

def test_receive_normal_message():
    adapter = TelegramAdapter(token="fake-token")
    update = {
        "message": {
            "text": "Hello",
            "from": {"id": 123456},
            "message_id": 42,
            "date": 1715000000
        }
    }
    result = adapter.receive(update)
    assert result.text == "Hello"
    assert result.user_id == "123456"  # string, not int
    assert result.message_id == "42"

def test_missing_fields():
    adapter = TelegramAdapter(token="fake-token")
    update = {
        "message": {
            "from": {"id": 123456},
            "message_id": 42,
            "date": 1715000000
        }
    }
    result = adapter.receive(update)
    assert result.text == ""  # default to empty string
    assert result.user_id == "123456"
    assert result.message_id == "42"
