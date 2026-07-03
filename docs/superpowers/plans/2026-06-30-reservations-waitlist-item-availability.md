# Reservations, Waitlist, and Item Availability - Implementation Plan

**Date:** 2026-06-30  
**Verified checkout:** `2425f66f6813183ea9e160d2a846e5817f219551`  
**Status:** Ready for implementation after the verified High-severity order/payment audit findings are resolved.

## Goal

Complete the existing item out-of-stock capability and add a production-safe reservation system containing:

- Public booking by party size and time slot.
- Reservation timeline and table assignment.
- Walk-in waitlist with estimated wait ranges.
- Email/SMS confirmations and reminders.
- Optional Stripe deposit and cancellation policy.
- Atomic conversion from an arrived guest to a `TableSession`.
- No-show, reservable-occupancy, covers, and table-turnover analytics.

This plan is repository-specific. It was produced after checking the current Prisma schema, NestJS modules, React routes,
table/session lifecycle, payment integration, feature flags, Socket.IO rooms, notification code, and analytics.

## Confidence Boundary

The following facts are verified against the current checkout:

1. There is no reservation, booking, waitlist, no-show, party-size, or reservation-deposit model, backend module,
   controller, frontend route, or dashboard view.
2. `RestaurantTable` has zones but no capacity or bookable flag.
3. `TableSession` has `createdAt` and `paidAt`, but no guest count or reliable `closedAt`. Accurate occupancy and turnover
   cannot be calculated from the current model.
4. `MenuItem.isOutOfStock` already exists and defaults to `false`.
5. Public menu queries already exclude `isOutOfStock = true`.
6. Menu import/export already preserves `isOutOfStock`.
7. The frontend `Item` type, item editor/list, and update DTO do not expose an operational out-of-stock toggle.
8. Order creation fetches menu items without rejecting `isOutOfStock`, so a stale cart can still order an unavailable
   item by ID.

Therefore, item availability is **not** a new one-field feature. The field and public filter already exist. The correct
work is to complete its operational interface, real-time propagation, and server-side order enforcement.

External providers still require sandbox and staging verification. The test and rollout sections below define the
evidence required before enabling deposits or SMS in production.

---

## Product Decisions

These defaults remove implementation ambiguity. Owners can change them later in reservation settings.

| Decision | MVP behavior |
|---|---|
| Reservation entitlement | New `reservations` feature flag; Professional and Enterprise tiers |
| Availability toggle entitlement | Existing menu capability; OWNER, MANAGER, or assigned KITCHEN role |
| Booking URL | `/book/:restaurantId` |
| Dashboard placement | New `reservations` dashboard tab |
| Slot interval | 30 minutes |
| Default table duration | 90 minutes |
| Turnover buffer | 15 minutes |
| Minimum booking lead time | 60 minutes |
| Booking horizon | 60 days |
| No-show grace period | 15 minutes |
| Reminder | 24 hours before start |
| Deposit Checkout hold | 30 minutes, the minimum custom Stripe Checkout expiry |
| Waitlist ready hold | 10 minutes |
| Contact requirement | Guest name plus at least one of email or normalized E.164 phone |
| Table choice | Backend assigns the smallest available table that fits the party |
| Combined tables | Not in MVP; one reservation has at most one table |
| Currency | EUR only; deposit values stored as integer euro cents |
| Time storage | UTC instants; weekly schedules interpreted in `Restaurant.timezone` |
| Offline booking | Never queue a booking offline; save the form draft and re-check availability when online |

Reservations are disabled by default. Existing restaurants must configure table capacities, service periods, policies,
and communication channels before public booking can be enabled.

---

## Architecture

### Deep Module 1: Menu Availability

The module presents a small interface:

```text
setAvailability(itemId, isOutOfStock, actor)
assertOrderable(transaction, itemIds, restaurantId, now)
```

The implementation hides:

- Tenant and role checks.
- Row locking.
- Category schedule/dayparting checks.
- Item out-of-stock checks.
- Safe socket payloads.
- Audit metadata.

The order module and availability endpoint cross this same seam. Tests also use this interface, so orderability rules
cannot drift between customer checkout, waiter POS, and the dashboard.

### Deep Module 2: Reservations

The external interface is:

```text
searchAvailability(query)
book(command)
listTimeline(query, actor)
executeAction(action, actor)
getPublicManagementSession(session)
```

`executeAction` owns the reservation state machine. Controllers do not update statuses directly.

Internal seams:

- `GuestEmailPort` with Resend and in-memory test adapters.
- `GuestSmsPort` with Twilio Programmable Messaging and in-memory test adapters.
- `ReservationDepositPort` with Stripe and mock adapters.
- Prisma/PostgreSQL remains an internal local-substitutable dependency.

The reservation module owns slot calculation, table assignment, overlap handling, policy snapshots, deposits,
notifications, arrival, and audit events. Callers do not implement fragments of those rules.

### Deep Module 3: Waitlist

The interface is:

```text
joinWaitlist(command, actor)
listWaitlist(query, actor)
estimateWait(query)
executeWaitlistAction(action, actor)
```

The module hides position ordering, estimated-time calculation, notification holds, table selection, and the atomic
creation of a `TableSession` when a guest is seated.

---

## Data Model

### New Enums

Use these exact values so the state machines, database predicate, DTO validation, and analytics share one vocabulary:

- `ReservationStatus`: `PENDING_DEPOSIT`, `PENDING_CONFIRMATION`, `CONFIRMED`, `SEATED`, `COMPLETED`, `CANCELLED`,
  `NO_SHOW`, `EXPIRED`.
