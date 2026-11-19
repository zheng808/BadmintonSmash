# BadmintonSmash — Product Specification

| | |
|---|---|
| Status | Draft v1 for review |
| Date | 2026-11-18 |
| Scope | v1 (P0), v1.1 (P1), later (P2) |
| Companion docs | [02-system-design.md](02-system-design.md), [03-api-reference.md](03-api-reference.md), [04-deployment.md](04-deployment.md) |

## 1. Summary

BadmintonSmash lets a badminton organiser post a session ("event"), share a link, and let players sign up until the court cap is reached. Extra players go on a waitlist and are promoted automatically when someone drops out. After the session, the organiser enters the real costs (court rental, number of shuttlecocks used, anything else), the app splits the total across the players who came, and everyone sees what they owe. The organiser ticks players off as they pay.

The app runs on iOS, Android and the web from one codebase and is hosted on AWS at near-zero idle cost.

**First audience:** Chinese-speaking badminton groups in Metro Vancouver (Vancouver and Richmond) that organise today through WeChat group 接龙 sign-up lists and manual e-Transfer tracking. Most players will first open a share link inside WeChat's in-app browser, so the web build must work there, the UI must be available in Simplified Chinese, and the roster must be easy to paste back into the group chat.

Inspiration: "Badminton Set&Play" (FunPoint Sports) covers leagues, tournaments, draws and ranking points with a Stripe wallet. BadmintonSmash deliberately does **not** do leagues, draws or in-app money. It is for the far more common case: a recurring social session where one person books the courts and everyone chips in.

## 2. Goals and non-goals

**Goals**

1. An organiser can create and share an event in under a minute from a phone.
2. A player can sign up in two taps; cap and waitlist are enforced exactly, even when many people sign up at the same moment.
3. Fees can be left open at creation and finalised after the session from actual costs. Nobody has to do spreadsheet math.
4. Everyone knows where they stand: confirmed, waitlisted (and at what position), how much they owe, and whether they have paid.
5. One codebase for iOS, Android and web. Web must be fully usable, not a landing page.
6. Runs on AWS for a few dollars a month or less at community scale (hundreds of users).

**Non-goals (v1)**

- Leagues, ladders, tournaments, draws, scores, rankings.
- In-app payment processing or wallets. Money moves outside the app (Interac e-Transfer, Venmo, Zelle, PayPal, cash); the app only tracks who has paid.
- Chat or direct messaging.
- Court booking with venues.

## 3. Personas

| Persona | Description | Main jobs |
|---|---|---|
| **Organiser** (host) | Books courts weekly, fronts the money, chases payments. Usually also plays. | Create event, share it, watch the roster, settle costs, track payments. |
| **Player** | Regular or drop-in. Wants to know if there is a spot and what it costs. | Sign up, leave, see position, see amount owed, see payment instructions. |
| **Co-host** (P1) | Trusted member who helps the organiser. | Same as organiser for the events they are assigned to. |

## 4. Scope by release

| Priority | Release | Contents |
|---|---|---|
| **P0** | v1 | Accounts (email one-time code + Google), Google Places venue picker, event create/edit/cancel, share link, sign up / leave, cap + waitlist with auto-promotion, attendance, fixed or settle-after fees, cost split, payment tracking, email notifications, English + Simplified Chinese UI, copy roster as 接龙 text, web (incl. WeChat in-app browser) + iOS + Android |
| **P1** | v1.1 | WeChat login (needs a verified WeChat Open Platform account), Sign in with Apple (required with the iOS store release), WeChat share cards, groups (clubs) with membership and group-only events, recurring events, co-hosts, guests (+1), push notifications, event and payment reminders, CSV export |
| **P2** | later | Stripe / WeChat Pay collection, venue directory, skill level tags and balanced court rotation, admin console |

## 5. Functional requirements

Requirement IDs are stable and referenced from acceptance criteria and tests.

### 5.1 Accounts and profiles

