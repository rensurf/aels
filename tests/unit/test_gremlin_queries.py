from src.graph import queries

def test_create_user_contains_user_id():
    result = queries.create_user("abc123", "Ren", "Work in Australia")
    assert "abc123" in result
    assert "addV('user')" in result

def test_create_phrase_contains_text():
    result = queries.create_phrase("p1", "Got it", "承知しました", "casual", "Common phrase")
    assert "Got it" in result
    assert "addV('phrase')" in result

def test_link_uses_learned_phrase_edge():
    result = queries.link_user_to_phrase("u1", "p1")
    assert "learned_phrase" in result
    assert "u1" in result
    assert "p1" in result

def test_search_phrases_contains_textContains():
    result = queries.search_phrases("u1", "Got")
    assert "textContains('Got')" in result
    assert "u1" in result

def test_get_recent_phrases_contains_order_by():
    result = queries.get_recent_phrases("u1", 5)
    assert "order().by('created_at', decr)" in result
    assert "limit(5)" in result
    assert "u1" in result