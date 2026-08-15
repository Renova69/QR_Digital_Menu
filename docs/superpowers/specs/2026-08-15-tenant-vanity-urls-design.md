# Tenant Vanity URLs — Path-First Design (Phase 1), Subdomains (Phase 2)

**Date:** 2026-08-15
**Status:** Design approved, not started.
**Related:** `CLAUDE.md § Frontend architecture`, `apps/frontend/src/lib/menuUrl.ts`,
`apps/backend/src/events/events.gateway.ts` (`C-2` origin pinning)

---

## Problem

Every restaurant's public menu today is reachable only by opaque cuid:

```
https://<app-origin>/menu/public/cmf3k9x2b0001qw8h7d2n4p6t?table=5
```

Owners want a branded, speakable URL — the ask was
`https://bistroorange.qrmenu.bg/`. That URL is what goes on table tents, business
cards, Instagram bios, and Google Business listings, so it is customer-facing brand
surface, not a developer convenience.

Two shapes solve it: a **path** (`/m/bistro-oranzh`) or a **subdomain**
(`bistro-oranzh.<root>`). Subdomains are the eventual target, but they carry
infrastructure and security cost that path-based does not.

### Decision: path-first, subdomain as Phase 2

Path-based ships the entire tenant-identity subsystem — slug, transliteration,
namespace, resolution, URL construction, merchant UI — with **zero** wildcard DNS,
zero TLS work, zero CORS changes, and without touching the pinned Socket.IO origin
allowlist. Phase 2 then becomes infrastructure plus two one-line branches.

The migration is clean **only if two disciplines are enforced from day one**. They
are the core constraints of this design and are called out throughout:

1. **Slugs obey DNS label rules now**, while paths do not require it. A tenant who
   takes `my_bistro` or a 70-character slug during Phase 1 can never become a
   subdomain, and forcing a slug change on a live customer with printed QR codes is
   not an acceptable outcome.
2. **All menu-URL construction flows through one function per side.** The current
   code scatters `window.location.origin` across four components; if that pattern
   survives, Phase 2 becomes a grep hunt instead of a branch.

### Non-goals

- Per-tenant custom domains (`menu.bistroorange.bg`). Phase 2's host resolver is the
  groundwork, but registering and provisioning customer-owned domains is separate.
- Server-side rendering or prerendering of the public menu. See _Known limitations_.
- Any change to authentication, dashboard, POS, or staff URLs. Those stay on the
  single app origin permanently.

---

## Decisions

| Question          | Decision                  | Rationale                                                                                                                                                                                                                                                   |
| ----------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URL shape         | `/m/<slug>` (namespaced)  | Bare `/<slug>` shares the first path segment with every current and future top-level route, making the blacklist a permanent tax on adding routes. `/m/` has zero collision risk forever.                                                                   |
| Who gets a slug   | All tiers                 | No gate logic, no downgrade edge cases, stable QR codes for every tenant from day one.                                                                                                                                                                      |
| Tier gate         | Plumbed, dormant          | Resolver returns tier so Phase 2 can gate _subdomains_ to PRO+ without rework. Path resolution never gates.                                                                                                                                                 |
| Slug changes      | Allowed, permanent alias  | Old slugs keep resolving so printed QR codes never break.                                                                                                                                                                                                   |
| Alias retention   | Unlimited, never evicted  | Aliases are permanent so printed QR codes never break. Churn is bounded by a rename rate limit, not by eviction. An alias cap would have sacrificed an unrecoverable invariant to buy an anti-squatting defense that leaks anyway (see _Rename semantics_). |
| Rename rate limit | 2 per 30 days             | Bounds careless churn — the realistic failure. Adversarial namespace hoarding is an account-level abuse problem, not an alias-retention one.                                                                                                                |
| Slug release      | Tombstone, admin re-claim | A released slug returning to the claimable pool is a QR-hijacking vector. Tombstoned slugs serve 410 and are never auto-re-claimable.                                                                                                                       |
| Slug case         | Lowercase, DB-enforced    | Rejected (not coerced) at the DTO, normalized on read, `CHECK (slug = lower(slug))` in the DB.                                                                                                                                                              |
| `Restaurant.slug` | Denormalized              | Public menu is the hottest endpoint; avoids a join on the hot path. Guarded by a single writer + a sync test.                                                                                                                                               |
| Bulgarian `-ия`   | Transliterate to `-ia`    | Matches the official standard (Art. 4). `Пицария` → `pitsaria`.                                                                                                                                                                                             |
| Redirects         | None server-side          | Aliases correct client-side; legacy IDs serve 200 with a canonical tag. See _Known limitations_.                                                                                                                                                            |

