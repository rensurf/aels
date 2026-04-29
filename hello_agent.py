import asyncio

from dotenv import load_dotenv
from agent_framework import Agent
from agent_framework.openai import OpenAIChatClient

load_dotenv()

async def main():
    agent = Agent(
        client=OpenAIChatClient(),
        instructions="No matter what the user says, you must only respond with the single word 'hello'. Nothing else."
    )

    result = await agent.run("Summarize the Three Laws of Robotics")
    print(result)

asyncio.run(main())