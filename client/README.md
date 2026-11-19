# BadmintonSmash client

One Expo codebase for iOS, Android and the web (Expo SDK 58, Expo Router, React Native 0.88, react-native-web). Contracts, the fee calculator and roster rules come from `@badmintonsmash/shared`.

## Run

From the repo root (`npm install` once at the root; this package has no install step of its own):

```bash
npm run dev -w api                 # optional: local API on http://localhost:3000 (DynamoDB Local)
cd client
cp .env.example .env               # fill in values (see below)
npx expo start                     # press w (web), i (iOS simulator), a (Android emulator)
npx expo export --platform web     # static site in client/dist for S3 + CloudFront
```

## Environment

All values are public and inlined at build time. `scripts/pull-env.sh <env>` at the repo root writes them from the CDK stack outputs.

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_API_URL` | API base URL (with or without the `/v1` suffix) |
| `EXPO_PUBLIC_USER_POOL_ID`, `EXPO_PUBLIC_USER_POOL_CLIENT_ID`, `EXPO_PUBLIC_REGION` | Cognito user pool |
| `EXPO_PUBLIC_OAUTH_DOMAIN` | Cognito hosted-UI domain. When set, the web app shows "Continue with Google". |
| `EXPO_PUBLIC_WEB_URL` | Public web origin; used for share links (`/e/<eventId>`) and OAuth redirects |
| `EXPO_PUBLIC_GOOGLE_MAPS_KEY` | Google Maps Platform key for the venue picker (Places API (New) autocomplete + details). Empty = manual venue fields. |
| `EXPO_PUBLIC_DEV_AUTH` | `1` = no Cognito; the app sends `x-dev-user` / `x-dev-email` headers to the local API |
| `EXPO_PUBLIC_DEV_USER` | Default dev user id (switchable on the Profile screen) |

### Dev auth mode

`EXPO_PUBLIC_DEV_AUTH=1` skips Amplify entirely. The session is always signed in as the dev user id stored on the device (AsyncStorage), and every request carries `x-dev-user: <id>` and `x-dev-email: <id>@dev.local`. The Profile screen shows a "Dev" card to switch users, which is enough to simulate a host and a player on one machine.

### Sign-in

Passwordless: the user enters an email, Cognito emails a one-time code (`USER_AUTH` flow with `EMAIL_OTP`), and the code screen completes sign-up (`confirmSignUp` + `autoSignIn`) or sign-in (`confirmSignIn`). New users are asked for a display name before the code screen; it is saved with `PUT /me` after the first sign-in. The user pool must be on the ESSENTIALS plan with `EMAIL_OTP` as an allowed first factor and the app client must allow `ALLOW_USER_AUTH`.

### Venue picker (Google Places)

With `EXPO_PUBLIC_GOOGLE_MAPS_KEY` set, the event form searches venues with the Places API (New) (`places:autocomplete`, biased to Metro Vancouver, Canada only) and fills name, address, map link, place id and coordinates from Place Details. Restrict the key to the **Places API (New) only**: for web use an HTTP-referrer restriction matching `EXPO_PUBLIC_WEB_URL` (and `localhost:8081` for development); for iOS/Android builds create a **separate key** restricted by bundle id / package name and set it in the EAS profile. Without a key the form shows manual venue fields, and "Enter manually" is always available.

### Google sign-in

Web only for now. Set `EXPO_PUBLIC_OAUTH_DOMAIN` to the Cognito hosted-UI domain and register `EXPO_PUBLIC_WEB_URL` (with and without trailing slash) as callback and sign-out URLs on the app client. Native Google sign-in needs `@aws-amplify/rtn-web-browser` (not installed) and the custom scheme added as a callback URL; the button is hidden on iOS/Android until then. Inside WeChat's in-app browser the button is replaced by a bilingual notice asking the user to open the page in Safari or Chrome.

## Structure

```
app.config.ts          Expo config (name, scheme badmintonsmash://, bundle ids, static web output)
metro.config.js        monorepo watch folders + tslib CJS resolver fix for static rendering
src/app                Expo Router routes: (auth)/{sign-in,verify}, (tabs)/*, events/new, e/[id]/{index,edit,roster,settle}
src/api                fetch client, TanStack Query hooks, query keys
src/auth               Amplify config, auth calls, session provider, secure token storage, dev mode
src/components         Screen, Button, TextField, Chip, Card, Dialog (confirm/prompt/choose/toast), DateTimeField(.web), VenuePicker, EventForm, EventCard, MoneyField, …
src/i18n               en.ts, zh-CN.ts, locale store (useT / t)
src/lib                env, datetime (wall time <-> UTC per IANA zone), rosterText (接龙 export), share, errors
```

Language is detected from the device (`zh*` → 中文) and can be switched on the Profile screen; the choice is saved locally and on the profile (`locale`).

## Builds (EAS)

```bash
npm i -g eas-cli && eas login
eas build --profile preview --platform all      # internal distribution
eas build --profile production --platform all   # store builds
eas submit --platform ios
```

Profiles are in `eas.json`; put the `EXPO_PUBLIC_*` values for each profile under `build.<profile>.env` or as EAS environment variables.

## Notes

- Web share links are `${EXPO_PUBLIC_WEB_URL}/e/<eventId>`; the mobile apps open `badmintonsmash://e/<eventId>`. Universal links (AASA / assetlinks) are a follow-up.
- Date-time entry uses the browser's `datetime-local` control on web and the native pickers on iOS/Android; values are converted to UTC in the event's time zone.
- Cognito tokens are kept in the device keychain (expo-secure-store) on native, with AsyncStorage as a fallback for oversized entries, and in localStorage on web.