---

## Section 1 — Data model

### The namespace constraint

A retired slug and a live slug must never be claimable by two different restaurants.
Two tables with separate unique indexes cannot enforce that — it would rely on an
application-level check that races under concurrent signups. **One table owns the
namespace.**

```prisma
model RestaurantSlug {
  slug         String     @id                    // PK == the global namespace
  restaurantId String
  isPrimary    Boolean    @default(false)
  releasedAt   DateTime?                         // tombstone — resolves 410, never re-claimable
  createdAt    DateTime   @default(now())
  restaurant   Restaurant @relation(fields: [restaurantId], references: [id], onDelete: Cascade)

  @@index([restaurantId])
}
```

Plus two constraints Prisma cannot express, added as raw SQL in the migration:

```sql
-- exactly one primary per restaurant
CREATE UNIQUE INDEX "RestaurantSlug_one_primary"
  ON "RestaurantSlug"("restaurantId") WHERE "isPrimary";

-- the lowercase invariant is a database fact, not an app convention
ALTER TABLE "RestaurantSlug" ADD CONSTRAINT "RestaurantSlug_slug_lowercase"
  CHECK (slug = lower(slug));
```

Guarantees, at the database level:

- every slug is globally unique across live, retired, **and** tombstoned
- exactly one primary per restaurant
- no slug can ever be stored with uppercase characters

`CHECK` is preferred over `citext` or a case-insensitive collation: citext adds an
extension dependency, and non-deterministic collations interact badly with primary-key
indexes.

### Denormalized read copy

```prisma
model Restaurant {
  // ...existing fields
  slug String? @unique   // nullable until backfill completes, then required
}
```

`Restaurant.slug` mirrors the current primary. It exists because the public menu
response needs the restaurant's own canonical URL on every load, and that endpoint is
the hottest public path in the app.

**The redundancy is the accepted cost of the read.** It is contained by:

- a single writer — `RestaurantSlugService.rename()` is the only code permitted to
  write either table, and both writes happen in one `$transaction`
- a test asserting `Restaurant.slug` always equals the row where `isPrimary = true`

### Rename semantics

One transaction:

1. current primary row → `isPrimary = false` (becomes an alias, stays resolvable)
2. insert new row with `isPrimary = true`
3. update `Restaurant.slug`

**Aliases are never evicted.** An earlier draft capped retention at 5 per restaurant to
bound namespace growth. That was wrong on both sides of the trade:

- It did not actually prevent namespace hoarding. An attacker wanting to reserve
  `pizza`, `sushi`, or `bar` registers additional free accounts rather than renaming one
  repeatedly. Adversarial hoarding is an account-level abuse problem; alias retention
  policy cannot reach it.
- It sacrificed the one invariant that is genuinely unrecoverable. QR codes reach
  physical media — metal plaques, engraved table tents, printed menu inserts — that
  cannot be reissued when an alias is evicted.

Churn is instead bounded where the realistic failure lives: a **rename rate limit of 2
per 30 days**, which stops careless churn without touching the invariant. Honest
restaurants rename zero to two times in their lifetime, so namespace growth from
legitimate use is negligible.

### Slug release and re-claim

Owners may release an old alias — but a released slug **must not return to the claimable
pool**.

If a competitor could claim a just-released slug, every QR code already printed for the
original restaurant would resolve to _someone else's_ menu, with a live cart and
checkout. That is materially worse than a 404: it is silent, it is customer-facing, and
the victim has no way to detect it.

So release **tombstones** the row (`releasedAt` set). Tombstoned slugs:

- resolve to `410 Gone` with a "this menu has moved" page — never to another tenant
- remain in the namespace, so the uniqueness guarantee is unbroken
- are **not** re-claimable through any self-service path

The legitimate re-claim case is a business sale: the restaurant changes hands and the
new owner, on a new account, wants the old slug. That is rare and exactly the shape of
operation the super-admin panel already handles — so re-claim is a **super-admin action**,
CONFIRM-gated and written to `AdminAuditLog` in the same `$transaction`, matching the
existing pattern for dangerous tenant mutations. Automated re-claim is a footgun; a
human in the loop with an audit trail is the correct cost for a rare operation.

### Migration safety

