# Week 1 Tech Stack Update (2026-04-28)

This document summarizes the latest version information for the technologies used in AELS v2 Week 1, based on research conducted on April 28, 2026.

---

## Microsoft Agent Framework

### Package Information
- **PyPI Package Name**: `agent-framework`
- **Latest Version**: 1.2.1 (released April 28, 2026)
- **Python Requirement**: >=3.10
- **License**: MIT

### Key Changes from Initial Plan
- ✅ Changed from `semantic-kernel` to `agent-framework`
- Microsoft Agent Framework 1.0 was released on April 2, 2026, as production-ready
- It's the successor to both Semantic Kernel and AutoGen, combining their strengths

### Installation
```bash
pip install agent-framework
```

### Agent Initialization Example
```python
from agent_framework import Agent
from agent_framework.openai import OpenAIChatClient

agent = Agent(
    client=OpenAIChatClient(model="gpt-4o"),
    instructions="You are a helpful assistant."
)
```

### Tool Registration Pattern
```python
from typing import Annotated
from pydantic import Field

def get_weather(
    location: Annotated[str, Field(description="The location to get the weather for.")]
) -> str:
    """Get the weather for a given location."""
    return f"Weather data for {location}"

agent = Agent(
    client=OpenAIChatClient(model="gpt-4o"),
    instructions="You are a helpful assistant.",
    tools=[get_weather]  # Pass function directly
)
```

**Key Insight**: Tools are registered as plain Python functions with type annotations. The framework uses `pydantic.Field` for parameter descriptions.

---

## gremlinpython

### Package Information
- **PyPI Package Name**: `gremlinpython`
- **Latest Version**: 3.8.1 (released April 7, 2026)
- **Python Requirement**: >=3.10
- **License**: Apache 2.0

### Key Changes from Initial Plan
- ✅ Updated from 3.7.1 to 3.8.1

### Installation
```bash
pip install gremlinpython
```

### Order.desc for Descending Sort
**Correct Usage**:
```python
from gremlin_python.process.traversal import Order

g.V().hasLabel('phrase') \
    .order().by('created_at', Order.desc) \
    .limit(10)
```

**Key Insight**: Use `Order.desc`, NOT `decr` or `desc`. The `Order` enum must be imported from `gremlin_python.process.traversal`.

### CosmosDB Gremlin TextP Support
**Status**: ✅ Supported (but not well-documented)

**Available TextP Predicates**:
- `TextP.containing()` - substring matching
- `TextP.startingWith()` - prefix matching
- `TextP.endingWith()` - suffix matching
- `TextP.notContaining()` - negative substring matching

**Example**:
```python
from gremlin_python.process.traversal import TextP

g.V().hasLabel('phrase') \
    .has('text', TextP.containing('blocked on'))
```

**Important Notes**:
- TextP predicates work in CosmosDB Gremlin API
- They are not prominently documented in Microsoft docs
- Some users have reported "Unable to resolve symbol 'TextP'" errors, suggesting implementation quirks
- For Week 1: Use with caution, fallback to client-side filtering if needed

---

## Terraform azurerm Provider

### Provider Information
- **Provider Name**: `hashicorp/azurerm`
- **Latest Version**: 4.70.0 (as of April 2026)
- **Major Version**: 4.x

### Key Changes from Initial Plan
- ✅ Updated from `~> 3.0` to `~> 4.70`

### Terraform Configuration
```hcl
terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.70"
    }
  }
}
```

### azurerm_cosmosdb_gremlin_graph Resource

