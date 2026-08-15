# Tenant Vanity URLs — Path-Based Slugs

**Date:** 2026-08-15
**Status:** Design approved after review. Not started.
**Scope:** Path-based `/m/<slug>` only. Subdomains are explicitly **out of scope** — see
_Forward compatibility_.
**Related:** `apps/frontend/src/lib/menuUrl.ts`, `apps/frontend/src/hooks/usePublicMenuData.ts`,
`apps/backend/src/restaurants/restaurants.service.ts` (`findOneForManagement`)

---

## Problem

Every restaurant's public menu is reachable only by opaque cuid:

```
https://<app-origin>/menu/public/cmf3k9x2b0001qw8h7d2n4p6t?table=5
```

Owners want a branded, speakable URL. That URL goes on table tents, business cards,
Instagram bios, and Google Business listings, so it is customer-facing brand surface,
not a developer convenience.

### Decision: path-based `/m/<slug>`

Ships the entire tenant-identity subsystem — slug, transliteration, namespace,
resolution, URL construction, merchant UI — with **no** wildcard DNS, no TLS work, no
CORS changes, no cookie-domain changes, no payment-origin changes, and without touching
the pinned Socket.IO origin allowlist (`events.gateway.ts`, `C-2`).

This is an architectural extension, not a rewrite. A single `RestaurantSlugService`
encapsulates the namespace; payment, ordering, menu, and tenant architecture are
unchanged.

### Why not subdomains

Subdomains require a purchased domain, wildcard DNS, wildcard TLS (which on Vercel
requires their nameserver method), and — because Vercel's Hobby plan is restricted to
non-commercial personal use — likely paid commercial hosting. Under a no-additional-cost
constraint, that is out of scope. See _Forward compatibility_ for the constraints this
design retains so subdomains stay cheap later.

### Non-goals

- Subdomains, wildcard DNS, and per-tenant custom domains.
- Server-side rendering or prerendering. See _Known limitations_.
- Any change to authentication, dashboard, POS, or staff URLs.

---

## Decisions

| Question             | Decision                           | Rationale                                                                                                                                                                         |
| -------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URL shape            | `/m/<slug>` (namespaced)           | Bare `/<slug>` shares the first path segment with every current and future top-level route, making the blacklist a permanent tax on adding routes. `/m/` has zero collision risk. |
| Who gets a slug      | All tiers                          | No gate logic, no downgrade edge cases, stable QR codes for every tenant from day one.                                                                                            |
| Resolver shape       | Cheap: slug → id                   | The frontend deliberately loads meta first, then batches category items. A full-menu-by-slug endpoint would fight that. See Section 3.                                            |
| Slug changes         | Permanent alias, never evicted     | Old slugs keep resolving so printed QR codes never break.                                                                                                                         |
| Rename limiting      | Commit model, then 14-day cooldown | Onboarding fiddling and genuine rebrands are different populations. See Section 2.                                                                                                |
| QR ↔ slug safety     | Commit is a **precondition**       | QR rendering requires a committed slug. Not export telemetry, which is unreliable by construction. See Section 2.                                                                 |
| Slug release         | Tombstone, super-admin re-claim    | A released slug returning to the claimable pool is a QR-hijacking vector.                                                                                                         |
| Rename/release authz | OWNER only, dedicated endpoint     | The existing `findOneForManagement` seam grants MANAGER. A DTO field would silently inherit that. See Section 5.                                                                  |
| Slug case            | Lowercase, DB-enforced             | Rejected (not coerced) at the DTO, normalized on read, `CHECK (slug = lower(slug))` in the DB.                                                                                    |
| `Restaurant.slug`    | Denormalized                       | Public menu is the hottest endpoint. Guarded by a single writer plus an invariant test.                                                                                           |
| Bulgarian `-ия`      | Transliterate to `-ia`             | Deterministic product convention matching the State Gazette table. Not a legal requirement on trade names.                                                                        |
| Redirects            | None server-side                   | Aliases correct client-side; legacy IDs serve 200 with a canonical tag.                                                                                                           |

