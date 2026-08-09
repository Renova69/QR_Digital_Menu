# Production Readiness Audit — Real Reverification Results

**Assessment date:** 2026-08-09  
**Repository:** `F:\PROGRAMING\QR_Digital_Menu-main`  
**Reviewed branch:** `main`  
**Reviewed HEAD:** `65cda6f9394ea279f288321ee83fabe5bb19ef11`  
**Local Git state at inspection:** `main` was three commits ahead of the locally recorded `origin/main` and the working tree already contained tracked and untracked changes.  
**Assessment:** **NO-GO for production**  
**Change policy:** Review and verification only. No application source, configuration, migration, deployment, or Git changes were made as part of the audit. This report is the only requested write.

---

## 1. Executive conclusion

The current repository is not ready for a production release. Two independently reproduced P0 blockers can break a clean CI or production database deployment:

1. Six required `PlatformSettings` columns exist in the Prisma schema and are read by runtime code, but no committed migration creates them.
2. Prisma now requires `DIRECT_URL`, while the committed CI workflow does not declare it before running Prisma generation and migrations.

Several P1 findings also remain: identity-linking can create duplicate verified phone ownership under concurrency, payment reconciliation monitors can report false success to Sentry, feedback can select an older payment instead of the active checkout, notification payload PII has no retention path, browser E2E is stale and hangs, printer tests cannot start, the full backend E2E gate is unreliable, and dirty working-tree deployments can be tagged as if they came from an immutable commit.

There has also been meaningful improvement since the older audit. Production Swagger is disabled, global DTO validation rejects unknown properties, provider HTTP deadlines exist, deployment uses SHA-tagged images/no-traffic revisions/smoke checks/rollback, and Sentry is wired in the backend and frontend. Those improvements do not close the current release blockers.

No architectural rewrite is indicated. The confirmed issues can be addressed through targeted migrations, configuration enforcement, database constraints/transaction semantics, monitoring result propagation, selection-order fixes, retention policy, test maintenance, and deployment guardrails.

---

## 2. Scope and evidence policy

This report revalidated:

- `PRE-PROD_VERIFICATION.md` in full.
- `PRODUCTION_READINESS_AUDIT.md` in full, including its addendum, the original PRD-001 through PRD-024 findings, command evidence, appendices, and final index.
- Current committed changes and the current uncommitted working tree.
- Recent deployment, legal/settings, Sentry, notification, identity-linking, feedback, payment, Redis, health, and test-harness changes.
- Static code paths using graph-assisted discovery and direct source inspection.
- Local executable gates.
- Fresh-database migration behavior using an isolated disposable PostgreSQL 17 container.

Evidence classifications used below:

- **Confirmed defect:** Proven directly from current code and/or reproduced dynamically.
- **Confirmed gate failure:** The required command failed or did not terminate reliably.
- **Evidence gap:** Code may be improved, but production readiness still requires staging, hardware, recovery, or live-system proof.
- **Resolved:** The original audit statement is no longer true in the current code.
- **Not live-verified:** Repository wiring was inspected, but production/dev external state was not queried.

The temporary PostgreSQL audit container was stopped and removed after testing. Existing application containers and services were not modified. The development server was not started.

---

## 3. P0 production blockers

### P0-1 — Required `PlatformSettings` fields have no migration

**Classification:** Confirmed defect / production database blocker  
**Related audit items:** PRD-010, PRD-015, PRD-024  
**Primary evidence:**

- `apps/backend/prisma/schema.prisma:1232-1248`
- `apps/backend/src/platform-settings/platform-settings.service.ts`
- `apps/backend/prisma/migrations/`
- `scripts/verify-preproduction-readonly.ts`

The current Prisma model contains six persisted legal/settings fields that are absent from every committed migration:

- `dpaEnabled`
- `refundPolicyEnabled`
- `msaEnabled`
- `dpaContent`
- `refundPolicyContent`
- `msaContent`

Runtime platform-settings code reads these fields. A production database created only from repository migrations therefore does not match the Prisma Client contract.

#### Dynamic reproduction