Purely additive: one new table, one index, one nullable column on `Restaurant`. No
destructive operations, no long locks, safe under Neon's PgBouncer transaction mode.

**The backfill is a separate idempotent script, not part of the migration.** Given the
drift history in this repo, migrations stay mechanical and data movement stays
re-runnable. Follows the existing seed-safety conventions (idempotent, additive, no
destructive ops).

---

## Section 2 — Slug generation and validation

### Replacing the existing helper

`toSlug()` exists in three copies — `apps/frontend/src/lib/menuExport.ts:81`,
`analyticsExport.ts`, `paymentsExport.ts`:

```js
.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
```

`Бистро Оранж` → `""`. Every Cyrillic name collapses to an empty string. This is
already a live cosmetic bug — Bulgarian restaurants get `menu-export--2026-08-15.xlsx`
today. All three call sites migrate to the new shared util, fixing that as a
side effect.

### Bulgarian transliteration

Official standard (Закон за транслитерацията, in force 2009) — the spelling owners
already see on their own passports and street signs:

```
а→a   б→b   в→v   г→g   д→d   е→e   ж→zh  з→z   и→i   й→y
к→k   л→l   м→m   н→n   о→o   п→p   р→r   с→s   т→t   у→u
ф→f   х→h   ц→ts  ч→ch  ш→sh  щ→sht ъ→a   ь→y   ю→yu  я→ya
```

Art. 4 exception: word-final `-ия` → `-ia`. `Пицария` → `pitsaria`.

**Do not substitute a generic ISO-9 library.** Two divergences make it wrong for
Bulgarian: `ъ→a` (ISO-9 gives `ŭ`/`ǎ`) and `щ→sht`. A name rendered `bistro-oranž`
reads as broken to a Bulgarian speaker. Hand-rolled table, ~30 lines, fully unit
testable, no dependency.

### Pipeline

1. NFD normalize, strip combining marks — handles Romanian `ă ș ț` and Latin diacritics
2. Cyrillic → Latin via the table above, applying the word-final `-ия` rule
3. lowercase
4. non-`[a-z0-9]` → hyphen
5. collapse repeated hyphens, trim leading and trailing
6. truncate to 40 chars **at a hyphen boundary**
7. empty, all-numeric, or `xn--` prefix → fallback `restaurant-<6 chars of id>`
8. blacklist check
9. collision → deterministic `-2`, `-3`, … never random

Worked examples:

```
Бистро Оранж      → bistro-oranzh
Restaurant OWEN   → restaurant-owen
Пицария Щастие    → pitsaria-shtastie
Café Münchén      → cafe-munchen
🍕🍕🍕            → restaurant-cmf3k9
```

### Validation — the Phase 2 insurance

Enforced server-side in the DTO, per this repo's class-validator-at-the-boundary
convention. **Never UI-only.**

```ts
@Matches(/^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/)
```

2–40 characters, lowercase alphanumeric plus hyphen, no leading or trailing hyphen.
Additionally rejected:

- `xn--` prefix (reserved for punycode; would collide with IDN encoding)
- all-numeric (ambiguous with IDs, and `/m/12345` reads as an internal identifier)
- anything on the blacklist

These are DNS label rules. **Paths do not need them. They are enforced now purely so
that no tenant is disqualified from Phase 2.** This is discipline #1 from the problem
statement, and it is the single highest-value constraint in the document.

| Accepted by a path   | Legal DNS label?                    |
| -------------------- | ----------------------------------- |
| `my_bistro`          | No — underscore                     |
| 70 characters        | No — 63-char label limit            |
| `-bistro`, `bistro-` | No — leading/trailing hyphen        |
| `xn--foo`            | No — punycode reserved              |
| `Bistro-Oranzh`      | Ambiguous — DNS is case-insensitive |

### The regex is also the homoglyph defense

**Do not relax `[a-z0-9-]` to accommodate international names.** The ASCII-only
character class is doing double duty: it makes it impossible for one tenant to register
a slug that is visually identical to another's. Cyrillic `а`, Greek `ο`, Latin `а` with
combining marks, and full-width forms all render indistinguishably in a URL bar but are
distinct code points — allowing them would let a tenant impersonate a competitor's menu
URL exactly.

This is non-obvious, and someone will eventually propose widening the class so that
`Пицария` can stay Cyrillic in the URL. The answer is that transliteration (Section 2)
is what serves international names; the character class is a security boundary.

