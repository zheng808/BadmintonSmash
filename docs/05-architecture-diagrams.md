# BadmintonSmash — Architecture Diagrams

For review. Diagrams are Mermaid; GitHub and the VS Code Markdown preview render them. Companion to [02-system-design.md](02-system-design.md). Live dev values (account 242803616154, us-west-2) are shown as examples where useful; they are not secrets.

## 1. Runtime architecture

```mermaid
flowchart TB
  subgraph Clients
    ios[iOS app<br/>Expo]
    android[Android app<br/>Expo]
    web[Web app<br/>static bundle in any browser,<br/>incl. WeChat in-app browser]
  end

  subgraph Edge["Web hosting"]
    cf[CloudFront distribution<br/>HTTPS, SPA fallback, security headers]
    s3[(S3 bucket<br/>private, OAC)]
    cf --> s3
  end

  subgraph Identity["Identity (Cognito)"]
    pool[User pool<br/>email one-time code + password,<br/>ESSENTIALS plan]
    hosted[Hosted domain<br/>oauth2/authorize, token, idpresponse]
    google[(Google<br/>OAuth client)]
    secret[(Secrets Manager<br/>smash/env/google)]
    hosted --> pool
    hosted <-->|federation| google
    secret -.->|client id + secret at deploy| pool
  end

  subgraph API["API (serverless)"]
    apigw[API Gateway HTTP API<br/>JWT authorizer, CORS, throttling]
    http[Lambda: http<br/>Hono router, Node 22 arm64]
    apigw -->|GET POST PUT PATCH DELETE /v1/*| http
    apigw -->|no auth: /v1/health, /v1/public/*| http
  end

  subgraph Data["Data"]
    ddb[(DynamoDB smash-env<br/>single table, GSI1 + GSI2,<br/>on-demand, PITR)]
  end

  subgraph Async["Async work"]
    q[SQS notifications]
    dlq[SQS DLQ<br/>after 5 receives]
    notifier[Lambda: notifier<br/>batch 10, partial failures]
    ses[SES<br/>bilingual emails]
    sched[EventBridge Scheduler<br/>hourly]
    hk[Lambda: housekeeping<br/>auto-complete, promote]
    q --> notifier --> ses
    q -.-> dlq
    sched --> hk
  end

  subgraph Ops["Operations"]
    cw[CloudWatch logs + 5 alarms]
    sns[SNS alarm topic<br/>email to owner]
    cw --> sns
  end

  web --> cf
  ios & android & web -->|sign in, tokens| hosted
  ios & android & web -->|Bearer access token| apigw
  apigw -.->|validates JWT against pool keys| pool
  http --> ddb
  http -->|domain events| q
  http -.->|AdminGetUser on first contact| pool
  notifier --> ddb
  hk --> ddb
  hk --> q
  http & notifier & hk & apigw & dlq -.-> cw
```

## 2. Deployment layout

```mermaid
flowchart LR
  subgraph Repo["Monorepo"]
    shared[shared<br/>zod contracts, fee math, join rules]
    api[api<br/>Hono app, Lambda entrypoints, tests]
    infra[infra<br/>CDK stacks + tests]
    client[client<br/>Expo universal app]
    webv[web<br/>Vite SPA]
    shared --> api
    shared --> client
    shared --> webv
    api -->|bundled by esbuild| infra
  end

  subgraph AWS["AWS account, one region"]
    direction TB
    boot[Smash-Bootstrap<br/>GitHub OIDC provider + deploy role]
    w[Smash-env-Web<br/>S3 + CloudFront]
    p[Smash-env-Persistence<br/>DynamoDB table, user pool, hosted domain,<br/>Google IdP, app client]
    b[Smash-env-Backend<br/>3 Lambdas, HTTP API, SQS, Scheduler,<br/>SES identity, alarms]
    w -->|WebUrl feeds callback URLs + CORS| p
    p -->|table, pool, client| b
  end

  subgraph CI["GitHub Actions"]
    ci[ci.yml<br/>typecheck, tests with DynamoDB Local, cdk synth]
    deploy[deploy.yml<br/>OIDC assume role, cdk deploy, publish web]
  end

  infra --> deploy --> w
  deploy --> p
  deploy --> b
  deploy -.->|assumes| boot
  client -->|expo export| w
  webv -->|vite build| w
```

Stack order is Web, then Persistence, then Backend. Context flags carry environment-specific settings; the dev environment is deployed with:

```
-c env=dev -c cognitoDomainPrefix=badmintonsmash-dev-6154 -c senderEmail=<verified SES address>
-c alarmEmail=<owner> -c cognitoSesEmail=true -c googleSecretName=smash/dev/google
```

The same flags must be passed on every deploy of that environment; dropping one removes the corresponding resource.

## 3. Request lifecycle: a player joins an event

```mermaid
sequenceDiagram
  autonumber
  participant App as App (web or native)
  participant GW as API Gateway<br/>JWT authorizer
  participant L as Lambda http
  participant DB as DynamoDB
  participant Q as SQS
  participant N as Lambda notifier
  participant M as SES

  App->>GW: POST /v1/events/{id}/signups<br/>Authorization: Bearer access token
  GW->>GW: verify signature, issuer, expiry, client id
  GW->>L: event with claims.sub
  L->>DB: GetItem event + my signup (consistent)
  L->>DB: ADD signupSeq 1 (reserve order)
  L->>DB: TransactWriteItems: counter +1 with<br/>condition confirmedCount < capacity, put signup
  alt condition failed (someone took the last spot)
    L->>DB: re-read, retry as waitlisted
  end
  L->>Q: signup.confirmed or signup.waitlisted
  L-->>App: 201 { signup, position? }
  Q->>N: batch of messages
  N->>DB: re-read event + profile, dedupe key
  N->>M: bilingual email
```

## 4. Data model at a glance

```mermaid
erDiagram
  USER {
    string PK "USER#userId"
    string SK "PROFILE"
    string email
    string displayName
    string locale "en or zh-CN"
    json paymentHandles "etransfer, wechat, alipay, venmo, zelle, paypal, other"
  }
  EVENT {
    string PK "EVENT#eventId"
    string SK "META"
    string GSI1PK "HOST#hostId"
    string GSI1SK "startsAt#eventId"
    string GSI2PK "STATUS#status"
    string GSI2SK "visibility#startsAt#eventId"
    int capacity
    int confirmedCount
    int waitlistCount
    int signupSeq
    json venue "name, address, mapUrl, placeId, lat, lng"
    json fee "fixed or settle_after"
    json settlement "inputs, totals, per-player amounts"
  }
  SIGNUP {
    string PK "EVENT#eventId"
    string SK "SIGNUP#userId"
    string GSI1PK "USER#userId"
    string GSI1SK "startsAt#eventId"
    string status "confirmed, waitlisted, cancelled, removed"
    int seq "waitlist order"
    bool attended
    int amountOwedCents
    string paymentStatus "unpaid, paid, waived"
  }
  USER ||--o{ EVENT : hosts
  USER ||--o{ SIGNUP : has
  EVENT ||--o{ SIGNUP : contains
```

One table, two global secondary indexes. GSI1 answers "what does this user host or attend"; GSI2 answers "which events are open or need housekeeping".
