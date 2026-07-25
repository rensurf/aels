# AELS v2: Architecture Decision Records (ADR)

Decisions made during design — options considered, trade-offs, and final choices. Written to make "why this design?" answerable.

---

## ADR-001: Concept — Tool or Teacher?

### Context
v1 was designed as a "save phrases → review them" tool. I stopped using it within weeks.

### Options Considered

**A) Tool (v1 continuation)**
- User actively operates it
- Manual save/review flow
- Pro: Simple, implementation is clear
- Con: No motivation to keep using it. Proved by v1.

**B) A personal English teacher**
- Like talking to a teacher
- It comes to you (proactive)
- Remembers your habits, strengths, and weaknesses
- Pro: Creates a reason to keep using it. Easier to build a habit.
- Con: Higher implementation complexity

### Decision: B — Teacher

The root failure of v1 was not the save feature design — it was the absence of any design for the experience of sticking with it. Shifting from tool to teacher changes the product's axis.

---

## ADR-002: Save Mechanism — Auto-save or Selective Save?

### Context
v1 required an explicit "save this" command, which created friction. v2 considered auto-save.

### Options Considered

**A) Fully automatic**
- Detect and save phrases automatically from conversation
- Pro: Zero user effort
- Con: Everything gets saved. No distinction between "want to learn" and "just mentioned".

**B) User selects what to save**
- Present multiple options; user chooses
- Pro: Only what the user actually wants to learn goes in. Higher learning value.
- Con: Requires user interaction

**C) Auto-extract patterns without saving phrases**
- Don't save phrases, but accumulate tendencies and weaknesses from conversation patterns
- Pro: The teacher "observes" Ren without conscious effort
- Con: Phrases can't be reviewed individually

### Decision: B + C combined

- Phrase saving: user selects (B)
- Simultaneously: auto-extract patterns and weaknesses from conversation flow (C)
- Explicit "I want to save this" + implicit teacher observation — both in parallel

---

## ADR-003: Storage — DynamoDB vs PostgreSQL vs Graph DB

### Context
v1 used DynamoDB. v2 reconsidered from scratch.

### Options Considered

**A) DynamoDB (carry over from v1)**
- Pro: AWS-native, serverless, scalable
- Con: Poor at aggregation queries (weakness analysis). Recursive relationships are complex. Doesn't fit v2 use cases.

**B) PostgreSQL (Neon / Supabase)**
- Pro: SQL aggregation queries are easy. SM-2 scheduling data fits naturally.
- Con: Multi-hop traversal (A→B→C→D) requires complex recursive CTEs.

**C) Graph DB (Azure CosmosDB Gremlin API)**
- Pro: Native multi-hop traversal. "error → pattern → root cause → related phrases" chains are natural. The teacher's "intelligence" comes from connections — graph structure fits inherently. Prior work experience.
- Con: Higher operational cost than PostgreSQL. Learning curve.

**D) Amazon Neptune**
- Pro: AWS-native graph DB
- Con: Expensive — far exceeds $5/month budget.

### Decision: C — Azure CosmosDB (Gremlin API) only; no PostgreSQL

The primary query pattern is multi-hop traversal — graph DB is optimal. SM-2 data can be stored as edge properties, keeping everything in CosmosDB. At personal-tool data scale, range query performance is not a concern (see ADR-016). Prior CosmosDB operational experience reduces risk.

---

## ADR-004: Interface — Which Messaging Platform?

### Context
Need a platform that handles both conversation with the teacher and proactive notifications.

### Options Considered

**A) LINE**
- Pro: Most popular in Japan. App Ren already uses. Continuation from v1.
- Con: Barely used in Australia. Risk of becoming unusable after moving. Limited Bot API expressiveness.

**B) Telegram**
- Pro: Bot API designed for individual developers — no review process, start the same day. InlineKeyboard, Markdown — rich expressiveness. Works globally (no issues after moving to Australia).
- Con: Low adoption in Japan. Requires new install.

**C) WhatsApp**
- Pro: Widely used in Australia.
- Con: Automation only via Business API. Requires Meta review and business verification. 24-hour rule (can only message users within 24h of their last reply). Template messages need Meta pre-approval. Per-message cost. Not designed for custom personal bots.

