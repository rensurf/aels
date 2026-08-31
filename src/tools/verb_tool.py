import json

import requests
from bs4 import BeautifulSoup

from src.llm.client import chat

_SYSTEM = """以下は Oxford Advanced Learner's Dictionary (OALD) から取得した動詞のデータです。
これを基に、日本の5文型（V1〜V5）への分類と句動詞の選定を行ってください。

V1 = SV（自動詞）
V2 = SVC（補語を取る連結動詞）
V3 = SVO（他動詞）
V4 = SVOO（二重目的語）
V5 = SVOC（目的格補語）

注意：
- 前置詞句（to N, for N, at N など）は O/C に数えない
  例：invite him to the party → V3（"to the party" は前置詞句、O2 ではない）
  例：give a book to her → V3（"to her" は前置詞句。V4 は "give her a book" の形のみ）
- V4 は動詞の直後に O1・O2 が前置詞なしで並ぶ場合のみ（例：give me a book / tell me the truth）
- V2・V4 はそのセンスが明らかにそのパターンを取る場合のみ挙げる
- 複数のセンスが同じ文型になる場合は1つにまとめてよい
- description は日本語、examples は自然な英語で書く
- confusable_with：学習者がこの動詞と混同しやすい動詞を2〜4語（あなたの知識から）
- similar_to：意味が近い同義語・類似表現を2〜4語（あなたの知識から）
- phrasal_verbs：提供された句動詞リストの中から日常英語で特に重要なものを7〜8件選ぶ。
  各項目に pattern（V1〜V5）・日本語の definition・自然な英語の example を付けること。
  pattern は句動詞単体が取る文型（例: "look after sb" → V3、"look out" → V1）。

- priority: 各コードに整数を割り当てる（1が最重要）。日常英語での使用頻度・重要度が基準。
  同時に覚えるべきコードは同じ数字にしてよい。

出力は以下の JSON 形式で返してください：
{
  "patterns": [
    {
      "code": "V1",
      "priority": 1,
      "structure": "return / return to N",
      "description": "日本語で意味・用法を説明",
      "examples": ["英文例1", "英文例2"]
    }
  ],
  "confusable_with": [],
  "similar_to": [],
  "phrasal_verbs": [
    {
      "phrase": "look after",
      "pattern": "V3",
      "definition": "〜の世話をする",
      "example": "Who's going to look after the children?"
    }
  ],
  "noun_form": null,
  "adj_form": null
}
"""

_HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}


def _fetch_oald_senses(base: str) -> tuple[list[dict], BeautifulSoup | None]:
    for url_key in [f"{base}_1", base, f"{base}_2"]:
        url = f"https://www.oxfordlearnersdictionaries.com/definition/english/{url_key}"
        try:
            r = requests.get(url, headers=_HEADERS, timeout=8)
        except Exception:
            continue
        if r.status_code != 200:
            continue
        soup = BeautifulSoup(r.text, "html.parser")
        senses = []
        for sense in soup.select(".sense"):
            gram = sense.select_one(".grammar")
            defn = sense.select_one(".def")
            if not gram or not defn:
                continue
            gram_text = gram.get_text(strip=True)
            if "intransitive" not in gram_text and "transitive" not in gram_text:
                continue
            examples = [e.get_text(strip=True) for e in sense.select(".x")[:3]]
            senses.append({
                "grammar": gram_text,
                "definition": defn.get_text(strip=True),
                "examples": examples,
            })
        if senses:
            return senses, soup
    return [], None


def _fetch_oald_phrasal_verbs(soup: BeautifulSoup) -> list[str]:
    return [a.get_text(strip=True) for a in soup.select(".phrasal_verb_links a")]


def assign_pattern_priorities(verb: dict) -> list[dict]:
    """Assign priority tiers to existing verb patterns via LLM (gpt-4o-mini)."""
    patterns = verb.get("patterns", [])
    if not patterns:
        return patterns

    codes = list(dict.fromkeys(p["code"] for p in patterns))
    summaries = []
    for code in codes:
        descs = " / ".join(p.get("description", "") for p in patterns if p["code"] == code)
        summaries.append({"code": code, "description": descs})

    prompt = (
        f'動詞 "{verb["base"]}" の文型パターンに priority を割り当ててください。\n\n'
        "ルール:\n"
        "- priority は整数（1が最重要）\n"
        "- 日常英語での使用頻度・重要度が基準\n"
        "- 同時に覚えるべきパターンは同じ数字にしてよい\n\n"
        f"パターン:\n{json.dumps(summaries, ensure_ascii=False, indent=2)}\n\n"
        'JSON 配列で返す: [{"code": "V1", "priority": 1}, ...]'
    )
    raw = chat(
        [{"role": "user", "content": prompt}],
        json_mode=True,
        max_tokens=200,
        provider="openai",
        model_tier="light",
    )
    assignments: list[dict] = json.loads(raw)
    priority_map = {a["code"]: a["priority"] for a in assignments}
    return [{**p, "priority": priority_map.get(p["code"], 1)} for p in patterns]


def generate_verb_patterns(base: str) -> dict:
    """Fetch OALD senses and phrasal verbs, then classify via LLM."""
    senses, soup = _fetch_oald_senses(base.lower())

    if senses:
        lines = [f"動詞: {base}\n\n## OALD センスデータ:"]
        for i, s in enumerate(senses, 1):
            lines.append(f"\n[{i}] {s['grammar']}\n定義: {s['definition']}")
            for ex in s["examples"]:
                lines.append(f"例文: {ex}")

        phrasal_verbs = _fetch_oald_phrasal_verbs(soup) if soup else []
        if phrasal_verbs:
            lines.append(f"\n## OALD 句動詞リスト（全{len(phrasal_verbs)}件）:")
            lines.append(", ".join(phrasal_verbs))

        user_content = "\n".join(lines)
    else:
        user_content = f"動詞: {base}\n（OALD データ取得失敗 - 知識から回答してください）"

    messages = [
        {"role": "system", "content": _SYSTEM},
        {"role": "user", "content": user_content},
    ]
    raw = chat(messages, json_mode=True, max_tokens=2000, provider="openai", model_tier="main")
    data = json.loads(raw)
    verb: dict = {
        "verb_id": base.lower(),
        "base": base.lower(),
        "patterns": data.get("patterns", []),
        "confusable_with": data.get("confusable_with", []),
        "similar_to": data.get("similar_to", []),
        "phrasal_verbs": data.get("phrasal_verbs", []),
    }
    if data.get("noun_form"):
        verb["noun_form"] = data["noun_form"]
    if data.get("adj_form"):
        verb["adj_form"] = data["adj_form"]
    return verb