1. Started an isolated local PostgreSQL 17 database whose name ended in `_test`.
2. Supplied both `DATABASE_URL` and `DIRECT_URL` to that disposable database.
3. Ran all 53 committed migrations successfully.
4. Ran Prisma migration status; Prisma exited successfully and reported that the database schema was up to date.
5. Queried `information_schema.columns` for the six fields; zero rows were returned.
6. Queried the missing legal columns directly; PostgreSQL failed with a missing-column error.
7. Ran `scripts/verify-preproduction-readonly.ts`; it exited successfully and did not detect the drift.

#### Impact

- A clean CI/staging/production database can pass migration status but fail when Prisma selects `PlatformSettings`.
- Legal pages and administrative settings can return database errors after deployment.
- The repository's custom verification script currently gives false confidence for this omission.
- Existing developer databases may hide the issue if their schema was changed outside committed migrations.

#### Required correction and acceptance evidence

- Add a committed migration that creates all six columns with correct defaults/nullability.
- Apply the migration to a brand-new empty PostgreSQL database.
- Verify all six columns through `information_schema` and through the real `PlatformSettingsService` read path.
- Extend the pre-production verifier so an omitted required column cannot report green.
- Confirm migration status and application reads against both a fresh database and a copy of the current production schema.

### P0-2 — Required `DIRECT_URL` is missing from CI

**Classification:** Confirmed defect / CI and deployment blocker  
**Related audit item:** PRD-015  
**Primary evidence:**

- `apps/backend/prisma/schema.prisma:22`
- `.github/workflows/ci.yml:16-21`
- `.github/workflows/ci.yml:55-61`

The Prisma datasource now declares:

```prisma
directUrl = env("DIRECT_URL")
```

The committed CI environment declares `DATABASE_URL` and `CONCURRENCY_DATABASE_URL`, but no `DIRECT_URL`, before executing:

- `npx prisma generate`
- `npx prisma migrate deploy`

#### Dynamic reproduction

Prisma was run with a clean dotenv path and the same declared CI variables. It failed during schema validation with:

```text
P1012: Environment variable not found: DIRECT_URL
```

When `DIRECT_URL` was supplied explicitly, Prisma generation/migration behavior proceeded.

#### Impact

- A clean CI run cannot reach the test, build, or migration gates as declared in the workflow.
- Undeclared host secrets may hide the failure in one environment but do not make the workflow reproducible.
- The same problem can affect deployment/migration jobs that only supply `DATABASE_URL`.

#### Required correction and acceptance evidence

- Declare `DIRECT_URL` in CI using the local PostgreSQL service URL.
- Document and validate it in the production configuration contract.
- Run Prisma generation and migration deploy in a clean job with no undeclared environment inherited from a developer machine.
- Add a configuration-contract test that fails with an actionable message when a required Prisma URL is absent.

---

## 4. P1 confirmed findings

### P1-1 — Identity linking can replace an existing identity and race on phone ownership

**Classification:** Confirmed defect  
**Primary evidence:**

- `apps/backend/src/auth/auth.service.ts:1112-1125`
- `apps/backend/src/auth/auth.service.ts:1149-1171`
- `apps/backend/src/auth/auth.service.ts:1200-1213`
- `apps/backend/prisma/schema.prisma:25-31`
- `apps/backend/src/users/users.service.ts:66-68`

The feature is described as adding a missing second identity, but `loadLinkableCustomer` only checks account existence, enabled status, and the `CUSTOMER` role. It does not verify that the target email/phone field is missing or is an allowed placeholder. An authenticated customer can therefore replace an already-real email or phone with a newly verified value.

The collision protection is also insufficient for concurrent phone claims:

1. Two authenticated customers request and verify the same phone at nearly the same time.
2. Both transactions execute `assertIdentityFree` before either update commits.
3. `User.phone` has no unique constraint.
4. Both transactions can commit the same phone.
5. Subsequent OTP login calls `findFirst({ where: { phone } })`, making account selection nondeterministic.

The current tests use mocks/sequential collision cases and do not run the phone claim against real PostgreSQL concurrency.

