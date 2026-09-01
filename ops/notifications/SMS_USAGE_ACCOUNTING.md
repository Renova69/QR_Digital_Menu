# SMS delivery receipts and usage accounting

This release records provider acceptance, delivery receipts, SMS segments, and
cost evidence on the existing notification outbox. It is deliberately
**track-only**: exceeding an allowance never blocks a reservation, OTP, or
notification. Enforcement and billing require a later product decision based
on observed production usage.

## Policy defaults

- PROFESSIONAL: 50 included segments per restaurant-local calendar month.
- ENTERPRISE: 200 included segments per restaurant-local calendar month.
- FREE and STARTER: 0 (reservations remain tier-gated elsewhere).
- `SMS_INCLUDED_PROFESSIONAL` and `SMS_INCLUDED_ENTERPRISE` override these
  values without a migration.
- `SMS_TWILIO_COST_MICROS_PER_SEGMENT` and
  `SMS_GATEWAY_COST_MICROS_PER_SEGMENT` optionally record estimates in
  `SMS_COST_CURRENCY`. Provider-reported cost and estimated cost keep separate
  currencies and are never added together implicitly.

Counts are SMS segments, not API requests. The reporting month follows the
restaurant's configured IANA timezone.

## Rollout

1. Deploy the additive migration
   `20260831180000_sms_delivery_receipts_usage`. It adds nullable accounting
   columns, a zero-default multipart counter, and an opaque receipt-event
   table. It contains no UPDATE, DELETE, TRUNCATE, DROP, or backfill.
2. Set the allowance and optional cost variables to the current commercial
   policy. The defaults remain track-only if no override is supplied.
3. For Twilio, confirm `BACKEND_URL` is the public backend origin and the
   existing `TWILIO_AUTH_TOKEN` binding is present. Each send supplies this
   signed status callback automatically:
   `/api/v1/notifications/sms/twilio/status`.
4. For SMS Gateway, store the Android app's webhook signing key in Secret
   Manager and bind it as `SMS_GATEWAY_WEBHOOK_SIGNING_KEY`. Register four
   separate webhooks (`sms:sent`, `sms:delivered`, `sms:failed`, and
   `sms:cancelled`) to:
   `/api/v1/notifications/sms/smsgateway/status`.
5. Send one short test message and one Unicode multipart test message. Confirm
   the multipart message is not marked DELIVERED until every distinct part
   callback has arrived.
6. As an OWNER or MANAGER, verify the tenant-scoped summary:
   `GET /api/v1/restaurants/{restaurantId}/notification-deliveries/sms-usage?periodMonth=YYYY-MM`.

Provider callbacks are signature-authenticated public routes. Receipt rows
store only opaque provider IDs, structural status, and timestamps; they do not
store phone numbers, message bodies, webhook payloads, or provider error text.

## Rollback

Roll back application traffic to the preceding revision if receipt processing
causes a problem. The previous backend is compatible with the additive schema.
Leave the new columns, enum types, indexes, and receipt table in place; do not
reverse the migration or drop data during an incident.

## Before any future enforcement

- Observe at least one complete billing period.
- Compare estimated segments with both providers' invoices/status data.
- Decide how mid-month tier changes and purchased overages should work.
- Add owner-visible usage and spend warnings.
- Keep reservation creation independent from notification delivery failure.
