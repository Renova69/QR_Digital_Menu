# Reservation Requests + Allergens + Patron Tags — Phase 1 Implementation Plan

**Date:** 2026-07-02
**Supersedes for MVP scope:** `2026-06-30-reservations-waitlist-item-availability.md` (that plan is the long-horizon reference; this is the buildable Phase-1 slice)
**Product spec source:** `NEW_RESERVATION_SYSTEM.MD`
**Status:** Ready to implement after review sign-off.

---

## 1. Goal

Ship a **reservation request** system, not a table-management engine:

> Guest opens a branded `/book/:restaurantId` page → fills a clean form (name, mobile, optional email, date/time, adults, children, pet, dietary preferences, allergy notes, general notes) → sees an allergen summary pulled from that restaurant's menu → submits → owner/staff see the request in a dashboard tab with allergy/pet/children badges and cross-visit **patron tags** → accept / decline / cancel / mark no-show / mark arrived.

**Deliberately decoupled from `TableSession` and table status.** A reservation is future intent; it never opens a session, never marks a table occupied, never touches POS state. "ARRIVED" is a status label only.

### In scope (Phase 1)

- Public booking page + confirmation page.
- `Reservation`, `ReservationSettings`, `ReservationServiceHours`, minimal `Patron`, `ReservationEvent` (audit) models.
- Dashboard Reservations tab: daily list + status filters + actions + guest card + badges + staff tags + internal notes + manual booking.
- Allergen summary aggregated from the restaurant's active menu (**free-text**, no menu change).
- Cross-visit **staff patron tags** (VIP, often-late, …) via a minimal Patron matched by phone.
- Feature flag `reservations:enabled` (Professional + Enterprise).
- Realtime `reservation:created` / `reservation:updated` on the existing restaurant socket room.
- Realtime dashboard + optional guest confirmation email (Resend) when email present.
- i18n across all existing locales.
- GDPR handling for dietary/allergy (special-category data).

### Deferred (documented, not built now)

- **Phase 1.5:** guest manage/cancel link (M-PAY-1 token pattern), confirmation/reminder SMS, reminder-before scheduling, patron dedup/merge UI + history + no-show counters, CSV export, blackout dates, staff activity log, **EU-14 coded allergen vocabulary on `MenuItem`** (see §6, decision 1B).
- **Phase 2+:** per-slot cover limits as hard enforcement, optional manual table-assignment field, upcoming-reservation indicator on table cards, deposits + cancellation policy, waitlist, occupancy/turnover analytics.
- **Phase 3:** real table capacity model, table timeline, arrival→`TableSession` conversion, automated wait estimates, multi-location.

---

## 2. Locked product decisions

| Decision                 | Phase-1 value                                                                             | Rationale                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Entitlement              | `reservations:enabled`, Professional + Enterprise                                         | Matches existing `payments:stripe` flag convention                              |
| Booking URL              | `/book/:restaurantId`                                                                     | Same public-page convention as `/:restaurantId` menu                            |
| Required contact         | `guestName` + normalized E.164 `guestPhone`                                               | BG-first; email optional and never blocks booking                               |
| Phone default region     | BG / `+359`                                                                               | Reuse the E.164 normalization used by auth/Twilio                               |
| Party model              | `adultsCount` + `childrenCount`, `totalGuests = adults + children` derived                | Staff prep (high chairs); never trust client-sent total                         |
| Slot interval            | 30 min (setting, 10–120)                                                                  |                                                                                 |
| Availability             | Service hours + lead/horizon; **optional soft `maxCoversPerSlot`**                        | No tables in Phase 1; owner is the capacity arbiter via accept/decline          |
| Auto-confirm             | Setting, default OFF                                                                      | Owner decides per request in MVP                                                |
| Statuses                 | `PENDING → CONFIRMED / DECLINED`, `CONFIRMED → CANCELLED / NO_SHOW / ARRIVED`             | Simple, guarded, no session coupling                                            |
| Allergen vocabulary (P1) | **Aggregate existing free-text `MenuItem.allergens` / `dietaryTags`**                     | The field already exists as free text; coded EU-14 is a separate menu task (1B) |
| Patron tags              | Cross-visit **staff-only** tags on a minimal `Patron` matched by `(restaurantId, phone)`  | Only staff-side; never sent to guest or any public/table socket                 |
| Customer preferences     | Controlled set stored **per-reservation** (`customerPreferences[]`) + free `allergyNotes` | Special-category data → consent required (§6)                                   |
| Time storage             | UTC instants; slots interpreted in `Restaurant.timezone` (Luxon)                          | Matches happy-hour logic                                                        |
| Currency/deposits        | None in Phase 1                                                                           | Deposits deferred                                                               |
| Table coupling           | None                                                                                      | Reservations stay decoupled from `TableSession`/table status                    |

