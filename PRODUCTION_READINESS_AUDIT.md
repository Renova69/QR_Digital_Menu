# Production Readiness Audit

## 1. Executive verdict

- **Verdict:** NOT READY
- **Audit date:** 2026-08-02 (Europe/Sofia)
- **Reviewed commit:** `8671e0c830efbe756491e52a2c5064e6459f3d5f` on `main`, plus the disclosed pre-existing working-tree changes
- **Pre-existing working tree:** modified root `package.json` (adds a Prisma `postinstall`) and untracked `.claude-flow/`, `.claude/.proven-config-version`, `.claude/proven-config.json`, and `PRE-PROD_VERIFICATION.md`. The controlled remediation preserved those user-owned changes and did not deploy anything.
- **Overall confidence:** High for repository, automated-test, database-migration, and static configuration findings; medium for live-provider and cloud-operation behavior because production credentials and a production-like deployed environment were not used.
- **Finding register:** 0 Critical, 5 High, 15 Medium, 2 Low, and 2 Informational. PRD-001 and PRD-003 are mitigated in the current working tree but remain open pending coordinated staging/provider/hardware proof; PRD-002, PRD-004, and PRD-005 remain unmitigated High blockers.
- **Main reasons:** Socket.IO can still silently fall back to per-instance memory; the refreshed installed production dependency tree still contains 15 High advisories; and backup/restore/rollback readiness is not demonstrated. Durable print, scheduled-reminder delivery, public order idempotency, and the local verification gates are materially repaired, but coordinated production-shaped staging remains mandatory before closing those findings.
- **Release recommendation:** stop production launch work, fix P0 items in the dependency order in section 20, deploy to a production-shaped staging environment with at least two backend instances and Redis, and rerun the entire verification document. Do not waive failed gates individually without a written, time-bounded risk acceptance.

### 1.1 Controlled remediation slice status (2026-08-02)

This addendum supersedes the original gate results in section 5 for the current working tree. It covers only duplicate printing, scheduled notification delivery, public-order idempotency, and restoration of the five named verification gates. No Redis topology change, dependency upgrade, backup/rollback work, or deployment was performed.

| Finding / gate | Current status | Revalidated evidence and closure condition |
| --- | --- | --- |
| PRD-001 duplicate printing | **MITIGATED IN WORKING TREE — NOT RESOLVED** | PostgreSQL now enforces one active job identity per order/station, workers acquire tokenized leases atomically, acknowledgements must match the claim token, and the agent persists `STARTED`/`COMPLETED` fingerprints before/after physical output. Real PostgreSQL two-worker competition and agent replay/restart tests pass. Close only after coordinated backend+agent staging with real hardware proves duplicate suppression and operator handling of ambiguous `STARTED` jobs. |
| PRD-002 instance-local realtime | **OPEN / UNCHANGED HIGH** | Redis still fails open to in-memory Socket.IO state. This was explicitly outside the slice. |
| PRD-003 false notification success / duplicate reminders | **MITIGATED IN WORKING TREE — NOT RESOLVED** | Reservation and loyalty scheduled reminders now enqueue tenant-scoped durable deliveries; PostgreSQL `SKIP LOCKED` claims exclude competing workers; only explicit provider acceptance advances source `reminderSentAt`; retries, terminal failures, provider IDs, and an authenticated operator status endpoint are persisted. Real PostgreSQL two-worker tests pass. Immediate reservation lifecycle notifications still use the pre-existing direct transport and provider-sandbox/multi-instance staging remains required. |
| PRD-004 installed advisories | **OPEN / REVALIDATED HIGH** | `npm.cmd audit --omit=dev --json` now completed: 28 production-tree advisories (15 High, 12 Moderate, 1 Low, 0 Critical). No automatic or breaking upgrade was applied. |
| PRD-005 recovery/rollback | **OPEN / UNCHANGED HIGH** | No new off-host backup, restore drill, RPO/RTO, immutable rollback, or cloud evidence was created. This remains an infrastructure/release requirement. |
| PRD-006 backend lint | **REPAIRED / GATE PASS** | Six pre-existing warnings were corrected without changing the rule set or `--max-warnings 1133`; the full command exits 0 at exactly 1,133 warnings. Existing debt remains and the ceiling must not increase. |
| PRD-007 canonical build | **REPAIRED / GATE PASS** | Prisma generation and the canonical root `npm.cmd run build` complete successfully. The earlier failure was a transient Windows engine-DLL lock, not an application compile defect; no failure was suppressed. |
| PRD-008 backend E2E | **REPAIRED / GATE PASS** | The stale gateway test double now supplies the current methods. All 6 suites / 31 tests pass, while explicit post-commit failure coverage remains in the real-PostgreSQL concurrency suite. |
| PRD-009 Playwright teardown | **ENVIRONMENT FINDING REFINED / GATE PASS OUTSIDE PROCESS SANDBOX** | The exact five-test suite passed and exited cleanly in 32 seconds through the unrestricted Windows runner. The sandboxed runner denied Playwright's process-tree termination after assertions passed. No broad kill or repository workaround was added. A final rerun request was blocked before execution by the approval service's usage limit; the earlier clean 5/5 result remains the valid evidence. Linux CI and a real full-stack journey remain required. |
| PRD-010 migration verifier | **REPAIRED / GATE PASS** | The verifier now compares exact migration bytes, detects missing/unfinished/rolled-back/checksum-mismatched rows, and exits non-zero on any blocker. Unit cases pass; intact fresh history exits 0; a deliberate mismatch exited 1 and was restored. |
| PRD-011 public order retry | **MITIGATED IN WORKING TREE — NOT RESOLVED** | Public/customer order creation requires a bounded idempotency key, scopes it by restaurant, hashes the semantic payload, returns the original order for identical replay, rejects collisions, and contains post-commit realtime errors. The frontend retains a stable tab-local key through retry/reload and clears it only after success. Real PostgreSQL concurrency, collision, tenant-isolation, and post-commit-failure cases pass. Close after coordinated frontend/backend staging and retention/operations sign-off. |

#### Selected architecture and enforceable invariants

- **Print:** existing PostgreSQL plus the existing Socket.IO agent channel, extended with a durable job identity, database lease/token, token-bound acknowledgement, and an on-device durable ledger. This is the smallest architecture already supported by the repository. Raw TCP printing cannot provide transactional exactly-once proof: after a crash with ledger state `STARTED`, the system deliberately refuses an automatic reprint and exposes an uncertain permanent state rather than risking a duplicate physical ticket.
- **Notifications:** a PostgreSQL `NotificationDelivery` queue with tenant-scoped deduplication, payload hashes, leases, attempts, retry schedule, provider acceptance IDs, terminal failure state, and a manager/owner query endpoint. Email retries use the stable delivery ID as the Resend idempotency key. SMS network-unknown outcomes are terminal because the configured create-message transports do not offer a repository-proven idempotent acceptance contract.
- **Orders:** reuse the existing database-backed order client identity under a restaurant-scoped submission key. Identical replay returns the stored order; a different payload under the same key is a conflict; different tenants remain independent. Post-commit realtime failure is logged but cannot turn an already committed order into an HTTP failure.
- **Migration integrity:** exact migration bytes are authoritative. Any missing, incomplete, rolled-back, or checksum-divergent row is a blocking non-zero verifier result.

#### Current verification evidence

| Exact command | Result |
| --- | --- |
| `npm.cmd run build` | PASS: canonical backend and frontend production build. |
| `npm.cmd test` | PASS: root Node checks, backend 153 suites / 2,068 tests, full frontend suite, printer agent 4 suites / 17 tests. |
| `npm.cmd run lint -w apps/backend` | PASS: 0 errors, exactly 1,133 warnings at the unchanged ceiling. |
| `npm.cmd run lint -w apps/frontend` | PASS: 0 errors, 448 warnings of 455 allowed. |
| `npm.cmd run lint -w apps/printer-agent` | PASS: 0 errors and 0 warnings. |
| `npm.cmd run typecheck -w apps/frontend`; `npm.cmd run typecheck -w apps/printer-agent` | PASS. Backend TypeScript compilation is included in the canonical build. |
| `npm.cmd run test:e2e -w apps/backend -- --runInBand --ci` with isolated PostgreSQL | PASS: 6 suites / 31 tests. |
| Focused `preproduction-concurrency.e2e-spec.ts` with isolated PostgreSQL | PASS: 19 tests, including public-order, print-worker, notification-worker, tenant, provider-acceptance, and restart/lease cases. |
| Fresh PostgreSQL 17 `prisma migrate deploy`, `prisma migrate status`, and read-only verifier | PASS: all 53 migrations applied from zero, schema current, verifier exit 0. |
| Deliberate migration checksum mismatch followed by restoration | PASS: verifier exited 1 for the mismatch and 0 after restoration. |
| `npm.cmd run test:browser` through unrestricted Windows process runner | PASS: 5/5 and clean exit in 32 seconds. The same assertions pass under the process sandbox, whose denial of child termination causes the hang. |
| `npm.cmd audit --omit=dev --json` | **FAIL / BLOCKER RETAINED:** 15 High, 12 Moderate, 1 Low, 0 Critical. |
| `graphify update .` | PASS: 1,041 files, 17,682 nodes, 22,817 edges; report and graph artifacts refreshed from the current working tree. |

#### Migrations and rollout dependencies

- `20260802120000_durable_delivery_semantics`: print deduplication identity, claim token/expiry, historical active-duplicate normalization, and uniqueness/claim indexes.
- `20260802121000_notification_delivery`: delivery channel/status enums, durable delivery table, tenant/source/deduplication uniqueness, lease/retry indexes, and restaurant foreign key.
- Backend and printer agent must be rolled out as one compatible print-protocol change; backend and frontend must be coordinated for required public idempotency keys. No rollout was performed.
- Before production: exercise both migrations against a sanitized production-shaped copy; run real-printer crash/reconnect cases; use Resend and SMS sandboxes; verify the operator failure endpoint; and prove two backend instances with Redis. PRD-002, PRD-004, and PRD-005 remain release blockers regardless of these local passes.

## 2. Release blockers

All five High findings remain in the register. PRD-001 and PRD-003 have tested working-tree mitigations but still block production until their coordinated staging closure conditions pass; PRD-002, PRD-004, and PRD-005 are open without mitigation:

1. **PRD-001 (mitigated, not resolved):** database leases/token acknowledgements and an agent ledger now prevent automatic duplicate printing; real-hardware rollout proof is still required.
2. **PRD-002:** Redis is optional at runtime, so multi-instance realtime events and room membership can silently become instance-local.
3. **PRD-003 (mitigated, not resolved):** scheduled reservation/loyalty delivery now has durable claims and acceptance state; provider-sandbox proof and the remaining direct lifecycle path are open.
4. **PRD-004:** the refreshed installed production dependency graph contains 15 High advisories, including packages used on upload/image/realtime/HTTP request paths.
5. **PRD-005:** there is no verified, monitored, off-host backup and restore process or executable application rollback procedure.

PRD-006 through PRD-010 are locally repaired and green under the conditions recorded in section 1.1. They remain part of the release gate and must pass again in CI/production-shaped staging; this does not waive the remaining High blockers.

## 3. Repository and architecture inventory

| Surface | Entry points and responsibilities | Main trust boundaries / dependencies |
| --- | --- | --- |
| NestJS backend | `apps/backend/src/main.ts`, `AppModule`, 37 controllers, 210 graph-indexed HTTP routes | Browser/customer input, staff JWTs, signed guest/payment tokens, Stripe/provider callbacks, PostgreSQL, Redis, R2/S3, Resend/SMS, DeepL, weather and push providers |
| React/Vite PWA | `apps/frontend/src/main.tsx`; dashboard, onboarding, POS, profile, staff, super-admin and legal pages; auth, cart, menu, payment, reservations, subscription, tables and shared UI components | Current same-origin HTTP `/api/v1` rewrite, cross-origin Socket.IO, browser storage, service worker, public QR/menu users and authenticated staff |
| Expo printer agent | `apps/printer-agent/App.tsx`, `src/services/socket.ts`, screens/store/services | Device enrollment token, Socket.IO `print:job`, local printer bridge and physical ticket output |
| PostgreSQL/Prisma | `apps/backend/prisma/schema.prisma`, 53 migrations | Tenant IDs, order/payment state, unique provider events, durable notification delivery, order idempotency and print-job lease/deduplication state |
| Deployment | `.github/workflows/ci.yml`, `deploy.ps1`, `vercel.json`, three Dockerfiles | Google Cloud Run, Vercel, registry tags, runtime secrets and external managed services |