---

## Section 1 — Data model

### The namespace constraint

A retired slug and a live slug must never be claimable by two different restaurants. Two
tables with separate unique indexes cannot enforce that — it would rely on an
application-level check that races under concurrent signups. **One table owns the
namespace.**

```prisma
model RestaurantSlug {
  slug         String     @id                    // PK == the global namespace
  restaurantId String
  isPrimary    Boolean    @default(false)
  committedAt  DateTime?                         // null => uncommitted (grace); see Section 2
  releasedAt   DateTime?                         // tombstone => 410, never re-claimable
  createdAt    DateTime   @default(now())
  restaurant   Restaurant @relation(fields: [restaurantId], references: [id], onDelete: Cascade)

  @@index([restaurantId])
}
```

Two constraints Prisma cannot express, added as raw SQL in the migration:

```sql
-- at most one primary per restaurant
CREATE UNIQUE INDEX "RestaurantSlug_one_primary"
  ON "RestaurantSlug"("restaurantId") WHERE "isPrimary";

-- the lowercase invariant is a database fact, not an app convention
ALTER TABLE "RestaurantSlug" ADD CONSTRAINT "RestaurantSlug_slug_lowercase"
  CHECK (slug = lower(slug));
```

### What the database actually guarantees

Stated precisely, because an earlier draft overstated this:

- **Database guarantee:** every slug is globally unique across live, retired, and
  tombstoned; **at most one** primary per restaurant; no slug is ever stored with
  uppercase characters.
- **Application guarantee:** every active restaurant **has** a primary slug. A partial
  unique index constrains _at most_ one — it cannot require _at least_ one. That
  invariant is upheld by the creation and rename transactions, verified by the backfill
  (Section 7), and protected by an ongoing invariant test (Section 8).

`CHECK` is preferred over `citext` or a case-insensitive collation: citext adds an
extension dependency, and non-deterministic collations interact badly with primary-key
indexes.

### Denormalized read copy

```prisma
model Restaurant {
  slug String? @unique   // see Section 7 — stays nullable until a later migration
}
```

`Restaurant.slug` mirrors the current primary, because the public menu response needs the
restaurant's own canonical URL and that endpoint is the hottest public path in the app.

The redundancy is contained by:

- a single writer — `RestaurantSlugService` is the only code permitted to write either
  table, and both writes always happen in one `$transaction`
- an invariant test asserting `Restaurant.slug` always equals the row where
  `isPrimary = true`, for every active restaurant

---

## Section 2 — Rename, commit, and the QR guarantee

### The problem this section exists to solve

The printed-QR guarantee is the load-bearing promise of this design: **a QR code that has
been printed must never stop resolving.** Aliases deliver that for committed slugs. The
question is what happens during onboarding, when an owner is still trying names.

An earlier draft ended a time-based grace window when "a QR code was exported." **That
signal does not exist and cannot be made reliable.** QR download at
`QrCodeModal.tsx:47` is entirely client-side — the canvas is redrawn, `toDataURL()` is
called, and an `<a download>` is clicked. The backend receives nothing. Adding an export
beacon would not fix it: a fire-and-forget call can fail or be offline while the download
still succeeds, so the invariant would rest on a signal that is unreliable exactly when it
matters.

### The commit model

Invert it. Instead of observing whether a QR was made, make a committed slug a
**precondition** for making one.

A slug is in one of two states:

**Uncommitted** (`committedAt IS NULL`). Changes are _edits_, not renames. **No alias row
is created** — the old slug returns to the pool immediately. Nothing external references
it, so nothing is preserved and nothing is burned.

**Committed** (`committedAt` set). Every change creates a permanent alias, under a
**14-day cooldown**.

### What commits a slug

Commit is an explicit, synchronous, idempotent server transition:

```
POST /restaurants/:id/slug/commit     → 200 { slug, committedAt }
```

It is called by:

1. **The QR flow, as a blocking precondition.** Opening the QR or print view calls commit
   and **does not render the code until the server confirms.** If the call fails, the QR
   is not shown. This is the correct friction: a QR whose URL might still change must not
   be printable.
2. **Automatically, on first external activity** — any of `MenuView`, `Order`, or
   `Reservation` count transitioning above zero. All three are already persisted
   server-side, so these are observations of durable state, not telemetry.
3. **Automatically, 24h after `restaurant.createdAt`**, as a backstop.

None of the activity signals is implied by the others: a POS order (`OrderSource.POS`) is
created by staff with no public menu load, and a reservation arrives through
`/book/:restaurantId`, which never touches the slug at all.

### Why this is stronger than export tracking

|                    | Export beacon           | Commit precondition           |
| ------------------ | ----------------------- | ----------------------------- |
| Signal source      | Best-effort client call | Synchronous server transition |
| Fails when offline | Yes — QR still prints   | No — QR does not render       |
| Invariant          | Inferred                | Enforced                      |
| Extra round trips  | One per download        | One, first time only          |

The governing principle: **closing the uncommitted window early is always the safe
direction.** A false positive costs an owner a 14-day cooldown they could have skipped; a
false negative costs a broken printed QR code.

### Rename transaction (committed slugs)

One transaction:

1. current primary row → `isPrimary = false` (becomes an alias, stays resolvable)
2. insert new row, `isPrimary = true`, `committedAt` set
3. update `Restaurant.slug`

**Aliases are never evicted.** An earlier draft capped retention at 5 per restaurant.
That was wrong on both sides: it did not prevent hoarding (an attacker registers more
free accounts rather than renaming one repeatedly — that is an account-level abuse
problem), and it sacrificed the one invariant that is genuinely unrecoverable, since QR
codes reach physical media that cannot be reissued.

### Collision handling under concurrency

Availability checks are **advisory only**. The authoritative check is the unique index at
write time.

`generateSlug()` produces deterministic suffixes (`-2`, `-3`, …, never random) on
collision, and the write path must **retry on unique-constraint violation with a bounded
attempt count** (suggest 5), recomputing the suffix each time. Without retry, two
simultaneous signups deriving the same base slug cause one legitimate request to fail
unpredictably; the index prevents corruption but does not by itself produce a correct
outcome. Exhausting the retry budget returns a clear error, not a silent fallback.

---

## Section 3 — Slug generation and validation

### Replacing the existing helper

`toSlug()` exists in three copies — `apps/frontend/src/lib/menuExport.ts:81`,
`analyticsExport.ts`, `paymentsExport.ts`:

```js
.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
```

`Бистро Оранж` → `""`. Every Cyrillic name collapses to an empty string — already a live
cosmetic bug, since Bulgarian restaurants get `menu-export--2026-08-15.xlsx` today. All
three call sites migrate to the new shared util.

### Bulgarian transliteration

Mapping follows the official State Gazette transliteration table, adopted here as a
**deterministic product convention** because it matches the spelling owners already see
on their own documents. This does not imply any legal requirement on how a restaurant
trade name must be rendered.

```
а→a   б→b   в→v   г→g   д→d   е→e   ж→zh  з→z   и→i   й→y
к→k   л→l   м→m   н→n   о→o   п→p   р→r   с→s   т→t   у→u
ф→f   х→h   ц→ts  ч→ch  ш→sh  щ→sht ъ→a   ь→y   ю→yu  я→ya
```

Word-final `-ия` → `-ia`. `Пицария` → `pitsaria`.

**Do not substitute a generic ISO-9 library.** Two divergences make it wrong for
Bulgarian: `ъ→a` (ISO-9 gives `ŭ`/`ǎ`) and `щ→sht`. Hand-rolled table, ~30 lines, fully
unit testable, no dependency.

### Pipeline

