resource "azurerm_cosmosdb_account" "aels" {
  name                = "aels-cosmos"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"

  capabilities {
    name = "EnableGremlin"
  }

  geo_location {
    location          = azurerm_resource_group.main.location
    failover_priority = 0
  }

  consistency_policy {
    consistency_level = "Session"
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
