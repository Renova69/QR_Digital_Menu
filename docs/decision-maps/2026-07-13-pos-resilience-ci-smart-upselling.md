# POS Resilience, CI, and Smart Upselling Decision Map

This map supersedes the assumptions in [the July 9 CI and upselling plan](../superpowers/plans/2026-07-09-ci-and-upselling.md). That plan's core features have since landed; this map focuses on the remaining production gaps.

## #1: What Is Already Built?

Blocked by: none
Type: Grilling

### Question

Which parts of PWA support, CI automation, and context-aware upselling are already present at the current HEAD?

### Answer

Resolved from the graph and code. The frontend already installs an inject-manifest service worker and precaches build assets. The POS preserves an editable draft in `sessionStorage`, but menu/table data and submitted orders are not stored in IndexedDB and there is no replay queue. The backend order API has no client idempotency key, so blind retries can create duplicate kitchen orders.

GitHub Actions already installs from the lockfile, starts PostgreSQL, deploys migrations, runs backend unit coverage, frontend type checking and coverage, and builds both apps. It does not run the backend e2e suites, and merge blocking still depends on GitHub branch protection outside the workflow file.

AUTO upselling already uses a 30-day sales window and restaurant-local MORNING, LUNCH, EVENING, LATE_NIGHT, and WEEKEND boosts. It currently stores these signals in `MenuItem.tags`, which is also treated as customer-facing dietary data. No weather context or weather-failure policy exists.

## #2: How Complete Must Offline Table Service Be?

Blocked by: #1
Type: Grilling

### Question

Must a waiter be able to open an empty table and submit its first order while offline, or is offline mode limited to adding orders to a table session that was already opened online?

### Answer

Resolved on 2026-07-13: support the full empty-table flow. A waiter may select an empty table, build a cart, and submit its first order with no network connection.

The device records one immutable queued POS order with the real restaurant and table IDs, a stable client order ID, and the Table Session Expectation observed at submission time: the current session ID or explicitly no open session. It does not invent a server table session or session token. On reconnect, the backend may create a session only when the device expected an empty table and the table is still empty, or reuse the exact open session the device expected. Any different session state follows the conflict policy in ticket #8. The device may report the submission as queued, but never as received by the kitchen until the backend acknowledges it.

## #3: What Is the Exactly-Once Sync Contract?

Blocked by: #2
Type: Prototype

### Question

What client queue state machine, backend idempotency constraint, session dependency handling, retry policy, and conflict UX prevent both lost orders and duplicate kitchen tickets?

### Answer

Resolved on 2026-07-13 by the [offline POS sync contract prototype](../prototypes/2026-07-13-offline-pos-sync-contract.md).

Persist each immutable submission in IndexedDB before clearing the cart, using `queued`, leased `syncing`, `needs_attention`, and `synced` states. One worker retries indefinitely with capped backoff, preserves FIFO within each table, pauses for reauthentication, and only marks `synced` after receiving the server order ID.

POS sends a stable `clientOrderId`, `restaurantId`, table CUID, and Table Session Expectation. After staff/restaurant authorization, the backend compares a canonical payload hash under a unique `(restaurantId, clientOrderId)` key. A matching replay returns the original result; a changed payload is a `409`. One transaction verifies the session and menu preconditions, reuses or creates the session only as permitted by ticket #8, creates the order, and writes a durable dispatch event. Concurrent duplicate requests reread the winner.

This makes order creation effectively exactly-once. Websocket and printer delivery remain at-least-once and require idempotent consumers. The existing inline websocket/print side effects are not durable enough and the printer agent does not yet deduplicate completed job IDs.

## #4: What Must Block a Merge?

Blocked by: #1
Type: Grilling

### Question

Which deterministic checks represent the complete merge gate for this monorepo?

### Answer

Resolved from the current scripts: lockfile install, Prisma generation, migration deploy against disposable PostgreSQL, Prisma raw-query guard, backend unit tests with coverage, backend e2e suites, frontend type checking, frontend tests with coverage, and production builds. The workflow should use cancellation for superseded runs and least-privilege GitHub permissions. Branch protection must require the resulting `verify` check.

