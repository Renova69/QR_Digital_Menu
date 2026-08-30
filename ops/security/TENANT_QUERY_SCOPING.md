# P3-4 — Tenant-scoped database queries

Status (29 Aug 2026): **IMPLEMENTATION COMPLETE — review and release pending.**
PR #64 merged the orders, assistance and feedback slice. The P3 close-out branch
integrates the management slice and finishes payment/session, menu-import and
translation-override query scoping. P3-3 remains complete; this work changes no
route inventory or authorization contract. RLS is evaluated below, not enabled.

## This slice

The route guard authorizes a request before a service runs. An id-only service
write can still use an outdated authorization result if the resource's restaurant
or the actor's assignment changes between that check and the write.

Keep the existing interfaces, permissions, business checks and transactions.
`restaurantMemberWhere(userId)` supplies one small, typed predicate for the
existing **actual owner OR any assigned account** contract. It is not a
manager-only policy, role bypass or replacement for the route guard. Missing
principals fail before Prisma can discard an undefined filter.

| Operation                        | Query boundary now scoped                                                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Order detail                     | Order id plus current restaurant membership, before loading items                                                                             |
| Order status/cancellation        | Compare-and-swap includes id, captured restaurant id, membership and original status; transaction readback keeps the same tenant/member scope |
| Assistance detail/resolve/delete | Member-scoped read, then captured restaurant id and current membership on update/delete                                                       |
| Feedback list/summary            | Restaurant access lookup and every payload/count/aggregate query include membership; explicit restaurant id and existing filters remain       |
| Feedback visit                   | Feedback lookup includes membership; linked session read includes both captured restaurant id and membership                                  |

Order cancellation still requires OWNER/MANAGER through the existing checks.
Its state machine, loyalty reversal and transaction boundary are unchanged.
A failed claim produces 409 before loyalty work or success events. A missing
scoped transaction readback also produces 409 inside the transaction, so its
claim is rolled back rather than returning a partial success.

Assistance update/delete map only Prisma `P2025` (the scoped row no longer
matches) to 404. Other database errors propagate. No success event is emitted
on either failure. Scoped reads treat a non-visible row as missing; existing
HTTP guard denial behavior and service defense-in-depth checks remain.

Public QR/order/feedback creation, payment tokens, list tenant-selection rules,
bulk-order status semantics, response fields and route policies are unchanged.
Order/assistance lists and bulk-order operations already have tenant predicates;
they are not rewritten in this slice.

## Verification

- Regression-first: the tightened expectations and race cases failed against
  the old code (16 failing checks); the four focused suites now pass 190 tests.
- Query assertions pin ownership OR assignment, captured tenant ids, existing
  status CAS, list filters and all feedback aggregate/count predicates.
- Modeled races cover an order moving to another restaurant owned by the same
  actor, assignment removal before the claim, and lost membership before readback.
- Tests pin no loyalty reversal/events on losing claims, 404/409 handling and
  propagation of unrelated database failures.
- These are mocked service/query-contract tests, not a live PostgreSQL
  concurrency or RLS test. Predicates apply at each statement's database
  snapshot; this does not lock membership for the whole HTTP request.
- Full close-out backend: 222 suites / 3,661 tests. Backend and frontend builds
  pass; lint has zero errors within the existing warning caps.
- The production dependency audit and all 26 database-safety policy tests pass.
  GitHub CI/review and the batched release remain separate gates.

## Close-out scope

1. Menu and tenant-management writes retain their stricter owner/manager and
   restaurant-status predicates through the final Prisma operation.
2. Payment/session and cash-request operations carry the authorized restaurant
   into settlement/reporting queries while preserving provider claims,
   idempotency, webhook and token-vs-staff contracts.
3. Menu import and translation overrides constrain source and destination rows
   to the authorized restaurant. Public, account-owned, admin-only, provider-
   callback and opaque-token paths keep their separate authorization contracts.

No P3-4 implementation slice remains. Review, CI and release verification are
still required before calling the work deployed.

## RLS evaluation

Decision for the current development phase: continue explicit query scoping;
do not enable RLS as a switch in this code-only PR. RLS deployment would be a
separate reviewed architecture/database change, not a prerequisite for this slice.

- PostgreSQL superusers and `BYPASSRLS` roles bypass policies; table owners
  normally do too. Enabling RLS alone does not establish protection for the
  application's actual database role.
  [PostgreSQL row security](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)
- Supabase's Prisma setup example itself grants `BYPASSRLS`. That is a reason
  to verify the actual runtime role in any future RLS rollout, not evidence of
  this deployment's role privileges; no live roles were inspected here.
  [Supabase Prisma guide](https://supabase.com/docs/guides/database/prisma)
- The application uses transaction pooling. Never attach tenant identity with
  persistent session-level `SET`; any future policy context must be
  transaction-local and established inside the same transaction as the queries.
  [Supabase transaction-pooler session-state warning](https://supabase.com/docs/guides/troubleshooting/resolving-cannot-execute-update-in-a-read-only-transaction-on-transaction-pooler-connections-ef582c)

A future RLS proposal needs a non-bypass runtime role, policies for the actual
application principals (including background and separately authorized paths),
and pooled-connection isolation tests on a new disposable database. This PR
neither changes Supabase Data API exposure nor verifies that separate surface.
