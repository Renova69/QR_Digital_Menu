# Security Audit Verdict — 22 Aug 2026

Verification of every claim in `FULL_SECURITY_AUDIT_22082026.md` against the actual codebase and live infrastructure, plus a remediation plan.

**Remediation update — 28 Aug 2026:** the historical findings below are retained
as the 22 Aug evidence snapshot. The P2 ledger near the end is the current
status: all active P2 engineering work is complete, with only explicit
pre-launch operational gates deferred. P3-1 is merged/deployed at `e7500785`;
manual product verification remains pending. P3-2 is merged via PR #58 at
`f4ec9a61`; backend deployment is deliberately batched with later P3 work.
P3-3 is MERGED/COMPLETE through PR #63 (`32fdc9e6`), with green PR and
post-merge CI. All 132 management routes
are guarded; the other 113 have explicit separate authorization classifications.
No temporary migration entries remain. Batch release verification is pending,
not additional P3-3 implementation. P3-4 is PARTIAL: orders/assistance/feedback
query scoping is in review; menu/tenant-management and payment/session work remains.

**Method:** 6 parallel code-audit agents (session/auth, multi-tenant isolation, error handling, API surface, secrets, resilience) plus direct verification of GitHub rulesets, Cloud Run configuration, Neon settings, DNS records, git history and backup artifacts. Every finding below carries a `file:line` or a live-infrastructure query as evidence. All CRITICAL and HIGH findings were re-verified by hand, not accepted on an agent's word.

**Headline:** the advisory document is a generic checklist, not an audit of this system. Of its 36 numbered steps, **14 describe things we already do**, 9 rest on a premise that is false here (we have no Cloudflare), and 13 point at real gaps. More importantly, **the single worst defect in the system is not mentioned anywhere in the document** — see C1.

---

## Part 1 — Scorecard

### Scenario 1 — Cloudflare rate limiting / bot management / WAF

| Step | Claim                                             | Verdict                                                                                                                                                                                                  |
| ---- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Configure Cloudflare rate limiting on auth routes | **N/A — false premise.** There is no Cloudflare in front of this application. Frontend is Vercel (Hobby), backend is Cloud Run reached directly. The underlying concern is real and is tracked as H2/H8. |
| 2    | Bot management on high-value pages                | **N/A — same premise.** Vercel Firewall has no custom rules, bot management is off, managed rulesets are a paid tier. Confirmed with the operator.                                                       |
| 3    | Custom WAF rules for OWASP Top 10 at the edge     | **N/A — same premise.** No edge WAF exists at any layer.                                                                                                                                                 |

The document's claim that "we're paying for a wall" is wrong — we are not paying for one. The correct translation of this scenario to our stack is H8.

### Scenario 2 — GitHub as an engineering system

| Step | Claim                               | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Lock main; require PR + ≥1 approval | **MOSTLY TRUE ALREADY.** Ruleset `Protect main: PR + CI` (id 20864761) is active on `~DEFAULT_BRANCH` with `bypass_actors: []` and `current_user_can_bypass: never`. Direct push, deletion and force-push are all blocked. **Gap:** `required_approving_review_count: 0`, so a PR can be self-merged. Tracked as L6.                                                                                                                                    |
| 2    | Automated checks before merge       | **ALREADY DONE, and stronger than described.** `.github/workflows/ci.yml` gates every PR on: deploy script AST parse, `prisma migrate deploy`, `migrate diff --exit-code` drift check, pre-production readiness script, Prisma raw-query guard, backend + frontend lint, ~2,279 backend unit tests with coverage, ~31 backend e2e, frontend typecheck, ~588 Vitest tests, printer-agent typecheck/lint/tests, Playwright smoke, and a full turbo build. |
| 3    | Small scoped commits                | **ALREADY DONE.** Last 40 commits on main: median 3–5 files, conventional-commit messages, merged via PR. One 73-file outlier (`fd8833a3`). The document's "47 files, straight to main, no tests" scenario does not describe this repository.                                                                                                                                                                                                           |

### Scenario 3 — Circuit breakers / bulkheads / timeout budgets

| Step | Claim                                                       | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Circuit breakers on every external dependency               | **PARTLY TRUE.** 1 of 16 outbound dependencies has a breaker (DeepL, hand-rolled at `translation/translation.service.ts:29-49`). Most other gaps are adequately covered by timeouts, caching or queueing — but Stripe, R2 and the two auth OTP calls have **neither a breaker nor a deadline**. Tracked as H7.                                                                                                                                                                                               |
| 2    | Bulkhead isolation; one slow service drains the shared pool | **FALSE as stated.** The DB pool is explicitly sized (`connection_limit=10&pool_timeout=30&connect_timeout=30`) and — critically — **zero of 91 `$transaction` blocks make an external call inside the transaction.** Two services carry in-code comments explaining that this was deliberately designed against. The document's exact cascade mechanism is prevented here. **True sub-claim:** only DeepL has a bounded HTTP agent (`maxSockets: 4`); everything else shares Node's unbounded global agent. |
| 3    | Cascading timeout budgets                                   | **TRUE.** There is no request-level deadline anywhere: no `TimeoutInterceptor`, no RxJS `timeout()`, no `server.setTimeout`, no `axios.defaults.timeout`, no `AbortSignal` propagation. Tracked as H7.                                                                                                                                                                                                                                                                                                       |

### Scenario 4 — Origin IP leaking around Cloudflare

| Step | Claim                                                     | Verdict                                                                                                                                                                                                                                                      |
| ---- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Origin IP is discoverable via DNS history / email headers | **N/A as written, TRUE in substance.** No Cloudflare, so no DNS-history angle. But the Cloud Run origin is not merely discoverable — it is **published**, hardcoded in `vercel.json` rewrites and in the CSP `connect-src`/`wss:` directives. Tracked as H8. |
| 2    | Firewall the origin to the edge's IP ranges only          | **TRUE in substance.** Cloud Run `ingress: all`, IAM `allUsers → roles/run.invoker`. Anyone can hit the backend directly and skip Vercel entirely. Separately, WebSocket traffic _always_ goes direct (`SocketContext.tsx:56`). Tracked as H8.               |
| 3    | SSL is probably flexible; set full strict                 | **FALSE.** Not applicable — no Cloudflare SSL mode exists. Vercel→Cloud Run and browser→Vercel are both TLS end to end. HSTS is set with `max-age=63072000; includeSubDomains; preload`.                                                                     |

