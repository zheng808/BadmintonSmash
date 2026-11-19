# BadmintonSmash — Deployment Runbook

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 22.x | `.nvmrc` in repo root |
| npm | 10+ | workspaces |
| AWS CLI | 2.x | credentials for the target account |
| Docker | any | DynamoDB Local for API tests and local dev |
| EAS CLI | latest | only for store builds (`npm i -g eas-cli`) |

AWS region defaults to `us-west-2`. Override with `-c region=<region>` on CDK commands or `AWS_REGION` for scripts.

## One-time account setup

```bash
# 1. Bootstrap CDK in the account/region (once; default qualifier)
npx cdk bootstrap aws://<account-id>/us-west-2

# 2. Create the GitHub OIDC deploy role (once)
cd infra && npx cdk deploy Smash-Bootstrap -c githubRepo=zheng808/BadmintonSmash
```

## Deploy an environment

```bash
npm ci

# Infra (CDK orders the stacks: Web → Persistence → Backend, because the web URL
# feeds Cognito callback URLs and API CORS)
cd infra
npx cdk deploy 'Smash-dev-*' -c env=dev -c senderEmail=you@example.com -c alarmEmail=you@example.com --require-approval never

# Pull stack outputs into the client env file
cd .. && scripts/pull-env.sh dev          # writes client/.env.dev

# Web bundle: expo export with the env file sourced, s3 sync, CloudFront invalidation
scripts/deploy-web.sh dev
```

Prod is the same with `env=prod`. For a custom domain add `-c domain=smash.example.com -c hostedZoneId=Z... -c hostedZoneName=example.com`; outside us-east-1 also create the ACM certificate in us-east-1 manually and pass `-c certificateArn=` (CloudFront only accepts us-east-1 certificates).

## Google sign-in (optional but P0 for prod)

1. In Google Cloud Console create an OAuth client (Web application). Authorized redirect URI: `https://<CognitoDomain>/oauth2/idpresponse`, where `CognitoDomain` is the Backend stack output. The prefix comes from `-c cognitoDomainPrefix=`; the live dev environment uses `badmintonsmash-dev-6154` (so the URI is `https://badmintonsmash-dev-6154.auth.us-west-2.amazoncognito.com/oauth2/idpresponse`). Pass the same prefix on every deploy of that environment, otherwise CloudFormation replaces the domain and the Google client's URI stops matching.
2. Store the credentials in Secrets Manager and pass the secret name as CDK context:

```bash
aws secretsmanager create-secret --name smash/prod/google \
  --secret-string '{"clientId":"<id>.apps.googleusercontent.com","clientSecret":"<secret>"}'
npx cdk deploy 'Smash-prod-*' -c env=prod -c googleSecretName=smash/prod/google ...
```

3. `scripts/pull-env.sh` writes `EXPO_PUBLIC_OAUTH_DOMAIN` so the client shows the Google button. Inside WeChat's in-app browser the button is hidden by design (Google blocks webviews).

WeChat login (P1) needs a verified WeChat Open Platform account and the OIDC shim described in the system design; it is not part of this runbook yet.

## Email (SES)

1. The Backend stack creates an SES email identity for `-c senderEmail=`. Click the verification link that AWS sends.
2. New accounts are in the **SES sandbox**: mail only reaches verified addresses. Verify tester addresses in the SES console, or request production access (SES console → Account dashboard → Request production access; usually approved within a day).
3. Once the sender is verified, redeploy with `-c cognitoSesEmail=true` so Cognito sends one-time codes through SES. Without it Cognito uses its default sender, which is capped at 50 emails per day per account.
4. For a custom domain, switch to a domain identity (`-c senderDomain=`) so DKIM and SPF are set up by CDK via Route 53.

## Local development

```bash
docker compose up -d dynamodb            # DynamoDB Local on :8000
npm run dev -w api              # Hono on http://localhost:3000, creates the table if missing
npm run dev -w client               # Expo dev server; press w for web, i for iOS simulator
```

The local API accepts `x-dev-user: <id>` instead of a JWT when `DEV_AUTH=1`. The client uses it when `EXPO_PUBLIC_DEV_AUTH=1`.

## Mobile builds

```bash
cd client
eas build --profile preview --platform all      # internal distribution
eas build --profile production --platform all   # store builds
eas submit --platform ios
```

Bundle identifiers, scheme and store metadata are in `app.config.ts`. Set `EXPO_PUBLIC_*` values per profile in `eas.json`.

## CI/CD

- `ci.yml`: typecheck, lint, tests (DynamoDB Local service container), `cdk synth` for both envs.
- `deploy.yml`: on push to `main`, assumes the OIDC role and runs the deploy steps above for prod; on push to `develop` for dev.
- Required GitHub secrets: none for AWS (OIDC). Repository variables: `AWS_ACCOUNT_ID`, `AWS_REGION`, `SENDER_EMAIL`.

## Operations

- Alarms email the address given by `-c alarmEmail=`. Confirm the SNS subscription once.
- Logs: CloudWatch log groups `/aws/lambda/Smash-<env>-api`, `-notifier`, `-housekeeping`. Filter by `requestId` from the `x-request-id` response header.
- DLQ: `Smash-<env>-notifications-dlq`. Inspect messages, fix, then redrive from the SQS console.
- Backups: DynamoDB point-in-time recovery (35 days). Restore creates a new table; point the Backend stack at it with `-c tableName=`.

## Teardown

```bash
cd infra && npx cdk destroy 'Smash-dev-*' -c env=dev
```

Persistence resources are `RETAIN`; delete the table and user pool manually if you really want them gone.
