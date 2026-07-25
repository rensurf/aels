"""
Tests for POST /verbs and PUT /verbs/{verb_id} handlers in src/main.py.

Patching strategy:
- src.main.WEB_API_KEY / WEB_USER_ID  — module-level constants read at import time
- src.main.generate_verb_patterns     — LLM call we don't want to make in tests
- src.main.verbs_client               — DynamoDB client we don't want to hit in tests
"""
import json
from unittest.mock import MagicMock, patch

import src.main  # import once; patches below modify its namespace directly

MOCK_VERB = {
    "verb_id": "hear",
    "base": "hear",
    "patterns": [{"code": "[VN]", "description": "他動詞", "examples": ["I heard a noise."]}],
    "confusable_with": ["listen"],
    "similar_to": ["catch"],
    "noun_form": "hearing",
}


def _event(body=None, headers=None, path_params=None):
    return {
        "headers": headers if headers is not None else {"x-api-key": "test-key"},
        "body": json.dumps(body) if body is not None else None,
        "pathParameters": path_params or {},
    }


# ── POST /verbs ────────────────────────────────────────────────────────────────

def test_post_verb_401_when_wrong_api_key():
    with patch("src.main.WEB_API_KEY", "test-key"), patch("src.main.WEB_USER_ID", "u1"):
        resp = src.main._handle_post_verb(
            _event(body={"base": "hear"}, headers={"x-api-key": "wrong"})
        )
    assert resp["statusCode"] == 401


def test_post_verb_400_when_base_missing():
    with patch("src.main.WEB_API_KEY", "test-key"), patch("src.main.WEB_USER_ID", "u1"):
        resp = src.main._handle_post_verb(_event(body={}))
    assert resp["statusCode"] == 400
    assert "base" in json.loads(resp["body"])["error"]


def test_post_verb_400_when_base_is_blank():
    with patch("src.main.WEB_API_KEY", "test-key"), patch("src.main.WEB_USER_ID", "u1"):
        resp = src.main._handle_post_verb(_event(body={"base": "   "}))
    assert resp["statusCode"] == 400


def test_post_verb_200_returns_generated_verb():
    with (
        patch("src.main.WEB_API_KEY", "test-key"),
        patch("src.main.WEB_USER_ID", "u1"),
        patch("src.main.generate_verb_patterns", return_value=MOCK_VERB) as mock_gen,
    ):
        resp = src.main._handle_post_verb(_event(body={"base": "hear"}))

    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert body["verb_id"] == "hear"
    assert body["base"] == "hear"
    mock_gen.assert_called_once_with("hear")


def test_post_verb_lowercases_base_before_calling_generate():
    with (
        patch("src.main.WEB_API_KEY", "test-key"),
        patch("src.main.WEB_USER_ID", "u1"),
        patch("src.main.generate_verb_patterns", return_value=MOCK_VERB) as mock_gen,
    ):
        src.main._handle_post_verb(_event(body={"base": "HEAR"}))

    mock_gen.assert_called_once_with("hear")


def test_post_verb_500_when_generate_raises():
    with (
        patch("src.main.WEB_API_KEY", "test-key"),
        patch("src.main.WEB_USER_ID", "u1"),
        patch("src.main.generate_verb_patterns", side_effect=Exception("API error")),
    ):
        resp = src.main._handle_post_verb(_event(body={"base": "hear"}))

    assert resp["statusCode"] == 500


# ── PUT /verbs/{verb_id} ───────────────────────────────────────────────────────

def test_put_verb_401_when_wrong_api_key():
    with patch("src.main.WEB_API_KEY", "test-key"), patch("src.main.WEB_USER_ID", "u1"):
        resp = src.main._handle_put_verb(
            _event(body=MOCK_VERB, headers={"x-api-key": "wrong"}, path_params={"verb_id": "hear"})
        )
    assert resp["statusCode"] == 401


def test_put_verb_200_saves_and_returns_verb():
    saved = {**MOCK_VERB, "created_at": "2026-07-25T00:00:00+00:00"}
    mock_client = MagicMock()
    mock_client.put_verb.return_value = saved

    with (
        patch("src.main.WEB_API_KEY", "test-key"),
        patch("src.main.WEB_USER_ID", "u1"),
        patch("src.main.verbs_client", mock_client),
    ):
        resp = src.main._handle_put_verb(
            _event(body=MOCK_VERB, path_params={"verb_id": "hear"})
        )

    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert body["verb_id"] == "hear"


def test_put_verb_uses_path_verb_id_not_body():
    """verb_id should come from the URL path, not the request body."""
    mock_client = MagicMock()
    mock_client.put_verb.return_value = {**MOCK_VERB, "verb_id": "hear"}
    body_with_wrong_id = {**MOCK_VERB, "verb_id": "WRONG"}

    with (
        patch("src.main.WEB_API_KEY", "test-key"),
        patch("src.main.WEB_USER_ID", "u1"),
        patch("src.main.verbs_client", mock_client),
    ):
        src.main._handle_put_verb(
            _event(body=body_with_wrong_id, path_params={"verb_id": "hear"})
        )

    call_verb = mock_client.put_verb.call_args.kwargs["verb"]
    assert call_verb["verb_id"] == "hear"  # overwritten by path param


def test_put_verb_500_when_db_raises():
    mock_client = MagicMock()
    mock_client.put_verb.side_effect = Exception("DynamoDB error")

    with (
        patch("src.main.WEB_API_KEY", "test-key"),
        patch("src.main.WEB_USER_ID", "u1"),
        patch("src.main.verbs_client", mock_client),
    ):
        resp = src.main._handle_put_verb(
            _event(body=MOCK_VERB, path_params={"verb_id": "hear"})
        )

    assert resp["statusCode"] == 500