- `ReservationSource`: `PUBLIC`, `STAFF`, `WAITLIST`.
- `ReservationCancelledBy`: `GUEST`, `RESTAURANT`, `SYSTEM`.
- `ReservationDepositMode`: `NONE`, `FLAT`, `PER_PERSON`.
- `ReservationDepositStatus`: `PENDING`, `SUCCEEDED`, `FAILED`, `REFUND_PENDING`, `REFUNDED`.
- `WaitlistStatus`: `WAITING`, `NOTIFIED`, `SEATED`, `CANCELLED`, `EXPIRED`.
- `ReservationNotificationChannel`: `EMAIL`, `SMS`.
- `ReservationNotificationStatus`: `PENDING`, `PROCESSING`, `SENT`, `FAILED`.

### Existing Models to Extend

#### `RestaurantTable`

Add:

- `capacity Int?`
- `isBookable Boolean @default(false)`

Existing rows remain non-bookable until reviewed. Do not assume every existing table seats four people.

Database checks:

- `capacity IS NULL OR capacity BETWEEN 1 AND 50`
- `isBookable = false OR capacity IS NOT NULL`

Update table create/edit DTOs and UI. The reservation setup screen must refuse activation while there are no bookable
tables.

#### `TableSession`

Add:

- `guestCount Int?`
- `closedAt DateTime?`
- `updatedAt DateTime @updatedAt`

All session-closing paths must set `closedAt` exactly once. This includes:

- Automatic close after payment.
- Manual close without payment.
- POS card close.
- POS cash close.
- Forced replacement/administrative close.

Do not derive turnover from order completion or payment time. Actual session open/close timestamps are authoritative.

#### `Restaurant`

Add relations only. Reservation configuration belongs in a dedicated model rather than adding another large field group
to `Restaurant`.

### New Models

#### `ReservationSettings`

One row per restaurant:

- `restaurantId` unique.
- `enabled`.
- `slotIntervalMinutes`.
- `defaultDurationMinutes`.
- `turnoverBufferMinutes`.
- `minimumLeadMinutes`.
- `bookingHorizonDays`.
- `maxPartySize`.
- `autoConfirm`.
- `noShowGraceMinutes`.
- `reminderMinutesBefore`.
- `waitlistEnabled`.
- `defaultEstimatedTurnMinutes`.
- `depositMode`: `NONE`, `FLAT`, or `PER_PERSON`.
- `depositAmountCents`.
- `freeCancellationMinutes`.
- `createdAt`, `updatedAt`.

Validation:

- Slot interval: 10-120 minutes.
- Duration: 30-360 minutes.
- Buffer: 0-120 minutes.
- Horizon: 1-365 days.
- Party size: 1-50.
- Deposit: non-negative integer cents.
- Deposit mode other than `NONE` requires working Stripe configuration.

#### `ReservationServicePeriod`

Supports separate lunch and dinner periods:

- `id`, `restaurantId`.
- `weekday` using ISO 1-7.
- `startMinute` and `lastSeatingMinute`, measured from local midnight.
- `createdAt`, `updatedAt`.

Constraints prevent invalid minute values and overlapping service periods for the same restaurant/day.

#### `ReservationBlackout`

- `id`, `restaurantId`.
- `startsAt`, `endsAt` in UTC.
- `reason`.
- `createdById`.

Used for holidays, private events, or temporary closure. An overlapping blackout produces no public slots.

#### `Reservation`

- `id` using `cuid()`.
- `referenceCode` unique, human-readable but not an authorization secret.
- `restaurantId`.
- `tableId` nullable until assigned.
- `customerId` nullable.
- `tableSessionId` nullable and unique.
- `source`: `PUBLIC`, `STAFF`, or `WAITLIST`.
- `status`.
- `partySize`.
- `guestName`.
- `guestEmail` nullable.
- `guestPhone` nullable, normalized E.164.
- `startsAt`, `endsAt`.
- `notes` length-limited.
- `idempotencyKey`.
- `manageTokenHash` unique.
- `policySnapshot` JSON.
- `freeCancellationUntil`.
- `confirmedAt`, `seatedAt`, `completedAt`, `cancelledAt`, `noShowAt`.
- `cancelledBy`, `cancellationReason`.
- `createdById` nullable.
- `createdAt`, `updatedAt`.

Constraints and indexes:

- Unique `(restaurantId, idempotencyKey)`.
- Index `(restaurantId, startsAt)`.
- Index `(restaurantId, status, startsAt)`.
- Index `(tableId, startsAt)`.
- `endsAt > startsAt`.
- Party size between 1 and 50.

The policy snapshot freezes duration, deposit, cancellation, and reminder rules used for that booking. Later settings
changes must not retroactively change an existing agreement.

#### `ReservationEvent`

Append-only audit history:

- `reservationId`.
- `type`.
- `actorUserId` nullable.
- `metadata` JSON containing only necessary non-secret context.
- `createdAt`.

Examples: `CREATED`, `DEPOSIT_STARTED`, `CONFIRMED`, `TABLE_CHANGED`, `SEATED`, `CANCELLED`, `NO_SHOW`,
`COMPLETED`, `REFUND_REQUESTED`, and `REFUNDED`.

#### `ReservationDeposit`

Kept separate from the existing `Payment` model because current payments require a `TableSession`, which does not exist
before arrival.

