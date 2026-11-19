#!/usr/bin/env bash
# Builds the Expo web bundle for an environment and publishes it to S3 + CloudFront.
# Usage: scripts/deploy-web.sh <dev|prod>   (run scripts/pull-env.sh first)
set -euo pipefail

ENV_NAME="${1:?usage: scripts/deploy-web.sh <dev|prod>}"
REGION="${AWS_REGION:-${CDK_REGION:-us-west-2}}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/client/.env.$ENV_NAME"

if [[ ! -f "$ENV_FILE" ]]; then
  "$ROOT/scripts/pull-env.sh" "$ENV_NAME"
fi

output() {
  aws cloudformation describe-stacks \
    --region "$REGION" \
    --stack-name "Smash-$ENV_NAME-$1" \
    --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" \
    --output text
}

WEB_BUCKET="$(output Web WebBucketName)"
DISTRIBUTION_ID="$(output Web DistributionId)"

# Expo reads EXPO_PUBLIC_* from the shell; load the generated env file.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

cd "$ROOT/client"
rm -rf dist
npx expo export --platform web

# Long cache for hashed assets, short cache for the HTML shell.
aws s3 sync dist "s3://$WEB_BUCKET" --region "$REGION" --delete \
  --exclude 'index.html' --exclude '*.html' \
  --cache-control 'public,max-age=31536000,immutable'
aws s3 sync dist "s3://$WEB_BUCKET" --region "$REGION" \
  --exclude '*' --include '*.html' \
  --cache-control 'no-cache' --content-type 'text/html'

aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths '/*' >/dev/null
echo "Published $ENV_NAME web bundle to s3://$WEB_BUCKET (distribution $DISTRIBUTION_ID)"
