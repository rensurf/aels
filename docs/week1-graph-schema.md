# Week 1: Minimal Graph Schema

## Philosophy

**Week 1 schema is intentionally minimal.** Only what's needed for basic conversation and memory.

Complex relationships (error patterns, phrase similarities, curriculum nodes) come in Week 3-4.

---

## Node Types

### 1. User Node

**Purpose**: Represents the learner (Ren)

**Label**: `user`

**Properties**:
```python
{
  "user_id": "uuid-v4",           # Primary key
  "telegram_id": "12345678",       # Telegram user ID (string)
  "name": "Ren",
  "goal": "Work in Australia as a software engineer",
  "created_at": "2026-04-28T10:00:00Z",
  "timezone": "Australia/Sydney"   # For future scheduling
}
```

**Partition Key**: `user_id` (CosmosDB requirement)

**Gremlin creation**:
```gremlin
g.addV('user')
  .property('id', user_id)
  .property('user_id', user_id)
  .property('telegram_id', telegram_id)
  .property('name', name)
  .property('goal', goal)
  .property('created_at', created_at)
  .property('timezone', timezone)
```

---

### 2. Phrase Node

**Purpose**: Stores English phrases learned by the user

**Label**: `phrase`

**Properties**:
```python
{
  "phrase_id": "uuid-v4",                          # Primary key
  "user_id": "uuid-v4",                            # Partition key (same as owner)
  "text": "Got it",                                 # The English phrase
  "japanese": "承知しました",                       # Original Japanese
  "context": "workplace-casual",                    # Usage context
  "note": "Common in Australian workplaces",       # Usage note from teacher
  "created_at": "2026-04-28T10:05:00Z",
  "source": "translation"                           # "translation" | "qa" | "correction"
}
```

**Context taxonomy (Week 1)**:
- `workplace-casual`: "Got it", "No worries"
- `workplace-formal`: "Understood", "I'll take care of it"
- `daily-casual`: "What's up?", "See you later"
- `technical`: "Let me investigate", "I'm blocked on"
- `emotional`: "I'm exhausted", "I'm so done with this"

**Partition Key**: `user_id` (to co-locate with user node)

**Gremlin creation**:
```gremlin
g.addV('phrase')
  .property('id', phrase_id)
  .property('phrase_id', phrase_id)
  .property('user_id', user_id)
  .property('text', text)
  .property('japanese', japanese)
  .property('context', context)
  .property('note', note)
  .property('created_at', created_at)
  .property('source', source)
```

---

## Edge Types

### 1. learned_phrase

**Purpose**: Links user to phrases they've learned

**Direction**: `(user) -[learned_phrase]-> (phrase)`

**Properties**:
```python
{
  "learned_at": "2026-04-28T10:05:00Z",
  "session_id": "uuid-v4"  # Optional: group phrases from same conversation
}
```

**Gremlin creation**:
```gremlin
g.V(user_id)
  .addE('learned_phrase')
  .to(g.V(phrase_id))
  .property('learned_at', learned_at)
  .property('session_id', session_id)
```

---

## Week 1 Queries

### Query 1: Get or create user

```gremlin
# Check if user exists
g.V().hasLabel('user').has('telegram_id', telegram_id)

# If not exists, create
g.addV('user')
  .property('id', user_id)
  .property('user_id', user_id)
  .property('telegram_id', telegram_id)
  .property('name', name)
  .property('goal', goal)
  .property('created_at', now)
  .property('timezone', timezone)
```

**Python wrapper**:
```python
async def get_or_create_user(telegram_id: str, name: str) -> UserNode:
    # Try to find existing user
    result = await g.V().hasLabel('user').has('telegram_id', telegram_id).toList()

    if result:
        return UserNode.from_vertex(result[0])

    # Create new user
    user_id = str(uuid.uuid4())
    await g.addV('user') \
        .property('id', user_id) \
        .property('user_id', user_id) \
        .property('telegram_id', telegram_id) \
        .property('name', name) \
        .property('goal', 'Work in Australia as a software engineer') \
        .property('created_at', datetime.utcnow().isoformat()) \
        .property('timezone', 'Australia/Sydney') \
        .next()

    return UserNode(user_id=user_id, telegram_id=telegram_id, name=name, ...)
```

