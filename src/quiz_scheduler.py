from src.config import COSMOS_DATABASE, COSMOS_ENDPOINT, COSMOS_GRAPH, COSMOS_KEY
from src.graph import queries
from src.graph.client import GremlinClient
from src.quiz.flow import start_quiz

_graph = GremlinClient(
    endpoint=COSMOS_ENDPOINT,
    key=COSMOS_KEY,
    database=COSMOS_DATABASE,
    graph=COSMOS_GRAPH,
)


def lambda_handler(event, context):
    users = _graph.execute(queries.get_all_users())

    for user in users:
        user_id = user["user_id"][0]
        chat_id = user_id
        start_quiz(chat_id, user_id)

    return {"statusCode": 200}