### Scenario 5 — Tier-3 RBAC (ABAC / zero trust / session risk)

| Step | Claim                                             | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Attribute-based access control evaluating context | **PARTLY TRUE.** No IP, geo, time-of-day, device-fingerprint or step-up auth exists anywhere. But substantial context _is_ evaluated per request: subscription tier with in-flight role demotion (`jwt.strategy.ts:151-173`), restaurant suspension, `sharedDeviceModeEnabled`, device enrolment + `sessionVersion`, and impersonation-session liveness. The document's "static roles that never evaluate context" is an overstatement. |
| 2    | Zero trust on every internal request              | **MOSTLY TRUE ALREADY.** Nothing in the backend trusts network position — no header-based or IP-based auth exists. Socket rooms are authorised per-join with a **fresh DB read**, not a cached claim. There is a CSWSH guard rejecting `Origin: null`. **Weak spots:** the socket handshake does not re-check `passwordChangedAt` or device revocation (M2), and `PrintAgentToken` has no expiry or revocation column (M6).             |
| 3    | Continuous session risk scoring                   | **TRUE.** None exists. Worse, `StaffPinLoginAudit` is written on every PIN attempt and **never read by anything** — the data is collected, stored and ignored. There is also no per-account lockout on password login (M1).                                                                                                                                                                                                             |

### Scenario 6 — Inspection before occupancy

Not a technical claim; it is the argument for doing this audit. The substantive assertion — "run a structured audit across every production layer, know what passed and what failed" — is what this document is. Regulatory specifics in the source are unreliable ("109 states have passed other laws" is not a real figure) and should not be cited.

### Scenario 7 — Zero-downtime migrations

| Step | Claim                                                | Verdict                                                                                                                                                                                                                                                                                                   |
| ---- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | You will default to dropping and recreating a column | **FALSE.** The repository has 65 forward migrations. CI and deployment reject destructive SQL, production PostgreSQL guards independently block schema/table/column loss and truncation, and the migration policy requires expand/backfill/contract.                                                      |
| 2    | Write the rollback script before the migration       | **SUPERSEDED.** Executable down scripts are intentionally prohibited because they can erase writes made after deployment. P2-9 requires a reviewed forward-recovery plan and an explicit old-app/new-schema compatibility window instead.                                                                 |
| 3    | Test on a staging mirror of live data first          | **IMPLEMENTED, ACTIVATION DEFERRED PRE-LAUNCH.** PR #54 added an isolated Supabase/Cloud Run/Stripe test environment and exact-SHA proof. With no real tenants, payments, or customer data, activation is deferred by owner decision; bypass is explicit and staging remains the default deployment path. |

### Scenario 8 — Error handling leaking internals

| Step | Claim                                                                      | Verdict                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —    | "Our app dumped a raw stack trace with the DB connection string to a user" | **FALSE.** `AllExceptionsFilter` (`main.ts:126`) catches everything; any non-`HttpException` is hard-mapped to `{statusCode: 500, message: "Internal server error", requestId}`. `stack` goes only to the log sink. Prisma errors — including `P1001`, which embeds host and port — fall into that generic branch. Swagger is mounted only outside production. No connection string is reachable from any error path. |
| 1    | Split public and private error layers                                      | **ALREADY DONE**, more thoroughly than described: static public message + `requestId` correlation handle; private structured log with stack, userId, role, restaurantId; Sentry capture gated to 5xx only; sensitive-key redaction (`app-logger.ts:69-80`) and path redaction for session/manage tokens (`redact-path.ts`) applied before logging.                                                                    |
| 2    | Catch errors at every boundary; add Vitest and Playwright                  | **PARTLY TRUE.** Vitest and Playwright already run in CI (see Scenario 2). Real gaps: 20 of 24 `@Cron` jobs have no monitoring wrapper, ~19 floating promises lack `.catch()`, there is no `process.on('unhandledRejection')` net, and `AllExceptionsFilter` calls `host.switchToHttp()` unconditionally despite also sitting in the WebSocket filter chain. Tracked as M7.                                           |
| 3    | Build an error logging pipeline                                            | **ALREADY DONE.** Structured JSON logs to Cloud Logging with timestamps, request IDs, routes, redacted paths, duration and identity; a second independent client-log pipeline (`clientLogger.ts` → `POST /client-logs`) correlating `x-request-id` end to end; Sentry on both ends with hidden source maps uploaded at build. **Gaps:** no `release`, no `beforeSend` scrubber, no `Sentry.setUser`. Tracked as M8.   |

Two narrow real leaks were found that the document did not describe: three upload controllers echo `error.message` into a 400 (`category.controller.ts:130`, `item.controller.ts:167`, `restaurants.controller.ts:141`), and `ErrorBoundary.tsx:70` renders raw `error.message` to the user. Tracked as M15.

### Scenario 9 — Cross-tenant cache leak

