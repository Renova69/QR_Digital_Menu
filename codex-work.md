# Codex Work Log

Date: 2026-07-10  
Workspace: `F:\PROGRAMING\QR_Digital_Menu-main`

This file records the work done in the recent audit/fix session, with the
confirmed commits, local-only actions, verification commands, and current
working-tree caveats separated so they do not get mixed together.

## 1. Starting Point And Review Discipline

- Re-read the project graph before touching source files, as required by
  `AGENTS.md`.
- Used `graphify-out/GRAPH_REPORT.md` and `graphify-out/wiki/index.md` as the
  map for codebase navigation.
- Treated previous audit notes and reports as untrusted until verified against
  the actual code.
- Checked the live git state repeatedly with `git status --short` and recent
  commits with `git log --oneline`.
- Kept unrelated working-tree changes separate instead of staging broad changes.

## 2. Earlier Committed Audit Fixes In This Thread

### 2.1 `1e215166 fix: close TOCTOU race in shared-image reference counting`

Purpose:

- Addressed the low-severity but real image deletion race around shared R2 image
  references.
- The concern was that one operation could check whether an image was still
  referenced while another operation was changing references at the same time.
- That could lead to an image being physically deleted while another menu item
  still referenced it.

What changed:

- Introduced/used a process-local key mutex around shared-image cleanup.
- Applied the guard to the menu/image cleanup paths so reference checking and
  physical deletion are serialized per image key.
- Preserved the existing "delete only if no other reference exists" behavior.

Limitations noted:

- This protects a single Node process.
- In a future multi-replica deployment, the same logic would need a distributed
  lock or DB-backed reference counter to close the race across instances.

### 2.2 `eee8af21 fix: block inactive restaurant management access`

Purpose:

- Closed a management-access gap for suspended or soft-deleted restaurants.
- The app already had `Restaurant.isActive` and `Restaurant.deletedAt`, but some
  management paths could still operate if the user had ownership/assignment.

What changed:

- Added active/deleted restaurant checks to management-facing flows.
- Ensured owners/staff cannot keep managing menus, tables, or payment surfaces
  for restaurants that are suspended or soft-deleted.
- Kept super-admin style inspection paths separate where intended.

Why it matters:

- Soft-delete and suspension are only meaningful if operational routes respect
  them.
- Without these checks, a deleted or inactive tenant could still mutate business
  data.

### 2.3 `4c5d9420 chore: refresh graphify wiki artifacts`

Purpose:

- Fixed the stale Graphify wiki situation.
- The installed Graphify CLI no longer exposes the old wiki generation command,
  so the previous community wiki pages could become misleading.

What changed:

- Replaced stale wiki expectations with a clear `graphify-out/wiki/index.md`.
- The index now points to the current source-of-truth graph artifacts:
  `GRAPH_REPORT.md`, `graph.json`, and the interactive graph when generated.

Why it matters:

- Agents are instructed to read Graphify before code navigation.
- Stale graph docs are dangerous because they can steer audits toward old facts.

## 3. Latest Committed Fix: Cash Requests Survive Table Deletion

Commit:

- `c57aa69a fix: preserve cash requests after table deletion`

### 3.1 Problem Verified

The earlier database integrity work had fixed part of the table-deletion
history problem:

- `Payment.tableSessionId` had already been made nullable with `onDelete:
  SetNull`.
- `CashPaymentRequest.tableId` had already been made nullable with `onDelete:
  SetNull`.

However, one hidden cascade path remained:

- `RestaurantTable` deletion deletes historical `TableSession` rows.
- `CashPaymentRequest.tableSessionId` was still required.
- `CashPaymentRequest.tableSession` still used `onDelete: Cascade`.

Result:

- A table with only closed historical sessions could be deleted.
- Its historical `TableSession` rows could be deleted.
- Those deleted sessions could still cascade-delete `cash_payment_request` rows.
- So cash-payment request history was not actually fully preserved.

### 3.2 Schema Fix

Files:

- `apps/backend/prisma/schema.prisma`
- `apps/backend/prisma/migrations/20260710143000_cash_payment_request_session_set_null/migration.sql`

What changed:

- Changed `CashPaymentRequest.tableSessionId` from `String` to `String?`.
- Changed `CashPaymentRequest.tableSession` from required to optional.
- Changed the relation from `onDelete: Cascade` to `onDelete: SetNull`.
- Added a migration that:
  - Drops `NOT NULL` from `cash_payment_request.tableSessionId`.
  - Drops the old FK constraint.
  - Recreates the FK with `ON DELETE SET NULL ON UPDATE CASCADE`.

Why this is the right fix:

- It preserves historical cash-payment audit rows.
- It does not require blocking table deletion forever just because a table has
  history.
- It keeps `restaurantId` required, so rows remain tenant/report scoped.

### 3.3 Backend Runtime Safety

Files:

- `apps/backend/src/payment/payment.types.ts`
- `apps/backend/src/payment/core/payment-core.service.ts`
- `apps/backend/src/payment/session/payment-settlement.service.ts`

What changed:

- Updated `CashPaymentRequestDto.tableSessionId` to `string | null`.
- Cash request events still emit to the restaurant room.
- Cash request events only emit to a table-session room if `tableSessionId`
  still exists.
- Pending bill-payment socket events are only emitted when there is a live
  table-session id.
- Confirming a cash-payment request now explicitly rejects if the request no
  longer has a live session.

Why this matters:

- Historical rows can be detached safely after table/session deletion.
- Active cash settlement still requires a live open session.
- The app does not accidentally settle stale audit records.

### 3.4 Table Deletion Comments And Test Notes

Files:

- `apps/backend/src/tables/tables.service.ts`
- `apps/backend/src/tables/tables.service.spec.ts`

What changed:

- Updated comments that previously mentioned only `CashPaymentRequest.tableId`.
- Comments now correctly explain that both payment and cash-request table/session
  pointers are SetNull for historical deletion safety.
- Kept the existing behavior:
  - OPEN/PAID active sessions still block table deletion.
  - Closed historical sessions do not block table deletion.

### 3.5 Regression Test

File:

- `apps/backend/src/prisma/schema-integrity.spec.ts`

What changed:

- Added a focused test that reads the Prisma schema and migration file.
- Verifies `CashPaymentRequest.tableSessionId` is nullable.
- Verifies the relation uses `onDelete: SetNull`.
- Verifies the migration drops the column `NOT NULL`.
- Verifies the migration contains `ON DELETE SET NULL ON UPDATE CASCADE`.

Why this style of test was chosen:

- The bug was in the database contract, not a pure service branch.
- A schema/migration guard prevents this specific FK action from being silently
  reintroduced.

### 3.6 Frontend Type Updates

Files:

- `apps/frontend/src/lib/api.ts`
- `apps/frontend/src/pages/Dashboard/paymentsShared.ts`

What changed:

- `CashPaymentRequest.tableSessionId` is now `string | null`.
- `CashPaymentRequest.tableId` is now `string | null`.
- `PaymentRecord.tableSessionId` is now `string | null`.

Why this matters:

- Backend rows can now legitimately have nullable historical table/session
  pointers.
- Frontend types now match the API contract instead of pretending deleted
  historical relations still exist.

## 4. Stale `ManageTokenPage` Cleanup

Files removed locally:

- `apps/frontend/src/pages/ManageTokenPage.tsx`
- `apps/frontend/src/pages/ManageTokenPage.test.tsx`

Status:

- These files were untracked, so their removal did not appear in commit
  `c57aa69a`.

Why they were removed:

- The page depended on a nonexistent `auth.setAuth`.
- It expected `access_token` and `refresh_token` in the URL hash.
- That token-in-URL flow conflicts with the current safer web flow.

Current correct app flow:

- Backend Google OAuth callback sets an httpOnly cookie.
- Frontend route `/auth/callback` uses `OAuthCallbackPage`.
- `OAuthCallbackPage` calls `/auth/me`, then uses `loginWithToken(user)`.
- `App.tsx` already wires `/auth/callback`.

Decision:

- Do not integrate `ManageTokenPage`.
- Current cookie-based OAuth callback is the better practice for this web app.

## 5. Archive Folder Handling

File:

- `.gitignore`

Committed change:

- Added `.archive/` to `.gitignore` in commit `c57aa69a`.

Why:

- User requested the archive folder stay local, untracked, and ignored.
- The deleted markdown files were accidental agent-script fallout, so preserving
  `.archive/` locally matters.

Verification performed:

- Confirmed `.archive` is ignored with `git check-ignore -v .archive`.
- Earlier comparison showed deleted root markdown files were preserved in
  `.archive/`.

## 6. Verification Performed For `c57aa69a`

Commands/checks run:

- `npx.cmd prisma generate --schema apps\backend\prisma\schema.prisma`
- Backend typecheck: `npx.cmd tsc --noEmit --pretty false`
- Frontend typecheck: `npx.cmd tsc --noEmit --pretty false`
- Prisma validate with a dummy local `DATABASE_URL`
- Targeted backend Jest:
  - `prisma/schema-integrity.spec.ts`
  - `tables/tables.service.spec.ts`
  - `payment/payment.service.spec.ts`
  - `payment/core/payment-core.service.spec.ts`
- Targeted frontend Vitest:
  - `src/lib/api.session-token.test.ts`
  - `src/components/payment/PaymentModal.test.tsx`
- Full backend Jest suite.
- Full frontend Vitest suite.
- Production build through Turbo.

Results:

- Backend typecheck passed.
- Frontend typecheck passed.
- Prisma validation passed.
- Targeted backend tests passed: 4 suites, 197 tests.
- Targeted frontend tests passed: 2 files, 15 tests.
- Full backend tests passed: 83 suites, 1257 tests.
- Full frontend tests passed: 45 files, 216 tests.
- Production build passed.

Known warnings only:

- Existing React `act(...)` warnings in frontend tests.
- Existing jsdom network/client-log noise in `App.test.tsx`.
- Existing Vite warning that `analyticsExport.ts` is both statically and
  dynamically imported by `AnalyticsView.tsx`.

## 7. Graphify Handling

What was done:

- Ran `graphify update .` after code changes, as required by project guidance.

What happened:

- Graphify updated:
  - `graphify-out/GRAPH_REPORT.md`
  - `graphify-out/graph.json`
  - `graphify-out/manifest.json`
- The graph report showed:
  - 737 files
  - 9358 nodes
  - 13228 edges
  - 692 communities

Why graphify artifacts were not committed:

- The local Graphify run scanned untracked local clutter, including files like
  `CLAUDE.md`.
- Committing that generated graph would bake local scratch/untracked artifacts
  into the project graph.
- The actual code fix was committed without polluted graph artifacts.

Follow-up needed:

- Regenerate Graphify from a clean tracked-file state, or add the appropriate
  ignore rules before committing graph artifacts.

## 8. Current Git State Observed After The Commit

Latest relevant commits:

- `c57aa69a fix: preserve cash requests after table deletion`
- `4c5d9420 chore: refresh graphify wiki artifacts`
- `eee8af21 fix: block inactive restaurant management access`
- `1e215166 fix: close TOCTOU race in shared-image reference counting`

Current local changes observed after `c57aa69a`:

- `.gitignore` has additional scratch/debug ignore rules beyond the committed
  `.archive/` entry.
- `.gitmodules` is staged as a new file for `PRINT EMULATOR/escpresso`.
- `PRINT EMULATOR/escpresso` is modified as a submodule/worktree entry.
- `graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.json`, and
  `graphify-out/manifest.json` are modified from the local Graphify run.
- Untracked local files remain, including:
  - `CLAUDE.md`
  - `TO_VERIFY_GRAVITY.md`
  - backend backup/restore/guard scripts

Important note:

- These current dirty-tree items were not included in commit `c57aa69a`.
- They should be reviewed separately before any push or broad staging command.

## 9. What Was Not Done

- Did not push `c57aa69a`.
- Did not run migrations against a live/remote database.
- Did not rewrite older commits from July 7-10.
- Did not commit polluted Graphify artifacts.
- Did not keep or wire `ManageTokenPage`, because it was stale and less safe
  than the current cookie-based OAuth callback.
- Did not touch the user's archive folder contents.

## 10. Practical Next Steps

Recommended next actions:

1. Decide whether to push `c57aa69a`.
2. Review the current `.gitignore` scratch/debug ignore additions.
3. Decide whether `.gitmodules` and `PRINT EMULATOR/escpresso` should be
   committed as a real submodule change.
4. Clean or ignore untracked local clutter before regenerating and committing
   Graphify artifacts.
5. Apply the new Prisma migration to the intended database using safe deploy
   workflow only, never `prisma migrate reset`.
