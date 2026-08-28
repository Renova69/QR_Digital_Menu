# P3-2 — Cross-call request budgets

Implementation: complete in this change. Review, merge, deployment, and manual
release verification: pending. No migration, environment change, or live database
operation is required by this change.

## Contract

One server-owned **25-second** deadline starts before body parsing and guards.
Cloud Run's configured request limit is 30 seconds. There are no client headers
that can extend the budget. `AsyncLocalStorage` carries one monotonic deadline
and cancellation signal through the foreground request. A later call or retry
gets the time remaining, not a new 25 seconds. Existing shorter provider limits
and explicit cancellation signals still apply.

Middleware owns the deadline response, including a guard that never completes.
The HTTP-only interceptor ends the handler subscription and prevents starting a
handler after guards have already exhausted the budget. Normal completion and
client disconnection cancel remaining foreground calls and remove listeners.
WS/RPC processing is not assigned an HTTP budget.

A deadline returns **504 / `REQUEST_DEADLINE_EXCEEDED`** and a request id. The
message explicitly says the operation may still complete. Sentry receives one
timeout event tagged `subsystem=request-budget`, without request bodies or
credential material. Cancellation fallout is not reported a second time.

## Transport coverage

| Path                                        | Enforcement                                                                                                                                                           |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resend, SMS gateway, Twilio                 | Existing fetch helper merges provider and request signals, including response-body consumption and pool queueing                                                      |
| DeepL translation/glossaries, BORICA status | Signal supplied at each Axios call; DeepL retry waits and subsequent attempts use the same budget                                                                     |
| Stripe payments and subscriptions           | Supported fetch-client adapter, isolated bounded pool, signal on every SDK attempt; per-attempt timeout stays active through body consumption, including outside HTTP |
| R2 uploads, deletions, pagination           | Abort signal supplied to every SDK `send`; existing pool/connection limits retained                                                                                   |
| Remote image import                         | Native HTTP signal; IP pinning, host validation, size cap, and shorter timeout unchanged                                                                              |
| Google token/profile requests               | Signal added at `oauth`'s shared transport seam; real SDK transport regression test guards this internal compatibility seam                                           |

Stripe retry counts, idempotency keys, request payloads, and reconciliation are
unchanged. Aborting the connection does **not** mean a provider cancelled a
payment. Do not automatically replay a timed-out mutation with a new key.

## Background ownership

`withoutRequestBudget` exits only this deadline context; it does not remove auth,
tenant, or Sentry context. It is used at explicit work-ownership boundaries:

- Persisted menu-translation worker kicks continue after the enqueue response.
- Accepted order-print routing/retries and recorded PIN-security alerts/pushes
  continue independently. Web Push is only called by that background alert path
  and retains its existing provider timeout.
- Weather refresh is shared through the in-flight cache; one caller cannot abort
  another caller's refresh. Its own short provider timeout remains in place.
- Superseded-glossary cleanup remains best-effort after the replacement is saved.
- Cron jobs start outside HTTP context and retain their existing provider bounds.

A cancelled foreground glossary lookup must not mark glossary support absent in
the process-wide cache or persist a provider-failure cooldown for other callers.

## Limits and rollout

This is **cooperative cancellation**, not transaction rollback. It cannot undo
committed database/provider work, forcibly interrupt Prisma queries or Redis
commands, or pre-empt CPU work blocking Node's event loop. Database consistency
continues to depend on existing transactions, idempotency, and durable workflows.
No request timeout may trigger a database reset, ledger rewrite, or data restore.

Merge after green exact-SHA CI and review. Deploy from clean updated `main` using
the guarded backend script; no frontend dependency or schema change. Afterward:

1. Confirm serving SHA, readiness, Redis, and ordinary login/OAuth behavior.
2. Smoke-test demo/test-mode checkout and image upload; preserve existing payment
   reconciliation/idempotency behavior if an outcome is uncertain.
3. Check timeout telemetry for a recurring affected route before increasing any
   budget. Do not deliberately stall live providers to manufacture a timeout.

## Automated evidence

Local verification: **204 backend suites / 2,907 tests passed**, including full
coverage gates (88.88% lines, 75.13% branches). Backend type checking and Nest/SWC
build passed. Lint: zero errors, 640 existing warnings within the unchanged cap.
Gitleaks 8.28.0 with CI's directory-scan flags passed; migration safety passed.
Dependency manifests/lockfiles and the database schema are unchanged. Local
tests used an existing lockfile-matched dependency installation; clean-install
Linux CI and its disposable-database E2E suite remain required before merge.

Unit tests cover deadline arithmetic, interleaved context isolation, shorter
provider timeouts, cleanup, cold Observable subscription, exhausted guards, and
background detachment. Local HTTP tests exercise hung guards/handlers, disconnect,
late rejections, one-shot telemetry, and telemetry failure. Real local transports
exercise fetch queues and bodies, Axios, Stripe idempotency/retries/bodies, R2/S3,
and the Google OAuth transport seam. They use only loopback and fake credentials.

The Smithy HTTP-only test path uses a normal Node child process because its
dynamic `node:http` import is incompatible with Jest's default VM. Neither the
production SDK nor global Jest flags are changed to accommodate that harness.
