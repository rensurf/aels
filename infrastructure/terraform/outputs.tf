output "webhook_url" {
  value = "${module.aws.api_gateway_url}/webhook"
}

output "github_actions_role_arn" {
  value = module.aws.github_actions_role_arn
}