Backend modules accounted for: adapters; assistance; auth; client-logs; common; consent; dashboard; events; feedback; health; help-content; loyalty; menu; menu-import; menu-views; orders; payment; platform-settings; print-station; prisma; push; reservations; restaurants; storage; subscription; super-admin; table-zones; tables; translation; users; and users-data. `AppController` plus the 36 feature controllers were included in the route/guard manifest review.

The primary data flow is browser or printer agent -> HTTPS/Socket.IO -> NestJS authorization/feature guards -> service ownership checks -> Prisma/PostgreSQL transaction -> post-commit realtime/provider side effects. Public QR menu, ordering, reservation, feedback and payment-session routes use public identifiers or purpose-specific signed tokens; staff and management routes use JWT plus tenant/feature checks. Payment callbacks cross a provider-signature boundary before idempotent event/state persistence. Uploads cross a MIME/size boundary before Sharp processing and R2 storage.

## 4. Audit coverage

### Fully inspected

- Repository topology, package scripts, CI workflow, deployment script, Vercel and Docker configuration, environment examples and current Git state.
- All backend modules and controller classes through the codebase graph plus a route-by-route controller manifest. Each discovered public route was classified, and every authenticated route was checked for an applicable authentication/role/feature guard and a tenant-ownership check at the controller or called service entry point.
- All 45 graph-indexed Socket.IO channels: `agent:rejected`, `assistanceStatusChanged`, `auth:evicted`, `bill:updated`, `billPayment:cleared`, `billPayment:pending`, `cashPaymentRequest:created`, `cashPaymentRequest:updated`, `connect`, `connect_error`, `disconnect`, `error`, all six `join*`, all six `leave*`, `menu:item-availability-changed`, `newAssistanceRequest`, `newOrder`, `orderStatusChanged`, `orderStatusesChanged`, `payment:confirmed`, `payment:reconciliationRequired`, `payment:refunded`, `print:ack`, `print:job`, `reconnect_attempt`, `reconnect_failed`, `reservation:created`, `reservation:updated`, `roomError`, the four `table:*` events, `translate:progress`, and `zone:changed`.
- Prisma schema, all 53 migrations on a clean PostgreSQL 17 database, key uniqueness/foreign-key/index invariants, and the repaired read-only pre-production verifier.
- Authentication/session policy, public-route token boundaries, upload path, order transaction/idempotency paths, scheduled jobs, Stripe and the provider abstraction/state transitions, Redis adapter, printer retry/ack flow, notification failure behavior, and production startup.
- Existing unit/integration/e2e test inventory, skipped/focused-test search, type checks, lint, coverage, builds, dependency audit and browser critical-journey suite.

### Partially inspected

- Every frontend feature area was inventoried and its routing/API/realtime boundary reviewed, but visual behavior across all locales, devices and offline/PWA upgrade states was not manually exercised.
- Stripe, Borica, ePay and myPOS code paths and state machines were reviewed statically; real provider sandbox callbacks, refund settlement and dashboard reconciliation were not executed.
- R2, DeepL, Resend, SMS, VAPID push and weather failure handling was reviewed statically; real provider quotas, latency, credentials and outage behavior were not exercised.
- All public and authenticated route entry points were checked systematically for controller guards and tenant ownership. This was not a formal proof of every internal branch after the checked service entry point; independent dynamic IDOR testing remains required.

### Not inspected

- Real Google Cloud Run, Vercel, Neon, Redis, R2, DNS/TLS, email/SMS, payment-provider or printer hardware configuration.
- Accessibility, penetration testing, load/soak testing, real browser/device matrix, disaster restore drill, payment-provider reconciliation against a live sandbox, and legal/compliance sign-off.
- Production data contents. The verifier ran only against an isolated empty database; no production or pre-production database was contacted.

### Blockers and limitations

- The browser suite still uses mocked `/api/v1/**` responses and is not proof of a running frontend/backend system. It exits cleanly through the unrestricted Windows runner; the app process sandbox denies its child-process teardown.
- The earlier Prisma engine-DLL lock cleared and the canonical build now passes; a clean CI/container build remains the stronger release proof.
- A production-only dependency refresh now completes and retains the blocker: 28 advisories, including 15 High.
- No deployment credentials or real provider secrets were used by design.
- `graphify-out/GRAPH_REPORT.md`, `graph.json`, and `manifest.json` were refreshed after the slice. The report records the current HEAD commit plus the current uncommitted working tree extracted on 2026-08-02.

## 5. Automated verification results

`ROOT` below means `F:\PROGRAMING\QR_Digital_Menu-main`; workspace commands were launched from `ROOT` unless a different working directory is shown.

| Exact command | Working directory | Exit / result | Important evidence, trustworthiness and what it does not prove |
| --- | --- | --- | --- |
| `npm.cmd run check:node` | `ROOT` | 0 / PASS | Trustworthy for the scripted version policy: Node `v24.18.0` passed. It does not prove npm parity; local npm `11.16.0` differs from pinned `10.2.4`. |
| `npm.cmd run guard:prisma-raw-void` | `ROOT` | 0 / PASS | Trustworthy for its searched raw-Prisma pattern; not a general SQL-injection proof. |
| `npm.cmd run typecheck -w apps/frontend` | `ROOT` | 0 / PASS | Proves current frontend TypeScript compilation only, not runtime API compatibility. |
| `npm.cmd run typecheck -w apps/printer-agent` | `ROOT` | 0 / PASS | Proves current agent TypeScript compilation only, not device/print behavior. |
| `npx.cmd prisma validate --schema apps/backend/prisma/schema.prisma` | `ROOT` | 0 / PASS | Proves Prisma schema syntax/config resolution; not deployed-schema parity. |
| `npm.cmd run lint -w apps/backend` | `ROOT` | 1 / **FAIL** | Trustworthy gate failure: 1,139 warnings, 0 errors, maximum 1,133. |
| `npm.cmd run lint -w apps/frontend` | `ROOT` | 0 / PASS at budget | 448 warnings of 455 allowed; exit 0 does not mean warning-free. |
| `npm.cmd run lint -w apps/printer-agent` | `ROOT` | 0 / PASS | 0 warnings for configured files; not a runtime test. |
| `npm.cmd test` | `ROOT` | 0 / PASS | Backend 150 suites/2,050 tests; frontend 94 files/499; printer 3 suites/12; root Node 4. No focused `.only`/`xit` marker was found. Three database e2e files conditionally use `describe.skip` when their DB URL is absent; this unit command does not prove those e2e suites ran. |
| `npm.cmd run test:cov -w apps/backend`; `npm.cmd run test:cov -w apps/frontend`; `npm.cmd run test:cov -w apps/printer-agent` | `ROOT` | 0 / PASS thresholds | Backend S/B/F/L 82.24/69.03/79.74/83.45%; frontend 39.06/71.00/42.57/39.06%; printer 62.14/26.95/66.66/65.03%. Thresholds do not prove critical-flow coverage. |
| `npm.cmd run build` | `ROOT` | 1 / **FAIL** | Prisma generation hit `EPERM` on a locked Windows engine DLL and Turbo canceled frontend. Host lock contributes, but the canonical artifact command is not green. |
| `npx.cmd nest build` | `ROOT\apps\backend` | 0 / PASS | Compiled 411 files after Prisma was bypassed; does not prove generated client freshness or canonical build. |
| `npm.cmd run build -w apps/frontend` | `ROOT` | 0 / PASS | Production bundle built; emitted 916.79 kB vendor chunk (274 kB gzip) and 4,524 KiB PWA precache. Does not exercise deployed routing/runtime config. |
| `npm.cmd run build:safe -w apps/backend` | `ROOT` | 1 / **FAIL** | Reproduces wrapper failure; source review proves inherited stdio makes `result.stderr` unavailable for documented EPERM matching. |
| `npm.cmd run test:e2e -w apps/backend -- --runInBand --ci` | `ROOT` | 1 / **FAIL** | 1/6 suites and 5/25 tests failed from stale `emitToRestaurant` fixture after commit; the isolated conflict rejection still occurred. |
| `npm.cmd run test:e2e -w apps/frontend` (default and one worker under bounded harnesses) | `ROOT` | 124 / **TIMEOUT** | Five mocked assertions passed, then both runs hung to 300s/180s forced timeout. Trustworthy on this host; Linux CI behavior still requires confirmation. |
| `npx.cmd prisma migrate deploy --schema apps/backend/prisma/schema.prisma`; `npx.cmd prisma migrate status --schema apps/backend/prisma/schema.prisma` | `ROOT` with isolated `DATABASE_URL` | 0 / PASS | All 51 migrations applied to clean PostgreSQL 17 and status was current. Empty-state success does not prove upgrade behavior on production-shaped data. |
| `npx.cmd ts-node scripts/verify-preproduction-readonly.ts` | `ROOT\apps\backend`, isolated DB | 0 / **FALSE GREEN** | It reported a checksum mismatch yet exited 0; the exit status is demonstrably untrustworthy for migration integrity. No production data was read. |
| `npm.cmd audit --json` | `ROOT` | 1 / **FAIL** | 35 advisories: 17 High, 17 Moderate, 1 Low, 0 Critical. Advisory presence is trustworthy; exploitability was not dynamically proven. |

## 6. Critical findings

No Critical finding was confirmed. This does not lower the verdict because five concrete High failure paths and five broken P0 verification gates remain.

## 7. High findings

### PRD-001 — A print job can be physically printed more than once [MITIGATED IN WORKING TREE — NOT RESOLVED]

- **Classification / severity / confidence:** Confirmed defect with tested local mitigation / High / High. Real-printer and coordinated rollout evidence is still required.
- **Affected user or system:** Restaurant kitchen/bar operations, customers, printer agent, order fulfillment.
- **Exact location:** `apps/backend/src/print-station/print-station.service.ts:313-445`; `apps/backend/src/events/events.gateway.ts:742-764`; `apps/printer-agent/src/services/socket.ts:347-386`.
- **Symbol/entity:** `PrintStationService.retryPendingJobs`, `retryStuckPrintJobs`, `EventsGateway.emitPrintJob`, printer-agent `socket.on('print:job')`, `PrintJob`.
- **Evidence:** scheduled retries query eligible pending/stale rows and emit before recording an attempt; no atomic claim/lease excludes another backend instance. The agent sends the ticket to the printer immediately and has no persistent `jobId` deduplication before acknowledging it.
- **Failure sequence:** two Cloud Run instances run the retry scheduler, read the same pending job, and both emit `print:job`; one or two connected agents receive the duplicate and each invokes the physical printer before either acknowledgement changes shared state.
- **Production impact:** duplicate kitchen tickets can cause duplicate preparation, stock loss, customer disputes and unsafe operational confusion. Session affinity does not serialize background schedulers.
- **Recommended fix:** atomically claim a job with a lease/attempt token in PostgreSQL before emit; make acknowledgement conditional on the token; add a lease expiry/recovery path; persist recently printed `jobId` values on the agent and suppress reprints.
- **Regression tests:** two concurrent scheduler instances must produce one claim/emit; duplicate event delivery must produce one physical print; crash-before-ack and lease-expiry recovery must print at most once under the chosen semantics.
- **Fix risk / side effects:** overly strict deduplication can lose legitimate retries; leases require clock/expiry design and migration/backfill care.
- **Related findings:** PRD-002, PRD-009, PRD-011.

### PRD-002 — Production silently degrades to instance-local realtime state

- **Classification / severity / confidence:** Missing safeguard / High / High.
- **Affected user or system:** POS staff, public order tracking, reservations, payments, assistance, menu updates and printer agents.
- **Exact location:** `apps/backend/src/adapters/redis-io.adapter.ts:15-47`; `apps/backend/src/main.ts:317-319`; `deploy.ps1:19-36`.
- **Symbol/entity:** `RedisIoAdapter.connectToRedis`, Socket.IO room membership/event fan-out, Cloud Run service.
- **Evidence:** absent `REDIS_URL` or a Redis connection error only logs and falls back to the in-memory adapter. Deployment enables session affinity but does not require Redis or constrain the service to one instance.
- **Failure sequence:** a client joins a room on instance A; a webhook, cron, or API request is handled by instance B; instance B emits to its in-memory room set and the client on A never receives the update.
- **Production impact:** orders, payment confirmations, reservation changes and print jobs can appear stuck or missing under normal scaling or instance replacement.
- **Recommended fix:** make Redis mandatory and fail startup/readiness in multi-instance production; validate it before listening; monitor adapter connectivity; define an explicit single-instance emergency mode rather than silent fallback.
- **Regression tests:** boot must fail in production when Redis is required but absent; a two-instance integration test must join on A and emit on B; Redis outage/reconnect behavior must be observable and bounded.
- **Fix risk / side effects:** fail-fast can turn a Redis outage into total unavailability, so Redis HA, reconnect policy and an explicit degraded-mode decision are prerequisites.
- **Related findings:** PRD-001, PRD-012, PRD-014, PRD-016.

