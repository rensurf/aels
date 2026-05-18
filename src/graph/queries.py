from datetime import date, datetime, timezone
from gremlin_python.process.traversal import Order


def _esc(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def create_user(user_id: str, name: str, goal: str) -> str:
    query = f"""
    g.addV('user')
     .property('user_id', '{_esc(user_id)}')
     .property('name', '{_esc(name)}')
     .property('goal', '{_esc(goal)}')
    """
    return query

def get_all_users() -> str:
    return "g.V().hasLabel('user').valueMap()"

def create_phrase(phrase_id: str, text: str, japanese: str, context: str, note: str, user_id: str) -> str:
    now = datetime.now(timezone.utc).isoformat()
    query = f"""
    g.addV('phrase')
     .property('phrase_id', '{_esc(phrase_id)}')
     .property('user_id', '{_esc(user_id)}')
     .property('text', '{_esc(text)}')
     .property('japanese', '{_esc(japanese)}')
     .property('context', '{_esc(context)}')
     .property('note', '{_esc(note)}')
     .property('created_at', '{now}')
    """
    return query

def link_user_to_phrase(user_id: str, phrase_id: str) -> str:
    today = date.today().isoformat()
    query = f"""
    g.V().has('user', 'user_id', '{_esc(user_id)}')
     .addE('learned_phrase')
     .to(g.V().has('phrase', 'phrase_id', '{_esc(phrase_id)}'))
     .property('due_date', '{today}')
     .property('interval', 0)
     .property('ease_factor', 2.5)
     .property('repetitions', 0)
    """
    return query

def search_phrases(user_id: str, query_text: str) -> str:
    query = f"""
    g.V().has('user', 'user_id', '{_esc(user_id)}')
     .out('learned_phrase')
     .has('text', textContains('{_esc(query_text)}'))
     .valueMap()
    """
    return query

def get_recent_phrases(user_id: str, limit: int) -> str:
    query = f"""
    g.V().has('user', 'user_id', '{_esc(user_id)}')
     .out('learned_phrase')
     .order().by('created_at', Order.desc)
     .limit({limit})
     .valueMap()
    """
    return query

def get_all_phrases(user_id: str) -> str:
    query = f"""
    g.V().has('user', 'user_id', '{_esc(user_id)}')
     .out('learned_phrase')
     .valueMap()
    """
    return query

def update_sm2(user_id: str, phrase_id: str, ease_factor: float, interval: int, repetitions: int, due_date: str) -> str:
    query = f"""
    g.V().has('user', 'user_id', '{_esc(user_id)}')
     .outE('learned_phrase')
     .where(inV().has('phrase', 'phrase_id', '{_esc(phrase_id)}'))
     .property('ease_factor', {ease_factor})
     .property('interval', {interval})
     .property('repetitions', {repetitions})
     .property('due_date', '{_esc(due_date)}')
    """
    return query
