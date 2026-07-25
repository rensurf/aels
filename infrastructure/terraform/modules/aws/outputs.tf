output "api_gateway_url" {
  value = aws_apigatewayv2_stage.default.invoke_url
}

output "sqs_worker_queue_url" {
  value = aws_sqs_queue.worker.url
}

output "github_actions_role_arn" {
  value = aws_iam_role.github_actions_deploy.arn
}

output "deploy_bucket" {
  value = aws_s3_bucket.deploy.bucket
}

output "web_url" {
  value = "https://${aws_cloudfront_distribution.web.domain_name}"
}

output "web_bucket" {
  value = aws_s3_bucket.web.bucket
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.web.id
}