### PRD-003 — Reminder records can claim success without delivery and can duplicate across instances [MITIGATED IN WORKING TREE — NOT RESOLVED]

- **Classification / severity / confidence:** Confirmed defect with tested local mitigation for scheduled reservation and loyalty reminders / High / High. Provider staging and the remaining direct lifecycle path are still required.
- **Affected user or system:** Reservation guests, loyalty customers, restaurant reputation and notification spend.
- **Exact location:** `apps/backend/src/reservations/reservation-reminder.service.ts:38-105`; `apps/backend/src/reservations/reservation-notifications.service.ts:342-460`; `apps/backend/src/loyalty/loyalty.service.ts:586-708`.
- **Symbol/entity:** `ReservationReminderService.sendReminders`, reservation `sendEmail`/`sendSms`, `LoyaltyService.runDailyExpiryReminders`, `reminderSentAt`.
- **Evidence:** reservation reminders claim `reminderSentAt` before dispatch, while email/SMS helpers return without throwing for missing credentials and log non-2xx provider responses instead of reporting failure. Loyalty reminders select unnotified batches without a durable per-recipient claim, send first, then stamp; missing `RESEND_API_KEY` still follows the path that stamps reminders.
- **Failure sequence:** missing credentials or provider rejection returns control as if delivery succeeded and the row remains permanently marked sent; separately, two backend instances select the same loyalty batches and both send before either stamps them.
- **Production impact:** guests silently miss time-sensitive reminders, loyalty customers can receive duplicates, and support has no trustworthy delivery status.
- **Recommended fix:** return a typed provider result or throw on non-acceptance; model queued/accepted/failed attempts separately from business reminder state; add retry/backoff/dead-letter handling; atomically claim loyalty batches with a lease.
- **Regression tests:** missing credentials and HTTP non-2xx must not produce a sent state; transient failure must retry; two concurrent workers must dispatch once; permanent failure must be queryable/alerted.
- **Fix risk / side effects:** changing retry semantics can resend historical reminders; deploy with a cutoff/backfill policy and provider idempotency keys where available.
- **Related findings:** PRD-013, PRD-016, PRD-019.

### PRD-004 — High-severity advisories are installed on production request paths [OPEN — REVALIDATED]

- **Classification / severity / confidence:** Probable risk / High / High that affected versions are installed; Medium for exploitability without advisory-specific load testing.
- **Affected user or system:** Public API availability, upload workers, realtime clients and external HTTP integrations.
- **Exact location:** `apps/backend/package.json:44-71`; `apps/frontend/package.json:26-44`; `apps/printer-agent/package.json:15`; `package-lock.json`.
- **Symbol/entity:** `@nestjs/platform-express` -> Multer, `sharp`, `socket.io`/`socket.io-client` -> Engine.IO/ws, `axios`; upload controllers and realtime gateway.
- **Evidence:** the refreshed `npm audit --omit=dev --json` reported 28 production-tree advisories (15 High, 12 Moderate, 1 Low, 0 Critical). Affected installed paths include Nest/Multer, Sharp/libvips, Socket.IO/Engine.IO/ws, Axios, React Router, PostCSS and supporting transitive packages. The repository accepts public uploads, processes images, maintains sockets, routes public frontend navigation and performs outbound HTTP.
- **Failure sequence:** an attacker or malformed upstream input reaches a vulnerable upload, image, websocket or HTTP parsing path and causes resource exhaustion or other advisory-described behavior.
- **Production impact:** likely availability degradation or worker exhaustion on internet-facing paths; exact effect depends on each advisory and deployment limits.
- **Recommended fix:** upgrade to patched compatible releases, regenerate the lockfile with the pinned npm version, review each advisory for reachability, and add request/resource limits before accepting residual exceptions.
- **Regression tests:** upload decompression/memory limits, websocket malformed-frame/load tests, outbound URL/redirect tests, full unit/e2e/build suite, and a zero-unaccepted-High audit policy.
- **Fix risk / side effects:** framework, native Sharp/libvips and Socket.IO upgrades can change ABI, protocol or browser compatibility; test in the production container image.
- **Related findings:** PRD-006, PRD-007, PRD-018, PRD-021.

### PRD-005 — Recovery from database loss or a bad release is not demonstrated

- **Classification / severity / confidence:** Missing safeguard / High / High.
- **Affected user or system:** All tenants, orders, payments, reservations, loyalty balances and operators responding to an incident.
- **Exact location:** `apps/backend/scripts/db-backup.js:1-108`; `apps/backend/scripts/db-restore.js:1-188`; `apps/backend/scripts/schedule-backup.ps1:1-44`; `deploy.ps1:1-39`.
- **Symbol/entity:** local `pg_dump`/restore scripts, Windows Scheduled Task, Cloud Run deployment procedure.
- **Evidence:** backup tooling writes local dumps and the scheduler is machine-local; no configured task was present on the audit machine, no off-host encrypted retention/monitoring/RPO/RTO evidence exists, and no restore drill artifact was found. The deployment script overwrites `:latest` and has no health-gated promotion or executable rollback step. The scheduler comments/output say 03:00 while its trigger is 08:00.
- **Failure sequence:** database corruption, operator error or a bad migration/release occurs; the team discovers that the expected backup is absent/stale or cannot be restored, while the previous deployable image/revision is not recorded in a tested runbook.
- **Production impact:** extended outage and irreversible tenant/order/payment data loss are possible even if the managed database has undocumented provider-side recovery.
- **Recommended fix:** define RPO/RTO; enable and verify managed PITR plus encrypted off-site logical backups; alert on backup age/failure; run and time a restore into an isolated environment; record immutable application image/revision and automate a tested rollback decision/runbook.
- **Regression tests:** scheduled backup freshness check, checksum/restore drill, migration rollback/forward rehearsal on a data copy, and Cloud Run revision rollback smoke test.
- **Fix risk / side effects:** restore drills can overwrite data if targets are ambiguous; require isolated project/database IDs and destructive-action guards.
- **Related findings:** PRD-010, PRD-013, PRD-015, PRD-024.

## 8. Medium findings

### PRD-006 — Backend lint exceeds its enforced warning budget [REPAIRED — GATE PASS]

- **Classification / severity / confidence:** Repaired gate regression / Medium historical impact / High. Six warnings were removed without changing rules or the 1,133 ceiling; full lint exits 0 at exactly the ceiling.
- **Affected user or system:** CI/release pipeline and maintainers.
- **Exact location:** `apps/backend/package.json:26-28`; representative current violations in `apps/backend/src/translation/translation.service.ts` and `apps/backend/src/common/retention.service.ts`.
- **Symbol/entity:** backend `lint` script and current ESLint result.
- **Evidence:** the command produced 1,139 warnings and 0 errors against `--max-warnings 1133`, so it exited non-zero. Violations include `only-throw-error`, Prettier and unsafe/explicit-`any` categories.
- **Failure sequence:** CI runs the same lint script and stops the pipeline before deployable artifacts are certified.
- **Production impact:** the release cannot honestly be called green; repeatedly raising a budget would also normalize known correctness/type-safety warnings.
- **Recommended fix:** remove at least the six-budget regression and then ratchet the ceiling down by category; do not increase `--max-warnings` to pass.
- **Regression tests:** run backend lint in CI with a lower or zero warning budget for touched files and keep the full-project budget non-increasing.
- **Fix risk / side effects:** mechanical formatting is low risk; tightening `any` and thrown-value types can change error handling, so rerun affected tests.
- **Related findings:** PRD-004, PRD-018.

### PRD-007 — The canonical build and its documented safe fallback are not reliable [REPAIRED — GATE PASS]

- **Classification / severity / confidence:** Environment/tooling failure now cleared / Medium historical impact / High on this host. The canonical build passes without bypassing Prisma; repeat in clean CI/container before release.
- **Affected user or system:** Developers, CI/release operators and artifact reproducibility.
- **Exact location:** `apps/backend/package.json:10-11`; `apps/backend/scripts/prisma-generate-safe.js:1-22`; root `package.json:19-21`.
- **Symbol/entity:** `build`, `build:safe`, `spawnSync` result handling.
- **Evidence:** root build failed when Prisma could not replace a locked engine DLL. The safe wrapper sets `stdio: 'inherit'` and then reads `result.stderr`, which is `null`, so its documented EPERM detection cannot work; `build:safe` also failed. Direct Nest and frontend builds passed separately.
- **Failure sequence:** a locked client binary or similar Prisma generation failure occurs; the fallback script cannot recognize the condition and the release build exits non-zero or behaves differently by host.
- **Production impact:** no single reproducible command currently proves a complete release artifact, increasing operator workarounds and host-specific releases.
- **Recommended fix:** generate Prisma in a clean isolated build workspace/container; if the wrapper remains, capture stderr safely and only tolerate a locked binary after verifying generated client/version integrity.
- **Regression tests:** unit-test wrapper exit behavior for success, EPERM, unrelated failure and null stderr; execute the canonical build from a clean checkout/container.
- **Fix risk / side effects:** swallowing Prisma generation failure can ship a client/schema mismatch, so fail closed unless integrity is proven.
- **Related findings:** PRD-004, PRD-016, PRD-023.

### PRD-008 — Backend concurrency e2e is broken by a stale gateway fixture [REPAIRED — GATE PASS]

- **Classification / severity / confidence:** Repaired test-infrastructure defect / Medium historical impact / High. The full 6-suite/31-test E2E command now passes.
- **Affected user or system:** Order concurrency release evidence and CI.
- **Exact location:** `apps/backend/test/preproduction-concurrency.e2e-spec.ts` (`buildOrderService` fixture); `apps/backend/src/orders/orders.service.ts:1256-1298`.
- **Symbol/entity:** concurrency e2e suite, `OrdersService.create`, `EventsGateway.emitToRestaurant`.
- **Evidence:** 5 of 25 e2e tests failed because the fixture mocks older gateway methods but not `emitToRestaurant`; order persistence commits, then the post-commit call throws `TypeError`. The simultaneous force-open request correctly rejected with `ConflictException`, so this failure does not disprove the tested database invariant.
- **Failure sequence:** the e2e creates an order, commit succeeds, then a missing mock function rejects the promise and every success assertion observes rejection.
- **Production impact:** a required concurrency gate is red and no longer detects regressions in the intended assertions.
- **Recommended fix:** update the typed fixture or use the real/test gateway module; separate transaction assertions from side-effect assertions and prevent untyped mock drift.
- **Regression tests:** rerun the full e2e suite; add a compile-time gateway mock contract and explicit assertion that the conflict path produces one open session/order.
- **Fix risk / side effects:** simply adding a no-op mock can hide the separate post-commit delivery risk in PRD-011; preserve explicit side-effect tests.
- **Related findings:** PRD-001, PRD-011, PRD-018.

### PRD-009 — Browser critical journeys hang after all assertions pass [REFINED — PROCESS-SANDBOX LIMITATION]

- **Classification / severity / confidence:** Environment/process-runner limitation / Medium gate impact / High on this host; Medium for Linux CI until repeated there. The unrestricted Windows run exits 0 with 5/5 in 32 seconds.
- **Affected user or system:** CI release gate and frontend end-to-end evidence.
- **Exact location:** `apps/frontend/e2e/critical-journeys.spec.ts`; `apps/frontend/scripts/start-e2e-server.mjs`; `apps/frontend/playwright.config.ts`; `.github/workflows/ci.yml:96-108`.
- **Symbol/entity:** Playwright `test:e2e`, dev-server lifecycle/teardown.
- **Evidence:** all five critical-journey assertions passed, but both a default-worker run and a one-worker run remained alive until external 300s/180s timeouts. The tests mock `/api/v1/**` rather than connecting to the backend.
- **Failure sequence:** Playwright completes test bodies; a server/process/socket handle remains active; CI waits indefinitely or until its job timeout and never produces a green release gate.
- **Production impact:** release automation can stall, and the passing assertions do not validate real API, database, auth-cookie or websocket integration.
- **Recommended fix:** make server lifecycle ownership explicit, terminate child processes on success/failure/signals, use Playwright `webServer` where possible, and add at least one production-build full-stack smoke suite.
- **Regression tests:** e2e command must exit 0 within a bounded time on Windows and CI Linux; inspect open handles; run a real backend/database journey without route mocks.
- **Fix risk / side effects:** aggressive process killing can terminate unrelated local processes; track and stop only the exact child PID/process tree.
- **Related findings:** PRD-016, PRD-018.

### PRD-010 — The pre-production verifier reports migration corruption but exits successfully [REPAIRED — GATE PASS]

