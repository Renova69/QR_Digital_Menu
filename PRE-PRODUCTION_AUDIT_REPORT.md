  Pre-Production Review Report

  Date: 2026-06-30 | Branch: main (just merged fix/translation-i18n-remediation)
  Auditors: 5 parallel specialist agents (payment, auth, orders/loyalty, translation/menu, frontend)
  Mode: Read-only inspection — no fixes applied

  ---
  A. Executive Summary

  Codebase is production-capable with solid foundations: correct Stripe webhook signature verification, JWT httpOnly
  cookie architecture, Prisma PgBouncer compatibility in most paths, and no plaintext secret exposure. However, 16
  HIGH-severity bugs were found across all five modules — several of which involve money, double-issuance of auth
  tokens, or irreversible data corruption under concurrent load. No single CRITICAL issue (direct RCE, SQL injection,
  plaintext creds) was found, but three HIGH auth findings and one HIGH payment finding approach critical territory.

  Bottom line: Do not run this in production under concurrent load until the 5 highest-severity findings (auth TOCTOU
  ×2, cross-restaurant session injection, loyalty signup double-award, refund/allocation split) are patched.

  ┌──────────┬───────┐
  │ Severity │ Count │
  ├──────────┼───────┤
  │ CRITICAL │ 0     │
  ├──────────┼───────┤
  │ HIGH     │ 16    │
  ├──────────┼───────┤
  │ MEDIUM   │ 23    │
  ├──────────┼───────┤
  │ LOW      │ 18    │
  └──────────┴───────┘

  ---
  B. Project Architecture Summary

  Frontend: Vite + React 18 + TanStack Query + i18next + socket.io-client. SPA routing via React Router v7. State split
  across 9 React Contexts (Auth, Restaurant, Menu, Cart, Order, Assistance, Socket, Notification, Pos). No global state
  library — contexts + TanStack Query. Build target: Vercel.

  Backend: NestJS 11 monolith + Prisma 6 on Neon Postgres (PgBouncer transaction mode). Modules: Config, Throttler,
  Prisma, Subscription, Auth, Restaurants, Menu, Orders, Assistance, Dashboard, Tables, Health, Feedback, Translation,
  Storage, Events, Loyalty, Payment, MenuImport, HelpContent. Deploy: Cloud Run (GCP).

  Database: Hosted Neon Postgres. PgBouncer transaction mode — no advisory locks, no LISTEN/NOTIFY, no SET inside
  $transaction. Prisma 6 interactive transactions used throughout.

  External services: Stripe Connect (payments + subscriptions), DeepL (translations), Cloudflare R2 (image storage),
  Resend (email), Google OAuth, BORICA EMV-3DS, ePay.bg, MyPOS.

  Auth model: JWT in httpOnly cookie. CSRF double-submit cookie pattern. Google OAuth + Email OTP + PIN login
  (WAITER/KITCHEN only). Super-admin guard separate from restaurant RBAC.

  Public-facing surfaces: /menu/:restaurantId (unauthenticated), /checkout, /staff/pos (PIN-gated), /api/menu/public/:id
  (no auth, lazy DeepL translation).

  ---
  C. Main App Flows Discovered

  1. Customer QR scan → public menu → add to cart → checkout — unauthenticated, session-token–based, DeepL-translated on
  demand
  2. Waiter POS — PIN login, table selection, order creation, payment close (card/cash)
  3. Owner dashboard — restaurant management, menu CRUD, analytics, staff management, subscription billing
  4. Payment flow — Stripe PaymentIntent → webhook → session PAID → socket push → auto-close after 5 min
  5. Loyalty loop — enroll on order, earn points (FIFO ledger), redeem at checkout, expire via nightly cron
  6. Translation pipeline — pre-warm on item save, lazy on first public request, owner-triggered "Translate All"
  7. Subscription lifecycle — Stripe Checkout, tier enforcement (FREE/Starter/Pro/Enterprise), grace period, force-tier
  admin override
  8. Onboarding wizard — new owner → Stripe Connect → table setup → tier activation

  ---
  D. Highest-Risk Features to Audit Next (Feature-by-Feature)

  ┌──────────┬─────────────────────────────┬───────────┬───────────────────────────────────────────────────────────┐
  │ Priority │           Feature           │   Risk    │                          Reason                           │
  │          │                             │   Level   │                                                           │
  ├──────────┼─────────────────────────────┼───────────┼───────────────────────────────────────────────────────────┤
  │ 1        │ Auth / session management   │ VERY HIGH │ 3 HIGH TOCTOU bugs; double JWT issuance possible          │
  ├──────────┼─────────────────────────────┼───────────┼───────────────────────────────────────────────────────────┤
  │ 2        │ Order creation + loyalty    │ VERY HIGH │ Cross-restaurant session injection; double signup bonus   │
  │          │ earn                        │           │                                                           │
  ├──────────┼─────────────────────────────┼───────────┼───────────────────────────────────────────────────────────┤
  │ 3        │ Payment refund path         │ HIGH      │ Stripe success + DB rollback failure = silent             │
  │          │                             │           │ inconsistency                                             │
  ├──────────┼─────────────────────────────┼───────────┼───────────────────────────────────────────────────────────┤
  │ 4        │ Subscription tier           │ HIGH      │ Metadata forgery possible; silent FREE downgrade on API   │
  │          │ enforcement                 │           │ error                                                     │
  ├──────────┼─────────────────────────────┼───────────┼───────────────────────────────────────────────────────────┤
  │ 5        │ Translation concurrent      │ HIGH      │ Race loses cached translations; wasteful DeepL re-calls   │
  │          │ writes                      │           │                                                           │
  ├──────────┼─────────────────────────────┼───────────┼───────────────────────────────────────────────────────────┤
  │ 6        │ Frontend cart currency      │ HIGH      │ BGN/EUR mixing in cart total shown to customer            │
  ├──────────┼─────────────────────────────┼───────────┼───────────────────────────────────────────────────────────┤
  │ 7        │ Checkout double-submit      │ HIGH      │ No synchronous guard; duplicate orders possible           │
  ├──────────┼─────────────────────────────┼───────────┼───────────────────────────────────────────────────────────┤
  │ 8        │ Loyalty point accounting    │ HIGH      │ No order state machine; back-transitions enable           │
  │          │                             │           │ double-earn                                               │
  ├──────────┼─────────────────────────────┼───────────┼───────────────────────────────────────────────────────────┤
  │ 9        │ Public menu rate limits     │ MEDIUM    │ DeepL quota exhaustion via 60 req/min per IP              │
  ├──────────┼─────────────────────────────┼───────────┼───────────────────────────────────────────────────────────┤
  │ 10       │ Email HTML injection        │ MEDIUM    │ User name injected raw into HTML email                    │
  └──────────┴─────────────────────────────┴───────────┴───────────────────────────────────────────────────────────┘

  ---
  E. Critical Issues Found Immediately

  None at CRITICAL severity. The closest are two auth TOCTOU findings and the cross-restaurant session injection — all
  HIGH.

  ---
  F. High-Priority Issues

  F-AUTH-1 — TOCTOU Race in verifyRegistration → P2002 → 500

  - file:line: apps/backend/src/auth/auth.service.ts:170–201
  - function: verifyRegistration()
  - what: findByEmail check and usersService.create not in same transaction. Two concurrent requests with same email
  both pass the check → both attempt insert → P2002 surfaces as unhandled 500.
  - why: Users can cause unhandled exceptions; under automated retry this could corrupt partial registration state.
  - severity: HIGH
  - fix: Wrap findByEmail + consumeEmailVerificationCode + usersService.create in $transaction with isolationLevel:
  'Serializable', or catch P2002 → rethrow ConflictException.
  - safe now: Yes

  F-AUTH-2 — Expired/Malformed Token Silently Anonymous on Public Endpoints

  - file:line: apps/backend/src/auth/optional-jwt-auth.guard.ts:6–9
  - function: OptionalJwtAuthGuard.handleRequest()
  - what: CLAUDE.md documents this guard "rethrows JWT errors." It does not — passport-jwt calls this.fail(info), not
  this.error(err). Expired tokens silently become anonymous. Order attribution for staff POS fails silently.
  - why: Rogue staff member with expired token submitting POS orders — all credit goes to "anonymous QR" instead of the
  waiter. Data integrity issue.
  - severity: HIGH
  - fix: Override handleRequest to inspect info: if info instanceof JsonWebTokenError || info instanceof
  TokenExpiredError, throw UnauthorizedException.
  - safe now: Yes

  F-AUTH-3 — Double JWT Issuance in exchangeImpersonation

  - file:line: apps/backend/src/auth/auth.service.ts:989–1028
  - function: exchangeImpersonation()
  - what: TOCTOU: two concurrent requests with same exchangeCode both pass the usedAt === null check, both issue JWTs.
  One-time code becomes multi-use.
  - why: Admin impersonation token can be replayed if an attacker intercepts the exchange URL.
  - severity: HIGH
  - fix: Atomic updateMany({ where: { exchangeCode: code, usedAt: null }, data: { usedAt: new Date() } }) → check count
  === 1 before issuing JWT.
  - safe now: Yes

  F-ORDER-1 — No Order Status State Machine

  - file:line: apps/backend/src/orders/orders.service.ts:895
  - function: updateStatus()
  - what: Any authenticated staff can set status to any OrderStatus value. No transition allowlist. CANCELED → COMPLETED
  is valid as far as the service is concerned.
  - why: Canceled orders that had loyalty clawed back can be re-completed, double-awarding points.
  - severity: HIGH
  - fix: Enforce transition allowlist (PENDING→PREPARING→READY→COMPLETED, any→CANCELED; no back-transitions). Throw
  BadRequestException on invalid.
  - safe now: Yes

  F-ORDER-2 — Signup Bonus Double-Award

  - file:line: apps/backend/src/orders/orders.service.ts:575–580
  - function: create (loyalty block)
  - what: lifetimePoints === 0 guard fires in orders.create even if LoyaltyService.enroll() already awarded a SIGNUP
  batch. First-order customer receives signup bonus twice.
  - why: Direct financial loss — extra points redeemable for real discounts.
  - severity: HIGH
  - fix: Check for existing SIGNUP ledger entry before awarding. Or: only award signup bonus via enroll(), never in
  orders.create.
  - safe now: Yes

  F-ORDER-3 — Cross-Restaurant Session Injection

  - file:line: apps/backend/src/orders/orders.service.ts:194–204
  - function: create()
  - what: Session token lookup has no restaurantId filter. Attacker passes session token from Restaurant A while
  ordering items from Restaurant B. Bill for Restaurant A's table accumulates Restaurant B's items.
  - why: Cross-restaurant billing corruption; settlement amounts wrong.
  - severity: HIGH
  - fix: Add restaurantId to findFirst filter on session lookup. Hoist restaurantId resolution (from items) before
  session lookup.
  - safe now: Yes — one-line fix after hoisting.

  F-ORDER-4 — Absolute Balance Set in reverseLoyaltyForCanceledOrder

  - file:line: apps/backend/src/orders/orders.service.ts:1008–1014
  - function: reverseLoyaltyForCanceledOrder()
  - what: Sets points to absolute value (Math.max(0, account.points - clawback + refund)) rather than
  increment/decrement. Concurrent transaction modifying points after the read → write overwrites their change.
  - why: Concurrent cancel + earn race results in incorrect point balance.
  - severity: HIGH
  - fix: Replace absolute set with { decrement: Math.max(0, clawback - refund) } or { increment: ... }.
  - safe now: Yes

  F-ORDER-5 — No RBAC on Order Status Update Endpoint

  - file:line: apps/backend/src/orders/orders.controller.ts:51–58
  - function: update()
  - what: JwtAuthGuard only — no role check. Any authenticated restaurant user (including KITCHEN role) can set any
  status value.
  - why: Ties to F-ORDER-1. Kitchen can un-cancel orders to double-award loyalty.
  - severity: HIGH
  - fix: Add state machine (F-ORDER-1) + restrict CANCEL to OWNER/MANAGER via RBAC.
  - safe now: Yes

  F-PAY-1 — Refund + Allocation Rollback in Separate Transactions

  - file:line: apps/backend/src/payment/providers/stripe-checkout.service.ts:396–464
  - function: refundPayment()
  - what: Payment marked REFUNDED → Stripe API called → allocation rollback in separate $transaction. If rollback
  throws, payment is REFUNDED, money returned, but paidQuantity not decremented. Table permanently shows "fully paid."
  - why: Irreversible billing inconsistency; restaurant loses ability to see outstanding balance.
  - severity: HIGH
  - fix: Move Stripe refund inside allocation rollback transaction, OR implement "refund pending" state + webhook
  reconciliation.
  - safe now: No — requires careful sequencing; risk of double-refund.

  F-PAY-2 — confirmCheckoutSession Silent FREE on Stripe API Error

  - file:line: apps/backend/src/subscription/subscription.service.ts:200–202
  - function: confirmCheckoutSession()
  - what: Any Stripe API failure (network, rate limit) → silently returns { tier: 'FREE' } with no logging. Paying
  customer sees FREE tier immediately after payment.
  - why: Paying customers lose tier on transient errors; no ops visibility.
  - severity: HIGH
  - fix: Log error before returning FREE; add retry or surface 503 to caller.
  - safe now: Yes

  F-PAY-3 — Promise.all Inside $transaction (Codebase Rule Violation)

  - file:line: apps/backend/src/subscription/subscription.service.ts:516–527, 574–583
  - function: enforceGraceExpiry, enforceForceTierExpiry
  - what: await Promise.all(rows.map(r => tx.adminAuditLog.create(...))) inside Prisma $transaction. CLAUDE.md
  explicitly forbids this for PgBouncer transaction mode.
  - why: Undocumented behavior; single audit log failure rolls back entire batch.
  - severity: HIGH
  - fix: Replace with sequential for...of loop or createMany.
  - safe now: Yes

  F-TRANS-1 — Concurrent applyLazyTranslations Loses Cached Translations

  - file:line: apps/backend/src/menu/menu-translation.service.ts:140–222
  - function: applyLazyTranslations()
  - what: Two concurrent requests for same restaurant (lang=en, lang=fr) both read existing = {}, both write { [lang]:
  ... }. Second write overwrites first — en translations lost.
  - why: Silently deletes cached translations; wastes DeepL quota on re-translation.
  - severity: HIGH
  - fix: Use Postgres JSON merge operator (translations || $1) in a single atomic UPDATE instead of read-compute-write.
  - safe now: Yes — additive schema change.

  F-TRANS-2 — Pre-warm Blocks Overwrite DB with Partial Merges

  - file:line: apps/backend/src/menu/menu-crud.service.ts:848–868, 1192–1237, 1487–1532
  - function: updateCategory, updateItem, updateMenuOption (fire-and-forget blocks)
  - what: Same root cause as F-TRANS-1. Pre-warm reads existing snapshot, translates, writes { ...existing,
  ...newTranslations }. Concurrent lazy-load writes in between → pre-warm overwrites it.
  - severity: HIGH
  - fix: Same — JSON merge operator at DB level.
  - safe now: Yes

  F-FE-1 — BGN Price Stored in Cart as EUR

  - file:line: apps/frontend/src/components/menu/ItemWithOptions.tsx:137
  - function: buildMainCartItem()
  - what: item.price stored as-is regardless of item.currency. BGN-priced items enter cart with raw BGN value;
  getTotal() and CheckoutPage treat all prices as EUR.
  - why: Customer shown wrong total; order sent to backend with wrong price.
  - severity: HIGH
  - fix: Normalize to EUR in buildMainCartItem: if currency === "BGN" → divide by BGN_RATE (1.95583).
  - safe now: Yes

  F-FE-2 — Double-Submit Timing Gap in handleSubmit

  - file:line: apps/frontend/src/pages/CheckoutPage.tsx:249–293
  - function: handleSubmit()
  - what: Guard if (submitting) return at line 255; setSubmitting(true) at line 293. 40+ lines of sync code between. Two
  rapid clicks within same render frame both pass guard → two createOrder calls.
  - why: Duplicate orders; customer charged/has double order.
  - severity: HIGH
  - fix: Use useRef as synchronous guard: if (submittingRef.current) return; submittingRef.current = true; at top of
  function.
  - safe now: Yes

  F-FE-3 — getTotal() Mixes BGN and EUR

  - file:line: apps/frontend/src/context/CartContext.tsx:164–169
  - function: getTotal()
  - what: Same root cause as F-FE-1. priceModifier (options) always EUR; item.price may be BGN.
  - severity: HIGH (same fix as F-FE-1 resolves both)
  - safe now: Yes

  ---
  G. Medium/Low Issues

  Medium

  ┌───────────┬─────────────────────────────────┬────────────────────────────────────────────────────────────────────┐
  │    ID     │              File               │                               Issue                                │
  ├───────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ M-AUTH-1  │ auth.service.ts:904             │ Duplicated OTP verification logic — maintenance divergence risk    │
  ├───────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ M-AUTH-2  │ auth.service.ts:107             │ Google OAuth links without asserting email_verified                │
  ├───────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ M-AUTH-3  │ main.ts:153                     │ CSP connectSrc: ws: allows any cleartext WebSocket host            │
  ├───────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ M-PAY-1   │ payment.controller.ts:66        │ Session token in GET URL → leaks to server/proxy logs              │
  ├───────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ M-PAY-2   │ payment.controller.ts:100       │ restaurantId in cash request body not validated against session    │
  ├───────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ M-PAY-3   │ subscription.service.ts:386     │ metadata.tier fallback without subscription price ID crosscheck    │
  ├───────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ M-PAY-4   │ stripe.provider.ts:166          │ Refund reason in metadata not in Stripe reason field — hurts       │
  │           │                                 │ dispute defense                                                    │
  ├───────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ M-PAY-5   │ payment-session.service.ts:70   │ N+1 queries in cleanup cron (3 queries × 100 sessions)             │
  ├───────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ M-ORDER-1 │ orders.service.ts:497           │ Loyalty account create race → P2002 → 500 (no graceful retry)      │
  ├───────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ M-ORDER-2 │ loyalty-ledger.utils.ts:116     │ redeemAccountPoints throws raw Error → 500, no context             │
  ├───────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ M-ORDER-3 │ loyalty.service.ts:541          │ Cron expireAccountPoints has no SELECT FOR UPDATE → races with     │
  │           │                                 │ order create                                                       │
  ├───────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ M-ORDER-4 │ loyalty.service.ts:356          │ Email HTML injection via account.user.name in HTML email body      │
  ├───────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ M-TRANS-1 │ menu-translation.service.ts:139 │ DeepL HTML entities stored verbatim; displayed literally by React  │
  ├───────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ M-TRANS-2 │ public-menu.controller.ts:27    │ ParseUUIDPipe imported but not applied → 500 on malformed          │
  │           │                                 │ restaurantId                                                       │
  ├───────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ M-TRANS-3 │ public-menu.controller.ts:26    │ 60 req/min too permissive → single IP can exhaust DeepL quota      │
  ├───────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ M-TRANS-4 │ i18n.ts:43                      │ localStorage lang cache causes cross-restaurant flash on first     │
  │           │                                 │ render                                                             │
  ├───────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ M-FE-1    │ CheckoutPage.tsx:194            │ No AbortController on loyalty fetch — stale setState on unmount    │
  ├───────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ M-FE-2    │ OrderContext.tsx:109            │ Optimistic revert uses stale closure → overwrites valid socket     │
  │           │                                 │ updates                                                            │
  ├───────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ M-FE-3    │ CartContext.tsx:57              │ localStorage cart restored without schema validation →             │
  │           │                                 │ NaN/Infinity risk                                                  │
  ├───────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ M-FE-4    │ AuthContext.tsx:194             │ refreshUser throws raw — no error state set                        │
  ├───────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ M-FE-5    │ OrderContext.tsx:39             │ selectedOptions: any[] — should be SelectedOption[]                │
  ├───────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ M-FE-6    │ OrderContext.tsx:123            │ batchUpdateOrderStatus missing canAccessOrders guard               │
  └───────────┴─────────────────────────────────┴────────────────────────────────────────────────────────────────────┘

  Low

  ┌───────────┬───────────────────────────────┬──────────────────────────────────────────────────────────────────────┐
  │    ID     │             File              │                                Issue                                 │
  ├───────────┼───────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ L-AUTH-1  │ main.ts:168                   │ CSRF exempt list has no maintenance safety net / comment             │
  ├───────────┼───────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ L-AUTH-2  │ super-admin.guard.ts:18       │ Redundant isActive check (already enforced by JwtStrategy)           │
  ├───────────┼───────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ L-AUTH-3  │ main.ts:165                   │ SameSite=None implicit default — should be explicit opt-in           │
  ├───────────┼───────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ L-PAY-1   │ payment.controller.ts:73      │ No DTO for tipPercent — validation only inside service               │
  ├───────────┼───────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ L-PAY-2   │ payment.controller.ts:330,338 │ ePay/MyPOS notify body typed any — no structural validation          │
  ├───────────┼───────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ L-PAY-3   │ stripe.provider.ts:13         │ 'sk_test_placeholder' fallback — Stripe SDK instantiated even in     │
  │           │                               │ prod without key                                                     │
  ├───────────┼───────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ L-ORDER-1 │ loyalty-ledger.utils.ts:73    │ Two sequential updates in expireAccountPoints → transient negative   │
  │           │                               │ balance                                                              │
  ├───────────┼───────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ L-ORDER-2 │ loyalty.service.ts:452        │ Analytics repeatRate excludes no-phone customers → inflated metric   │
  ├───────────┼───────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ L-ORDER-3 │ orders.service.ts:267         │ Overnight happy hour weekday edge case at exactly 00:00              │
  ├───────────┼───────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ L-TRANS-1 │ menu-crud.service.ts:42       │ Backend/frontend language list ordering mismatch (cosmetic)          │
  ├───────────┼───────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ L-TRANS-2 │ menu-crud.service.ts:627      │ checkRestaurantActive silently passes null → N+1, non-descriptive    │
  │           │                               │ 404                                                                  │
  ├───────────┼───────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ L-TRANS-3 │ PublicMenuPage.tsx:337        │ forEach(async) with no AbortController → in-flight requests not      │
  │           │                               │ freed on unmount                                                     │
  ├───────────┼───────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ L-TRANS-4 │ menu-crud.service.ts:1489     │ existingTrans mutates Prisma result reference directly               │
  ├───────────┼───────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ L-FE-1    │ App.tsx                       │ No 404 catch-all route — invalid paths render blank                  │
  ├───────────┼───────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ L-FE-2    │ AuthContext.tsx:185           │ manualAuthRef.current never reset                                    │
  ├───────────┼───────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ L-FE-3    │ multiple                      │ console.error in production code paths                               │
  ├───────────┼───────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ L-FE-4    │ CheckoutPage.tsx:604          │ Duplicate key={opt.choiceName} risk in choice list                   │
  ├───────────┼───────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ L-FE-5    │ api.ts:564                    │ window.location.pathname in X-Trace-Origin header leaks URL to       │
  │           │                               │ server logs                                                          │
  └───────────┴───────────────────────────────┴──────────────────────────────────────────────────────────────────────┘

  ---
  H. Missing Tests

  ┌─────────────┬────────────────────────────────────────────────────────────────────┐
  │    Area     │                           What's Missing                           │
  ├─────────────┼────────────────────────────────────────────────────────────────────┤
  │ Auth        │ TOCTOU verifyRegistration race test                                │
  ├─────────────┼────────────────────────────────────────────────────────────────────┤
  │ Auth        │ exchangeImpersonation double-use test                              │
  ├─────────────┼────────────────────────────────────────────────────────────────────┤
  │ Auth        │ OptionalJwtAuthGuard expired token behavior                        │
  ├─────────────┼────────────────────────────────────────────────────────────────────┤
  │ Orders      │ Order status back-transition rejection (needs state machine first) │
  ├─────────────┼────────────────────────────────────────────────────────────────────┤
  │ Loyalty     │ Signup bonus double-award (enroll + first order)                   │
  ├─────────────┼────────────────────────────────────────────────────────────────────┤
  │ Loyalty     │ reverseLoyaltyForCanceledOrder concurrent cancel race              │
  ├─────────────┼────────────────────────────────────────────────────────────────────┤
  │ Loyalty     │ Cron expireAccountPoints race with order create                    │
  ├─────────────┼────────────────────────────────────────────────────────────────────┤
  │ Payment     │ refundPayment — Stripe success + allocation rollback failure path  │
  ├─────────────┼────────────────────────────────────────────────────────────────────┤
  │ Payment     │ confirmCheckoutSession — Stripe API error → FREE fallback          │
  ├─────────────┼────────────────────────────────────────────────────────────────────┤
  │ Payment     │ enforceGraceExpiry cron behavior                                   │
  ├─────────────┼────────────────────────────────────────────────────────────────────┤
  │ Payment     │ enforceForceTierExpiry cron behavior                               │
  ├─────────────┼────────────────────────────────────────────────────────────────────┤
  │ Payment     │ forceOpenSession concurrent calls (same table)                     │
  ├─────────────┼────────────────────────────────────────────────────────────────────┤
  │ Translation │ Concurrent applyLazyTranslations — last-writer-wins                │
  ├─────────────┼────────────────────────────────────────────────────────────────────┤
  │ Frontend    │ handleSubmit double-click guard                                    │
  ├─────────────┼────────────────────────────────────────────────────────────────────┤
  │ Frontend    │ getTotal BGN/EUR currency mix                                      │
  ├─────────────┼────────────────────────────────────────────────────────────────────┤
  │ Frontend    │ localStorage cart restore with malformed data                      │
  ├─────────────┼────────────────────────────────────────────────────────────────────┤
  │ Frontend    │ batchUpdateOrderStatus partial failure revert accuracy             │
  └─────────────┴────────────────────────────────────────────────────────────────────┘

  ---
  I. Recommended Feature-by-Feature Audit Order

  1. Auth TOCTOU fixes (F-AUTH-1, F-AUTH-2, F-AUTH-3) — highest systemic risk, smallest diffs
  2. Order creation hardening (F-ORDER-3 cross-restaurant injection, F-ORDER-1 state machine) — data integrity
  3. Loyalty double-award fix (F-ORDER-2, F-ORDER-4) — financial correctness
  4. Translation concurrent write (F-TRANS-1, F-TRANS-2) — silent data loss
  5. Frontend cart currency (F-FE-1, F-FE-3) + double-submit (F-FE-2) — customer-visible money bugs
  6. Payment refund path (F-PAY-1) — requires careful sequencing; do after tests are written
  7. Subscription tier enforcement (F-PAY-2, F-PAY-3) — medium complexity
  8. Medium items — email HTML escape, ParseUUIDPipe, rate limits, CSP
  9. Low items — cleanup, types, logging

  ---
  J. Files That Should Not Be Touched Without Extra Care

  ┌───────────────────────────────────────────────────────────────┬──────────────────────────────────────────────────┐
  │                             File                              │                      Reason                      │
  ├───────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────┤
  │ apps/backend/src/loyalty/loyalty-ledger.utils.ts              │ FIFO ledger — money correctness; any change      │
  │                                                               │ risks double-spend                               │
  ├───────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────┤
  │ apps/backend/src/payment/providers/stripe-checkout.service.ts │ Stripe money flows; refund path partially broken │
  │                                                               │  (F-PAY-1)                                       │
  ├───────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────┤
  │ apps/backend/src/auth/auth.service.ts                         │ 3 HIGH findings; complex auth state machine      │
  ├───────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────┤
  │ apps/backend/src/orders/orders.service.ts                     │ Loyalty earn intertwined with order create;      │
  │                                                               │ highly stateful                                  │
  ├───────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────┤
  │ apps/backend/src/subscription/subscription.service.ts         │ Tier enforcement + billing; silent downgrade     │
  │                                                               │ risk (F-PAY-2)                                   │
  ├───────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────┤
  │ apps/backend/src/menu/menu-translation.service.ts             │ Concurrent write race; any change must use JSON  │
  │                                                               │ merge operator                                   │
  ├───────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────┤
  │ apps/backend/src/main.ts                                      │ CSRF middleware order is security-critical;      │
  │                                                               │ wrong order = bypass                             │
  ├───────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────┤
  │ apps/frontend/src/lib/api.ts                                  │ CSRF interceptor, 401 redirect, auth cookie      │
  │                                                               │ transport                                        │
  ├───────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────┤
  │ apps/frontend/src/context/CartContext.tsx                     │ Currency normalization + localStorage restore    │
  │                                                               │ both broken                                      │
  └───────────────────────────────────────────────────────────────┴──────────────────────────────────────────────────┘

  ---
  K. Questions to Answer Before Any Fixes

  1. Is LoyaltyService.enroll() always called before the first order? Or can orders.create be the first loyalty
  interaction? (Determines F-ORDER-2 fix strategy)
  2. Does item.currency ever equal "BGN" in real menu data? Or is all pricing stored in EUR already? (Determines
  severity of F-FE-1 in practice)
  3. Is impersonation (exchangeImpersonation) actually deployed / accessible in production? (Determines urgency of
  F-AUTH-3)
  4. What is the Stripe reason enum value expected for restaurant-initiated refunds? Needed to implement M-PAY-4
  correctly.
  5. Is the refund path (F-PAY-1) currently reachable by end customers, or only via super-admin? (Determines blast
  radius and urgency)
  6. Does Google OAuth profile always include email_verified? Which OAuth scopes are requested? (Needed for M-AUTH-2)
  7. Is BORICA / ePay / MyPOS live in production or still behind a feature flag? (Determines urgency of L-PAY-2)
  8. Is there a DB-level unique constraint on (loyaltyAccountId, type='SIGNUP') ledger entries? (Alternative mitigation
  for F-ORDER-2)
  9. What is the STAFF_DEVICE_LIMIT constant value and where is it defined? Not found in audited files.
  10. Is the translation SELECT FOR UPDATE on loyalty_account in orders.create actually executed under PgBouncer
  transaction mode? (PgBouncer transaction mode supports row-level locks within a $transaction — but confirm this is not
  an interactive transaction that spans requests)