- `reservationId` unique.
- `restaurantId`.
- `provider` initially `STRIPE`.
- `amountCents`.
- `currency` fixed to `EUR`.
- `status`: `PENDING`, `SUCCEEDED`, `FAILED`, `REFUND_PENDING`, `REFUNDED`.
- `providerCheckoutSessionId` unique nullable.
- `providerPaymentIntentId` unique nullable.
- `providerRefundId` unique nullable.
- `providerStatus`.
- `checkoutExpiresAt`.
- `idempotencyKey` unique.
- `createdAt`, `updatedAt`.

#### `ReservationProviderEvent`

- `provider`.
- `eventKey`.
- `reservationDepositId` nullable.
- `eventType`.
- `createdAt`.

Unique `(provider, eventKey)` makes provider webhook handling idempotent.

#### `WaitlistEntry`

- `id`, `restaurantId`.
- `status`: `WAITING`, `NOTIFIED`, `SEATED`, `CANCELLED`, `EXPIRED`.
- `partySize`.
- `guestName`.
- `guestEmail` nullable.
- `guestPhone` nullable.
- `notes`.
- `positionPriority` default zero for explicit manager overrides.
- `quotedWaitMinutes`.
- `estimatedReadyAt`.
- `readyHoldExpiresAt`.
- `tableId` nullable.
- `tableSessionId` nullable unique.
- `joinedAt`, `notifiedAt`, `seatedAt`, `cancelledAt`.
- `createdById` nullable.
- `manageTokenHash` nullable unique.
- `createdAt`, `updatedAt`.

Index `(restaurantId, status, positionPriority, joinedAt)`.

#### `ReservationNotificationOutbox`

- `id`.
- `restaurantId`.
- `reservationId` nullable.
- `waitlistEntryId` nullable.
- `channel`: `EMAIL` or `SMS`.
- `template`.
- `recipient`.
- `payload`.
- `sendAt`.
- `status`: `PENDING`, `PROCESSING`, `SENT`, `FAILED`.
- `attempts`, `nextAttemptAt`, `lastError`.
- `dedupeKey` unique.
- `providerMessageId`.
- `createdAt`, `updatedAt`.

Messages are inserted in the same transaction as the domain transition. A cron worker claims due rows with
`FOR UPDATE SKIP LOCKED`, sends outside the transaction, and records the result. Sending email/SMS inside a reservation
transaction is forbidden.

### Database-Level Double-Booking Protection

Application checks improve error messages but are not the integrity guarantee. Add a custom PostgreSQL migration using:

- `btree_gist`.
- A `tstzrange(startsAt, endsAt, '[)')`.
- An exclusion constraint combining `tableId =` and time-range overlap.
- A predicate limited to active statuses:
  `PENDING_DEPOSIT`, `PENDING_CONFIRMATION`, `CONFIRMED`, and `SEATED`.

Adjacent bookings are allowed because the range is half-open. Overlapping bookings for the same table are rejected even
when two application instances race.

Prisma does not represent this exclusion constraint directly, so create and test it in a customized migration. Never
replace it with only a `findFirst()` availability check.

---

## State Machines

### Reservation

```text
PENDING_DEPOSIT ------payment succeeded------> CONFIRMED
        |                                         |
        +------checkout expired/failed------> EXPIRED
                                                  |
PENDING_CONFIRMATION ----staff confirms--------->+
        |                                         |
        +---------------cancel----------------> CANCELLED
                                                  |
CONFIRMED ----------------arrive---------------> SEATED
    |                         |                   |
    +----cancel------------> CANCELLED            +----session closes----> COMPLETED
    |
    +----after grace, staff marks--------------> NO_SHOW
```

No backward transitions are allowed. Status updates use guarded database predicates, for example
`WHERE id = ? AND status = 'CONFIRMED'`.

### Deposit

```text
PENDING ---> SUCCEEDED
   |
   +-------> FAILED

SUCCEEDED ---> REFUND_PENDING ---> REFUNDED
```

A reservation cancellation can release the table while a refund is pending. Refund completion is reconciled
independently and never faked because a provider call failed.

### Waitlist

```text
WAITING ---> NOTIFIED ---> SEATED
   |            |
   +------------+-------> CANCELLED
   |
   +--------------------> EXPIRED
```

`SEATED` is terminal. Re-notification creates another outbox event but does not move the entry backward.

---

## Core Workflows

### 1. Search Public Availability

Input:

- Restaurant ID.
- Restaurant-local date.
- Party size.

Algorithm:

1. Load active reservation settings and restaurant timezone.
2. Reject dates outside lead time/horizon.
3. Generate local slot candidates from service periods at the configured interval.
4. Convert each candidate to UTC with Luxon. Skip nonexistent DST times.
5. Apply duration and turnover buffer.
6. Remove blackout overlaps.
7. Load bookable tables where `capacity >= partySize`.
8. Load active reservations overlapping the candidate range.
9. Return a slot when at least one eligible table remains.

Public output contains start/end instants and localized labels, not table IDs or internal occupancy details.

### 2. Book Without Deposit

1. Client sends the selected start, party/contact details, and an `Idempotency-Key`.
2. Backend normalizes contact data and recomputes the slot; it never trusts the earlier search response.
3. In a transaction, choose the smallest eligible table, create the reservation, policy snapshot, manage-token hash,
   and audit event.
4. The exclusion constraint is the final race arbiter. On a conflict, retry another eligible table once; otherwise
   return `409 SLOT_NO_LONGER_AVAILABLE`.
5. Status becomes `CONFIRMED` when `autoConfirm` is true, otherwise `PENDING_CONFIRMATION`.
6. Queue confirmation messages transactionally.
7. Emit a private restaurant event only after commit.