1. NFD normalize, strip combining marks — handles Romanian `ă ș ț` and Latin diacritics
2. Cyrillic → Latin, applying the word-final `-ия` rule
3. lowercase
4. non-`[a-z0-9]` → hyphen
5. collapse repeated hyphens, trim leading and trailing
6. truncate to 40 chars **at a hyphen boundary**
7. empty, all-numeric, or `xn--` prefix → fallback `restaurant-<6 chars of id>`
8. blacklist check
9. collision → deterministic `-2`, `-3`, … with bounded retry (Section 2)

```
Бистро Оранж      → bistro-oranzh
Restaurant OWEN   → restaurant-owen
Пицария Щастие    → pitsaria-shtastie
Café Münchén      → cafe-munchen
🍕🍕🍕            → restaurant-cmf3k9
```

### Validation

Enforced server-side in the DTO, per this repo's class-validator-at-the-boundary
convention. **Never UI-only.**

```ts
@Length(2, 40)
@Matches(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/)
```

**Length is a separate constraint, not folded into the regex.** The earlier single-regex
form (`{0,38}` with an optional trailing group) accepted the one-character slug `a`
despite a stated 2–40 rule. Splitting them makes the bound correct and produces a clearer
validation message.

Additionally rejected:

- `xn--` prefix (reserved for punycode)
- all-numeric (ambiguous with IDs; `/m/12345` reads as an internal identifier)
- anything on the blacklist

### The regex is also the homoglyph defense

**Do not relax `[a-z0-9-]` to accommodate international names.** The ASCII-only character
class makes it impossible for one tenant to register a slug visually identical to
another's. Cyrillic `а`, Greek `ο`, and full-width forms render indistinguishably in a URL
bar but are distinct code points; allowing them would let a tenant impersonate a
competitor's menu URL exactly.

Someone will eventually propose widening this so `Пицария` can stay Cyrillic.
Transliteration is what serves international names; the character class is a security
boundary.

### Case handling

- **Write** — the DTO **rejects** uppercase rather than coercing. Silent coercion means an
  owner types `Bistro` and gets `bistro` without being told.
- **UI** — the input lowercases as the owner types, so the rejection never surfaces.
- **Read** — the resolver normalizes `slug.trim().toLowerCase()` before lookup.
- **DB** — `CHECK (slug = lower(slug))`.

### Blacklist

One exported, tested const. Because `/m/` namespacing isolates the route table, this
covers only reserved infrastructure names:

```
www api app admin administrator dashboard staff kitchen pos docs mail smtp
imap cdn static assets img images media ftp ns ns1 ns2 mx webmail blog shop
store help support status dev test staging prod production demo sandbox auth
login register account billing payment payments checkout stripe webhook
socket ws graphql v1 v2 public internal root system security abuse postmaster
null undefined
```

---

## Section 4 — Resolution

### A cheap resolver, not a second menu endpoint

An earlier draft proposed `GET /menu/public/by-slug/:slug` returning the full menu. That
was wrong: the frontend deliberately loads **metadata first, then batches category items**
(`usePublicMenuData.ts:173` — _"Main fetch: meta first, then batched category items"_). A
full-menu-by-slug endpoint would fight that loading strategy and duplicate the hot path.

Instead, one cheap lookup:

```
GET /menu/public/resolve/:slug
  → 200 { restaurantId, canonicalSlug }
  → 404 unknown
  → 410 tombstoned
```

```ts
async resolve(@Param('slug') slug: string) {
  // Normalize before lookup — URLs arrive from browsers, QR scanners, and
  // hand-typing. The DB stores lowercase only (CHECK constraint, Section 1).
  const row = await this.slugService.resolve(slug.trim().toLowerCase());
  if (!row) throw new NotFoundException();
  if (row.releasedAt) throw new GoneException();
  return { restaurantId: row.restaurantId, canonicalSlug: row.canonicalSlug };
}
```

One primary-key lookup. The established restaurant-ID menu flow then runs **completely
unchanged**, which protects the existing hot path and keeps the slug module deep and
isolated.

### Frontend routing

- new `/m/:slug` → resolve, then render `PublicMenuPage` with the resolved `restaurantId`
- existing `/menu/public/:restaurantId` → unchanged
- `useResolvedRestaurant()` returns `{ restaurantId, slug, status }`, so `PublicMenuPage`
  itself does not branch