---

CODEX VERIFICATION COMMENTS - 2026-06-30

> Preservation note: Everything above this line is the original audit report and has not been edited. The comments
> below are additive only.
>
> Verification method: verified by CODEX against the current source, Prisma schema/migrations, existing tests,
> targeted test runs, and (only where stated) a non-destructive production route probe. "Verified" means the code
> establishes the finding. "Partially verified / mischaracterized" means a related issue exists, but the audit's
> mechanism, impact, or severity is not accurate. "Verified not true" means the reported problem is contradicted by
> the current code.
>
> Count correction: the report contains 16 High IDs, 22 Medium IDs (not 23), and 18 Low IDs: 56 concrete findings.
> CODEX classified them as 29 verified, 12 partially verified/mischaracterized, and 15 verified not true.

F. HIGH-SEVERITY FINDINGS - CODEX COMMENTS

- F-AUTH-1 - PARTIALLY VERIFIED / MISCHARACTERIZED - verified by CODEX.
  `verifyRegistration()` reads the user, consumes the code, and creates the user in separate operations, so two
  requests can both pass the initial lookup. The unique email constraint prevents duplicate users; the likely loser
  is a `P2002`/500 after a verification code has been consumed, not duplicate-account creation. This is a real
  concurrency/UX defect, but not a demonstrated High-impact integrity failure. Catch the unique violation and return
  Conflict, and make code consumption a guarded atomic operation (or perform the whole flow through one transaction-
  aware repository).