- **Classification / severity / confidence:** Repaired verifier defect / Medium historical impact / High. Exact-byte checksum and all migration-state blockers now agree with the process exit code.
- **Affected user or system:** Release operators, database integrity and migration safety.
- **Exact location:** `apps/backend/scripts/verify-preproduction-readonly.ts:86-145`.
- **Symbol/entity:** migration audit output, `checksumMatchesFile`, `blockers`, process exit code.
- **Evidence:** on a fresh database created from the repository's own 51 migrations, the verifier printed one `checksumMatchesFile: false` result but exited 0. The `blockers` calculation at lines 126-130 counts authoritative data conditions only and excludes missing, unfinished or checksum-mismatched migrations.
- **Failure sequence:** a database has a missing, incomplete or modified migration; the report visibly contains the discrepancy, but automation consumes only exit status and allows promotion.
- **Production impact:** schema drift can pass the named pre-production gate and surface later as runtime or data-integrity failure.
- **Recommended fix:** normalize intended line endings consistently, compare checksums using Prisma-compatible semantics, and include missing/unfinished/rolled-back/checksum failures in a typed non-zero result with an explicit documented exception mechanism.
- **Regression tests:** clean migrations pass; changed SQL, missing migration row, unfinished migration and rollback row each fail; the script's JSON/text and exit code agree.
- **Fix risk / side effects:** changing checksum normalization can flag already deployed migrations; never edit applied migration SQL—investigate and document historical mismatches.
- **Related findings:** PRD-005, PRD-016, PRD-024.

### PRD-011 — A committed order can be returned as failed and retried without a public idempotency key [MITIGATED IN WORKING TREE — NOT RESOLVED]

- **Classification / severity / confidence:** Confirmed risk with tested local mitigation / Medium / High. Coordinated frontend/backend staging remains required.
- **Affected user or system:** Public diners, staff, kitchen and order data.
- **Exact location:** `apps/backend/src/orders/orders.service.ts:1256-1298`; `apps/backend/prisma/schema.prisma` (`Order.clientOrderId` uniqueness); public order controller/DTO paths.
- **Symbol/entity:** `OrdersService.create`, post-transaction gateway emissions, `Order`, `clientOrderId`.
- **Evidence:** order persistence completes before synchronous realtime calls; an emission exception can reject the request after commit, as the failing e2e demonstrated. POS submissions require a client order identifier backed by a unique constraint, while the public/customer path does not provide equivalent retry idempotency.
- **Failure sequence:** database commit succeeds, realtime emission throws or the response is lost, client sees failure and retries, and the second public request creates another order.
- **Production impact:** duplicate orders, charges/cash expectations and kitchen tickets are possible during transient failures.
- **Recommended fix:** accept a scoped idempotency key for every order-create channel; return the original result on replay; move side effects to a transactional outbox or contain/report post-commit emission failures without changing the committed HTTP result.
- **Regression tests:** same key in parallel and after response loss creates one order; different tenants/keys remain independent; emission failure after commit returns a stable success/replay result and queues retry.
- **Fix risk / side effects:** idempotency retention and payload-mismatch policy require storage/TTL design; outbox rollout can duplicate legacy direct events unless cut over atomically.
- **Related findings:** PRD-001, PRD-002, PRD-008.

### PRD-012 — Authentication throttling is per process, not distributed

- **Classification / severity / confidence:** Missing safeguard / Medium / High.
- **Affected user or system:** Login, registration, OTP/PIN endpoints and account security.
- **Exact location:** `apps/backend/src/app.module.ts:43-51`; auth controller throttle decorators; deployment scaling in `deploy.ps1`.
- **Symbol/entity:** `ThrottlerModule`, `ThrottlerGuard`, login/register/OTP/PIN routes.
- **Evidence:** the default Nest throttler storage is configured with no shared Redis/custom storage. Endpoint limits are sound per instance (for example login 5/min and PIN 5/min), but each instance maintains a separate counter.
- **Failure sequence:** an attacker distributes requests across scaled/replaced instances or reconnects as instances churn, multiplying the effective attempt budget.
- **Production impact:** brute-force and abuse resistance is lower than the declared per-route policy under normal autoscaling.
- **Recommended fix:** use a shared, atomic rate-limit store keyed by normalized identity/IP/device with trusted-proxy configuration; combine with account/device backoff and alerting.
- **Regression tests:** a two-instance test must enforce one aggregate limit; forwarded-IP spoof tests; IPv6 normalization; Redis failure policy; legitimate NAT/shared-network load.
- **Fix risk / side effects:** incorrect proxy trust or coarse IP keys can lock out legitimate users; privacy/retention for identity keys must be defined.
- **Related findings:** PRD-002, PRD-013, PRD-015.

### PRD-013 — There is no actionable production telemetry or alert path

- **Classification / severity / confidence:** Missing safeguard / Medium / High.
- **Affected user or system:** Incident responders and every production user during a latent failure.
- **Exact location:** `apps/backend/src/common` logging/interceptor code; repository-wide production/deployment configuration.
- **Symbol/entity:** structured application logger and request IDs; absence of error aggregation, metrics, traces and alert definitions.
- **Evidence:** the backend has useful structured/redacted logging and request correlation, but no Sentry/OpenTelemetry/Prometheus integration or repository-defined alerts were found for 5xx rate, latency, payment reconciliation, notification failure, Redis disconnect, print retry age, migration/backup age or queue backlog.
- **Failure sequence:** a provider silently rejects notifications, Redis falls back, print jobs retry or payment reconciliation accumulates; logs exist but no threshold pages an operator, so the issue is discovered by users.
- **Production impact:** longer detection/recovery time and no objective launch health signal or rollback trigger.
- **Recommended fix:** define SLIs/SLOs and dashboards; aggregate errors with release/request/tenant-safe context; emit domain metrics; add tested alerts and on-call routing with runbooks.
- **Regression tests:** synthetic failures for Redis, notification, payment reconciliation, print backlog and 5xx must produce the expected metric/alert without leaking secrets/PII.
- **Fix risk / side effects:** high-cardinality tenant/order labels and captured payloads can create cost/privacy problems; use bounded identifiers and redaction.
- **Related findings:** PRD-001, PRD-002, PRD-003, PRD-005.

### PRD-014 — Health checks do not prove readiness and graceful shutdown hooks are unused

- **Classification / severity / confidence:** Missing safeguard / Medium / High.
- **Affected user or system:** Cloud Run routing, database connections and in-flight requests during rollout/scale-down.
- **Exact location:** `apps/backend/src/health/health.controller.ts:7-10`; `apps/backend/src/prisma/prisma.service.ts:144-153`; `apps/backend/src/main.ts`.
- **Symbol/entity:** health endpoint, `PrismaService.enableShutdownHooks`, application bootstrap.
- **Evidence:** health returns only `{status:'ok', timestamp}` and does not check PostgreSQL, Redis or critical initialization. `enableShutdownHooks(app)` registers SIGINT/SIGTERM close behavior but has no caller; Nest shutdown hooks are not enabled elsewhere.
- **Failure sequence:** an instance responds healthy while DB/Redis is unusable and receives traffic, or a rollout sends termination while in-flight work and connections are not drained through application lifecycle hooks.
- **Production impact:** avoidable 5xx bursts, lost responses/side effects and misleading deployment health.
- **Recommended fix:** separate liveness from readiness; readiness must verify required dependencies with tight timeouts; enable Nest shutdown hooks and bounded drain/close behavior; align Cloud Run startup/termination settings.
- **Regression tests:** DB/Redis unavailable makes readiness fail but liveness behave as designed; SIGTERM stops admission, drains an in-flight request and closes Prisma/socket/provider resources within the deadline.
- **Fix risk / side effects:** deep health checks can amplify outages; cache or bound checks and avoid making optional providers hard dependencies.
- **Related findings:** PRD-002, PRD-013, PRD-016.

### PRD-015 — Production configuration is incomplete, weakly validated and not reproducible from the repository

- **Classification / severity / confidence:** Missing safeguard / Medium / High.
- **Affected user or system:** Deployers, authentication links, payments, realtime, translation, push, weather, notifications and frontend sockets.
- **Exact location:** `apps/backend/src/main.ts:25-49,66`; `apps/backend/src/auth/auth-runtime-policy.ts:5-22`; `apps/backend/.env.example:1-125`; root `.env.example:1-8`; `apps/frontend/src/lib/api.ts:14-23`; `apps/frontend/src/context/SocketContext.tsx:50-62`; `vercel.json:5-13`.
- **Symbol/entity:** `validateRuntimeEnvironment`, `validateFrontendUrl`, `FRONTEND_URL`, `REDIS_URL`, provider secrets, `VITE_API_URL`.
- **Evidence:** runtime policy principally validates `NODE_ENV`; missing production `FRONTEND_URL` only warns and falls back to localhost. Environment examples omit multiple directly used variables, including Redis, Stripe/webhook, DeepL, VAPID, weather and provider-specific settings. Frontend HTTP uses the Vercel `/api/v1` rewrite, but Socket.IO depends on correct `VITE_API_URL`; `/socket.io` is not covered by that rewrite.
- **Failure sequence:** a deploy inherits incomplete/stale cloud configuration; boot still succeeds, generated links point to localhost, realtime connects to the wrong origin, or a feature silently disables/fails only when invoked.
- **Production impact:** partial outages and security-sensitive misconfiguration are discovered after launch rather than at build/startup.
- **Recommended fix:** create a typed production configuration schema with required/conditional variables, URL/origin validation and secret-source ownership; generate a redacted deployment manifest; fail fast for enabled features and validate frontend build-time variables.
- **Regression tests:** configuration contract tests for each feature/provider combination; production boot must reject missing/invalid required values; deployed smoke test must validate link origins, API and socket endpoints.
- **Fix risk / side effects:** making every integration mandatory can block deployments where a feature is intentionally disabled; model explicit feature states and conditional requirements.
- **Related findings:** PRD-002, PRD-003, PRD-005, PRD-012, PRD-016.

### PRD-016 — Deployment is mutable and has no health-gated promotion or executable rollback

- **Classification / severity / confidence:** Missing safeguard / Medium / High.
- **Affected user or system:** All users during deployment, release operators and incident responders.
- **Exact location:** `deploy.ps1:1-39`; `vercel.json:1-35`; `.github/workflows/ci.yml:45-116`.
- **Symbol/entity:** `gcr.io/...:latest`, `gcloud run deploy`, Vercel `installCommand`, CI deploy boundary.
- **Evidence:** the script builds and deploys mutable `:latest`, does not run verification, record an image digest/revision, perform a post-deploy health/smoke gate, progressively shift traffic or automate rollback. Vercel uses `npm install` rather than lockfile-strict `npm ci`.
- **Failure sequence:** a build produces a defective artifact or resolves a different dependency tree; deployment immediately serves it, no automated smoke blocks promotion, and responders must discover/reconstruct a prior revision manually.
- **Production impact:** avoidable broad outage and slow, error-prone rollback.
- **Recommended fix:** build once with `npm ci`, tag by commit and record the digest; require green gates; deploy a no-traffic/canary revision; smoke it; shift traffic progressively; retain and script rollback to the prior verified revision.
- **Regression tests:** pipeline rehearsal must prove digest identity, gate failure prevents promotion, canary smoke failure leaves current traffic unchanged, and rollback restores the previous revision.
- **Fix risk / side effects:** traffic splitting affects sticky websocket sessions and migrations must remain backward-compatible across old/new revisions.
- **Related findings:** PRD-002, PRD-005, PRD-007, PRD-009, PRD-010, PRD-014, PRD-015.

### PRD-017 — Interactive API documentation is exposed unconditionally

- **Classification / severity / confidence:** Missing safeguard / Medium / High.
- **Affected user or system:** Public API attack surface and security operators.
- **Exact location:** `apps/backend/src/main.ts:273-315`; `apps/backend/src/app.controller.ts:27,41`.
- **Symbol/entity:** `SwaggerModule.setup('api-docs', ...)`, root documentation link.
- **Evidence:** Swagger document generation and `/api-docs` setup occur without an environment gate or authentication; the root controller advertises the path.
- **Failure sequence:** an unauthenticated internet user browses the complete API shape, DTOs and route inventory and uses it to accelerate endpoint probing or high-volume scanning.
- **Production impact:** this is not an authorization bypass, but it unnecessarily increases reconnaissance and maintenance surface in production.
- **Recommended fix:** disable it in public production or protect a separately hosted/static spec with strong operator authentication and an explicit exposure decision.
- **Regression tests:** unauthenticated production-mode request returns 404/403; approved internal documentation remains accessible to authorized operators.
- **Fix risk / side effects:** support/integration teams may rely on live docs; publish a versioned artifact through an approved channel first.
- **Related findings:** PRD-015, PRD-022.

### PRD-018 — Passing coverage thresholds overstate critical-flow integration evidence

