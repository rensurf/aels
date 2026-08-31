"""
apply_phrase_review.py の適用結果を検証するスクリプト。
Usage: python scripts/verify_phrase_review.py
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from src.graph.client import GremlinClient
from src.graph import queries
from src.config import COSMOS_ENDPOINT, COSMOS_KEY, COSMOS_DATABASE, COSMOS_GRAPH

graph = GremlinClient(COSMOS_ENDPOINT, COSMOS_KEY, COSMOS_DATABASE, COSMOS_GRAPH)
USER_ID = "8438407995"

rows = graph.execute(queries.get_all_phrases(USER_ID))
texts = [r["text"][0] for r in rows if r.get("text")]

print(f"Total phrases in DB: {len(texts)}")
print("  (before: 323, expected: 323 - 2 deleted + 20 new = 341)")

UPDATES = [
    ("autonomy",    "I like having autonomy over what I build."),
    ("keep up",     "I couldn't keep up with the conversation."),
    ("how far",     "I'll show you how far I've come."),
    ("ticked",      "I'd always wanted to work abroad and surf — and Australia pretty much ticked all the boxes."),
    ("as expected", "I haven't had as many chances to use my English as I expected."),
    ("express",     "The biggest problem is that I get nervous talking to people I've just met and can't express myself well."),
    ("remember?",   "I told you the other day, remember? I hadn't gone to the toilet for almost a week."),
    ("strange",     "It's strange that I still get nervous talking to people."),
    ("strange",     "It's strange that I still get nervous talking to people."),
    ("autonomy",    "I like having autonomy over what I build."),
]

DELETED = [
    "You won't believe how far I've come",
    "I thought I'd be speaking more English",
]

NEW = [
    "I'm curious about that new juice.",
    "I happened to run into an old friend yesterday.",
    "Do you happen to know any good surf spots?",
    "I really appreciate people who just put themselves out there.",
    "Sorry, I was dealing with something at work.",
    '"Are you nervous?" — "Not really."',
    "I'll show you what I can do.",
]

print("\n=== 置き換え確認 ===")
seen = set()
for label, t in UPDATES:
    if t in seen:
        continue
    seen.add(t)
    ok = t in texts
    print(f"  {'✓' if ok else '✗'} [{label}] {t[:72]}")

print("\n=== 削除確認（存在したらNG） ===")
for t in DELETED:
    found = t in texts
    print(f"  {'✗ 残ってる!' if found else '✓ 削除済み'}: {t}")

print("\n=== 新規追加確認 ===")
for t in NEW:
    ok = t in texts
    print(f"  {'✓' if ok else '✗'} {t[:72]}")
