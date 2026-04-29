# Lessons Learned

実装中に詰まって・仮説を立てて・解決した経験を記録する。
面接の「苦労したこと」「技術的に難しかったこと」の素材にする。

フォーマット：
- **何を詰まったか**：症状・エラーメッセージ
- **自分の仮説**：最初に何が原因だと思ったか
- **実際の原因**：何が問題だったか
- **解決策**：どう直したか
- **学び**：次に同じ状況になったときに何を見るか

---

<!-- 記録はここから下に追記していく -->

---

## #002 requirements.txt のバージョンピン留めで依存関係の衝突

**日付**: 2026-04-29
**フェーズ**: Task 0.4 - プロジェクト構造セットアップ

**症状**
```
uv pip install -r requirements.txt で No solution found
agent-framework==1.2.1 depends on python-dotenv>=1.1.1
you require python-dotenv==1.0.0 → unsatisfiable
```

**疑問（なぜ hello_agent.py は動いたのか）**
`requirements.txt` に `python-dotenv==1.0.0` と書いていたのに、`hello_agent.py` は問題なく動いていた。

**実際の原因**
最初に `uv pip install agent-framework==1.2.1` を直接実行したとき、uv が依存関係を自動解決して `python-dotenv>=1.1.1` を venv に入れていた。
`hello_agent.py` はすでに正しいバージョンが入っている venv を使っていたので動いた。
衝突したのは `uv pip install -r requirements.txt` で requirements.txt の全制約を同時に満たそうとしたとき。

**解決策**
`requirements.txt` の `python-dotenv==1.0.0` を `python-dotenv>=1.1.1` に変更。

**学び**
- `uv pip install <package>` は依存関係を自動解決するが、`requirements.txt` は書いた制約をそのまま守ろうとする
- バージョンをピン留めするときは依存パッケージとの整合性まで確認が必要
- `==` で固定する場合は慎重に。`>=` の方が柔軟で衝突しにくい

---

## #001 agent-framework インストール直後に `ImportError: cannot import name 'Agent'`

**日付**: 2026-04-29  
**フェーズ**: Task 0.3 - Agent Framework Hello World

**症状**
```
ImportError: cannot import name 'Agent' from 'agent_framework'
```

**自分の最初の仮説**
インポートパスが間違っている？

**実際の原因**
`agent-framework`（傘パッケージ）と `agent-framework-core` が同じ `agent_framework/` 名前空間を共有している。
インストール順によって傘パッケージの空の `__init__.py`（0バイト）が、core の正しい `__init__.py`（11645バイト）を上書きしてしまう。

確認方法：
```bash
wc -c .venv/lib/python3.12/site-packages/agent_framework/__init__.py
# 0 なら上書きされている
```

**解決策**
```bash
uv pip install --reinstall agent-framework-core==1.2.1
```

**学び**
- 傘パッケージ（メタパッケージ）と実装パッケージが同じ Python namespace を使う場合、インストール順で衝突する
- `ImportError` が出たらまずパッケージの `__init__.py` のファイルサイズを確認する
- `--reinstall` で core を後から入れ直すと解決する
