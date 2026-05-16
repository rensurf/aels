from unittest.mock import MagicMock, patch

mock_client = MagicMock()
mock_client.execute.return_value = []

with patch("src.tools.memory_tool.client", mock_client):
    from src.tools.memory_tool import save_phrases, search_phrases

def test_save_phrases_calls_execute_twice():
    mock_client.reset_mock()
    phrases = [{"text": "Got it", "japanese": "承知しました", "context": "casual", "note": "Common"}]
    
    with patch("src.tools.memory_tool.client", mock_client):
        save_phrases(phrases, user_id="u1")
    
    # create_phrase + link_user_to_phrase = 2 execute calls per phrase
    assert mock_client.execute.call_count == 2

def test_search_phrases_calls_execute_once():
    mock_client.reset_mock()
    
    with patch("src.tools.memory_tool.client", mock_client):
        search_phrases("Got", user_id="u1")
    
    assert mock_client.execute.call_count == 1