resource "aws_lambda_function" "aels" {
  function_name = "aels-teacher"
  role          = aws_iam_role.lambda.arn
  runtime       = "python3.12"
  handler       = "main.lambda_handler"
  filename      = "${path.module}/placeholder.zip"
  memory_size   = 512

  timeout = 29

  lifecycle {
    # env vars and code are managed by the CD pipeline, not Terraform
    ignore_changes = [environment, filename]
  }
}

resource "aws_lambda_function" "worker" {
  function_name = "aels-worker"
  role          = aws_iam_role.lambda.arn
  runtime       = "python3.12"
  handler       = "worker.worker_handler"
  filename      = "${path.module}/placeholder.zip"
  memory_size   = 512

  timeout = 120

  lifecycle {
    ignore_changes = [environment, filename]
  }
}

resource "aws_lambda_event_source_mapping" "worker_sqs" {
  event_source_arn = aws_sqs_queue.worker.arn
  function_name    = aws_lambda_function.worker.arn
  batch_size       = 1
}

resource "aws_lambda_function" "quiz_scheduler" {
  function_name = "aels-quiz-scheduler"
  role          = aws_iam_role.lambda.arn
  runtime       = "python3.12"
  handler       = "main.quiz_scheduler_handler"
  filename      = "${path.module}/placeholder.zip"
  memory_size   = 512

  timeout = 29

  lifecycle {
    ignore_changes = [environment, filename]
  }
}
