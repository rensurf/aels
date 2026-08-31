import json
from unittest.mock import patch

from src.tools.verb_tool import generate_verb_patterns

_FULL_RESPONSE = json.dumps({
    "patterns": [
        {"code": "V3", "description": "他動詞（音・声を聞く）",      "examples": ["I heard a noise."]},
        {"code": "V5", "description": "複合他動詞（知覚動詞 + -ing）", "examples": ["I heard him singing."]},
    ],
    "confusable_with": ["listen"],
    "similar_to": ["catch", "pick up"],
    "noun_form": "hearing",
    "adj_form": None,
})

_MINIMAL_RESPONSE = json.dumps({
    "patterns": [],
    "confusable_with": [],
    "similar_to": [],
    "noun_form": None,
    "adj_form": None,
})


def test_returns_expected_shape():
    with patch("src.tools.verb_tool.chat", return_value=_FULL_RESPONSE):
        result = generate_verb_patterns("hear")

    assert result["verb_id"] == "hear"
    assert result["base"] == "hear"
    assert len(result["patterns"]) == 2
    assert result["patterns"][0]["code"] == "V3"
    assert result["confusable_with"] == ["listen"]
    assert result["similar_to"] == ["catch", "pick up"]
    assert result["noun_form"] == "hearing"


def test_normalizes_input_to_lowercase():
    with patch("src.tools.verb_tool.chat", return_value=_FULL_RESPONSE):
        result = generate_verb_patterns("HEAR")

    assert result["verb_id"] == "hear"
    assert result["base"] == "hear"


def test_calls_chat_with_json_mode_and_openai_provider():
    with patch("src.tools.verb_tool.chat", return_value=_FULL_RESPONSE) as mock_chat:
        generate_verb_patterns("hear")

    mock_chat.assert_called_once()
    kwargs = mock_chat.call_args.kwargs
    assert kwargs["json_mode"] is True
    assert kwargs["provider"] == "openai"


def test_omits_noun_form_and_adj_form_when_null():
    with patch("src.tools.verb_tool.chat", return_value=_MINIMAL_RESPONSE):
        result = generate_verb_patterns("run")

    assert "noun_form" not in result
    assert "adj_form" not in result


def test_includes_both_optional_forms_when_present():
    response = json.dumps({
        "patterns": [],
        "confusable_with": [],
        "similar_to": [],
        "noun_form": "satisfaction",
        "adj_form": "satisfying",
    })
    with patch("src.tools.verb_tool.chat", return_value=response):
        result = generate_verb_patterns("satisfy")

    assert result["noun_form"] == "satisfaction"
    assert result["adj_form"] == "satisfying"
