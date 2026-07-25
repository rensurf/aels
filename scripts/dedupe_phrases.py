"""
同じ日本語に対して複数の英訳が保存されているフレーズを整理するスクリプト
Usage: python scripts/dedupe_phrases.py [user_id]

1件選んで残りを削除する対話式スクリプト。
"""
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

from src.graph.client import GremlinClient
from src.graph import queries
from src.config import COSMOS_ENDPOINT, COSMOS_KEY, COSMOS_DATABASE, COSMOS_GRAPH


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

        # 同じ日本語でグループ化
        groups: dict[str, list[dict]] = defaultdict(list)
        for p in phrases:
            groups[p["japanese"]].append(p)

        dupes = {jp: ps for jp, ps in groups.items() if len(ps) > 1}

        print(f"Total phrases: {len(phrases)}")
        print(f"Duplicate groups: {len(dupes)}\n")

        if not dupes:
            print("No duplicates found.")
            return

        deleted_total = 0

        for jp, ps in dupes.items():
            print(f"\n{'─'*60}")
            print(f"🇯🇵  {jp}\n")
            for i, p in enumerate(ps, 1):
                print(f"  {i}. {p['text']}")
                if p["note"]:
                    print(f"     ({p['note']})")

            print()
            while True:
                raw = input(
                    f"  Keep which? (1–{len(ps)} / s=skip / q=quit): "
                ).strip().lower()

                if raw == "q":
                    print(f"\nDone. Deleted {deleted_total} phrases total.")
                    return

                if raw == "s":
                    break

                if raw.isdigit() and 1 <= int(raw) <= len(ps):
                    keep_idx = int(raw) - 1
                    to_delete = [p for i, p in enumerate(ps) if i != keep_idx]
                    for p in to_delete:
                        graph.execute(queries.delete_phrase(p["phrase_id"]))
                        deleted_total += 1
                    print(f"  → Kept: \"{ps[keep_idx]['text']}\" / Deleted {len(to_delete)} phrase(s)")
                    break

                print(f"  Invalid input. Enter 1–{len(ps)}, s, or q.")

        print(f"\nDone. Deleted {deleted_total} phrases total.")


if __name__ == "__main__":
    main()