| ID | Requirement | Pri |
|---|---|---|
| ACC-1 | Sign-in is passwordless: the user enters their email and receives a one-time code (sign-up and returning sign-in use the same flow, so the email is verified by construction). | P0 |
| ACC-2 | Password sign-in remains available as a secondary option for users who set one; password reset by email code. | P1 |
| ACC-3 | Profile has display name (required, 2–40 chars), optional phone, optional avatar. | P0 |
| ACC-4 | Organisers can store payment handles on their profile (e-Transfer email, WeChat Pay ID, Alipay, Venmo, Zelle, PayPal.me, free text). These are shown to players on events the user hosts. | P0 |
| ACC-5 | Users can delete their account. Their signups are anonymised, events they host are cancelled if upcoming. | P0 |
| ACC-6 | Sign in with Google (web, Android, iOS) through Cognito federation. | P0 |
| ACC-7 | Sessions persist across app restarts; tokens refresh silently. | P0 |
| ACC-8 | Inside WeChat's in-app browser Google blocks sign-in (403 `disallowed_useragent`). The app detects the `MicroMessenger` user agent, hides the Google button, and shows "Open in Safari/Chrome" instructions plus the email option. | P0 |
| ACC-9 | Sign in with WeChat, keyed by WeChat `unionid`, bridged into Cognito. Blocked on a verified WeChat Open Platform account (overseas company verification: US$99, 7–15 working days). | P1 |
| ACC-10 | Sign in with Apple. Required by App Store guideline 4.8 once Google sign-in ships in the iOS build. | P1 (before iOS store release) |
| ACC-11 | Users choose UI language (English or 简体中文); default follows the device locale. | P0 |

### 5.2 Events

| ID | Requirement | Pri |
|---|---|---|
| EVT-1 | An authenticated user can create an event with: title (required), description (optional, markdown-lite plain text), venue (name required; address, map link, Google Places id and coordinates filled by a Places autocomplete picker on web, with Vancouver and Richmond as the examples), start date-time (required), end date-time (required, after start), time zone (defaults to device), capacity (required, 1–200), number of courts (optional). | P0 |
| EVT-2 | Fee mode is one of **Fixed** (amount per player known now) or **Settle after** (costs entered after the session). Currency is CAD or USD per event, default from the host's last event. | P0 |
| EVT-3 | Visibility is **Link only** (anyone with the link can view and sign up) or **Public** (also appears in the public upcoming list). Default: link only. | P0 |
| EVT-4 | Optional signup window: opens-at and closes-at. Outside the window the join button is disabled with a reason. Default: opens on publish, closes at event start. | P0 |
| EVT-5 | Optional cancellation deadline (hours before start). Leaving after the deadline is still allowed but the signup is flagged **late cancel** and the player may still be charged (host decides at settlement). | P0 |
| EVT-6 | Host can edit any field while the event is not completed or cancelled. Reducing capacity below the confirmed count is rejected. Increasing capacity promotes waitlisted players in order. | P0 |
| EVT-7 | Host can cancel an event. All confirmed and waitlisted players are notified. Cancelled events cannot be reopened. | P0 |
| EVT-8 | Host can duplicate an event (copies everything except date, roster and settlement). | P0 |
| EVT-9 | Every event has a short share link (web URL that also opens the mobile app when installed). | P0 |
| EVT-10 | Lifecycle: `draft → open → closed → completed`, plus `cancelled` from any pre-completed state. `closed` means signups are closed (window ended or host closed it). `completed` is set by the host after the session or automatically 24 h after end time. | P0 |
| EVT-11 | The host is automatically a confirmed participant unless they untick "I'm playing" when creating the event. | P0 |
| EVT-12 | Recurring events (weekly, every N weeks) generate the next occurrence when the current one completes. | P1 |
| EVT-13 | Co-hosts can be added by the host and have host permissions on that event. | P1 |
| EVT-14 | Events can belong to a group; group-only visibility restricts signup to members. | P1 |

### 5.3 Signups, capacity and waitlist

| ID | Requirement | Pri |
|---|---|---|
| SGN-1 | A signed-in user can join an open event. If confirmed count < capacity they are **confirmed**; otherwise they are **waitlisted** with a position. | P0 |
| SGN-2 | Capacity is enforced atomically: two simultaneous joins for the last spot result in exactly one confirmed and one waitlisted. | P0 |
| SGN-3 | A user can leave an event. If they were confirmed, the earliest waitlisted player is promoted automatically and notified. Promotion repeats while spots and waitlisted players remain. | P0 |
| SGN-4 | A user who left can rejoin; they go to the back of the queue (new position). | P0 |
| SGN-5 | Waitlist order is strictly first-come. Positions shown to players are 1-based and recomputed after each change. | P0 |
| SGN-6 | Host can remove a participant (with optional reason, notified) and can manually add a participant by email if that user has an account. | P0 |
| SGN-7 | Roster shows confirmed players, then waitlist in order, each with name, join time, payment status (after settlement) and attendance. Players see names only; hosts see everything. | P0 |
| SGN-8 | Players can add a note to their signup (e.g. "arriving 7:30"). | P0 |
| SGN-9 | Guests: a signup may include up to N guests who count toward capacity. | P1 |
| SGN-10 | Players receive a reminder 24 h before the event. | P1 |
| SGN-11 | Anyone on the event can copy or share the roster as 接龙-style text (title, date, venue, then `1. Name` per confirmed player, then a waitlist section) for pasting into the WeChat group. | P0 |

