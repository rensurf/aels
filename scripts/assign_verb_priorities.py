"""
既存の verb データに priority を一括付与するバッチスクリプト。

Usage:
    python scripts/assign_verb_priorities.py

- priority が未設定のパターンを持つ verb だけ処理する（冪等）
- gpt-4o-mini を使用（軽量・安価）
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv

load_dotenv()

from src.config import DYNAMODB_VERBS_TABLE
from src.db.verbs import VerbsClient
from src.tools.verb_tool import assign_pattern_priorities

USER_ID = os.environ.get("WEB_USER_ID") or os.environ.get("TELEGRAM_USER_ID", "")


def main() -> None:
    force = "--force" in sys.argv

    if not USER_ID:
        print("ERROR: WEB_USER_ID or TELEGRAM_USER_ID must be set")
        sys.exit(1)

    client = VerbsClient(DYNAMODB_VERBS_TABLE)
    verbs = client.list_verbs(USER_ID)
    print(f"Found {len(verbs)} verbs for user {USER_ID}")

    updated = skipped = errors = 0

    for verb in verbs:
        patterns = verb.get("patterns", [])
        if not force and all("priority" in p for p in patterns):
            skipped += 1
            continue

        print(f"  {verb['base']} ...", end=" ", flush=True)
        try:
            verb["patterns"] = assign_pattern_priorities(verb)
            client.put_verb(USER_ID, verb)
            summary = [(p["code"], p["priority"]) for p in verb["patterns"]]
            print(f"✓ {summary}")
            updated += 1
        except Exception as e:
            print(f"✗ {e}")
            errors += 1

    print(f"\nDone — updated: {updated}, skipped: {skipped}, errors: {errors}")


if __name__ == "__main__":
    main()