Reservations are **disabled by default**. A restaurant cannot enable booking until settings + at least one service-hours row exist.

---

## 3. What already exists — reuse, do not rebuild

| Need                         | Existing asset                                                                                             | File(s)                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Menu allergens/dietary       | `MenuItem.allergens String[]`, `dietaryTags String[]` (free text), owner Create/Edit UI, public **filter** | `schema.prisma:306-307`, `menu/EditItemForm.tsx`, `menu/CreateItemForm.tsx`, `menu/FilterPanel.tsx` |
| Public page conventions      | Branding, `restaurantId` URL, visitor id                                                                   | `pages/PublicMenuPage.tsx`, `lib/visitorId.ts`                                                      |
| Feature gating               | `FeatureService` / `FeatureGuard` / `RequireFeature`                                                       | `subscription/*`                                                                                    |
| Restaurant-scoped authz      | `verifyRestaurantAccess` (OWNER/MANAGER), staff role checks                                                | `payment/core/payment-core.service.ts`, `menu/menu-crud.service.ts`                                 |
| Realtime room                | `emitToRestaurant(restaurantId, event, payload)`                                                           | `events/events.gateway.ts`                                                                          |
| Timezone                     | Luxon + `Restaurant.timezone`                                                                              | `orders/orders.service.ts` (happy-hour)                                                             |
| Phone E.164                  | Auth/Twilio normalization                                                                                  | `auth/auth.service.ts`                                                                              |
| Guest email                  | Resend HTTP send                                                                                           | `auth/auth.service.ts` (`issueEmailVerificationCode`)                                               |
| Public POST without CSRF 403 | `csrf-exempt.ts` allowlist (like `/orders`)                                                                | `common/security/csrf-exempt.ts`                                                                    |
| DTO validation discipline    | class-validator + `@Min/@Max/@IsOptional`                                                                  | `restaurants/dto/update-restaurant.dto.ts`                                                          |
| Manage-token pattern (P1.5)  | fragment + POST-exchange + SHA-256 + httpOnly cookie                                                       | `payment/table-session-token.decorator.ts`, `lib/tableSessionCredential.ts`                         |
| Additive migration style     | `IF NOT EXISTS`, mirror `@@index`, Neon/PgBouncer notes                                                    | `prisma/migrations/20260702090000_add_refund_attempt/migration.sql`                                 |

---

## 4. Data model

### 4.1 New enums

```prisma
enum ReservationStatus {
  PENDING      // request awaiting owner decision
  CONFIRMED    // accepted (or auto-confirmed)
  DECLINED     // owner rejected a pending request
  CANCELLED    // cancelled after confirmation (guest or restaurant)
  NO_SHOW      // manually marked, after start time
  ARRIVED      // manually marked; NO TableSession created
}

enum ReservationSource {
  PUBLIC       // /book form
  STAFF        // manual dashboard entry
}

enum ReservationOccasion {
  NONE
  BIRTHDAY
  ANNIVERSARY
  BUSINESS
  FAMILY
  OTHER
}
```

Customer preferences and staff tags are stored as validated `String[]` (Postgres text arrays, consistent with `MenuItem.allergens`) against these fixed application-level sets — not DB enums, so adding a value later needs no migration:

- **`CUSTOMER_PREFERENCES`** (guest self-select): `VEGAN`, `VEGETARIAN`, `GLUTEN_INTOLERANT`, `LACTOSE_INTOLERANT`, `NUT_ALLERGY`, `PET`, `HIGH_CHAIR`, `QUIET_TABLE`.
- **`STAFF_PATRON_TAGS`** (staff-only): `VIP`, `REGULAR`, `WINE_LOVER`, `OFTEN_LATE`, `NO_SHOW_RISK`, `PREFERS_TERRACE`, `PREFERS_WINDOW`, `NEEDS_CALL_CONFIRMATION`. (No `LOW_SPENDER`/`HIGH_SPENDER` — biased manual labels; leave spend to future analytics.)

