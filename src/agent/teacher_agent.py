from agent_framework import Agent
from agent_framework.anthropic import AnthropicClient
from agent_framework.openai import OpenAIChatClient

from src.adapters.message_types import IncomingMessage, OutgoingMessage
from src.agent.prompt import TEACHER_PROMPT
from src.session.history_provider import DynamoDBHistoryProvider
from src.tools.memory_tool import get_weakness_summary, save_phrases
from src.tools.qa_tool import answer_english_question
from src.tools.translate_tool import translate_japanese

_TOOLS = [translate_japanese, answer_english_question, save_phrases, get_weakness_summary]


def _build_agent(provider: str, history: DynamoDBHistoryProvider) -> Agent:
    if provider == "claude":
        client = AnthropicClient(model="claude-sonnet-4-6")
    else:
        client = OpenAIChatClient(model="gpt-4o")
    return Agent(
        client=client,
        instructions=TEACHER_PROMPT,
        tools=_TOOLS,
        context_providers=[history],
    )


async def handle_message(
    incoming: IncomingMessage,
    chat_id: str,
    provider: str = "openai",
) -> OutgoingMessage:
    from src.config import DYNAMODB_SESSION_TABLE
    from src.session.client import SessionClient

    db = SessionClient(table_name=DYNAMODB_SESSION_TABLE)
    db.clear_pending_phrases(incoming.user_id)

    history = DynamoDBHistoryProvider(chat_id, db)
    agent = _build_agent(provider, history)
    session = agent.create_session()

    text_with_context = f"[user_id={incoming.user_id}] {incoming.text}"
    result = await agent.run(text_with_context, session=session)

    return OutgoingMessage(text=result.text, style="explanation")