### Case handling

Three layers, so the invariant cannot drift:

- **Write** — the DTO **rejects** uppercase rather than coercing it. Silent coercion
  means an owner types `Bistro` and gets `bistro` without being told.
- **UI** — the input lowercases as the owner types, so they watch it happen and never
  hit a 400 in practice.
- **Read** — the resolver normalizes `slug.trim().toLowerCase()` before lookup. URLs
  arrive from browsers, QR scanners, and hand-typing, none of which are trustworthy
  about case.
- **DB** — `CHECK (slug = lower(slug))` from Section 1 makes it a database fact.

### Blacklist

One exported, tested const. Because `/m/` namespacing isolates the route table, this
covers only subdomain-hostile and infrastructure names:

```
www api app admin administrator dashboard staff kitchen pos docs mail smtp
imap cdn static assets img images media ftp ns ns1 ns2 mx webmail blog shop
store help support status dev test staging prod production demo sandbox auth
login register account billing payment payments checkout stripe webhook
socket ws graphql v1 v2 public internal root system security abuse postmaster
null undefined
```

---

## Section 3 — Resolution

### Host-agnostic from day one

```ts
resolveTenant({ hostname, pathname }): ResolvedTenant | null
```

`hostname` is unused in Phase 1. The signature exists so Phase 2 adds a branch rather
than a refactor.

### Backend — one route, zero service duplication

```ts
@Get('public/by-slug/:slug')
async getPublicMenuBySlug(@Param('slug') slug, @Query('lang') lang) {
  // Normalize before lookup — URLs arrive from browsers, QR scanners, and
  // hand-typing. The DB stores lowercase only (CHECK constraint, Section 1).
  const resolved = await this.slugService.resolve(slug.trim().toLowerCase());
  if (!resolved) throw new NotFoundException();
  if (resolved.releasedAt) throw new GoneException();   // tombstoned — never another tenant
  return this.menuService.getPublicMenu(resolved.restaurantId, lang);
}
```

One extra primary-key lookup, one round trip. It delegates to the **identical** service
method, so translation, tier behavior, and every existing menu concern come along
unchanged with no second code path to keep in sync.

The response gains `restaurant.slug` (the denormalized primary) so the client knows its
own canonical URL.

### Alias handling — no extra hop

The client compares the slug in the URL against `restaurant.slug` in the response. If
they differ, `navigate('/m/' + canonical, { replace: true })`. The menu is already
loaded; only the address bar corrects. No server redirect, no second fetch.

**Case correction falls out of this for free.** `/m/BISTRO-ORANZH` normalizes to a hit
on the read path, then the comparison above finds the URL slug differs from the
canonical and replaces the address bar with the lowercase form. No additional code.

### Legacy URLs

`/menu/public/:restaurantId` **keeps serving 200 forever.** No redirect.

Every QR code already printed and sitting on a restaurant table encodes this URL. A 301
would add a round trip to every legacy scan — on restaurant wifi — to achieve what the
canonical tag already achieves. This route's continued existence is a hard invariant
with a dedicated regression test.

### Frontend routing

- new `/m/:slug` → `PublicMenuPage`
- existing `/menu/public/:restaurantId` → unchanged
- `useResolvedRestaurant()` reads whichever param is present and returns
  `{ restaurantId, slug }`, so `PublicMenuPage` itself does not branch
- `?table=` and `?sp=` behave identically on both routes

### Tier gate — plumbed, dormant

`resolveTenant` returns the tier alongside the restaurant. Phase 2 adds one branch:
resolution **via hostname** with tier below PRO → redirect to the path URL. Path
resolution never gates. Inert until Phase 2 flips it.

---

## Section 4 — URL construction seam

The entire Phase 2 migration reduces to two functions. This is discipline #2.

### Backend

`TenantUrlService.getMenuBaseUrl(restaurant)`:

```
Phase 1:  ${FRONTEND_URL}/m/${restaurant.slug}
Phase 2:  https://${restaurant.slug}.${ROOT_DOMAIN}     (tier-gated)
```

**Only one consumer moves:** `payment-provider-config.service.ts:190` —
`getFrontendBaseUrl()` and `buildPublicMenuReturnUrl()`.

Of the ~12 backend `FRONTEND_URL` reads, the rest are dashboard, auth, or staff URLs
that correctly stay on the app origin — verified:

- `restaurants.service.ts:854` — Stripe Connect return → `/dashboard`. Stays.
- `restaurants.controller.ts:157` — staff device enrollment link. Stays.