Continuous deployment is intentionally outside this ticket until a deployment target, environment promotion policy, secrets owner, smoke check, and rollback path are named.

## #5: How Should Recommendation Signals Be Modeled?

Blocked by: #1
Type: Grilling

### Question

Should dietary labels, sales popularity, time context, and weather suitability share one tag list and one multiplier?

### Answer

Resolved: no. Keep dietary tags customer-facing and introduce a separate upsell vocabulary. Preserve recent sales as the base score; apply bounded, explainable boosts for active contexts; exclude unavailable items; and retain deterministic ranking when context data is absent. Weather must enrich ranking, never decide whether the menu endpoint succeeds.

## #6: Which Weather Boundary Is Reliable Enough?

Blocked by: #5
Type: Research

### Question

Which provider, location source, cache duration, normalized weather states, timeout, rate limit, and stale-data fallback meet restaurant reliability and privacy needs?

### Answer

Fog. Research a server-side provider adapter after the offline contract is fixed. The scoring engine should consume normalized states such as COLD, HOT, RAIN, and CLEAR rather than provider-specific payloads.

## #7: What Is the Safe Delivery Sequence?

Blocked by: #3, #4, #6, #8, #9
Type: Grilling

### Question

How should the work be sliced so every merge is deployable and observable?

### Answer

Frontier outline: harden CI first; add backend order idempotency before any client replay; add IndexedDB cache and queue with visible sync status; test outage/reconnect and conflict paths; separate upsell tags; then add weather behind cached fallback and a restaurant-level feature switch. Finalize after tickets #3 and #6 expose their constraints.

## #8: How Are Reconnect Conflicts Resolved?

Blocked by: #3
Type: Grilling

### Question

When an offline first order reconnects after the table, menu, staff session, or restaurant state changed on the server, which cases may sync automatically and which require staff attention?

### Answer

Resolved on 2026-07-13 using optimistic-concurrency and idempotency guidance. Never silently drop, duplicate, reroute, attach, reopen, or reprice a queued order.

Every queued order carries its Table Session Expectation plus a snapshot of stable menu/option IDs and integer-cent prices. The backend compares those preconditions atomically before creating the Server Order:

- The expected open session still being open, or an expected-empty table still being empty, may sync automatically. A closed/paid/replaced session, an unexpected new session, or a disabled/deleted table returns `409 TABLE_SESSION_CHANGED` and becomes `needs_attention`.
- Unavailable/deleted items and removed or invalid option choices return `409 MENU_CHANGED`. Any unit-price or option-modifier difference, with no rounding tolerance beyond exact integer cents, returns `409 PRICE_CHANGED` with the current server quote. Cosmetic menu changes may sync automatically.
- Expired authentication returns `401`, pauses the whole queue, and retries the unchanged intent after reauthentication. Revoked staff access, suspended restaurant ordering, or a disabled POS capability returns `403` and requires manager attention.
- A payment already in progress temporarily pauses that table's FIFO queue and may retry with backoff while the expected session remains open. If payment completes or the session changes, the result becomes `TABLE_SESSION_CHANGED`.
- Network failures, `429`, and retryable `5xx` responses remain queued and retry the identical payload and client order ID. Reusing that ID with changed parameters remains an idempotency conflict.

The conflict screen shows the original intent beside current table and quote state. Explicitly accepting a new price, attaching to the current session, or moving tables creates a replacement immutable intent with a new client order ID and a link to the superseded intent; discarding records the staff resolution. The original idempotency key is never repurposed.

This policy is recorded in [ADR 0001](../adr/0001-offline-pos-conflict-preconditions.md).

## #9: What Is the Physical Kitchen Delivery Guarantee?

Blocked by: #3
Type: Prototype

### Question

How do the backend dispatcher and printer agent prevent a duplicate paper ticket when printing succeeds but the print acknowledgement is lost?

### Answer

Fog. The current agent prints every received `print:job` before sending its acknowledgement and stores no completed job IDs. Resolve the retention window and recovery UX for a durable agent-side job ledger, paired with unique backend print jobs per `(orderId, printStationId)`. Physical I/O cannot be made exactly-once by the order API alone.