Both sets live in one shared constants module (`reservations/reservation-tags.ts`) imported by DTO validation, frontend chips, and tests, so the vocabulary can't drift.

### 4.2 `Reservation`

```
id                  cuid
restaurantId        FK -> Restaurant (cascade)
patronId            FK -> Patron? (nullable, SetNull)
referenceCode       unique, human-readable, NOT a secret
source              ReservationSource
status              ReservationStatus @default(PENDING)

guestName           String
guestPhone          String            // normalized E.164
guestEmail          String?

startsAt            DateTime          // UTC instant of the requested slot
occasion            ReservationOccasion @default(NONE)
adultsCount         Int
childrenCount       Int  @default(0)
// totalGuests is derived (adults + children); do not store a client value

customerNotes       String?           // guest free text
internalNotes       String?           // STAFF ONLY — never in public responses/sockets
customerPreferences String[]          // validated subset of CUSTOMER_PREFERENCES
allergyNotes        String?           // special-category free text (§6)
dietaryConsentAt    DateTime?         // set only when guest ticks the consent box

createdById         String?           // staff user for manual bookings
createdAt / updatedAt
```

Indexes / checks:

- `@@index([restaurantId, startsAt])`, `@@index([restaurantId, status, startsAt])`, `@@index([patronId])`.
- `@@unique([restaurantId, referenceCode])`.
- Optional idempotency: `@@unique([restaurantId, idempotencyKey])` with `idempotencyKey String?` to make public submit retry-safe.
- App validation: `adultsCount BETWEEN 1 AND 50`, `childrenCount BETWEEN 0 AND 50`, `adults + children <= maxTotalGuests`.

### 4.3 `Patron` (minimal — cross-visit staff tags only)

```
id             cuid
restaurantId   FK -> Restaurant (cascade)
phone          String        // normalized E.164
name           String
email          String?
staffTags      String[]      // validated subset of STAFF_PATRON_TAGS
staffNotes     String?       // STAFF ONLY
createdAt / updatedAt

@@unique([restaurantId, phone])
@@index([restaurantId])
```

Matched or created by `(restaurantId, phone)` on every reservation create. Phase 1 gives cross-visit tags immediately; **history, no-show counters, dedup/merge UI = Phase 1.5.** Patron rows carry **no** dietary/allergy data — that stays per-reservation.

### 4.4 `ReservationSettings` (one per restaurant)

```
restaurantId          unique FK
enabled               Boolean @default(false)
slotIntervalMinutes   Int  @default(30)   // 10..120
minLeadMinutes        Int  @default(60)   // 0..10080
bookingHorizonDays    Int  @default(60)   // 1..365
maxTotalGuests        Int  @default(12)   // 1..50
maxCoversPerSlot      Int?                // null = unlimited soft cap
autoConfirm           Boolean @default(false)
requirePhone          Boolean @default(true)
allergenSectionEnabled Boolean @default(true)
notifyEmail           String?            // owner notification address
notifyPhone           String?
createdAt / updatedAt
```

### 4.5 `ReservationServiceHours`

```
id            cuid
restaurantId  FK
weekday       Int          // ISO 1..7
openMinute    Int          // minutes from local midnight, 0..1439
lastSlotMinute Int         // last bookable slot start
@@unique([restaurantId, weekday])   // one window per day in Phase 1
```

(Multiple windows/day = later. One row/day keeps Phase 1 simple.)

### 4.6 `ReservationEvent` (append-only audit)

```
id             cuid
reservationId  FK (cascade)
type           String   // CREATED, CONFIRMED, DECLINED, CANCELLED, NO_SHOW, ARRIVED, PATRON_TAGGED, NOTE_UPDATED
actorUserId    String?
metadata       Json?    // non-secret context only
createdAt
@@index([reservationId, createdAt])
```

### 4.7 `Restaurant`

Add reverse relations only (`reservations`, `reservationSettings`, `reservationServiceHours`, `patrons`). No new scalar field group on `Restaurant`.

### 4.8 Allergen summary — **no schema change**

Aggregate on read from the active menu:

```
menuItem.findMany({
  where: { category: { restaurantId }, isOutOfStock: false },
  select: { allergens: true, dietaryTags: true },
})
```