| Step | Claim                              | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Scope every cache key to tenant ID | **FALSE — already done.** Every cache found is tenant-keyed: `analyticsCache` keys on `restaurantId:period:...`, `autoTrendingCache` on `restaurantId:lang:...`. There is no `@nestjs/cache-manager`, no `CacheInterceptor`, no Redis response cache. `authenticated-no-store.middleware.ts` forces `no-store` on any response carrying an auth cookie. The TanStack key the document's scenario would predict, `['subscription-status']`, is in fact `["subscription-status", userId, activeRestaurantId]` (`useFeature.ts:144`) — our own CLAUDE.md is stale on this, not the code. `queryClient.clear()` runs on all five identity transitions. |
| 2    | Audit every shared layer           | **PARTLY TRUE.** Socket rooms, print-job routing, translation queue, push, menu-views and loyalty are all correctly scoped. **One real gap:** R2 object keys are a flat namespace (`storage.service.ts:121-123`) with no per-tenant prefix, and `isImageReferencedElsewhere` counts references globally across tenants — which blocks clean per-tenant purge and GDPR erasure. Tracked as M5.                                                                                                                                                                                                                                                      |
| 3    | Build a cross-tenant access test   | **TRUE.** 141 backend unit tests assert cross-tenant rejection, which is genuinely strong — but there is no browser-level account-switch test, and **no test pins `restaurantId` into either cache key**, so the exact regression this scenario fears would pass CI silently. Tracked as M12.                                                                                                                                                                                                                                                                                                                                                      |

Structural note: there is no row-level security. Tenant isolation is 100% application-level. The prioritised IDOR sweep across menu, orders, payments, tables, reservations, loyalty, print and staff found no unguarded by-ID access — but the dominant pattern is fetch-then-verify, which is per-call-site and unenforceable by the type system.

### Scenario 10 — Secrets in the repository

| Step | Claim                                                | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Scan for hardcoded keys; verify `.env` is gitignored | **MOSTLY FALSE.** No live secret exists in the working tree or in tracked git history. Every regex match resolved to a placeholder or a `process.env` read. `.gitignore` correctly covers `.env` at every depth — verified with `git check-ignore -v` against the real files on disk.                                                                                                                                                                 |
| 2    | Rotate every key ever committed                      | **ALREADY DONE.** Exactly one real credential was ever committed: the Neon password leaked in the initial commit and purged on 2026-06-13 (`46333158`). The current production password was confirmed **never** committed. The dead value remains in history deliberately, which is the correct call once something has been publicly exposed. The `borica-test.key` fixture is BORICA's published sandbox keypair, expired 2023 — not a live secret. |
| 3    | Install a pre-commit hook that blocks secrets        | **TRUE.** This is the one step in the entire document that is fully correct and fully unaddressed. No husky, no gitleaks, no secretlint, no `.pre-commit-config.yaml`; `.git/hooks` contains only graphify hooks; CI has no secret-scanning step. GitHub secret scanning **and** push protection are enabled with zero open alerts, which is a good backstop but not a substitute. Tracked as H6.                                                     |

Additional finding not in the document: `.release-worktrees/`, `.codex/` and `.opencode/` are untracked **and not gitignored**, so a `git add -A` from root would stage entire nested worktrees. Tracked as H6.

### Scenario 11 — Email deliverability

| Step | Claim                                                                                 | Verdict                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | SPF and DKIM on the sending domain                                                    | **FALSE — already correct.** DKIM present at `resend._domainkey.renova.craftedminds.shop`; SPF `v=spf1 include:amazonses.com ~all` and bounce MX `feedback-smtp.eu-west-1.amazonses.com` on the `send.` subdomain. This is Resend's standard configuration, done properly.                                                                                                                                |
| 2    | Separate transactional and marketing domains                                          | **N/A.** No marketing email is sent from this system.                                                                                                                                                                                                                                                                                                                                                     |
| 3    | Delivery monitoring — "delivered means it reached the mail server, not a human inbox" | **TRUE, and precisely right.** `NotificationDelivery` is a well-built durable outbox with leases, retries and an `outcomeUncertain` reconciliation flag — but it stops at `acceptedAt`. There is **no Resend webhook**, so nothing records delivered / bounced / complained. DMARC is `p=none` with **no `rua=`**, so no aggregate reports arrive either. Zero deliverability visibility. Tracked as M11. |

### Scenario 12 — Session management

| Step | Claim                                                       | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Sessions live forever because we used the framework default | **FALSE.** `auth.module.ts:28` sets `expiresIn: '1d'`; cookie `maxAge` matches; `ignoreExpiration: false`. Sessions are 24h absolute and non-sliding. **However**, the underlying instinct lands: TTL is undifferentiated — a shared floor tablet holds the same 24h token as an owner's laptop — and the device-enrolment credential behind it **never expires at all** (`expiresAt` is absent from both the `pinLogin` predicate and `jwt.strategy`). Tracked as M13.                                                              |
| 2    | Concurrent session limits                                   | **PARTLY TRUE.** False for the staff PIN path, which is the one you would expect to be broken: `STAFF_DEVICE_LIMIT = 3`, enforced inside a transaction with `SELECT … FOR UPDATE`, with device bindings, an audit table, a dashboard listing and per-device revocation. True for dashboard/browser sessions: JWT is fully stateless, no session table, no listing, no "sign out everywhere". Tracked as M13.                                                                                                                         |
| 3    | Instant revocation on password change                       | **PARTLY TRUE — the mechanism exists and mostly works.** `jwt.strategy.ts:118-124` rejects any token whose `iat` predates `user.passwordChangedAt`, mirrored in the optional strategy. Nine of eleven flows also evict live sockets. **Two holes:** self password-change and super-admin password reset bump `passwordChangedAt` but never call `evictUser`, and the socket handshake never checks `passwordChangedAt` at all — so a live WebSocket keeps receiving order and payment events after a password change. Tracked as M2. |

### Scenario 13 — API surface