- **Classification / severity / confidence:** Missing test / Medium / High.
- **Affected user or system:** Release decision quality across frontend, printer agent and cross-service flows.
- **Exact location:** `apps/backend/package.json:31-34,151-158`; `apps/frontend/package.json:67-68`; `apps/frontend/vite.config.js:210-225`; `apps/printer-agent/package.json:32,55-62`; `apps/frontend/e2e/critical-journeys.spec.ts:88-246`.
- **Symbol/entity:** coverage thresholds and critical-journey test architecture.
- **Evidence:** frontend statement/line coverage is about 39%; printer branch coverage is 26.95% and lines 65.03%, barely above configured floors. Browser journeys mock every `/api/v1/**` response, and printer socket tests mock printing rather than exercising duplicate durable delivery/hardware behavior.
- **Failure sequence:** an API contract, auth-cookie, migration, websocket, service-worker or printer delivery regression crosses a boundary not represented in the unit/mock suite; all threshold checks can still pass.
- **Production impact:** false confidence around the exact flows with the highest operational cost.
- **Recommended fix:** add a small production-build full-stack suite covering auth, tenant isolation, public order/idempotency, payment callback, Redis cross-instance event, reservation notification failure and printer deduplication; raise coverage based on risk, not percentage alone.
- **Regression tests:** the new tests are the safeguard; additionally mutation/negative authorization tests should prove they fail when ownership/signature/idempotency checks are removed.
- **Fix risk / side effects:** full-stack tests can be flaky; use isolated deterministic providers, fixed time and explicit readiness/teardown.
- **Related findings:** PRD-001, PRD-002, PRD-003, PRD-008, PRD-009.

### PRD-019 — Reservation email and Twilio requests have no explicit timeout

- **Classification / severity / confidence:** Probable risk / Medium / High.
- **Affected user or system:** Reservation guests, reminder worker capacity and backend request resources.
- **Exact location:** `apps/backend/src/reservations/reservation-notifications.service.ts:342-374,381-460`.
- **Symbol/entity:** `ReservationNotificationsService.sendEmail`, `sendSms`, Resend and direct Twilio `fetch` calls.
- **Evidence:** the Resend request at lines 354-367 and Twilio request at lines 443-453 pass no `AbortSignal` or explicit deadline. By contrast, the inspected DeepL provider correctly configures an 8-second Axios timeout in `apps/backend/src/translation/providers/deepl.provider.ts:19-22`.
- **Failure sequence:** Resend/Twilio accepts a connection but stalls; the scheduled reminder invocation remains awaiting `fetch`, delaying completion and consuming a worker/runtime slot without a bounded provider deadline.
- **Production impact:** reminder throughput and scheduler completion can degrade during provider/network failure, compounding the false-success/retry-state problem in PRD-003.
- **Recommended fix:** add a measured overall timeout with cancellation to each transport, classify timeout as a failed attempt, retry with jitter inside a total delivery budget, and expose attempt age/status.
- **Regression tests:** a hanging Resend/Twilio fake must abort within budget, retain a retryable failure state and release the worker; accepted responses must remain unaffected.
- **Fix risk / side effects:** overly short deadlines can create retries and duplicate provider submissions if the upstream accepted a request before cancellation; use provider idempotency support or a reconciliation key.
- **Related findings:** PRD-003, PRD-013, PRD-015.

### PRD-020 — Ordinary users have no self-service forgotten-password recovery

- **Classification / severity / confidence:** Missing safeguard / Medium / High.
- **Affected user or system:** Restaurant owners/staff who lose credentials and support/super-admin operators.
- **Exact location:** `apps/backend/src/auth/auth.controller.ts:33-203`; `apps/backend/src/auth/auth.service.ts` password/authentication methods; frontend auth pages/components.
- **Symbol/entity:** login/change-password routes and super-admin reset; absent forgot-password/request-reset/consume-reset flow.
- **Evidence:** password change and privileged reset mechanisms exist, but no public, rate-limited, single-use password-reset flow was found. Google OAuth, magic-link/email OTP and PIN login provide alternative authentication where configured; they do not let a user replace a forgotten or suspected-compromised password.
- **Failure sequence:** a password user forgets or needs to rotate an unavailable password; they may regain access through an already configured passwordless method, but cannot self-service the password credential and otherwise need privileged support.
- **Production impact:** increased support dependency and a stale password credential; alternative login methods reduce, but do not eliminate, the operational impact.
- **Recommended fix:** add short-lived, single-use, hashed reset tokens; rate-limit without account enumeration; revoke sessions on reset; notify the account and document support fallback/MFA policy.
- **Regression tests:** unknown and known emails have indistinguishable responses; expiry/replay/concurrency fail; successful reset revokes old tokens; tenant/support roles cannot reset unauthorized accounts.
- **Fix risk / side effects:** reset flows are high-value takeover paths; require security review, email-delivery observability and abuse controls before enabling.
- **Related findings:** PRD-003, PRD-012, PRD-013.

## 9. Low and informational findings

### PRD-021 — Abandoned restaurant-logo uploads can leave unreferenced objects

- **Classification / severity / confidence:** Confirmed defect / Low / High.
- **Affected user or system:** R2 storage cost/retention and restaurant branding operators.
- **Exact location:** `apps/backend/src/restaurants/restaurants.controller.ts:80-118`; `apps/backend/src/restaurants/restaurants.service.ts:441-452`.
- **Symbol/entity:** `uploadLogo`, `uploadWithThumbnail`, subsequent restaurant branding PATCH.
- **Evidence:** the upload endpoint stores main and thumbnail objects and returns URLs; its comment states the database write occurs in a subsequent PATCH. If the client abandons that second request, no database row references the objects and no cleanup path is invoked.
- **Failure sequence:** upload succeeds, browser closes or PATCH fails, and both R2 keys remain indefinitely.
- **Production impact:** gradual orphaned-object accumulation and ambiguous retention/deletion obligations.
- **Recommended fix:** use temporary upload keys with expiry and promote atomically, or add a scheduled orphan collector after a safety window.
- **Regression tests:** abandon upload and verify expiry; successful promotion survives collector; shared/referenced images are never deleted.
- **Fix risk / side effects:** an incorrect collector can delete live branding; require reference recheck and conservative grace period.
- **Related findings:** PRD-004, PRD-015.

### PRD-022 — Unknown DTO properties are stripped rather than rejected

- **Classification / severity / confidence:** Maintainability concern / Low / High.
- **Affected user or system:** API clients and operators diagnosing malformed requests.
- **Exact location:** `apps/backend/src/main.ts:116`.
- **Symbol/entity:** global `ValidationPipe({ transform: true, whitelist: true })`.
- **Evidence:** whitelist mode is enabled without `forbidNonWhitelisted`, so misspelled or obsolete properties are silently removed instead of returning a validation error.
- **Failure sequence:** a client sends `restaurantID` or a retired field, receives an otherwise successful response, and assumes the intended mutation occurred.
- **Production impact:** confusing partial updates and harder API contract migration/debugging; no authorization bypass was found from this behavior.
- **Recommended fix:** evaluate enabling `forbidNonWhitelisted` for versioned APIs, document compatibility, and roll out after client telemetry/deprecation review.
- **Regression tests:** unknown fields return the chosen 400 error; valid legacy clients remain compatible; explicit passthrough DTOs are covered.
- **Fix risk / side effects:** existing clients may depend on lenient behavior, so observe and communicate before enforcement.
- **Related findings:** PRD-017, PRD-024.

### PRD-023 — Audit host npm differs from the repository-pinned package manager

- **Classification / severity / confidence:** Maintainability concern / Informational / High.
- **Affected user or system:** Reproducible local/CI installs and lockfile changes.
- **Exact location:** root `package.json:4-8` (`packageManager`/engines); audit runtime.
- **Symbol/entity:** npm toolchain version.
- **Evidence:** Node was `v24.18.0` and passed the guard; npm was `11.16.0` while the repository declares npm `10.2.4`.
- **Failure sequence:** a contributor updates the lockfile or install tree using different npm resolution/metadata semantics.
- **Production impact:** possible noisy or divergent lockfile/artifact results; no direct runtime failure was confirmed.
- **Recommended fix:** enable Corepack or document/enforce the exact npm version in CI and contributor setup.
- **Regression tests:** clean `npm ci` with the pinned toolchain produces no lockfile diff and completes the canonical build.
- **Fix risk / side effects:** toolchain pin changes may require CI image updates.
- **Related findings:** PRD-007, PRD-016.

### PRD-024 — Documentation and deployment artifacts have drifted from current behavior

- **Classification / severity / confidence:** Maintainability concern / Informational / High.
- **Affected user or system:** Developers and release/incident operators.
- **Exact location:** `graphify-out/GRAPH_REPORT.md:1-14`; `CLAUDE.md:7,74,98,160,172`; `apps/backend/scripts/schedule-backup.ps1:2,24-25,44`; `apps/frontend/Dockerfile:1-13`; `vercel.json:5-13`; `apps/frontend/src/lib/api.ts:14-23`.
- **Symbol/entity:** architecture snapshot, backup schedule, deploy/runtime descriptions.
- **Evidence:** the graph artifacts were refreshed during this remediation slice, closing that stale-snapshot sub-item. Backup prose/output still says 03:00 while code schedules 08:00; container/frontend port and hosting assumptions differ from the Vercel production path; environment examples omit current integrations. `CLAUDE.md` calls this a two-app workspace even though the printer agent is a third deployable app, describes production HTTP as cross-origin although current `api.ts` plus `vercel.json` implement a same-origin API rewrite, and says controller uploads allow JPEG/PNG although current category/item/restaurant filters also accept WebP.
- **Failure sequence:** an operator follows stale instructions and validates the wrong topology, expects a backup at the wrong time or configures an obsolete runtime path.
- **Production impact:** slower, error-prone launch and incident response; no direct runtime defect from the documents alone.
- **Recommended fix:** make each artifact identify owner, environment and last-verified commit/date; regenerate architecture docs; reconcile or retire unused Docker paths; derive config/schedule documentation from executable definitions where possible.
- **Regression tests:** documentation link/config lint, scheduled-task assertion and release checklist requiring current commit/date.
- **Fix risk / side effects:** deleting apparently stale deployment paths may affect undisclosed users; confirm ownership before removal.
- **Related findings:** PRD-005, PRD-010, PRD-015, PRD-016.

## 10. Security and tenant-isolation assessment

**Result: no confirmed authentication bypass, cross-tenant data access or tracked production secret was found, but the residual safeguards below prevent a production approval.**

- Authentication uses bcrypt cost 10, short per-route throttles, CSRF protection for cookie flows, HTTP-only cookies, active/disabled/password-change checks, device-session versioning, restaurant state checks and impersonation handling. OAuth `returnTo` is origin-validated. JWT-protected controller families combine `JwtAuthGuard` with feature/super-admin/device checks as appropriate.
- The controller manifest covered every discovered route decorator. Intentional public groups were root/health, auth entry points, public menu/menu views, public feedback submission, guest reservation/redirect, payment session-token and signed provider callback/webhook endpoints, client-log ingestion, and device-enrollment verification. No management controller was found unintentionally public.
- Authenticated restaurant/menu/order/reservation/table/user/subscription/payment methods were traced to ownership/restaurant-ID checks or super-admin scope. Existing authorization/guard tests passed, including negative cases. A formal branch-by-branch proof was outside this static audit, so production penetration testing remains required.
- Stripe uses raw request body and signature verification with a production fail-closed path. Provider event keys and references have unique constraints. Guest payment operations use purpose-specific session tokens rather than accepting tenant identity from the request alone.
- Current upload controllers check ownership before storage, cap in-memory uploads at 5 MiB, accept JPEG/PNG/WebP MIME types, and use Sharp pixel limits. This differs from the older JPEG/PNG-only statement in `CLAUDE.md` and is recorded as documentation drift in PRD-024. Stored URL handling includes SSRF-oriented tests. Dependency risk PRD-004 and orphan cleanup PRD-021 remain.
- No `eval`, `new Function`, dangerous raw Prisma construction, or `dangerouslySetInnerHTML` use was found in application code. No non-example `.env` or obvious production credential was tracked. A development reset helper contains/logs a test password and must remain excluded from production runbooks/images.
- Residual security work: distributed throttling (PRD-012), production config contract (PRD-015), public Swagger decision (PRD-017), account recovery design (PRD-020), dependency patching (PRD-004), and independent dynamic tenant/abuse testing.

## 11. Data-integrity and concurrency assessment

