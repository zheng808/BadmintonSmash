# BadmintonSmash — API Reference (v1)

Base URL: `https://<api-id>.execute-api.<region>.amazonaws.com/v1` (dev) or `https://api.<domain>/v1` (prod).

- All routes except `GET /health` and `/public/*` require `Authorization: Bearer <Cognito access token>`.
- Request and response bodies are JSON. Schemas are the zod definitions in `shared/src/schemas/*.ts`; the shapes below are the inferred types, abbreviated.
- Money is always integer cents plus a `currency` (`CAD` | `USD`). Times are ISO 8601 UTC strings; events also carry an IANA `timezone`.
- Errors: `{ "error": { "code": string, "message": string, "details"?: unknown } }`.
- Every response has `x-request-id`.
- List endpoints accept `?limit=` (default 20, max 50) and `?cursor=`; they return `{ items, nextCursor? }`.

## Error codes

| HTTP | code | When |
|---|---|---|
| 400 | `validation_error` | Body or query failed schema validation; `details` holds zod issues |
| 401 | `unauthorized` | Missing or invalid token (returned by API Gateway) |
| 403 | `forbidden` | Authenticated but not allowed (not host, etc.) |
| 404 | `not_found` | Event, signup or user does not exist or is not visible |
| 409 | `conflict` | State does not allow the action (already joined, event closed, capacity below confirmed, …) |
| 409 | `signup_window_closed` | Join outside the signup window |
| 409 | `event_not_open` | Join on a non-open event |
| 429 | `rate_limited` | Gateway throttle |
| 500 | `internal_error` | Unexpected; logged with request id |

## Public

| Method | Path | Response |
|---|---|---|
| GET | `/health` | `{ ok: true, version }` |
| GET | `/public/events?q=&limit=&cursor=` | `{ items: EventSummary[], nextCursor? }` — public, open, future events |
| GET | `/public/events/{eventId}` | `EventPublic` — event fields plus `confirmedCount`, `waitlistCount`, host display name; no roster names, no phone |

## Me

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/me` | — | `Profile` (created on first call) |
| PUT | `/me` | `UpdateProfileInput` { displayName, phone?, paymentHandles?, notificationPrefs?, lastEventDefaults? } | `Profile` |
| DELETE | `/me` | — | 204 |
| GET | `/me/money` | — | `MoneySummary` { owed: OwedItem[], owedToMe: OwedToMeItem[] } |

## Events

| Method | Path | Body | Response | Who |
|---|---|---|---|---|
| GET | `/events?scope=upcoming\|hosting\|past` | — | `{ items: EventSummary[], nextCursor? }` with `mySignupStatus` per item | any |
| POST | `/events` | `CreateEventInput` | `EventDetail` (201) | any |
| GET | `/events/{eventId}` | — | `EventDetail` { event, host, roster, me } | any signed-in |
| PATCH | `/events/{eventId}` | `UpdateEventInput` (partial; `null` clears description, courts, signupOpensAt, signupClosesAt, cancelDeadlineHours; `venue` and `fee` are replaced whole) | `EventDetail` | host |
| POST | `/events/{eventId}/publish` | — | `EventDetail` (draft → open) | host |
| POST | `/events/{eventId}/close` | — | `EventDetail` (open → closed) | host |
| POST | `/events/{eventId}/reopen` | — | `EventDetail` (closed → open, before start) | host |
| POST | `/events/{eventId}/complete` | — | `EventDetail` | host |
| POST | `/events/{eventId}/cancel` | `{ reason? }` | `EventDetail` | host |
| POST | `/events/{eventId}/duplicate` | `{ startsAt, endsAt }` | `EventDetail` (201) | host |

`CreateEventInput`: title, description?, venue {name, address?, mapUrl?, placeId?, lat?, lng?}, startsAt, endsAt, timezone, capacity (1–200), courts?, visibility (`link`\|`public`, default link), signupOpensAt?, signupClosesAt?, cancelDeadlineHours?, fee {mode, currency, fixedAmountCents?, estimateCents?}, hostIsPlaying (default true), draft (default false).

`EventDetail.host`: { userId, displayName, paymentHandles } — how to pay the host; shown to every signed-in viewer, never in the public view.

`EventDetail.me`: { isHost, signup?: Signup, position?: number, canJoin: boolean, cannotJoinReason?: string }.

`roster`: array of `Signup` (host) or `SignupPublic` (others: userId, displayName, status, seq, joinedAt). Sorted confirmed by seq, then waitlisted by seq.

## Signups

| Method | Path | Body | Response | Who |
|---|---|---|---|---|
| POST | `/events/{eventId}/signups` | `{ note? }` | `{ signup, position? }` (201) | any signed-in |
| DELETE | `/events/{eventId}/signups/me` | — | `{ signup }` | the player |
| PATCH | `/events/{eventId}/signups/me` | `{ note?, claimedPaid?: true }` | `{ signup }` | the player |
| POST | `/events/{eventId}/signups/add` | `{ email }` | `{ signup, position? }` (201) | host |
| PATCH | `/events/{eventId}/signups/{userId}` | `{ attended?, paymentStatus?, amountOwedCents? }` | `{ signup }` | host |
| DELETE | `/events/{eventId}/signups/{userId}` | `{ reason? }` | `{ signup }` (status `removed`) | host |

Join behaviour: confirmed if a spot is free, otherwise waitlisted; `position` is the 1-based waitlist position. Leaving or removal triggers promotion of the earliest waitlisted player.

## Settlement

| Method | Path | Body | Response | Who |
|---|---|---|---|---|
| GET | `/events/{eventId}/settlement` | — | `Settlement \| null` | host |
| POST | `/events/{eventId}/settlement/preview` | `SettlementInput` | `SettlementResult` (no writes) | host |
| POST | `/events/{eventId}/settlement/finalize` | `SettlementInput` | `{ settlement: Settlement, warnings: string[] }` | host |

`SettlementInput`: courtCostCents, shuttleCount, shuttleUnitCostCents, otherCostCents (default 0), otherLabel?, payers (`attended`\|`confirmed`), includeLateCancels: userId[] (default []), perPlayerOverrideCents?, overrides?: Record<userId, cents>.

`SettlementResult`: totalCents, payerCount, perPlayerCents, surplusCents, amounts: Record<userId, cents>.

`Settlement` = SettlementInput + SettlementResult + { finalizedAt, version }.

## Queue message (internal)

`DomainEvent`: { type, eventId, userIds: string[], eventVersion, dedupeKey, payload?, occurredAt }. Types: `signup.confirmed`, `signup.waitlisted`, `signup.promoted`, `signup.removed`, `event.updated`, `event.cancelled`, `fee.finalized`, `payment.recorded`.
