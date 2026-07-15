# Offline POS Sync Contract Prototype

## Question

Can a persisted client queue, a restaurant-scoped idempotency key, atomic table-session creation, and durable dispatch prevent lost orders and duplicate kitchen tickets when requests or acknowledgements disappear?

## Method

A throwaway in-memory state machine modeled the staff device, server orders, open table sessions, a dispatch outbox, and a deduplicating kitchen consumer. The scripted run forced a lost HTTP acknowledgement after commit, a lost kitchen acknowledgement after receipt, and reuse of one idempotency key with a different payload. The runner was deleted after this contract was captured.

## Observations

| Scenario | Result |
| --- | --- |
| First order for an empty table while offline | One queued intent; no invented server session |
| Response lost after server commit | Retry returned the existing order; one session, one order, one outbox event |
| Kitchen acknowledgement lost after receipt | Outbox replay was deduplicated; one logical kitchen receipt |
| Same client order ID with changed payload | Server rejected it as `IDEMPOTENCY_PAYLOAD_MISMATCH` |

## Validated Contract

### Device queue

- Generate `clientOrderId` once, before accepting the submission locally. Persist the immutable request in IndexedDB before clearing editable cart lines.
- Persist `queued`, `syncing`, `needs_attention`, and `synced`. A `syncing` entry is a lease, not a terminal state; startup or lease expiry returns it to `queued`.
- Run one sync worker. Preserve FIFO order for each table. A `needs_attention` entry blocks later orders for that table, while unrelated tables may continue.
- Trigger sync on startup, reconnect, foregrounding, and a capped periodic retry while the POS is open. Background Sync may help but cannot be the only trigger.
- Retry network failures, timeouts, `408`, `429`, and `5xx` with capped exponential backoff and jitter. Never discard after a maximum attempt count. Pause the worker for reauthentication on `401` or `403`. Map non-retryable business conflicts to `needs_attention`.
- Show `queued` separately from kitchen acknowledgement. Only a backend response containing the server order ID changes the entry to `synced`.

### Order command

- Offline-capable POS requests carry `clientOrderId`, `restaurantId`, and the stable table CUID. They do not require or invent a table-session token.
- Authenticate the staff member and verify restaurant access before looking up an idempotency key.
- Canonicalize and hash the material request payload on the server. Store `clientOrderId` and the hash on `Order` with a unique constraint on `(restaurantId, clientOrderId)`.
- A matching replay returns the original order and session identifiers without recreating side effects. The same key with a different hash returns `409 IDEMPOTENCY_PAYLOAD_MISMATCH`.
- In one database transaction: reuse or create the open table session, create the order, and create one durable order-dispatch record. A concurrent unique-key loser rereads and returns the winner.

### Kitchen delivery

- Order creation can be effectively exactly-once. External delivery is at-least-once and must be made harmless through stable event/job IDs and idempotent consumers.
- Websocket consumers upsert by server order ID. Print-job creation needs uniqueness per `(orderId, printStationId)`.
- The printer agent currently prints before acknowledging and does not persist completed job IDs. Therefore a lost print acknowledgement can still produce duplicate paper. Agent-side durable job-ID deduplication is a separate required decision and implementation.

## Current Integration Gaps

- `OrdersService.create` performs websocket emission and print routing after its order transaction instead of creating a durable dispatch record in that transaction.
- `PrintJob` has no `(orderId, printStationId)` uniqueness constraint.
- The printer agent has no persisted completed-job ledger.
- `PosContext` stores only an editable `sessionStorage` draft; it has no immutable IndexedDB submission queue.