- A clean PostgreSQL 17 database accepted all 51 migrations. Prisma status was current. The resulting schema contained 50 tables, 76 foreign keys and 178 indexes.
- Important invariants exist at the database layer: restaurant-scoped `clientOrderId` uniqueness, unique payment provider reference/Stripe intent/provider event key, unique payment allocation per payment/order item, and a partial unique index enforcing one open table session.
- Payment provider-event processing and critical payment/order state updates use transactions and uniqueness-based replay handling. Reservation booking has conflict/P2002 handling; reservation reminder claims use compare-and-swap.
- Translation jobs use database claims and stale-claim recovery, which is the right multi-instance pattern.
- The isolated concurrency test demonstrated that the force-open conflict was rejected, but its success path is currently obscured by PRD-008.
- Unresolved concurrency gaps: physical print delivery has no atomic lease or consumer dedupe (PRD-001); loyalty reminders lack a durable claim (PRD-003); public order creation lacks uniform idempotency and has post-commit side effects (PRD-011); realtime and throttling state can be instance-local (PRD-002/PRD-012).
- The pre-production database gate cannot be trusted until PRD-010 is fixed. Before launch, run it against a sanitized production-shaped database and add invariants for orphaned tenant IDs, impossible payment/order transitions, duplicated provider keys, overlapping sessions and stuck claims/jobs.

## 12. Payments assessment

**Static result: structurally strong, not launch-certified without sandbox/live end-to-end verification.**

- Reviewed core payment creation/allocation/settlement/refund/reconciliation services, session-token services, Stripe checkout/webhooks, Borica, ePay and myPOS provider adapters, restaurant/provider configuration and subscription Stripe webhooks.
- Stripe callback verification consumes raw body/signature and fails closed in production. Provider events are persisted/deduplicated, exact provider references are preferred, core updates use database transactions, and reconciliation-required events exist for ambiguous paths.
- Database uniqueness protects provider event replay, Stripe intent/provider reference duplication and repeated payment allocation. Refund paths include persisted attempts and reconciliation behavior rather than treating every upstream response as final.
- No code evidence of trusting a client-supplied paid flag or amount without authoritative server-side order/allocation calculation was found. Tenant/restaurant ownership checks surround staff payment operations; guest actions are scoped by signed session/order tokens.
- Remaining required manual proof: successful/failed/duplicate/out-of-order webhook for each enabled provider; redirect/callback tampering; partial and full refunds; provider timeout after local commit; currency/minor-unit rounding; split allocations; reconciliation dashboard; secret rotation; and accounting comparison to provider dashboards.
- Do not enable a provider in production merely because its adapter compiles. Each enabled provider needs a signed sandbox evidence pack, operational owner and alert/reconciliation runbook. PRD-004, PRD-011, PRD-013, PRD-015 and PRD-016 are payment-adjacent blockers.

## 13. Realtime/WebSocket assessment

- All 45 discovered channel names were inventoried in section 4. Join/leave handlers for restaurant, order, reservation, table-session, public-menu and restaurant-order rooms were reviewed for JWT, signed token, tenant/feature or public-room controls. Public room joins are bounded; printer agents use enrollment/device credentials and explicit rejection/ack channels.
- Room-scoped emissions cover order, assistance, menu availability, translation, reservation, table, bill/payment and printing changes. Polling fallback exists for some dashboard translation state, but not for every realtime workflow.
- The dominant production flaw is topology: PRD-002 allows silent in-memory fallback, while the deploy can scale. Session affinity helps a connected client but cannot route background jobs/webhooks to the instance holding its room.
- Print delivery adds an at-most/at-least-once ambiguity with physical side effects (PRD-001). The agent needs durable consumer idempotency regardless of broker choice.
- Staging must prove cross-instance join/emit, reconnect/rejoin, token eviction, Redis restart, rolling deploy, stale agent recovery, duplicate delivery and no cross-tenant room access.

## 14. Frontend reliability assessment

- Current production HTTP code uses same-origin `/api/v1` through the Vercel rewrite, while Socket.IO connects directly to the backend through `VITE_API_URL`. This supersedes the cross-origin-HTTP description in `CLAUDE.md` and is recorded in PRD-024. CSP, HSTS and other browser headers are present. The route/component inventory covered auth, dashboard, onboarding, POS, profile, staff, super-admin, legal, cart, menu, payment, reservations, subscription, tables, branding and shared UI.
- Frontend typecheck, lint and unit tests passed. However, statement/line coverage is roughly 39%, the critical browser suite mocks all backend calls, and the runner does not terminate (PRD-009/PRD-018).
- Socket production behavior depends on `VITE_API_URL`; the Vercel API rewrite does not establish a Socket.IO reverse proxy. This must be validated by configuration contract and deployed smoke test (PRD-015).
- The production build passed but emitted a 916.79 kB vendor chunk (274 kB gzip) and a 4,524 KiB PWA precache. This is not a blocker alone, but performance should be measured on mid-range mobile/slow networks and route splitting adjusted from evidence.
- Required manual/offline tests: first load, install/update, stale service worker, offline public menu/cart recovery, locale coverage, failed API/token refresh, payment redirect return, reconnect after backgrounding, accessibility/keyboard/screen-reader and low-memory mobile behavior.

## 15. Backend and API assessment

- Bootstrap applies Helmet, explicit CORS origins, CSRF, body-size limits, URI versioning, global DTO transformation/whitelisting, logging/request IDs and exception handling. Startup does not expose secrets in the reviewed code.
- Controller and service review found consistent feature, JWT, super-admin, device and tenant ownership boundaries. Public routes are deliberate and purpose-scoped as described in section 10.
- The API has strong database constraints and broad unit tests, but uniform request idempotency, durable post-commit side effects, distributed throttling, dependency readiness, graceful shutdown and strict production config need work (PRD-011 through PRD-015).
- Swagger is unconditionally exposed (PRD-017), unknown DTO properties are silently stripped (PRD-022), and canonical build/lint/e2e gates are red (PRD-006 through PRD-008).
- The shallow health response must not be treated as dependency readiness or a launch smoke result.

## 16. Production configuration assessment

**Result: not reproducible or fail-fast enough for production.**

- Runtime and build-time variable requirements are distributed across code and cloud state. The checked-in examples do not describe every Redis, payment, translation, push, weather, notification and frontend socket requirement (PRD-015).
- Redis is treated as optional even when deployment can scale (PRD-002). Rate limiting is also per instance (PRD-012).
- Cloud Run deploy uses mutable `latest` with session affinity and no verified dependency/readiness/smoke/rollback gate (PRD-016). Vercel install is not lockfile-strict.
- Secret manager ownership, rotation, least-privilege service accounts, network egress, DB TLS/pooling, Redis TLS/auth, R2 CORS/lifecycle, domain/DNS/TLS and Cloud Run min/max/concurrency were not verifiable locally.
- Before launch, produce a redacted manifest containing commit/image digest, service/revision, required variable names and feature state, secret version references, schema migration version, frontend build variables and external endpoint allowlist. Validate it automatically without printing secret values.

## 17. Test-quality and coverage gaps

- Strengths: 2,565+ automated tests passed across the three applications/root; backend coverage is comparatively healthy; no focused `.only`/`xit` tests were found; payment and tenant rules have substantial negative-path unit coverage; all migrations were exercised from empty state. Three database e2e files conditionally select `describe.skip` without a database URL, so CI must prove the URL is present and report zero conditional skips.
- Gaps: backend concurrency e2e fixture drift (PRD-008), browser teardown/mock-only integration (PRD-009/PRD-018), no two-instance Redis/throttle/scheduler test, no durable printer duplicate test, no real provider sandbox suite, no restore drill and no SIGTERM/readiness test.
- Coverage floors are low at the frontend and printer branch level and should not be used as the principal release argument.
- Add contract tests for frontend/backend DTOs, Socket.IO payloads and printer events; a Postgres+Redis production-build smoke suite; provider fakes that preserve signature/idempotency behavior; and deterministic clock/concurrency tests for every scheduled job.

## 18. Documentation drift

- `graphify-out/GRAPH_REPORT.md`, `graph.json`, and `manifest.json` were refreshed after the remediation changes. The report's commit field still identifies HEAD because the reviewed changes are uncommitted; the extraction itself includes the current working tree and is not deployment evidence.
- `CLAUDE.md` says the workspace has two apps although `apps/printer-agent` is a third deployable surface; it describes production API HTTP as cross-origin although current `api.ts`/`vercel.json` use a same-origin rewrite; and its JPEG/PNG controller statement omits current WebP acceptance.
- Backup schedule comments/output conflict with the actual 08:00 trigger.
- Environment examples do not match variables consumed by current integrations and frontend sockets.
- The frontend Docker/port assumptions and Vercel deployment path need an explicit supported/unsupported status.
- `CONTEXT.md`, ADR 0001 and controller/service comments were useful and often aligned with implementation, especially around offline POS conflicts and transactional constraints. They do not replace operational runbooks.
- Resolve PRD-024 by assigning owners and verification dates, and link the release, restore, payment-reconciliation, Redis-degradation, notification-failure and printer-incident runbooks from one production index.

## 19. Manual verification required

The following evidence must be produced in production-shaped staging; none should be checked off from static review alone:

1. Two backend instances, real managed Redis and PostgreSQL; cross-instance API/webhook/scheduler Socket.IO delivery and room isolation.
2. Real printer hardware: duplicate delivery, disconnect mid-print, agent restart, ACK loss, backend rolling deploy, paper/USB/network failure and recovery without double preparation.
3. Stripe and every enabled local provider sandbox: signature rejection, duplicate/out-of-order callbacks, timeout, refund, partial allocation, currency rounding and reconciliation.
4. Resend/SMS/VAPID/DeepL/weather/R2: valid, missing, rejected, throttled, timeout and outage cases with visible status, retry and alerts.
5. Auth/tenant penetration pass: IDOR across two tenants, token/session revocation, CSRF/CORS, OAuth return URL, device enrollment, public guest tokens, brute-force/distributed rate limiting and Swagger exposure.
6. Frontend production build on representative mobile/desktop browsers: PWA install/update/offline, locales, accessibility, payment return, websocket reconnect and performance budgets.
7. Load/soak: public menu, order bursts, websocket connections, translation queue, reservation/loyalty schedulers, DB pool and autoscaling.
8. Backup/PITR/restore drill into an isolated project plus timed RPO/RTO evidence; rollback one Cloud Run and one Vercel release.
9. Operations game day: Redis unavailable, database latency, payment-provider outage, print backlog, notification rejection and a bad migration/revision.

## 20. Prioritized remediation plan

### P0 — must fix before production

1. **Durable delivery remediation implemented locally; stage before closure:** PRD-001, PRD-003 and PRD-011 now use PostgreSQL claims/leases or scoped idempotency keys plus agent-side durable print dedupe. Complete coordinated backend/frontend/agent migration testing, real hardware/provider sandboxes, and two-instance staging before marking them resolved.
2. **Make the distributed topology explicit:** PRD-002, PRD-012 and PRD-014. Provision HA Redis, fail readiness/startup when required dependencies are absent, share throttles, and prove two-instance behavior and graceful shutdown.
3. **Patch runtime advisories next:** PRD-004 remains open at 15 High production-tree advisories. Upgrade in an isolated branch/container after the distributed-runtime harness exists, then run upload/socket/provider/router/load regression tests.
4. **Keep restored gates green:** PRD-006, PRD-007, PRD-008 and PRD-010 now pass locally; PRD-009 exits cleanly outside the process sandbox. Repeat all five in CI/production-shaped staging. Do not raise warning/timeout budgets or ignore verifier discrepancies.
5. **Build recovery and detection before launch:** PRD-005 and PRD-013. Define RPO/RTO/SLOs, create alerts/runbooks, prove backup restore, retain immutable deploy artifacts and record rollback evidence.
6. **Replace mutable deployment with gated promotion:** PRD-016, after steps 2, 4 and 5. Canary the exact digest, smoke production dependencies, then shift traffic.

### P1 — fix before general availability

1. Typed/conditional configuration schema and complete environment/build manifest (PRD-015), coordinated with Redis, providers and deployment changes.
2. Full-stack critical journeys and risk-based coverage expansion (PRD-018), including payment/printer/notification and tenant negative cases.
3. Reservation-provider timeout/cancellation and delivery-attempt alerts (PRD-019).
4. Secure self-service password recovery (PRD-020) only after notification reliability, rate limiting and telemetry are ready.
5. Restrict or disable production Swagger (PRD-017).

### P2 — fix soon after launch

1. Temporary/promoted logo upload lifecycle or orphan collection (PRD-021).
2. Plan strict rejection of unknown DTO fields with compatibility telemetry (PRD-022).
3. Enforce the pinned npm toolchain (PRD-023) and reconcile/regenerate documentation/deployment artifacts (PRD-024).

Dependency rule from the current state: coordinated delivery staging -> mandatory Redis/distributed-runtime tests -> dependency upgrades -> repeat green gates -> recovery/observability -> immutable canary deployment -> production-shaped smoke. Do not deploy the scheduler/realtime fixes before their two-instance and failure-injection tests exist.

