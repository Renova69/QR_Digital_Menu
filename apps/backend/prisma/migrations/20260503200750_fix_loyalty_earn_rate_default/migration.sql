-- Fix: the initial loyalty migration added loyaltyExchangeRate with DEFAULT 20.
-- A later migration corrected the default to 10 for new rows only.
-- This migration resets existing rows that still carry the old default of 20
-- to the intended value of 10 (10 pts/€ ≈ 6.7% cashback with redeemRate=150).
-- Rows already manually changed by restaurant owners are left untouched.
UPDATE "restaurant"
SET "loyaltyExchangeRate" = 10
WHERE "loyaltyExchangeRate" = 20;
