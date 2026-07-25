# Key Design Decisions

Interview prep material — the "why" behind major technical choices in this project.

---

## Why a graph database instead of relational?

Phrases have relationships — a phrase can belong to multiple topics, link to related phrases, and connect to a user's learning history. Graph traversal makes queries like "find phrases related to what I'm struggling with" natural. CosmosDB's Gremlin API gives managed, scalable graph storage without running infrastructure.

## Why the SM-2 algorithm for review scheduling?

SM-2 is the algorithm behind Anki. It tracks per-phrase `ease_factor`, `interval`, and `repetitions`, and adjusts how soon you see a phrase again based on how well you answered. Correct answers push the interval out exponentially; wrong answers reset it. This concentrates review time where it's actually needed.

## Why Agent Framework instead of raw API calls?

The agent pattern cleanly separates concerns: the `Client` handles the LLM API, the `Agent` defines instructions and tools, and the `Session` holds conversation history. Swapping GPT-4o for another model only requires changing the `Client`. Tool functions are plain Python — no special decorators, just type annotations and docstrings that become the schema.

## Why AWS Lambda instead of a server?

A Telegram bot has bursty, unpredictable traffic. Lambda scales to zero when idle (cost: $0), and scales out instantly on demand. The 29-second timeout is set to match Telegram's 30-second webhook deadline.

## Why split AWS and Azure?

AWS Lambda + DynamoDB for compute and sessions (fastest cold-start region: ap-southeast-2). Azure CosmosDB for the graph because the Gremlin API is unique to CosmosDB — no equivalent in AWS. Terraform manages both providers in one `apply`.

## Why add a `pattern` node to the graph?

A relational table would store phrase–category as a flat column. A graph edge `(phrase) -[uses_pattern]-> (pattern)` lets you traverse in either direction: "which phrases use prepositions?" or "what patterns does this phrase belong to?" This makes weakness detection a graph query rather than a string filter, which is the actual reason for choosing a graph database over a simple table.

## Why classify patterns at save time (not quiz time)?

Pattern classification calls GPT-4o. Doing it at save time keeps the quiz path fast and deterministic — quiz scheduling only reads existing graph properties. It also means weakness analysis (`get_weakness_summary`) can run as a read-only traversal with no LLM calls.

## Why use SM-2 `ease_factor` as the weakness signal?

`ease_factor` starts at 2.5 and decreases each time the user answers wrong. It's a persistent, per-phrase quality score that accumulates across sessions — more reliable than a single quiz result. Sorting due phrases by ascending `ease_factor` surfaces the weakest phrases first without any separate "weakness" data model.

## Why toggle-select phrases instead of save-all or save-nothing?

Translation returns 2–3 alternatives (casual, formal, idiomatic). Saving all of them adds noise to the review queue — the user may only want the register that fits their context. A per-phrase toggle at save time keeps the knowledge graph signal clean and makes quiz sessions more relevant.

## Why delete only `messages` on `/reset`, not the whole DynamoDB item?

The session item holds multiple independent fields: `messages` (OpenAI context reference), `pending_phrases`, `quiz_state`, and `turn_count`. Deleting the whole item would discard an in-progress phrase save or an active quiz. Removing only `messages` severs the OpenAI context — which is all a reset needs to do — while leaving the rest of the session intact.