- `?table=` and `?sp=` behave identically on both routes

The extra resolve round trip applies only to `/m/` entry. Legacy ID URLs skip it.

### Alias correction

Once resolved, the client compares the URL slug to `canonicalSlug`. If they differ,
`navigate('/m/' + canonicalSlug, { replace: true })`. Address bar corrects; no server
redirect.

**Case correction falls out of this for free.** `/m/BISTRO-ORANZH` normalizes to a hit on
the read path, then the comparison replaces the address bar with the lowercase form.

### Legacy URLs

`/menu/public/:restaurantId` **keeps serving 200 forever.** No redirect. Every QR already
printed encodes this URL; a 301 would add a round trip to every legacy scan on restaurant
wifi to achieve what the canonical tag achieves. This route's survival is a hard invariant
with a dedicated regression test.

### Canonical tags — must be built, does not exist today

The repository currently has **no canonical-tag implementation and no Helmet-equivalent**
(verified: zero matches for `rel="canonical"` or `Helmet` under `apps/frontend/src`).
Since this design depends on canonical tags for both legacy-ID and alias URLs, that
implementation is **in scope**, not assumed:

- a small `useCanonicalUrl(url)` hook managing a single `<link rel="canonical">` in
  `<head>`, idempotent across re-renders and cleaned up on unmount
- applied on `/m/:slug` (pointing at the canonical slug URL) and on
  `/menu/public/:restaurantId` (pointing at the slug URL once resolved)
- tested by asserting the emitted `href` for primary, alias, and legacy entry points

---

## Section 5 — Authorization

### The trap

There is **no `@Roles` decorator anywhere in the backend.** Authorization runs through
`findOneForManagement(id, userId)` (`restaurants.service.ts:294`), which grants access to
**OWNER or MANAGER** (`isOwner || isManager`, lines 308–311).

Therefore: **`slug` must not be a field on `UpdateRestaurantDto`.** Adding it there would
silently grant MANAGER the ability to rename the restaurant's public URL through the
existing `PATCH /restaurants/:id`, inheriting an authorization level this design does not
intend.

### Required authorization

| Operation                | Who              | Additional                                                                       |
| ------------------------ | ---------------- | -------------------------------------------------------------------------------- |
| Slug rename              | OWNER only       | Dedicated endpoint, own ownership check, cooldown enforced server-side           |
| Slug commit              | OWNER or MANAGER | Idempotent; a precondition, not a privileged mutation                            |
| Alias release            | OWNER only       | Server-side `CONFIRM` validation, matching the existing dangerous-action pattern |
| Super-admin reassignment | SUPER_ADMIN      | `CONFIRM`, rate limited, `AdminAuditLog` written in the **same** `$transaction`  |
| Availability check       | Authenticated    | Advisory only; throttled; never authoritative                                    |

The `CONFIRM` mechanism follows the established super-admin convention
(`@Matches(/^CONFIRM$/)` in the DTO, server-enforced through the class-validator
pipeline), not a frontend-only dialog.

### Release and re-claim

Owners may release an old alias — but a released slug **must not return to the claimable
pool**. If a competitor could claim a just-released slug, every QR already printed for the
original restaurant would resolve to _someone else's_ menu, with a live cart and checkout.
That is materially worse than a 404: silent, customer-facing, and undetectable by the
victim.

Release **tombstones** the row (`releasedAt` set). Tombstoned slugs resolve to `410 Gone`,
remain in the namespace so uniqueness is unbroken, and are **not** re-claimable through
any self-service path. The legitimate re-claim case is a business sale, which is handled
as a super-admin action with an audit trail.

---

## Section 6 — URL construction and route-sensitive consumers

### The seam

**Backend** — `TenantUrlService.getMenuBaseUrl(restaurant)` → `${FRONTEND_URL}/m/${slug}`.
Only one consumer moves: `payment-provider-config.service.ts:190`
(`getFrontendBaseUrl()` / `buildPublicMenuReturnUrl()`).

