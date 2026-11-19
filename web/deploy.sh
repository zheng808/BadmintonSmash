#!/usr/bin/env bash
# Builds web/ for an environment and uploads it to that environment's Smash-<env>-Web bucket.
# Usage: web/deploy.sh <dev|prod>   (run scripts/pull-env.sh <env> first to create web/.env.<env>)
set -euo pipefail

ENV_NAME="${1:?usage: web/deploy.sh <dev|prod>}"
REGION="${AWS_REGION:-${CDK_REGION:-us-west-2}}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

output() {
  aws cloudformation describe-stacks --region "$REGION" --stack-name "Smash-$ENV_NAME-$1" \
    --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" --output text
}

[ -f "$HERE/.env.$ENV_NAME" ] || { echo "Missing $HERE/.env.$ENV_NAME; run scripts/pull-env.sh $ENV_NAME first" >&2; exit 1; }
BUCKET="$(output Web WebBucketName)"
DISTRIBUTION_ID="$(output Web DistributionId)"

(cd "$HERE" && npx vite build --mode "$ENV_NAME")
aws s3 sync "$HERE/dist" "s3://$BUCKET" --delete --region "$REGION"
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths '/*' >/dev/null
echo "Deployed web to $(output Web WebUrl)"
