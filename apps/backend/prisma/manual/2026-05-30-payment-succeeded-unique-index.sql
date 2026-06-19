-- DEPRECATED 2026-06-19 by 2026-06-19-drop-payment-succeeded-unique-index.sql.
-- Split bill allows multiple SUCCEEDED payments per session. Do NOT apply this
-- file on new databases — it is kept only for history.
--
-- #H1 backstop: at most one SUCCEEDED payment per table session.
-- Prevents double-capture under true concurrency (the app-level guard in
-- PaymentService.createPaymentIntent handles the common double-submit case;
-- this index is the database-level guarantee).
--
-- Prisma schema cannot express partial/filtered unique indexes, so this is a
-- manual migration. Idempotent — safe to re-run. Apply on any fresh database.
--
-- Applied to prod (Neon project old-fog-33669483 / qr-menu-db) on 2026-05-30
-- after confirming zero existing duplicate SUCCEEDED payments per session.

CREATE UNIQUE INDEX IF NOT EXISTS payment_one_succeeded_per_session
  ON "payment" ("tableSessionId")
  WHERE status = 'SUCCEEDED';
