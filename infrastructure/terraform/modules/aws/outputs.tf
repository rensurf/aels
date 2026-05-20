output "api_gateway_url" {
  value = aws_apigatewayv2_stage.default.invoke_url
}

output "sqs_worker_queue_url" {
  value = aws_sqs_queue.worker.url
}