- F-AUTH-2 - PARTIALLY VERIFIED / MISCHARACTERIZED - verified by CODEX.
  `OptionalJwtAuthGuard.handleRequest()` discards Passport's `info`, so an expired or malformed bearer token is
  silently treated as anonymous. However, the reported POS-order attribution exploit is contradicted by
  `OrdersService.create()`: `source: POS` requires resolved staff, and customer orders carrying `customerId` are also
  rejected without a matching authenticated customer. Treat this as ambiguous authentication semantics/poor UX,
  not the claimed High-severity authorization bypass. Add guard-level tests for expired/malformed tokens and define
  whether invalid credentials should be rejected while absent credentials remain optional.

- F-AUTH-3 - VERIFIED TRUE - verified by CODEX.
  `exchangeImpersonation()` performs a `findUnique`/`usedAt` check and then an unconditional update by ID. Concurrent
  callers can both pass the check and both receive JWTs. Consume with one guarded `updateMany` predicate covering
  code, `usedAt: null`, `revokedAt: null`, and `expiresAt > now`; issue a token only when exactly one row changed.
  Deployment note: the production frontend currently serves `/impersonate/:code`, but the configured Cloud Run API
  returned `404 Cannot POST /api/v1/auth/impersonate/exchange` to a valid-CSRF probe on 2026-06-30. The race is present
  in source but was not reachable end-to-end on that target during verification.

- F-ORDER-1 - VERIFIED TRUE, WITH CORRECTED IMPACT - verified by CODEX.
  The status endpoint accepts any `OrderStatus` without a transition state machine. The audit's
  `CANCELED -> COMPLETED` double-earn explanation is incorrect because earn points are recorded during order
  creation, not on completion. A concrete exploit remains: `CANCELED -> non-canceled -> CANCELED` can repeatedly run
  redeemed-point reversal because no durable "already reversed" marker guards it. Enforce allowed transitions
  atomically and make cancellation/reversal idempotent.

- F-ORDER-2 - VERIFIED NOT TRUE - verified by CODEX.
  `LoyaltyService.enroll()` initializes both `points` and `lifetimePoints` with the signup bonus and writes the SIGNUP
  ledger entry. The order path only awards the signup bonus when `lifetimePoints === 0`. Therefore a positive bonus
  awarded by enrollment makes the order condition false; when the configured bonus is zero, the repeated amount is
  also zero. The unique loyalty-account key also prevents two accounts. Centralizing bonus issuance would improve
  maintainability, but the claimed double award is not present in the current implementation.

- F-ORDER-3 - VERIFIED TRUE - verified by CODEX.
  The table-session lookup validates token and OPEN status but does not constrain `restaurantId`. The Prisma model has
  independent order-to-restaurant and order-to-session foreign keys and no composite constraint requiring them to
  match. A valid open token from restaurant A can therefore be attached to an order for restaurant B. Include the
  order restaurant in the lookup and add a database-enforceable consistency invariant where practical.

- F-ORDER-4 - VERIFIED TRUE - verified by CODEX.
  Cancellation reads the loyalty account and later writes absolute `points`/`lifetimePoints` values without taking
  the account row lock used during order creation. A concurrent earn/redeem can be overwritten. A simple decrement is
  not a complete fix: every ledger mutation, including cancellation and expiry, should lock the same account row,
  guard reversal idempotently, and calculate the update from the locked state (or reconcile from the ledger).

- F-ORDER-5 - VERIFIED TRUE - verified by CODEX.
  The status endpoint requires JWT authentication but does not enforce a status-change role. `findOne()` permits any
  assigned restaurant staff member, including roles that should not be able to cancel/refund orders. Add explicit
  role policy (at minimum for cancellation) and combine it with the transition state machine; role checks alone do
  not prevent invalid or repeated transitions.

- F-PAY-1 - VERIFIED TRUE - verified by CODEX.
  Refund state is committed before the external Stripe refund, while paid-quantity allocation reversal occurs in a
  separate database transaction after Stripe succeeds. An allocation failure can leave money refunded externally
  while internal paid quantities remain unchanged. Do not hold a database transaction open around the Stripe network
  call. Use a `REFUND_PENDING` state/outbox with a Stripe idempotency key, then finalize payment state and allocations
  atomically from a webhook/reconciler; handle failed and indeterminate refunds explicitly.

- F-PAY-2 - VERIFIED TRUE - verified by CODEX.
  `confirmCheckout()` catches a Stripe retrieval failure and returns `FREE`, and an existing unit test currently
  codifies that behavior. A transport/provider error is not proof that no subscription exists. Log the failure and
  return a retryable/pending response (or 503); only an authoritative Stripe result should produce `FREE`.

- F-PAY-3 - PARTIALLY VERIFIED / SEVERITY OVERSTATED - verified by CODEX.
  Two subscription paths use `Promise.all()` for writes on a Prisma transaction client, contrary to this repository's
  documented transaction rule. The audit's statement that one failed audit-log write rolling back the batch is a bug
  is incorrect: rollback is the intended atomic behavior. Prisma also serializes operations on the transaction's one
  connection. Replace the pattern with `createMany` or an explicit loop for clarity, compatibility, and performance,
  but the evidence does not establish a High-severity data-loss defect.

- F-TRANS-1 - VERIFIED TRUE - verified by CODEX.
  Lazy translation reads stale JSON, merges in memory, and replaces the full JSON value. Concurrent requests for
  different languages or fields can overwrite one another. Use an atomic JSONB path update/deep merge, or optimistic
  versioning with retry; a shallow whole-column replacement is not concurrency-safe.

- F-TRANS-2 - VERIFIED TRUE - verified by CODEX.
  Category, item, and option prewarming repeat the stale-read/full-replacement pattern in fire-and-forget work, so
  concurrent prewarms can lose translations. Apply the same atomic merge strategy as F-TRANS-1 and observe/retry
  background failures rather than discarding them.

- F-FE-1 - VERIFIED TRUE, CONDITIONAL ON BGN DATA - verified by CODEX.
  `ItemWithOptions` computes a converted `priceEuro` for display but adds the raw item price to the cart; option prices
  are treated as EUR. The schema and import path allow BGN and the import UI defaults to BGN, although seeds and the
  normal create/edit UI currently use EUR. The backend order calculation also sums raw menu prices and payment
  currency is EUR, so a frontend-only conversion would not be sufficient. Establish one canonical money currency
  server-side, migrate/normalize existing values, and have both API and UI consume that invariant.

- F-FE-2 - VERIFIED NOT TRUE - verified by CODEX.
  There is no `await` or other event-loop yield between the submitting guard and `setSubmitting(true)`. Normal browser
  click handlers cannot interleave in that synchronous region, and React discrete events are flushed before the next
  click. A ref and, more importantly, backend idempotency are worthwhile defense in depth, but the reported
  same-render-frame double-submit race is not established by the current code.

- F-FE-3 - VERIFIED TRUE, SAME ROOT CAUSE AS F-FE-1 - verified by CODEX.
  `getTotal()` sums raw base prices with EUR-denominated modifiers, so a BGN item produces a mixed-currency total. This
  is real wherever BGN menu rows exist. Fix the server-side currency model first, then ensure persisted carts carry
  canonical minor-unit amounts/currency instead of recomputing from ambiguous raw numbers.

G. MEDIUM-SEVERITY FINDINGS - CODEX COMMENTS

- M-AUTH-1 - VERIFIED TRUE - verified by CODEX.
  OTP validation/consumption logic is duplicated rather than routed through the existing helper, increasing the chance
  that expiry, attempt, or consumption rules diverge. Consolidate it behind one transaction-aware implementation and
  cover every caller with the same behavior tests.

- M-AUTH-2 - VERIFIED TRUE - verified by CODEX.
  Google OAuth requests `profile` and `email`; the strategy maps the email but does not carry or require
  `email_verified`, and accounts are linked by email. Request explicit OpenID Connect scopes
  `openid profile email`, validate the signed ID-token claims, require `email_verified === true`, and retain Google's
  stable `sub`/googleId as the provider identity. Google documents that the `email` scope supplies `email` and
  `email_verified`: https://developers.google.com/identity/openid-connect/openid-connect

- M-AUTH-3 - PARTIALLY VERIFIED / MISCHARACTERIZED - verified by CODEX.
  Helmet's `connect-src 'self' ws: wss:` would allow arbitrary WebSocket hosts on responses where that CSP governs a
  document. In this deployment Helmet protects the Cloud Run API, while the Vercel SPA document has no corresponding
  CSP header in `vercel.json`; therefore this is not currently an effective frontend CSP that is merely too broad.
  Define the document CSP at the frontend host and list only the production API/socket origins; omit `ws:` in
  production unless an explicit insecure endpoint is required.

- M-PAY-1 - VERIFIED TRUE - verified by CODEX.
  A table-session token appears in a GET path, making it likely to enter proxy, server, tracing, and browser history
  logs. Treat it as a bearer secret. Prefer a separate short-lived opaque bill token sent in an authorization header
  or non-logged request body, and redact any legacy token path before logging.

- M-PAY-2 - VERIFIED NOT TRUE - verified by CODEX.
  Although `restaurantId` originates in the request body, `PaymentSettlementService` queries the table session with
  the combined predicate `{ token, restaurantId, status: OPEN }`. The binding is therefore validated before use.
  Duplicating the same check in the controller is not required and would not strengthen the service boundary.

- M-PAY-3 - PARTIALLY VERIFIED / IMPACT OVERSTATED - verified by CODEX.
  The webhook falls back to signed Checkout metadata when subscription retrieval fails or lacks a usable price. The
  metadata was set server-side during an authenticated owner flow and the event signature is verified, so the audit's
  metadata-forgery claim is not demonstrated. Still, a paid tier must not be activated from an unrecognized price:
  leave the event pending, retrieve/retry, and map only allowlisted live Stripe price IDs.

- M-PAY-4 - VERIFIED TRUE - verified by CODEX.
  The provider stores arbitrary refund text only in metadata and does not set Stripe's typed `reason`. Stripe accepts
  `duplicate`, `fraudulent`, or `requested_by_customer`. Use `requested_by_customer` for an ordinary
  restaurant-initiated customer refund, reserve the other values for explicit classifications, and retain free text
  separately in metadata/internal records. Reference: https://docs.stripe.com/api/refunds/object?lang=node

- M-PAY-5 - VERIFIED TRUE - verified by CODEX.
  Cleanup loads up to 100 sessions and invokes `computeSessionBalance()` per row, creating roughly two balance queries
  plus an update for each session (up to about 301 operations). Replace it with set-based aggregates/updates or small
  bounded batches with measured concurrency.

- M-ORDER-1 - VERIFIED TRUE - verified by CODEX.
  Loyalty-account creation is a `findUnique` followed by `create`. Concurrent first orders can race on the unique
  account constraint and return `P2002`/500. Use an upsert/re-read pattern compatible with the surrounding transaction,
  or retry the entire serializable transaction after the unique conflict.

- M-ORDER-2 - PARTIALLY VERIFIED / MISCHARACTERIZED - verified by CODEX.
  A ledger/account mismatch is a server invariant failure, so a 500-class response is appropriate; converting it to a
  client validation error would be misleading. The real gap is diagnosability: throw a typed invariant error, record
  account/order/ledger context safely, alert, and prevent partial mutation through the transaction.

- M-ORDER-3 - VERIFIED TRUE (potentially High impact) - verified by CODEX.
  Expiry reads and updates the account without acquiring the row lock used by order creation. Two workers, or expiry
  racing an order, can process the same expired batches against stale balances. Require every ledger writer, including
  cron jobs, to acquire the same account `FOR UPDATE` lock and make batch expiry idempotent.

- M-ORDER-4 - VERIFIED TRUE - verified by CODEX.
  Customer/user and restaurant names are interpolated into HTML emails without escaping in two paths. Escape every
  dynamic value with a well-tested encoder or use an auto-escaping template engine; sanitizing only selected fields
  will remain fragile.

- M-TRANS-1 - VERIFIED NOT TRUE - verified by CODEX.
  DeepL is called with JSON text and without `tag_handling: html`; the returned translation is plain text, and React's
  normal rendering escapes it. DeepL only applies HTML handling when requested:
  https://developers.deepl.com/docs/xml-and-html-handling/html. No entity-decoding defect is established.

- M-TRANS-2 - VERIFIED NOT TRUE - verified by CODEX.
  Menu/restaurant IDs use Prisma `cuid()`, not UUIDs. Adding `ParseUUIDPipe` would reject every valid ID. An arbitrary
  string simply fails the Prisma lookup and the public-menu path returns Not Found; it does not inherently cause the
  reported 500.

- M-TRANS-3 - PARTIALLY VERIFIED / NOT QUANTIFIED - verified by CODEX.
  The public endpoint's rate limits can amplify DeepL usage during simultaneous uncached misses, but cached requests do
  not call DeepL and the report does not establish actual quota exhaustion. Coalesce concurrent misses per
  restaurant/language, add provider budget/circuit-breaker controls, and monitor quota; tune the route limit from
  measured traffic rather than assuming every allowed request is billable.

- M-TRANS-4 - VERIFIED TRUE, LOW UX IMPACT - verified by CODEX.
  The global localStorage language can render briefly before public restaurant metadata selects that restaurant's
  language. Resolve the restaurant preference before visible menu rendering, or namespace the stored preference by
  restaurant. This is a flash-of-language UX issue, not data corruption.