Of the ~12 backend `FRONTEND_URL` reads, the rest are dashboard, auth, or staff URLs that
correctly stay on the app origin — verified: `restaurants.service.ts:854` (Stripe Connect
return → `/dashboard`) and `restaurants.controller.ts:157` (staff device enrollment).

Security constraint: the builder composes from server config plus the DB slug, **never**
from a request header — following the precedent already documented at
`restaurants.controller.ts:155`, _"the request `Origin` header is attacker-controlled …
must never feed a QR/link target."_

**Frontend** — extend `apps/frontend/src/lib/menuUrl.ts`, which already declares itself
the single source of truth for menu URLs (line 15). Do not add a parallel module.

```ts
getMenuUrl(restaurant, { table?, servicePoint? }): string
```

### Complete consumer list

An earlier draft listed only three components. Verified full list:

**URL constructors** — migrate to `getMenuUrl()`:

| File                                     | Line   | Current                                       |
| ---------------------------------------- | ------ | --------------------------------------------- |
| `components/tables/QrCodeModal.tsx`      | 30, 32 | `${window.location.origin}/menu/public/${id}` |
| `components/tables/PrintableQRCodes.tsx` | 28     | same                                          |
| `components/tables/ServicePointsTab.tsx` | 514    | same                                          |
| `components/tables/TableView.tsx`        | 920    | same                                          |
| `pages/BookingManagePage.tsx`            | 592    | `<Link to={/menu/public/${id}}>`              |
| `pages/BookingConfirmationPage.tsx`      | 246    | same                                          |
| `pages/BookingPage.tsx`                  | 837    | `<a href={/menu/public/${id}}>`               |
| `lib/menuUrl.ts`                         | 27     | `buildMenuReturnUrl()` becomes slug-aware     |

**Route-prefix matchers — production correctness bugs, not cleanup.** Both fail silently:

- **`components/Header.tsx:28`** —
  `if (location.pathname.startsWith("/menu/public")) return null;`
  `/m/<slug>` does not match, so the **application header renders on top of the public
  customer menu**. Must recognize the new route.

- **`context/ConsentContext.tsx:46`** —
  `const RESTAURANT_MENU_PATH = /^\/menu\/public\/([^/]+)/;`
  `/m/<slug>` does not match, so consent is stored under `consent:platform` instead of
  `consent:restaurant:<id>` — a GDPR-relevant misclassification.

  **Widening the regex is not sufficient.** The captured group is used directly as the
  storage key (`consent:restaurant:${restaurantId}`). On `/m/<slug>` the captured value is
  a _slug_, producing `consent:restaurant:<slug>` ≠ `consent:restaurant:<id>` — the same
  visitor would hold two divergent consent records for one restaurant. The key must remain
  **ID-based**, which means consent resolution has to consume the resolved `restaurantId`
  rather than parse it from the path. The existing comment at lines 42–45 explains why
  `useParams()` is unavailable at that position; the resolved value must be threaded in
  another way.

New QR codes emit `/m/<slug>`, and only after commit (Section 2). Every QR already printed
keeps working.

---

## Section 7 — Staged migration

Four separately-deployable steps. **This is not one nullable-to-required migration.**

**Step 1 — schema (additive only).** Create `RestaurantSlug`, the partial unique index, and
the lowercase `CHECK`. Add `Restaurant.slug` as **nullable**. No destructive operations, no
long locks, safe under Neon's PgBouncer transaction mode.

**Step 2 — backfill (separate idempotent script).** Generate a primary slug per existing
restaurant and populate the denormalized copy. Re-runnable, additive, no destructive
operations, following the repo's seed-safety conventions. Kept out of the migration
because of this repo's drift history.

**Step 3 — verification (must pass before Step 4).** Assert, as a query:

- every active restaurant has exactly one `isPrimary` row
- `Restaurant.slug` equals that row's slug for every active restaurant
- zero rows violate the lowercase or blacklist rules

