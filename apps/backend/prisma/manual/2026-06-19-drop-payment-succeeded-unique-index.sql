-- Split bill (feat/split-bill-pos): a table session is now settled by MULTIPLE
-- SUCCEEDED payments (by item / even / custom partial settlements), so the old
-- "one SUCCEEDED payment per session" backstop must be dropped.
--
-- Supersedes 2026-05-30-payment-succeeded-unique-index.sql. Do NOT re-apply that
-- file after this one.
--
-- What still prevents double full-capture without the index:
--   * the claim path flips the session OPEN -> PAID via an updateMany guarded on
--     status = 'OPEN' (only one full payment can win), and
--   * online checkout charges the REMAINING balance, and
--   * by-item split increments OrderItem.paidQuantity under an optimistic lock.
-- (Concurrent self-pay over-settlement is handled by item reservation/locking in
--  Phase 2 — public QR split — not by this index.)
--
-- Idempotent — safe to re-run. Apply on any database that ran the 2026-05-30 file.
-- Applied to prod (Neon project old-fog-33669483 / qr-menu-db) on deploy of split bill.

DROP INDEX IF EXISTS payment_one_succeeded_per_session;
