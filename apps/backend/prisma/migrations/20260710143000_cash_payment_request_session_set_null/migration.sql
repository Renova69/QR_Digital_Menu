-- CashPaymentRequest.tableSessionId: Cascade -> SetNull. The previous
-- integrity migration made CashPaymentRequest.tableId nullable, but deleting a
-- RestaurantTable also deletes its historical TableSession rows. Without this
-- FK change, those session deletes still cascade into cash_payment_request and
-- erase the cash-payment audit trail.
ALTER TABLE "cash_payment_request" ALTER COLUMN "tableSessionId" DROP NOT NULL;
ALTER TABLE "cash_payment_request" DROP CONSTRAINT IF EXISTS "cash_payment_request_tableSessionId_fkey";
ALTER TABLE "cash_payment_request"
  ADD CONSTRAINT "cash_payment_request_tableSessionId_fkey"
  FOREIGN KEY ("tableSessionId") REFERENCES "table_session"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