**Step 4 — tighten (later migration).** Only once Step 3 passes in production, make
`Restaurant.slug` non-null.

Ship Steps 1–3 and let them settle before Step 4. Application code must tolerate a null
`Restaurant.slug` until Step 4 lands.

---

## Section 8 — Merchant UI

**Onboarding — `RestaurantBasicsStep.tsx`.** The step already collects the name. Add a
live-derived slug preview rendering the full URL, with an inline edit affordance. **Not
gated on the slug** — requiring a decision adds signup friction for something most owners
accept as generated. Skipping yields the derived slug.

Availability check is debounced and advisory. Slug existence is already public via
`/m/<slug>`, so it discloses nothing new; throttled for abuse, not secrecy.

**Settings — `GeneralSettingsTab.tsx`.**

- current URL with a copy button
- input lowercases as the owner types, so the reject-don't-coerce rule never surfaces as
  a 400
- while uncommitted, the UI says so — changes are free and no old link is being kept,
  which is materially different from a committed rename
- once committed, the cooldown is surfaced honestly: show the date the next change
  becomes available, not a generic error
- rename and release controls are visible to OWNER only, mirroring the server-side rule
  (Section 5) rather than substituting for it

**Previous URLs** listed read-only beneath the current one, each with a _Release_ action.
The dialog must state that release is permanent and irreversible, that QR codes pointing
at that URL will stop working, and that the name cannot be re-used without contacting
support. It should read like the existing CONFIRM-gated dangerous actions.

---

## Section 9 — Testing

Backend Jest co-located `*.spec.ts`, frontend Vitest.

**Coverage thresholds are the repository's existing values** — branches 64, functions 68,
lines 75, statements 74 (`apps/backend/package.json:160`). An earlier draft asserted an
80% floor; that was wrong. **Do not raise the global threshold as part of this work.**
Risk-focused tests on the slug namespace, database invariants, QR continuity, tenant
isolation, and routing matter far more than moving an arbitrary global number.

**Transliteration** — full Bulgarian alphabet; word-final `-ия`; mixed Cyrillic/Latin;
emoji-only and empty → fallback; 70-char input truncates at a hyphen boundary.

**Validation** — rejects `a` (single char, the bug in the earlier regex); accepts `ab`;
rejects underscore, leading/trailing hyphen, `xn--`, all-numeric, >40 chars, uppercase,
every blacklist entry.

**Namespace integrity** (integration, real DB — these are database constraints)

- a live slug and a retired alias cannot collide
- a tombstoned slug cannot be claimed by another restaurant
- at most one primary per restaurant is enforced by the index
- the `CHECK` rejects an uppercase insert even when the application layer is bypassed

**Invariant (ongoing)** — every active restaurant has exactly one primary slug, and
`Restaurant.slug` matches it. This is the app-level half of the guarantee the index cannot
provide.

**Commit model**

- an edit while uncommitted creates **no** alias row; the old slug is immediately
  claimable again
- opening the QR flow commits the slug, and the QR does not render if commit fails
- commit is idempotent — calling it twice does not create a second alias or move
  `committedAt`
- auto-commit on first `MenuView`; on first `Order` (including a POS order with no
  `MenuView`); on first `Reservation`; and at 24h with zero activity
- the first rename _after_ commit creates an alias, proving the mode switch

**Rename**

- old row becomes an alias and still resolves; new row becomes primary
- `Restaurant.slug` stays in sync
- aliases are never evicted, at any count
- a second committed rename inside 14 days is rejected by the cooldown
- concurrent claims of the same base slug: one wins, the other retries to a suffixed slug
  rather than failing; retry budget exhaustion returns a clear error

**Authorization**

- MANAGER cannot rename (regression guard against `slug` leaking into
  `UpdateRestaurantDto`)
- MANAGER can commit
- release without `CONFIRM` is rejected server-side
- super-admin reassignment writes `AdminAuditLog` in the same transaction

**Resolver** — primary hit; alias hit; miss → 404; tombstone → 410, never another tenant's
menu; `/m/BISTRO-ORANZH` resolves and canonicalizes; leading/trailing whitespace resolves.

