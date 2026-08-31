from datetime import date, timedelta

from src.sm2.algorithm import SM2Result, calculate_next_review

# --- interval progression ---

def test_first_review_interval_is_one():
    result = calculate_next_review(ease_factor=2.5, interval=0, repetitions=0, quality=5)
    assert result.interval == 1

def test_second_review_interval_is_six():
    result = calculate_next_review(ease_factor=2.5, interval=1, repetitions=1, quality=5)
    assert result.interval == 6

def test_third_review_uses_ease_factor():
    result = calculate_next_review(ease_factor=2.5, interval=6, repetitions=2, quality=5)
    assert result.interval == round(6 * 2.5)  # 15

def test_subsequent_review_compounds():
    result = calculate_next_review(ease_factor=2.5, interval=15, repetitions=3, quality=5)
    assert result.interval == round(15 * 2.5)  # 38


# --- failure resets ---

def test_quality_below_3_resets_interval():
    result = calculate_next_review(ease_factor=2.5, interval=15, repetitions=3, quality=2)
    assert result.interval == 1

def test_quality_below_3_resets_repetitions():
    result = calculate_next_review(ease_factor=2.5, interval=15, repetitions=3, quality=2)
    assert result.repetitions == 0

def test_quality_3_does_not_reset():
    result = calculate_next_review(ease_factor=2.5, interval=0, repetitions=0, quality=3)
    assert result.repetitions == 1  # incremented, not reset


# --- ease factor updates ---

def test_quality_5_increases_ease_factor():
    result = calculate_next_review(ease_factor=2.5, interval=0, repetitions=0, quality=5)
    assert result.ease_factor == round(2.5 + 0.1, 2)  # 2.6

def test_quality_4_leaves_ease_factor_unchanged():
    result = calculate_next_review(ease_factor=2.5, interval=0, repetitions=0, quality=4)
    assert result.ease_factor == 2.5

def test_quality_3_decreases_ease_factor():
    result = calculate_next_review(ease_factor=2.5, interval=0, repetitions=0, quality=3)
    assert result.ease_factor == round(2.5 - 0.14, 2)  # 2.36

def test_ease_factor_floor_is_1_3():
    result = calculate_next_review(ease_factor=1.3, interval=0, repetitions=0, quality=0)
    assert result.ease_factor == 1.3  # would go to 0.5 without the floor


# --- due date ---

def test_due_date_is_interval_days_from_today():
    result = calculate_next_review(ease_factor=2.5, interval=0, repetitions=0, quality=5)
    expected = (date.today() + timedelta(days=result.interval)).isoformat()
    assert result.due_date == expected

def test_due_date_format_is_iso():
    result = calculate_next_review(ease_factor=2.5, interval=0, repetitions=0, quality=5)
    date.fromisoformat(result.due_date)  # raises ValueError if format is wrong


# --- return type ---

def test_returns_sm2result():
    result = calculate_next_review(ease_factor=2.5, interval=0, repetitions=0, quality=5)
    assert isinstance(result, SM2Result)