### 3. Book With Deposit

1. Create `PENDING_DEPOSIT` reservation and deposit rows in a transaction. The table is held.
2. After commit, create a Stripe Checkout Session using:
   - The connected restaurant Stripe account already used by payments.
   - EUR integer cents.
   - Platform fee policy explicitly defined for deposits.
   - Reservation/deposit IDs in metadata.
   - A stable idempotency key.
   - A 30-minute `expires_at`.
3. If Checkout creation fails, mark the deposit `FAILED`, reservation `EXPIRED`, and release the table.
4. Redirect to hosted Checkout.
5. A signature-verified, idempotent webhook changes the deposit to `SUCCEEDED` and reservation to `CONFIRMED`.
6. `checkout.session.expired` or the local expiry reconciler moves the hold to `EXPIRED`.
7. The success redirect is informative only. It must not confirm the reservation without authoritative webhook/provider
   verification.

Late success after local expiration is handled explicitly: lock the reservation, attempt to restore the table only if
it is still free, otherwise automatically request a full refund and alert staff.

### 4. Manage or Cancel a Reservation

Do not place the raw management bearer token in a normal URL path or query string.

1. Email/SMS link uses `/booking/manage#token=<raw-token>`; URL fragments are not sent in HTTP requests.
2. The frontend exchanges the token in a POST body.
3. Backend stores only its SHA-256 hash and issues a short-lived, scoped, httpOnly management cookie.
4. Cancellation rechecks status and policy under a row lock.
5. Guest cancellation before `freeCancellationUntil` requests a full deposit refund.
6. Late guest cancellation follows the snapshotted policy.
7. Restaurant cancellation always requests a full refund.
8. Refund work uses `REFUND_PENDING` plus provider idempotency and reconciliation. No external provider call is held
   inside a database transaction.

### 5. Assign or Reassign a Table

- OWNER and MANAGER can assign any suitable bookable table.
- WAITER can reassign during arrival only.
- Capacity and overlap are always server-validated.
- Reassignment is transactional and protected by the exclusion constraint.
- Every change appends `TABLE_CHANGED`.

### 6. Guest Arrived -> `TableSession`

One transaction:

1. Lock the reservation.
2. Require `CONFIRMED`.
3. Require arrival within the configured early/late window.
4. Confirm the table is still bookable and large enough.
5. Reject while that table has an `OPEN` or `PAID` session.
6. Create a `TableSession` with `guestCount = partySize`.
7. Set `Reservation.status = SEATED`, `seatedAt`, and `tableSessionId`.
8. Append `SEATED`.

The existing unique-open-session index is retained as the final concurrent-session guard. If the assigned table is not
ready, return `TABLE_NOT_READY` with eligible alternatives; never silently seat the guest at a different table.

When the session closes, the shared table-session lifecycle sets `closedAt` and completes the linked reservation in the
same transaction.

### 7. Walk-In Waitlist

Staff enters name, party size, one contact method, and optional notes.

Estimate:

1. Find bookable tables large enough for the party.
2. Exclude tables needed by a confirmed reservation inside the turnover buffer.
3. Use current `OPEN`/`PAID` sessions and recent completed sessions.
4. Estimate each occupied table's finish as:
   `session.createdAt + rolling median turnover for that capacity/zone`.
5. Fall back to `defaultEstimatedTurnMinutes` when history is insufficient.
6. Return a range, for example 20-35 minutes, rather than a false exact promise.

Ordering is FIFO by `joinedAt`, with an explicit manager priority override recorded in the audit trail.

When staff marks a guest ready:

- Status becomes `NOTIFIED`.
- Set a ten-minute hold.
- Queue SMS/email if configured.

When seated:

- Lock the entry.
- Validate/assign a suitable free table.
- Create `TableSession` with `guestCount`.
- Mark the entry `SEATED`.
- Emit waitlist and table status events after commit.

---

## Backend Endpoints and Authorization

### Public

| Method | Route | Purpose |
|---|---|---|
| GET | `/restaurants/:id/reservations/config` | Branding, policy summary, enabled state |
| GET | `/restaurants/:id/reservations/availability` | Slots by date and party size |
| POST | `/restaurants/:id/reservations` | Create booking; requires idempotency key |
| POST | `/reservations/manage/exchange` | Exchange raw management token from body |
| GET | `/reservations/manage` | Read reservation using scoped cookie |
| POST | `/reservations/manage/cancel` | Cancel using scoped cookie + CSRF |
| GET | `/reservations/deposit/status/:referenceCode` | Non-secret status for post-Checkout page |
| POST | `/reservations/stripe/webhook` | Raw-body, signature-verified provider webhook |

Apply strict throttles to availability search, booking, and token exchange. Add CAPTCHA escalation after repeated booking
attempts, not on every normal booking.

### Authenticated Restaurant Operations

| Method | Route | Roles |
|---|---|---|
| GET/PUT | `/restaurants/:id/reservation-settings` | OWNER, MANAGER |
| GET/POST/DELETE | `/restaurants/:id/reservation-periods` | OWNER, MANAGER |
| GET/POST/DELETE | `/restaurants/:id/reservation-blackouts` | OWNER, MANAGER |
| GET | `/restaurants/:id/reservations` | OWNER, MANAGER, WAITER, STAFF |
| POST | `/restaurants/:id/reservations/manual` | OWNER, MANAGER, WAITER |
| POST | `/reservations/:id/action` | Role checked by action |
| GET | `/restaurants/:id/waitlist` | OWNER, MANAGER, WAITER, STAFF |
| POST | `/restaurants/:id/waitlist` | OWNER, MANAGER, WAITER, STAFF |
| POST | `/waitlist/:id/action` | Role checked by action |
| GET | `/restaurants/:id/reservation-analytics` | OWNER, MANAGER |

