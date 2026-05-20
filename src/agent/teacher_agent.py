from agent_framework import Agent, AgentSession
from agent_framework.openai import OpenAIChatClient
from src.agent.prompt import TEACHER_PROMPT
from src.tools.translate_tool import translate_japanese
from src.tools.qa_tool import answer_english_question
from src.tools.memory_tool import search_phrases, get_recent_phrases, get_weakness_summary
from src.adapters.message_types import IncomingMessage, OutgoingMessage

agent = Agent(
    client=OpenAIChatClient(model="gpt-4o"),
    instructions=TEACHER_PROMPT,
    tools=[translate_japanese, answer_english_question, search_phrases, get_recent_phrases, get_weakness_summary]
)

async def handle_message(incoming: IncomingMessage, messages: list[dict]) -> tuple[OutgoingMessage, AgentSession]:
    if messages:
        session = AgentSession.from_dict(messages)  # type: ignore[arg-type]
    else:
        session = agent.create_session()

    text_with_context = f"[user_id={incoming.user_id}] {incoming.text}"
    result = await agent.run(text_with_context, session=session)

    return OutgoingMessage(text=result.text, style="explanation"), session
