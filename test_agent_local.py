import asyncio
import sys
from datetime import datetime
from unittest.mock import patch, MagicMock

# Mock GremlinClient before any imports that trigger it
mock_gremlin = MagicMock()
mock_gremlin.execute.return_value = []

with patch("src.graph.client.GremlinClient", return_value=mock_gremlin), \
     patch("src.tools.memory_tool.client", mock_gremlin):

    from src.adapters.message_types import IncomingMessage, OutgoingMessage
    from src.agent.teacher_agent import handle_message

text = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "承知しました を英語で教えて"

incoming = IncomingMessage(
    text=text,
    user_id="test_user",
    message_id="1",
    timestamp=datetime.now()
)

async def run():
    print(f"\n--- Input ---\n{text}\n")
    print("--- Running Agent (tools will be called as needed) ---\n")

    with patch("src.tools.memory_tool.client", mock_gremlin):
        response, session = await handle_message(incoming, messages=[])

    print(f"--- Response ---\n{response.text}\n")
    print(f"Style: {response.style}")

asyncio.run(run())
