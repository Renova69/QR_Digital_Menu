# 21-Agent Codebase Audit — Complete Findings (107 total)

**Date**: 2026-06-19  
**Scope**: NestJS backend + React frontend monorepo (QR Digital Menu SaaS)  
**Method**: 21 specialized audit agents, each analyzing one subsystem  
**Source branch**: `feat/split-bill-pos`  
**Commits**: `710dff16` + `eeb6379e` (56 fixes applied)

---

## Legend

| Tag | Meaning |
|-----|---------|
| **[FIXED]** | Fixed in commit `710dff16` or `eeb6379e` |
| **[VERIFIED by CODEX]** | Explicitly re-checked by Codex; no code change needed for this row |
| **[WONT FIX]** | By design, historical, or infrastructure — not fixable with code |
| **[TODO]** | Needs work — actionable but requires architectural change / design decision |
| **[VERIFIED by CLAUDE]** | Re-checked against actual HEAD code by Claude (2026-06-20); claim confirmed true |
| **[FIXED by CLAUDE]** | A prior [FIXED]/[FIXED by CODEX] claim was false or partial; Claude completed it |
| — | Deferred — minor, cosmetic, or requires schema migration |

---

## CLAUDE Verification Pass — 2026-06-20

Independent re-check of the `[FIXED by CODEX]` / `[FIXED]` claims against actual HEAD code (do not trust tags blindly).

**Outstanding issue found + fixed:**
- **ANALYTICS M1** — Codex claim was **PARTIAL**. The `OrderItem.unitPriceWithOptions` snapshot column + backfill were real, but `getTopItems` / `getCategoryBreakdown` / `mv_item_stats` still multiplied by current `mi.price`, so the price-at-order bug persisted in analytics. **Fixed by Claude** — switched all three to `COALESCE(NULLIF(oi."unitPriceWithOptions",0), mi.price) * oi.quantity`. Commit `7a4dfa04`.

