resource "aws_lambda_function" "aels" {
  function_name = "aels-teacher"
  role          = aws_iam_role.lambda.arn
  runtime       = "python3.12"
  handler       = "main.lambda_handler"
  filename      = "${path.module}/placeholder.zip"

  timeout = 29

  environment {
    variables = {
      LOG_LEVEL = "INFO"
    }
  }
}