Action authorization:

- Confirm/cancel/refund policy override/settings: OWNER or MANAGER.
- Arrive/seat/notify/reassign-at-arrival: OWNER, MANAGER, WAITER, or STAFF.
- Mark no-show: OWNER, MANAGER, or WAITER, and only after grace.
- KITCHEN receives no reservation PII and cannot access reservation endpoints.
- SUPER_ADMIN follows the existing support-access policy.

All endpoints verify restaurant ownership/assignment server-side. Body `restaurantId` is never sufficient authorization.

---

## Item Availability Completion

### Backend

Create a dedicated DTO and route:

```text
PATCH /items/:id/availability
{ "isOutOfStock": true }
```

Do not route this through translation prewarming; availability changes do not alter translatable text.

Authorization:

- OWNER or MANAGER for the item's restaurant.
- Assigned KITCHEN user for that restaurant.
- Other roles denied.

Order enforcement:

1. Move final orderability validation into the order transaction.
2. Lock requested `menu_item` rows with `FOR SHARE`.
3. Reject out-of-stock items with:
   `{ code: "ITEM_UNAVAILABLE", itemIds: [...] }`.
4. Recheck category `HIDDEN`/scheduled availability at the same point.
5. Validate all items belong to the resolved restaurant.
6. Insert the order while those locks are held.

An availability update naturally waits on the row lock. This gives a clear ordering:

- An order whose lock/validation wins first is accepted before the item is marked unavailable.
- Once the out-of-stock update commits, every later order is rejected.

### Frontend

Add `isOutOfStock: boolean` to the shared `Item` type and update mutations.

Add:

- One-tap Available/Sold out control in the menu editor.
- Quick availability drawer in KDS so kitchen staff do not need menu-edit permissions.
- Sold-out badge and disabled selection in staff POS.
- Optimistic update with targeted rollback.
- Accessible confirmation/toast.

Public behavior:

- Continue excluding unavailable items from new menu responses.
- Add a narrow public menu socket room and event:
  `menu:item-availability-changed`.
- Event payload contains only `restaurantId`, `categoryId`, `itemId`, `isOutOfStock`, and `updatedAt`.
- Public menu invalidates/refetches the affected category.
- On reconnect or window focus, refetch to recover missed events.
- If the item is already in a cart, mark the line unavailable and require removal; do not silently delete it.

The public room exposes only menu availability events. It must not reuse the authenticated restaurant room.

---

## Frontend Reservation Experience

### Public Booking Page

Route: `/book/:restaurantId`

Steps:

1. Restaurant branding and booking-policy summary.
2. Party size.
3. Date.
4. Available time slots.
5. Guest/contact details and notes.
6. Cancellation/deposit disclosure with explicit acceptance.
7. Confirmation or Stripe redirect.

Requirements:

- Mobile-first and keyboard accessible.
- Restaurant-local date/time displayed with timezone label.
- No table IDs exposed.
- If a selected slot disappears, preserve the form and ask for another slot.
- Save unfinished form locally, excluding sensitive notes where possible.
- When offline, show the saved form but disable confirmation until slots are revalidated.

### Booking Management Page

Route: `/booking/manage`

Shows:

- Reference.
- Restaurant, date/time, party size.
- Confirmation/deposit state.
- Cancellation deadline and policy.
- Cancel action.
- Contact restaurant link.

The raw management token is exchanged from the URL fragment and then removed with `history.replaceState`.

### Dashboard Reservations View

Add a `reservations` tab and feature lock.

MVP view:

- Day timeline with one row per bookable table.
- Reservation blocks sized by start/end.
- Unassigned/conflict lane.
- Date navigation and status filters.
- List fallback for small screens.
- Side panel for contact, notes, deposit, events, assignment, arrival, cancellation, and no-show.
- Visible real-time waitlist beside the timeline.

Do not start with a large third-party calendar dependency. A one-day CSS grid/list is sufficient for the MVP and keeps
timezone and interaction behavior under project control.

### Settings

Add a Reservation Settings tab:

- Enable/disable.
- Service periods.
- Table capacity/bookable setup.
- Duration/buffer/interval/lead/horizon.
- Auto-confirm.
- Contact channels.
- Reminder timing.
- Deposit/cancellation policy.
- Waitlist defaults.
- Blackouts.

Enable button remains disabled until all prerequisites pass and displays the exact missing configuration.

### Localization

Add reservation, waitlist, deposit, policy, and availability keys to every existing locale. Email/SMS templates use the
restaurant's configured language, falling back to English. Dashboard operational text follows `dashboardLanguage`.

---

## Socket Events

Private restaurant room:

- `reservation:created`
- `reservation:updated`
- `reservation:deleted` only if deletion is ever allowed (prefer cancellation)
- `waitlist:created`
- `waitlist:updated`
- Existing `table:status-changed`

Public menu room:

- `menu:item-availability-changed`

Emit only after successful commit. Payloads are summaries; clients refetch authoritative details. Never emit guest
contact information into a public or table-session room.

---

## Notifications

### Channels

- Email: Resend adapter.
- SMS: Twilio Programmable Messaging adapter, not Twilio Verify.
- Staff fallback: dashboard indication that the guest must be called manually when SMS is not configured.

### Templates