| Step | Claim                                               | Verdict                                                                                                                                                                                                                                                                                                                  |
| ---- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Audit endpoints; strip what the client doesn't need | **PARTLY TRUE.** A deliberate sanitisation layer exists (`RESTAURANT_PRIVATE_FIELDS` strips Stripe IDs and encrypted merchant secrets; provider checkouts return hand-written whitelists). But four real over-exposures were confirmed: C1, H1, H3, H4 below.                                                            |
| 1b   | "Sequential IDs let them enumerate every user"      | **FALSE as written — but it pointed at something real.** `grep autoincrement schema.prisma` returns zero hits; all 50 models use cuid/uuid. There is no integer to increment. **However**, the guessable key is `RestaurantTable.name`, and it anchors the worst finding in this audit (C1).                             |
| 1c   | Missing auth on endpoints                           | **FALSE.** All 239 route handlers audited. Every non-public route is guarded, and a metadata-reflection test pins super-admin guard coverage. Every unguarded route substitutes a credential or provider signature — with one exception, `POST /feedback` (M3).                                                          |
| 2    | API as a product / engineering-maturity signal      | Judgement, not a testable claim.                                                                                                                                                                                                                                                                                         |
| 3    | Versioning from day one                             | **FALSE — already done, properly.** `main.ts:305-308` uses real NestJS `VersioningType.URI` with `defaultVersion: '1'`, not a cosmetic path segment; one route uses `@Version(VERSION_NEUTRAL)`, proving the layer is live. Adding v2 is possible but `/v1` is hardcoded in four places that would each need a v2 entry. |
| 3b   | Public API documentation page                       | **PARTLY TRUE.** Swagger exists but is deliberately mounted only outside production, with an in-code comment explaining that exposing it accelerates endpoint probing. The document's implied "publish it" would reverse a correct security decision. No API changelog exists. Tracked as L2/L3.                         |

### The "13 layers" question

| #   | Layer                         | State                                                                                                                                                                     |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Frontend foundations          | Solid — React 18, Vite, error boundaries, PWA, i18n across 12 locales                                                                                                     |
| 2   | APIs / backend logic          | Solid — 239 routes, real URI versioning, DTO validation with `forbidNonWhitelisted`                                                                                       |
| 3   | Database and storage          | Solid schema; **gaps:** no RLS, R2 not tenant-namespaced, 6h recovery window                                                                                              |
| 4   | Auth and permissions          | Strong perimeter; **gaps:** no ABAC, no password lockout, no session table                                                                                                |
| 5   | Hosting and deployment        | Good — canary deploy with `--no-traffic`, smoke test, then traffic shift                                                                                                  |
| 6   | Cloud and compute             | **Gap** — `maxScale=3`, concurrency 80, 300s timeout, no readiness probe                                                                                                  |
| 7   | CI/CD and version control     | **Strongest layer.** Branch ruleset + comprehensive CI                                                                                                                    |
| 8   | Security / row-level security | App-level only, no RLS; strong CSRF, CSP, helmet, cookie discipline                                                                                                       |
| 9   | Rate limiting                 | Present but **mis-keyed** (H2); no edge layer (H8)                                                                                                                        |
| 10  | Caching and CDN               | Correct and tenant-scoped; deliberately `no-store` on authenticated responses                                                                                             |
| 11  | Load balancing and scaling    | **Weakest layer** — no LB, `maxScale=3`, no autoscaling headroom                                                                                                          |
| 12  | Error tracking and logs       | Strong — Sentry both ends, structured logs, dual pipeline; missing release/scrub/user context                                                                             |
| 13  | Availability and recovery     | **Remediated:** verified GCS backups, database loss guards, readiness probe + corrected alert; isolated staging is implemented and intentionally dormant until pre-launch |

We have all 13 layers. Layers 11 and 13 are the ones that would fail an inspection.

---

## Part 2 — What the document missed

These were found during verification and appear nowhere in the advisory. This is the part that matters most.

### C1 — CRITICAL — Any stranger can take over a table's bill and payment session

**Confirmed by direct code read, not inference.**

Attack chain, all steps unauthenticated:

1. `GET /api/v1/menu/public/resolve/:slug` returns `restaurantId` — public by design.
2. `POST /api/v1/orders` with `{restaurantId, tableId: "5", …}`. `orders.service.ts:583-590` resolves the table by **name**, not by cuid — table names are short and sequential in practice.
3. `orders.service.ts:1065-1081` joins the **existing OPEN session** for that table — the one created by whoever is currently sitting there — and `:1360` returns `sessionToken` in the response body.
4. That token is a bearer credential for **9 routes** (`payment.controller.ts:72-188`): `session/bill`, `session/intent`, `session/checkout`, `session/cash-request`, `session/abandon`, `session/reconcile-pending` and others.
5. `GET /payments/session/bill` then returns, for every order on that session, `customerName`, `customerPhone` (`payment-session.service.ts:477`), the full itemised bill, and `staffName` which **falls back to the staff member's email address** when no name is set (`:478`, selected at `:347`).

So: read every co-diner's name and phone number, read their bill, and interfere with their payment — cancel their in-flight checkout, trigger a cash request, or start a checkout on their tab. `POST /orders` is also CSRF-exempt and carries **no route-level `@Throttle`**, falling back to the global bucket.

The codebase already solves this correctly elsewhere: service points require a random `publicToken`, and `payment-session.service.ts:247-259` carries an explicit comment refusing to reuse an OPEN session by `tableId` _for exactly this reason_. Physical tables were left on the get-or-create path.

### H1 — HIGH — `pinHash` is sent to the browser on every `/auth/me`

`jwt.strategy.ts:175-177` destructures away only `password`, `staffRestaurant` and `lastLoginDeviceTokenId`, spreading the rest. So `pinHash`, `pinAttempts`, `pinLockedUntil`, `googleId`, `disabledReason` and `passwordChangedAt` all ship to the client.

`pinHash` is bcrypt over a **4-digit numeric PIN** (`users.service.ts:33`, `crypto.randomInt(0, 10000)`) — a 10,000-candidate keyspace, brute-forced offline in seconds. Combined with an enrolled device, a cracked PIN mints a WAITER or KITCHEN JWT. This converts any XSS, any stolen staff-tablet storage, or any logged response body into a credential compromise.

### H3 — HIGH (commercial) — Food cost is public

`schema.prisma:402` defines `MenuItem.costPrice Float? @default(0)`. All three public menu queries use `include: { options: true }` on the full row with no `select` (`menu-crud.service.ts:394-404`, `:608-612`, `:651-661`). `costPrice` is consumed only by owner analytics — nothing strips it on the way out.

