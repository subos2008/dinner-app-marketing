#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR/../.."

source "$REPO_ROOT/deploy-ids.sh"

BUCKET_NAME="$PUBLISHER_S3_BUCKET"
DISTRIBUTION_ID="$PUBLISHER_CF_ID"
SITE_URL="https://meta-publisher.comejoinus.app"

export AWS_PROFILE="dinner-app-deploy"

echo "Deploying publisher SPA to s3://$BUCKET_NAME"

aws s3 sync "$SCRIPT_DIR" "s3://$BUCKET_NAME" \
  --delete \
  --exclude "start.sh" \
  --exclude "deploy.sh" \
  --cache-control "max-age=300"

aws s3 cp "s3://$BUCKET_NAME/index.html" "s3://$BUCKET_NAME/index.html" \
  --content-type "text/html" \
  --cache-control "no-cache" \
  --metadata-directive REPLACE

echo "Creating CloudFront invalidation..."
INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/*" \
  --query 'Invalidation.Id' \
  --output text)

echo "Invalidation $INVALIDATION_ID — waiting..."
while true; do
  STATUS=$(aws cloudfront get-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --id "$INVALIDATION_ID" \
    --query 'Invalidation.Status' \
    --output text)
  [ "$STATUS" = "Completed" ] && break
  sleep 7
done

echo "Deploy complete. Site: $SITE_URL"
