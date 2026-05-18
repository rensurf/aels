from src.graph import queries


def test_create_user_contains_user_id():
    result = queries.create_user("abc123", "Ren", "Work in Australia")
    assert "abc123" in result
    assert "addV('user')" in result


def test_create_phrase_contains_text():
    result = queries.create_phrase("p1", "Got it", "承知しました", "casual", "Common phrase", "u1")
    assert "Got it" in result
    assert "addV('phrase')" in result


def test_create_phrase_contains_created_at():
    result = queries.create_phrase("p1", "Got it", "承知しました", "casual", "", "u1")
    assert "created_at" in result


def test_link_uses_learned_phrase_edge():
    result = queries.link_user_to_phrase("u1", "p1")
    assert "learned_phrase" in result
    assert "u1" in result
    assert "p1" in result


def test_search_phrases_contains_textContains():
    result = queries.search_phrases("u1", "Got")
    assert "textContains('Got')" in result
    assert "u1" in result


def test_get_recent_phrases_uses_order_desc():
    result = queries.get_recent_phrases("u1", 5)
    assert "Order.desc" in result
    assert "limit(5)" in result
    assert "u1" in result


def test_create_pattern_contains_name():
    result = queries.create_pattern("pat1", "preposition", "u1")
    assert "addV('pattern')" in result
    assert "preposition" in result
    assert "u1" in result


def test_find_pattern_contains_name_and_user():
    result = queries.find_pattern("preposition", "u1")
    assert "preposition" in result
    assert "u1" in result


def test_link_phrase_to_pattern_uses_uses_pattern_edge():
    result = queries.link_phrase_to_pattern("phrase1", "pat1")
    assert "uses_pattern" in result
    assert "phrase1" in result
    assert "pat1" in result


def test_get_all_sm2_data_contains_ease_factor():
    result = queries.get_all_sm2_data("u1")
    assert "ease_factor" in result
    assert "learned_phrase" in result
    assert "u1" in result


def test_get_phrase_patterns_contains_uses_pattern():
    result = queries.get_phrase_patterns("u1")
    assert "uses_pattern" in result
    assert "u1" in result
