import uuid

from src.config import COSMOS_DATABASE, COSMOS_ENDPOINT, COSMOS_GRAPH, COSMOS_KEY
from src.graph import queries
from src.graph.client import GremlinClient


client = GremlinClient(endpoint=COSMOS_ENDPOINT,
                       key=COSMOS_KEY,
                       database=COSMOS_DATABASE,
                       graph=COSMOS_GRAPH)

def _ensure_user_exists(user_id: str) -> None:
    existing = client.execute(f"g.V().has('user', 'user_id', '{user_id}')")
    if not existing:
        client.execute(queries.create_user(user_id=user_id, name=user_id, goal="Work in Australia"))

def save_phrases(phrases: list[dict], user_id: str) -> None:
    """
    Save English phrases to the user's knowledge graph.

    Args:
        phrases: List of phrase objects, each with:
            - text: English phrase (str)
            - japanese: Japanese meaning (str)
            - context: Usage context e.g. "formal", "casual" (str)
            - note: Additional notes (str)
        user_id: The user's Telegram user ID
    """
    _ensure_user_exists(user_id)
    for phrase in phrases:
        phrase_id = str(uuid.uuid4())
        client.execute(queries.create_phrase(
            phrase_id=phrase_id,
            text=phrase.get("text", ""),
            japanese=phrase.get("japanese", ""),
            context=phrase.get("context", ""),
            note=phrase.get("note", ""),
            user_id=user_id
        ))
        client.execute(queries.link_user_to_phrase(user_id=user_id, phrase_id=phrase_id))

def search_phrases(query_text: str, user_id: str) -> list[dict]:
    result = client.execute(queries.search_phrases(user_id=user_id, query_text=query_text))
    return [dict(zip(res.keys(), res.values())) for res in result]

def get_recent_phrases(user_id: str, limit: int) -> list[str]:
    result = client.execute(queries.get_recent_phrases(user_id=user_id, limit=limit))
    return [dict(zip(res.keys(), res.values())) for res in result]