**Required targeted correction:** prevent replacement unless explicitly designed; enforce uniqueness at the database level or use an equivalent serialization-safe identity table/claim; add real PostgreSQL concurrency coverage; verify deterministic phone login.

### P1-2 — Sentry payment cron monitors can report success when reconciliation failed

**Classification:** Confirmed monitoring defect  
**Primary evidence:**

- `apps/backend/src/payment/providers/borica-checkout.service.ts:134-164`
- `apps/backend/src/payment/providers/borica-checkout.service.ts:333-343`
- `apps/backend/src/payment/providers/stripe-checkout.service.ts:1141-1146`
- `apps/backend/src/payment/providers/stripe-checkout.service.ts:1276-1287`

BORICA catches the initial query failure, increments `summary.errors`, logs, and returns a normal summary. It also catches each payment failure and returns normally after the loop. Stripe refund/payment reconciliation similarly logs per-item failures and resolves normally.

`@SentryCron` observes the fulfilled outer promise, so Sentry can receive a successful monitor check-in even when:

- the initial candidate query failed;
- every payment/refund candidate failed; or
- the run completed with a non-zero error count.

This is particularly important because the newly configured email alerts are intended to detect these reconciliation failures.

**Required targeted correction:** propagate an unsuccessful monitor outcome whenever the run cannot perform its core work or crosses an explicit error threshold. Preserve per-item continuation if desired, but make the final monitor status reflect the accumulated failures. Add monitor tests for “all candidates fail” and “initial query fails.”

### P1-3 — Feedback invitation can select an older successful payment over the active checkout

**Classification:** Confirmed logic defect  
**Primary evidence:** `apps/backend/src/feedback/feedback.service.ts:125-137`

When no explicit `paymentId` is supplied, the code performs two independent lookups:

1. latest payment with `status: SUCCEEDED`;
2. only if no success exists, latest payment with `status: PENDING`.

This prioritizes status over recency. In a split/partial/retry session, an older successful payment can mask a newer hosted checkout that is still pending. The confirmation flow can verify the wrong payment/visit and issue review access prematurely.

**Required targeted correction:** select the newest eligible payment across allowed states, or require/pass the exact payment ID throughout the confirmation flow. Add a regression test with an older success plus a newer pending checkout.

### P1-4 — Notification delivery stores full PII/content without a retention path

**Classification:** Confirmed data-retention gap  
**Primary evidence:**

- `apps/backend/prisma/schema.prisma:303-315`
- `apps/backend/src/notifications/notification-provider.ts:18-24`
- `apps/backend/src/users-data/retention.service.ts:10-14`

`NotificationDelivery.payload` persists JSON that can contain:

- recipient email address or phone number;
- email subject;
- text body;
- HTML body;
- SMS/WhatsApp body.

The retention service only defines duties for verification tokens, order PII anonymization, and menu-view pruning. Notification deliveries are retained until some unrelated tenant deletion path removes them; no age-based pruning, payload redaction, or documented retention period was found.

**Required targeted correction:** define a business/legal retention period; redact body/recipient fields after operational usefulness expires or delete old deliveries; preserve only minimal delivery metadata needed for audit/support; add retention tests and operator documentation.

### P1-5 — Reservation reminder audit wording does not match implemented semantics

**Classification:** Confirmed audit/behavior mismatch  
**Primary evidence:** `apps/backend/src/notifications/notification-delivery.service.ts:279-297`

The audit addendum states that only provider acceptance advances source markers. Current code deliberately counts both `ACCEPTED` and permanently `FAILED` delivery legs as terminal and stamps `reminderSentAt` once no leg remains in flight.

The code comment explicitly redefines `reminderSentAt` as “every attempted channel reached a terminal state,” not “the guest was reached.” This avoids reselecting an undeliverable reminder every 30 minutes, but the field name and audit wording can mislead operators and reporting.

**Required decision:** either accept/document the terminal-state meaning and expose delivery success separately, or change the data model/behavior so `reminderSentAt` represents actual provider acceptance. This is a semantic decision, not a request for architectural replacement.

### P1-6 — Canonical browser gate is stale and does not terminate reliably

**Classification:** Confirmed gate failure  
**Primary evidence:**

