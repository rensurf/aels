"""
SM-2 データ確認スクリプト
Usage: python scripts/check_sm2.py [user_id]
"""
import sys
from datetime import date
from dotenv import load_dotenv

load_dotenv()

from src.graph.client import GremlinClient
from src.graph import queries
from src.config import COSMOS_ENDPOINT, COSMOS_KEY, COSMOS_DATABASE, COSMOS_GRAPH

graph = GremlinClient(
    endpoint=COSMOS_ENDPOINT,
    key=COSMOS_KEY,
    database=COSMOS_DATABASE,
    graph=COSMOS_GRAPH,
)

# user_id を引数から取得、なければ全ユーザーを表示
target_user = sys.argv[1] if len(sys.argv) > 1 else None

users = graph.execute("g.V().hasLabel('user').valueMap()")
if not users:
    print("No users found.")
    sys.exit(0)

today = date.today().isoformat()

for user in users:
    user_id = user["user_id"][0]
    if target_user and user_id != target_user:
        continue

    print(f"\n{'='*60}")
    print(f"User: {user_id}")
    print(f"Today: {today}")
    print(f"{'='*60}")

    sm2_rows = graph.execute(queries.get_all_sm2_data(user_id))
    phrase_rows = graph.execute(queries.get_all_phrases(user_id))
    phrase_by_id = {p["phrase_id"][0]: p for p in phrase_rows}

    due = [r for r in sm2_rows if r.get("due_date", "9999-99-99") <= today]
    future = [r for r in sm2_rows if r.get("due_date", "9999-99-99") > today]

    print(f"\nTotal phrases: {len(sm2_rows)}")
    print(f"Due today:     {len(due)}")
    print(f"Future:        {len(future)}")

    print(f"\n--- Due today ({len(due)}) ---")
    due_sorted = sorted(due, key=lambda r: float(r.get("ease_factor", 2.5)))
    for r in due_sorted:
        pid = r["phrase_id"]
        phrase = phrase_by_id.get(pid, {})
        text = phrase.get("text", ["?"])[0]
        japanese = phrase.get("japanese", ["?"])[0]
        print(
            f"  [{r.get('due_date')}] interval={r.get('interval'):>3}  "
            f"ef={float(r.get('ease_factor', 2.5)):.2f}  "
            f"rep={r.get('repetitions')}  "
            f"| {text} — {japanese}"
        )

    if future:
        print(f"\n--- Future ({len(future)}) ---")
        future_sorted = sorted(future, key=lambda r: r.get("due_date", ""))
        for r in future_sorted[:20]:
            pid = r["phrase_id"]
            phrase = phrase_by_id.get(pid, {})
            text = phrase.get("text", ["?"])[0]
            print(
                f"  [{r.get('due_date')}] interval={r.get('interval'):>3}  "
                f"ef={float(r.get('ease_factor', 2.5)):.2f}  "
                f"| {text}"
            )
        if len(future) > 20:
            print(f"  ... and {len(future) - 20} more")
