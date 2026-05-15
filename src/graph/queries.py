def create_user(user_id: str, name: str, goal: str) -> str:
    query = f"""
    g.addV('user')
     .property('user_id', '{user_id}')
     .property('name', '{name}')
     .property('goal', '{goal}')
    """
    return query
    
def create_phrase(phrase_id: str, text: str, japanese: str, context: str, note: str) -> str:
    query = f"""
    g.addV('phrase')
     .property('phrase_id', '{phrase_id}')
     .property('text', '{text}')
     .property('japanese', '{japanese}')
     .property('context', '{context}')
     .property('note', '{note}')
    """
    return query

def link_user_to_phrase(user_id: str, phrase_id: str) -> str:
    query = f"""
    g.V().has('user', 'user_id', '{user_id}')
     .addE('learned_phrase')
     .to(g.V().has('phrase', 'phrase_id', '{phrase_id}'))
    """
    return query

def search_phrases(user_id: str, query_text: str) -> str:
    query = f"""
    g.V().has('user', 'user_id', '{user_id}')
     .out('learned_phrase')
     .has('text', textContains('{query_text}'))
     .valueMap()
    """
    return query

def get_recent_phrases(user_id: str, limit: int) -> str:
    query = f"""
    g.V().has('user', 'user_id', '{user_id}')
     .out('learned_phrase')
     .order().by('created_at', decr)
     .limit({limit})
     .valueMap()
    """
    return query