- Booking received/pending.
- Booking confirmed.
- Deposit required.
- Reminder.
- Booking changed.
- Guest cancellation.
- Restaurant cancellation.
- Waitlist joined.
- Table ready.
- Refund requested/completed.

Every dynamic HTML field is escaped or rendered through an auto-escaping template. SMS remains short enough to avoid
unexpected multi-segment cost where possible.

Transactional reservation messages do not imply marketing consent. Store separate consent before any promotional use.

---

## Deposit and Cancellation Rules

MVP supports Stripe deposits only.

Preconditions:

- `paymentsEnabled`.
- Professional/Enterprise reservation entitlement.
- Stripe connected and onboarded.
- Valid deposit amount.

Policy snapshot examples:

- `NONE`: no deposit.
- `FLAT`: EUR 20.00 per reservation.
- `PER_PERSON`: EUR 5.00 x party size.

Cancellation:

- Guest before free-cancellation deadline: full refund.
- Guest after deadline: no automatic refund; manager can override.
- Restaurant cancellation: full refund.
- No-show: deposit retained by default.

Refund implementation follows a persisted state machine and provider idempotency. It must not copy the current audit's
unsafe split between external refund success and internal state. Add a reconciliation job for deposits stuck in
`PENDING` or `REFUND_PENDING`.

---

## Analytics Definitions

All metrics use the restaurant timezone for day grouping.

### Covers

Sum `partySize` for reservations that reached `SEATED` or `COMPLETED`.

### No-Show Rate

```text
NO_SHOW reservations
-------------------- x 100
reservations that reached CONFIRMED and whose start time passed
```

Guest/restaurant cancellations are excluded from the denominator.

### Reservable Occupancy

```text
sum of occupied TableSession minutes during configured service periods
----------------------------------------------------------------------- x 100
sum of bookable table minutes during configured service periods
```

Clamp sessions to the requested report range and service periods. Label this metric **reservable occupancy**, not total
building occupancy.

### Average Table Turnover

Average and median:

```text
TableSession.closedAt - TableSession.createdAt
```

Include only sessions with valid `closedAt`, grouped by table zone, capacity bucket, and source where useful. Exclude
legacy sessions without reliable close timestamps.

### Additional MVP Metrics

- Reservations by status.
- Booking conversion: confirmed / created.
- Deposit conversion.
- Average party size.
- Lead time.
- Waitlist average/median quoted versus actual wait.
- Table utilization by zone.

Start with indexed aggregate queries. Add pre-aggregation only after production query timing shows it is needed.

---

## Privacy, Security, and Abuse Controls

- Store only required guest data.
- Normalize phone numbers; lowercase/trim emails.
- Never log management tokens, notes, or full contact details.
- Hash management tokens at rest.
- Redact sensitive dynamic URL segments from tracing.
- Add reservation/waitlist data to user export, deletion, and retention workflows.
- Anonymize expired/cancelled guest contact data after the configured retention period while preserving aggregate facts.
- Rate-limit slot search, booking, token exchange, and cancellation independently.
- Add bot/CAPTCHA escalation for abuse.
- Verify all Stripe and Twilio callbacks with official SDK/signature mechanisms.
- Store provider event IDs uniquely.
- Use CSRF protection for cookie-authenticated management mutations.
- Never trust client-supplied price, duration, table, policy, or deposit amount.

---

## File Impact Map

### Create - Backend

```text
apps/backend/src/reservations/reservations.module.ts
apps/backend/src/reservations/public-reservations.controller.ts
apps/backend/src/reservations/reservations.controller.ts
apps/backend/src/reservations/reservation-orchestrator.ts
apps/backend/src/reservations/reservation-availability.ts
apps/backend/src/reservations/reservation-policy.ts
apps/backend/src/reservations/reservation-notifications.ts
apps/backend/src/reservations/reservation-analytics.ts
apps/backend/src/reservations/waitlist.ts
apps/backend/src/reservations/ports/guest-email.port.ts
apps/backend/src/reservations/ports/guest-sms.port.ts
apps/backend/src/reservations/ports/reservation-deposit.port.ts
apps/backend/src/reservations/adapters/resend-email.adapter.ts
apps/backend/src/reservations/adapters/twilio-sms.adapter.ts
apps/backend/src/reservations/adapters/stripe-deposit.adapter.ts
apps/backend/src/reservations/dto/*.ts
apps/backend/src/reservations/*.spec.ts
apps/backend/src/menu/menu-availability.service.ts
apps/backend/src/menu/dto/update-item-availability.dto.ts
```

### Create - Frontend

```text
apps/frontend/src/pages/BookingPage.tsx
apps/frontend/src/pages/BookingManagePage.tsx
apps/frontend/src/pages/Dashboard/ReservationsView.tsx
apps/frontend/src/components/reservations/ReservationTimeline.tsx
apps/frontend/src/components/reservations/ReservationDetails.tsx
apps/frontend/src/components/reservations/ReservationSettings.tsx
apps/frontend/src/components/reservations/WaitlistPanel.tsx
apps/frontend/src/components/menu/ItemAvailabilityToggle.tsx
apps/frontend/src/components/staff/KitchenAvailabilityPanel.tsx
apps/frontend/src/services/reservationService.ts
apps/frontend/src/hooks/useReservations.ts
apps/frontend/src/types/reservations.ts
```

### Modify