- M-FE-1 - VERIFIED TRUE - verified by CODEX.
  Loyalty fetching has no cancellation or request-generation guard. The stronger failure mode is not merely updating
  an unmounted component: a slower request for the previous restaurant/user can resolve after a newer request and
  overwrite current state. Pass an AbortSignal through the API layer and also ignore stale request IDs.

- M-FE-2 - VERIFIED TRUE - verified by CODEX.
  The optimistic status update captures the entire `orders` array and restores that snapshot on failure, which can
  erase intervening socket updates. Revert only the affected order with a functional state update and then refresh
  authoritative state when outcome is uncertain.

- M-FE-3 - VERIFIED TRUE - verified by CODEX.
  Cart restoration checks only that JSON parsing succeeds. Valid JSON of the wrong shape can make array operations
  fail or introduce `NaN`/invalid quantities and options. Validate a versioned schema, finite minor-unit prices,
  quantities, IDs, currency, and option structure; discard or explicitly migrate invalid payloads.

- M-FE-4 - VERIFIED NOT TRUE - verified by CODEX.
  `refreshUser()` can reject, but its impersonation caller attaches `.catch()` and redirects. The current call site
  therefore does not produce the claimed unhandled rejection. A global auth-error field may be a product choice, but
  it is not required to fix this reported issue.

- M-FE-5 - VERIFIED TRUE, LOW SEVERITY TYPE DEBT - verified by CODEX.
  `selectedOptions: any[]` bypasses compile-time validation at an important pricing boundary. Replace it with a shared
  `SelectedOption` DTO/domain type and validate network/storage input at runtime.

- M-FE-6 - PARTIALLY VERIFIED / SEVERITY OVERSTATED - verified by CODEX.
  Batch status update lacks the local `canAccess` guard used by refresh. The backend remains the security boundary and
  route/UI access already restricts exposure, so this is not a demonstrated authorization bypass. Add the same guard
  for consistency and UX, while keeping all real authorization server-side.

G (LOW SUBSECTION). LOW-SEVERITY FINDINGS - CODEX COMMENTS

- L-AUTH-1 - PARTIALLY VERIFIED - verified by CODEX.
  The CSRF exemptions are explicit POST-only paths and surrounding comments explain the general purpose, so they are
  not an undocumented wildcard. The list lacks per-entry rationale and regression tests that fail if a state-changing
  route is exempted casually. Use a named allowlist with rationale and middleware tests.

- L-AUTH-2 - VERIFIED NOT TRUE - verified by CODEX.
  The active-user check duplicated after `JwtStrategy` is harmless defense in depth and protects the service if it is
  called from another path. It is not a correctness or security defect; remove it only as an intentional refactor with
  tests proving the invariant remains centralized.

- L-AUTH-3 - VERIFIED NOT TRUE - verified by CODEX.
  Cookie SameSite behavior is explicit: production selects `none`, development selects `lax`, with an explanatory
  comment beside it. The report's assertion that the production default is implicit is contradicted by the code.

- L-PAY-1 - VERIFIED TRUE - verified by CODEX.
  The intent endpoint accepts an inline body shape rather than the existing DTO. Core logic still normalizes and
  validates the tip range, so this is boundary consistency/type-safety debt, not an unbounded-tip vulnerability.
  Reuse the DTO and keep service validation as defense in depth.

- L-PAY-2 - VERIFIED NOT TRUE - verified by CODEX.
  The controller annotations use `any`, but runtime verification is present: ePay checks required fields, parses
  values, and verifies checksum; MyPOS normalizes fields, verifies signature/method, and reconciles
  amount/currency/store/order. Replacing `any` with DTOs improves types and documentation but does not reveal the
  claimed missing runtime validation.

- L-PAY-3 - VERIFIED NOT TRUE - verified by CODEX.
  A placeholder Stripe key can instantiate the SDK during setup, but `onModuleInit` refuses production startup when
  `STRIPE_SECRET_KEY` is absent. It does not silently run a production server with a fake credential.

- L-ORDER-1 - PARTIALLY VERIFIED / NOT AN EXTERNAL NEGATIVE BALANCE - verified by CODEX.
  Expiry can decrement and then clamp in two writes inside one transaction. The transient value is uncommitted and
  therefore not normally observable outside the transaction. It is still unnecessary and combines badly with the
  real lock race in M-ORDER-3; prefer one guarded SQL update while holding the account lock.

- L-ORDER-2 - PARTIALLY VERIFIED - verified by CODEX.
  The repeat-rate query excludes null/empty phone values, so the result is specifically repeat rate among orders with
  an identified phone. Calling it a global customer repeat rate can inflate interpretation, but no-phone customers
  cannot reliably be correlated. Prefer authenticated `customerId`, then normalized phone, or rename and document the
  metric denominator.

- L-ORDER-3 - VERIFIED NOT TRUE - verified by CODEX.
  Exact `00:00` handling is intentional: the endpoint is inclusive and an overnight interval attributes the
  after-midnight portion to the prior start day. The current logic handles the stated boundary; no bypass was
  established.

- L-TRANS-1 - VERIFIED NOT TRUE - verified by CODEX.
  Backend-supported languages and the frontend settings list contain the same language set. A public helper
  deliberately display-sorts preferred languages; backend ordering is only an eligibility list. Different order does
  not cause a functional mismatch.

- L-TRANS-2 - PARTIALLY VERIFIED / IMPACT OVERSTATED - verified by CODEX.
  `checkRestaurantActive()` performs an extra restaurant query and lets null fall through, but the downstream path
  returns a descriptive Not Found. This is a duplicate-query cleanup opportunity, not an N+1 loop or a
  non-descriptive-error defect.

- L-TRANS-3 - VERIFIED TRUE - verified by CODEX.
  The effect's cancellation flag prevents stale state writes but does not abort requests, and `forEach(async ...)`
  launches uncontrolled work. Use AbortController plus `Promise.allSettled` or measured bounded concurrency.

- L-TRANS-4 - VERIFIED NOT TRUE - verified by CODEX.
  The code mutates only the local Prisma result object before returning it; no shared cache/object is mutated.
  Concurrency-related lost updates are already validly captured by F-TRANS-2, but this separate mutation claim is not
  a defect.

- L-FE-1 - VERIFIED TRUE - verified by CODEX.
  The router has no catch-all route, so an unknown path has no intentional 404 experience. Add a wildcard Not Found
  route with safe navigation.

- L-FE-2 - VERIFIED NOT TRUE - verified by CODEX.
  `manualAuthRef` guards a mount-only initialization path. Once it is true, that initialization should not rerun, so
  the absence of a reset is intentional for the current lifecycle and does not create the reported bug.

- L-FE-3 - VERIFIED NOT TRUE AS WRITTEN - verified by CODEX.
  A generic statement that production code calls `console.error` is not itself a defect; the report identifies no
  leaked secret or repository policy violation. Structured telemetry and redaction are preferable operationally, but
  this finding needs a concrete sensitive payload or behavior to be actionable.

- L-FE-4 - VERIFIED TRUE - verified by CODEX.
  `choiceName` alone is not unique across option groups, so two groups can produce duplicate React keys. Use a stable
  composite such as `${optionId}:${choiceName}` (or a real choice ID).

- L-FE-5 - VERIFIED TRUE; SHOULD BE MEDIUM - verified by CODEX.
  The tracing interceptor sends raw `window.location.pathname` in `X-Trace-Origin`, and backend logging persists the
  header. On `/impersonate/:code`, that copies the one-time impersonation secret into production logs. Emit constant
  route templates/IDs or redact sensitive dynamic segments before constructing the header.

H. MISSING-TEST MATRIX - CODEX COMMENTS

> The matrix actually contains 17 rows, not 16. "Present" below means an existing test covers the stated scenario,
> not merely the surrounding service.

1. Auth verification race - MISSING - verified by CODEX. No concurrent same-email/code test.
2. Impersonation-code reuse - MISSING - verified by CODEX. No two-caller atomic-consumption test.
3. Optional guard with expired JWT - MISSING - verified by CODEX. Strategy tests do not exercise guard `info`.
4. Backward order-status transition - MISSING - verified by CODEX. No state-machine test because no state machine exists.
5. Enroll plus first order - MISSING, BUT UNDERLYING FINDING IS FALSE - verified by CODEX. Add as a useful regression
   test proving the signup bonus is awarded once.
6. Concurrent/repeated cancel reversal - MISSING - verified by CODEX.
7. Expiry versus order race - MISSING - verified by CODEX.
8. Stripe succeeds then allocation reversal fails - MISSING - verified by CODEX. Existing coverage tests successful
   reversal, not external/internal split failure.
9. Stripe error during `confirmCheckout` - PRESENT - verified by CODEX. `subscription.service.spec.ts` explicitly
   expects the current `FREE` fallback; change that expectation when fixing F-PAY-2.
10. Grace-period cron - PRESENT - verified by CODEX.
11. Forced-tier cron - PRESENT - verified by CODEX.
12. Two concurrent `forceOpen` calls for one table - MISSING - verified by CODEX. Pending-payment race coverage is not
    the same scenario.
13. Concurrent translation merge/lost write - MISSING - verified by CODEX.
14. Same-frame frontend double click - MISSING, BUT UNDERLYING RACE IS NOT ESTABLISHED - verified by CODEX. A backend
    idempotency-key integration test is higher value.
15. BGN cart/getTotal - MISSING - verified by CODEX. Currency-format tests do not exercise mixed cart arithmetic.
16. Malformed localStorage cart - MISSING - verified by CODEX.
17. Batch partial failure revert - PARTIALLY PRESENT - verified by CODEX. `orderStatus.test.ts` covers
    `revertFailedOrders`, but there is no OrderContext integration test for `allSettled` mapping plus intervening
    socket updates.

TEST EXECUTION COMMENT - verified by CODEX

- Backend targeted run: 9 suites, 384 tests passed.
- Frontend targeted run: 4 files, 27 tests passed.
- The frontend run emitted existing React `act` deprecation and missing test-i18n-instance warnings; neither caused a
  failure and neither verifies or invalidates the security findings above.

K. QUESTIONS TO ANSWER BEFORE ANY FIXES - CODEX ANSWERS

1. Is `LoyaltyService.enroll()` always called first?
   No. `OrdersService.create()` can be the first loyalty interaction. The checkout UI starts enrollment as an effect
   but does not make successful enrollment a prerequisite for submission, and direct API/POS paths need not call it.
   Keep first-order account creation safe and idempotent. The best design is one transaction-aware "ensure account and
   issue signup bonus once" operation used by both paths. Importantly, current F-ORDER-2 is false for the reasons above.
   Example: A new customer submits an order while the frontend's separate enrollment request is delayed or fails.
   `OrdersService.create()` must create the loyalty account itself. If enrollment succeeds first, the order reuses that
   account. In the current code, neither order of events produces the claimed double positive signup bonus.
   Recommendation: Create one shared transaction-aware method, for example
   `ensureAccountAndIssueSignupBonusOnce(customerId, restaurantId, tx)`, and call it from both enrollment and ordering.
   Add a concurrency test that starts both operations together and proves there is one account, one SIGNUP ledger
   entry, and one bonus.

2. Does `item.currency` equal BGN in real data?
   The repository cannot prove production row contents. Seeds and ordinary create/edit UI use EUR, but the schema and
   import pipeline accept BGN and the import UI defaults to BGN, so the broken path is genuinely reachable. Before
   migration, run a read-only production query such as
   `SELECT currency, COUNT(*) FROM menu_item GROUP BY currency;`. Regardless of today's count, enforce one canonical
   server-side money representation because imports can introduce BGN later.
   Example: An imported item has `price = 20` and `currency = BGN`. The menu can display a converted EUR amount, but
   the cart currently stores the raw `20` and can total it as EUR. A customer could therefore see one amount and be
   charged using another interpretation of the same number.
   Recommendation: Run the production count query first, choose one canonical currency (preferably EUR minor units),
   migrate every BGN row once, and reject or convert non-canonical prices during import. Never rely on display-only
   conversion.

   OWNER CURRENCY CLARIFICATION (added 2026-06-30):
   The owner confirms that all authoritative/main menu prices are now EUR. Bulgaria adopted the euro on
   1 January 2026, so EUR is the application's only transactional currency. BGN is retained only as a second,
   informational price on the public menu; it must not participate in cart totals, order accounting, tips, refunds,
   settlements, or payment-provider requests.

   The informational conversion must use the fixed official rate:
   `BGN display amount = EUR authoritative amount * 1.95583`.
   Example: an authoritative price of `EUR 10.00` may be displayed as `EUR 10.00 / BGN 19.56`. The cart, order, and
   payment remain exactly `EUR 10.00`; `BGN 19.56` is display text only.

   REGULATORY DATE CORRECTION - verified by CODEX:
   Official sources state that mandatory dual display applies until 8 August 2026, not 1 January 2027. If this product
   continues showing BGN until 1 January 2027, that later date is an owner-selected product policy unless another
   applicable legal requirement is provided. Sources:
   https://economy-finance.ec.europa.eu/euro/eu-countries-and-euro/bulgaria-and-euro_en
   and https://www.minfin.bg/en/news/2026-01-07

   UPDATED RECOMMENDATION:
   Store and calculate every price in EUR minor units. Derive BGN only at the final public-menu presentation boundary
   with the fixed `1.95583` multiplier and two-decimal display rounding. Remove or disable authoring/import paths that
   create transactional BGN rows; validate that API, cart, orders, invoices, refunds, and payments remain EUR-only.
   Keep the informational BGN display through the mandatory 8 August 2026 deadline and, if desired as product policy,
   through 1 January 2027. Make the optional end date configuration-driven so removing the secondary display does not
   require changing stored prices or payment logic.

3. Is impersonation deployed/accessibly in production?
   Not end-to-end on the configured targets at verification time. The Vercel frontend served the impersonation route,
   but a valid-CSRF POST to the configured Cloud Run API returned 404 for the exchange endpoint on 2026-06-30. The
   source route is unconditional, so F-AUTH-3 becomes immediately exploitable if that backend version is deployed;
   fix it before enabling/redeploying the route.
   Example: Two requests submit the same unused impersonation code at almost the same moment. Both can read
   `usedAt = null` before either update commits, so both can receive a JWT. The current production API returned 404,
   but deploying the source route would expose this race without any further configuration.
   Recommendation: Before deployment, consume the code with one conditional database update and issue a JWT only when
   exactly one row changed. Add a two-request concurrency test; one request must succeed and the other must receive an
   invalid/already-used response.

4. Which Stripe refund reason should be used?
   Use `requested_by_customer` for a normal restaurant-initiated refund on behalf of the customer. Use `duplicate` or
   `fraudulent` only when the restaurant explicitly classifies the refund that way. Keep human free text separately in
   internal records/metadata. Stripe enum reference: https://docs.stripe.com/api/refunds/object?lang=node
   Examples: "Customer changed their mind" or "restaurant could not fulfill the order" maps to
   `requested_by_customer`; "the card was charged twice" maps to `duplicate`; a confirmed unauthorized-card case maps
   to `fraudulent`. A note such as "kitchen ran out of salmon" is not a Stripe enum value.
   Recommendation: Send the appropriate Stripe enum in the typed `reason` field and store the restaurant's explanatory
   note in internal audit data/metadata. Default ordinary dashboard refunds to `requested_by_customer`; require an
   explicit choice for `duplicate` or `fraudulent`.