→ distinct, case-normalized union of `allergens` and `dietaryTags`. Returned by the public config endpoint. Labels are owner-authored free text (may be inconsistent) — acceptable for Phase 1; §6 decision 1B standardizes later.

---

## 5. Migration

Single additive migration `<ts>_reservations_phase1`:

- Create enums, tables, indexes, unique constraints, FKs (cascade / SetNull as above).
- All `IF NOT EXISTS` / guarded where the tooling requires; mirror every raw index with an `@@index` in `schema.prisma` (no drift).
- `prisma generate`.
- Neon/PgBouncer: additive only; deploy via the established `migrate deploy` path (or `db push` if history drift blocks it), same as the refund-attempt migration.

**Exit:** clean apply on an empty DB + a production-shaped copy; `prisma migrate diff` clean vs `schema.prisma`.

---

## 6. Privacy / GDPR (special-category data)

Dietary preferences + allergy notes can reveal health data (GDPR special category). Non-negotiable:

1. **Consent:** the form's dietary/allergy block requires an explicit checkbox ("I consent to the restaurant storing this to serve me safely"). Backend only persists `customerPreferences`/`allergyNotes` when `dietaryConsentAt` is set; otherwise those fields are dropped.
2. **Minimal + purpose-bound:** never used for marketing; transactional only.
3. **No logging:** `allergyNotes`, `customerNotes`, `internalNotes`, phone, and email must never appear in request/exception logs — extend the existing redaction (`common/logging/redact-path.ts` covers URLs; add a body-field denylist for reservation payloads).
4. **Never leak staff-side data:** `internalNotes`, `staffTags`, `staffNotes`, `notifyEmail/Phone` must be absent from every public response and every socket payload that can reach a guest.
5. **Retention/delete:** owner can delete a reservation (hard delete or anonymize contact while keeping aggregate counts). Add reservation + patron data to any existing user export/deletion workflow.

**Decision 1B (deferred):** introduce controlled EU-14 allergen codes + `dietaryFlags` on `MenuItem`, owner UI, and a free-text→code migration. Standardizes both the reservation summary and the existing public-menu filter. Tracked as a separate **menu-platform** task, not part of Phase 1 reservations.

---

## 7. Availability (no tables)

```
searchAvailability(restaurantId, localDate, adults, children)
```

1. Load `ReservationSettings` (must be `enabled`) + `Restaurant.timezone`.
2. Reject `localDate` outside `[now + minLeadMinutes, now + bookingHorizonDays]`.
3. Load `ReservationServiceHours` for that weekday; generate slot starts from `openMinute` to `lastSlotMinute` at `slotIntervalMinutes`.
4. Convert each local slot to a UTC instant with Luxon; skip nonexistent DST times.
5. Reject if `adults + children > maxTotalGuests`.
6. If `maxCoversPerSlot` set: subtract covers already booked (sum `adults+children` of `PENDING`/`CONFIRMED` reservations whose `startsAt` == slot); drop full slots. If unset: all in-hours slots are offered (owner arbitrates via accept/decline).
7. Return start instants + localized labels only. **No table/occupancy data.**

Server recomputes availability on submit; never trusts the earlier search response.

---

## 8. State machine

```
PENDING --accept--> CONFIRMED        (auto if autoConfirm)
PENDING --decline--> DECLINED
CONFIRMED --cancel--> CANCELLED       (guest P1.5 / restaurant now)
CONFIRMED --after start, mark--> NO_SHOW
CONFIRMED --mark--> ARRIVED           (label only; no TableSession)
```

No backward transitions. Every mutation uses a guarded predicate (`WHERE id = ? AND status = ?`) and appends a `ReservationEvent`. Controllers never write status directly — go through a `reservation.executeAction(action, actor)` seam.

---

## 9. Backend — module, endpoints, authorization

New module `apps/backend/src/reservations/`, registered in `app.module.ts`. All endpoints verify restaurant ownership/assignment server-side; a body `restaurantId` is never sufficient.

### Public (`PublicReservationsController`, throttled, CSRF-exempt)

| Method | Route                                                                     | Purpose                                                      |
| ------ | ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| GET    | `/reservations/public/:restaurantId/config`                               | enabled flag, branding summary, policy, **allergen summary** |
| GET    | `/reservations/public/:restaurantId/availability?date=&adults=&children=` | slots                                                        |
| POST   | `/reservations/public/:restaurantId`                                      | create request (idempotency key; consent-gated dietary)      |
| GET    | `/reservations/public/status/:referenceCode`                              | non-secret status for confirmation page                      |

