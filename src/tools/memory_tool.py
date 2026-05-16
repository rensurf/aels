import uuid

from src.config import COSMOS_DATABASE, COSMOS_ENDPOINT, COSMOS_GRAPH, COSMOS_KEY
from src.graph import queries
from src.graph.client import GremlinClient


client = GremlinClient(endpoint=COSMOS_ENDPOINT,
                       key=COSMOS_KEY,
                       database=COSMOS_DATABASE,
                       graph=COSMOS_GRAPH)

def save_phrases(phrases: list[dict], user_id: str) -> None:
    for phrase in phrases:
        phrase_id = str(uuid.uuid4())
        client.execute(queries.create_phrase(
            phrase_id=phrase_id,
            text=phrase.get("text", ""),
            japanese=phrase.get("japanese", ""),
            context=phrase.get("context", ""),
            note=phrase.get("note", "")
        ))
        client.execute(queries.link_user_to_phrase(user_id=user_id, phrase_id=phrase_id))

def search_phrases(query_text: str, user_id: str) -> list[dict]:
    result = client.execute(queries.search_phrases(user_id=user_id, query_text=query_text))
    return [dict(zip(res.keys(), res.values())) for res in result]

def get_recent_phrases(user_id: str, limit: int) -> list[str]:
    result = client.execute(queries.get_recent_phrases(user_id=user_id, limit=limit))
    return [dict(zip(res.keys(), res.values())) for res in result]