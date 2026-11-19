# BadmintonSmash — Authentication Flows

For review. Cognito is the only identity provider the app and the API trust; Google is federated through it, and email one-time code is Cognito-native. Companion to [02-system-design.md](02-system-design.md) section 9.

## 1. Who trusts whom

```mermaid
flowchart LR
  app[App<br/>Expo or Vite]
  cog[Cognito user pool<br/>+ hosted domain]
  goog[Google]
  gw[API Gateway<br/>JWT authorizer]
  api[Lambda http]

  app -->|1. sign in: email code, or Google via hosted domain| cog
  cog <-->|2. OAuth 2.0 federation<br/>client id + secret| goog
  cog -->|3. ID, access, refresh tokens| app
  app -->|4. Bearer access token| gw
  gw -.->|5. verifies against pool JWKS| cog
  gw -->|6. claims.sub| api
  api -.->|7. AdminGetUser on first contact, for email| cog
```

The API never sees a Google token and never handles a password or a code. It only ever receives a Cognito access token that the gateway has already validated.

## 2. Google sign-in (web)

```mermaid
sequenceDiagram
  autonumber
  participant U as User's browser
  participant A as App (Amplify)
  participant C as Cognito hosted domain<br/>badmintonsmash-dev-6154.auth.us-west-2.amazoncognito.com
  participant G as Google accounts
  participant P as Cognito user pool

  U->>A: tap "Continue with Google"
  A->>A: create PKCE verifier + state, keep in storage
  A->>C: GET /oauth2/authorize?identity_provider=Google&client_id=<app client>&redirect_uri=<app URL>&code_challenge=...
  C->>U: 302 to Google
  U->>G: GET accounts.google.com/o/oauth2/v2/auth?client_id=<Google client>&redirect_uri=<Cognito>/oauth2/idpresponse&scope=openid email profile
  G->>U: account chooser + consent
  U->>C: GET /oauth2/idpresponse?code=<Google code>&state=...
  C->>G: POST token endpoint (code + client secret), server to server
  G-->>C: Google ID token (email, name, picture)
  C->>P: create or update user, map attributes, sub = pool user id
  C->>U: 302 to app redirect_uri?code=<Cognito code>&state=...
  U->>A: app loads with code
  A->>A: check state matches
  A->>C: POST /oauth2/token (code + PKCE verifier)
  C-->>A: ID token, access token, refresh token
  A->>A: store tokens, session = signed in
```

### Redirect URIs, and why there are two

| Who redirects | Must be allowed where | Value (dev) |
|---|---|---|
| Google sends the browser back to Cognito | Google Cloud Console, OAuth client "Authorized redirect URIs" | `https://badmintonsmash-dev-6154.auth.us-west-2.amazoncognito.com/oauth2/idpresponse` |
| Cognito sends the browser back to the app | Cognito app client callback URLs (set by the Persistence stack) | `https://dugt1bg3jfc3u.cloudfront.net`, `http://localhost:8081`, `http://localhost:5173`, `badmintonsmash://` |

A `redirect_uri_mismatch` from Google means the first row is missing or different in Google Cloud Console. A Cognito error page about the redirect means the second row does not contain the app's URL.

### Where the secret lives

The Google client secret is used once per sign-in, by Cognito, in step 8. It is stored in Secrets Manager (`smash/<env>/google`) and injected into the Google identity provider at deploy time. The browser, the Lambda, and the repo never hold it.

## 3. Email one-time code (passwordless)

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant A as App (Amplify)
  participant P as Cognito user pool
  participant M as Email (SES)

  U->>A: enter email, tap "Send code"
  A->>P: signUp(username = email, no password, autoSignIn USER_AUTH / EMAIL_OTP)
  alt new email
    P->>M: confirmation code
    A->>U: ask for display name + code
    U->>A: code
    A->>P: confirmSignUp(code)
    P-->>A: COMPLETE_AUTO_SIGN_IN
    A->>P: autoSignIn()
    P-->>A: tokens
  else email already exists (UsernameExistsException)
    A->>P: signIn(username = email, authFlowType USER_AUTH, preferredChallenge EMAIL_OTP)
    P->>M: one-time code
    P-->>A: CONFIRM_SIGN_IN_WITH_EMAIL_CODE
    U->>A: code
    A->>P: confirmSignIn(code)
    P-->>A: tokens
  end
  A->>A: PUT /v1/me with display name on first sign-in
```

Prerequisites in the pool: ESSENTIALS feature plan, `EMAIL_OTP` allowed as a first factor, app client with `ALLOW_USER_AUTH`. Codes are sent through SES when `cognitoSesEmail=true`; while the SES account is in the sandbox only verified addresses receive them.

## 4. Tokens and the API

| Token | Lifetime | Used for |
|---|---|---|
| Access token | 60 min | `Authorization: Bearer` on every API call; carries `sub`, `client_id`, scopes |
| ID token | 60 min | Client-side display of email and name only |
| Refresh token | 30 days | Silent renewal of the other two by Amplify |

```mermaid
flowchart LR
  req[Request with Bearer access token] --> auth{JWT authorizer}
  auth -->|signature via pool JWKS,<br/>issuer, expiry,<br/>client_id matches audience| ok[Lambda http<br/>userId = claims.sub]
  auth -->|anything else| deny[401 from the gateway,<br/>Lambda not invoked]
  ok --> perm{permissions.ts<br/>is host? may act?}
  perm -->|no| forbid[403 forbidden]
  perm -->|yes| work[domain logic]
```

Routes without a token: `GET /v1/health` and `GET /v1/public/*` (redacted event views). Authenticated routes are registered with explicit methods, never `ANY`, so the browser's OPTIONS preflight is answered by the gateway's CORS handler instead of the authorizer.

Local development bypass: with `DEV_AUTH=1` on the API and `EXPO_PUBLIC_DEV_AUTH=1` or `VITE_DEV_AUTH=1` on a client, the header `x-dev-user: <id>` stands in for a token and unknown ids get a synthetic `<id>@dev.local` profile. The flag is never set in AWS.

## 5. Constraints to keep in mind

- **WeChat in-app browser**: Google refuses to show its sign-in page inside embedded webviews (`disallowed_useragent`). The app detects `MicroMessenger` in the user agent, hides the Google button and shows "open in Safari or Chrome"; the email code flow works there.
- **Native apps**: Google sign-in on iOS and Android needs a system-browser bridge for Amplify (`@aws-amplify/rtn-web-browser`), not yet added; email code works natively today.
- **Apple**: once Google ships in the iOS store build, App Store guideline 4.8 requires Sign in with Apple as well (P1).
- **WeChat login** (P1): WeChat OAuth is not OIDC, so it is bridged by a small OIDC shim that Cognito trusts as a generic provider; see the system design, section 9.2. It needs a verified WeChat Open Platform account first.
- **Account deletion**: `DELETE /v1/me` anonymises signups, cancels upcoming hosted events, deletes the profile, then removes the Cognito user.