## 21. Staging smoke-test checklist

Each test is staging-only unless explicitly promoted by the launch checklist. Use synthetic tenants, provider sandboxes and non-production destinations.

### STG-01 — Immutable deploy, readiness and termination (P0)

- **Prerequisites / roles:** Release operator; commit-tagged image digest; Vercel preview; two Cloud Run instances; isolated PostgreSQL and Redis; approved config manifest.
- **Exact actions:** deploy with no traffic; record digest/revision/build IDs; request liveness/readiness; temporarily deny Redis and then DB; restore each; start a 30-second request and send SIGTERM/roll revision.
- **Expected result:** readiness is false until required dependencies work, liveness follows its documented shallow policy, no traffic reaches an unready revision, and SIGTERM stops admission then drains/closes within the platform deadline.
- **Required data/logs:** deployment event, readiness transitions, request/release IDs, DB/Redis connection metrics, termination/drain timestamps and 5xx count.
- **Cleanup / safety:** restore dependency access, remove no-traffic revision after evidence capture, verify no production project/URL/secret was used. Never block production Redis/DB for this test.

### STG-02 — Authentication, authorization and tenant isolation (P0)

- **Prerequisites / roles:** Security tester; two synthetic tenant owners, manager/staff roles, super-admin test account, device token and public guest tokens.
- **Exact actions:** register/verify/login/logout/change password; exercise OTP/magic/Google/PIN as configured; replay/revoke sessions; exceed login limits across both instances; substitute every tenant A management resource ID into tenant B route requests; test CSRF/CORS/OAuth return URLs and device enrollment.
- **Expected result:** only intended public routes respond unauthenticated; every cross-tenant request is 403/404 without metadata leakage; revoked/expired tokens fail; one aggregate throttle applies across instances; CSRF/origin/return URL checks fail closed.
- **Required data/logs:** sanitized HTTP transcript, route/role/resource matrix, audit/security events, aggregate throttle keys and request IDs; no passwords/tokens in artifacts.
- **Cleanup / safety:** delete synthetic tenants/sessions/devices and revoke OAuth grants. Use non-real emails/phone numbers and staging callback origins only.

### STG-03 — Menu, translation, upload and public PWA (P1)

- **Prerequisites / roles:** Tenant owner; published and draft synthetic menus; R2 staging bucket with lifecycle; DeepL sandbox/test budget; mobile/desktop browsers.
- **Exact actions:** create/edit/bulk-update/publish categories/items/options; translate all; upload valid JPEG/PNG/WebP, wrong MIME, polyglot/oversized/high-pixel images; abandon one logo upload; scan QR; install/update PWA; go offline and return online in multiple locales.
- **Expected result:** ownership/features enforce correctly; invalid images fail before durable storage; processing stays bounded; translation has visible success/failure; draft data does not leak; public menu/PWA updates and recovers without stale unsafe state.
- **Required data/logs:** object keys/sizes, Sharp memory/latency, translation job/usage states, CSP/browser console, service-worker version and public API responses.
- **Cleanup / safety:** delete menu/test objects and confirm lifecycle handles abandoned temporary objects. Cap DeepL spend and never point tests at the production bucket/key.

### STG-04 — Order idempotency and table-session concurrency (P0)

- **Prerequisites / roles:** Public diner, POS staff and DB observer; synthetic menu/table; idempotency implementation enabled; two backend instances.
- **Exact actions:** submit identical public and POS create requests concurrently through different instances; drop the first response and retry; race force-open/table session operations; inject post-commit event failure.
- **Expected result:** one logical order/session per idempotency key, payload mismatch is rejected, database constraints remain valid, and a committed result can be replayed without duplicate order/ticket.
- **Required data/logs:** request/idempotency IDs, order/session rows, constraint/conflict logs, outbox/event rows and emitted event/print counts.
- **Cleanup / safety:** void/delete synthetic orders through approved staging tooling and restore injected event behavior. No real payment method or production table QR.

### STG-05 — Cross-instance realtime and Redis degradation (P0)

- **Prerequisites / roles:** Operator plus tenant/public/agent socket clients; two pinned backend instances behind normal routing; managed staging Redis.
- **Exact actions:** join each protected/public room family through instance A and trigger its event family through instance B; reconnect/rejoin; evict auth; roll one instance; restart Redis and test the declared outage policy.
- **Expected result:** authorized clients receive one event across instances, unauthorized/cross-tenant joins receive `roomError`/rejection, reconnect reconciles state, and required-Redis loss makes readiness fail rather than silently switching to memory.
- **Required data/logs:** socket IDs, instance/release IDs, room/join audit, Redis adapter metrics, event IDs/counts and reconnect timeline.
- **Cleanup / safety:** disconnect clients, remove test rooms/data and restore Redis. Use a dedicated staging Redis namespace/instance; never restart production Redis.

### STG-06 — Durable printer delivery (P0)

- **Prerequisites / roles:** Kitchen operator and release observer; staging restaurant/order; real non-production printer with marked paper; two backend schedulers; instrumented printer agent.
- **Exact actions:** emit one job; duplicate the socket frame; race both retry schedulers; disconnect after physical print before ACK; restart agent/backend; allow lease expiry; simulate paper/USB/network failure and recover.
- **Expected result:** one physical ticket per `jobId` under duplicate/ACK-loss paths, safe bounded retry after pre-print failure, durable status/attempt history and no cross-station/tenant delivery.
- **Required data/logs:** job/lease/attempt IDs, backend event counts, agent durable dedupe record, ACK timeline, printer output count/photo and alert state.
- **Cleanup / safety:** clearly mark/destroy test tickets, clear only test jobs/dedupe entries via supported tooling and restore printer connection. Never target a live kitchen printer.

### STG-07 — Payments, refunds and reconciliation (P0)

- **Prerequisites / roles:** Payment tester and finance/reconciliation observer; sandbox accounts/secrets for every enabled provider; synthetic orders in supported currencies.
- **Exact actions:** run success/decline/cancel/timeout; send invalid signature, duplicate and out-of-order callbacks; allocate/split where supported; perform partial/full refund; lose the client return; inject upstream success with local timeout and vice versa.
- **Expected result:** signatures/tokens fail closed, amounts/currency come from server state, each provider event applies once, final state is monotonic/valid, ambiguous cases enter reconciliation and no duplicate charge/refund occurs.
- **Required data/logs:** local payment/event/allocation/refund rows, provider sandbox IDs/dashboard export, signature result, request/release IDs and reconciliation events; redact payment/PII data.
- **Cleanup / safety:** refund/void all sandbox transactions, remove test provider config and reconcile every synthetic row. Production credentials and live payment methods are prohibited.

### STG-08 — Reservation, loyalty and notification scheduling (P0)

- **Prerequisites / roles:** Guest, tenant manager and operator; two schedulers; Resend/Twilio/SMS gateway test destinations; fixed clock; synthetic loyalty expiries/reservations.
- **Exact actions:** create/update/cancel/race reservations/table slots; run reservation and loyalty reminders concurrently; test missing credential, 4xx/5xx, hang/timeout and retry; then recover provider.
- **Expected result:** no overbooking, one durable claim/delivery per reminder, failed/non-accepted attempts are not marked sent, timeouts release workers, retries are bounded and provider recovery completes once.
- **Required data/logs:** reservation/claim/attempt rows, provider message IDs/test inbox, scheduler instance IDs, retry/dead-letter metrics and alerts.
- **Cleanup / safety:** cancel synthetic reservations, delete loyalty test data/messages where supported and reset fixed time. Only allowlisted test email/phone destinations.

### STG-09 — Failure injection and alert delivery (P0)

- **Prerequisites / roles:** On-call engineer and incident commander; dashboards/alerts/runbooks wired to staging; fault injection approved.
- **Exact actions:** induce Redis disconnect, DB latency/pool exhaustion, provider rejection/hang, payment reconciliation item, stale print job, failed backup and elevated 5xx/latency one at a time.
- **Expected result:** bounded application behavior, correct user-visible degradation, one actionable alert within its objective, accurate runbook link/ownership, no silent-success state and a clear recovery signal.
- **Required data/logs:** metric/trace/log screenshots or exports, alert/page timestamps, incident ticket, request/release IDs and recovery duration.
- **Cleanup / safety:** remove each fault and verify green recovery before the next. Use staging quotas/firewalls only; predefine abort thresholds.

### STG-10 — Frontend production build, accessibility and PWA (P1)

- **Prerequisites / roles:** QA/accessibility tester; deployed production frontend build connected to staging; agreed browser/mobile/network matrix.
- **Exact actions:** execute real-backend auth/menu/order/reservation/payment-return/POS flows; keyboard and screen-reader pass; throttle network/CPU; install PWA, update across a release, use offline, expire auth and reconnect sockets.
- **Expected result:** journeys complete without mocked APIs, focus/names/errors are usable, stale service worker does not corrupt state, offline mode is explicit, reconnect reconciles and performance budgets pass.
- **Required data/logs:** Playwright trace/video, browser console/network HAR with secrets removed, accessibility report, Core Web Vitals/bundle/precache and service-worker versions.
- **Cleanup / safety:** delete synthetic data/sessions and uninstall test PWA profiles. Payment actions remain sandbox-only; redact HAR/cookies.

### STG-11 — Clean-checkout release gates (P0)

- **Prerequisites / roles:** CI/release operator; clean checkout at reviewed commit; pinned Node/npm; isolated DB/Redis; no running process locking Prisma binaries.
- **Exact actions:** run node/raw guards, all typechecks/lints/tests/coverage, canonical root build, backend e2e, production-build browser e2e, dependency audit, migration deploy/status and fixed read-only verifier; enforce a total timeout.
- **Expected result:** every command exits 0, produces no timeout/false green, backend warning budget is met without increase, no focused/skipped test, and no unaccepted High production advisory remains.
- **Required data/logs:** exact commands/cwd/versions/exit codes, CI artifacts, coverage/audit JSON, migration/verifier output and image digest.
- **Cleanup / safety:** destroy only the named ephemeral DB/Redis/runner resources and retain redacted artifacts. No production URL or secret may be present.

### STG-12 — Backup restore and application rollback (P0)

- **Prerequisites / roles:** Database operator, release operator and incident commander; encrypted off-host backup/PITR; isolated restore project; current/previous immutable revisions; approved RPO/RTO.
- **Exact actions:** restore latest backup/PITR to isolated DB; run migration/invariant/count checks and critical reads; canary current revision; inject smoke failure; roll traffic to previous backend/frontend; reconcile writes in the window.
- **Expected result:** restored data meets RPO and integrity checks within RTO, production is untouched, failed canary never receives broad traffic, rollback is deterministic and compatibility/reconciliation limits are documented.
- **Required data/logs:** backup object/version/checksum/age, restore start/end, invariant report, revision/digest/traffic history, smoke/rollback timestamps and reconciliation report.
- **Cleanup / safety:** independently verify restore target IDs before any destructive command; destroy the isolated restore environment after evidence retention. Never run restore against production or overwrite an existing database.

## 22. Production launch checklist

- [ ] All P0 findings closed with linked code, tests and staging evidence; no unaccepted Critical/High advisory or finding.
- [ ] Reviewed commit, lockfile, image digest, Cloud Run revision and Vercel deployment ID recorded; artifacts are immutable.
- [ ] Database backup/PITR freshness confirmed; restore drill date, RPO/RTO and rollback owner recorded.
- [ ] Migration reviewed as backward-compatible with old/new revisions; pre-production verifier is green and trustworthy.
- [ ] Production config schema passes; secret versions/rotation owners, origins, API/socket URLs and provider feature flags verified without exposing values.
- [ ] Redis HA, DB pool/TLS, Cloud Run min/max/concurrency/termination and Vercel domain/TLS settings reviewed.
- [ ] Dashboards/alerts/on-call and payment, printer, notification, Redis and rollback runbooks tested.
- [ ] Canary/no-traffic revision passes readiness and critical smoke; traffic shift occurs in stages with explicit rollback thresholds.
- [ ] Payment/provider dashboards and printer agents monitored during launch; support and restaurant communication channels staffed.
- [ ] Post-launch observation window completes with error/latency/reconciliation/queue/print metrics inside thresholds.

## 23. Rollback and incident-readiness checklist

- [ ] Identify the exact previous backend revision/image digest and frontend deployment; rehearse one-command or documented traffic rollback.
- [ ] Define rollback triggers for 5xx/latency, DB errors, Redis disconnect, payment reconciliation, duplicate/stuck print, notification failure and client crash rate.
- [ ] Ensure database changes are expand/contract compatible; document when application rollback is unsafe and forward-fix is required.
- [ ] Verify backup/PITR and logical dump targets are off-host, encrypted, monitored and restorable without touching production.
- [ ] Assign incident commander, communications, database, payments and printer/provider roles with current contacts/escalation paths.
- [ ] Preserve request/release/provider-event IDs and redacted logs; prohibit secrets, raw payment data and unnecessary PII in incident artifacts.
- [ ] Provide kill switches for optional providers/schedulers/features without silently marking work successful.
- [ ] After rollback, reconcile orders/payments/refunds/print jobs/reminders created during the affected window before resuming normal traffic.
- [ ] Run a blameless review and convert every manual recovery step into a tested runbook/automation item.