5. Who can reach the refund path?
   Not unauthenticated end customers. The endpoint requires JWT authentication and Stripe-payment access; service
   authorization permits the same-restaurant owner or manager, plus super-admin. The dashboard exposes the action.
   Therefore the blast radius is privileged restaurant staff/admin, not only super-admin and not public customers.
   Example: A diner scanning a table QR code cannot directly use this refund endpoint. A logged-in manager assigned to
   that restaurant can use it, while a manager from another restaurant must be rejected. A super-admin can use it
   across restaurants.
   Recommendation: Keep server-side restaurant scoping, add a dedicated `REFUND_PAYMENT` permission rather than relying
   only on broad roles, require a reason, use an idempotency key, and record actor/payment/amount/result in an immutable
   audit event. Consider owner approval or step-up authentication above a chosen refund threshold.

6. What Google claims/scopes are available?
   Current scopes are exactly `profile` and `email`; `openid` is not explicit, and the mapped profile discards
   `email_verified`. Google's OIDC documentation says the `email` scope supplies `email` and `email_verified`, but the
   application must actually validate and enforce the claim. Best method: explicit `openid profile email`, verify the
   signed ID token, require `email_verified === true`, and bind the provider account to stable `sub`/googleId.
   Reference: https://developers.google.com/identity/openid-connect/openid-connect
   Example: Google returns `email = owner@example.com`, `email_verified = false`, and a stable `sub`. The current
   mapping keeps the email but loses the verification flag, so downstream code cannot distinguish it from a verified
   Google address before linking by email.
   Recommendation: Request `openid profile email`, validate issuer/audience/signature/expiry, reject a missing or false
   `email_verified`, and identify the Google account by `sub`. Use email for contact/link confirmation, not as the sole
   provider identity.

7. Are BORICA/ePay/MyPOS live?
   This cannot be established 100% from source. The code gates providers per restaurant/tier and by provider
   credentials/configuration; there is no single repository-wide "live" flag that proves production tenant state.
   Determine it with read-only production counts of enabled provider configurations (never output secrets), deployment
   configuration presence, and one provider sandbox/live reconciliation per enabled tenant. L-PAY-2 itself is false
   because runtime signature/reconciliation checks exist regardless of rollout status.
   Example: The repository may contain complete MyPOS callback code while no production restaurant has MyPOS enabled
   or credentials configured. Conversely, one restaurant may have ePay enabled while all others use Stripe. Source
   presence alone cannot answer whether a provider handles real money.
   Recommendation: Produce a secret-free matrix with provider, enabled-restaurant count, environment
   (sandbox/live), last successful payment time, and last verified callback time. Reconcile one known transaction for
   every live provider before assigning rollout urgency.

8. Is SIGNUP uniqueness enforced in the database?
   No. There is no partial unique constraint preventing more than one `SIGNUP` ledger row per loyalty account in the
   current Prisma schema/migrations. The account itself is unique per customer/restaurant, but that is a different
   invariant. Add idempotency/uniqueness if bonus issuance is centralized; it is defense in depth, not evidence that
   the current F-ORDER-2 double award occurs.
   Example: The database prevents two loyalty accounts for the same customer/restaurant, but it would currently allow
   two ledger rows whose type is `SIGNUP` for that one account if a future bug or two unguarded writers inserted them.
   Account uniqueness therefore does not enforce bonus-event uniqueness.
   Recommendation: Add a PostgreSQL partial unique index allowing at most one `SIGNUP` row per loyalty account, and
   make the application insertion idempotent. Roll it out by first querying for existing duplicates and resolving any
   found rows before creating the index.

9. What is `STAFF_DEVICE_LIMIT`?
   It is `3`, defined in `apps/backend/src/auth/auth.service.ts` near the top-level constants (currently line 21).
   Example: If a staff account already has three active registered device/session records, registering a fourth should
   be rejected until an old device is revoked according to the service's current policy.
   Recommendation: Keep the limit in one named configuration/policy location, return a clear "device limit reached"
   response, expose safe device revocation to authorized users, and test the boundary explicitly: devices 1-3 succeed,
   device 4 fails, then succeeds after one revocation.

10. Does the loyalty `SELECT FOR UPDATE` work with PgBouncer transaction mode?
    Yes for the current order path: it runs inside one Prisma interactive `$transaction` and holds the PostgreSQL row
    lock until that database transaction commits/rolls back; it does not span HTTP requests. PgBouncer transaction
    pooling is compatible with transaction-scoped row locks. The real defect is consistency: cancellation and expiry
    do not all acquire the same lock, so the lock discipline must be applied to every loyalty-ledger mutator.
    Example: Order request A locks loyalty account 123 and changes its balance. Order request B targeting account 123
    waits; after A commits, B acquires the lock and reads the new balance. That is correct. If the expiry job updates
    account 123 without taking the same lock, it can race with A and calculate from stale state despite A's correct
    locking.
    Recommendation: Put account locking in one shared transaction helper and require order creation, redemption,
    cancellation/reversal, manual adjustment, and expiry to use it. Add a real PostgreSQL concurrency integration test
    through the same PgBouncer mode used in deployment; verify the ledger and cached balance agree after both workers
    finish.


---

CODEX REMEDIATION EXECUTION VERIFICATION - 2026-07-01 at 5PM

> Preservation note: This entire section is additive. No original audit text or earlier CODEX comment above was
> changed.
>
> Reviewed scope: remediation commit `2d739818` against parent `2425f66f`. The remediation source is already committed
> on `main`, not merely staged. The untracked `REPORT.MD`, this audit document, and
> `docs/superpowers/plans/2026-06-30-reservations-waitlist-item-availability.md` were not treated as implementation
> changes. Reservations/waitlist were explicitly excluded at the owner's request.
>
> Overall result: NOT FULLY VERIFIED FOR PRODUCTION - verified by CODEX. The broad test/type claims are true, and many
> fixes are correctly implemented, but F-PAY-1 is still unsafe and is a release blocker. In addition, 15 original
> findings need no code change because the first verification found them untrue, 25 are fixed in source, and 16 remain
> open or only partially fixed. Therefore the statement that all 56 findings are closed is not supported by the code.

STANDARDS REVIEW - verified by CODEX

- PASS: The repository rule forbidding concurrent Prisma writes inside one transaction is now followed in the changed
  subscription paths; `createMany` replaces `Promise.all(...create)`.
- PASS: Backend and frontend TypeScript checks are clean, Prisma schema validation is clean, and
  `git diff 2425f66f 2d739818 --check` is clean.
- PARTIAL: `graphify update .` has been run and the current graph reports commit `2d739818`, but the refreshed graph
  files are currently modified and unstaged. Committing only `2d739818` would retain the older graph snapshot.

SPEC REVIEW - RELEASE-BLOCKING REFUND FINDINGS

1. F-PAY-1 - VERIFIED STILL UNSAFE - verified by CODEX.
   `refundPayment()` decrements `paidQuantity` and deletes every `PaymentAllocation` at
   `stripe-checkout.service.ts:502-520` before Stripe has settled the refund. If Stripe later reports `failed` or
   `canceled`, the webhook/reconciler reloads the payment after those rows have been deleted, so
   `payment.allocations` is empty and `restoreAllocationsAndStatus()` cannot rebuild the quantities or allocation
   rows. The new tests hide this by mocking a REFUND_PENDING payment that still has allocations, a state the real
   forward path no longer retains.

2. F-PAY-1 - VERIFIED INCORRECT SYNCHRONOUS STATUS HANDLING - verified by CODEX.
   `createRefund()` returns the Stripe refund status, but `refundPayment()` ignores it and changes the payment to
   `REFUNDED` unconditionally at `stripe-checkout.service.ts:545-558`. Stripe refund status can be `pending`,
   `requires_action`, `succeeded`, `failed`, or `canceled`. A synchronous `pending`/`requires_action` response is
   therefore recorded as final success; a later failure cannot match the webhook's `REFUND_PENDING` query and cannot
   restore state. Official reference: https://docs.stripe.com/api/refunds/object?lang=node

3. F-PAY-1 - VERIFIED RECONCILIATION MISCORRELATION - verified by CODEX.
   No refund-attempt row or provider refund ID is persisted. The cron lists refunds by PaymentIntent and treats any
   successful refund among the first ten as proof that this full application payment was refunded. A manual, older,
   or partial refund can therefore finalize the wrong attempt/amount. It also treats `requires_action` as neither
   successful nor pending and restores the payment prematurely. The webhook handles only `refund.updated`, not the
   documented `refund.failed` event. Official reference: https://docs.stripe.com/refunds?dashboard-or-api=api

4. F-PAY-1 - VERIFIED DOUBLE-SETTLEMENT WINDOW - verified by CODEX.
   `computeSessionBalance()` counts only `SUCCEEDED` payments (`payment-core.service.ts:367`). Moving a payment to
   `REFUND_PENDING` and reversing allocations before provider success immediately makes that amount/items payable
   again. A guest can settle them while the refund is pending; if Stripe later fails, a restore can make the same
   units economically paid twice. Existing settlement guards check `PENDING`, not `REFUND_PENDING`.

   REQUIRED IMPLEMENTATION:
   Persist a separate `RefundAttempt` (application payment ID, amount, deterministic idempotency key, provider refund
   ID when known, provider status, and allocation snapshot). Keep the original payment and allocations economically
   paid while the attempt is pending. Inspect the synchronous Stripe status. Correlate webhooks/reconciliation to the
   exact refund ID/attempt. Only when Stripe says `succeeded`, atomically change the application payment to REFUNDED,
   decrement `paidQuantity`, and remove/move allocations. On `failed`/`canceled`, mark the attempt failed without
   exposing the bill as unpaid. Keep `pending`/`requires_action` pending and alert/reconcile. Add real tests for every
   provider status, lost responses, webhook retries, unrelated/partial refunds on the same PaymentIntent, and a
   concurrent settlement attempt.

HIGH FINDINGS - POST-IMPLEMENTATION STATUS

| ID | Execution result - verified by CODEX |
|---|---|
| F-AUTH-1 | PARTIALLY FIXED. `P2002` now becomes Conflict, but OTP consumption and user creation are still separate; the losing request consumes its code before receiving Conflict. |
| F-AUTH-2 | FIXED IN SOURCE, TEST GAP. Invalid JWT errors are rejected while absent credentials remain anonymous; no guard-level regression test was added. |
| F-AUTH-3 | FIXED. The impersonation code is consumed with one guarded `updateMany`; only the winner receives a JWT. |
| F-ORDER-1 | FIXED. A transition allowlist, terminal CANCELED state, and compare-and-swap status claim prevent replay/racing cancellation. |
| F-ORDER-2 | NO FIX REQUIRED. The original double-signup-bonus finding was verified not true. |
| F-ORDER-3 | FIXED. Session-token lookup now includes `restaurantId`. |
| F-ORDER-4 | FIXED IN SOURCE. Cancellation uses the shared row lock and calculates from the locked database row. A real PostgreSQL concurrency test is still desirable. |
| F-ORDER-5 | FIXED FOR THE VERIFIED RISK. Cancellation is limited to OWNER/MANAGER; normal kitchen workflow transitions remain available to assigned operational staff. |
| F-PAY-1 | OPEN / RELEASE BLOCKER. The new pending/webhook/cron implementation has the four correctness failures detailed above. |
| F-PAY-2 | FIXED. Stripe retrieval failure now produces retryable Service Unavailable instead of FREE. |
| F-PAY-3 | FIXED. Transactional `Promise.all` writes were replaced with `createMany`. |
| F-TRANS-1 | FIXED IN SOURCE, DB TEST GAP. Lazy writes use atomic JSONB field/path merges; tests mock SQL rather than exercising concurrent PostgreSQL writes. |
| F-TRANS-2 | FIXED IN SOURCE, DB TEST GAP. Prewarm writes use atomic JSONB merges; a real concurrent PostgreSQL integration test is still missing. |
| F-FE-1 | PARTIALLY FIXED. New authoring/import paths normalize or require EUR and frontend legacy base prices are normalized. No committed data migration proves every existing BGN row/options row was converted. |
| F-FE-2 | NO FIX REQUIRED. The claimed same-frame frontend race was not established; backend idempotency remains the important control. |
| F-FE-3 | PARTIALLY FIXED with F-FE-1. New cart additions are EUR-normalized, but correctness for historical BGN data depends on the unverified production data conversion. |

MEDIUM FINDINGS - POST-IMPLEMENTATION STATUS

| ID | Execution result - verified by CODEX |
|---|---|
| M-AUTH-1 | OPEN. Email OTP validation/attempt/consumption logic is still duplicated in `auth.service.ts:504` and `auth.service.ts:914`. |
| M-AUTH-2 | OPEN. Google strategy still requests only `profile`/`email` and does not carry or enforce `email_verified` (`google.strategy.ts:26`). |
| M-AUTH-3 | OPEN ARCHITECTURAL GAP. Backend CSP still permits broad `ws:`/`wss:` and the frontend document CSP was not added. |
| M-PAY-1 | OPEN. The bearer-like table session token is still in `GET session/:token/bill` (`payment.controller.ts:67`). |
| M-PAY-2 | NO FIX REQUIRED. Restaurant/session binding was already validated. |
| M-PAY-3 | OPEN. Subscription confirmation/webhook still falls back to `metadata.tier` when no recognized Stripe price is available (`subscription.service.ts:238,399,406,409`). |
| M-PAY-4 | FIXED. Ordinary Stripe refunds now use typed reason `requested_by_customer`; free text remains metadata. |
| M-PAY-5 | OPEN. Cleanup still loads up to 100 sessions and calls `computeSessionBalance()` once per session (`payment-session.service.ts:63-71`). |
| M-ORDER-1 | FIXED IN SOURCE. Loyalty account creation uses `upsert`; a real concurrent PostgreSQL test is still recommended. |
| M-ORDER-2 | FIXED. Ledger mismatch is logged with safe context and raised as an internal invariant failure. |
| M-ORDER-3 | FIXED IN SOURCE. Order, cancellation, on-demand expiry, and cron expiry paths use the shared row lock. |
| M-ORDER-4 | FIXED. Dynamic customer and restaurant names are HTML-escaped in the audited email paths. |
| M-TRANS-1 | NO FIX REQUIRED. The reported DeepL entity-decoding defect was contradicted by the integration mode. |
| M-TRANS-2 | NO FIX REQUIRED. IDs are CUIDs, so the proposed UUID validation would be wrong. |
| M-TRANS-3 | OPEN. No per-key miss coalescing, provider budget, or circuit breaker was added. |
| M-TRANS-4 | OPEN. The initial public-menu language can still briefly derive from global stored language before restaurant metadata resolves. |
| M-FE-1 | FIXED IN SOURCE, TEST GAP. Loyalty loading now aborts stale requests; no CheckoutPage regression test was added. |
| M-FE-2 | FIXED. Failure reverts only affected orders through a functional state update. |
| M-FE-3 | FIXED. Stored carts are shape/finite-value validated, with new regression tests. |
| M-FE-4 | NO FIX REQUIRED. The reported impersonation rejection was already caught. |
| M-FE-5 | FIXED. `selectedOptions` now has a concrete shared-shaped interface instead of `any[]`. |
| M-FE-6 | FIXED. Batch update now applies the same local access guard; backend remains authoritative. |