**Complete Example**:
```hcl
resource "azurerm_cosmosdb_account" "aels" {
  name                = "aels-knowledge-graph"
  resource_group_name = azurerm_resource_group.aels.name
  location            = "Australia East"
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"

  capabilities {
    name = "EnableGremlin"  # Required for Gremlin API
  }

  consistency_policy {
    consistency_level = "Session"
  }

  geo_location {
    location          = "Australia East"
    failover_priority = 0
  }
}

resource "azurerm_cosmosdb_gremlin_database" "knowledge" {
  name                = "knowledge"
  resource_group_name = azurerm_cosmosdb_account.aels.resource_group_name
  account_name        = azurerm_cosmosdb_account.aels.name
  throughput          = 400
}

resource "azurerm_cosmosdb_gremlin_graph" "main" {
  name                = "main"
  resource_group_name = azurerm_cosmosdb_account.aels.resource_group_name
  account_name        = azurerm_cosmosdb_account.aels.name
  database_name       = azurerm_cosmosdb_gremlin_database.knowledge.name
  partition_key_path  = "/user_id"
  throughput          = 400

  index_policy {
    automatic      = true
    indexing_mode  = "consistent"
    included_paths = ["/*"]
    excluded_paths = ["/\"_etag\"/?"]
  }
}
```

**Key Requirements**:
- `EnableGremlin` capability must be set on the CosmosDB account
- `partition_key_path` is required (not `partition_key`)
- `index_policy` block is optional but recommended for performance

---

## Updated requirements.txt

```txt
# Core
python-telegram-bot==22.7
openai==2.32.0
gremlinpython==3.8.1
agent-framework==1.2.1
python-dotenv==1.0.0

# Testing
pytest==8.0.0
pytest-asyncio==1.3.0
pytest-cov==4.1.0
pytest-mock==3.12.0

# Utilities
pydantic==2.6.0
tenacity==8.2.3
```

---

## Summary of Changes

| Component | Old Version | New Version | Notes |
|---|---|---|---|
| Microsoft Agent Framework | `semantic-kernel==1.0.0` | `agent-framework==1.2.1` | Package name changed |
| gremlinpython | `3.7.1` | `3.8.1` | Minor version update |
| Terraform azurerm | `~> 3.0` | `~> 4.70` | Major version update |
| Gremlin Order syntax | `decr` | `Order.desc` | Correct import required |
| TextP support | Unknown | Confirmed supported | Use with caution |

---

## References

### Microsoft Agent Framework
- [agent-framework on PyPI](https://pypi.org/project/agent-framework/)
- [GitHub: microsoft/agent-framework](https://github.com/microsoft/agent-framework)
- [Microsoft Agent Framework Version 1.0 announcement](https://devblogs.microsoft.com/agent-framework/microsoft-agent-framework-version-1-0/)

### gremlinpython
- [gremlinpython on PyPI](https://pypi.org/project/gremlinpython/)
- [TinkerPop Documentation](https://tinkerpop.apache.org/docs/current/reference/)

### CosmosDB Gremlin
- [Azure Cosmos DB for Gremlin support and compatibility](https://learn.microsoft.com/en-us/azure/cosmos-db/gremlin/support)

### Terraform azurerm
- [Terraform Registry: azurerm provider](https://registry.terraform.io/providers/hashicorp/azurerm/latest)
- [azurerm_cosmosdb_gremlin_graph documentation](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/cosmosdb_gremlin_graph)
- [GitHub: terraform-provider-azurerm](https://github.com/hashicorp/terraform-provider-azurerm)

---

## Action Items

- [x] Updated `week1-implementation-plan.md` requirements.txt
- [x] Updated `week1-architecture.md` Agent initialization code
- [x] Updated `week1-architecture.md` Terraform examples
- [x] Updated `week1-graph-schema.md` Gremlin query syntax
- [x] Documented TextP support status and caveats
- [x] Created this tech stack update document

---

## Next Steps

When implementing Week 1:

1. **Test agent-framework first**: Create a "Hello World" agent (Task 0.3) to validate the new API
2. **Verify TextP in CosmosDB**: Test TextP.containing() in CosmosDB Data Explorer before relying on it
3. **Monitor Terraform state**: azurerm 4.x may have breaking changes from 3.x—check Terraform plan output carefully
4. **Use Order.desc correctly**: Import from `gremlin_python.process.traversal` to avoid runtime errors

If any issues arise with the updated versions, fallback strategies are documented in `week1-implementation-plan.md` under "Potential Blockers & Solutions."