Any diner or competitor can `curl` the public menu endpoint and read every dish's cost basis, then compute every margin. `isActive`, `deletedAt`, `tier` and the computed `features[]` array also ship, exposing each tenant's subscription plan.

### H2 — HIGH — Rate limiting is not per-client

`ThrottlerGuard` uses the library default tracker, which returns bare `req.ip`. `trust proxy` is never set (`main.ts:112` is a plain `NestFactory.create`), and no custom `getTracker` exists. Browser HTTP reaches Cloud Run through Vercel's rewrite, so the socket peer is infrastructure, not the user.

The consequence is that the 5-per-minute login limit and the global 100-per-minute limit behave as **platform-wide buckets** rather than per-attacker ones — which is both a broken control and a trivial denial-of-service against everyone else's login. The same defect makes `StaffPinLoginAudit.ipAddress` and consent-record IPs record the proxy, so the one forensic trail we keep is unusable.

There were zero 429s in 30 days of production logs, consistent with very low traffic but not proof either way. Confirm empirically before sizing — the fix is correct regardless.

### H8 — HIGH — The backend is reachable around the edge

Cloud Run has `ingress: all` and IAM `allUsers → roles/run.invoker`. The origin URL is not merely discoverable; it is published in `vercel.json` rewrites and in the CSP `connect-src` and `wss:` directives. Any protection placed on Vercel is optional from an attacker's point of view. WebSocket traffic bypasses Vercel unconditionally (`SocketContext.tsx:56`).

This is the document's Scenario 4, correctly translated.

**Status: deferred to PD-1/PD-2.** Every remedy requires a custom domain we do not have yet. Accepted risk in the interim; the compensating controls are the application-level throttling fixed in P1-1 and the fact that the origin is not currently under attack (zero 429s and no anomalous traffic in 30 days of logs). Re-rank to P0 the moment the domain lands.

### H5 — HIGH — Backups are silently broken

`apps/backend/backups/` — last non-empty file is dated **2026-08-15**, seven days stale. Two **zero-byte** files sit at 2026-08-08 and 2026-08-09: the job ran, produced nothing, and nothing noticed. The Windows scheduled task is not registered. Backups are local-only on a development laptop with no offsite copy.

Neon `history_retention_seconds: 21600` — a **6-hour** point-in-time recovery window. Neon's `production` branch has `protected: false`, and the project has `allowed_ips: []` with `block_public_connections: false`, so the database accepts connections from the entire internet given credentials.

Combined: a bad write discovered more than six hours later is unrecoverable.

### H7 — HIGH — No request deadline anywhere

Worst-case single-request wall time, capped only by Cloud Run's 300s:

- Stripe: no `timeout`, no `maxNetworkRetries` passed (`stripe.provider.ts:16-21`) → SDK defaults of 80s × 3 attempts ≈ **240s**
- Cloudflare R2: no `requestHandler` on the `S3Client` (`storage.service.ts:60-67`) → smithy's `DEFAULT_REQUEST_TIMEOUT = 0`, i.e. **unbounded**
- Twilio Verify and Resend OTP on the interactive login path: bare `fetch()` with no signal (`auth.service.ts:268`, `:296`, `:485`) → undici default **300s**
- DeepL honours `Retry-After` with no cap (`deepl.provider.ts:143-145`) — a `Retry-After: 3600` sleeps the worker for an hour

`deploy.ps1` sets no `--concurrency`, `--max-instances` or `--timeout`, so all three inherit whatever is on the service: 80, 3 and 300s. That is ~240 request slots, each holdable for five minutes. `/health` is `@SkipThrottle()` and returns `{status:'ok'}` unconditionally, so an instance with all 80 slots wedged still reports healthy and is never recycled.

---

## Part 3 — Remediation plan

Task IDs are stable; tick them off in place.

### P0 — Before anything else

**Status as of 22 Aug 2026: all P0 code shipped** on branch `fix/p0-security-audit-22082026` (6 commits, 2448 backend + 687 frontend tests green, both apps lint-clean).

- **P0-1 — superseded by P0-2.** Once the table token gates session access, holding that token _is_ the proof of being at the table, so returning the shared session token to a token-bearing caller is the intended shared-bill behaviour — the same trust model service points already use. Withholding it would have broken bill access for the second diner at a table without closing anything P0-2 does not already close.
- **P0-2 — done.** Backend enforcement, QR generation, customer-side plumbing and the backfill script. **The backfill has NOT been run yet: it must not outrun the deploy**, or existing QR links break before the frontend can emit `?t=`.
- **P0-3, P0-4, P0-5, P0-6 — done.**
- **P0-7 — partially done.** The silent-failure defect is fixed and verified, and a fresh verified backup closed the 7-day gap. Still outstanding and needing your involvement: registering the scheduled task (needs admin), an offsite copy (infrastructure decision), and a restore drill.