---

### Query 2: Save phrase

```gremlin
# Create phrase node
g.addV('phrase')
  .property('id', phrase_id)
  .property('phrase_id', phrase_id)
  .property('user_id', user_id)
  .property('text', 'Got it')
  .property('japanese', '承知しました')
  .property('context', 'workplace-casual')
  .property('note', 'Common in Australian workplaces')
  .property('created_at', now)
  .property('source', 'translation')

# Link to user
g.V(user_id)
  .addE('learned_phrase')
  .to(g.V(phrase_id))
  .property('learned_at', now)
  .property('session_id', session_id)
```

**Python wrapper**:
```python
async def save_phrase(
    user_id: str,
    text: str,
    japanese: str,
    context: str,
    note: str,
    session_id: str
) -> PhraseNode:
    phrase_id = str(uuid.uuid4())

    # Create phrase node
    await g.addV('phrase') \
        .property('id', phrase_id) \
        .property('phrase_id', phrase_id) \
        .property('user_id', user_id) \
        .property('text', text) \
        .property('japanese', japanese) \
        .property('context', context) \
        .property('note', note) \
        .property('created_at', datetime.utcnow().isoformat()) \
        .property('source', 'translation') \
        .next()

    # Link to user
    await g.V(user_id) \
        .addE('learned_phrase') \
        .to(g.V(phrase_id)) \
        .property('learned_at', datetime.utcnow().isoformat()) \
        .property('session_id', session_id) \
        .next()

    return PhraseNode(phrase_id=phrase_id, text=text, ...)
```

---

### Query 3: Search phrases

**Use case**: User asks "blocked on って前に聞いた？"

```gremlin
g.V().hasLabel('phrase')
  .has('user_id', user_id)
  .has('text', TextP.containing('blocked on'))
  .order().by('created_at', Order.desc)
  .limit(5)
```

**Python wrapper**:
```python
from gremlin_python.process.traversal import Order

async def search_phrases(user_id: str, query_text: str) -> list[PhraseNode]:
    results = await g.V() \
        .hasLabel('phrase') \
        .has('user_id', user_id) \
        .has('text', TextP.containing(query_text.lower())) \
        .order().by('created_at', Order.desc) \
        .limit(5) \
        .toList()

    return [PhraseNode.from_vertex(v) for v in results]
```

**Note**: CosmosDB Gremlin has limited text search support. TextP predicates (containing, startingWith, endingWith) are supported but not well-documented. For Week 1, simple substring matching is acceptable. Week 3+ may add Pinecone for semantic search if needed.

---

### Query 4: Get recent phrases

**Use case**: Show user what they learned recently

```gremlin
g.V(user_id)
  .out('learned_phrase')
  .order().by('created_at', Order.desc)
  .limit(10)
```

**Python wrapper**:
```python
from gremlin_python.process.traversal import Order

async def get_recent_phrases(user_id: str, limit: int = 10) -> list[PhraseNode]:
    results = await g.V(user_id) \
        .out('learned_phrase') \
        .order().by('created_at', Order.desc) \
        .limit(limit) \
        .toList()

    return [PhraseNode.from_vertex(v) for v in results]
```

---

## Data Models (Python)

### UserNode

```python
from dataclasses import dataclass
from datetime import datetime

@dataclass
class UserNode:
    user_id: str
    telegram_id: str
    name: str
    goal: str
    created_at: datetime
    timezone: str

    @classmethod
    def from_vertex(cls, vertex: dict) -> 'UserNode':
        """Convert Gremlin vertex to UserNode"""
        return cls(
            user_id=vertex['properties']['user_id'][0]['value'],
            telegram_id=vertex['properties']['telegram_id'][0]['value'],
            name=vertex['properties']['name'][0]['value'],
            goal=vertex['properties']['goal'][0]['value'],
            created_at=datetime.fromisoformat(
                vertex['properties']['created_at'][0]['value']
            ),
            timezone=vertex['properties']['timezone'][0]['value']
        )
```