```text
apps/backend/prisma/schema.prisma
apps/backend/prisma/migrations/<timestamp>_reservations_foundation/migration.sql
apps/backend/src/app.module.ts
apps/backend/src/menu/menu.module.ts
apps/backend/src/menu/item.controller.ts
apps/backend/src/orders/orders.service.ts
apps/backend/src/orders/orders.service.spec.ts
apps/backend/src/tables/dto/create-table.dto.ts
apps/backend/src/tables/dto/update-table.dto.ts
apps/backend/src/tables/tables.service.ts
apps/backend/src/payment/session/*.ts
apps/backend/src/payment/core/*.ts
apps/backend/src/events/events.gateway.ts
apps/backend/src/subscription/feature-flag.enum.ts
apps/backend/src/subscription/feature.service.ts
apps/backend/src/users-data/*
apps/frontend/src/App.tsx
apps/frontend/src/pages/DashboardPage.tsx
apps/frontend/src/pages/staff/KitchenPage.tsx
apps/frontend/src/pages/pos/PosPage.tsx
apps/frontend/src/components/menu/ItemList.tsx
apps/frontend/src/context/MenuContext.tsx
apps/frontend/src/context/CartContext.tsx
apps/frontend/src/types/index.ts
apps/frontend/src/hooks/useFeature.ts
apps/frontend/src/pages/PricingPage.tsx
apps/frontend/src/locales/*/translation.json
```

---

## Sequenced Implementation Tasks

Each task should be a small reviewable commit. Do not combine the entire feature into one migration/PR.

### Task 0 - Prerequisite Safety

- Resolve verified High-severity order transition, loyalty concurrency, table-session cross-restaurant, and refund
  consistency issues that overlap this work.
- Confirm current migrations apply cleanly to an empty database and a production-shaped backup.
- Add PostgreSQL integration-test infrastructure if it does not exist. Mock-only tests cannot prove exclusion or row-lock
  behavior.

**Exit:** Existing targeted tests pass and concurrency test environment is available.

### Task 1 - Complete Item Availability

- Add frontend type and dedicated DTO/endpoint.
- Implement OWNER/MANAGER/KITCHEN authorization.
- Add menu editor and KDS toggles.
- Add POS disabled state.
- Revalidate item/category orderability under lock in order creation.
- Add public menu socket room/event and stale-cart handling.

**Exit:** Once a sold-out update commits, no later customer or POS order can include that item.

### Task 2 - Reservation Foundation Migration

- Add enums/models/relations/indexes.
- Extend tables and sessions.
- Add database checks.
- Add custom non-overlap exclusion constraint.
- Add migration preflight checks and rollback notes.
- Generate Prisma client.

**Exit:** Two concurrent overlapping inserts for one table cannot both commit; adjacent intervals can.

### Task 3 - Settings and Table Capacity

- Add settings, periods, blackout endpoints and UI.
- Add capacity/bookable fields to table forms.
- Add readiness validator.
- Add `reservations` feature flag on backend/frontend and pricing copy.

**Exit:** Public booking remains disabled until configuration is valid.

### Task 4 - Availability Engine

- Implement timezone-safe slot generation.
- Apply lead/horizon/service periods/blackouts.
- Select eligible tables.
- Add public config and availability endpoints.
- Add DST, boundary, and load tests.

**Exit:** Returned slots are accurate for Europe/Sofia DST, table capacity, active reservations, and blackouts.

### Task 5 - Booking Core

- Implement idempotent booking transaction.
- Add smallest-fit table assignment.
- Implement state machine and audit events.
- Add management-token exchange.
- Build public booking and management pages.
- Add private reservation socket events.

**Exit:** Repeated requests with one idempotency key create one reservation; concurrent final-table attempts yield one
booking and one clear conflict.

### Task 6 - Dashboard Timeline and Operations

- Add dashboard tab, day timeline/list, filters, details panel.
- Add manual booking, confirmation, assignment, cancellation, arrival, and no-show actions.
- Enforce action-specific roles.

**Exit:** Staff can operate a full reservation day without direct database intervention.

### Task 7 - Arrival and Session Lifecycle

- Centralize session close behavior.
- Add `guestCount` and reliable `closedAt`.
- Implement atomic reservation arrival and completion.
- Update every existing session close path.

**Exit:** One arrival creates one open session and one link; closing it records one close time and completes the
reservation.

### Task 8 - Waitlist

- Implement waitlist model/actions.
- Add conservative wait-range estimator.
- Build dashboard panel.
- Implement ready hold and seating.

**Exit:** Walk-in entry moves once through the state machine and seating creates one table session.

### Task 9 - Durable Notifications

- Add outbox and claim/retry worker.
- Implement Resend and Twilio adapters.
- Add templates and translations.
- Add provider delivery status where available.

**Exit:** Duplicate workers or cron runs cannot send the same logical notification twice.

### Task 10 - Deposits and Cancellation

- Add Stripe deposit adapter and webhook.
- Add 30-minute holds and expiration reconciliation.
- Add snapshotted cancellation policy.
- Add refund outbox/state/reconciliation.
- Enable settings only for connected Stripe restaurants.

**Exit:** Redirects cannot confirm payment; duplicate webhooks are harmless; expired holds release; refund/provider
failure remains visible and retryable.

### Task 11 - Analytics, Privacy, and Retention

- Add metrics with documented definitions.
- Add dashboard panels.
- Update export/deletion/retention.
- Add indexes verified with `EXPLAIN ANALYZE` on production-shaped data.

**Exit:** Metrics reconcile to fixture data and guest PII follows retention rules.

### Task 12 - Staging and Controlled Rollout