**D) Slack**
- Pro: Familiar to engineers. Rich formatting.
- Con: Too heavy for personal learning. Requires a workspace.

**E) Web UI**
- Pro: Full flexibility.
- Con: Requires opening a separate app — high habituation barrier. Push notifications are difficult.

### Decision: B — Start with Telegram; design with adapter pattern for future expansion

Telegram was chosen for Bot API developer-friendliness and global coverage. Future WhatsApp migration is anticipated — separate core logic from the adapter layer.

```
[Core Layer]  Teacher logic (platform-agnostic)
      ↓
[Adapter Layer]  Telegram / WhatsApp / LINE
```

---

## ADR-005: Cloud — AWS, Azure, or Multi-cloud?

### Context
Once CosmosDB (Azure) was chosen, where to put the rest of the infrastructure.

### Options Considered

**A) Full Azure (CosmosDB + Azure Functions + Event Grid)**
- Pro: Single cloud. Simple operations. Azure Functions experience from work.
- Con: Australian startups predominantly use AWS. Portfolio doesn't demonstrate AWS experience.

**B) Full AWS (Lambda + EventBridge + Neptune)**
- Pro: Unified AWS. Strong for AU job market.
- Con: Amazon Neptune costs exceed budget. CosmosDB experience unused.

**C) Multi-cloud (Azure CosmosDB + AWS Lambda / EventBridge)**
- Pro: Demonstrates "pick the right tool for the job" thinking. Shows both AWS (AU market) and Azure (work strength) in one portfolio. Terraform manages both.
- Con: Cross-cloud authentication and networking add complexity.

### Decision: C — Multi-cloud

- Graph DB: Azure CosmosDB (technically optimal, prior experience)
- Compute: AWS Lambda + EventBridge (AU job market recognition)
- IaC: Terraform managing both Azure and AWS (absorbs multi-cloud complexity)
- Using Azure Functions at work — AWS Lambda in portfolio demonstrates new skill

---

## ADR-006: IaC — Terraform vs CDK vs Bicep?

### Options Considered

**A) Terraform**: Manages both Azure and AWS. Standard in the Australian job market. Shows multi-cloud skill.
**B) AWS CDK**: Write in Python. Type-safe AWS resources. AWS only — can't manage Azure.
**C) Azure Bicep**: Azure-native. Simple. Azure only — can't manage AWS.
**D) AWS SAM**: Lambda-specific. Simple. Low versatility, no Azure support.

### Decision: A — Terraform

Multi-cloud (Azure + AWS) management makes Terraform the only realistic option. Also the AU job market standard.

---

## ADR-007: LLM — Single Model or Multi-LLM?

### Context
v1 used Claude, but GPT-4o felt more natural for English expression in practice. Personal experience: Gemini excels at "why?" explanations.

### Options Considered

**A) Claude only**: Simple, existing API access. Con: Personal experience preferred GPT-4o for English expression. Limited use cases for Claude in this context.

**B) GPT-4o only**: Best at natural English generation. One API key. Simple. Con: Weaker on "why?" explanations vs Gemini in some cases.

**C) Multi-LLM routing (GPT-4o + Claude)**: Use best model per use case. Con: Minimal real use cases for Claude here. Complexity not justified.

**D) Multi-LLM routing (GPT-4o + Gemini)**: Expression/translation/correction → GPT-4o. "Why?" explanations → Gemini. Con: Two API keys, two billing accounts.

### Decision: Start with B — GPT-4o only; add routing when a real need arises

Introducing multi-LLM complexity in the initial phase is premature. Run with GPT-4o and add routing only when specific cases prove another model is clearly better.

---

## ADR-008: Agent Framework — Use One? Which One?

### Context
Considered whether an agent framework is needed to implement "the teacher".

### Options Considered

**A) No framework (plain Python service)**: Easy to understand. Minimal overhead. Con: Multi-turn context, dynamic tool calls, multi-step reasoning all need to be hand-rolled.

**B) LangChain**: Well-known, many examples. Con: Frequent API changes, high learning cost. Known instability issues.

**C) Microsoft Agent Framework (formerly Semantic Kernel + AutoGen integrated)**: Prior work experience. Multi-agent support. Enterprise-grade. MCP/A2A protocol support. v1.0 GA in April 2026. Con: Some over-engineering for this use case.

