data "aws_caller_identity" "current" {}

resource "aws_iam_role" "lambda" {
  name = "aels-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_logs" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_sqs" {
  name = "aels-lambda-sqs"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "sqs:SendMessage",
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes",
      ]
      Resource = aws_sqs_queue.worker.arn
    }]
  })
}

resource "aws_iam_role_policy" "lambda_dynamodb" {
  name = "aels-lambda-dynamodb"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query",
        "dynamodb:Scan",
      ]
      Resource = [
        "arn:aws:dynamodb:ap-southeast-2:${data.aws_caller_identity.current.account_id}:table/aels-sessions",
        "arn:aws:dynamodb:ap-southeast-2:${data.aws_caller_identity.current.account_id}:table/aels-phrases",
        "arn:aws:dynamodb:ap-southeast-2:${data.aws_caller_identity.current.account_id}:table/aels-phrases/index/*",
        "arn:aws:dynamodb:ap-southeast-2:${data.aws_caller_identity.current.account_id}:table/aels-verbs",
        "arn:aws:dynamodb:ap-southeast-2:${data.aws_caller_identity.current.account_id}:table/aels-chat-threads",
        "arn:aws:dynamodb:ap-southeast-2:${data.aws_caller_identity.current.account_id}:table/aels-chat-threads/index/*",
      ]
    }]
  })
}