| ID   | Task                                                                                                                                                                                                     | Files                                                                        | Effort | Done when                                                                                 |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| P0-1 | Stop `POST /orders` returning a foreign `sessionToken`. Only echo it when the caller supplied a matching token; otherwise issue a per-order credential (the `orderTrackToken` mechanism already exists). | `orders/orders.service.ts:1360`                                              | M      | A request that guesses a table name receives no session token; regression test asserts it |
| P0-2 | Require `publicToken` for physical tables, mirroring service points, so a table _name_ can never mint a session. Rotation endpoint already exists at `tables.controller.ts:137`.                         | `orders/orders.service.ts:583-590`, `assistance/assistance.service.ts:85-91` | M      | Table-name lookup no longer creates or joins a session                                    |
| P0-3 | Remove `customerPhone` from the bill response; drop `email` from the staff select and fall back to a role label.                                                                                         | `payment/session/payment-session.service.ts:347`, `:477-479`                 | S      | Bill response contains no phone number and no email; test pins it                         |
| P0-4 | Replace the `/auth/me` destructure with an explicit allowlist (`id, email, name, role, restaurantId, onboardingComplete, onboardingStep, isActive, isImpersonation`).                                    | `auth/jwt.strategy.ts:175-177`                                               | S      | Response contains no `pinHash`; test asserts absence                                      |
| P0-5 | Replace `include` with explicit `select` in all three public menu queries; strip `costPrice`, `isActive`, `deletedAt`, `tier`.                                                                           | `menu/menu-crud.service.ts:394-404`, `:608-612`, `:651-661`                  | S      | Public menu payload has no `costPrice`; test asserts absence                              |
| P0-6 | Add route-level `@Throttle` to `POST /orders` and `POST /payments/session`.                                                                                                                              | `orders/orders.controller.ts:36`, `payment/payment.controller.ts:39`         | S      | Both routes rate-limited independently of the global bucket                               |
| P0-7 | Repair backups: register the scheduled task, fail loudly on a zero-byte artefact, add offsite copy, verify a restore actually works.                                                                     | `apps/backend/scripts/`                                                      | M      | A restore has been performed from a fresh backup and the result verified                  |

#### P0-2 migration decision (agreed 22 Aug 2026)

**Shape.** Enforcement is conditional on the table _having_ a `publicToken` — the same rule service points already follow. A table with a token requires it; a table without one keeps legacy name-based behaviour.

**Why the window is zero-length in practice.** All 67 tables are backfilled in one pass, and table creation is changed to always issue a token, so no legacy table exists after the cutover and the legacy branch is unreachable from day one. It is retained only as a safety net for rows that somehow predate the backfill.

**Grace rule.** Rather than recording "created under legacy rules" on each session — a schema column and a branch that would outlive the migration — the same guarantee is enforced at cutover time: the backfill refuses to run while any session is OPEN. That is "reprint between seatings" as an operational precondition instead of permanent schema weight. At the time of this decision the database reported 0 open sessions and no live tenants, so the cutover is genuinely zero-impact.

**Sunset date: 21 September 2026.** On that date the legacy name-based lookup is deleted outright, along with this note. If any table still lacks a `publicToken` then, it is issued one rather than the deadline being extended. The point of writing the date down is that two code paths do not become permanent.

**Residual risk in any future migration window.** If a real tenant is ever mid-migration with legacy tables, sessions on those tables stay joinable by table name for the duration of that meal. That is bounded by the seating rather than open-ended, and does not apply to the current cutover because nothing is live.

### P1 — This week