LOW FINDINGS - POST-IMPLEMENTATION STATUS

| ID | Execution result - verified by CODEX |
|---|---|
| L-AUTH-1 | OPEN/PARTIAL. CSRF exemptions still lack per-entry rationale and a maintenance-safety regression test. |
| L-AUTH-2 | NO FIX REQUIRED. The duplicate active-user check is harmless defense in depth. |
| L-AUTH-3 | NO FIX REQUIRED. SameSite behavior is already explicit. |
| L-PAY-1 | FIXED. Payment intent input now uses a validated DTO. |
| L-PAY-2 | NO FIX REQUIRED. Provider callback runtime verification was already present. |
| L-PAY-3 | NO FIX REQUIRED. Production startup already rejects a missing Stripe secret. |
| L-ORDER-1 | FIXED. Expiry uses one guarded `GREATEST(0, ...)` update while following the row-lock discipline. |
| L-ORDER-2 | OPEN AS METRIC-DOCUMENTATION DEBT. Repeat rate is still phone-identified repeat rate, not a global customer repeat rate. |
| L-ORDER-3 | NO FIX REQUIRED. The midnight/overnight behavior was intentional and correct. |
| L-TRANS-1 | NO FIX REQUIRED. Supported language sets already match. |
| L-TRANS-2 | OPEN AS CLEANUP DEBT. The duplicate restaurant lookup remains, although the original impact was overstated. |
| L-TRANS-3 | PARTIALLY FIXED. Requests are abortable and `forEach(async ...)` became `Promise.allSettled`, but category requests are still launched with unbounded batch concurrency. |
| L-TRANS-4 | NO FIX REQUIRED. Only request-local Prisma result objects were mutated. |
| L-FE-1 | FIXED. A wildcard Not Found route was added. |
| L-FE-2 | NO FIX REQUIRED. The mount-lifecycle ref behavior is intentional. |
| L-FE-3 | NO FIX REQUIRED AS WRITTEN. No concrete secret-bearing `console.error` was established. |
| L-FE-4 | FIXED. Checkout option keys now include `optionId` and `choiceName`. |
| L-FE-5 | FIXED. Impersonation codes are redacted from `X-Trace-Origin`. |

FEATURE-PLAN EXECUTION - verified by CODEX

- ITEM AVAILABILITY / "86" TOGGLE - IMPLEMENTED WITH A FRONTEND TEST GAP. Public queries exclude out-of-stock items,
  order creation rejects stale/direct attempts, the editor exposes the toggle, a restaurant-scoped public socket
  event updates open menus, and one socket is capped at five public-menu rooms. Backend event/order tests exist.
  There is no frontend regression test for socket-driven removal/re-fetch or the language-staleness guard.
- RESERVATIONS / WAITLIST - NOT IMPLEMENTED, AS DECLARED BY THE OWNER. No failure is assigned in this review because
  it was explicitly deferred. The public booking page, timeline/table assignment, waitlist, notifications, deposits,
  arrival-to-TableSession conversion, and reservation analytics remain future work.
- OFFLINE INTERNET FALLBACK - NOT IMPLEMENTED IN THIS REMEDIATION COMMIT. No service-worker/offline-order queue or
  explicit read-only cached-menu fallback was added here.
- LIVE BGN DATA CONVERSION - NOT VERIFIABLE FROM THE REPOSITORY. The code prevents/normalizes future non-EUR writes,
  but the claimed conversion of the 16 production Daffi rows and their option modifiers requires a read-only
  production query and payment/order reconciliation. Historical orders/payments must not be rewritten.

EXECUTED VERIFICATION - verified by CODEX

- Backend: 52 suites, 957 tests passed.
- Frontend: 25 files, 146 tests passed (existing React `act` and test-i18n warnings remain non-fatal).
- Backend `tsc --noEmit`: passed.
- Frontend `tsc --noEmit`: passed.
- Prisma schema validation: passed.
- Remediation diff whitespace check: passed.
- Not executed against production: Stripe webhook/refund end-to-end, production BGN row verification, and real
  PostgreSQL/PgBouncer concurrency tests. Unit mocks cannot prove those external/stateful invariants.


OPEN-LABEL CONFIDENCE CORRECTION - 2026-07-01 - verified by CODEX

> Preservation note: This correction is additive and supersedes only the earlier summary/count that grouped all 16
> OPEN/PARTIAL entries together. It does not remove or rewrite earlier comments.
>
> Corrected result after a second source-level challenge review:
>
> - 3 concrete defects remain and should be fixed before their affected feature is used in production.
> - 6 findings are genuine but non-blocking maintenance, hardening, analytics-label, or bounded-performance debt.
> - 2 currency IDs share one production-data verification condition; the committed application code is sufficient
>   once the live conversion is independently confirmed.
> - 5 previously OPEN/PARTIAL labels should be considered sufficient/closed for the present MVP.
>
> Corrected all-finding count: 30 fixed/sufficient, 15 no-fix-required, 3 must-fix defects, 6 deferrable debts, and
> 2 production-data-verification IDs = 56.

THREE CONCRETE DEFECTS - HIGH CONFIDENCE

1. F-PAY-1 - DEFINITELY NOT SUFFICIENT; RELEASE BLOCKER WHEN STRIPE REFUNDS ARE REACHABLE.
   This is established directly by the state transitions, without relying on timing speculation:

   - The forward path decrements `paidQuantity` and deletes `PaymentAllocation` rows before Stripe settles.
   - On an ambiguous Stripe error, the payment remains REFUND_PENDING, but a later failed/canceled webhook reloads an
     empty allocation relation. There is no persisted allocation snapshot from which to restore.
   - On a synchronous Stripe response, the returned status is ignored and the application records REFUNDED even when
     Stripe returned `pending` or `requires_action`.
   - Session balance counts only SUCCEEDED payments, so REFUND_PENDING makes the same amount/items payable before the
     provider has confirmed a refund.

   These are deterministic code paths. The current implementation is not enough. Persist a refund attempt/snapshot,
   keep the original payment economically paid until provider success, correlate the exact Stripe refund ID, and only
   reverse allocations atomically after `succeeded`.

2. M-AUTH-2 - DEFINITELY NOT SUFFICIENT BEFORE GOOGLE LOGIN IS ENABLED.
   `passport-google-oauth20` maps Google's `email_verified` value to `profile.emails[0].verified`, but
   `google.strategy.ts` discards that property and `AuthService` links an existing account by email. Therefore a false
   or absent verification value cannot be rejected by this application. Google also directs relying parties to use
   stable `sub` as the identifier and exposes `email_verified` as the verification signal.

   Required minimum: carry `emails[0].verified`, reject unless it is exactly `true`, and continue binding the provider
   identity to Google ID/`sub`. Explicit `openid profile email` plus signed ID-token validation is the stronger
   long-term implementation.

3. M-PAY-1 - DEFINITELY NOT SUFFICIENT; LIVE SESSION TOKENS ARE LOGGED.
   The token is embedded in routes such as `GET /payment/session/:token/bill`. Both `LoggingInterceptor` and the global
   exception filter write `originalUrl`/`url`, so this is not merely a theoretical proxy-log concern: the application
   itself records the secret-bearing path.

   Minimum immediate fix: redact/template every `/payment/session/<token>/...` path in all request/error logging.
   Preferred API fix: send a short-lived bill credential in an authorization header and retain legacy path routes only
   during a migration window.

TWO CURRENCY IDS - CODE SUFFICIENT, LIVE DATA NOT YET PROVED

- F-FE-1 and F-FE-3 should not be described as missing application implementation. New menu authoring requires EUR;
  BGN imports normalize base price, cost price, and option modifiers to EUR; cart additions normalize legacy BGN base
  prices; and public BGN is derived display information. That is sufficient going forward.
- The only remaining condition is operational: verify that production contains zero authoritative BGN menu rows and
  that the known 16 Daffi items/options were converted correctly. If a read-only production check confirms that, mark
  both IDs FIXED. Historical orders/payments must remain unchanged.

FIVE ENTRIES RECLASSIFIED AS SUFFICIENT/CLOSED FOR THE MVP

- F-AUTH-1 - SUFFICIENT. Catching `P2002` and returning Conflict closes the actual duplicate/500 race; the database
  unique key prevents duplicate accounts. Atomic OTP consumption would improve retry UX but is not required to close
  the original integrity claim.
- M-PAY-3 - SUFFICIENT FOR THE CURRENT TRUST MODEL. Checkout metadata is written server-side from the same allowlisted
  tier used to choose the Stripe price, and the webhook is signature-verified. Falling back to it is not a demonstrated
  metadata-forgery path. Retrying until the subscription price is authoritative is optional billing hardening.
- M-TRANS-3 - SUFFICIENT. The implementation already has route throttles, persistent translation caching, per-request
  text deduplication, bounded DeepL sockets, retry/backoff, non-retry of quota failures, and a tested circuit breaker.
  Cross-request single-flight coalescing would optimize simultaneous first misses but is not necessary to close the
  reported quota-risk finding.
- M-TRANS-4 - SUFFICIENT. Actual menu content is hidden while metadata loads; the restaurant/URL-selected language is
  set before menu content renders. Only the generic “Preparing your menu” loading label can briefly use the global UI
  language, which is not enough to keep this as an open menu-correctness defect.
- L-TRANS-3 - SUFFICIENT. In-flight batches are aborted, stale responses are ignored, and `forEach(async ...)` was
  replaced with an observed `Promise.allSettled` batch. Browser connection limits and backend DeepL socket limits bound
  actual I/O. A custom frontend concurrency pool is optional.

SIX REAL BUT DEFERRABLE ITEMS

- M-AUTH-1 - OTP logic remains duplicated. This is maintenance-divergence risk, not a demonstrated current exploit.
- M-AUTH-3 - The Vercel document still has no frontend CSP. This is worthwhile browser hardening; the original claim
  about the API's Helmet CSP directly protecting the SPA was mischaracterized.
- M-PAY-5 - The daily cleanup still performs per-session balance queries, but it is capped at 100 sessions and runs
  out of the request path. Optimize after measuring job duration/database load.
- L-AUTH-1 - The CSRF allowlist is explicit and POST-only, but per-entry rationale/tests would provide a future
  maintenance safety net.
- L-ORDER-2 - The repeat-rate metric still means phone-identified repeat rate. Rename/document the denominator; no
  transactional correctness issue exists.
- L-TRANS-2 - A duplicate restaurant lookup remains. It is a small query-efficiency cleanup, not an N+1 or release
  blocker.


PROOF APPENDIX AND ASSURANCE BOUNDARY - 2026-07-01 - verified by CODEX

> Preservation note: This appendix is additive only.
>
> Honest assurance statement: CODEX did not manually inspect every line and every possible runtime behavior in the
> entire 645-file repository. The graph reports approximately 953,000 words and 8,360 nodes. The audit inspected all
> 56 reported finding IDs and followed the complete relevant call chains for the disputed findings. This is a
> source-level audit, not formal verification and not a substitute for provider/database end-to-end tests.
>
> Evidence meanings:
>
> - PROVEN BY SOURCE means the current code has a deterministic path to the described state.
> - SUPPORTED BY PROVIDER CONTRACT means the external state is explicitly allowed by official provider documentation.
> - NOT PROVEN IN PRODUCTION means this review did not cause a live refund, use a false Google `email_verified` claim,
>   query production payment/session logs, or mutate production data.

F-PAY-1 PROOF TRACE

Evidence chain:

1. Entry and authorization:
   `PaymentController.refundPayment()` delegates through `PaymentService` to
   `StripeCheckoutService.refundPayment()`. The service loads the payment and its live `PaymentAllocation` rows.
2. Internal state is reversed before provider settlement:
   `stripe-checkout.service.ts:483-484` changes SUCCEEDED to REFUND_PENDING.
   `stripe-checkout.service.ts:502-520` decrements each `OrderItem.paidQuantity` and deletes all allocation rows.
3. The allocation snapshot is not persisted:
   The Prisma schema has no RefundAttempt/refund-allocation snapshot model or provider-refund-ID column. Repository-wide
   search finds the refund ID only in transient return/event payloads. The only remaining copy is the in-memory
   `allocations` variable in the HTTP request.
4. Asynchronous failure cannot reconstruct the deleted state:
   The webhook performs a fresh payment query at `stripe-checkout.service.ts:365-376` and passes that fresh
   `payment.allocations` value to `restoreAllocationsAndStatus()`. Because step 2 deleted those rows, the real value is
   an empty array. The helper can change status back to SUCCEEDED but loops over zero allocations, leaving
   `paidQuantity` decremented and the allocation records absent.
5. Existing unit tests do not model the real post-delete database state:
   `payment.service.spec.ts:1601-1609` and `:2575-2583` manufacture REFUND_PENDING payments that still contain the
   allocation rows deleted by the forward path. The tests therefore prove the helper works when handed a snapshot;
   they do not prove that a real webhook/reconciler can obtain that snapshot.

Deterministic example:

```
Initial:
  payment.status = SUCCEEDED
  orderItem.paidQuantity = 2
  paymentAllocation = [{ orderItemId: A, quantity: 2 }]

After the pre-Stripe transaction:
  payment.status = REFUND_PENDING
  orderItem.paidQuantity = 0
  paymentAllocation = []

Stripe timeout, then refund.updated(status=failed):
  webhook reloads paymentAllocation = []
  restore helper sets payment.status = SUCCEEDED
  restore helper has zero rows to increment/recreate

Final broken state:
  payment.status = SUCCEEDED
  orderItem.paidQuantity = 0
  paymentAllocation = []
```

Second independent proof:

- `StripeProvider.createRefund()` returns `{ refundId, status }`.
- `refundPayment()` does not branch on `refund.status`; it unconditionally writes REFUNDED at
  `stripe-checkout.service.ts:554-558`.
- Stripe officially allows `pending`, `requires_action`, `succeeded`, `failed`, and `canceled`:
  https://docs.stripe.com/api/refunds/object?lang=node
- Stripe documents that pending/action-required refunds can later fail or be canceled:
  https://docs.stripe.com/refunds?dashboard-or-api=api
- A later failed/canceled webhook searches only for application status REFUND_PENDING. It cannot find a row that the
  synchronous path already changed to REFUNDED.

Third independent proof, limited precisely to split/partial payments on an OPEN session:

- `payment-core.service.ts:367` counts only SUCCEEDED payments in `paidSubtotal`.
- Pending-scope guards at `payment-core.service.ts:436` consider only PaymentStatus.PENDING.
- Moving a previously successful partial payment to REFUND_PENDING removes it from paid balance immediately, while the
  pre-provider allocation reversal also makes its item units selectable again.