- Add `POST /api/v1/reservations/public/:restaurantId` to `csrf-exempt.ts` **with rationale** (public, unauthenticated, no ambient cookie — same class as `/orders`), and update `csrf-exempt.spec.ts`.
- Throttle availability + create + status independently (`@Throttle`), tighter than menu reads.
- Gate behind `reservations:enabled` via `FeatureGuard` on the restaurant.

### Dashboard (`ReservationsController`, `JwtAuthGuard` + roles)

| Method          | Route                                                              | Roles                         |
| --------------- | ------------------------------------------------------------------ | ----------------------------- |
| GET/PUT         | `/reservations/:restaurantId/settings`                             | OWNER, MANAGER                |
| GET/POST/DELETE | `/reservations/:restaurantId/service-hours`                        | OWNER, MANAGER                |
| GET             | `/reservations/:restaurantId` (date + status filters)              | OWNER, MANAGER, WAITER, STAFF |
| POST            | `/reservations/:restaurantId/manual`                               | OWNER, MANAGER, WAITER        |
| POST            | `/reservations/:id/action` (accept/decline/cancel/no-show/arrived) | role checked per action       |
| PATCH           | `/reservations/:id/internal` (internalNotes, patron staffTags)     | OWNER, MANAGER, WAITER        |

Action authorization:

- accept / decline / cancel / settings / service-hours: OWNER or MANAGER.
- mark arrived / manual create: OWNER, MANAGER, WAITER.
- mark no-show: OWNER, MANAGER, WAITER, only after `startsAt`.
- **KITCHEN:** no reservation access at all (receives no guest PII).
- SUPER_ADMIN: existing support-access policy.

Reuse the `verifyRestaurantAccess`-style ownership check; do not reinvent role logic.

---

## 10. Frontend

### Public booking page — `apps/frontend/src/pages/BookingPage.tsx` (route `/book/:restaurantId` in `App.tsx`)

Mobile-first, branded like `PublicMenuPage`, keyboard accessible, restaurant-local time with timezone label. Steps:

1. Restaurant logo/name/address/phone + policy summary.
2. Adults + children (total auto-calculated).
3. Date → available time slots.
4. Name, mobile (E.164, `+359` default), optional email.
5. Pet checkbox, dietary-preference chips, allergy/intolerance notes — **behind the consent checkbox**.
6. General notes.
7. **Allergen information section at the bottom** (from config summary) + "View full menu" link to `/:restaurantId`.
8. Submit → confirmation page with reference code + status + restaurant contact.

Behaviors: disappearing slot preserves the form and re-asks; draft saved locally **excluding** allergy/notes; offline shows saved form but disables submit until revalidated.

### Confirmation page — reference, status, restaurant contact. (Manage/cancel link = Phase 1.5.)

### Dashboard — `pages/Dashboard/ReservationsView.tsx` (+ tab in `DashboardPage.tsx`, feature-locked)

- Today / tomorrow / date filter + status filters.
- Daily **list of cards** (no timeline in Phase 1).
- Card: name, phone (call/copy), adults/children/total, time, occasion, **allergy/dietary badges**, **pet badge**, **staff patron tags**, customer notes.
- Side panel/actions: accept / decline / cancel / no-show / arrived, edit internal notes, edit patron staff tags.
- Manual booking form (staff).
- Realtime updates via `reservation:created` / `reservation:updated`.

### Settings — `components/reservations/ReservationSettings.tsx` (Settings tab)

Enable/disable, booking URL display, service hours per weekday, interval/lead/horizon, max total guests, optional max covers/slot, auto-confirm, require-phone, allergen section toggle, owner notification email/phone. Enable button disabled until settings + ≥1 service-hours row exist; shows exact missing config.

### Types/services/hooks

`types/reservations.ts`, `services/reservationService.ts`, `hooks/useReservations.ts`. Extend `useFeature.ts` + PricingPage copy for `reservations:enabled`.

---

## 11. Socket events

Existing private restaurant room only:

- `reservation:created` — summary (id, referenceCode, status, startsAt, guestName, totals). **No** dietary/allergy/internal notes.
- `reservation:updated` — id, status, actor summary.