**D) Direct API calls (no framework)**: Simplest. Minimal dependencies. Con: Framework knowledge not demonstrated in portfolio.

### Where a framework is justified

These behaviours can't be written as rule-based if/else — a framework adds real value:
- Translation/correction conversation (multi-turn, context retention)
- LLM routing decisions (reasoning from context)
- Graph search → fetch related phrases → generate explanation (multi-step)

These are simple enough without a framework:
- SM-2 scheduling (deterministic calculation)
- Quiz delivery (template-based)
- Weakness aggregation

### Decision: C — Microsoft Agent Framework (conversation only)

Prior operational experience reduces risk. Multi-agent expansion path. v1.0 GA makes production use viable. Agent scope is limited to the "teacher conversation interface" — background processing is a separate simple service.

---

## ADR-017: Session Persistence Across Lambda Invocations

### Context

Agent Framework's `session` object is in-memory and disappears when Lambda execution ends. Telegram messages arrive as separate webhook calls — need a mechanism to persist conversation state across Lambda invocations keyed on `chat_id`.

This is distinct from the "long-term memory (knowledge graph)" in ADR-009/010. This is short-term storage for maintaining a single conversation flow (e.g., translate → which one to save? → both) across multiple Lambda calls.

### Options Considered

**A) DynamoDB (with TTL)**
- Pro: Serverless. No VPC required. Same AWS ecosystem. Terraform stays aws-provider-only. Covered by free tier.
- Con: More verbose API (boto3) than Redis. 1–10ms latency (slower than Redis).

**B) Redis (ElastiCache)**
- Pro: Sub-millisecond latency. Native TTL.
- Con: VPC required → adds 100–500ms to Lambda cold start. Always-on: $15–30/month (over budget).

**C) Redis (Upstash)**
- Pro: Serverless Redis. No VPC. HTTP-based, good Lambda fit. Free tier available.
- Con: New service addition (Terraform needs upstash provider).

**D) Agent Framework service-managed storage (OpenAI-managed)**
- OpenAI API maintains conversation state server-side; only `service_session_id` is stored locally.
- Pro: No message history management needed. Simplest implementation.
- Con: Strong OpenAI lock-in. Conversation history leaves internal control. Barrier to future LLM switching.

### Decision: A — DynamoDB (24h TTL)

The bottleneck is GPT-4o (2–5 seconds) — the difference between 1ms and 10ms session read/write has no user-visible impact. DynamoDB is the same AWS ecosystem with no extra Terraform provider. Redis speed advantage only becomes meaningful at a scale this project won't reach.

---

## ADR-018: Webhook Response Strategy — Synchronous or Async?

### Context

Telegram requires a response within 30 seconds. GPT-4o + Gremlin processing may take 5–15 seconds. If Lambda doesn't return 200 before processing completes, Telegram retries — causing duplicate messages.

### Options Considered

**A) Fully synchronous (return 200 after processing)**
- Pro: Simple. Single Lambda.
- Con: If GPT + Gremlin exceeds 10 seconds, Telegram retries → duplicate messages.

**B) Immediate 200 + async Lambda invoke**
- Return 200 immediately; invoke a separate processing Lambda asynchronously.
- Pro: Solves the retry problem.
- Con: Two Lambdas required. More IAM setup. Complex local development. Over-engineered for Week 1.

**C) Immediate "Thinking..." + synchronous processing**
- On webhook receipt, immediately send `sendMessage("Thinking...")` to Telegram.
- Set Lambda timeout to 29 seconds and process synchronously.
- Replace "Thinking..." with real response via `editMessageText` when done.
- Pro: Single Lambda. User sees "processing" state. Retry problem effectively avoided.
- Con: Need to implement `editMessageText` (minor).

### Decision: C — Immediate "Thinking..." + synchronous processing

Maintains Week 1 simplicity while guaranteeing user experience. Two-Lambda architecture is over-engineered at this stage. If processing regularly exceeds 29 seconds, migrate to B.

---

## Open Questions (Future ADR Candidates)

| Item | Status |
|---|---|
| Pinecone (semantic search) | Using graph traversal in early phase. Consider adding when graph-only proves insufficient (see ADR-010-B) |
| LLM routing split conditions | GPT-4o only initially. Add Gemini/Claude routing with keyword-based rules when needed (see ADR-007) |