This seam also **pre-empts the Phase 2 money bug.** Once the payment return URL is
built per-restaurant instead of from one global, the failure mode "customer pays on the
subdomain, is redirected to the app origin, and loses the origin-scoped `localStorage`
table session" cannot occur. Building the seam in Phase 1 means Phase 2 never
introduces it.

**Security constraint:** the builder composes from server config plus the DB slug,
never from a request header. This follows the precedent already documented at
`restaurants.controller.ts:155` — _"the request `Origin` header is attacker-controlled
… must never feed a QR/link target."_

### Frontend

Extend the existing `apps/frontend/src/lib/menuUrl.ts`, which already declares itself
the single source of truth for menu URLs (lines 15–19). Do not add a parallel module.

```ts
getMenuUrl(restaurant, { table?, servicePoint? }): string
```

Call sites migrated off hand-rolled `${window.location.origin}/menu/public/${id}`:

- `apps/frontend/src/components/tables/QrCodeModal.tsx:30,32`
- `apps/frontend/src/components/tables/PrintableQRCodes.tsx:28`
- `apps/frontend/src/components/tables/ServicePointsTab.tsx:514`
- `apps/frontend/src/lib/menuUrl.ts` — `buildMenuReturnUrl()` becomes slug-aware

After this, no component constructs a menu URL itself, and Phase 2 touches zero
components.

New QR codes emit `/m/<slug>`. Every QR already printed keeps working — through Phase 2
as well.

---

## Section 5 — Merchant UI

### Onboarding — `RestaurantBasicsStep.tsx`

The step already collects the restaurant name. Add a live-derived slug preview beneath
the name field, rendering the full URL, with an inline edit affordance.

**The step is not gated on the slug.** Requiring a decision adds signup friction for
something most owners will accept as generated. Skipping yields the derived slug,
changeable later in settings.

Availability check: debounced `GET /restaurants/slug-available?slug=`. Slug existence is
already public via `/m/<slug>`, so this discloses nothing new — throttled for abuse, not
for secrecy.

### Settings — `GeneralSettingsTab.tsx`

- current URL displayed with a copy button
- input lowercases as the owner types (see _Case handling_), so the DTO's
  reject-don't-coerce rule never surfaces as a 400
- edit → availability check → confirmation dialog stating plainly that **existing
  printed QR codes keep working**; only the displayed URL changes
- save → the rename transaction from Section 1
- rate limit surfaced honestly: when the 2-per-30-days limit is hit, show when the next
  change becomes available rather than a generic error

**Previous URLs** are listed read-only beneath the current one, each with a _Release_
action. The release dialog must state that releasing is **permanent and irreversible**,
that QR codes pointing at that URL will stop working, and that the name cannot be
re-used afterwards without contacting support. Release is rare and destructive; the
dialog should read like the existing CONFIRM-gated dangerous actions, not like a
toggle.

---

## Section 6 — Phase 2 flip checklist

1. Settle the Vercel plan question empirically (add `*.<root>` in the dashboard and see
   whether it is accepted), **or** Cloudflare free + Origin Rules Host header override
2. Wildcard DNS + TLS — Vercel nameservers chosen at domain purchase, or Cloudflare
   Universal SSL (covers apex + one wildcard level)
3. `ROOT_DOMAIN` env var
4. Phase 2 branch in `getMenuBaseUrl` (backend) and `getMenuUrl` (frontend)
5. **Socket.IO CORS suffix matcher** in `events.gateway.ts` — the only security
   loosening in the entire project; requires its own review. Must parse the origin as a
   URL and require `protocol === 'https:'`, no port, and an exact suffix match on
   `hostname`. Never a substring check. Tests must assert `evil-<root>` and
   `<root>.evil.com` are rejected.
6. Subdomain detection; `resolveTenant` begins reading `hostname`
7. Root routing fork — `<slug>.<root>/` serves the menu; `<slug>.<root>/dashboard`
   redirects to the app origin
8. Activate the dormant tier gate
9. Accept the one-time `visitorId` and cookie-consent reset per restaurant (see
   _Known limitations_)

**Deliberately absent, because the Phase 1 seams pre-empt them:** payment return origin,
QR generation, slug validation, blacklist, DNS-label constraints. That absence is the
entire argument for path-first.

### Infrastructure notes carried forward