**Status as of 23 Aug 2026: all P1 code shipped.** P1-1 through P1-7, P1-9,
P1-10 and P1-13 landed with the P0 batch (merged as PR #39 and deployed).
P1-8, P1-12 and P1-14 follow on `fix/p1-security-remainder`. Backend 2576 /
frontend 688 tests green, both apps lint-clean.

- **P1-11 — not implemented, deliberately.** The Neon IP-allowlist half would
  have taken production down: there is no VPC connector and no Cloud NAT on the
  Cloud Run service (Compute API disabled), so egress has no static IP to
  allowlist. Verified against the live project, not assumed. The branch-protection
  half is unverified — Neon's MCP does not expose it, and protected branches
  appear to be a paid-tier feature.
- **P1-12 — done.** `POST /feedback` now resolves the order _through_ the table
  session named by `x-table-session-token`; an order id alone is worthless.
  Authorization deliberately runs before the duplicate check so the endpoint
  cannot be used to probe "has order X been reviewed?" across tenants.
- **P1-14 — done.** Revocation rules extracted to
  `auth/session-revocation.service.ts` and called by both `jwt.strategy` and
  `EventsGateway.handleConnection`. A cookie issued before a password reset, or
  belonging to a revoked staff device, no longer opens a socket.
- **P1-8 — done, two layers.** A dependency-free staged-diff scanner in the
  pre-commit hook (installed by `postinstall`) plus pinned, checksum-verified
  gitleaks as the first CI step. Calibrated against the current tree: 151 raw
  findings triaged to zero, each exemption carrying the reason it cannot be a
  credential. No live secret was found.

| ID    | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Files                                                                      | Effort                     | Done when                                                        |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------- |
| P1-1  | Confirm the `req.ip` behaviour empirically, then set `app.set('trust proxy', …)` for the Vercel→Cloud Run hop count and add a `getTracker` keyed on `userId ?? XFF client`.                                                                                                                                                                                                                                                                                                                                                                                                             | `main.ts:112`, `app.module.ts:110-113`                                     | S                          | Two clients from different IPs get independent buckets, verified |
| P1-2  | Add per-account failed-password lockout mirroring the existing PIN model.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `auth/auth.service.ts`, `schema.prisma` User                               | S                          | N failures locks the account with backoff; test covers it        |
| P1-3  | Add `AbortSignal.timeout(10_000)` to the three bare auth fetches.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `auth/auth.service.ts:268`, `:296`, `:485`                                 | S                          | OTP failure surfaces in ≤10s, not 300s                           |
| P1-4  | Pass `timeout: 15_000, maxNetworkRetries: 1` to both Stripe clients.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `payment/stripe.provider.ts:16`, `subscription/subscription.service.ts:99` | S                          | Stripe worst case ≤30s                                           |
| P1-5  | Give `S3Client` a `NodeHttpHandler` with `connectionTimeout: 3_000, requestTimeout: 20_000`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `storage/storage.service.ts:60`                                            | S                          | R2 upload is bounded                                             |
| P1-6  | Cap DeepL `Retry-After` at 30s.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `translation/providers/deepl.provider.ts:143-145`                          | S                          | No unbounded worker sleep                                        |
| P1-7  | Pin `--concurrency`, `--max-instances`, `--timeout=30` in the deploy script; set `keepAliveTimeout`/`headersTimeout` after listen.                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `deploy.ps1:293-303`, `main.ts:341`                                        | S                          | Values are explicit in source, not inherited                     |
| P1-8  | Add gitleaks as a pre-commit hook **and** a CI job.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `.husky/`, `.github/workflows/ci.yml`                                      | S                          | A staged fake key is blocked locally and in CI                   |
| P1-9  | Add `.release-worktrees/`, `.codex/`, `.opencode/` to `.gitignore`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `.gitignore`                                                               | S                          | `git status` is clean at root                                    |
| P1-11 | **Split — see note.** Mark the Neon `production` branch protected (free, safe, do now). IP allowlisting is **deferred**: verified 22 Aug that Cloud Run has no VPC connector and no Cloud NAT (Compute API is not even enabled), so it egresses from Google's dynamic pool and has no stable address to allowlist. Applying an allowlist as originally written would take production down. Doing it properly needs either a VPC connector + Cloud NAT with a reserved IP, or Neon Private Networking — both paid, and both belong with PD-1 and the Neon plan upgrade rather than here. | Neon settings                                                              | S (branch) / L (allowlist) | Branch shows protected; allowlist tracked with PD-1              |
| P1-12 | Require ownership proof on `POST /feedback` — the `@TableSessionToken` decorator is already imported in that controller.                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `feedback/feedback.service.ts:371-405`                                     | S                          | An arbitrary `orderId` is rejected                               |
| P1-13 | Add the two missing `evictUser` calls on password change and admin password reset.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `auth/auth.service.ts:983`, `super-admin/super-admin.service.ts:582`       | S                          | Sockets drop on password change                                  |
| P1-14 | Re-check `passwordChangedAt`, `isActive` and device revocation in the socket handshake — extract a shared `resolveJwtIdentity` used by both the HTTP strategy and the gateway so they cannot drift again.                                                                                                                                                                                                                                                                                                                                                                               | `events/events.gateway.ts:158`, `auth/jwt.strategy.ts`                     | M                          | A revoked session cannot hold a socket                           |

### PD — Blocked on a custom domain

Deliberately parked. The application currently runs on `qr-digital-menu-ivory.vercel.app` and `qr-menu-backend-*.run.app`; none of the work below is possible on those hostnames because we do not control the `vercel.app` or `run.app` DNS zones. Revisit as a batch when the domain is acquired.

Note: DNS for `craftedminds.shop` already runs on Cloudflare nameservers (`neil.ns.cloudflare.com`, `melany.ns.cloudflare.com`), so no nameserver migration is needed when this unblocks — the zone exists.

| ID   | Task                                                                                                                                                                                      | Effort | Notes                                                                                                                                                                                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PD-1 | Restrict Cloud Run ingress to `internal-and-cloud-load-balancing` behind a Google HTTPS load balancer with a serverless NEG, and repoint the Vercel rewrite at the LB. Closes H8.         | L      | Needs a domain for a managed certificate. This supersedes the earlier "restrict ingress" framing.                                                                                                                                                           |
| PD-2 | Cloud Armor policy on that load balancer: per-IP rate limiting on auth routes, preconfigured OWASP rulesets, bot management.                                                              | M      | This — not Cloudflare — is the correct answer to the advisory's Scenario 1, because it sits at the real origin and therefore also closes the bypass. Cloudflare in front of Vercel would not cover WebSocket traffic, which connects to Cloud Run directly. |
| PD-3 | Attach a custom domain to the R2 bucket, replacing the `pub-*.r2.dev` public development URL in `R2_PUBLIC_URL`.                                                                          | S      | Cloudflare documents `r2.dev` as rate-limited and development-only; a custom domain is required for CDN caching, cache rules, WAF and bot management on images. Free, uses the existing zone, no code change beyond the env var.                            |
| PD-4 | Vercel Firewall custom rules on the frontend hostname; keep the Cloudflare record grey-cloud (DNS-only) to avoid double-CDN and to stop Vercel's own firewall seeing only Cloudflare IPs. | S      |                                                                                                                                                                                                                                                             |

### Concurrency hardening — PIN lockout reset (resolved in PR #43)

`pinLogin` now inspects the guarded reset count. On `{ count: 0 }` it re-reads
the device row and rejects a renewed future lock before bcrypt or counter
mutation. The regression test simulates the lost update race and pins both the
429 response and the absence of bcrypt/database mutation.

### P2-10 — Implementation COMPLETE, manual verification DEFERRED PRE-LAUNCH

**Implementation: COMPLETE** (`be0da3a6`, on top of `8b25d51e`, `20c3f399`,
`a9059282`, `60c227d4`).

**Evidence:** backend 191 suites / 2704 tests and frontend 141 files / 996 tests
green; both apps lint clean; zero type errors; i18n parity across en/bg/ro.

**Enforcement dependency: satisfied in code**, ahead of the persisted deadlines.
Nothing is quarantinable until each token's own `stalenessEnforcedAt` passes,
and no device loses trust before its own `deviceTrustExpiresAt` — both written
by migration rather than derived from any date in application logic. This is no
longer an active code blocker.

**Deployment: COMPLETE. Manual product verification: DEFERRED PRE-LAUNCH.** The
code is serving, but the owner deliberately deferred these checks while there
are no real tenants or service-critical printers. Run them before the first
real tenant:

- [ ] Stale token presentation and countdown
- [ ] Quarantined-token reactivation
- [ ] Already-reactivated 409 behaviour (refetches, shows no error)
- [ ] Device trust states: 30-day warning, 7-day urgent, expired, and NULL
- [ ] Redis-backed production startup (and that boot fails without `REDIS_URL`)

Mark **production verified** only once those pass on the deployed environment.

### P2 — Development close-out

All current P2 engineering lanes are complete. P2-4 is parked until a custom
domain and real outbound email exist. P2-8 activation and P2-10 manual checks
are explicit pre-launch gates, not active development blockers. Do not reopen
completed P2 work unless a regression or new evidence appears; proceed to P3-1.

| ID    | Task                                                                                                                                                                                              | Effort |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| P2-1  | **COMPLETE in PR #47:** fatal rejection handling, non-HTTP filter guard, awaited critical promises, and `no-floating-promises` as an error                                                        | M      |
| P2-2  | **COMPLETE in PR #51:** every scheduled job is Sentry-monitored and a coverage test rejects an unwrapped cron                                                                                     | M      |
| P2-3  | **COMPLETE in PRs #46/#50:** release SHA, structural Sentry scrubbing, user context, and request ID tags                                                                                          | S      |
| P2-4  | **DEFERRED PRE-LAUNCH:** add the Resend delivery webhook and DMARC reporting/enforcement when a custom domain and real outbound email exist                                                       | M      |
| P2-5  | **COMPLETE in PRs #41/#44/#55:** readiness/liveness split, uptime monitoring, and corrected readiness-failure alert semantics                                                                     | M      |
| P2-6  | **COMPLETE in PR #43:** tenant R2 namespace, owner-scoped deletion, and explicit hard-purge capability                                                                                            | M      |
| P2-7  | **COMPLETE in PR #49:** tenant cache regressions, logout cache clearing, and browser account-switch coverage                                                                                      | S–M    |
| P2-8  | **IMPLEMENTATION COMPLETE in PR #54; ACTIVATION DEFERRED PRE-LAUNCH:** isolated Supabase/Cloud Run/Stripe staging and exact-SHA release proof; development bypass is explicit, staging is default | M      |
| P2-9  | **COMPLETE:** forward-only migration/recovery policy, required expand/backfill/contract evidence, and failed-migration decision path; destructive down scripts deliberately rejected              | S      |
| P2-10 | **CODE + DEPLOY COMPLETE in PR #43; MANUAL CHECKS DEFERRED PRE-LAUNCH:** inactivity retirement, reactivation, device trust, and 12-hour PIN JWT                                                   | M      |
| P2-11 | **COMPLETE in PR #43:** PIN dashboard signals and alerts with cross-instance database dedupe                                                                                                      | S      |
| P2-12 | **COMPLETE in PR #43/current code:** owner-visible errors are static and `ErrorBoundary` exposes raw messages only in development                                                                 | S      |
| P2-13 | **COMPLETE in PR #48 and deployed:** bounded per-provider HTTP pools plus observable 500 ms Redis-throttling fallback                                                                             | M      |
| P2-14 | **COMPLETE in PR #52:** stale architecture claims corrected in both agent guidance files                                                                                                          | S      |

### P3 — Strategic

| ID    | Task                                                                                                                                                                                                                                                                        | Effort |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| P3-1  | **MERGED/DEPLOYED (PR #57, `e7500785`); MANUAL VERIFICATION PENDING:** durable sessions, session inventory, per-session/global revocation; [rollout evidence](ops/db-safety/P3_SESSION_ROLLOUT.md)                                                                          | M      |
| P3-2  | **MERGED (PR #58, `f4ec9a61`); BATCH DEPLOY PENDING:** shared HTTP budget, cancellation, retry-budget accounting and detached background work; [contract and verification](ops/runtime/REQUEST_BUDGETS.md)                                                                  | M      |
| P3-3  | **MERGED/COMPLETE (PR #63, `32fdc9e6`), GREEN POST-MERGE CI:** 132 guarded; 113 separate contracts; zero temporary entries. Batch release pending; [evidence](ops/security/RESTAURANT_ACCESS.md)                                                                            | M      |
| P3-4  | **PARTIAL; first slice in review:** compound tenant/member predicates for orders, assistance and feedback; RLS evaluated, not enabled. Menu/tenant-management and payment/session scoping plus close-out remain; [scope and evidence](ops/security/TENANT_QUERY_SCOPING.md) | M–L    |
| P3-5  | Reusable circuit-breaker utility extracted from the DeepL implementation, applied to Stripe and R2                                                                                                                                                                          | M–L    |
| P3-6  | Step-up re-authentication on dangerous super-admin actions, payout changes, PIN reset, device enrolment                                                                                                                                                                     | M      |
| P3-7  | Time-of-day restriction on PIN login — restaurant IANA timezone and Luxon are already in place                                                                                                                                                                              | S      |
| P3-8  | Raise PR approvals to 1, or adopt a self-review checklist gate                                                                                                                                                                                                              | S      |
| P3-9  | Enable Dependabot security updates; add `npm audit` to CI                                                                                                                                                                                                                   | S      |
| P3-10 | API changelog and a published OpenAPI artefact on the Docusaurus site — **not** live Swagger in production                                                                                                                                                                  | S–M    |

---

## Answering the question directly

**Are we good?** For the current development phase, yes: P0, P1, and all active
P2 engineering work are closed. The remaining P2 entries are explicit
pre-launch operations: email/DMARC when a real domain is used, staging
activation before real traffic, and the five credential-retirement product
checks. That completed work should not be reopened without a regression or new
evidence.

**What remains structurally?** Edge protection still depends on the custom
domain work in PD-1/PD-2. P3-1 durable session inventory and per-session/global
revocation are merged/deployed; manual product checks remain pending. P3-2
cross-call request budgets are merged, awaiting the deliberately batched deployment;
they are cooperative HTTP/provider cancellation, not database rollback or a
CPU execution limit. P3-3 is merged/complete through PR #63 with green post-merge
CI; the management inventory is empty. The batch release remains pending.
Public/account/admin/token routes are not unfinished tenant migrations.
P3-4 is partial (orders/assistance/feedback query scoping in review); its remaining
management/payment work and P3-5 through P3-10 remain open. The original H2, H5, and
bounded-dependency portions of H7 have been remediated.

**Is that the whole picture?** No — and this is the important part. The most serious defect in the system, C1, appears nowhere in the advisory. A generic checklist found the categories but missed the actual hole, because the actual hole required reading how `POST /orders` resolves a table. Treat the document as a prompt for inspection, not as the inspection.
