from dataclasses import dataclass
from datetime import date, timedelta


@dataclass
class SM2Result:
    ease_factor: float
    interval: int        # days
    repetitions: int
    due_date: str        # ISO format: "2026-05-24"

def calculate_next_review(
    ease_factor: float,    # current (starts at 2.5)
    interval: int,         # current (starts at 0)
    repetitions: int,      # current (starts at 0)
    quality: int,          # 0-5
) -> SM2Result:
    if quality < 3:
        repetitions = 0
        interval = 1
    else:
        if repetitions == 0:
            interval = 1
        elif repetitions == 1:
            interval = 6
        else:
            interval = round(interval * ease_factor)

        repetitions += 1

    # Update ease factor
    ease_factor += (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    ease_factor = max(1.3, ease_factor)  # Minimum EF is 1.3

    due_date = (date.today() + timedelta(days=interval)).isoformat()

    return SM2Result(
        ease_factor=round(ease_factor, 2),
        interval=interval,
        repetitions=repetitions,
        due_date=due_date
    )