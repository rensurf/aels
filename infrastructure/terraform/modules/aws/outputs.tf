output "api_gateway_url" {
  value = aws_apigatewayv2_stage.default.invoke_url
}

output "sqs_worker_queue_url" {
  value = aws_sqs_queue.worker.url
}

output "github_actions_role_arn" {
  value = aws_iam_role.github_actions_deploy.arn
}