- `apps/frontend/src/components/ui/LoginDialog.tsx:225`
- `apps/frontend/e2e/critical-journeys.spec.ts:235`

The current registration UI disables account creation until legal terms are accepted. The critical registration journey was not updated to accept those terms.

Observed result:

- four browser journeys passed;
- registration timed out;
- the command did not exit within the 180-second bound.

This supersedes the audit addendum's claim that 5/5 passed and exited cleanly.

**Required targeted correction:** update the journey to accept required legal terms; ensure teardown always closes servers/browser processes; make the exact root command exit reliably in CI and on the supported Windows developer environment.

### P1-7 — Dirty source can be deployed under a commit-looking image tag

**Classification:** Confirmed release-integrity defect  
**Primary evidence:** `deploy.ps1:93-114`

The deployment script reads `git status --porcelain` and emits only a warning. It then derives the image and revision tags from `git rev-parse HEAD` while building the current source directory.

If tracked or untracked files affect the build, the deployed image can differ from the tagged commit while still carrying `sha-<HEAD>` and `rev-<HEAD>` labels. The current inspected working tree was dirty, so this is an immediately relevant failure mode.

**Required targeted correction:** fail deployment on a dirty working tree, or build from a clean checked-out commit/archive and record the resulting image digest. Do not label mutable disk contents as an immutable commit artifact.

### P1-8 — Backend E2E gate is not deterministic under the full run

**Classification:** Confirmed gate reliability failure; product defect not yet proven  
**Primary evidence:** `apps/backend/test/preproduction-concurrency.e2e-spec.ts`

Full isolated-PostgreSQL run:

- 5 of 6 suites passed;
- 30 of 31 tests passed;
- the translation enqueue/lazy-translation concurrency invariant failed after a foreign-key error left the expected queue empty;
- the suite cleanup hook exceeded its 30-second timeout.

The exact failed invariant was rerun alone and passed: 1/1 test, with 18 other tests skipped. Therefore the evidence proves order/load/flakiness in the canonical full gate, but does not yet prove the translation implementation is consistently defective.

**Required targeted correction:** identify shared-state, cleanup, timing, or resource contention causing the full-suite-only failure; run the entire six-suite command repeatedly against a fresh isolated database; require clean teardown and zero residual rows/processes.

---

## 5. P2 and operational findings

### P2-1 — Sentry alert provisioning is create-only, not convergent

**Primary evidence:**

- `scripts/sentry-alerts.ps1:147-163`
- `scripts/sentry-alerts.ps1:181-197`
- `scripts/sentry-alerts.ps1:346-359`

Issue and metric alert rules are skipped whenever a same-name rule already exists. The repository corrected the backend latency query to include `span.op:http.server`, but rerunning the script will not repair an already-created production rule with the older broad query.

**Required targeted correction:** compare desired/current definitions and update drifted rules, or version names and explicitly retire the old rule. Add a dry-run diff mode and record deployed rule IDs/definitions.

### P2-2 — Sentry release/source-map upload is not explicitly correlated or gating

**Primary evidence:** `apps/frontend/vite.config.js:127-140`

The frontend plugin does not specify an explicit application release. During verification the configured upload invoked Sentry CLI with `--release undefined`. Network failure prevented upload, but the frontend build still completed and the task was treated as successful.

Consequences:

- production events may not correlate to uploaded source maps;
- upload failure may be invisible to release gates;
- a token inherited from local environment can unexpectedly activate network behavior during a build.

**Required targeted correction:** derive one explicit release from the immutable application commit/build ID; use the same value in frontend/backend Sentry initialization and source-map upload; decide whether production release uploads are gating; disable uploader telemetry if not desired.

Live Sentry projects, alert rules, monitor state, and email delivery were not queried during this repository-only review. The finding concerns what the current scripts/build guarantee, not a claim that a specific live rule is presently wrong.

### P2-3 — Printer test installation is inconsistent

**Classification:** Confirmed gate failure  
**Primary evidence:** `apps/printer-agent`

Printer typecheck and lint pass, but `npm ls` reports `expo-modules-core` while no physical resolved package exists where Jest expects it. `jest-expo` fails during preset setup.

