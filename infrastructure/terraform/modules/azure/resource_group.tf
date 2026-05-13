resource "azurerm_resource_group" "main" {
  name     = "aels-rg"
  location = var.azure_location
}
