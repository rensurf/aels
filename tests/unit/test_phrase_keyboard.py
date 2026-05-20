from src.main import _phrase_keyboard_dict


def _buttons(keyboard: dict) -> list[list[dict]]:
    return keyboard["inline_keyboard"]


def test_all_deselected_by_default():
    phrases = [
        {"text": "Got it", "japanese": "わかった"},
        {"text": "Sure thing", "japanese": "もちろん"},
    ]
    kb = _phrase_keyboard_dict(phrases)
    assert _buttons(kb)[0][0]["text"].startswith("☐")
    assert _buttons(kb)[1][0]["text"].startswith("☐")


def test_deselected_phrase_shows_empty_checkbox():
    phrases = [
        {"text": "Got it", "japanese": "わかった", "selected": True},
        {"text": "Understood", "japanese": "了解", "selected": False},
    ]
    kb = _phrase_keyboard_dict(phrases)
    assert _buttons(kb)[0][0]["text"].startswith("☑")
    assert _buttons(kb)[1][0]["text"].startswith("☐")


def test_button_label_includes_text_and_japanese():
    phrases = [{"text": "Got it", "japanese": "わかった"}]
    kb = _phrase_keyboard_dict(phrases)
    label = _buttons(kb)[0][0]["text"]
    assert "Got it" in label
    assert "わかった" in label


def test_callback_data_uses_index():
    phrases = [
        {"text": "A", "japanese": "あ"},
        {"text": "B", "japanese": "い"},
        {"text": "C", "japanese": "う"},
    ]
    kb = _phrase_keyboard_dict(phrases)
    assert _buttons(kb)[0][0]["callback_data"] == "toggle_phrase_0"
    assert _buttons(kb)[1][0]["callback_data"] == "toggle_phrase_1"
    assert _buttons(kb)[2][0]["callback_data"] == "toggle_phrase_2"


def test_confirm_and_cancel_buttons_always_present():
    phrases = [{"text": "Got it", "japanese": "わかった"}]
    kb = _phrase_keyboard_dict(phrases)
    action_row = _buttons(kb)[-1]
    callback_data_values = [btn["callback_data"] for btn in action_row]
    assert "confirm_phrases" in callback_data_values
    assert "cancel_phrases" in callback_data_values


def test_toggle_logic_updates_selected_flag():
    phrases = [
        {"text": "Got it", "japanese": "わかった"},
        {"text": "Understood", "japanese": "了解"},
    ]
    # default: both unselected
    kb = _phrase_keyboard_dict(phrases)
    assert _buttons(kb)[0][0]["text"].startswith("☐")
    assert _buttons(kb)[1][0]["text"].startswith("☐")

    # toggle index 0 on
    phrases[0]["selected"] = not phrases[0].get("selected", False)
    kb = _phrase_keyboard_dict(phrases)
    assert _buttons(kb)[0][0]["text"].startswith("☑")
    assert _buttons(kb)[1][0]["text"].startswith("☐")

    # toggle index 0 off again
    phrases[0]["selected"] = not phrases[0].get("selected", False)
    kb = _phrase_keyboard_dict(phrases)
    assert _buttons(kb)[0][0]["text"].startswith("☐")