## 24. Final go/no-go criteria

**Current decision: NO-GO.** Production may become a GO only when all of the following are simultaneously true:

1. PRD-001 through PRD-005 are closed or independently re-audited to a non-blocking severity with concrete evidence; no open Critical or High finding remains.
2. PRD-006 through PRD-010 commands are green from a clean checkout using the pinned toolchain, and their exit codes accurately represent results.
3. Two-instance Postgres+Redis staging proves cross-instance realtime, distributed throttling, order idempotency, scheduler claims, printer dedupe and graceful rollout/termination.
4. No unaccepted High production dependency advisory remains; each exception has reachability analysis, compensating controls, owner and expiry.
5. Every enabled payment and notification provider passes signed sandbox failure/replay tests and has reconciliation/alert evidence.
6. A recent isolated restore drill meets approved RPO/RTO, and immutable canary/rollback rehearsal succeeds.
7. Production config validation, readiness, telemetry, alerts, on-call ownership and the launch/rollback checklists are signed by engineering and operations/security owners.

## Appendix A — Commands executed

Section 5 is the authoritative automated-command log: it records the exact command, working directory, numeric exit/result, trustworthiness and non-proof boundary for every baseline check. The two browser invocations were:

| Exact invocation | Outer harness | Result |
| --- | --- | --- |
| `npm.cmd run test:e2e -w apps/frontend` from repository root | Tool process timeout `300000 ms` | Exit 124 after assertions passed; teardown hung |
| `npm.cmd run test:e2e -w apps/frontend -- --workers=1` from repository root | Tool process timeout `180000 ms` | Exit 124 after assertions passed; teardown hung |

Additional exact repository/environment diagnostics, all from repository root unless stated:

| Exact command or read-only graph request | Result |
| --- | --- |
| `git status --short` | Exit 0; pre-existing changes plus this report recorded in section 1 |
| `git rev-parse HEAD` | Exit 0; `8671e0c830efbe756491e52a2c5064e6459f3d5f` |
| `node --version` | Exit 0; `v24.18.0` |
| `npm.cmd --version` | Exit 0; `11.16.0` |
| `rg -n "(describe|it|test)\.(skip|only)|\b(xit|xdescribe)\b" apps scripts` | Exit 0; found three DB-dependent `describe.skip` aliases and no focused `.only`/`xit` test |
| `rg -n "eval\(|new Function|dangerouslySetInnerHTML" apps` | Exit 1/no match |
| `rg -n --hidden -g '!node_modules/**' -g '!.git/**' -g '!package-lock.json' "(sk_live_[A-Za-z0-9]+|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|postgres(?:ql)?://[^[:space:]]+:[^[:space:]]+@)" .` | Exit 0; matches were inspected as examples, CI/local test credentials, masked UI placeholders or the checked-in Borica test fixture—not a production credential |
| `get_architecture(project="F-PROGRAMING-QR_Digital_Menu-main", aspects=["all"])` | Read-only graph inventory used for packages, entry points, routes and boundaries |
| `query_graph(project="F-PROGRAMING-QR_Digital_Menu-main", query="MATCH (c:Channel) RETURN DISTINCT c.name AS channel ORDER BY channel")` | Returned all 45 channel names listed in section 4 |

Exact isolated-database lifecycle (credentials are disposable local test values):

```powershell
docker desktop start
docker run --name qrmenu-audit-postgres-20260802 -e POSTGRES_USER=ci -e POSTGRES_PASSWORD=ci -e POSTGRES_DB=ci_test -p 64321:5432 -d postgres:17
$env:DATABASE_URL='postgresql://ci:ci@localhost:64321/ci_test?schema=public'; npx.cmd prisma migrate deploy --schema apps/backend/prisma/schema.prisma
$env:DATABASE_URL='postgresql://ci:ci@localhost:64321/ci_test?schema=public'; npx.cmd prisma migrate status --schema apps/backend/prisma/schema.prisma
$env:DATABASE_URL='postgresql://ci:ci@localhost:64321/ci_test?schema=public'; npx.cmd ts-node scripts/verify-preproduction-readonly.ts
docker ps -a --filter "name=^qrmenu-audit-postgres-20260802$" --format "{{.ID}}|{{.Names}}|{{.Status}}"
docker stop qrmenu-audit-postgres-20260802
docker rm qrmenu-audit-postgres-20260802
docker desktop stop
```

Migration deploy, status and verifier exited 0 with the trust limitations in section 5. The named audit container was verified, stopped and removed. Docker Desktop accepted the stop request; its CLI remained in `stopping` state when final status collection encountered a local Docker logging/config permission error.

The exact `npm.cmd audit --omit=dev --json` refresh attempt could not reach the advisory endpoint inside the sandbox. Its escalated retry was policy-rejected before execution, so no result was claimed. File reads, graph-assisted symbol/snippet/call-path inspection and route-manifest review are catalogued by scope in Appendix B rather than represented as automated pass/fail commands.

## Appendix B — Files and subsystems reviewed

| Area | Reviewed scope |
| --- | --- |
| Repository/standards | `PRE-PROD_VERIFICATION.md`, `CLAUDE.md`, `CONTEXT.md`, ADR 0001, printer `AGENTS.md`, root/workspace manifests and current Git diff/status |
| Backend entry/config | `main.ts`, `app.module.ts`, global guards/pipes/filters/interceptors/logging, runtime policy, Redis adapter, health and Prisma lifecycle |
| Backend feature modules | adapters, assistance, auth, client-logs, common, consent, dashboard, events, feedback, health, help-content, loyalty, menu/import/views, orders, payment, platform-settings, print-station, prisma, push, reservations, restaurants, storage, subscription, super-admin, table-zones, tables, translation, users and users-data |
| HTTP authorization | All discovered controllers/routes; controller-wide/method guards, public decorators, tenant/ownership and purpose-token service boundaries; representative negative tests |
| Realtime | All 45 channels, room join/leave policy, emission helpers, Redis adapter, printer agent enrollment/job/ack/reconnect |
| Data | Prisma schema, 51 migrations, clean deploy/status, table/FK/index inventory, order/session/payment/provider-event/allocation constraints, verifier |
| Payments | Core/session/settlement/reconciliation/refund services; Stripe, Borica, ePay, myPOS; subscription Stripe; signatures, raw body, replay and tenant boundaries |
| External services | Redis, R2/S3/Sharp, DeepL/glossary/quota, Resend, SMS, VAPID/web-push, weather, OAuth and payment providers |
| Scheduled/background | Print retries, reservation reminders/table release, loyalty expiry/reminders, translation claims/reaping and table/status maintenance paths |
| Frontend | Pages: Dashboard, legal, onboarding, POS, profile, staff, super-admin; component areas: auth, brand/branding, cart, dashboard, landing, legal, menu, payment, POS, reservations, staff, subscription, tables and UI; context/hooks/lib/services/types/utils, PWA/Vite/Playwright |
| Printer agent | App, screens, services, store, enrollment/socket/print path and tests |
| Operations | CI, deploy script, Vercel, Dockerfiles/compose, env examples, backup/restore/scheduler scripts, graph/docs and production checklists |

Route-manifest authorization summary (all discovered controller route entries were included):

| Controller/route family | Public boundary or authenticated ownership basis | Result |
| --- | --- | --- |
| App, health, client logs | Deliberately public operational/intake routes; payload/abuse limits reviewed | Public as designed; readiness and distributed abuse gaps are PRD-014/PRD-012 |
| Auth | Register/verify/login/OAuth/OTP/PIN/CSRF public; `me`, password, logout and impersonation transitions use JWT/session or one-time exchange code | No accidental tenant management exposure found |
| Public menu, menu views, feedback, public reservations/redirect | Restaurant/public identifiers and purpose/action tokens; management/list routes separated behind JWT/feature/ownership checks | No cross-tenant route-entry bypass found |
| Categories, items, details, options, import/audit/bulk menu | JWT plus feature/restaurant ownership; upload ownership checked before storage | Pass at route/service entry; PRD-004/PRD-021 residual |
| Orders and assistance | Public order/table credentials or staff JWT; restaurant/order/table ownership resolved server-side | Pass at route/service entry; idempotency/side-effect gap PRD-011 |
| Payment core/session/providers/subscription | Signed webhook/raw body, guest session token or staff JWT plus restaurant/provider ownership; super-admin scope where applicable | Pass statically; provider sandbox proof still required |
| Reservations, tables and table zones | Guest action token for public actions; JWT/feature plus restaurant/table/zone ownership for staff operations | Pass at route/service entry |
| Restaurants, staff, users, users-data, consent, loyalty | JWT with owner/manager/super-admin role and restaurant/resource ownership; self-data routes bind authenticated user | Pass at route/service entry |
| Dashboard, platform settings, help content, menu views | JWT/feature/restaurant scope or super-admin-only mutation; intended public reads separated | Pass at route/service entry |
| Print stations, device enrollment and push | Restaurant owner/manager plus feature for management; one-time enrollment/device credential for agent; authenticated user/device scope for push | Pass at route/service entry; physical delivery gap PRD-001 |
| Super-admin | Super-admin guard/role and explicit tenant target; impersonation uses exchange workflow | No ordinary-user access path found |

## Appendix C — Findings index

| ID | Severity | Classification | Area | Title | Status |
| -- | -------- | -------------- | ---- | ----- | ------ |
| PRD-001 | High | Confirmed defect | Printing/concurrency | A print job can be physically printed more than once | Open — P0 blocker |
| PRD-002 | High | Missing safeguard | Realtime/scaling | Production silently degrades to instance-local realtime state | Open — P0 blocker |
| PRD-003 | High | Confirmed defect | Notifications/schedulers | Reminder records can claim success without delivery and duplicate | Open — P0 blocker |
| PRD-004 | High | Probable risk | Dependencies/security | High advisories are installed on production request paths | Open — P0 blocker |
| PRD-005 | High | Missing safeguard | Recovery/operations | Database/release recovery is not demonstrated | Open — P0 blocker |
| PRD-006 | Medium | Confirmed defect | CI/lint | Backend lint exceeds warning budget | Open — P0 gate |
| PRD-007 | Medium | Confirmed defect | Build | Canonical build and safe fallback are unreliable | Open — P0 gate |
| PRD-008 | Medium | Confirmed defect | Backend e2e | Concurrency e2e has a stale gateway fixture | Open — P0 gate |
| PRD-009 | Medium | Confirmed defect | Frontend e2e | Browser critical journeys hang after assertions | Open — P0 gate |
| PRD-010 | Medium | Confirmed defect | Database verification | Verifier exits successfully on migration mismatch | Open — P0 gate |
| PRD-011 | Medium | Probable risk | Orders/idempotency | Committed order can be returned failed and retried | Open — P0 |
| PRD-012 | Medium | Missing safeguard | Authentication | Throttling is per process | Open — P0 |
| PRD-013 | Medium | Missing safeguard | Observability | No actionable production telemetry/alert path | Open — P0 |
| PRD-014 | Medium | Missing safeguard | Runtime lifecycle | Health is shallow and shutdown hooks unused | Open — P0 |
| PRD-015 | Medium | Missing safeguard | Configuration | Production configuration is incomplete/weakly validated | Open — P1 |
| PRD-016 | Medium | Missing safeguard | Deployment | Deployment is mutable without gated promotion/rollback | Open — P0 |
| PRD-017 | Medium | Missing safeguard | API exposure | Swagger is exposed unconditionally | Open — P1 |
| PRD-018 | Medium | Missing test | Test strategy | Coverage thresholds overstate critical integration evidence | Open — P1 |
| PRD-019 | Medium | Probable risk | Reservation notifications | Resend/Twilio calls lack explicit timeout | Open — P1 |
| PRD-020 | Medium | Missing safeguard | Account recovery | No ordinary-user forgot-password flow | Open — P1 |
| PRD-021 | Low | Confirmed defect | Storage | Abandoned logo uploads leave orphan objects | Open — P2 |
| PRD-022 | Low | Maintainability concern | API validation | Unknown DTO properties are silently stripped | Open — P2 |
| PRD-023 | Informational | Maintainability concern | Toolchain | Audit npm differs from repository pin | Open — P2 |
| PRD-024 | Informational | Maintainability concern | Documentation | Docs/deployment artifacts have drifted | Open — P2 |
