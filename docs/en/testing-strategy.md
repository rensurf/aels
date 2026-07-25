# Testing Strategy

A decision framework for what to test and what to skip.

---

## The one-liner

**Test logic. Don't test plumbing (I/O).**

The goal of a test is to build a safety net around the places where bugs are easy to introduce.
Writing tests where bugs are unlikely — or where you're only asserting that a mock was called — doesn't guarantee real behaviour.

---

## When to write a test

Write a test if any of these apply:

1. **Branching logic** — the output changes depending on the input
2. **Numeric calculation** — arithmetic errors can creep in
3. **Clear edge cases** — boundary conditions where bugs cluster
4. **Regression risk** — behaviour that should be protected during refactoring

---

## When to skip a test

Skip if any of these apply:

1. **No logic** — a single line like `return f"Saved {len(phrases)} phrase(s)"` is not worth testing
2. **Just asserting mock calls** — verifying "was the DB called once?" says nothing about real behaviour
3. **Framework / library behaviour** — how many times the agent calls a tool is GPT-4o's decision, not testable at unit level
4. **External service wrappers** — whether Gremlin, DynamoDB, or OpenAI calls succeed is the service's responsibility

---

## Concrete examples from this project

### Worth testing

| Target | Reason |
|---|---|
| SM-2 algorithm (`algorithm.py`) | Numeric calculation + branching. The ease_factor update formula is easy to get wrong |
| Gremlin query generation (`queries.py`) | String manipulation + escaping. A single unescaped apostrophe breaks the query |
| `is_duplicate_update` | Branching on duplicate/non-duplicate + DynamoDB exception handling |

### Not worth testing

| Target | Reason |
|---|---|
| `save_phrases` return value | No logic — just checking that Python's return statement works |
| DynamoDB call count | Mock assertion — doesn't verify actual behaviour |
| Agent tool-call behaviour | GPT-4o's decision — not controllable at unit test level |
| Gremlin / DynamoDB connection success | Infrastructure concern — outside unit test scope |

---

## Test types and when to use them

| Type | Target | Usage in this project |
|---|---|---|
| **Unit tests** | Pure functions and logic | SM-2, query generation, duplicate detection |
| **Local agent test** | Agent behaviour validation | `test_agent_local.py` — run the agent against real LLM |
| **Production smoke test** | Integration with external services | Send a Telegram message and verify end-to-end |

---

## On coverage targets

A number like "80% coverage" is a rough proxy, not a goal.
What matters is whether the tests that exist are meaningful. Tests written purely to raise a coverage number create false confidence.

> High coverage with bad tests is worse than low coverage with good tests.
> Bad tests give false confidence.