Observed result:

- 5 test suites failed to load;
- 0 tests executed;
- each failure reported `Cannot find module 'expo-modules-core'`.

This supersedes the audit's previous printer test pass.

### P2-4 — Backend lint gate is red and warning budgets are nearly exhausted

Backend lint result:

- 1 error;
- 1,147 warnings;
- configured maximum: 1,133 warnings;
- error: `prefer-const` at `apps/backend/src/notifications/notification-delivery.service.spec.ts:44`.

Frontend lint exits successfully but has 451 warnings against a maximum of 455, leaving four warnings of headroom. Printer lint passes with zero warnings for its configured files.

### P2-5 — Complete workspace build is not a reliable gate

The root `npm run build` passed, but it explicitly excludes `@qr-menu/documentation`. The printer workspace declares no build task, so the successful Turbo run reported only backend/frontend tasks.

`npm run build:all` included backend, frontend, printer-agent, and documentation, but did not terminate within ten minutes. Before timeout:

- backend compiled successfully;
- frontend compiled successfully;
- English, Bulgarian, and Romanian documentation builds completed;
- Sentry upload failed non-fatally with release `undefined`;
- no overall Turbo success was returned.

This is a release-harness concern even though the individual compilers shown above succeeded.

### P2-6 — Production health and shutdown behavior remain shallow

The health endpoint still returns a shallow OK response rather than proving database/Redis/dependency readiness. `PrismaService.enableShutdownHooks` has no discovered caller. A container can therefore appear healthy while required dependencies are unavailable, and graceful shutdown behavior is not fully wired/proven.

### P2-7 — Missing Redis configuration remains fail-open

Redis behavior has improved when `REDIS_URL` is supplied: production connection failure now aborts startup. However, absence of `REDIS_URL` still logs a warning and uses:

- in-memory Socket.IO adapter;
- per-instance in-memory throttling.

That is not safe for a multi-instance production deployment because realtime fan-out and abuse counters are instance-local.

### P2-8 — Recovery evidence remains incomplete

Deployment mechanics improved, but no current evidence proves:

- an off-host backup can be restored;
- measured restore time meets RTO;
- backup age/data loss meets RPO;
- payment/notification/print state remains consistent after restore;
- operators can execute the documented recovery without developer knowledge.

### P2-9 — Ordinary-user password recovery remains absent

No self-service forgot-password/reset-password flow for an ordinary user was found. The super-admin tenant reset endpoint and identity-linking work do not replace authenticated/verified recovery for a customer who has lost access.

### P2-10 — Abandoned logo-upload lifecycle remains unproven

The original PRD-021 concerns restaurant branding uploads that are stored but never attached or later abandoned. Ownership/MIME/size/pixel protections exist, but no temporary-object promotion lifecycle or periodic orphan collector was confirmed.

### P2-11 — npm toolchain remains inconsistent with the repository declaration

Observed versions:

- Node: `v24.18.0` — passes the repository Node guard.
- npm: `11.16.0`.
- repository `packageManager`: `npm@10.2.4`.

The Node guard does not enforce npm parity. Lockfile/install behavior can therefore differ between contributors and CI.

### P2-12 — The audit document contains mixed-time evidence

`PRODUCTION_READINESS_AUDIT.md` contains an addendum describing repaired gates while older sections and the final index still describe those same gates as failed/open. It also contains evidence from older commits and predates or incompletely reflects:

- the fourth `apps/docs` workspace;
- the latest legal settings fields;
- current identity-linking work;
- current feedback visit UI/API work;
- current Sentry scripts and monitor behavior;
- current printer dependency state;
- current lint/test counts.

Audit evidence should be versioned by reviewed commit and date, with one authoritative current status per finding.

---

## 6. Executable gate results

