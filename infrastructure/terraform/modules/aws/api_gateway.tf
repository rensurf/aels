resource "aws_apigatewayv2_api" "aels" {
  name          = "aels-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers = ["x-api-key", "content-type"]
    max_age       = 300
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id             = aws_apigatewayv2_api.aels.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.aels.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "webhook" {
  api_id    = aws_apigatewayv2_api.aels.id
  route_key = "POST /webhook"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "get_phrases" {
  api_id    = aws_apigatewayv2_api.aels.id
  route_key = "GET /phrases"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "post_phrases" {
  api_id    = aws_apigatewayv2_api.aels.id
  route_key = "POST /phrases"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "put_phrase" {
  api_id    = aws_apigatewayv2_api.aels.id
  route_key = "PUT /phrases/{phrase_id}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "post_chat" {
  api_id    = aws_apigatewayv2_api.aels.id
  route_key = "POST /chat"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "get_verbs" {
  api_id    = aws_apigatewayv2_api.aels.id
  route_key = "GET /verbs"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "get_verb" {
  api_id    = aws_apigatewayv2_api.aels.id
  route_key = "GET /verbs/{verb_id}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "post_verbs" {
  api_id    = aws_apigatewayv2_api.aels.id
  route_key = "POST /verbs"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "put_verb" {
  api_id    = aws_apigatewayv2_api.aels.id
  route_key = "PUT /verbs/{verb_id}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "delete_verb" {
  api_id    = aws_apigatewayv2_api.aels.id
  route_key = "DELETE /verbs/{verb_id}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "post_analyze" {
  api_id    = aws_apigatewayv2_api.aels.id
  route_key = "POST /analyze"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "post_threads" {
  api_id    = aws_apigatewayv2_api.aels.id
  route_key = "POST /threads"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "get_threads" {
  api_id    = aws_apigatewayv2_api.aels.id
  route_key = "GET /threads"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "get_thread" {
  api_id    = aws_apigatewayv2_api.aels.id
  route_key = "GET /threads/{thread_id}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "post_phrase_review" {
  api_id    = aws_apigatewayv2_api.aels.id
  route_key = "POST /phrases/{phrase_id}/review"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "get_stats" {
  api_id    = aws_apigatewayv2_api.aels.id
  route_key = "GET /stats"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "post_phrase_alternatives" {
  api_id    = aws_apigatewayv2_api.aels.id
  route_key = "POST /phrases/{phrase_id}/alternatives"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.aels.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "api_gateway" {
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.aels.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.aels.execution_arn}/*/*"
}
