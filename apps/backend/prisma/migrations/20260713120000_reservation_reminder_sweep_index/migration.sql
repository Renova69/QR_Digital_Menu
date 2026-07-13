-- Support the cross-restaurant reminder sweep without scanning all reservations.
CREATE INDEX "reservation_status_reminderSentAt_startsAt_idx"
ON "reservation"("status", "reminderSentAt", "startsAt");