### PhraseNode

```python
@dataclass
class PhraseNode:
    phrase_id: str
    user_id: str
    text: str
    japanese: str
    context: str
    note: str
    created_at: datetime
    source: str

    @classmethod
    def from_vertex(cls, vertex: dict) -> 'PhraseNode':
        """Convert Gremlin vertex to PhraseNode"""
        props = vertex['properties']
        return cls(
            phrase_id=props['phrase_id'][0]['value'],
            user_id=props['user_id'][0]['value'],
            text=props['text'][0]['value'],
            japanese=props['japanese'][0]['value'],
            context=props['context'][0]['value'],
            note=props['note'][0]['value'],
            created_at=datetime.fromisoformat(props['created_at'][0]['value']),
            source=props['source'][0]['value']
        )
```

**Note**: CosmosDB Gremlin properties are stored as arrays. Hence `[0]['value']` pattern.

---

## What's NOT in Week 1 Schema

The following are **intentionally omitted** to keep Week 1 simple:

❌ **SM-2 properties on phrase nodes** (Week 2)
```python
# Week 2 will add:
"next_review": "2026-05-01T10:00:00Z",
"ease_factor": 2.5,
"interval": 1,
"repetitions": 0
```

❌ **Error pattern nodes** (Week 3)
```gremlin
Label: error_pattern
Properties: {
  "pattern_type": "preposition",
  "description": "Using 'on' with verbs",
  "frequency": 9
}
```

❌ **Phrase relationship edges** (Week 3)
```gremlin
(phrase) -[similar_to]-> (phrase)
(phrase) -[uses_pattern]-> (grammar_pattern)
```

❌ **Session summary nodes** (Week 3)
```gremlin
Label: session
Properties: {
  "session_id": "...",
  "summary": "Learned workplace acknowledgment phrases",
  "topics": ["acknowledgment", "workplace"],
  "started_at": "...",
  "ended_at": "..."
}
```

❌ **Strength/Weakness profile nodes** (Week 3)
```gremlin
Label: skill_profile
Properties: {
  "skill_type": "verb_choice",
  "level": "strong",
  "evidence_count": 12
}
```

Week 1 schema is **just enough** to have a working teacher. Complexity grows organically.

---

## Initial Data Setup

`infrastructure/scripts/init_graph_schema.py`:

```python
"""
Initialize CosmosDB Gremlin graph for Week 1.

This script:
1. Verifies connection to CosmosDB
2. Creates initial user node (Ren)
3. Adds a few sample phrases for testing
"""

import os
import uuid
from datetime import datetime
from gremlin_python.driver import client, serializer

def init_schema():
    # Connect to CosmosDB
    cosmos_client = client.Client(
        url=os.getenv('COSMOS_ENDPOINT'),
        traversal_source='g',
        username=f"/dbs/{os.getenv('COSMOS_DATABASE')}/colls/{os.getenv('COSMOS_GRAPH')}",
        password=os.getenv('COSMOS_KEY'),
        message_serializer=serializer.GraphSONSerializersV2d0()
    )

    # Create user (Ren)
    user_id = str(uuid.uuid4())
    telegram_id = os.getenv('REN_TELEGRAM_ID')  # Set this in .env

    create_user_query = f"""
    g.addV('user')
      .property('id', '{user_id}')
      .property('user_id', '{user_id}')
      .property('telegram_id', '{telegram_id}')
      .property('name', 'Ren')
      .property('goal', 'Work in Australia as a software engineer')
      .property('created_at', '{datetime.utcnow().isoformat()}')
      .property('timezone', 'Australia/Sydney')
    """

    cosmos_client.submit(create_user_query).all().result()
    print(f"✅ Created user: {user_id}")

    # Create sample phrase
    phrase_id = str(uuid.uuid4())
    session_id = str(uuid.uuid4())

    create_phrase_query = f"""
    g.addV('phrase')
      .property('id', '{phrase_id}')
      .property('phrase_id', '{phrase_id}')
      .property('user_id', '{user_id}')
      .property('text', 'Got it')
      .property('japanese', '承知しました')
      .property('context', 'workplace-casual')
      .property('note', 'Common in Australian workplaces')
      .property('created_at', '{datetime.utcnow().isoformat()}')
      .property('source', 'translation')
    """

    cosmos_client.submit(create_phrase_query).all().result()
    print(f"✅ Created phrase: {phrase_id}")

    # Link phrase to user
    link_query = f"""
    g.V('{user_id}')
      .addE('learned_phrase')
      .to(g.V('{phrase_id}'))
      .property('learned_at', '{datetime.utcnow().isoformat()}')
      .property('session_id', '{session_id}')
    """

    cosmos_client.submit(link_query).all().result()
    print(f"✅ Linked phrase to user")

    # Verify
    verify_query = f"g.V('{user_id}').out('learned_phrase').values('text')"
    result = cosmos_client.submit(verify_query).all().result()
    print(f"✅ Verification: User learned phrases: {result}")

    cosmos_client.close()

if __name__ == '__main__':
    init_schema()
```

