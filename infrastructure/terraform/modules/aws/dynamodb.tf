resource "aws_dynamodb_table" "sessions" {
  name         = "aels-sessions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "chat_id"

  attribute {
    name = "chat_id"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }
}
