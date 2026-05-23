from unittest.mock import MagicMock, patch

mock_client = MagicMock()
mock_client.execute.return_value = []

with patch("src.tools.memory_tool.client", mock_client):
    from src.tools.memory_tool import (
        do_save_phrases,
        search_phrases,
        _classify_pattern,
        get_weakness_summary,
    )


def test_do_save_phrases_executes_graph_queries():
    mock_client.reset_mock()
    phrases = [{"text": "Got it", "japanese": "承知しました", "note": "Common"}]

    with patch("src.tools.memory_tool._ensure_user_exists"):
        with patch("src.tools.memory_tool._classify_pattern", return_value="formal_informal"):
            with patch("src.tools.memory_tool._get_or_create_pattern", return_value="pat1"):
                with patch("src.tools.memory_tool.client", mock_client):
                    do_save_phrases(phrases, user_id="u1")

    # create_phrase + link_user_to_phrase + link_phrase_to_pattern = 3 calls per phrase
    assert mock_client.execute.call_count == 3


def test_search_phrases_calls_execute_once():
    mock_client.reset_mock()

    with patch("src.tools.memory_tool.client", mock_client):
        search_phrases("Got", user_id="u1")

    assert mock_client.execute.call_count == 1


def test_classify_pattern_returns_valid_category():
    mock_response = MagicMock()
    mock_response.choices[0].message.content = "preposition"

    with patch("src.tools.memory_tool.OpenAI") as MockOpenAI:
        MockOpenAI.return_value.chat.completions.create.return_value = mock_response
        result = _classify_pattern(text="work on it", japanese="それに取り組む", note="")

    assert result == "preposition"


def test_classify_pattern_falls_back_to_other_on_unknown_response():
    mock_response = MagicMock()
    mock_response.choices[0].message.content = "unknown_category"

    with patch("src.tools.memory_tool.OpenAI") as MockOpenAI:
        MockOpenAI.return_value.chat.completions.create.return_value = mock_response
        result = _classify_pattern(text="test", japanese="テスト", note="")

    assert result == "other"


def test_classify_pattern_falls_back_to_other_on_exception():
    with patch("src.tools.memory_tool.OpenAI", side_effect=Exception("API error")):
        result = _classify_pattern(text="test", japanese="テスト", note="")

    assert result == "other"


def test_get_weakness_summary_returns_weakest_pattern():
    sm2_data = [
        {"phrase_id": "p1", "ease_factor": 1.5, "interval": 1, "repetitions": 0, "due_date": "2026-05-01"},
        {"phrase_id": "p2", "ease_factor": 2.5, "interval": 6, "repetitions": 2, "due_date": "2026-06-01"},
    ]
    phrase_data = [
        {"phrase_id": ["p1"], "text": ["work on it"], "japanese": ["それに取り組む"]},
        {"phrase_id": ["p2"], "text": ["Got it"], "japanese": ["承知しました"]},
    ]
    pattern_data = [
        {"phrase_id": "p1", "pattern_name": "preposition"},
        {"phrase_id": "p2", "pattern_name": "formal_informal"},
    ]

    mock = MagicMock()
    mock.execute.side_effect = [sm2_data, phrase_data, pattern_data]

    with patch("src.tools.memory_tool.client", mock):
        result = get_weakness_summary("u1")

    assert result["weakest_pattern"] == "preposition"
    assert len(result["patterns"]) == 1
    assert result["patterns"][0]["weak_phrase_count"] == 1
    assert result["patterns"][0]["examples"][0]["text"] == "work on it"


def test_get_weakness_summary_no_weak_patterns():
    sm2_data = [
        {"phrase_id": "p1", "ease_factor": 2.5, "interval": 6, "repetitions": 2, "due_date": "2026-06-01"},
    ]
    phrase_data = [
        {"phrase_id": ["p1"], "text": ["Got it"], "japanese": ["承知しました"]},
    ]
    pattern_data = [
        {"phrase_id": "p1", "pattern_name": "formal_informal"},
    ]

    mock = MagicMock()
    mock.execute.side_effect = [sm2_data, phrase_data, pattern_data]

    with patch("src.tools.memory_tool.client", mock):
        result = get_weakness_summary("u1")

    assert "message" in result
    assert result["patterns"] == []