- Therefore another settlement can cover those units/amount while Stripe's refund is unresolved. If the refund later
  fails, the application has two economic settlements competing for the same bill.

Conclusion: F-PAY-1 is proven by source. What is not proven is how frequently Stripe will exercise those states in this
specific production account.

M-AUTH-2 PROOF TRACE

1. Google's userinfo contract exposes `email_verified`; Google says `sub` is the stable identity and email must not be
   used as the unique provider identity:
   https://developers.google.com/identity/openid-connect/openid-connect
2. The installed `passport-google-oauth20` parser copies the provider value to
   `profile.emails[0].verified` (`node_modules/passport-google-oauth20/lib/profile/openid.js:33`).
3. `google.strategy.ts:35-41` returns Google ID, email value, and names, but discards `emails[0].verified`.
4. `auth.service.ts:95-121` finds an existing local user by that email, writes the Google ID onto the account, replaces
   the password, and returns the account. There is no verification-flag check in the controller, guard, strategy, or
   service.
5. Existing Google-auth tests pass profiles without an `emailVerified` field and contain no false/missing-verification
   rejection test.

Deterministic application behavior:

```
Provider profile:
  id = google-123
  emails[0] = { value: owner@example.com, verified: false }

Strategy output:
  { googleId: google-123, email: owner@example.com, ... }  // flag discarded

Service behavior:
  find local owner@example.com
  link google-123
  invalidate old password
  issue application login
```

Conclusion: the missing validation is proven by source. A successful real-world takeover is not claimed as proven; it
depends on Google returning a false/unverified email that matches an existing account. The safe and small correction is
still to require `verified === true` before email-based linking and test false/missing cases.

M-PAY-1 PROOF TRACE

1. `payment.controller.ts:67-169` defines nine routes containing `session/:token`, including bill, intent, checkout,
   cash request, abandon, close variants, and partial settlement.
2. `TableSession.token` is a unique CUID and is used directly to retrieve an OPEN session and its bill. Possession is
   therefore authorization for the public bill/payment paths, even though table participants can legitimately receive
   it.
3. All three active application logging paths retain the dynamic token segment:

   - `main.ts:103` installs `requestLogger`; production removes only the query string, not path segments
     (`request-logger.ts:15-22,56`).
   - `app.module.ts:81-82` installs `LoggingInterceptor`, which assigns `originalUrl || url` directly to `path`
     (`logging.interceptor.ts:33-34`) and writes it in both structured and human-readable logs.
   - `main.ts:97` installs `AllExceptionsFilter`, which logs `originalUrl || url` on errors
     (`all-exceptions.filter.ts:52`).

Concrete logged value:

```
GET /api/v1/payments/session/cmabc123secret/bill?lang=bg

requestLogger production path:
  /api/v1/payments/session/cmabc123secret/bill

LoggingInterceptor path:
  /api/v1/payments/session/cmabc123secret/bill?lang=bg

AllExceptionsFilter error path:
  /api/v1/payments/session/cmabc123secret/bill?lang=bg
```

4. Repository-wide search found no payment-session path redactor and no regression test for it.

Conclusion: application-side token logging is proven by source. This does not prove that a particular production log
has been accessed by an unauthorized person. Immediate redaction of the dynamic segment is sufficient to close the
logging defect; moving the credential to an authorization header is stronger API hardening.

WHAT THE REPORT DOES AND DOES NOT PROVE

Proved:

- The current source contains the three control/correctness gaps above.
- All 56 original IDs were individually classified against source.
- The backend/frontend test suites and type checks pass, but their passing status does not cover the missing cases
  described above.

Not proved:

- That every unrelated feature in the application is defect-free.
- That the currently reviewed commit is exactly what is deployed in every production service.
- Actual production BGN row contents after the reported manual conversion.
- Real Stripe webhook timing/status behavior for this account, real Google false-verification behavior, or actual log
  disclosure. Those require controlled provider sandbox tests and read-only production verification.

Recommended confidence-closing tests:

1. PostgreSQL integration test: execute refund forward path, delete real allocation rows, then process a failed webhook;
   assert the original payment/allocation/paidQuantity invariant is exactly restored.
2. Stripe test-mode contract tests for create responses/webhooks in succeeded, pending, requires_action, failed, and
   canceled states, plus an unrelated/partial refund on the same PaymentIntent.
3. Google strategy tests with `emails[0].verified` true, false, and missing; only true may reach email-based linking.
4. Logging tests feeding every `/payments/session/<secret>/...` route through request, interceptor, and exception
   logging; assert the captured output never contains `<secret>`.

---

## CODEX FINAL-STATE VERIFICATION APPENDIX - 2026-07-02

> APPEND-ONLY COMMENT - verified by CODEX. This section supersedes earlier CODEX status labels where the implementation
> has changed. No original report content above was edited.

### Scope and final verdict

Verified against the complete local working tree based on commit
`2d7398186e545485c7e59f4791d09c5a96700305`, including the new untracked migration/tests/helpers. The knowledge graph
was read first as required; because the implementation is newer than HEAD, changed source was then inspected directly.
Reservations/waitlist are intentionally outside this verification because they were not implemented.

**FINAL VERDICT - NOT ALL 56 ITEMS ARE FULLY CLOSED.**

- 47/56 are verified fixed, already sufficient, or verified not to require a fix.
- 6/56 are fixed/sufficient in source but still need production-data or real-PostgreSQL verification.
- 3/56 remain partial/open: **F-PAY-1, M-PAY-1, and M-AUTH-3**.
- The new refund design is materially safer than the previous version and closes its original destructive-allocation and
  double-settlement defects. Two independent reconciliation/correlation defects still prevent a 100% closure label.

### Release-relevant residual findings

#### F-PAY-1 - NOT CLOSED - verified by CODEX

What is now correct:

- `RefundAttempt` persists the allocation snapshot before Stripe is called.
- `Payment` remains `SUCCEEDED` and allocations remain intact while the refund is unresolved.
- Only a provider-confirmed `succeeded` response changes the payment to `REFUNDED`.
- The payment-status compare-and-swap makes synchronous response, webhook, and cron finalization idempotent.
- `refund.updated` and `refund.failed` are handled and the cron query is capped.

Residual defect 1 - an ambiguous refund with a non-empty reason can remain pending forever:

1. The first Stripe request includes `reason: data.reason`
   (`stripe-checkout.service.ts:611-615`).
2. `StripeProvider.createRefund()` turns that reason into Stripe refund metadata
   (`stripe.provider.ts:168-180`).
3. If the response is lost before `providerRefundId` is saved, the cron retries with the same idempotency key but omits
   `reason` (`stripe-checkout.service.ts:857-863`).
4. Stripe requires retries using an existing idempotency key to have the same parameters; it errors when the parameters
   differ. Official contract:
   https://docs.stripe.com/api/idempotent_requests?lang=curl
5. The current reconciliation test checks only `idempotencyKey` with `objectContaining` and its fixture has no reason
   (`payment.service.spec.ts:2631-2694`), so the defect is not covered.

Required correction: pass `reason: attempt.reason ?? undefined` in the cron re-create call and add a regression test
that compares the full original/retry parameter set.

Residual defect 2 - webhook fallback can correlate an unrelated/manual/partial Stripe refund:

1. Exact `providerRefundId` matching is attempted first, which is correct.
2. When the ID has not yet been persisted, `resolveRefundAttemptForWebhook()` falls back to the PaymentIntent and takes
   the first pending application attempt (`stripe-checkout.service.ts:438-480`).
3. That fallback does not compare amount and does not require an application attempt identifier in refund metadata.
4. Stripe permits multiple and partial refunds for one PaymentIntent:
   https://docs.stripe.com/api/refunds/create?lang=node
5. Therefore a Dashboard/manual/partial refund event for the same PaymentIntent can finalize the application's full
   refund attempt, mark the whole application payment `REFUNDED`, and reverse the full allocation snapshot.

Required correction: write an immutable `refundAttemptId` (or equivalent application correlation key) into Stripe
refund metadata and require it on the no-ID webhook fallback. A simpler safe alternative is to remove the PaymentIntent
fallback and let the idempotent cron recover the exact refund ID.

Deployment prerequisite, not a third source defect: the new migration is additive and retains the deprecated
`REFUND_PENDING` enum value, but it does not migrate an existing payment row already carrying that value. Before
deploying, prove that production has zero `Payment.status = 'REFUND_PENDING'` rows or explicitly reconcile/migrate them.

#### M-PAY-1 - PARTIALLY FIXED - verified by CODEX

The new `redactSensitivePath()` correctly templates `/session/<token>/...` in all three application logging paths, and
its tests cover the token-bearing routes. This closes application-generated log leakage.

It does **not** close proxy/platform request logging because the bearer-like token still exists in the request URL.
Cloud Run creates request logs automatically:
https://docs.cloud.google.com/run/docs/logging
and its `requestUrl` field includes the requested path and query:
https://docs.cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry
Application redaction happens after the platform has received that URL and cannot rewrite those automatic request logs.
Vercel or another edge proxy can observe the same URL before NestJS.

Required correction for full closure: migrate the session credential out of the path into an authorization/custom
header (with a compatibility period), or prove and continuously enforce equivalent URL redaction/exclusion at every
edge and request-log layer. The current code alone cannot provide that proof.

#### M-AUTH-3 - PARTIALLY FIXED / SAFE ROLLOUT ONLY - verified by CODEX

`vercel.json` now defines useful security headers and a narrowed frontend CSP, but the CSP is
`Content-Security-Policy-Report-Only`, so it is not enforced. It also has no `report-to`, `report-uri`, or
`Reporting-Endpoints` configuration, so violations are not delivered to an application monitoring endpoint. Report-only
policies monitor without enforcing:
https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy-Report-Only

The current candidate must not be promoted unchanged: `form-action 'self'` conflicts with the external hosted-payment
forms submitted by `PaymentModal.tsx:958-978`. Current provider actions include:

- ePay: `https://demo.epay.bg/` and `https://www.epay.bg/`
- BORICA: `https://3dsgate-dev.borica.bg/...` and `https://3dsgate.borica.bg/...`
- myPOS: `https://www.mypos.com/vmp/checkout-test` and `/vmp/checkout`

`form-action` restricts form submission targets:
https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/form-action

Required correction for full closure: add a reporting endpoint, exercise every production flow, add the exact hosted
payment origins to `form-action`, then promote the validated policy to enforcing `Content-Security-Policy`. The backend
Helmet policy still contains broad `ws:`/`wss:`, but the security boundary that matters for this SPA is the CSP on the
frontend HTML document.

### Verification of the latest eight claimed fixes

| ID | Final result - verified by CODEX | Evidence |
|---|---|---|
| M-AUTH-1 | **FIXED** | `verifyOtp()` delegates to `consumeEmailVerificationCode()`, which normalizes email and owns lookup, lockout, comparison, and consumption. |
| L-AUTH-1 | **FIXED** | Frozen POST-only allowlist, per-entry rationale, exact-list regression test, and separate signed-webhook handling are present. |
| F-AUTH-2 | **FIXED + TESTED** | Guard test proves missing credentials remain anonymous while malformed, expired, and not-yet-valid JWTs are rejected. |
| M-PAY-3 | **SUFFICIENT + HARDENED** | Metadata remains a server-written, signed-webhook fallback rather than a new trust boundary; `normalizeTier()` now prevents invalid enum values. This is not a price-ID crosscheck, so the original wording remains overstated. |
| L-TRANS-2 | **FIXED** | `isActive` is folded into the four existing restaurant selects; controller pre-queries are removed and the shared in-memory assertion preserves suspended-restaurant rejection. |
| L-TRANS-3 | **FIXED + TESTED** | `runWithConcurrency(..., 4, ...)` bounds category fetches; abort/staleness/fallback behavior remains and the pool has concurrency/error/empty tests. |
| M-PAY-5 | **FIXED + TESTED** | Cleanup uses two batched reads for the page of sessions and preserves the existing amount formulas; empty, query-count, formula, and status-filter cases are tested. |
| M-AUTH-3 | **PARTIAL** | Security headers and a report-only candidate exist, but there is no enforcement/report destination and hosted-payment form origins must be corrected before promotion. |

### All 56 audit IDs - final reconciliation

Legend:

- **FIXED** - verified implementation closes the source issue.
- **SUFFICIENT / NO FIX REQUIRED** - original finding was false, overstated, intentional, or already safely handled.
- **SOURCE FIXED; EXTERNAL VERIFY** - no remaining code correction was identified, but the requested 100% proof requires
  production data or a real PostgreSQL/PgBouncer concurrency environment.
- **PARTIAL / OPEN** - a concrete residual gap remains.

#### High findings (16)

| ID | Final status - verified by CODEX |
|---|---|
| F-AUTH-1 | **SUFFICIENT.** Unique DB constraint plus `P2002 -> Conflict` closes the duplicate-registration/500 race; atomic OTP+user creation would improve loser-request UX but is not required for the reported defect. |
| F-AUTH-2 | **FIXED.** Optional auth rejects a present invalid JWT and permits a genuinely absent credential; the missing guard regression test now exists. |
| F-AUTH-3 | **FIXED.** Impersonation code consumption is a guarded atomic claim. |
| F-ORDER-1 | **FIXED.** Transition allowlist, terminal cancellation, and compare-and-swap claim prevent replay/racing cancellation. |
| F-ORDER-2 | **NO FIX REQUIRED.** The alleged double signup bonus was not present. |
| F-ORDER-3 | **FIXED.** Session-token order lookup is restaurant-bound. |
| F-ORDER-4 | **SOURCE FIXED; EXTERNAL VERIFY.** Cancellation locks and calculates from the locked row; a real concurrent PostgreSQL test is still required for DB-level proof. |
| F-ORDER-5 | **FIXED FOR VERIFIED RISK.** Cancellation is OWNER/MANAGER-only while assigned operational workflow transitions remain available. |
| F-PAY-1 | **OPEN.** New design fixes the original destructive sequencing, but the reason-mismatched idempotent retry and PaymentIntent-only webhook fallback above remain. |
| F-PAY-2 | **FIXED.** Stripe retrieval uncertainty is retryable failure, not interpreted as a free payment. |
| F-PAY-3 | **FIXED.** Concurrent transactional Prisma writes were removed/replaced with safe bulk writes. |
| F-TRANS-1 | **SOURCE FIXED; EXTERNAL VERIFY.** Lazy translation uses atomic JSONB merge; real concurrent PostgreSQL execution remains unverified. |
| F-TRANS-2 | **SOURCE FIXED; EXTERNAL VERIFY.** Prewarm uses atomic JSONB merge; real concurrent PostgreSQL execution remains unverified. |
| F-FE-1 | **SOURCE FIXED; EXTERNAL VERIFY.** New paths normalize authoritative values to EUR, but only a read-only production query can prove no live BGN-authoritative menu rows remain. |
| F-FE-2 | **NO FIX REQUIRED.** The alleged same-frame frontend race was not established; backend idempotency is the authoritative duplicate control. |
| F-FE-3 | **SOURCE FIXED; EXTERNAL VERIFY.** Cart/options normalization is correct for current code; final certainty shares the F-FE-1 production-data prerequisite. |

