from datetime import date, datetime, timezone


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

def create_phrase(phrase_id: str, text: str, japanese: str, note: str, user_id: str) -> str:
    now = datetime.now(timezone.utc).isoformat()
    query = f"""
    g.addV('phrase')
     .property('phrase_id', '{_esc(phrase_id)}')
     .property('user_id', '{_esc(user_id)}')
     .property('text', '{_esc(text)}')
     .property('japanese', '{_esc(japanese)}')
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

def search_phrases(user_id: str) -> str:
    query = f"""
    g.V().has('user', 'user_id', '{_esc(user_id)}')
     .out('learned_phrase')
     .valueMap()
    """
    return query

def get_recent_phrases(user_id: str) -> str:
    query = f"""
    g.V().has('user', 'user_id', '{_esc(user_id)}')
     .out('learned_phrase')
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

def get_all_sm2_data(user_id: str) -> str:
    """Returns SM-2 edge properties per phrase (scalar values, not arrays)."""
    query = f"""
    g.V().has('user', 'user_id', '{_esc(user_id)}')
     .outE('learned_phrase').as('e')
     .inV()
     .project('phrase_id', 'ease_factor', 'interval', 'repetitions', 'due_date')
     .by(values('phrase_id'))
     .by(select('e').values('ease_factor'))
     .by(select('e').values('interval'))
     .by(select('e').values('repetitions'))
     .by(select('e').values('due_date'))
    """
    return query

def create_pattern(pattern_id: str, name: str, user_id: str) -> str:
    query = f"""
    g.addV('pattern')
     .property('pattern_id', '{_esc(pattern_id)}')
     .property('name', '{_esc(name)}')
     .property('user_id', '{_esc(user_id)}')
    """
    return query

def find_pattern(name: str, user_id: str) -> str:
    return f"g.V().has('pattern', 'name', '{_esc(name)}').has('user_id', '{_esc(user_id)}').valueMap()"

def link_phrase_to_pattern(phrase_id: str, pattern_id: str) -> str:
    query = f"""
    g.V().has('phrase', 'phrase_id', '{_esc(phrase_id)}')
     .addE('uses_pattern')
     .to(g.V().has('pattern', 'pattern_id', '{_esc(pattern_id)}'))
    """
    return query

def get_phrase_patterns(user_id: str) -> str:
    """Returns phrase_id → pattern name for all phrases that have a pattern linked."""
    query = f"""
    g.V().has('user', 'user_id', '{_esc(user_id)}')
     .out('learned_phrase').as('p')
     .out('uses_pattern')
     .project('phrase_id', 'pattern_name')
     .by(select('p').values('phrase_id'))
     .by(values('name'))
    """
    return query

def update_phrase(phrase_id: str, text: str, japanese: str) -> str:
    return (
        f"g.V().has('phrase', 'phrase_id', '{_esc(phrase_id)}')"
        f".property('text', '{_esc(text)}')"
        f".property('japanese', '{_esc(japanese)}')"
    )

def delete_phrase(phrase_id: str) -> str:
    return f"g.V().has('phrase', 'phrase_id', '{_esc(phrase_id)}').drop()"

def set_phrase_memo(phrase_id: str, memo: str) -> str:
    return (
        f"g.V().has('phrase', 'phrase_id', '{_esc(phrase_id)}')"
        f".property('memo', '{_esc(memo)}')"
    )
