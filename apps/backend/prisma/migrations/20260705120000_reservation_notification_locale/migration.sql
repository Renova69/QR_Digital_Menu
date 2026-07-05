-- Persist the guest-selected booking language for all lifecycle notifications.
-- Existing reservations keep the previous English behaviour.
ALTER TABLE "reservation"
    ADD COLUMN IF NOT EXISTS "notificationLocale" TEXT NOT NULL DEFAULT 'en';