Emit **after commit**. Payloads are summaries; clients refetch details. Never emit guest contact, dietary, allergy, internal notes, or staff tags to any room reachable by a guest. Add `emitReservationCreated/Updated` to `EventsGateway` mirroring the payment-event helpers.

---

## 12. Notifications (Phase 1 minimal)

- **Owner/staff:** realtime socket + dashboard badge (no external send needed).
- **Guest (optional):** if `guestEmail` present, send a confirmation email via the existing Resend path on accept/auto-confirm and on decline/cancel. HTML fields auto-escaped. Restaurant language, English fallback.
- **Deferred (1.5):** SMS (Twilio), reminders-before, durable outbox + retry worker. Phase 1 sends directly (like OTP email); reminders need a new `@nestjs/schedule` cron (currently only in `loyalty.module`) so they wait.

---

## 13. i18n

Add reservation/booking/allergen/patron/settings keys to **every existing locale file** (`locales/{en,bg,ro,de,es,fr,it,zh,el,ja,ru,ar}/translation.json`). Guest-facing copy uses the public-menu language selection; dashboard operational text follows `dashboardLanguage`. Keep the existing UI-chrome vs DeepL separation — reservation UI strings live in locale files, never sent to DeepL.

---

## 14. Security & abuse

- Independent throttles on availability, create, status.
- Public create is CSRF-exempt (documented) but strictly DTO-validated; escalate to a lightweight bot check after repeated failed booking attempts, not on every booking.
- Validate all inputs (class-validator): party bounds, preference/tag membership against the shared constants, phone E.164, email format, note length caps.
- Never trust client `totalGuests`, `status`, `patronId`, or price-like fields.
- No PII in logs (§6.3); staff-only data never leaves the dashboard scope.
- Reservation status changes are guarded compare-and-swap; concurrent double-accept yields one transition.

---

## 15. File impact map

### Create — backend

```
apps/backend/src/reservations/reservations.module.ts
apps/backend/src/reservations/public-reservations.controller.ts
apps/backend/src/reservations/reservations.controller.ts
apps/backend/src/reservations/reservations.service.ts          // executeAction seam + state machine
apps/backend/src/reservations/reservation-availability.ts
apps/backend/src/reservations/reservation-allergens.ts         // menu aggregate
apps/backend/src/reservations/patron.service.ts                // match-by-phone + staff tags
apps/backend/src/reservations/reservation-tags.ts              // shared vocab constants
apps/backend/src/reservations/dto/*.ts
apps/backend/src/reservations/*.spec.ts
```

### Create — frontend

```
apps/frontend/src/pages/BookingPage.tsx
apps/frontend/src/pages/BookingConfirmationPage.tsx
apps/frontend/src/pages/Dashboard/ReservationsView.tsx
apps/frontend/src/components/reservations/ReservationCard.tsx
apps/frontend/src/components/reservations/ReservationSettings.tsx
apps/frontend/src/components/reservations/PatronTags.tsx
apps/frontend/src/components/reservations/AllergenSummary.tsx
apps/frontend/src/services/reservationService.ts
apps/frontend/src/hooks/useReservations.ts
apps/frontend/src/types/reservations.ts
```

### Modify

```
apps/backend/prisma/schema.prisma
apps/backend/prisma/migrations/<ts>_reservations_phase1/migration.sql
apps/backend/src/app.module.ts
apps/backend/src/events/events.gateway.ts
apps/backend/src/subscription/feature-flag.enum.ts
apps/backend/src/subscription/feature.service.ts
apps/backend/src/common/security/csrf-exempt.ts (+ .spec.ts)
apps/backend/src/common/logging/<body redaction denylist>
apps/frontend/src/App.tsx
apps/frontend/src/pages/DashboardPage.tsx
apps/frontend/src/hooks/useFeature.ts
apps/frontend/src/pages/PricingPage.tsx
apps/frontend/src/locales/*/translation.json
```

---

## 16. Sequenced tasks (small, reviewable commits)

