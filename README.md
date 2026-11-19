# BadmintonSmash

Drop-in badminton sessions without the spreadsheet: an organiser posts a session, shares a link, players sign up until the court cap is reached (then join a waitlist), and after the session the real costs (courts, shuttlecocks used, extras) are split across the people who came. One codebase runs on iOS, Android and the web (including the WeChat in-app browser), in English and Simplified Chinese; everything is hosted on AWS at near-zero idle cost.

## Documents

| Doc | What it covers |
|---|---|
| [docs/01-product-spec.md](docs/01-product-spec.md) | Goals, personas, requirements (P0/P1/P2), business rules, acceptance criteria |
| [docs/02-system-design.md](docs/02-system-design.md) | Architecture, decisions, data model, join/waitlist algorithm, settlement, infra, CI/CD |
| [docs/03-api-reference.md](docs/03-api-reference.md) | REST endpoints, schemas, error codes |
| [docs/04-deployment.md](docs/04-deployment.md) | Runbook: bootstrap, deploy, SES, local dev, store builds, operations |
| [docs/05-architecture-diagrams.md](docs/05-architecture-diagrams.md) | Mermaid diagrams: runtime architecture, deployment layout, request lifecycle, data model |
| [docs/06-auth-flows.md](docs/06-auth-flows.md) | Sign-in flows: Google federation, email one-time code, tokens at the API, constraints |

## Repository layout

```
shared/    zod request/response schemas, fee calculator, join/waitlist rules (used by api and client)
api/       Hono HTTP API + notifier + housekeeping Lambda handlers, DynamoDB access, vitest tests
infra/     AWS CDK v2 app: Persistence, Backend, Web stacks per env, plus a one-time Bootstrap stack
client/    Expo Router universal app (iOS, Android, static web export)
scripts/   pull-env.sh (stack outputs -> client env), deploy-web.sh (export + S3 sync + invalidation)
docs/      specification, design, API reference, runbook
```

## Quick start

Requires Node 22 (`.nvmrc`), npm 10+, Docker (DynamoDB Local), and the AWS CLI for deploys.

```bash
npm ci
npm run typecheck          # every workspace
npm test                   # shared + api (needs DynamoDB Local, see below) + infra template tests

docker compose up -d dynamodb      # DynamoDB Local on :8000
npm run dev:api                    # API on http://localhost:3000 (DEV_AUTH=1 accepts x-dev-user header)
npm run dev:client                 # Expo dev server: press w for web, i for iOS simulator
```

For the client against a deployed dev environment: `scripts/pull-env.sh dev` writes `client/.env.dev`; copy it to `client/.env.local` for `expo start`, or let `scripts/deploy-web.sh` load it for web exports.

## Deploy

```bash
# once per account/region
cd infra
npx cdk bootstrap aws://<account-id>/us-west-2
npx cdk deploy Smash-Bootstrap -c githubRepo=zheng808/BadmintonSmash

# per environment (Web -> Persistence -> Backend, in dependency order)
npx cdk deploy 'Smash-dev-*' -c env=dev -c senderEmail=you@example.com -c alarmEmail=you@example.com --require-approval never
cd .. && scripts/pull-env.sh dev && scripts/deploy-web.sh dev
```

### CDK context keys

| Key | Required | Default | Purpose |
|---|---|---|---|
| `env` | yes | `dev` | `dev` or `prod`; prefixes stacks and resources |
| `region` | no | `us-west-2` | Deployment region |
| `senderEmail` | prod: yes, dev: warns | `noreply@example.com` | SES sender identity (verify it after the first deploy) |
| `alarmEmail` | no | none | Email subscribed to the alarm SNS topic |
| `allowedOrigins` | no | dev: localhost origins | Extra CORS + OAuth redirect origins, comma separated |
| `domain` | no | none | Custom web domain for CloudFront |
| `hostedZoneId`, `hostedZoneName` | with `domain` | zone name derived from domain | Route 53 alias records |
| `certificateArn` | with `domain` outside us-east-1 | none | ACM certificate in us-east-1 for CloudFront |
| `cognitoDomainPrefix` | no | `smash-<env>` | Hosted-UI domain prefix (must be unique in the region) |
| `googleSecretName` | no | none | Enables Google sign-in; Secrets Manager secret with `clientId` and `clientSecret` |
| `cognitoSesEmail` | no | `false` | `true` sends Cognito one-time-code emails through SES from `senderEmail` (identity must be verified first) |
| `tableName` | no | `smash-<env>` | Point the Backend at a restored table |
| `apiEntryDir` | no | `../api/src/lambda` | Lambda entry directory (tests use `test/stubs`) |
| `githubRepo` | no | `zheng808/BadmintonSmash` | Repo trusted by the OIDC deploy role |
| `githubOidcProviderArn` | no | none | Reuse an existing GitHub OIDC provider instead of creating one |
| `bootstrapQualifier` | no | `hnb659fds` | CDK bootstrap qualifier (match `cdk bootstrap --qualifier`) |

Google sign-in: create the secret first, then deploy with `-c googleSecretName=smash/<env>/google`.

```bash
aws secretsmanager create-secret --name smash/dev/google \
  --secret-string '{"clientId":"<google oauth client id>","clientSecret":"<google oauth client secret>"}'
```

The Google OAuth client must list `https://<cognitoDomainPrefix>.auth.<region>.amazoncognito.com/oauth2/idpresponse` as an authorised redirect URI.

## CI/CD

- `.github/workflows/ci.yml`: typecheck, tests (DynamoDB Local service container), `cdk synth` for dev and prod on every push and PR.
- `.github/workflows/deploy.yml`: push to `develop` deploys dev, push to `main` deploys prod, via the `Smash-GitHubDeploy` OIDC role. Repository variables: `AWS_ACCOUNT_ID`, `AWS_REGION`, `SENDER_EMAIL`, `ALARM_EMAIL`, optional `WEB_DOMAIN`, `HOSTED_ZONE_ID`, `CERTIFICATE_ARN`.
- Mobile store builds run through EAS (`client/eas.json`), not GitHub Actions.

## License

MIT, see [LICENSE](LICENSE).