| Gate | Fresh result | Interpretation |
|---|---|---|
| Node version guard | PASS | Node `v24.18.0` is accepted. Does not enforce npm parity. |
| Canonical `npm run build` | PASS | Backend/frontend tasks pass. Docs are explicitly excluded; printer has no build task. |
| `npm run build:all` | TIMEOUT at 10 minutes | Backend/frontend/docs compiled, but no overall successful termination. |
| Backend full unit suite | PASS | 157 suites, 2,152 tests. |
| Frontend full unit suite | PASS | Vitest completed successfully; warnings include deprecated React test `act` usage. |
| Changed backend tests | PASS | 4 suites, 134 tests covering auth, feedback, and payment-secret changes. |
| Changed frontend tests | PASS | 2 files, 14 tests covering identity-link UI and review inbox. |
| Printer tests | FAIL | 5 suites could not load because `expo-modules-core` is missing; 0 tests ran. |
| Backend E2E against isolated PostgreSQL | FAIL | 5/6 suites and 30/31 tests passed; concurrency suite failed and cleanup timed out. |
| Failed backend invariant rerun alone | PASS | Proves the full-run failure is order/load sensitive; does not close the gate. |
| Browser E2E | FAIL/TIMEOUT | 4 passed; registration did not accept required terms; command did not exit within 180 seconds. |
| Backend lint | FAIL | 1 error and 1,147 warnings, above the 1,133 maximum. |
| Frontend lint | PASS at budget | 451 warnings of 455 allowed. |
| Printer lint | PASS | 0 warnings for configured inputs. |
| Frontend TypeScript | PASS | `tsc --noEmit`. |
| Printer TypeScript | PASS | `tsc --noEmit`. |
| Fresh Prisma migrations with both URLs | PASS, but misleading | All 53 migrations apply; required legal columns remain absent. |
| Prisma migration status | FALSE GREEN | Reports up to date despite missing runtime-required columns. |
| Pre-production read-only verifier | FALSE GREEN | Exits 0 despite missing runtime-required columns. |
| CI-like Prisma run without `DIRECT_URL` | FAIL | Reproduced `P1012` before normal CI gates. |
| `git diff --check` | PASS | No whitespace-error finding. |
| Fresh dependency advisory lookup | NOT VERIFIED | External advisory request was not authorized; existing audit counts must not be treated as current. |

---

## 7. PRD-001 through PRD-024 reconciliation

| ID | Current status | Real result / remaining requirement |
|---|---|---|
| PRD-001 | Mitigated, evidence pending | Durable print work exists. Still requires real printer, restart, reconnect, duplicate-delivery, and two-instance staging proof. |
| PRD-002 | Open | Missing `REDIS_URL` still falls back to single-instance realtime. Configured Redis failure now fails production startup. |
| PRD-003 | Open / wording incorrect | Durable notification delivery exists. Provider staging remains. `reminderSentAt` currently means all legs terminal, not provider acceptance. |
| PRD-004 | Open / count stale | Lockfile changed. Current advisory numbers were not externally refreshed and old counts are not current evidence. |
| PRD-005 | Open | SHA/canary/rollback improved. Off-host restore, RPO, RTO, and recovery drill remain unproven. |
| PRD-006 | Open | Backend lint fails; frontend warning budget is nearly exhausted. |
| PRD-007 | Exact root gate resolved, broader gate unreliable | Canonical root build passes but excludes docs. `build:all` timed out. |
| PRD-008 | Open | Full backend E2E is red/flaky despite the failed invariant passing alone. |
| PRD-009 | Open | Browser registration journey is stale and teardown does not reliably terminate. |
| PRD-010 | Open / escalated | Custom verifier misses the new omitted migration and reports false green. |
| PRD-011 | Locally mitigated, staging pending | Order idempotency safeguards exist; coordinated duplicate/concurrency staging proof remains. |
| PRD-012 | Open when Redis absent | Distributed throttling exists only when Redis is configured. |
| PRD-013 | Reclassified | “No Sentry” is obsolete. Remaining work: truthful cron status, convergent alert provisioning, explicit releases, source-map gate decision. |
| PRD-014 | Open | Health is shallow and Prisma shutdown-hook wiring is not demonstrated. |
| PRD-015 | Open / P0 | `DIRECT_URL` creates a clean-CI failure and config remains incompletely enforced. |
| PRD-016 | Improved, not closed | Immutable-looking SHA tags, no-traffic deploy, smoke and rollback exist; dirty disk contents can still be tagged as HEAD. |
| PRD-017 | Resolved | Swagger is disabled when `NODE_ENV=production`. |
| PRD-018 | Open | Browser journeys remain limited/API-mocked and the canonical gate is red. |
| PRD-019 | Resolved | Reservation email/SMS provider paths now enforce HTTP deadlines. |
| PRD-020 | Open | No ordinary-user self-service forgotten-password recovery. |
| PRD-021 | Open | Abandoned branding upload cleanup/promotion lifecycle remains unproven. |
| PRD-022 | Resolved | Global validation now uses `forbidNonWhitelisted: true`. |
| PRD-023 | Open | Local npm `11.16.0` differs from repository pin `10.2.4`. |
| PRD-024 | Open | Audit/docs/deployment evidence mixes commits and does not describe one authoritative current state. |

