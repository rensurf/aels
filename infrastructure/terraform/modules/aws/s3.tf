resource "aws_s3_bucket" "deploy" {
  bucket = "aels-deploy-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_lifecycle_configuration" "deploy" {
  bucket = aws_s3_bucket.deploy.id

  rule {
    id     = "expire-old-packages"
    status = "Enabled"

    filter {}

    expiration {
      days = 7
    }
  }
}
