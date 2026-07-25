"""
CosmosDB から全フレーズをバックアップするスクリプト。

Usage:
    python scripts/backup_phrases.py

- docs/backup_phrases_YYYY-MM-DD.json に保存
- 最新 3 件だけ残してローテーション
"""
import json
import os
import re
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from src.graph.client import GremlinClient
from src.graph.queries import get_all_phrases
from src.config import COSMOS_ENDPOINT, COSMOS_KEY, COSMOS_DATABASE, COSMOS_GRAPH

DOCS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "docs")
KEEP = 3

graph = GremlinClient(
    endpoint=COSMOS_ENDPOINT,
    key=COSMOS_KEY,
    database=COSMOS_DATABASE,
    graph=COSMOS_GRAPH,
)

USER_ID = os.environ.get("TELEGRAM_USER_ID", "8438407995")


def fetch_phrases(user_id: str) -> list[dict]:
    raw = graph.execute(get_all_phrases(user_id))
    phrases = []
    for v in raw:
        def val(key, _v=v):
            prop = _v.get(key, [])
            return prop[0] if prop else ""

        phrases.append({
            "phrase_id": val("phrase_id"),
            "text": val("text"),
            "japanese": val("japanese"),
            "note": val("note"),
        })
    return phrases


def rotate_backups() -> None:
    pattern = re.compile(r"^backup_phrases_\d{4}-\d{2}-\d{2}\.json$")
    files = sorted(
        [f for f in os.listdir(DOCS_DIR) if pattern.match(f)],
        reverse=True,
    )
    for old in files[KEEP:]:
        path = os.path.join(DOCS_DIR, old)
        os.remove(path)
        print(f"  Removed old backup: {old}")


def main() -> None:
    today = date.today().isoformat()
    out_path = os.path.join(DOCS_DIR, f"backup_phrases_{today}.json")

    print(f"Fetching phrases for user {USER_ID}...")
    phrases = fetch_phrases(USER_ID)
    print(f"  {len(phrases)} phrases fetched.")

    data = {"user_id": USER_ID, "date": today, "phrases": phrases}
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  Saved to {out_path}")

    rotate_backups()
    print("Done.")


if __name__ == "__main__":
    main()