---

## 8. Corrected or obsolete statements from the older audit

The following older claims should not be carried forward unchanged:

1. **“No Sentry/telemetry” is obsolete.** Backend/frontend Sentry and alert/monitor scripts now exist. The remaining issues concern correctness and operability.
2. **“Swagger is public in production” is resolved.** Swagger setup is conditional on non-production execution.
3. **“Unknown DTO properties are stripped but accepted” is resolved.** Global validation forbids non-whitelisted properties.
4. **“Provider requests have no deadlines” is resolved for the reviewed reservation email/SMS paths.**
5. **“Deploy uses mutable `latest` without canary/rollback” is substantially obsolete.** SHA tags, no-traffic deployment, smoke checking and rollback exist. Dirty-tree artifact identity remains open.
6. **“Redis connection failure always silently degrades” is only partly current.** A configured Redis failure now aborts production startup; omission of `REDIS_URL` still silently selects in-memory behavior after a warning.
7. **The prior backup schedule mismatch is no longer the main issue.** Restore evidence and recovery objectives remain the relevant gap.
8. **Previous passing lint/test/browser/printer counts are stale.** Fresh results in Section 6 supersede them.
9. **Previous dependency-advisory counts are stale.** No new count is claimed here.
10. **The current custom migration verifier is not sufficient evidence of schema parity.** It passed while six required columns were absent.

---

## 9. Production exit criteria, in order

### Release-blocking corrections

1. Commit and verify the missing `PlatformSettings` migration.
2. Supply and enforce `DIRECT_URL` in CI, staging, deployment, and production configuration.
3. Prove a clean database created only from committed migrations can boot and read legal/platform settings.
4. Make deployment reject dirty source or build from a clean immutable checkout.
5. Restore green backend lint, printer tests, full backend E2E, and browser E2E gates.

### High-priority correctness and monitoring

6. Make phone identity ownership concurrency-safe and prevent unintended identity replacement.
7. Make Stripe/BORICA cron monitor outcomes fail when reconciliation fails.
8. Select the correct active/newest payment for feedback invitation.
9. Define and implement notification payload retention/redaction.
10. Reconcile `reminderSentAt` meaning with business reporting and documentation.
11. Make Sentry rule provisioning update drift and use an explicit release across runtime and source maps.

### Required production evidence

12. Demonstrate Redis-backed multi-instance realtime and throttling.
13. Complete a real off-host restore drill and record measured RPO/RTO.
14. Run payment, notification, order-idempotency, and printer failure/recovery scenarios in staging.
15. Validate live Sentry releases, source maps, monitors, alert-rule queries, email routing, and failure notifications.
16. Run a clean pinned-toolchain install/build/test with no developer environment inherited.
17. Publish a single commit-scoped production checklist and supersede contradictory historical audit statuses.

---

## 10. Final decision

**Decision: NO-GO.**

The missing database migration and undeclared required Prisma URL are sufficient independently to block production. The red printer/browser/backend-E2E/lint gates, identity-linking race, misleading Sentry cron success, feedback payment-selection issue, notification retention gap, and dirty deployment identity reinforce the decision.

Reassess only from a clean immutable commit after the P0 corrections are merged and the exact failing gates are rerun. Do not treat a passing migration status or the current custom verifier as proof of schema parity until their missing-column blind spot is corrected.