- Seed a staging restaurant with capacities, periods, and Stripe test configuration.
- Run concurrency, DST, webhook replay, SMS/email failure, and load scenarios.
- Enable for one internal restaurant.
- Monitor conflicts, booking failures, reminder delivery, deposit reconciliation, and query latency.
- Expand behind the feature flag only after one full operating week.

---

## Required Test Matrix

### Item Availability

- OWNER, MANAGER, assigned KITCHEN allowed; other-restaurant and other-role callers denied.
- Public menu excludes sold-out item.
- Admin menu still shows it.
- POS disables it.
- Stale cart receives `ITEM_UNAVAILABLE`.
- Order/toggle race has a deterministic before-or-after result, never an order accepted after an already-committed
  sold-out state.
- Socket reconnect refetches missed state.
- Optimistic toggle failure restores only the affected item.

### Slot and Booking

- Minimum lead and horizon boundaries.
- Multiple service periods.
- Blackout overlap.
- Capacity selection chooses smallest fit.
- No table has capacity.
- Adjacent bookings accepted.
- Overlapping booking rejected.
- Two concurrent requests for final table.
- Same idempotency key replay.
- Different restaurant table injection rejected.
- Spring-forward nonexistent local time skipped.
- Fall-back ambiguous time represented unambiguously.
- Settings change does not mutate existing policy snapshot.

### State and Roles

- Every allowed transition.
- Every forbidden backward transition.
- No-show before/after grace.
- Cross-restaurant read/update denied.
- KITCHEN receives no reservation PII.
- Reassignment capacity/overlap checks.

### Arrival and Waitlist

- Arrival creates one session.
- Concurrent double arrival creates one session.
- Assigned table already OPEN/PAID.
- Session close completes reservation exactly once.
- Waitlist FIFO plus audited manager override.
- Ready hold expiry.
- Concurrent seating attempts.
- Estimate fallback with no history.

### Notifications

- Confirmation/reminder dedupe.
- Two workers claim one outbox row.
- Provider timeout and retry.
- Permanent invalid-recipient failure.
- HTML escaping.
- Correct restaurant language and English fallback.

### Deposit

- Checkout creation failure releases hold.
- Duplicate `checkout.session.completed`.
- Completion after local expiration with table still free.
- Completion after expiration with table rebooked -> refund.
- Checkout expiration.
- Guest cancellation before/after cutoff.
- Restaurant cancellation always refunds.
- Refund provider success/internal finalize failure reconciles.
- Invalid webhook signature.
- Connected-account/restaurant mismatch.

### Analytics

- Covers and no-show denominator.
- Session crossing midnight.
- Session partly outside service period.
- Missing legacy `closedAt` excluded.
- Median/average turnover fixtures.
- Restaurant timezone grouping.

---

## Rollout and Migration Safety

1. Add schema with `ReservationSettings.enabled = false` and `RestaurantTable.isBookable = false`.
2. Run preflight SQL for duplicate/invalid existing data before constraints.
3. Deploy backend that tolerates absent settings before deploying frontend controls.
4. Backfill `TableSession.closedAt` only where a trustworthy timestamp exists:
   - `CLOSED_PAID`: `paidAt` may be used as an explicitly approximate legacy value.
   - `CLOSED_NO_PAYMENT`: leave null unless an authoritative timestamp exists.
5. Do not invent capacities for existing tables.
6. Enable feature flag for staging only.
7. Configure one pilot restaurant and verify every table manually.
8. Keep deposit mode `NONE` until provider webhook replay and refund tests pass.
9. Monitor:
   - Exclusion conflicts.
   - Slot-to-book conversion.
   - Deposit rows stuck in pending/refund-pending.
   - Notification retry depth.
   - Arrival/session conflicts.
   - Availability rejection rate.
10. Retain a kill switch that disables new public bookings while preserving dashboard access to existing reservations.

---

## Explicit Non-Goals for MVP

- Combined/movable table layouts.
- Recurring reservations.
- Multi-location centralized booking.
- Third-party reservation marketplace integrations.
- Dynamic overbooking/yield optimization.
- Marketing campaigns.
- Automated no-show marking.
- Non-Stripe deposits.
- Offline reservation creation without the separate local edge architecture.

These can be added after the core invariants and production behavior are proven.

---

## MVP Acceptance Criteria

The feature is ready only when all statements below are true:

- A restaurant cannot enable booking without valid table capacities and service periods.
- Public slots never expose internal table data.
- The database prevents overlapping active reservations on one table.
- Booking replay is idempotent.
- Cancellation releases capacity immediately and handles money independently.
- Provider redirect alone never confirms a deposit.
- Arrival creates exactly one `TableSession`.
- Session close records a reliable `closedAt`.
- Waitlist seating creates exactly one session.
- Confirmation/reminder delivery is durable and deduplicated.
- PII is absent from logs/public sockets and included in retention/export/deletion workflows.
- A committed sold-out item cannot be accepted by a later order.
- All required concurrency tests run against real PostgreSQL.

---

## Official Technical References

- PostgreSQL range types and exclusion constraints:
  https://www.postgresql.org/docs/current/rangetypes.html
- Prisma customized migrations for unsupported database features:
  https://docs.prisma.io/docs/orm/prisma-migrate/workflows/unsupported-database-features
- Stripe Checkout fulfillment and webhook-authoritative processing:
  https://docs.stripe.com/checkout/fulfillment
- Stripe Checkout Session expiry:
  https://docs.stripe.com/api/checkout/sessions/create
- Stripe webhook duplicate handling/signature verification:
  https://docs.stripe.com/webhooks
- Twilio Programmable Messaging:
  https://www.twilio.com/docs/messaging/api
