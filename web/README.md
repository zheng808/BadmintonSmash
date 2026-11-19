# web/ — BadmintonSmash web app (Vite + React)

Mobile-first single-page app for players and organisers. It talks to the API described in
[docs/03-api-reference.md](../docs/03-api-reference.md) and signs users in through Cognito with a
passwordless **email one-time code** or **Google**. Built to work inside WeChat's in-app browser,
where Google sign-in is hidden (Google blocks OAuth in webviews) and the email code is used instead.

Languages: English, 简体中文, 繁體中文 (auto-detected, switchable on the Profile page).

## Run locally against the dev API (no AWS needed)

```bash
# terminal 1: API with the in-memory store and dev auth
MEMORY_STORE=1 npm run dev -w api            # http://localhost:3000/v1

# terminal 2: web app
cd web && cp .env.example .env
# set VITE_API_URL=http://localhost:3000 and VITE_DEV_AUTH=1 in .env
npm run dev                                   # http://localhost:5173
```

With `VITE_DEV_AUTH=1` the app sends an `x-dev-user` header instead of a JWT and signs you in as
`VITE_DEV_USER`. Change the user id to simulate a second player.

## Sign-in flow (Cognito, production)

1. The user enters an email. The app calls `signUp` without a password; if the account already
   exists Cognito answers `UsernameExistsException` and the app calls `signIn` with the
   `USER_AUTH` flow and `EMAIL_OTP` as the preferred challenge.
2. Cognito emails a code. New users confirm it with `confirmSignUp` and are signed in by
   `autoSignIn` (no second code); existing users confirm it with `confirmSignIn`.
3. "Continue with Google" uses the Cognito hosted domain (`VITE_OAUTH_DOMAIN`) and is only shown
   outside WeChat.

The user pool must allow `EMAIL_OTP` as a first factor and the app client must allow
`ALLOW_USER_AUTH`; the CDK stack in `infra/` does this.

## Venue picker

When `VITE_GOOGLE_MAPS_KEY` is set, the create/edit form shows a Google Places autocomplete
(Places API (New) web component) restricted to Canada and biased to Metro Vancouver. Picking a
place fills the venue name, address, map link, place id and coordinates. Without a key, or by
choosing "Enter the venue by hand", the venue is typed manually.

Create the key in Google Cloud Console, enable **Maps JavaScript API** and **Places API (New)**,
and restrict it to your web origins.

## Deploy

```bash
scripts/pull-env.sh dev           # writes web/.env.dev from the CDK stack outputs
GOOGLE_MAPS_KEY=... scripts/pull-env.sh dev   # same, with the Maps key included
web/deploy.sh dev                 # vite build --mode dev, s3 sync, CloudFront invalidation
```

The Web stack serves `index.html` for unknown paths, so client-side routes such as `/e/<id>`
work as share links.

## Layout

```
src/
  auth/        Amplify config, passwordless + Google sign-in, session provider
  api/         fetch client (JWT or dev header), TanStack Query hooks per endpoint
  components/  UI primitives, layout, event card, venue picker, event form
  pages/       sign-in, home, explore, event detail, edit, roster, settle, money, profile
  i18n/        en, zh-CN, zh-TW message files and locale store
  lib/         date/time-zone helpers, money formatting, 接龙 roster text, error mapping
```