Run after Terraform applies:
```bash
export COSMOS_ENDPOINT="wss://..."
export COSMOS_DATABASE="knowledge"
export COSMOS_GRAPH="main"
export COSMOS_KEY="..."
export REN_TELEGRAM_ID="12345678"

python infrastructure/scripts/init_graph_schema.py
```

---

## CosmosDB Partitioning Strategy

**Partition Key**: `user_id`

**Rationale**:
- All queries are scoped to a single user (Ren initially)
- User + their phrases co-located in same partition → fast queries
- Single partition is fine for Week 1 (only 1 user)
- Multi-user support in future: each user gets their own partition

**Implications**:
- Every vertex must have `user_id` property
- Cross-user queries not supported (intentional - not needed)
- Partition key cannot be changed later → choose carefully

**Alternative considered**: Partition by `phrase_id`
- Rejected: Would scatter user's phrases across partitions
- Cross-partition queries are slower and more expensive

---

## Indexing

CosmosDB Gremlin automatically indexes all properties by default.

**Week 1**: Use default indexing (no custom policies needed)

**Future optimization** (Week 3+):
- Exclude large text fields from indexing (`note`, `explanation`)
- Composite index on `(user_id, created_at)` for recent phrases query
- TTL policy for old session nodes (automatic cleanup)

---

## Testing Queries

Use **CosmosDB Data Explorer** in Azure Portal:

### Test 1: Count all vertices
```gremlin
g.V().count()
```
Expected: 2 (1 user + 1 phrase)

### Test 2: Get user
```gremlin
g.V().hasLabel('user').valueMap()
```

### Test 3: Get all phrases for user
```gremlin
g.V().hasLabel('user').has('telegram_id', '12345678').out('learned_phrase').valueMap()
```

### Test 4: Search phrase by text
```gremlin
g.V().hasLabel('phrase').has('text', TextP.containing('Got'))
```

---

## Schema Evolution

As weeks progress, the schema grows:

```
Week 1: user + phrase + learned_phrase
         ↓
Week 2: + SM-2 properties on phrase
         ↓
Week 3: + error_pattern nodes + uses_pattern edges
         ↓
Week 4: + session nodes + skill_profile nodes + curriculum nodes
```

**Migration strategy**:
- Additive only (never delete properties)
- Old phrases without new properties: treated as "not reviewed yet"
- No schema migration scripts needed (schemaless advantage)

---

## Summary

Week 1 graph schema is **minimal by design**:
- 2 node types: `user`, `phrase`
- 1 edge type: `learned_phrase`
- Simple queries: save, search, get recent

This is enough to validate the core experience: "The teacher remembers what I learned."

Complex graph traversal (pattern analysis, curriculum planning) comes in Week 3-4, after the foundation is solid.
