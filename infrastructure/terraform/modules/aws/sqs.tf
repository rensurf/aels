resource "aws_sqs_queue" "worker" {
  name                       = "aels-worker-queue"
  visibility_timeout_seconds = 180
  message_retention_seconds  = 3600
}