### 5.4 Attendance

| ID | Requirement | Pri |
|---|---|---|
| ATT-1 | From event start until settlement, the host can mark each confirmed player **attended** or **no-show**. Default is attended. | P0 |
| ATT-2 | Attendance drives who is charged in settle-after mode (see FEE-5). | P0 |

### 5.5 Fees and settlement

| ID | Requirement | Pri |
|---|---|---|
| FEE-1 | **Fixed** mode: every confirmed player owes the fixed amount from the moment they are confirmed. | P0 |
| FEE-2 | **Settle after** mode: amount owed is unknown until the host finalises. The event page shows "Cost split after the session" and, optionally, a host-entered estimate. | P0 |
| FEE-3 | Settlement form (host, any time after event start): court cost, number of shuttlecocks used, cost per shuttlecock (prefilled from the host's last settlement), other costs with a label, and who pays: **attended players** (default) or **all confirmed players**. Late-cancelled players can be toggled in individually. | P0 |
| FEE-4 | The app computes total = court + shuttles × unit cost + other, and per-player share = ceil(total ÷ payer count) in cents. The host sees the breakdown and can override the per-player amount or an individual player's amount before finalising. | P0 |
| FEE-5 | On **Finalise**, each payer's signup gets an amount owed and status **unpaid**; players are notified with the amount and the host's payment handles. Finalising can be re-done (amounts recalculated for unpaid players; paid players keep their recorded amount and a warning is shown if it differs). | P0 |
| FEE-6 | Host can mark each player **paid**, **unpaid**, or **waived**. Players can tap "I've paid" which sets a **claimed paid** flag the host confirms. | P0 |
| FEE-7 | Event page shows a payment summary to the host: collected, outstanding, waived; and a per-player list. | P0 |
| FEE-8 | Players have a "Money" screen listing every event where they owe money, with amount, host payment handles, and status. | P0 |
| FEE-9 | Payment reminders: host can send one reminder per 24 h to all unpaid players. | P1 |
| FEE-10 | Host can change fee mode from settle-after to fixed (or vice versa) until finalised. | P0 |

### 5.6 Discovery and navigation

| ID | Requirement | Pri |
|---|---|---|
| DSC-1 | Home shows **My upcoming** (events I'm in, soonest first) and **Hosting** (events I host). | P0 |
| DSC-2 | **Explore** lists public open events, soonest first, optionally filtered by text. | P0 |
| DSC-3 | **Past** lists completed events I was in, newest first, with amount owed if any. | P0 |
| DSC-4 | Opening a share link while signed out shows the event read-only with a sign-in prompt; after sign-in the user lands back on the event. | P0 |

### 5.7 Notifications

| ID | Requirement | Pri |
|---|---|---|
| NOT-1 | Email on: signup confirmed, waitlisted, promoted from waitlist, removed by host, event time/venue changed, event cancelled, fees finalised (with amount and payment handles), payment marked paid. | P0 |
| NOT-2 | Host receives a daily digest of new signups only if there were any (not one email per signup). | P1 |
| NOT-3 | Push notifications for the same triggers, with per-user opt-out. | P1 |
| NOT-4 | Non-essential emails can be switched off in the profile; essential ones (promoted from waitlist, event time/venue changed, event cancelled, fees finalised) are always sent while the user has an active signup. | P0 |

### 5.8 Groups (P1)

| ID | Requirement | Pri |
|---|---|---|
| GRP-1 | A user can create a group with name, description and an invite code/link. | P1 |
| GRP-2 | Members join by invite link; owner can remove members and promote co-owners. | P1 |
| GRP-3 | Events can be created inside a group; group-only events are visible to members only. | P1 |
| GRP-4 | Group page lists upcoming group events and members. | P1 |

## 6. Business rules and edge cases

1. **Host counts toward capacity** when "I'm playing" is on (EVT-11).
2. **Capacity reduce**: rejected if below confirmed count. Host must remove players first.
3. **Capacity increase**: promotes from waitlist in position order until full.
4. **Simultaneous joins**: resolved by a conditional write on the event's confirmed count; losers are waitlisted (SGN-2). Never over-subscribe.
5. **Leave while waitlisted**: no promotion needed; positions behind shift up.
6. **Rejoin**: new position at the back (SGN-4). The late-cancel flag is cleared on rejoin; it only ever describes the current cancelled state.
7. **Late cancel**: computed at leave time against `cancelDeadlineHours`. Flag is informational; charging is the host's call at settlement (FEE-3).
8. **Settlement payer set**: attended players by default. No-shows excluded. Waitlisted never charged. Late-cancelled optionally included.
9. **Rounding**: per-player share rounds up to the cent; the host sees the rounding surplus (e.g. $0.09 on 11 players) so they can waive it.
10. **Re-finalising**: allowed; already-paid amounts are never changed silently.
11. **Fixed fee changed after confirmations**: new amount applies to unpaid players; paid players keep their recorded amount.
12. **Time zones**: all times stored in UTC with the event's IANA time zone; displayed in the event time zone with the zone abbreviation when it differs from the viewer's.
13. **Event in the past at creation**: rejected (start must be in the future on create, can be in the past on edit for corrections).
14. **Deleting an account** anonymises signups ("Deleted user") and keeps amounts for the host's records.
15. **Completed auto-transition**: 24 h after end time an open/closed event becomes completed; signups are frozen; settlement remains editable.

## 7. Worked example: settle after

Thursday session, 12 confirmed, 1 no-show, 1 late cancel (host decides to charge them).

| Input | Value |
|---|---|
| Court cost | $96.00 (3 courts × 2 h × $16) |
| Shuttlecocks used | 9 at $3.20 |
| Other | $0 |
| Payers | 11 attended + 1 late cancel = 12 |

Total = 96.00 + 28.80 = $124.80. Per player = ceil(12480 / 12) = 1040 → **$10.40**. Surplus = 0.

Each of the 12 payers gets "You owe $10.40 to Alex. e-Transfer: alex@example.com". The no-show owes nothing.

## 8. Non-functional requirements

| Area | Requirement |
|---|---|
| Platforms | iOS 16+, Android 10+, modern evergreen browsers (last 2 versions) and the WeChat in-app browser on iOS and Android. Responsive web from 360 px to desktop. Every P0 flow except Google sign-in must work inside WeChat's browser. |
| Codebase | Single React Native + web codebase; no feature may be mobile-only or web-only in P0 except push notifications. |
| Performance | API p95 < 400 ms warm; cold start < 1.5 s. Event page renders roster of 100 in < 1 s on a mid-range phone. |
| Availability | Single region, multi-AZ managed services. Target 99.5% monthly. No on-call expected. |
| Security | All traffic TLS. Auth via managed identity provider with verified email. Least-privilege IAM. Input validation on every endpoint. Host-only actions enforced server-side. |
| Privacy | PII limited to email, display name, optional phone. Phone is shown only to hosts of events the user is in. Account deletion within 24 h. No analytics SDKs that sell data. |
| Cost | Idle cost under $1/month excluding optional custom domain. Under $10/month at 500 monthly active users. |
| Accessibility | Tappable targets ≥ 44 pt, labelled controls, colour is never the only status indicator, dynamic type on mobile. |
| Localisation | English and Simplified Chinese (zh-CN) in v1, one message file per language, default from device locale with a manual switch. Emails are bilingual (English then 中文) so mixed groups need no per-user setting. Currency formatted per event currency; times in the event time zone. |
| Offline | App opens with cached last state and shows a banner; mutations require connectivity. |
| Observability | Structured logs, request IDs on every response, alarms on API 5xx and queue failures. |

## 9. Screens

| Screen | Key content and actions |
|---|---|
| Sign in | Email → one-time code entry; Continue with Google (hidden inside WeChat's browser, replaced by open-in-browser guidance); WeChat and Apple (P1). Language toggle. |
| Home | Tabs: Upcoming, Hosting, Past. Floating "New event". Each card: title, date, venue, spots left or waitlist count, my status chip. |
| Explore | Public open events, search box. |
| Event detail | Header (title, date, venue with map link), status chip, spots bar (confirmed/capacity, waitlist N), fee line (fixed amount, or "split after session ~ $est"), description, host card with payment handles, roster (confirmed then waitlist), primary action: Join / Leave / Full – join waitlist / Closed. "Share roster (接龙)" copies or shares the roster text. Host sees Edit, Close signups, Settle, Cancel, Share. |
| Create / Edit event | Form per EVT-1..5, EVT-11. Date-time pickers that work on web and native. |
| Roster (host) | Each row: name, status, joined time, late-cancel flag, attendance toggle, payment status menu, remove. |
| Settle (host) | Cost inputs, payer selection, live total and per-player, overrides, Finalise. Payment summary after finalise. |
| Money | List of what I owe and what I'm owed (as host), grouped by event. |
| Profile | Display name, phone, payment handles, language, notification preferences, delete account. |
| Share sheet | Copy link, native share. |

## 10. Acceptance criteria (P0)

**AC-1 Join with spots available**
Given an open event with capacity 12 and 11 confirmed, when a signed-in player taps Join, then their signup is confirmed, the spots bar shows 12/12, the Join button becomes Leave, and they receive a confirmation email within 1 minute.

**AC-2 Join when full**
Given an open event with 12/12 confirmed and 2 waitlisted, when a player taps "Join waitlist", then their status is waitlisted with position 3.

**AC-3 Concurrent last spot**
Given 11/12 confirmed, when two players tap Join within the same second, then exactly one is confirmed and one is waitlisted at position 1.

**AC-4 Leave triggers promotion**
Given 12/12 confirmed and a waitlist of [A, B], when a confirmed player leaves, then A becomes confirmed, B becomes position 1, A is emailed "You're in", and counts are 12/12 with 1 waitlisted.

**AC-5 Capacity increase**
Given 12/12 with waitlist [A, B, C], when the host sets capacity to 14, then A and B are confirmed and C is position 1.

**AC-6 Capacity decrease rejected**
Given 12/12, when the host sets capacity to 10, then the save fails with "Capacity cannot be below the 12 confirmed players".

**AC-7 Settle after**
Given a completed settle-after event with 12 attended, when the host enters court $96.00, 9 shuttles at $3.20, payers = attended, and taps Finalise, then each attended player's signup shows owed $10.40 unpaid, the host summary shows outstanding $124.80, and each payer gets a fees email with the host's payment handles.

**AC-8 No-show excluded**
Given the above but one player marked no-show, when the host finalises, then 11 payers owe $11.35 each (ceil(12480/11) = 1135) and the no-show owes nothing.

**AC-9 Mark paid**
Given a finalised event, when the host marks player P paid, then P's Money screen shows Paid, the host summary moves $10.40 from outstanding to collected, and P gets a receipt email.

**AC-10 Host-only actions**
Given a non-host signed-in user, when they call any host-only API (edit, cancel, settle, mark paid, remove), then the API returns 403 and the UI never offers those actions.

**AC-11 Share link signed out**
Given a signed-out user opens an event link on the web, when the page loads, then they see the event details and roster count (not names) with a "Sign in to join" button, and after signing in they return to the event.

**AC-12 Web parity**
Every P0 flow above can be completed in a desktop browser, a mobile browser, and the WeChat in-app browser (except Google sign-in, which shows the open-in-browser instructions instead).

**AC-13 Copy roster**
Given an event with 12 confirmed and 2 waitlisted, when any participant taps "Share roster", then the text contains the title, the formatted date and venue, lines `1.` to `12.` with confirmed names in join order, and a waitlist section with `1.` and `2.`, and on web it is copied to the clipboard while on mobile the native share sheet opens.

**AC-14 Language**
Given a device set to Simplified Chinese, when the app opens, then all UI strings render in Chinese, and switching to English on the Profile screen persists across restarts.

## 11. Success metrics

- Time from "New event" tap to share link copied: median < 60 s.
- Share of events with fees finalised within 48 h of end time: > 70%.
- Share of signups made via share link within 24 h of publish: track.
- Weekly active organisers and players: track.

## 12. Assumptions and open questions

Assumptions made to proceed (change any of these and the spec updates accordingly):

1. **Money stays outside the app** in v1. Stripe is P2.
2. **Currency** defaults to CAD with USD available; others can be added as formatting only.
3. **Email is the only P0 notification channel.** Push is P1 because it needs store builds and device tokens. WeChat template messages need a verified Service Account and are out of scope until ACC-9 lands.
4. **Host sees phone numbers** of players in their events; players do not see each other's contact info.
5. **No skill levels** in v1. Add as a tag in P2 if users want balanced courts.
6. **One organiser per event** in v1; co-hosts are P1.

Open questions for the product owner:

1. Should "Public" events exist in v1, or is link-only enough to start? (Public needs light moderation eventually.)
2. Should players be able to see the full roster names before they sign up? Spec says yes for signed-in users.
3. Should settle-after allow a **deposit** (fixed part now + remainder later)? Not in v1 unless wanted.
4. WeChat login: start the Open Platform company verification now (7–15 working days) so ACC-9 can ship in v1.1? Which legal entity applies?
5. Google Places venue picker is P0 per the organiser brief; it needs a Google Cloud billing account and a browser-restricted Maps API key (`VITE_GOOGLE_MAPS_KEY` / `EXPO_PUBLIC_GOOGLE_MAPS_KEY`).
6. Two web clients exist today (Expo static web in `client/`, Vite SPA in `web/`); decide which ships, or whether native store apps are required at all.
