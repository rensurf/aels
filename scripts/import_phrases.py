"""
バックアップから CosmosDB にフレーズをインポートするスクリプト。

Usage:
    python scripts/import_phrases.py [--dry-run]

- 元の phrase_id を保持
- SM-2 は初期値（interval=0, due_date=今日）でリセット
- パターン分類も実行（弱点分析を復元するため）
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from src.graph.client import GremlinClient
from src.graph import queries
from src.graph.queries import _esc
from src.tools.memory_tool import _classify_pattern, _get_or_create_pattern
from src.config import COSMOS_ENDPOINT, COSMOS_KEY, COSMOS_DATABASE, COSMOS_GRAPH

BACKUP_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "docs", "backup_phrases_2026-06-07.json")

DRY_RUN = "--dry-run" in sys.argv

graph = GremlinClient(
    endpoint=COSMOS_ENDPOINT,
    key=COSMOS_KEY,
    database=COSMOS_DATABASE,
    graph=COSMOS_GRAPH,
)


def ensure_user(user_id: str) -> None:
    existing = graph.execute(f"g.V().has('user', 'user_id', '{_esc(user_id)}')")
    if not existing:
        print(f"  Creating user {user_id}")
        if not DRY_RUN:
            graph.execute(queries.create_user(user_id=user_id, name=user_id, goal="Work in Australia"))


def main() -> None:
    with open(BACKUP_PATH) as f:
        data = json.load(f)

    user_id = data["user_id"]
    phrases = data["phrases"]
    print(f"Importing {len(phrases)} phrases for user {user_id}")
    if DRY_RUN:
        print("  [DRY RUN — no writes]")

    ensure_user(user_id)

    ok = 0
    errors = 0
    for i, phrase in enumerate(phrases, 1):
        phrase_id = phrase["phrase_id"]
        text = phrase.get("text", "")
        japanese = phrase.get("japanese", "")
        note = phrase.get("note", "")

        print(f"[{i}/{len(phrases)}] {text[:60]}")

        try:
            if not DRY_RUN:
                graph.execute(queries.create_phrase(
                    phrase_id=phrase_id,
                    text=text,
                    japanese=japanese,
                    note=note,
                    user_id=user_id,
                ))
                graph.execute(queries.link_user_to_phrase(user_id=user_id, phrase_id=phrase_id))

                pattern_name = _classify_pattern(text=text, japanese=japanese, note=note)
                pattern_id = _get_or_create_pattern(name=pattern_name, user_id=user_id)
                graph.execute(queries.link_phrase_to_pattern(phrase_id=phrase_id, pattern_id=pattern_id))
                print(f"  → pattern: {pattern_name}")

                time.sleep(0.3)  # CosmosDB rate limit 対策
            ok += 1
        except Exception as e:
            print(f"  ERROR: {e}")
            errors += 1

    print(f"\nDone. {ok} imported, {errors} errors.")


if __name__ == "__main__":
    main()
