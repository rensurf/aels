"""
グラフDBのフレーズをClaudeでニュアンスチェックするスクリプト
Usage: python scripts/review_phrases.py [user_id]

ANTHROPIC_API_KEY が .env に必要。
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

from src.graph.client import GremlinClient
from src.graph import queries
from src.config import COSMOS_ENDPOINT, COSMOS_KEY, COSMOS_DATABASE, COSMOS_GRAPH
from src.llm.client import chat

BATCH_SIZE = 10

SYSTEM_PROMPT = """You are an expert in Japanese-English translation, specialising in natural Australian English for a software engineer's workplace and daily life.

You will receive a JSON array of saved phrases. Each has:
- "id": an identifier
- "english": the English expression saved
- "japanese": the original Japanese text it was translated from
- "note": context note saved with the phrase (may be empty)

For each phrase, evaluate:
1. Does the English correctly capture the nuance and register of the Japanese?
2. Is it natural in Australian workplace / everyday conversation?
3. Any significant issues (mistranslation, overly formal, too casual, unnatural phrasing)?

Return a JSON array (one object per phrase, same order):
[
  {
    "id": "<same id>",
    "ok": true or false,
    "issue": null or "short description of the problem",
    "suggestion": null or "a better alternative if needed"
  }
]

Be strict but practical — flag real issues, not style preferences. Return only the JSON array, no markdown fences."""


def review_batch(phrases: list[dict]) -> list[dict]:
    payload = [
        {
            "id": p["phrase_id"],
            "english": p["text"],
            "japanese": p["japanese"],
            "note": p.get("note", ""),
        }
        for p in phrases
    ]
    result = chat(
        [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
        json_mode=False,
        provider="claude",
        model_tier="main",
        max_tokens=2000,
    )
    try:
        return json.loads(result)
    except json.JSONDecodeError:
        print(f"[WARN] Failed to parse Claude response:\n{result}")
        return []


def main() -> None:
    target_user = sys.argv[1] if len(sys.argv) > 1 else None

    graph = GremlinClient(
        endpoint=COSMOS_ENDPOINT,
        key=COSMOS_KEY,
        database=COSMOS_DATABASE,
        graph=COSMOS_GRAPH,
    )

    users = graph.execute("g.V().hasLabel('user').valueMap()")
    if not users:
        print("No users found.")
        return

    for user in users:
        user_id = user["user_id"][0]
        if target_user and user_id != target_user:
            continue

        print(f"\n{'='*60}")
        print(f"User: {user_id}")
        print(f"{'='*60}")

        rows = graph.execute(queries.get_all_phrases(user_id))
        if not rows:
            print("No phrases found.")
            continue

        phrases = [
            {
                "phrase_id": r["phrase_id"][0],
                "text": r.get("text", [""])[0],
                "japanese": r.get("japanese", [""])[0],
                "note": r.get("note", [""])[0],
            }
            for r in rows
        ]

        print(f"Total phrases: {len(phrases)}\n")

        all_results: list[dict] = []
        for i in range(0, len(phrases), BATCH_SIZE):
            batch = phrases[i : i + BATCH_SIZE]
            print(f"Reviewing phrases {i+1}–{i+len(batch)}...", end=" ", flush=True)
            results = review_batch(batch)
            all_results.extend(results)
            print("done")

        phrase_by_id = {p["phrase_id"]: p for p in phrases}

        ok_count = sum(1 for r in all_results if r.get("ok"))
        issue_count = len(all_results) - ok_count
        print(f"\nResult: {ok_count} OK  /  {issue_count} issues")

        issues = [r for r in all_results if not r.get("ok")]
        _write_markdown(issues, phrase_by_id, user_id, ok_count, issue_count)


def _write_markdown(
    issues: list[dict],
    phrase_by_id: dict,
    user_id: str,
    ok_count: int,
    issue_count: int,
) -> None:
    from datetime import date

    out_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "docs",
        "phrase_issues.md",
    )

    lines = [
        "# Phrase Issues",
        "",
        f"User: `{user_id}`  ",
        f"Date: {date.today().isoformat()}  ",
        f"Result: {ok_count} OK / {issue_count} issues",
        "",
        "---",
        "",
    ]

    for i, r in enumerate(issues, 1):
        pid = r.get("id", "")
        phrase = phrase_by_id.get(pid, {})
        english = phrase.get("text", "?")
        japanese = phrase.get("japanese", "?")

        lines += [
            f"## {i}. {english}",
            "",
            f"**日本語:** {japanese}  ",
            f"**Issue:** {r.get('issue', '')}  ",
        ]
        if r.get("suggestion"):
            lines.append(f"**Better:** {r['suggestion']}  ")
        lines += ["", "---", ""]

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"Written to {out_path}")


if __name__ == "__main__":
    main()