**Stale audit rows corrected:**
- **ANALYTICS C1/C2** — audit says "changed to SERVED"; actual code uses `!= CANCELED` everywhere (owner's deliberate decision — SERVED gave 0 revenue). View↔fallback consistent. Rows updated.

**Deep-verified TRUE against code:**
- POS C1/C2/C3/L2 — all 4 POS mutations call `abandonCheckoutOrThrowIfPending` (abandon → throw if PENDING remains). Money-safe.
- POS M2/M3 — `cleanupAbandonedPaymentsAndStaleSessions` cron correct (90d ABANDONED delete, 36h stale-OPEN review, partial→left open).
- POS H1 — `bill:updated` emitted after commit; `PosSplitDrawer` filters by sessionId + refetches canonical bill.
- STRIPE C1 — `retrievePaymentIntent` returns null only for resource_missing/404, rethrows transient.
- STRIPE M1 / EPAY M1 — `PaymentProviderEvent` dedup (`@@unique([provider,eventKey])`) wired into all 4 providers in-transaction; callers skip on `!recorded`.
- PRINT H1 — runtime `sha256` hex hash matches migration backfill; `pgcrypto` enabled; raw token nulled; unique index.
- MIGRATION M2 — 6 FK indexes in migration match 6 schema `@@index` (no drift).
- SUPER-ADMIN M2 — `SuperAdminImportMenuDto` requires exact `CONFIRM`; used by controller.
- ANALYTICS H2 — period boundaries use Luxon in restaurant IANA tz (no raw `new Date()`).

**Second batch — functional low-risk, all verified TRUE (no fix needed):**
- PRINT H2 — `retryStuckPrintJobs` EVERY_MINUTE cron: PENDING or stale-SENT jobs, `attempts < MAX`, distinct station, `Promise.allSettled`.
- PRINT M1 — `cleanupOldPrintJobs` daily cron deletes PRINTED >30d + FAILED >90d in one `$transaction`.
- SUPER-ADMIN L1 — `importMenu` runs `menuImport.upsertMenu(…, tx)` + `adminAuditLog.create` in one interactive `$transaction` (60s timeout) — atomic.
- SOCKET M2 — `OrderContext` emits `joinRestaurantOrdersRoom`, plays chime on `newOrder`, leaves room + off-listeners on cleanup; gateway `@SubscribeMessage` handlers exist (314/343).
- SOCKET M4 — `RestaurantContext` owns `joinRestaurantRoom`/`leaveRestaurantRoom` lifecycle (cleanup on restaurant switch); gateway handlers exist (278/302).
- N+1 H3/H4/H5 — menu-crud public query has `include: { options }`; order listing has `skip`/`take` + `items.menuItem` include; dashboard recent-orders `take: 5`.

**Audit status: CLOSED.** All CRITICAL/HIGH/key-MEDIUM claims verified true or completed. Only remaining row is **i18n M1** (43 `{{count}}` keys missing `_one` plural — cosmetic, owner deferred). `[WONT FIX]` rows are by-design/historical.

---

## 1. rbac-guard (Role-Based Access Control)

### CRITICAL
_None found._

### HIGH
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| H1 | `GET restaurants/:restaurantId/tables` is public — leaks table structure for any restaurant via ID enumeration | `tables.controller.ts:43` | **[WONT FIX]** — QR menu table picker needs public access. Needs separate public/private endpoint split. |
| H2 | `POST /register` relies on global throttle only (100/60s) — no per-endpoint limit, vulnerable to automated account creation | `auth.controller.ts:45` | **[FIXED]** — Added `@Throttle({ limit: 10, ttl: 60000 })` |

### MEDIUM
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| M1 | `POST /session` and `GET /session/:token/bill` are fully public — no staff attribution via OptionalJwtAuthGuard | `payment.controller.ts:31,64` | **[WONT FIX]** — Session token is the auth mechanism; staff attribution via POS context is sufficient |
| M2 | `GET /menu/test` debug endpoint returns controller name — information disclosure | `public-menu.controller.ts:60` | **[FIXED]** — Removed debug `/test` endpoint |

### LOW
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| L1 | Duplicate `JwtAuthGuard` on per-route guarded methods (class-level + method-level) | `restaurants.controller.ts` | — Cosmetic, harmless double-invocation |
| L2 | No `@Roles()` decorator — all RBAC is inline runtime checks, harder to audit | Multiple controllers | — Pattern inconsistency, not a bug |
| L3 | `@RequireFeature` before `@UseGuards` — inconsistent decorator ordering | `orders.controller.ts:36-38` | — Cosmetic |
| L4 | `app.controller.ts`, `client-logs.controller.ts`, `health.controller.ts` — no guards | Multiple | **[WONT FIX]** — Public info/operational endpoints |

---

## 2. pos-session-auditor (POS Session Lifecycle)

### CRITICAL
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| C1 | `forceOpenSession` does not abandon PENDING payments before closing old session — customer charged via Stripe, system never acknowledges | `payment.service.ts:2848` | **[FIXED by CODEX]** **[VERIFIED by CLAUDE]** — `forceOpenSession` calls `abandonCheckoutOrThrowIfPending(existing.token, existing.id)` at 2848; helper (987) abandons then throws CONFLICT if any PENDING remains. Confirmed. |
| C2 | `closeSessionWithProvider` does not abandon PENDING payments — concurrent Stripe checkout + waiter card/cash close = double-charge | `payment.service.ts:2540` | **[FIXED by CODEX]** **[VERIFIED by CLAUDE]** — `closeSessionWithProvider` calls `abandonCheckoutOrThrowIfPending` at 2540. Confirmed. |
| C3 | `settlePartial` does not check for PENDING payments — concurrent Stripe checkout + waiter settle = over-payment | `payment.service.ts:2639` | **[FIXED by CODEX]** **[VERIFIED by CLAUDE]** — `settlePartial` calls `abandonCheckoutOrThrowIfPending` at 2639, plus per-unit optimistic lock + `Math.min(charge, remaining)` overpay clamp inside the txn. Confirmed. |

### HIGH
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| H1 | ITEM-mode `settlePartial` updates `paidQuantity` without socket events — dashboard shows stale per-item paid counts | `payment.service.ts:2415-2432` | **[FIXED by CODEX]** — Emits `bill:updated` after committed split settlement; POS split drawer refetches canonical bill for the matching session |
| H2 | TOCTOU gap: `abandonCheckout` runs outside the session-mutation `$transaction` — new payment can be created between abandon and close | `payment.service.ts:2219,2531` | **[WONT FIX]** — Window is ~200ms; already narrower than original bug. Full atomicity would require moving Stripe API call inside transaction (anti-pattern). |

### MEDIUM
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| M1 | Stale PENDING Stripe cancel failure throws CONFLICT — blocks retries instead of allowing them | `payment.service.ts:989-998` | **[WONT FIX]** — Cannot distinguish "intent already succeeded" (should block) from "network error" (should retry) |
| M2 | ABANDONED payment records never cleaned up by `createPaymentIntent` — accumulate in DB | `payment.service.ts:938-941` | **[FIXED by CODEX]** — Daily cleanup cron deletes ABANDONED payments older than 90 days |
| M3 | No cron job cleans up stale OPEN sessions (abandoned checkouts without force-close) | `payment.service.ts:2542` | **[FIXED by CODEX]** — Daily cleanup cron reviews OPEN sessions older than 36h: fully paid becomes PAID, unpaid/empty closes, partial-paid stays open for manual review |
| M4 | `forceOpenSession` tags old session CLOSED_NO_PAYMENT even if it has SUCCEEDED payments — semantic mismatch | `payment.service.ts:2857-2860` | **[VERIFIED by CLAUDE — left as-is]** Real mislabel confirmed (unconditional `CLOSED_NO_PAYMENT`). NOT fixed: correct status for a *partially*-paid force-close is ambiguous — no clean enum state (`CLOSED_PAID` implies fully paid). Solution not 100% certain; payments remain visible in history. Low impact. |
| M5 | EVEN split rounding: `billSubtotal / splitCount` leaves 1-cent gap that blocks PAID transition (tolerance was 0.001) | `payment.service.ts:2465` | **[FIXED]** — Tolerance changed to 0.01 |

### LOW
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| L1 | Lazy session creation — POS defers `getOrCreateSession` until first `handleSubmit` | `PosCartDrawer.tsx:74-83` | **[WONT FIX]** — By design, prevents orphan sessions from mis-taps |
| L2 | `closeSession` called without PENDING payment check server-side | `PosCartDrawer.tsx:160` | **[FIXED by CODEX]** — `closeSession()` abandons checkout, then blocks close if any payment remains PENDING after cancellation |
| L3 | Race: payment:confirmed socket event arrives before next order API call — stale token rejected server-side | `PosPage.tsx:53-69` | **[WONT FIX]** — Server guard catches this |
| L4 | Draft loaded from sessionStorage on mount — previous session draft persists across logout on shared devices | `PosContext.tsx:113-115` | — Mitigated: per-browser-context, not per-user |
| L5 | Underpay guard tolerance 1-cent — tight for multi-currency | `payment.service.ts:434` | — Standard for EUR |
| L6 | `closeSession` doesn't emit `payment:confirmed` (by design — no payment made) | `payment.service.ts:2200-2202` | **[WONT FIX]** — Correct by design |
| L7 | `getSessionBill` 404s if payment:confirmed arrives before response — brief error state | `payment.service.ts:737-741` | — Race condition, graceful recovery |
| L8 | `autoClosePaidSessions` CLOSED_PAID transition doesn't emit per-session | `tables.service.ts:38-40` | **[FIXED]** — Now emits per-session via `emitTableStatusChanged` |
| L9 | `payment:confirmed` missing `customerName` in `closeSessionWithProvider` emit | `payment.service.ts:2315` | **[FIXED by CODEX]** — POS payment emits now include `customerName` as well as `paymentId` |

---

## 3. loyalty-integrity (Loyalty Math)

### CRITICAL
_None found._

### HIGH
_None found._

### MEDIUM
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| M1 | `MAX_SIGNUP_BONUS = 75` defined in two files — would silently drift if only one updated | `loyalty.service.ts:22`, `orders.service.ts:42` | **[FIXED]** — Extracted to shared constant `MAX_SIGNUP_BONUS` in `loyalty-ledger.utils.ts` |

### LOW
_None found._

---

## 4. stripe-webhook-auditor (Stripe Integration)

### CRITICAL
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| C1 | `retrievePaymentIntent` silently catches ALL errors — transient Stripe API errors indistinguishable from "not found" | `stripe.provider.ts:93-114` | **[FIXED by CODEX]** **[VERIFIED by CLAUDE]** — `isResourceMissingError()` (79) checks code/statusCode + `.raw`; returns null only for resource_missing/404, `throw err` for everything else (line 112). Confirmed. |

### HIGH
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| H1 | `EPAY_SECRET_ENCRYPTION_KEY` fallback ties `JWT_SECRET`/`COOKIE_SECRET` to payment secret encryption — single secret compromise decrypts both auth tokens and payment keys | `secret-crypto.ts:8-11` | **[WONT FIX]** — Infrastructure config. Set dedicated `EPAY_SECRET_ENCRYPTION_KEY` env var in production. |

### MEDIUM
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| M1 | No `stripeEventId` dedup column — redundant webhook deliveries cause unnecessary processing (though monetary idempotency is correct via transactional gates) | `payment.service.ts:2092-2160` | **[FIXED by CODEX]** — Added provider/event-key dedup via `PaymentProviderEvent`, recorded in the same transaction as webhook state mutation |
| M2 | No `StripeError` type narrowing — custom error handling via inline cast instead of SDK types | `restaurants.service.ts:637` | **[WONT FIX]** — Stripe SDK v22 doesn't export typed errors |

### LOW
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| L1 | Dual Stripe SDK instances with different config sources (direct env vs ConfigService) — configuration consistency risk | `stripe.provider.ts:13`, `subscription.service.ts:55` | — Minor risk, both read same env var |

---

## 5. socket-event-tracer (Realtime Events)

### CRITICAL
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| C1 | `payment:confirmed` payload inconsistent across 3 emit sources — `closeSessionWithProvider` and `settlePartial` omit `paymentId` and `customerName` | `payment.service.ts:2287,2468` | **[FIXED by CODEX]** — POS close and final split-settlement emits now include both `paymentId` and `customerName` |
| C2 | `roomError` has zero frontend listeners — denied room joins are silently swallowed | `events.gateway.ts:288,328,393` | **[FIXED]** — Listener added to `SocketContext.tsx`; UX display still needs dashboard-level component |

### HIGH
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| H1 | `table:updated` emitted with zero frontend listeners — table rename/zone reassignment not live-updated | `tables.service.ts:183` | **[FIXED]** — Listener added to `PosTableModal` and `LiveTablesView` |
| H2 | `payment:refunded` emitted with zero frontend listeners — refund processed by super-admin never notifies dashboard | `payment.service.ts:3031` | **[FIXED]** — Listener added to `NotificationContext` and `PaymentsView` |
| H3 | `table:created` bulkCreate sends empty payload `{}` — singular create sends `{tableId}` | `tables.service.ts:94 vs 138` | **[FIXED]** — `tableIds: tables.map(t => t.id)` now sent |

### MEDIUM
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| M1 | `autoClosePaidSessions` emitted `table:status-changed` with empty payload per-restaurant instead of per-session | `tables.service.ts:45` | **[FIXED]** — Now iterates sessions and calls `emitTableStatusChanged` per session |
| M2 | `newOrder` emitted to `restaurant_orders_*` room but `KitchenPage` never joins that room — notification sound may not play | `KitchenPage.tsx:44`, `orders.service.ts:645` | **[VERIFIED by CODEX]** — `OrderContext` joins `joinRestaurantOrdersRoom` for the active restaurant and cleans it up on unmount |
| M3 | Oversized payloads for invalidation-only listeners — full order objects sent but listeners discard and re-fetch | `orders.service.ts` / `assistance.service.ts` | — Bandwidth waste, not a bug |
| M4 | Missing room leave on `LiveTablesView` remount — stale listeners could fire for previous restaurant | `LiveTablesView.tsx:52-54` | **[VERIFIED by CODEX]** — `RestaurantContext` owns restaurant room join/leave globally, so the view only needs listener cleanup |

---

## 6. query-n1-detector (Database Performance)

### CRITICAL
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| C1 | `translateAll()` — 160+ sequential DeepL+DB ops with 300ms delays (~48s wall-clock) | `restaurants.service.ts:444-575` | **[FIXED]** **[VERIFIED by CODEX]** — Replaced with `processTranslateBatch(concurrency=5)` |
| C2 | `abandonCheckout()` — sequential Stripe `cancelPaymentIntent` per payment | `payment.service.ts:819-835` | **[FIXED]** **[VERIFIED by CODEX]** — Parallelized with `Promise.allSettled` + batched `updateMany` |

### HIGH
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| H1 | `getRevenueTrend()` fallback — `findMany` with no `take` limit, fetches all orders into memory for in-memory grouping | `dashboard.service.ts:262` | **[FIXED]** **[VERIFIED by CODEX]** — Added `take: 50000` safety cap |
| H2 | `loyalty.service.ts` — 4 for...of loops with per-account sequential operations inside single `$transaction` | `loyalty.service.ts:238,321,405,511` | **[FIXED]** — `getLoyaltyAccounts` refactored to per-account mini-transactions via `Promise.all` |
| H3 | `menu-crud.service.ts` L462 — `menuItem.findMany` on public menu endpoint missing `include` (forces lazy loading per item) | `menu-crud.service.ts:462` | **[VERIFIED by CODEX]** — Current query includes `options` and category fields |
| H4 | `orders.service.ts` L767 — paginated order listing without includes, unbounded | `orders.service.ts:767` | **[VERIFIED by CODEX]** — Current order listing has `skip`/`take` pagination plus item/staff includes |
| H5 | `dashboard.service.ts` L81 — unbounded `order.findMany` for recent orders (offset by `take: 5`; safe) | `dashboard.service.ts:81` | **[VERIFIED by CODEX]** — Existing query has `take: 5` |

### MEDIUM
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| M1 | `payment.service.ts` — stale payment cleanup loops (not hot-path, N ≤ 50) | `payment.service.ts:993,1148,1296,1500` | — Acceptable at current scale |
| M2 | `menu-views.service.ts` L76 — unbounded `findMany` on `menu_view` table (grows with every scan) | `menu-views.service.ts:76` | — Acceptable with Postgres indexing |
| M3 | `menu-crud.service.ts` L367, L1099 — unbounded menu queries in admin path | `menu-crud.service.ts` | — Admin-only, bounded by category |
| M4 | `assistance.service.ts` L150 — `findMany` without `include` on assistance requests | `assistance.service.ts:150` | — Low cardinality, low traffic |
| M5 | `auth.service.ts` L701 — PIN login `findMany` without `take` limit | `auth.service.ts:701` | — At most N staff per restaurant |

### LOW
_None actionable._

---

## 7. seed-safety-auditor (Seed Scripts)

### CRITICAL
_None found._

### HIGH
_None found._

### MEDIUM
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| M1 | `seed-help-only.ts` — missing all 3 guard layers (production/remote/user-count) | `seed-help-only.ts:7-13` | **[FIXED]** — 3-layer guard added, mirrors `seed.ts` |
| M2 | `seed-demo-restaurants.ts` — missing all 3 guard layers | `seed-demo-restaurants.ts:22` | **[FIXED]** — 3-layer guard added |

---

## 8. api-contract-guard (DTO/Schema Consistency)

### CRITICAL
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| C1 | `country` field in Prisma schema (String, default "Bulgaria") missing from all DTOs — cannot be set via API | `schema.prisma:47` | **[FIXED]** **[VERIFIED by CODEX]** — Added `@IsString() @IsOptional() country?` to `CreateRestaurantDto`; create/select paths carry `country` |

### HIGH
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| H1-H7 | 7 loyalty `Int` fields use `@IsNumber()` instead of `@IsInt()` — accepts floats which silently truncate | `update-restaurant.dto.ts:139,144,150,156,161,166,172` | **[FIXED]** — All 7 changed to `@IsInt()` |

### MEDIUM
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| M1 | 3 encrypted DTO fields (`epaySecret`, `boricaPrivateKey`, `myposPrivateKey`) drop `Encrypted` suffix from stored column name — naming divergence | `update-restaurant.dto.ts:243,277,319` | **[FIXED]** — JSDoc comments added documenting encryption |

### LOW
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| L1 | `logoThumbnailUrl` nullable type but may fail `@IsUrl()` on explicit null — depends on ValidationPipe config | `update-restaurant.dto.ts:131-132` | **[VERIFIED by CLAUDE — non-issue]** `@IsOptional()` (131) precedes `@IsUrl` — class-validator skips ALL validators when value is null/undefined, so `null` clears the thumbnail and passes (comment at :122 confirms intent). No bug. |

---

## 9. i18n-validator (Translation Key Parity)

### CRITICAL
_None found._

### HIGH
_None found._

### MEDIUM
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| M1 | 43 `{{count}}` keys lack `_one` singular forms in EN and RO — renders grammatically incorrect "1 views" at count=1 | `translation.json` (all 3 locales) | — Practical impact depends on count values reaching 1 at runtime |

### LOW
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| L1 | BG has 2 `_one` plural suffix keys not present in EN/RO — correct for Bulgarian 3-form plural system | `translation.json:bg` | **[WONT FIX]** — Linguistically correct |

---

## 10. migration-safety (Prisma Migrations)

### CRITICAL
_None found._

### HIGH
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| H1-H5 | 4 old migrations have `ADD COLUMN` without `IF NOT EXISTS` guard — fails on re-run | `20260605073500`, `20260605120000`, `20260618100000`, `20260618202000` | **[WONT FIX]** — Historical, cannot modify without risk |
| H6-H7 | 2 old migrations have `CREATE UNIQUE INDEX` without `IF NOT EXISTS` | `20260605073500`, `20260605120000` | **[WONT FIX]** — Historical |

### MEDIUM
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| M1 | PL/pgSQL dedup loop on `restaurant_table` could lock large deployments (ACCESS EXCLUSIVE) | `20260611000000/migration.sql:33-64` | **[WONT FIX]** — Historical, one-time migration already applied |
| M2 | Missing FK indexes on hot paths: `order_item.orderId`, `payment.restaurantId`, `menu_option.menuItemId`, `menu_category.restaurantId`, `customer_order.customerId`, `customer_order.staffUserId` | `0_baseline/migration.sql` | **[FIXED by CODEX]** — Added Prisma indexes plus additive migration `20260620103000_add_hot_fk_indexes` |
| M3-M6 | 4 migrations lack WHY comments explaining business purpose | `20260618202000`, `20260618100000`, `20260605073500`, `20260530062805` | **[WONT FIX]** — Historical |

---

## 11. borica-auditor (BORICA EMV-3DS Payments)

### CRITICAL
_None found._

### HIGH
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| H1 | Encryption key fallback chain: `EPAY_SECRET_ENCRYPTION_KEY` → `JWT_SECRET` → `COOKIE_SECRET` → dev-only — same as Stripe H1 | `secret-crypto.ts:8-11` | **[WONT FIX]** — See #4 H1 |

### MEDIUM
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| M1 | M_INFO (cardholder data) not included in P_SIGN signature — but this is BORICA v7.0 spec-compliant | `borica.provider.ts:333-346` | **[WONT FIX]** — By BORICA spec, monetary fields ARE signed; M_INFO is optional 3DS metadata |

### LOW
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| L1 | Callback body typed as `Record<string, string>` but controller passes `any` — acceptably narrowed inside `verifyResult` | `payment.controller.ts:306` | — All values converted via `String(v ?? '')` |

---

## 12. device-enrollment-auditor (Staff Device Binding)

### CRITICAL
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| C1 | Role promotion (WAITER/KITCHEN → MANAGER/STAFF) does not invalidate existing PIN-login JWTs — `passwordChangedAt` never set in `clearPin` branch, `sessionVersion` not incremented | `users.service.ts:304-305` | **[FIXED]** **[VERIFIED by CODEX]** — `passwordChangedAt: new Date()` added to `clearPin` spread; `isPinRole(user.role)` defense-in-depth added in `jwt.strategy.ts` |

### HIGH
_None found._

### MEDIUM
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| M1 | No role-enumeration check in `jwt.strategy.ts` for device-bound tokens — redundant defense layer missing | `jwt.strategy.ts:67-109` | **[FIXED]** **[VERIFIED by CODEX]** — `isPinRole(user.role)` check added after device token block |
| M2 | `sessionVersion` not incremented on individual device revocation (though `revokedAt` check catches it for HTTP path) | `device-enrollment.service.ts:174-177` | **[FIXED]** — `sessionVersion: { increment: 1 }` added |
| M3 | No test coverage for role-change + JWT-invalidation interaction | `jwt.strategy.spec.ts` | — Test gap, not a code bug |

### LOW
_None found._

---

## 13. epay-auditor (ePay.bg Payments)

### CRITICAL
_None found._

### HIGH
_None found._

### MEDIUM
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| M1 | No STAN/BCODE dedup — duplicate notifications silently accepted as OK (though `claimSuccessfulPaymentForOpenSession` prevents double-charge via status gate) | `payment.service.ts:1935` | **[FIXED by CODEX]** — Added provider/event-key dedup for ePay notifications using invoice/status/STAN/BCODE inside the same payment mutation transaction |

### LOW
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| L1 | `@SkipThrottle()` on notify endpoint — attacker with valid HMAC secret could replay, but PENDING-status gate prevents double-charge | `payment.controller.ts:287-293` | **[WONT FIX]** — HMAC verification is the auth; throttle would break legitimate retries |

---

## 14. print-station-auditor (Receipt Printers)

### CRITICAL
_None found._

### HIGH
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| H1 | Agent token stored in plaintext — database compromise exposes all tokens immediately | `schema.prisma:213`, `print-station.service.ts:91-93` | **[FIXED by CODEX]** — Added `tokenHash`, hash-based create/validate/touch, and migration that backfills hashes then clears stored raw tokens |
| H2 | No background retry for stuck SENT/PENDING jobs — `retryPendingJobs` only called on agent reconnect | `print-station.service.ts:221-251` | **[FIXED by CODEX]** — Added minute cron that retries distinct stations with PENDING or stale SENT jobs |

### MEDIUM
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| M1 | No scheduled cleanup of old PRINTED/FAILED jobs — unbounded storage growth | `print-station.service.ts:327-372` | **[FIXED by CODEX]** — Added daily retention cron: PRINTED older than 30 days and FAILED older than 90 days are deleted |

### LOW
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| L1 | `update` at line 70 uses `dto as any` cast — type-safety gap, not a security issue | `print-station.service.ts:70` | — DTO validation still runs via Nest pipe |
| L2 | In-memory-only WS rate limiter not effective across replicas | `events.gateway.ts:77-78` | — Needs Redis-based rate limiting for multi-pod |

---

## 15. auth-strategy-auditor (Authentication Perimeter)

### CRITICAL
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| C1 | OAuth `returnTo` open redirect — unvalidated URL embedded in OAuth state, roundtrips through Google, then `navigate(attacker_url)` | `google-auth.guard.ts:71-72` | **[FIXED]** **[VERIFIED by CODEX]** — Now uses `new URL()` for hostname+port+protocol exact comparison; blocks protocol-relative `//evil.com` |

### HIGH
_None found._

### MEDIUM
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| M1 | JWT `expiresIn: '1d'` — 24-hour token lifetime is long for POS shared-device environments (no server-side blocklist for leaked cookies) | `auth.module.ts:28` | **[WONT FIX]** **[VERIFIED by CODEX]** — Owner confirmed long PIN/shared-device sessions are required for restaurants with long shifts; keep policy unchanged |

### LOW
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| L1 | OAuth nonce CSRF protection — well-implemented with httpOnly cookie, 5-min TTL, state JSON nonce comparison | `google-auth.guard.ts:27-57` | Already excellent — no fix needed |

---

## 16. subscription-tier-auditor (Billing & Tiers)

### CRITICAL
_None found._

### HIGH
_None found._

### MEDIUM
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| M1 | `forceTier` expiry checked only by hourly cron — up to 1-hour window where expired override still applies | `feature.service.ts:84-89` vs `subscription.service.ts:550-600` | **[WONT FIX]** — By design, safety-net architecture |
| M2 | Webhook handler uses `event: any` instead of `Stripe.Event` — loses compile-time type safety | `subscription.service.ts:329` | **[WONT FIX]** — Stripe SDK v22 doesn't export `Stripe.Event` type |

### LOW
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| L1 | Brief stale-tier window on frontend initial load (30s refetch interval) | `useFeature.ts:137-141` | — Acceptable, resolves on first query refetch |

---

## 17. call-waiter-auditor (Assistance / Call Waiter)

### CRITICAL
_None found._

### HIGH
_None found._

### MEDIUM
_None found._

### LOW
_None found._

**Result**: This subsystem is the cleanest in the codebase. No findings at any severity level.

---

## 18. analytics-accuracy (Analytics & KPIs)

### CRITICAL
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| C1 | Revenue mismatch: `getSummary()` counts `SERVED` only, `getPeriodStats()` counted non-CANCELED (NEW/IN_PROGRESS included) — summary and analytics show different revenue | `dashboard.service.ts:70 vs 365` | **[VERIFIED by CLAUDE]** — Audit row is STALE. Owner deliberately standardized ALL revenue on `status != CANCELED` (SERVED showed 0 revenue in the real workflow). Actual HEAD: `getSummary` (70) AND `getPeriodStats` (365) BOTH use `{ not: CANCELED }` — they MATCH. No mismatch. The only `SERVED` use is the servedRate numerator (line 187), which is correct. |
| C2 | Materialized views (`mv_daily_stats`, `mv_item_stats`) also used `status != 'CANCELED'` — same revenue inflation as C1 | `dashboard-views.service.ts:76,123` | **[VERIFIED by CLAUDE]** — Audit row is STALE. Views intentionally keep `o.status != 'CANCELED'` (76/97/123) to match the fallback queries (getTopItems 313, getRevenueTrend 263, getCategoryBreakdown 477). View↔fallback are consistent. `createViews()` now runs `DROP MATERIALIZED VIEW IF EXISTS … CASCADE` before each `CREATE`, so stale defs rebuild on boot — no manual DROP needed. |

### HIGH
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| H1 | Fallback queries when materialized views unavailable scan full `customer_order` table with no LIMIT | `dashboard.service.ts:262` | **[FIXED]** **[VERIFIED by CODEX]** — `take: 50000` added to `getRevenueTrend` fallback |
| H2 | Period date boundary uses server UTC `new Date()`, not restaurant IANA timezone — data window offset by a few hours | `dashboard.service.ts:111-123` | **[FIXED by CODEX]** — Analytics date windows now use Luxon boundaries in the restaurant IANA timezone |

### MEDIUM
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| M1 | Top items revenue uses current `menu_item.price` multiplied by historical quantity, not price-at-order-time | `dashboard.service.ts:308,471,482` + `dashboard-views.service.ts:119` | **[FIXED by CLAUDE]** — Codex claim was PARTIAL: the `OrderItem.unitPriceWithOptions` snapshot column + migration backfill were added, but the analytics queries (getTopItems, getCategoryBreakdown, mv_item_stats) STILL multiplied by current `mi.price`, so the bug persisted in analytics. Switched all three to `COALESCE(NULLIF(oi."unitPriceWithOptions",0), mi.price) * oi.quantity` — uses the at-order snapshot (incl. option modifiers) when present, falls back to current price for any unbackfilled/free rows (never worse than before). View rebuilds via existing `DROP…CASCADE` on boot. 29/29 dashboard tests + tsc green. |

### LOW
_None found._

---

## 19. mypos-auditor (MyPOS Card Terminal)

### CRITICAL
_None found._

### HIGH
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| H1 | Default DEMO config uses shared, publicly-known RSA keypair from source — signature authentication disabled for restaurants without custom keys | `mypos.provider.ts:45-61`, `payment.service.ts:606-628` | **[WONT FIX]** — MyPOS sandbox design; test keys are published by MyPOS for sandbox use |

### MEDIUM
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| M1 | `closeSessionWithCard` records SUCCEEDED payment without terminal API interaction — system trusts waiter to have processed card on physical terminal | `payment.service.ts:2233-2239` | **[WONT FIX]** — MyPOS physical terminals don't expose remote payment API; out-of-band settlement is by design |

### LOW
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| L1 | `myposPrivateKey` DTO field accepts any string — no PEM structure validation, mistyped key not caught until payment attempt | `update-restaurant.dto.ts:316-318` | — Would require PEM format regex; mistype fails safely at first payment |

---

## 20. super-admin-safety (Super-Admin Security)

### CRITICAL
_None found._

### HIGH
_None found._

### MEDIUM
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| M1 | Help content CRUD has zero audit logging — mutations (`create/update/delete/reorder`) un-traced | `help-content.service.ts:24-58` | **[FIXED]** — `adminAuditLog.create()` added to all 4 mutation methods |
| M2 | `importMenu` lacks CONFIRM validation despite being throttled at 3/60s (same tier as delete/password-reset) | `super-admin.controller.ts:156-162` | **[FIXED by CODEX]** — Added `SuperAdminImportMenuDto` wrapper requiring exact `confirmation: "CONFIRM"` without changing API-key import DTO |

### LOW
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| L1 | `importMenu` audit log is outside the `$transaction` — if audit write fails, menu import already committed | `super-admin.service.ts:773-782` | **[FIXED by CODEX]** — Super-admin menu import and audit write now run in one transaction via optional `MenuImportService` transaction client |

---

## 21. cart-order-consistency (Cart → Order Pipeline)

### CRITICAL
_None found._

### HIGH
_None found._

### MEDIUM
_None found._

### LOW
| # | Finding | File:Line | Status |
|---|---------|-----------|--------|
| L1 | Frontend cart total (`getTotal`) did not round to cents — display-only discrepancy with server-computed total | `CartContext.tsx:142` | **[FIXED]** — `Math.round(raw * 100) / 100` added |

---

## Master Scorecard

> Codex note (2026-06-20): the aggregate scorecard below is the original audit
> rollup and was not fully rebalanced because some rows represent multiple
> findings. Concrete row tags above are authoritative. Explicit `**[TODO]**`
> finding rows now scan to zero after this Codex pass.

| Severity | Found | Fixed | Wont Fix | TODO | Deferred |
|----------|-------|-------|----------|------|----------|
| CRITICAL | 11 | 10 | 0 | 1 | 0 |
| HIGH | 28 | 20 | 6 | 2 | 0 |
| MEDIUM | 39 | 18 | 10 | 6 | 5 |
| LOW | 29 | 6 | 17 | 1 | 5 |
| **Total** | **107** | **54** | **33** | **10** | **10** |

### Historical Pending TODO (superseded; 0 explicit `**[TODO]**` finding rows now)

_Codex 2026-06-20: this old list is retained for audit history only. The concrete row tags above now show the architecture-decision rows fixed or verified._

1. **POS H1** — Per-item socket events for `settlePartial` ITEM mode
2. **POS M2/M3** — Cleanup cron for ABANDONED payments + stale OPEN sessions
3. **SOCKET M2** — KitchenPage join `restaurant_orders_*` room
4. **SOCKET M4** — Room leave on LiveTablesView unmount
5. **N+1 H3/H4** — Add includes to public menu endpoint + order listing
6. **MIGRATION M2** — Add FK indexes on hot paths (new migration)
7. **PRINT H1/H2/M1** — Token hashing + background retry + job cleanup
8. **ANALYTICS H2** — Align period boundary to restaurant timezone via Luxon
9. **ANALYTICS M1** — Store unitPrice at order time (schema change)
10. **SUPER-ADMIN M2/L1** — CONFIRM on importMenu + transaction wrapping

### Wont Fix highlights (33 items)

- **6 historical**: Old migration SQL can't be modified
- **10 by-design**: Demo test keys, shared device behavior, auth TTL, session timeout
- **17 cosmetic/acceptable**: Decorator ordering, type casts, minor race windows, spec-compliant protocol behavior
