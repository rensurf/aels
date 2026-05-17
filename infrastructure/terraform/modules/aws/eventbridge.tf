resource "aws_cloudwatch_event_rule" "quiz_scheduler" {
  name                = "aels-quiz-scheduler"
  schedule_expression = "cron(0 22 * * ? *)"
}

resource "aws_lambda_permission" "eventbridge_quiz_scheduler" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.quiz_scheduler.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.quiz_scheduler.arn
}

resource "aws_cloudwatch_event_target" "quiz_scheduler" {
  rule = aws_cloudwatch_event_rule.quiz_scheduler.name
  arn  = aws_lambda_function.quiz_scheduler.arn
}