**Canonical tags** — correct `href` emitted for primary, alias, and legacy-ID entry
points; no duplicate `<link>` after re-render.

**Route-prefix regressions**

- `Header.tsx` renders **nothing** on `/m/<slug>`
- `ConsentContext` stores consent under `consent:restaurant:<restaurantId>` on
  `/m/<slug>` — asserting the **ID**, not the slug

**Regression guard** — `/menu/public/:restaurantId` still returns 200. This encodes the
printed-QR invariant and must fail loudly if anyone later attempts to remove the route.

---

## Forward compatibility

Subdomains are out of scope, but two constraints are retained because they cost nothing
now and are what would keep a later move cheap:

1. **Slugs obey DNS label rules** (Section 3). A tenant who took `my_bistro` or a 70-char
   slug could never become a subdomain, and forcing a slug change on a live customer with
   printed QR codes is not acceptable. Enforcing the rules now costs nothing.

| Accepted by a path   | Legal DNS label?                    |
| -------------------- | ----------------------------------- |
| `my_bistro`          | No — underscore                     |
| 70 characters        | No — 63-char label limit            |
| `-bistro`, `bistro-` | No — leading/trailing hyphen        |
| `xn--foo`            | No — punycode reserved              |
| `Bistro-Oranzh`      | Ambiguous — DNS is case-insensitive |

2. **All menu-URL construction flows through one function per side** (Section 6). This is
   also what keeps the payment-return path correct: because the return URL is built
   per-restaurant rather than from one global, a future origin change cannot strand a
   paying customer on the wrong origin with an origin-scoped `localStorage` table session.

If subdomains are revisited, the additional work is infrastructure plus a Socket.IO CORS
suffix matcher — the only security loosening involved, requiring its own review.

---

## Known limitations

**SEO — client-side canonical.** A Vite SPA on static hosting injects
`<link rel="canonical">` client-side. Google renders JS and does pick these up, but it is
less reliable than a server-rendered tag. This design does not maximize SEO; it does not
block it.

**No social link previews.** The sharper cost, and not an SEO problem. WhatsApp, Signal,
iMessage, Facebook, and LinkedIn scrapers mostly do **not** execute JavaScript — they read
raw HTML `<meta>` tags. A menu URL pasted into WhatsApp renders as a bare link with no
restaurant name, logo, or description. For a market where menu links circulate primarily
through messaging apps, that is a real marketing loss and precisely the gap Google's JS
rendering does not cover.

_Follow-up, out of scope:_ addressable without touching Vite or the slug subsystem, but
**not** as a NestJS interceptor — `/m/<slug>` is served by Vercel from static hosting and
Cloud Run only ever sees `/api/v1/*`. It would need a `vercel.json` rewrite with a `has`
condition on `user-agent` routing crawlers to Cloud Run, plus a backend route rendering
meta tags. Roughly half a day, most of it correctly escaping owner-controlled restaurant
names injected into `<meta content="...">` on a public unauthenticated endpoint. The bot
HTML must faithfully represent the human page; diverging content is cloaking.

**Alias URLs pass canonical signal, not 301 link equity.** Accepted: aliases exist for
printed-QR continuity, not search ranking.

---

## Open items

- **The 14-day cooldown and 24h auto-commit backstop are starting values**, not researched
  ones. If owners hit them legitimately, loosen them — do not reach for alias eviction,
  which this design deliberately rejected.
- **Tombstone retention is unbounded.** Tombstoned slugs are never reclaimed, so the
  namespace only grows. Irrelevant at current tenant scale; recorded so a future "clean up
  old slugs" instinct is understood as a QR-hijacking regression rather than housekeeping.
- **`ConsentContext` needs a threading decision.** The resolved `restaurantId` must reach a
  component that renders as a sibling of `<Routes>`. Options include lifting resolution
  above the router or exposing it through a context; the choice is deferred to
  implementation but must preserve ID-based keying.