#### Medium findings (22)

| ID | Final status - verified by CODEX |
|---|---|
| M-AUTH-1 | **FIXED.** Email OTP logic is deduplicated through the normalized shared consumer. |
| M-AUTH-2 | **FIXED.** Strategy carries `email_verified`; false/missing is rejected for email link/create, while an already-bound stable Google ID remains usable. |
| M-AUTH-3 | **PARTIAL.** Report-only candidate and headers are useful, but no CSP is enforced and hosted-payment form targets are not yet allowlisted. |
| M-PAY-1 | **PARTIAL.** Application logs redact the token, but platform/proxy request URLs still receive it. |
| M-PAY-2 | **NO FIX REQUIRED.** Cash-request restaurant/session binding was already validated. |
| M-PAY-3 | **SUFFICIENT + HARDENED.** Fallback metadata is server-authored and webhook-signature-protected; enum validation now prevents garbage writes. |
| M-PAY-4 | **FIXED.** Stripe receives a typed refund reason; free text is metadata. |
| M-PAY-5 | **FIXED.** Cleanup balance calculation is batched into two queries. |
| M-ORDER-1 | **SOURCE FIXED; EXTERNAL VERIFY.** Loyalty account creation uses upsert; only real concurrent PostgreSQL can prove the operational race behavior. |
| M-ORDER-2 | **FIXED.** Ledger mismatch has safe context and a deliberate internal-invariant failure. |
| M-ORDER-3 | **FIXED IN SOURCE.** Relevant redemption/expiry/order paths share the account row-lock discipline. |
| M-ORDER-4 | **FIXED.** Dynamic names are HTML-escaped in the audited email paths. |
| M-TRANS-1 | **NO FIX REQUIRED.** The alleged DeepL entity defect contradicted the actual text integration mode. |
| M-TRANS-2 | **NO FIX REQUIRED.** IDs are CUIDs; `ParseUUIDPipe` would reject valid identifiers. |
| M-TRANS-3 | **SUFFICIENT.** Existing cache/deduplication, bounded sockets, retry/backoff, circuit breaker, and route controls make the original single-request-per-provider-call model inaccurate. |
| M-TRANS-4 | **SUFFICIENT.** Menu content waits for restaurant metadata/`selectedLang`; only the temporary loading label uses UI language. |
| M-FE-1 | **SUFFICIENT/FIXED.** Loyalty fetch already has an `AbortController` and stale writes are prevented. |
| M-FE-2 | **FIXED.** Optimistic failure reverts affected orders through a functional state update. |
| M-FE-3 | **FIXED.** Stored cart entries are shape- and finite-number-validated. |
| M-FE-4 | **NO FIX REQUIRED.** The alleged raw impersonation rejection already had handling. |
| M-FE-5 | **FIXED.** `selectedOptions` has a concrete interface. |
| M-FE-6 | **FIXED.** Batch status update has the local access guard; backend authorization remains authoritative. |

#### Low findings (18)

| ID | Final status - verified by CODEX |
|---|---|
| L-AUTH-1 | **FIXED.** CSRF exemptions have centralized rationale, frozen exact-list tests, and POST-only matching. |
| L-AUTH-2 | **NO FIX REQUIRED.** Duplicate active-user check is harmless defense in depth. |
| L-AUTH-3 | **NO FIX REQUIRED.** SameSite behavior is already explicit by environment/configuration. |
| L-PAY-1 | **FIXED.** Payment input uses a validated DTO. |
| L-PAY-2 | **NO FIX REQUIRED.** Provider callback bodies already receive runtime verification. |
| L-PAY-3 | **NO FIX REQUIRED.** Production startup rejects a missing Stripe secret. |
| L-ORDER-1 | **FIXED.** Expiry uses a guarded non-negative update under the lock discipline. |
| L-ORDER-2 | **SUFFICIENT/DOCUMENTED.** The metric is deliberately phone-identified repeat rate; this limitation is documented rather than represented as all-customer identity. |
| L-ORDER-3 | **NO FIX REQUIRED.** Midnight/overnight behavior is intentional and correct. |
| L-TRANS-1 | **NO FIX REQUIRED.** Backend/frontend supported language sets match; ordering is cosmetic. |
| L-TRANS-2 | **FIXED.** Duplicate restaurant lookup is removed without losing the suspension check. |
| L-TRANS-3 | **FIXED.** Category translation fetches are abortable, stale-guarded, and concurrency-bounded. |
| L-TRANS-4 | **NO FIX REQUIRED.** Mutation was limited to a request-local Prisma result object. |
| L-FE-1 | **FIXED.** Wildcard Not Found route exists. |
| L-FE-2 | **NO FIX REQUIRED.** Ref lifecycle behavior is intentional. |
| L-FE-3 | **NO FIX REQUIRED AS WRITTEN.** No concrete secret-bearing production `console.error` was established. |
| L-FE-4 | **FIXED.** Checkout option keys include stable option identity plus choice. |
| L-FE-5 | **FIXED.** Impersonation credentials are removed from trace-origin logging. |

### External verification still required for six IDs

These are not identified as missing code fixes:

1. **F-FE-1 / F-FE-3:** read-only production query proving zero authoritative BGN menu item/option values remain after
   the EUR conversion. Historical orders must remain historical and must not be rewritten.
2. **F-ORDER-4 / F-TRANS-1 / F-TRANS-2 / M-ORDER-1:** execute true concurrent transactions against the deployment's
   PostgreSQL/PgBouncer configuration. Unit mocks cannot prove row-lock scheduling, `P2002` behavior, or concurrent
   JSONB merge semantics.

### Commands executed and results

| Check | Result - verified by CODEX |
|---|---|
| Backend Jest | **PASS:** 55 suites, 995 tests |
| Frontend Vitest | **PASS:** 26 files, 150 tests |
| Backend `tsc --noEmit` | **PASS** |
| Frontend `tsc --noEmit` | **PASS** |
| `prisma validate` | **PASS** |
| `vercel.json` JSON parse | **PASS** |
| `git diff --check` | **PASS** (line-ending warnings only) |

The green suite is meaningful but does not cover the two residual F-PAY-1 cases. Required additions are:

1. Ambiguous Stripe timeout with a non-empty refund reason; assert the cron replay sends exactly the same parameters.
2. Unrelated/manual partial refund on the same PaymentIntent; assert it cannot resolve the application's pending full
   refund attempt.
3. CSP browser/preview tests covering Stripe Elements, sockets, Google Fonts, images, ePay, BORICA, and myPOS before
   replacing Report-Only with enforcement.

---

## CODEX SOURCE-CLOSURE APPENDIX - 2026-07-02

> APPEND-ONLY COMMENT - verified by CODEX. This section supersedes the status labels in every earlier CODEX appendix
> where later implementation or stronger evidence changed the result. No original report content was edited.

### Final verdict

**All 56 audit IDs now have a verified source/pre-production disposition: 56/56 closed, sufficient, or no fix
required; 0/56 remain open in the reviewed working tree.**

This is a source-closure verdict, not a claim that the working tree has already been deployed. Production still needs
the three migrations and coordinated backend/frontend deployment listed below. Reservations/waitlist remain explicitly
outside this audit because they were not implemented.

The previous appendix's 47 already-closed/sufficient findings remain unchanged. The nine findings that previously
remained open or externally unverified are superseded as follows:

| ID | Superseding final status - verified by CODEX | Proof |
|---|---|---|
| F-PAY-1 | **FIXED / RELEASE-BLOCKING SOURCE GAP CLOSED.** | `RefundAttempt` stores the allocation snapshot before Stripe. Payment and allocations stay economically paid until provider success. The original reason is replayed with the same idempotency key; Stripe metadata carries the exact attempt ID; webhook handling requires exact refund/attempt correlation plus PaymentIntent and full-amount agreement; `refund.failed` and the capped cron are handled. Finalization is one CAS-guarded transaction and fails closed on malformed snapshots, missing/drifted order-item allocations, or reversal failure. Ambiguous errors remain pending for exact reconciliation. Production has zero legacy `REFUND_PENDING` rows. |
| M-PAY-1 | **FIXED.** | All nine table-session payment endpoints use fixed URLs and `X-Table-Session-Token`; old token-in-path routes return 404. POS links carry the credential only in a fragment. Application logging still redacts legacy shapes defensively. Stripe return URLs are now fragment-free, with a validated tab-scoped marker used only to resume a redirect. Tests prove request URLs and Stripe's `return_url` do not contain the token. |
| M-AUTH-3 | **FIXED.** | Vercel now sends an enforcing CSP, exact production HTTPS/WSS backend origins, exact Stripe/Google resources, and exact ePay/BORICA/myPOS form origins. A bounded/rate-limited CSP report endpoint accepts both legacy and Reporting API formats and strips query, fragment, and sensitive path values. Backend Helmet no longer allows scheme-wide WebSockets. |
| F-FE-1 | **VERIFIED CLOSED WITH PRODUCTION DATA.** | Read-only production transaction found 951 EUR menu items and zero BGN-authoritative menu items. |
| F-FE-3 | **VERIFIED CLOSED WITH PRODUCTION DATA.** | Production found zero options under BGN-authoritative items and zero embedded BGN option currencies. New code normalizes supported import/cart values to authoritative EUR. |
| F-ORDER-4 | **VERIFIED CLOSED WITH REAL DATABASE CONCURRENCY.** | The cancellation race test passed against PostgreSQL 17 directly and through transaction-mode PgBouncer. |
| F-TRANS-1 | **VERIFIED CLOSED WITH REAL DATABASE CONCURRENCY.** | Concurrent lazy DE/FR category/item/option translation merges passed against PostgreSQL 17 and transaction-mode PgBouncer. |
| F-TRANS-2 | **VERIFIED CLOSED WITH REAL DATABASE CONCURRENCY.** | The harness directly races each category, item, and option pre-warm path against a lazy translation write; all fragments survived on both database paths. |
| M-ORDER-1 | **FIXED AFTER REAL TEST EXPOSED THE MOCK BLIND SPOT.** | Prisma's empty-update upsert did produce `P2002` under a 24-way first-account race. It was replaced with native `INSERT ... ON CONFLICT DO NOTHING`, followed by the existing row lock. The 24-way test then passed directly and through PgBouncer. |

### Complete 56-ID reconciliation

Every ID below was rechecked against its relevant source path and tests. “Sufficient” means the report's alleged defect
was false, overstated, intentional, or already protected; it does not hide an unfixed demonstrated defect.

| Severity | Verified fixed | Verified sufficient / no fix required |
|---|---|---|
| High (16) | F-AUTH-1, F-AUTH-2, F-AUTH-3, F-ORDER-1, F-ORDER-3, F-ORDER-4, F-ORDER-5, F-PAY-1, F-PAY-2, F-PAY-3, F-TRANS-1, F-TRANS-2, F-FE-1, F-FE-3 | F-ORDER-2, F-FE-2 |
| Medium (22) | M-AUTH-1, M-AUTH-2, M-AUTH-3, M-PAY-1, M-PAY-3, M-PAY-4, M-PAY-5, M-ORDER-1, M-ORDER-2, M-ORDER-3, M-ORDER-4, M-FE-2, M-FE-3, M-FE-5, M-FE-6 | M-PAY-2, M-TRANS-1, M-TRANS-2, M-TRANS-3, M-TRANS-4, M-FE-1, M-FE-4 |
| Low (18) | L-AUTH-1, L-PAY-1, L-ORDER-1, L-TRANS-2, L-TRANS-3, L-FE-1, L-FE-4, L-FE-5 | L-AUTH-2, L-AUTH-3, L-PAY-2, L-PAY-3, L-ORDER-2, L-ORDER-3, L-TRANS-1, L-TRANS-4, L-FE-2, L-FE-3 |

### Currency policy and production-data result

- **EUR is the only authoritative/business currency.** Pricing, orders, payments, costs, totals, and provider amounts
  use EUR.
- The public menu's BGN value is informational dual display only, calculated from EUR at the fixed conversion rate
  **1 EUR = 1.95583 BGN**. It must not be submitted, stored, settled, refunded, or analysed as the transaction currency.
- Per the owner's product policy, retain that informational BGN display until **1 January 2027**. The current display
  has no automatic cutoff; schedule a configuration/date-controlled removal before that date. This future display
  removal is not one of the 56 audit defects.
- Historical orders/payments are accounting records and must not be rewritten.
- The final read-only production check returned: 951 EUR menu items, 0 BGN menu items, 0 options under BGN items,
  0 option payloads with embedded BGN currency, 0 non-EUR payments, and 0 legacy `REFUND_PENDING` payments.

### Database and migration proof

- All 23 migrations were applied from empty on PostgreSQL 17.10.
- `prisma migrate diff` then reported no difference between that clean database and `schema.prisma`.
- The two compatibility/baseline migrations were executed a second time successfully, then diffed clean again.
- The real concurrency suite passed **4/4 directly on PostgreSQL 17** and **4/4 through PgBouncer 1.25.2 in transaction
  mode**.
- The historical `20260620120000_architecture_todo_fixes` SQL had an invalid target-table LATERAL reference and the
  printing schema was referenced before its creating migration. The SQL was corrected and an idempotent earlier bridge
  migration was added. Because production had already applied that historical migration, its recorded checksum differs
  from the corrected repository file; Prisma status still identifies only the three expected pending migrations. Treat
  this as a documented immutable-history exception and retain a database backup for deployment.

### Final automated evidence

| Check | Final result - verified by CODEX |
|---|---|
| Backend Jest | **PASS:** 58 suites, 1,004 tests |
| Frontend Vitest | **PASS:** 29 files, 159 tests |
| Backend and frontend `tsc --noEmit` | **PASS** |
| Backend and frontend production builds | **PASS** |
| Changed backend TypeScript ESLint | **PASS** |
| Prisma schema validation | **PASS** |
| Prisma raw-query guard | **PASS** |
| Clean PostgreSQL 17 migration chain + schema diff | **PASS** |
| Direct PostgreSQL concurrency suite | **PASS:** 4/4 |
| PgBouncer transaction-mode concurrency suite | **PASS:** 4/4 |
| Read-only production currency/refund audit | **PASS** |
| `vercel.json` parse, CSP regression, and `git diff --check` | **PASS** |

### Required deployment procedure - not open source findings

1. Take a production database backup/snapshot.
2. Apply exactly these pending migrations:
   `20260610000000_add_printing_tables`, `20260702080000_align_baseline_schema`, and
   `20260702090000_add_refund_attempt`.
3. Deploy backend and frontend as one coordinated release because M-PAY-1 intentionally removes the old token-in-path
   contract.
4. Smoke-test POS QR bill loading, Stripe including a redirect/3-D Secure path, ePay, BORICA, myPOS, sockets, Google
   Fonts, and CSP report delivery.
5. Monitor refund attempts, CSP reports, payment callbacks, and error logs during rollout.

No production migration or deployment was performed by CODEX during this verification.
