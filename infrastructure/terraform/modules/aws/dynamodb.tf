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

resource "aws_dynamodb_table" "phrases" {
  name         = "aels-phrases"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"
  range_key    = "phrase_id"

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "phrase_id"
    type = "S"
  }

  attribute {
    name = "due_date"
    type = "S"
  }

  attribute {
    name = "verb_id"
    type = "S"
  }

  attribute {
    name = "pattern"
    type = "S"
  }

  global_secondary_index {
    name            = "user_id-due_date-index"
    hash_key        = "user_id"
    range_key       = "due_date"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "user_id-verb_id-index"
    hash_key        = "user_id"
    range_key       = "verb_id"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "user_id-pattern-index"
    hash_key        = "user_id"
    range_key       = "pattern"
    projection_type = "ALL"
  }
}

resource "aws_dynamodb_table" "verbs" {
  name         = "aels-verbs"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"
  range_key    = "verb_id"

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "verb_id"
    type = "S"
  }
}

resource "aws_dynamodb_table" "user_stats" {
  name         = "aels-user-stats"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"

  attribute {
    name = "user_id"
    type = "S"
  }
}

resource "aws_dynamodb_table" "phrase_groups" {
  name         = "aels-phrase-groups"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"
  range_key    = "group_id"

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "group_id"
    type = "S"
  }

  attribute {
    name = "due_date"
    type = "S"
  }

  global_secondary_index {
    name            = "user_id-due_date-index"
    hash_key        = "user_id"
    range_key       = "due_date"
    projection_type = "ALL"
  }
}

resource "aws_dynamodb_table" "chat_threads" {
  name         = "aels-chat-threads"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"
  range_key    = "thread_id"

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "thread_id"
    type = "S"
  }

  attribute {
    name = "created_at"
    type = "S"
  }

  global_secondary_index {
    name            = "user_id-created_at-index"
    hash_key        = "user_id"
    range_key       = "created_at"
    projection_type = "ALL"
  }
}
