"""
レビュー済みフレーズをグラフDBに反映するスクリプト。

- 置き換え: 既存フレーズのテキストを Better 版に更新（SM-2データ温存）
- 新規追加: DB に存在しない新フレーズを追加
- 削除:     consolidation で不要になったフレーズを削除

Usage: python scripts/apply_phrase_review.py [--dry-run] [user_id]
"""
import os
import re
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

from src.graph.client import GremlinClient
from src.graph import queries
from src.config import COSMOS_ENDPOINT, COSMOS_KEY, COSMOS_DATABASE, COSMOS_GRAPH

APPROVED_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "docs", "phrase_review_approved.md")
ISSUES_PATH   = os.path.join(os.path.dirname(os.path.dirname(__file__)), "docs", "phrase_issues.md")

# issue#128 と #129 は consolidation で別フレーズに統合済み → 削除対象
CONSOLIDATION_DELETES = {128, 129}


def parse_issues(path: str) -> dict[int, str]:
    """issue# → 元の英文テキスト"""
    result: dict[int, str] = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            m = re.match(r"^## (\d+)\. (.+)$", line.rstrip())
            if m:
                result[int(m.group(1))] = m.group(2)
    return result


def parse_approved(path: str) -> list[dict]:
    """approved.md の各行を辞書のリストとして返す。"""
    entries = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            if not line.startswith("| ") or line.startswith("| #"):
                continue
            parts = [p.strip() for p in line.strip().strip("|").split("|")]
            if len(parts) < 4:
                continue
            num_raw, english, japanese, context = parts[0], parts[1], parts[2], parts[3]
            m = re.match(r"^(\d+)([a-z]*)$", num_raw)
            if not m:
                continue
            entries.append({
                "raw": num_raw,
                "base": int(m.group(1)),
                "suffix": m.group(2),
                "english": english,
                "japanese": japanese,
                "context": context,
            })
    return entries


def classify(entries: list[dict]) -> tuple[list[dict], list[dict]]:
    """置き換えと新規に分類する。"""
    seen_bases: set[int] = set()
    replacements, new_phrases = [], []

    for e in entries:
        base = e["base"]
        suffix = e["suffix"]
        if base not in seen_bases:
            seen_bases.add(base)
            replacements.append(e)
        else:
            new_phrases.append(e)

    return replacements, new_phrases


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    target_user = args[0] if args else None

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

    issues = parse_issues(ISSUES_PATH)
    entries = parse_approved(APPROVED_PATH)
    replacements, new_phrases = classify(entries)

    print(f"Parsed: {len(replacements)} replacements, {len(new_phrases)} new phrases")
    print(f"Consolidation deletes: {sorted(CONSOLIDATION_DELETES)}")

    for user in users:
        user_id = user["user_id"][0]
        if target_user and user_id != target_user:
            continue

        print(f"\n{'='*60}")
        print(f"User: {user_id}  dry_run={dry_run}")
        print(f"{'='*60}")

        rows = graph.execute(queries.get_all_phrases(user_id))
        text_to_id = {r["text"][0]: r["phrase_id"][0] for r in rows if r.get("text")}
        print(f"DB phrases loaded: {len(text_to_id)}")

        # --- 置き換え ---
        ok, skipped = 0, 0
        for e in replacements:
            orig_text = issues.get(e["base"])
            if not orig_text:
                print(f"  [SKIP] issue#{e['base']} not in issues.md")
                skipped += 1
                continue
            phrase_id = text_to_id.get(orig_text)
            if not phrase_id:
                print(f"  [SKIP] issue#{e['base']} not found in DB: {orig_text[:60]}")
                skipped += 1
                continue
            print(f"  [UPDATE] #{e['base']} → {e['english'][:60]}")
            if not dry_run:
                graph.execute(queries.update_phrase(phrase_id, e["english"], e["japanese"]))
            ok += 1
        print(f"Replacements: {ok} updated, {skipped} skipped")

        # --- 新規追加 ---
        added = 0
        for e in new_phrases:
            phrase_id = str(uuid.uuid4())
            print(f"  [NEW] #{e['raw']} → {e['english'][:60]}")
            if not dry_run:
                graph.execute(queries.create_phrase(phrase_id, e["english"], e["japanese"], e["context"], user_id))
                graph.execute(queries.link_user_to_phrase(user_id, phrase_id))
            added += 1
        print(f"New phrases: {added} added")

        # --- 削除（consolidation） ---
        deleted = 0
        for issue_num in sorted(CONSOLIDATION_DELETES):
            orig_text = issues.get(issue_num)
            if not orig_text:
                continue
            phrase_id = text_to_id.get(orig_text)
            if not phrase_id:
                print(f"  [SKIP DELETE] issue#{issue_num} not found in DB")
                continue
            print(f"  [DELETE] issue#{issue_num}: {orig_text[:60]}")
            if not dry_run:
                graph.execute(queries.delete_phrase(phrase_id))
            deleted += 1
        print(f"Deleted: {deleted}")

    print("\nDone.")


if __name__ == "__main__":
    main()
