from unittest.mock import MagicMock, patch


def _make_client():
    """Return a VerbsClient with a mocked DynamoDB table."""
    with patch("boto3.resource") as mock_resource:
        mock_table = MagicMock()
        mock_resource.return_value.Table.return_value = mock_table
        from src.db.verbs import VerbsClient
        client = VerbsClient(table_name="aels-verbs")
    return client, mock_table


def test_put_verb_calls_put_item_with_required_fields():
    client, mock_table = _make_client()
    verb = {
        "verb_id": "hear",
        "base": "hear",
        "patterns": [{"code": "[VN]", "description": "他動詞", "examples": ["I heard a noise."]}],
        "confusable_with": ["listen"],
        "similar_to": ["catch"],
        "noun_form": "hearing",
    }

    result = client.put_verb(user_id="u1", verb=verb)

    mock_table.put_item.assert_called_once()
    item = mock_table.put_item.call_args[1]["Item"]
    assert item["user_id"] == "u1"
    assert item["verb_id"] == "hear"
    assert item["base"] == "hear"
    assert item["noun_form"] == "hearing"
    assert len(item["patterns"]) == 1
    assert result["verb_id"] == "hear"


def test_put_verb_omits_optional_fields_when_absent():
    client, mock_table = _make_client()
    verb = {"verb_id": "run", "patterns": [], "confusable_with": [], "similar_to": []}

    client.put_verb(user_id="u1", verb=verb)

    item = mock_table.put_item.call_args[1]["Item"]
    assert "noun_form" not in item
    assert "adj_form" not in item


def test_put_verb_sets_created_at_automatically():
    client, mock_table = _make_client()
    verb = {"verb_id": "go", "patterns": [], "confusable_with": [], "similar_to": []}

    client.put_verb(user_id="u1", verb=verb)

    item = mock_table.put_item.call_args[1]["Item"]
    assert "created_at" in item
    assert "T" in item["created_at"]  # ISO 8601 format


def test_put_verb_preserves_caller_created_at():
    client, mock_table = _make_client()
    verb = {
        "verb_id": "go",
        "patterns": [],
        "confusable_with": [],
        "similar_to": [],
        "created_at": "2026-01-01T00:00:00+00:00",
    }

    client.put_verb(user_id="u1", verb=verb)

    item = mock_table.put_item.call_args[1]["Item"]
    assert item["created_at"] == "2026-01-01T00:00:00+00:00"


def test_put_verb_returns_normalized_item():
    client, mock_table = _make_client()
    verb = {"verb_id": "see", "patterns": [], "confusable_with": [], "similar_to": []}

    # Simulate DynamoDB returning Decimal values in the stored item
    # (put_verb returns what it built, not what DynamoDB returns)
    result = client.put_verb(user_id="u1", verb=verb)

    # Should not contain raw Decimal objects
    assert isinstance(result["verb_id"], str)