- Vercel Hobby is non-commercial per Vercel's fair-use terms; this is a paid SaaS. This
  is a terms question independent of any feature gate, and no infrastructure
  arrangement — including Cloudflare — changes it.
- If Cloudflare fronts Vercel: Vercel routes by `Host` header and returns
  `DEPLOYMENT_NOT_FOUND` for hosts not registered to a project. A Host header override
  at Cloudflare is **required**, not optional. The browser still sees the real subdomain,
  so `window.location.hostname`, cookie scoping, and this design's client-side
  resolution are all unaffected.
- The `/api/v1/(.*)` → Cloud Run rewrite in `vercel.json` is project-level and
  host-independent, so the API proxy works on every subdomain automatically. This is
  why Phase 2 needs no CORS or cookie-domain work for the API.
- Socket.IO connects **directly** to Cloud Run (`SocketContext.tsx:56`), bypassing both
  Vercel and any CDN. Item 5 above is required regardless of hosting choice.

---

## Known limitations

**SEO — client-side canonical.** This is a Vite SPA on static hosting, so
`<link rel="canonical">` is injected client-side. Google renders JS and does pick these
up, but it is less reliable than a server-rendered tag. This design does not maximize
SEO; it does not block it. If organic search becomes a primary acquisition channel,
prerendering the public menu is a separate project.

**Alias URLs pass canonical signal, not 301 link equity.** Accepted: aliases exist for
printed-QR continuity, not for search ranking.

**Phase 2 resets origin-scoped storage.** `visitorId.ts` UUIDs are per-origin, so
`MenuView.uniqueVisitors` gets a one-time discontinuity per restaurant at the subdomain
cutover — historical rows keep their old IDs, but returning-visitor detection breaks at
the boundary. Cookie consent re-prompts once for the same reason. One-time, small, and
unavoidable under any sequencing.

---

## Testing

Jest co-located `*.spec.ts` backend, Vitest frontend, 80% floor per repo convention.

**Transliteration**

- full Bulgarian alphabet coverage
- word-final `-ия` rule
- mixed Cyrillic/Latin input
- emoji-only and empty input → fallback
- 70-character input truncates at a hyphen boundary, not mid-word

**Validation**

- rejects underscore, leading hyphen, trailing hyphen, `xn--`, all-numeric,
  > 40 chars, uppercase
- rejects every blacklist entry

**Namespace integrity** (integration, real DB — these are database constraints, not
application logic)

- a live slug and a retired alias cannot collide
- a tombstoned slug cannot be claimed by another restaurant
- exactly one primary per restaurant
- the `CHECK (slug = lower(slug))` constraint rejects an uppercase insert even when the
  application layer is bypassed

**Rename**

- old row becomes an alias and still resolves
- new row becomes primary
- `Restaurant.slug` denormalization stays in sync — this is the guard for the
  denormalization decision
- aliases are never evicted, at any count
- the 3rd rename inside 30 days is rejected by the rate limit

**Release and re-claim**

- a released slug serves `410`, not `404` and not another tenant's menu
- self-service re-claim of a tombstoned slug is rejected
- super-admin re-claim succeeds and writes an `AdminAuditLog` row in the same
  transaction

**Resolver**

- primary hit, alias hit, miss → 404
- `/m/BISTRO-ORANZH` resolves and canonicalizes to lowercase
- leading/trailing whitespace in the path segment resolves

**URL builder**

- base shape, `?table=`, `?sp=`

**Regression guard**

- `/menu/public/:restaurantId` still returns 200. This encodes the printed-QR invariant
  and must fail loudly if anyone later attempts to remove that route.

---

## Open items

- **Rename rate limit of 2 per 30 days** is a starting value, not a researched one. If
  real owners hit it during normal onboarding fiddling it is too tight; loosen it before
  reaching for alias eviction, which is the option this design deliberately rejected.
- **Tombstone retention is unbounded.** Tombstoned slugs are never reclaimed, so the
  namespace only grows. At current tenant scale this is irrelevant; it is recorded here
  so that a future "clean up old slugs" instinct is understood as a QR-hijacking
  regression rather than housekeeping.
- `ROOT_DOMAIN` value is not yet decided; the production domain has not been purchased.
  **If the domain is registered on Vercel nameservers at purchase, wildcard TLS becomes
  a non-event.** Registering elsewhere first means permanent DNS-01 delegation via
  `_acme-challenge` CNAMEs. Confirm the `.bg` registrar permits free nameserver changes
  before committing.
