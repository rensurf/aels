#!/bin/bash
set -e

FUNCTION_NAME="aels-teacher"
BUILD_DIR="dist"
ZIP_FILE="deployment.zip"

echo "=== Cleaning build directory ==="
rm -rf $BUILD_DIR $ZIP_FILE
mkdir $BUILD_DIR

echo "=== Installing dependencies (Linux/x86_64 for Lambda) ==="
uv pip install -r requirements.txt \
  --target $BUILD_DIR \
  --python-platform x86_64-manylinux2014 \
  --python-version 3.12 \
  --prerelease=allow \
  --quiet

echo "=== Re-installing agent-framework-core (fix __init__.py overwrite) ==="
uv pip install agent-framework-core==1.2.1 \
  --target $BUILD_DIR \
  --python-platform x86_64-manylinux2014 \
  --python-version 3.12 \
  --reinstall \
  --quiet

echo "=== Removing unnecessary packages ==="
rm -rf $BUILD_DIR/claude_agent_sdk
rm -rf $BUILD_DIR/claude_agent_sdk-*
rm -rf $BUILD_DIR/copilot
rm -rf $BUILD_DIR/numpy
rm -rf $BUILD_DIR/ml_dtypes
rm -rf $BUILD_DIR/qdrant_client
rm -rf $BUILD_DIR/agents
rm -rf $BUILD_DIR/botocore $BUILD_DIR/boto3  # already in Lambda runtime

echo "=== Copying source files ==="
cp -r src/ $BUILD_DIR/src/
cp main.py $BUILD_DIR/main.py
cp worker.py $BUILD_DIR/worker.py

echo "=== Creating zip ==="
cd $BUILD_DIR
zip -r ../$ZIP_FILE . --quiet
cd ..

echo "Zip size: $(du -sh ../$ZIP_FILE 2>/dev/null || du -sh $ZIP_FILE)"

S3_BUCKET="aels-deployment-1778930754"
S3_KEY="deployment.zip"

echo "=== Uploading zip to S3 ==="
aws s3 cp $ZIP_FILE s3://$S3_BUCKET/$S3_KEY \
  --region ap-southeast-2 \
  
echo "=== Updating Lambda from S3 ==="
aws lambda update-function-code \
  --function-name $FUNCTION_NAME \
  --s3-bucket $S3_BUCKET \
  --s3-key $S3_KEY \
  --region ap-southeast-2 \
  --output text --query 'FunctionName'

aws lambda wait function-updated \
  --function-name $FUNCTION_NAME \
  --region ap-southeast-2

echo "=== Updating quiz scheduler Lambda from S3 ==="
aws lambda update-function-code \
  --function-name "aels-quiz-scheduler" \
  --s3-bucket $S3_BUCKET \
  --s3-key $S3_KEY \
  --region ap-southeast-2 \
  --output text --query 'FunctionName'

aws lambda wait function-updated \
  --function-name "aels-quiz-scheduler" \
  --region ap-southeast-2

echo "=== Setting environment variables ==="
source .env
ENV_VARS="Variables={TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN,OPENAI_API_KEY=$OPENAI_API_KEY,COSMOS_ENDPOINT=$COSMOS_ENDPOINT,COSMOS_KEY=$COSMOS_KEY,COSMOS_DATABASE=$COSMOS_DATABASE,COSMOS_GRAPH=$COSMOS_GRAPH,DYNAMODB_SESSION_TABLE=$DYNAMODB_SESSION_TABLE,SQS_WORKER_QUEUE_URL=$SQS_WORKER_QUEUE_URL}"

aws lambda update-function-configuration \
  --function-name $FUNCTION_NAME \
  --region ap-southeast-2 \
  --memory-size 512 \
  --environment "$ENV_VARS" \
  --output text --query 'FunctionName'

aws lambda wait function-updated \
  --function-name $FUNCTION_NAME \
  --region ap-southeast-2

aws lambda update-function-configuration \
  --function-name "aels-quiz-scheduler" \
  --region ap-southeast-2 \
  --memory-size 512 \
  --environment "$ENV_VARS" \
  --output text --query 'FunctionName'

echo "=== Updating worker Lambda from S3 ==="
aws lambda update-function-code \
  --function-name "aels-worker" \
  --s3-bucket $S3_BUCKET \
  --s3-key $S3_KEY \
  --region ap-southeast-2 \
  --output text --query 'FunctionName'

aws lambda wait function-updated \
  --function-name "aels-worker" \
  --region ap-southeast-2

aws lambda update-function-configuration \
  --function-name "aels-worker" \
  --region ap-southeast-2 \
  --memory-size 512 \
  --environment "$ENV_VARS" \
  --output text --query 'FunctionName'

aws lambda wait function-updated \
  --function-name "aels-worker" \
  --region ap-southeast-2

echo "=== Done! ==="
echo "Test: send a message to your Telegram bot"