- **T0 — Prereqs:** confirm migrations apply clean to empty + prod-shaped DB. (Real-Postgres concurrency harness only needed once we add any uniqueness race; Phase 1 has few.)
- **T1 — Schema + migration:** enums, models, relations, indexes, feature flag. **Exit:** clean apply + `migrate diff` clean.
- **T2 — Settings + service hours:** endpoints + dashboard Settings tab + readiness validator + flag/pricing copy. **Exit:** booking stays disabled until config valid.
- **T3 — Availability engine:** timezone-safe slot generation + lead/horizon/hours + optional soft cover cap + public config (incl. allergen summary) + availability endpoints. **Exit:** correct slots for Europe/Sofia DST.
- **T4 — Booking core:** idempotent create, consent-gated dietary, patron match-by-phone, state machine + audit, public booking + confirmation pages, `reservation:created`. **Exit:** replayed idempotency key creates one reservation.
- **T5 — Dashboard operations:** tab, daily list, filters, cards with badges + staff tags, actions (accept/decline/cancel/no-show/arrived), internal notes, manual booking, `reservation:updated`. **Exit:** staff run a full day from the dashboard.
- **T6 — Notifications + i18n + privacy:** optional guest confirmation email, all locale keys, log redaction denylist, retention/delete + export hooks. **Exit:** no PII in logs; guest emails escaped/localized.
- **T7 — Staging rollout:** seed a pilot restaurant, enable flag for staging, verify DST/consent/authz, expand behind flag after a full operating week.

---

## 17. Test matrix

**Availability:** lead/horizon bounds; weekday hours; interval generation; DST spring-forward skipped, fall-back unambiguous; over-`maxTotalGuests` rejected; soft cover cap fills a slot.
**Booking:** idempotency replay = one reservation; consent absent → dietary dropped; phone normalization; preference/tag membership enforced; cross-restaurant `restaurantId` injection rejected; patron matched vs created by phone.
**State/roles:** every allowed transition; forbidden backward transitions; no-show before/after start; KITCHEN denied all reservation endpoints; cross-restaurant read/update denied; staff-only fields absent from public responses + sockets.
**Allergens:** summary aggregates distinct free-text values from active (non-out-of-stock) items only; empty menu → empty section; disabled toggle hides section.
**Notifications/i18n:** confirmation email HTML-escaped, correct language + English fallback; locale key parity across all files.
**Privacy:** `allergyNotes`/notes/phone/email never in logs; retention delete removes/anonymizes correctly.

---

## 18. Rollout & migration safety

1. Ship schema with `ReservationSettings.enabled = false` defaults; backend tolerates absent settings before frontend controls deploy.
2. No backfill of existing tables/sessions (Phase 1 is decoupled).
3. Enable feature flag for staging only; configure one pilot restaurant; verify consent, DST, authz manually.
4. Kill switch = per-restaurant `enabled=false` disables new public bookings while dashboard keeps managing existing ones.
5. Monitor: booking submit errors, availability rejection rate, notification failures, authz denials.

---

## 19. Acceptance criteria

- A restaurant cannot enable booking without settings + ≥1 service-hours row.
- Public slots expose no table/occupancy/internal data.
- Booking submit is idempotent; consent gates dietary/allergy storage.
- Reservation lifecycle is guarded; no backward transitions; concurrent double-accept yields one transition.
- Staff patron tags and internal notes never reach the guest form, public responses, or guest-reachable sockets.
- Allergen summary reflects the restaurant's active menu with zero menu-schema changes.
- No reservation touches `TableSession` or table status.
- Guest PII absent from logs; included in retention/export/delete.
- Reservations gated to Professional/Enterprise via `reservations:enabled`.

---

## 20. Deferred (explicit non-goals for Phase 1)

Manage/cancel link, SMS, reminders, durable outbox, patron history/dedup/merge, CSV export, blackout dates, EU-14 coded allergens (1B), per-slot hard cover limits, table assignment, upcoming-reservation table indicators, deposits/cancellation policy, waitlist, occupancy/turnover analytics, arrival→`TableSession`, multi-location.

---

## 21. References

- Reservation long-horizon reference: `docs/superpowers/plans/2026-06-30-reservations-waitlist-item-availability.md`
- Product spec: `NEW_RESERVATION_SYSTEM.MD`
- Refund/idempotency pattern to reuse if deposits are added later: `apps/backend/src/payment/providers/stripe-checkout.service.ts` (RefundAttempt, F-PAY-1 v2)
- Manage-token pattern for Phase 1.5: `apps/backend/src/payment/table-session-token.decorator.ts`, `apps/frontend/src/lib/tableSessionCredential.ts`
