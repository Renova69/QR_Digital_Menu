# Offline POS Orders Require Explicit Preconditions

Status: Accepted on 2026-07-13

Queued POS Orders carry the Table Session Expectation and an immutable snapshot of stable item and option IDs with integer-cent prices. The backend creates a Server Order only when the session expectation still matches and the current menu quote is unchanged; otherwise it returns a structured `409` Sync Conflict that the POS can present for staff resolution. Network and rate-limit failures retry the identical intent, authentication expiry pauses for sign-in, and any action that changes the table, session, items, options, or price creates a replacement intent with a new client order ID. This favors correct billing and kitchen routing over silent availability when business state changed, while retaining automatic recovery for transport failures.

## Consequences

The order API must validate session and menu preconditions in the same transaction as order creation, return machine-readable conflict codes with current state, and keep idempotency payloads immutable. The POS needs a conflict review flow and must never silently attach, reopen, reroute, or reprice an offline order.

## References

- [RFC 9110: 409 Conflict](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.5.10)
- [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- [Azure optimistic concurrency guidance](https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-implementation#use-etags-to-support-optimistic-concurrency)
