-- Additive only: existing reservations begin at sequence zero. No reservation
-- rows or notification preferences are rewritten or removed.
ALTER TABLE "reservation"
ADD COLUMN "calendarSequence" INTEGER NOT NULL DEFAULT 0;
