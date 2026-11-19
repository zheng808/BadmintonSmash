# @badmintonsmash/api

HTTP API for BadmintonSmash: one Hono app running as a Lambda behind API Gateway (HTTP API, Cognito JWT authorizer), DynamoDB single table, SQS → notifier Lambda → SES, and an hourly housekeeping Lambda. Contracts come from `@badmintonsmash/shared`. Design: `docs/02-system-design.md`; endpoints: `docs/03-api-reference.md`.

## Layout

```
src/app.ts              Hono app (request id, auth, validation, error envelope, routes)
src/auth.ts             identity from the API Gateway JWT claims (or x-dev-user when DEV_AUTH=1)
src/routes/*            thin HTTP handlers
src/domain/*            business rules: join/leave/promote, event lifecycle, settlement, money, profile
src/repo/store.ts       narrow Store interface (conditions, updates, queries, transactions)
src/repo/dynamo-store.ts  DynamoDB implementation (expression compiler)
src/repo/memory-store.ts  in-memory implementation with the same semantics (tests, local dev)
src/repo/{users,events,signups}.ts  entity repositories and key layout
src/notify/*            domain-event publisher (SQS), bilingual email templates, SES sender, SQS consumer
src/housekeeping.ts     auto-complete + promotion safety net
src/lambda/*            Lambda entrypoints: http, notifier, housekeeping
src/local.ts            local dev server
```

## Environment

| Variable | Purpose |
|---|---|
| `TABLE_NAME` | DynamoDB table (created by CDK; `createTableIfMissing` for local) |
| `DYNAMODB_ENDPOINT` | DynamoDB Local endpoint (unset in AWS) |
| `MEMORY_STORE=1` | Use the in-memory store instead of DynamoDB |
| `QUEUE_URL` | Notifications SQS queue (unset = log only) |
| `USER_POOL_ID` | Cognito pool for email lookups and account deletion (unset = in-memory directory) |
| `SES_FROM` | Sender address |
| `APP_WEB_URL` | Base URL for links in emails |
| `DEV_AUTH=1` | Accept `x-dev-user` / `x-dev-email` headers instead of a JWT. Never set in AWS. |
| `POWERTOOLS_LOG_LEVEL` | `INFO` default, `SILENT` in tests |

## Run locally

```bash
docker compose up -d dynamodb        # DynamoDB Local on :8000
npm run dev -w api                   # http://localhost:3000/v1
curl -H 'x-dev-user: alex' -H 'x-dev-email: alex@example.com' localhost:3000/v1/me
```

Or without Docker: `MEMORY_STORE=1 npm run dev -w api`.

## Tests

```bash
docker run -d --name smash-ddb-local -p 8001:8000 amazon/dynamodb-local -jar DynamoDBLocal.jar -sharedDb -inMemory
npm run test -w api                  # against DynamoDB Local on :8001 (DYNAMODB_ENDPOINT to override)
MEMORY_STORE=1 npm run test -w api   # same suite on the in-memory store
```

Each test file creates and deletes its own table. The suite covers the acceptance criteria AC-1..AC-10 from the product spec, including 20 concurrent joins for one remaining spot.

## Notes

- Capacity is enforced by a conditional transaction on the event counters (`confirmedCount < capacity` evaluated by DynamoDB); joins re-read and retry on contention.
- `seq` on a signup is the join timestamp in milliseconds (ties are impossible per user, and ordering between users at the same millisecond is arbitrary but stable).
- Emails are bilingual (English then Simplified Chinese) in one message; no per-user locale routing in v1.

In dev-auth mode an unknown `x-dev-user` id resolves to `<id>@dev.local` automatically, so a fresh dev user can join events before ever calling `/v1/me`.
