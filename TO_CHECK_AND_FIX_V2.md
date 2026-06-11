# TO_CHECK_AND_FIX_V2.md

This document contains a comprehensive 15-point deep-dive code review and audit of the entire Phase 2 feature set, structured strictly according to the requested audit template.

---

## 1. Alternative Payment Gateways (ePay, Borica, MyPos)

### A. Feature summary
The system integrates with alternative payment providers (ePay, Borica). Admin users configure secrets, and webhooks process incoming payment notifications.

### B. Files involved
- `apps/backend/src/payment/secret-crypto.ts` (Encryption of secrets)
- `apps/backend/src/payment/borica.provider.ts` (Borica logic)
- `apps/backend/src/payment/epay.provider.ts` (ePay logic)

### C. Logic trace
1. Admin enters a provider secret.
2. `secret-crypto.ts` encrypts it using AES-256-GCM.
3. Upon a customer checkout, the provider sends a webhook to `payment.controller.ts`.
4. The provider classes decrypt the secret and verify the payload signature.

### D. Issues found
- **File:** `apps/backend/src/payment/secret-crypto.ts`
- **Function:** `decryptSecret()`
- **Severity:** Medium
- **What is wrong:** If the stored string lacks the `v1:` prefix, it returns the raw string unencrypted. If it does have the prefix but is malformed, `crypto.createDecipheriv(...).final()` throws an unhandled error.
- **Why it matters:** An invalid payload or migration error will crash the entire Node server (Denial of Service).
- **Suggested fix:** Wrap `decipher.final()` in a `try/catch` and throw an explicit `InternalServerErrorException`. Remove the raw string fallback.
- **Safe to fix now:** Yes.

### E. Missing tests
- Unit tests: Pass invalid GCM tags and missing prefixes to `decryptSecret` and ensure it gracefully throws instead of crashing Node.

### F. Questions before fixing
- Are there any legacy plaintext secrets still in the production database that rely on the raw string fallback?

---

## 2. Table Sessions & Payment Orchestration

### A. Feature summary
Customers use `TableSession` to group multiple `Order` items together for a unified checkout. When checkout is initiated, a `Payment` intent is created. Staff can also close sessions via Cash or Card (`closeSessionWithCash`).

### B. Files involved
- `apps/backend/src/orders/orders.service.ts`
- `apps/backend/src/payment/payment.service.ts`
- `apps/backend/src/payment/payment.controller.ts`

### C. Logic trace
1. User adds items to cart (adds to `TableSession` with status `OPEN`).
2. User proceeds to checkout, creating a `PENDING` payment for the current session total.
3. User completes payment.
4. Webhook fires -> `claimSuccessfulPaymentForOpenSession` sets the session to `PAID`.

### D. Issues found
- **File:** `apps/backend/src/orders/orders.service.ts`
- **Function:** `create()`
- **Severity:** Critical
- **What is wrong:** The backend allows new items to be added to a `TableSession` even if there is an active `PENDING` payment. 
- **Why it matters:** A customer can open the checkout page, add a $100 bottle of wine to their session from another tab, and then pay the original total (e.g., $10). The webhook will blindly mark the entire session (including the $100 wine) as `PAID`.
- **Suggested fix:** Lock the `TableSession` by either rejecting new orders if a `PENDING` payment exists, or validating that the webhook payment amount equals the current session total before marking it `PAID`.
- **Safe to fix now:** Yes.

### E. Missing tests
- Integration test: Attempting to add an `OrderItem` to a `TableSession` that has a `PENDING` payment should throw a 409 Conflict.

### F. Questions before fixing
- Should we automatically cancel the pending payment intent and force the user to restart the checkout process if they add an item?

---

## 3. GDPR, Data Export & Platform Settings

### A. Feature summary
The system provides a `retention.service.ts` cron job to delete old PII, and a `/users/me/export` endpoint for GDPR data exports.

### B. Files involved
- `apps/backend/src/users-data/retention.service.ts`
- `apps/backend/src/users-data/users-data.controller.ts`
- `apps/backend/src/platform-settings/platform-settings.controller.ts`

### C. Logic trace
1. Nightly cron job runs `runDailyRetention()`.
2. It executes `prisma.order.updateMany()` to redact customerName and customerPhone.

### D. Issues found
- **File:** `apps/backend/src/users-data/retention.service.ts`
- **Function:** `runDailyRetention()`
- **Severity:** High
- **What is wrong:** Line 38 restricts the PII redaction to `customerId: { not: null }`. 
- **Why it matters:** Guest orders (where `customerId` is null) are completely skipped. Because `customerName` is collected for guest orders, this means guest PII is kept indefinitely, causing a direct GDPR violation.
- **Suggested fix:** Remove the `customerId: { not: null }` condition so that all old orders are anonymized.
- **Safe to fix now:** Yes.

*(Note: Data Export IDOR and PlatformSettings Singleton Hijack were audited and verified secure).*

### E. Missing tests
- Integration test: Ensure that a guest order older than the retention period has its name redacted.

### F. Questions before fixing
- None, this is a clear bug.

---

## 4. Kiosk / Device Enrollment (DeviceEnrollmentToken)

### A. Feature summary
Staff devices use a `DeviceEnrollmentToken` to login via PIN to the dashboard. Print station agents use a `PrintAgentToken`.

### B. Files involved
- `apps/backend/src/restaurants/device-enrollment.service.ts`
- `apps/backend/src/events/events.gateway.ts`

### C. Logic trace
1. Admin revokes a token via API.
2. `revokedAt` is populated in the database.
3. Future login attempts are blocked.

### D. Issues found
- **File:** `apps/backend/src/restaurants/device-enrollment.service.ts`
- **Function:** `revokeEnrollment()`
- **Severity:** Medium
- **What is wrong:** Revoking a `DeviceEnrollmentToken` does not immediately sever the active WebSocket connection.
- **Why it matters:** If an iPad is stolen, an admin can revoke the token, but the thief will continue to receive live orders until the existing JWT expires or the socket disconnects naturally.
- **Suggested fix:** Call a disconnect method on `events.gateway.ts` to actively kick the user out when their device is revoked.
- **Safe to fix now:** Yes.

### E. Missing tests
- WebSocket test: Assert that revoking a device token emits a disconnect event to the specific connected socket.

### F. Questions before fixing
- Do we have a reliable mapping of `deviceToken` to socket IDs, or do we need to store the `deviceId` in the socket handshake to easily find and disconnect them?

---

## 5. Help Content & Public Injection (HelpContent)

### A. Feature summary
Super Admins can create and edit Help/FAQ content which is served to customers and staff via the frontend.

### B. Files involved
- `apps/backend/src/help-content/help-content.service.ts`

### C. Logic trace
1. Super Admin submits POST/PATCH with `body` content (Markdown/HTML).
2. Backend saves payload directly to `HelpContent` table.

### D. Issues found
- **File:** `apps/backend/src/help-content/help-content.service.ts`
- **Function:** `create()` and `update()`
- **Severity:** High
- **What is wrong:** The `body` is not sanitized. 
- **Why it matters:** A compromised Super Admin account could inject malicious JavaScript (Stored XSS) that would execute in the browsers of all users (staff and customers) who view the help pages.
- **Suggested fix:** Introduce an HTML sanitizer (`sanitize-html`) before saving to the database.
- **Safe to fix now:** Yes.

### E. Missing tests
- Unit test: Submit `<script>alert(1)</script>` and assert it is stripped.

### F. Questions before fixing
- Should sanitization happen strictly on the backend, or rely on frontend sanitization? (Backend is preferred).

---

## 6. Order State Machine Integrity

### A. Feature summary
Orders are submitted by users, and the kitchen transitions them through states (`NEW` -> `IN_PROGRESS` -> `COMPLETED`).

### B. Files involved
- `apps/backend/src/orders/orders.controller.ts`
- `apps/backend/src/orders/dto/create-order.dto.ts`

### C. Logic trace
1. User submits an order payload with quantities.
2. The payload is validated by `CreateOrderDto`.
3. Order is created.

### D. Issues found
*Status: SECURE.* The global `ValidationPipe` strictly enforcing `@Min(1)` successfully blocks negative quantities. Furthermore, the API endpoints do not expose any functionality to edit `selectedOptions` or items after creation. No action required.

---

## 7. File Uploads & Object Storage

### A. Feature summary
Users upload images for menus, categories, and restaurant logos. Files are stored in S3/R2 and mapped to the database.

### B. Files involved
- `apps/backend/src/storage/storage.service.ts`
- `apps/backend/src/restaurants/restaurants.controller.ts`
- `apps/backend/src/restaurants/restaurants.service.ts`

### C. Logic trace
1. User uploads a file to `/restaurants/:id/logo`.
2. Controller uploads directly to S3 and returns the URL.
3. Client sends a `PATCH` request to update the database.

### D. Issues found
- **File:** `apps/backend/src/restaurants/restaurants.controller.ts` and `restaurants.service.ts`
- **Function:** `uploadLogo()` and `update()`
- **Severity:** Medium
- **What is wrong:** The logo upload endpoint lacks rate-limiting. Furthermore, updating the logo in the database does not delete the old logo from the S3 bucket.
- **Why it matters:** Users can span the endpoint and infinitely inflate the bucket size, leading to Economic Denial of Service.
- **Suggested fix:** Add `@Throttle()` to the upload endpoint. In `update()`, fetch the old logo URL and call `storageService.delete()` to clean up orphaned files.
- **Safe to fix now:** Yes.

### E. Missing tests
- Integration test: Ensure that changing a restaurant's logo triggers a delete call to the storage provider for the previous image.

### F. Questions before fixing
- Should we run a one-time script to identify and delete currently orphaned logos in the production bucket?

---

## 8. Admin Audit Log Tampering (AdminAuditLog)

### A. Feature summary
The `AdminAuditLog` is designed to track sensitive actions taken by staff, providing an unalterable history of operations.

### B. Files involved
- `apps/backend/src/tables/tables.service.ts`

### C. Logic trace
1. Owner deletes a table.
2. `tables.service.ts` calls `prisma.restaurantTable.delete()`.

### D. Issues found
- **File:** `apps/backend/src/tables/tables.service.ts`
- **Function:** `remove()`
- **Severity:** Medium
- **What is wrong:** Deleting tables and zones completely bypasses the `AdminAuditLog`.
- **Why it matters:** If an employee deletes tables to cause operational chaos, the owner has no audit trail. (Note: Log deletion by staff was verified as secure, as no API endpoint exists to delete logs).
- **Suggested fix:** Wrap the `delete` operations in a transaction that also inserts a record into `AdminAuditLog`.
- **Safe to fix now:** Yes.

### E. Missing tests
- Integration test: Assert that calling `tablesService.remove()` creates a corresponding row in the `AdminAuditLog` table.

### F. Questions before fixing
- Should we add a global Prisma middleware to automatically log all `DELETE` operations across the board?

---

## 9. Timezone & "Happy Hour" Manipulation

### A. Feature summary
Restaurants can enable a happy hour multiplier. The backend uses the restaurant's configured timezone to evaluate validity.

### B. Files involved
- `apps/backend/src/menu/happy-hour.service.ts`

### D. Issues found
*Status: SECURE.* The system securely uses Luxon and relies purely on the server clock and the `restaurant.timezone` setting. Client-side timestamps are safely ignored.

---

## 10. Negative Tipping & Price Underflows

### A. Feature summary
Customers can submit a tip percentage during checkout.

### B. Files involved
- `apps/backend/src/payment/payment.service.ts`

### D. Issues found
*Status: SECURE.* The `normalizeTipPercent` method explicitly checks if `normalized < 0` or `> 100` and throws a `BadRequestException`.

---

## 11. Role-Based Access Control (RBAC) Bypasses

### A. Feature summary
Role-based authorization for the Menu endpoints (`WAITER`, `MANAGER`, `OWNER`).

### B. Files involved
- `apps/backend/src/menu/menu-crud.service.ts`

### D. Issues found
*Status: SECURE.* Endpoints correctly use `checkRestaurantOwnership`. Waiters cannot delete or modify menu items because they do not match `ownerId`. 

---

## 12. Loyalty Point Earning Loopholes

### A. Feature summary
Customers earn loyalty points for placing orders. These points are tracked in `LoyaltyAccount` and can be redeemed for future discounts.

### B. Files involved
- `apps/backend/src/orders/orders.service.ts`
- `apps/backend/src/payment/payment.service.ts`

### C. Logic trace
1. Order is accepted -> Points instantly added to user's `LoyaltyAccount`.
2. Order is later refunded/canceled -> Status changes to `CANCELED` or `REFUNDED`.

### D. Issues found
- **File:** `apps/backend/src/orders/orders.service.ts`
- **Function:** `updateStatus()`
- **Severity:** High
- **What is wrong:** Points are never deducted from the `LoyaltyAccount` when an order is canceled or refunded.
- **Why it matters:** Users can infinitely place orders and request refunds, farming points at no cost.
- **Suggested fix:** Hook into the `CANCELED`/`REFUNDED` transitions to invoke a `reversePoints()` method.
- **Safe to fix now:** Yes.

### E. Missing tests
- Integration test: Verifying that transitioning an order to `CANCELED` subtracts `pointsEarned` from the associated `LoyaltyAccount`.

### F. Questions before fixing
- If a user has already spent the earned points before the refund occurs, should their loyalty balance go negative?

---

## 13. WebSocket Subscription Bypasses

### A. Feature summary
Restaurants must have a premium subscription to receive live WebSocket orders on their POS or dashboard.

### B. Files involved
- `apps/backend/src/events/events.gateway.ts`
- `apps/backend/src/subscription/feature.guard.ts`

### C. Logic trace
1. Client connects to WebSocket and joins the `restaurant_{id}` room.
2. Orders are pushed via `emitToRestaurant`.

### D. Issues found
- **File:** `apps/backend/src/events/events.gateway.ts`
- **Function:** `handleJoinRoom()`
- **Severity:** High
- **What is wrong:** The `events.gateway.ts` completely omits any checks for `SubscriptionTier` or feature flags when a dashboard client connects. `FeatureGuard` is strictly HTTP-only.
- **Why it matters:** A restaurant whose subscription has expired can simply leave their tablet open (or even reconnect) and continue to receive live real-time orders indefinitely, bypassing the paywall.
- **Suggested fix:** Implement a `WsFeatureGuard` or manual tier check inside `canAccessRestaurant` in `events.gateway.ts`. 
- **Safe to fix now:** Yes.

### E. Missing tests
- WebSocket test: Attempting to join a room for an expired restaurant should throw a WsException.

### F. Questions before fixing
- Do we also need a periodic cron job to forcefully evict sockets exactly when a subscription expires?

---

## 14. Menu Views & Analytics DoS

### A. Feature summary
Every time a menu is viewed, the frontend pings `recordView` to log analytics data (`MenuView`).

### B. Files involved
- `apps/backend/src/menu-views/menu-view.service.ts`

### C. Logic trace
1. Customer opens menu.
2. Backend records a row in `MenuView`.

### D. Issues found
- **File:** `apps/backend/src/menu-views/menu-view.service.ts`
- **Function:** `recordView()`
- **Severity:** Medium
- **What is wrong:** While rate-limited by IP, there is no global bounding on the total size of the `MenuView` table.
- **Why it matters:** A distributed botnet or slowly rotating IPs can flood the table with millions of rows, degrading database performance.
- **Suggested fix:** Implement a hard cap on rows per restaurant, or add a background cron job to sweep/aggregate old rows automatically.
- **Safe to fix now:** Yes.

### E. Missing tests
- Integration test: Ensure the table truncation/sweeper properly aggregates old views without losing data.

### F. Questions before fixing
- Should we aggregate raw views into daily summaries?

---

## 15. Cross-Tenant Data Leaks (Multi-location)

### A. Feature summary
A `MANAGER` user is assigned to a specific `restaurantId` and should only be able to edit that specific restaurant's menu.

### B. Files involved
- `apps/backend/src/menu/menu-crud.service.ts`

### C. Logic trace
1. Manager attempts to update a category.
2. `MenuCrudService` evaluates permissions.

### D. Issues found
- **File:** `apps/backend/src/menu/menu-crud.service.ts`
- **Function:** `checkRestaurantOwnership()`
- **Severity:** High (Functional Defect)
- **What is wrong:** The boundary checks are currently "too strict" and functionally block ALL manager access. At line 535, it strictly checks `if (restaurant.ownerId !== userId)`. A Manager's `userId` will never equal the restaurant's `ownerId`. 
- **Why it matters:** Managers cannot edit the menu for their *own* restaurant, completely breaking the feature. (There is no cross-tenant leak, just a broken feature).
- **Suggested fix:** Update `checkRestaurantOwnership` to include: `const isManager = role === 'MANAGER' && user.restaurantId === id;`
- **Safe to fix now:** Yes.

### E. Missing tests
- Integration test: Assert that an authenticated user with role `MANAGER` can successfully `PATCH` a category for their assigned restaurant.

### F. Questions before fixing
- Should Managers have full access to all menu CRUD endpoints, or only specific ones?

---

## 16. Client Error Logging & Harvesting Engine (client-logs)

### A. Feature summary
The client logs harvesting engine allows the frontend application to post client-side errors, stack traces, and session metadata to the backend endpoint `/client-logs` to be written directly to the server's application log files.

### B. Files involved
- `apps/backend/src/client-logs/client-logs.controller.ts`
- `apps/backend/src/common/logging/app-logger.ts`

### C. Logic trace
1. Frontend encounters a runtime JavaScript exception or warning.
2. Frontend sends a POST request to `/client-logs` containing stack trace, session IDs, and context.
3. `ClientLogsController.collect()` intercepts the request and calls `writeAppLog()`.
4. `writeAppLog()` formats the entry and logs it using `console.log()` or `console.error()`.

### D. Issues found
- **File:** `apps/backend/src/client-logs/client-logs.controller.ts`
- **Function:** `collect()` / `safeContext()`
- **Severity:** High
- **What is wrong:**
  1. **Log Injection Vulnerability:** The controller accepts user-supplied string fields (`message`, `stack`, `clientSessionId`, `eventType`) and logs them directly. If the application log format is plain-text (e.g. `LOG_FORMAT !== 'json'`), an attacker can inject carriage returns (`\r`) or newlines (`\n`) into the payload to forge fake log entries (e.g. successful login events, audit log bypasses).
  2. **Incomplete PII/Sensitive Data Filtering:** The `safeContext` blocklist checks key names against `/password|token|secret|cookie|authorization|card|pan|cvv/i`. However, it fails to strip other critical sensitive keys like `cvc`, `routingNumber`, `accountNumber`, `apiKey`, `api_key`, `ssn`, `auth`, or `pin`.
- **Why it matters:**
  - Log injection allows attackers to spoof logs, making security monitoring and audit logging unreliable.
  - Incomplete PII filtering can lead to accidental logging of highly sensitive data (like Stripe keys, credit card CVCs, or staff PINs) in server log files.
- **Suggested fix:**
  - Strip carriage returns and newlines (`\r`, `\n`) from all fields in `client-logs.controller.ts` before passing them to the logger.
  - Expand the `safeContext` regex pattern to include `/cvc|routing|account|apikey|api_key|ssn|auth|pin/i`.
- **Safe to fix now:** Yes.

### E. Missing tests
- Unit tests validating that newlines are removed from logged client messages.
- Unit tests verifying that sensitive keys like `cvc` or `pin` are successfully stripped from the client context object.

### F. Questions before fixing
- None.

---

## 17. Feedback Summary Stats Performance/OOM

### A. Feature summary
Restaurant owners can view aggregated feedback stats (average rating, distribution of ratings, etc.) on their dashboard.

### B. Files involved
- `apps/backend/src/feedback/feedback.service.ts`
- `apps/backend/src/feedback/feedback.controller.ts`

### C. Logic trace
1. Owner opens Feedback tab on dashboard.
2. Frontend sends request to `/feedback/summary?restaurantId=...`.
3. `FeedbackService.getSummary()` runs a `findMany` query to fetch ALL feedback records for the restaurant.
4. It iterates the records in memory to compute the average rating, positive rating rate, and rating distribution.

### D. Issues found
- **File:** `apps/backend/src/feedback/feedback.service.ts`
- **Function:** `getSummary()`
- **Severity:** Medium
- **What is wrong:** The service pulls all raw feedback records from the database into Node.js memory (`prisma.feedback.findMany`).
- **Why it matters:** For large restaurants with thousands of feedback entries, loading all rows in memory will spike CPU/memory usage, potentially crashing the Node.js process (Out-Of-Memory) or locking up the event loop.
- **Suggested fix:** Replace the in-memory array aggregation with Prisma database-level aggregation queries using `prisma.feedback.aggregate` (for average and total counts) and `prisma.feedback.groupBy` (for rating distributions).
- **Safe to fix now:** Yes.

### E. Missing tests
- Integration test checking that feedback summary stats match database state when thousands of feedback records exist, without running out of memory.

### F. Questions before fixing
- None.

---

## 18. MenuView Scan Stats Performance/OOM

### A. Feature summary
Dashboard displays menu scan stats (views, unique visitors) over the past 7 days.

### B. Files involved
- `apps/backend/src/menu-views/menu-view.service.ts`
- `apps/backend/src/menu-views/menu-view.controller.ts`

### C. Logic trace
1. Owner opens scan stats on dashboard.
2. Backend triggers `getScanStats()`.
3. It fetches all `menuView` records from the past 7 days (`findMany`) to count unique visitors in memory.

### D. Issues found
- **File:** `apps/backend/src/menu-views/menu-view.service.ts`
- **Function:** `getScanStats()`
- **Severity:** High
- **What is wrong:** The service executes `prisma.menuView.findMany` to fetch all rows for the past 7 days just to count unique visitor IDs in memory.
- **Why it matters:** If a competitor performs a MenuView DoS attack or if the restaurant is highly popular (e.g. 500,000 views a week), this query will pull all 500,000 rows into Node.js memory, causing immediate event-loop lockup and OOM crash.
- **Suggested fix:** Perform distinct count and groupings directly at the database layer (e.g. using `groupBy` or a raw SQL count query).
- **Safe to fix now:** Yes.

### E. Missing tests
- Integration test ensuring `getScanStats` handles a large number of views efficiently without consuming excessive memory.

### F. Questions before fixing
- None.

---

## 19. RBAC Manager Lockout in Table Zones & Tables Management

### A. Feature summary
Staff users with the `MANAGER` role configure physical restaurant spaces (create/update/delete/reorder table zones and individual tables).

### B. Files involved
- `apps/backend/src/table-zones/table-zones.service.ts`
- `apps/backend/src/tables/tables.service.ts`

### C. Logic trace
1. Manager attempts to create, update, delete, or reorder table zones or tables.
2. The service queries the `Restaurant` entity.
3. The service verifies ownership using `restaurant.ownerId === userId` or `table.restaurant.ownerId === userId`.

### D. Issues found
- **Files:** [table-zones.service.ts](file:///f:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/table-zones/table-zones.service.ts) and [tables.service.ts](file:///f:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/tables/tables.service.ts)
- **Functions:** `verifyRestaurantOwnership()`, `create()`, `bulkCreate()`, `update()`, `remove()`
- **Severity:** High (Functional Defect)
- **What is wrong:** The ownership checks are strictly limited to the restaurant's `ownerId`. A user with the role `MANAGER` has a `userId` that will never equal the restaurant's `ownerId`, completely blocking them from managing tables or zones for their assigned location.
- **Why it matters:** Managers are locked out from updating table layouts or adding/reordering zones, breaking the RBAC model design which allows managers to control operations.
- **Suggested fix:** Update the ownership verification checks to allow access if the user's role is `MANAGER` and the user's `restaurantId` matches the target `restaurantId`.
- **Safe to fix now:** Yes.

### E. Missing tests
- Integration test: Verify that an authenticated manager can successfully CRUD table zones and tables for their assigned restaurant.

### F. Questions before fixing
- None.

---

## 20. Twilio SMS OTP Spam/Pumping Vulnerability

### A. Feature summary
Customers register or login via phone numbers with SMS/WhatsApp verification.

### B. Files involved
- `apps/backend/src/auth/auth.service.ts`

### C. Logic trace
1. Client calls `/auth/send-otp` with a phone number.
2. The endpoint triggers `AuthService.sendOtp`.
3. The phone-first path calls `this.sendTwilioOtp(phone)`.

### D. Issues found
- **File:** [auth.service.ts](file:///f:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/auth/auth.service.ts)
- **Function:** `sendOtp()`
- **Severity:** High (Financial Denial of Service)
- **What is wrong:** Unlike the email flow which rate-limits requests by checking for verification tokens created within the last 60 seconds, the phone-first path executes `sendTwilioOtp` immediately with no rate limit check.
- **Why it matters:** An attacker can script requests to spam SMS notifications to any phone number, leading to severe Twilio API charges, billing depletion, or SMS carrier toll fraud (SMS pumping).
- **Suggested fix:** Implement a rate-limiting lookup or verification token track check for phone numbers similar to the email OTP flow before calling Twilio.
- **Safe to fix now:** Yes.

### E. Missing tests
- Integration test: Assert that requesting an SMS OTP twice within 60 seconds throws a `TOO_MANY_REQUESTS` (429) exception.

### F. Questions before fixing
- None.

---

## 21. Database Constraint Blockage on Order/Restaurant Deletion due to LoyaltyPointLedger

### A. Feature summary
Restaurants and orders can be deleted (e.g., during tenant deletion or database cleanup).

### B. Files involved
- `apps/backend/prisma/schema.prisma`

### C. Logic trace
1. Administrator deletes a restaurant (which cascade-deletes orders) or deletes an order directly.
2. PostgreSQL checks the foreign key constraint from `LoyaltyPointLedger` to `Order`.

### D. Issues found
- **File:** [schema.prisma](file:///f:/PROGRAMING/QR_Digital_Menu-main/apps/backend/prisma/schema.prisma)
- **Model:** `LoyaltyPointLedger`
- **Severity:** Medium
- **What is wrong:** The `order` relation on `LoyaltyPointLedger` does not specify an `onDelete` policy (e.g. `onDelete: SetNull`). By default, PostgreSQL enforces `NO ACTION` or `RESTRICT`.
- **Why it matters:** If an order has any associated loyalty ledger transactions, trying to delete the order or delete the restaurant will crash with a foreign key constraint violation.
- **Suggested fix:** Add `onDelete: SetNull` on the `order` relation inside `LoyaltyPointLedger` in `schema.prisma`.
- **Safe to fix now:** Yes.

### E. Missing tests
- Database schema test: Delete an order linked to a loyalty ledger entry and verify it deletes successfully (setting `orderId` to NULL).

### F. Questions before fixing
- Should the ledger transaction be deleted (`onDelete: Cascade`) or kept as audit log with a NULL `orderId` (`onDelete: SetNull`)? Keeping it with NULL `orderId` is safer for ledger integrity.

---

## 22. Database Constraint Blockage on Staff Member Deletion due to POS Orders Reference

### A. Feature summary
Owners remove staff members from the restaurant.

### B. Files involved
- `apps/backend/prisma/schema.prisma`
- `apps/backend/src/users/users.service.ts`

### C. Logic trace
1. Owner deletes a staff member via `/users/staff/:id`.
2. `UsersService.removeStaffMember` calls `prisma.user.delete`.
3. PostgreSQL checks foreign key constraint from `Order`'s `staffUserId` to `app_user`.

### D. Issues found
- **File:** [schema.prisma](file:///f:/PROGRAMING/QR_Digital_Menu-main/apps/backend/prisma/schema.prisma)
- **Model:** `Order` (`staff` relation)
- **Severity:** High
- **What is wrong:** The `staff` relation on the `Order` model does not specify `onDelete: SetNull`. The default database behavior is `RESTRICT`.
- **Why it matters:** If a staff member has ever processed or placed a POS order, the owner cannot delete the staff member's account. Any delete attempt will crash with a database foreign key constraint violation.
- **Suggested fix:** Add `onDelete: SetNull` to the `staff` relation on `Order` in `schema.prisma`.
- **Safe to fix now:** Yes.

### E. Missing tests
- Database schema test: Verify that a staff user who has created a POS order can be successfully deleted, and the order's `staffUserId` becomes NULL.

### F. Questions before fixing
- None.

---

## 23. N+1 Database Performance Disaster in Loyalty Analytics

### A. Feature summary
Owners load aggregated loyalty analytics and member details.

### B. Files involved
- `apps/backend/src/loyalty/loyalty.service.ts`

### C. Logic trace
1. Owner calls `/loyalty/analytics?restaurantId=...`.
2. `LoyaltyService.getAnalytics` queries all loyalty accounts for the restaurant.
3. Inside a single transaction, the service loops through all accounts and calls `expireAccountPoints` sequentially.

### D. Issues found
- **File:** [loyalty.service.ts](file:///f:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/loyalty/loyalty.service.ts)
- **Function:** `getAnalytics()`
- **Severity:** High (Performance / Lockup)
- **What is wrong:** Executing `expireAccountPoints` inside a loop for every customer account inside the request cycle performs N+1 database queries.
- **Why it matters:** For restaurants with thousands of loyalty members, this transaction will cause heavy write-lock contention, lock up the event loop, and time out the connection.
- **Suggested fix:** Remove the write/expiration loop from `getAnalytics`. Analytics should be read-only.
- **Safe to fix now:** Yes.

### E. Missing tests
- Integration test: Assert that calling `getAnalytics` for a restaurant with many loyalty members does not execute a point-expiration loop.

### F. Questions before fixing
- None.

---

## 24. Unsanitized Option Price Modifiers Saved to Database

### A. Feature summary
Customers select options with price modifiers for order items.

### B. Files involved
- `apps/backend/src/orders/orders.service.ts`
- `apps/backend/src/tables/tables.service.ts`

### C. Logic trace
1. Customer creates an order with selected options.
2. Backend calculates `totalPrice` using database-backed price modifiers, but saves raw client-submitted option JSON directly into the database.
3. Staff view table orders / bills; `tables.service.ts` calculates option totals using client-submitted `priceModifier` stored in the JSON.

### D. Issues found
- **File:** [orders.service.ts](file:///f:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/orders/orders.service.ts)
- **Function:** `create()`
- **Severity:** Medium
- **What is wrong:** The backend does not sanitize or normalize the `priceModifier` properties within the `selectedOptions` array before saving them to the database.
- **Why it matters:** A malicious user can submit options with fake negative price modifiers (e.g. `-10.0`). While they will be charged the correct total at checkout, the staff dashboard and printed receipts will calculate item totals using the fake modifiers, showing incorrect item totals and causing major billing discrepancies.
- **Suggested fix:** During order creation, replace client-supplied price modifiers in `item.selectedOptions` with the true values fetched from the database before persisting the order.
- **Safe to fix now:** Yes.

### E. Missing tests
- Integration test: Submit an order option with a fake price modifier, and assert that the saved `selectedOptions` JSON in the database contains the correct database price modifier.

### F. Questions before fixing
- None.

---

## 25. Unauthenticated Assistance (Call Waiter) Spam

### A. Feature summary
Customers can request waiter assistance from their table.

### B. Files involved
- `apps/backend/src/assistance/assistance.service.ts`

### C. Logic trace
1. Client sends a POST to `/assistance-requests`.
2. Controller passes to `AssistanceService.requestAssistance`.
3. Service emits a WebSocket event `call_waiter` to the restaurant.

### D. Issues found
- **File:** `apps/backend/src/assistance/assistance.service.ts`
- **Function:** `requestAssistance()`
- **Severity:** High
- **What is wrong:** The endpoint is completely unauthenticated and does not check for an active table session or impose a cooldown.
- **Why it matters:** An attacker can spam the endpoint up to the global rate limit (100 req/min), flooding the restaurant staff screen with "Call Waiter" popups.
- **Suggested fix:** Implement a per-table cooldown (e.g. via Redis or memory) and ideally verify an active table session token.
- **Safe to fix now:** Yes.

### E. Missing tests
- Integration test: Assert that calling the endpoint twice in 10 seconds throws a 429 Too Many Requests.

### F. Questions before fixing
- None.

---

## 26. Cross-Restaurant Table Spoofing in Assistance

### A. Feature summary
Customers specify their `tableId` when calling the waiter.

### B. Files involved
- `apps/backend/src/assistance/assistance.service.ts`
- `apps/backend/prisma/schema.prisma`

### C. Logic trace
1. Client provides `restaurantId` and `tableId`.
2. Service inserts them directly into the database.

### D. Issues found
- **File:** `apps/backend/src/assistance/assistance.service.ts`
- **Function:** `requestAssistance()`
- **Severity:** Medium
- **What is wrong:** `tableId` is a free-text string and is not validated against the `restaurantId`.
- **Why it matters:** A user can send an assistance request to Restaurant A using a `tableId` from Restaurant B (or a fake string), confusing the staff.
- **Suggested fix:** Validate that the provided `tableId` actually belongs to the `restaurantId` by looking up the `RestaurantTable` model.
- **Safe to fix now:** Yes.

### E. Missing tests
- Integration test: Assert that providing a `tableId` from a different restaurant throws a 400 Bad Request.

### F. Questions before fixing
- None.

---

## 27. Physical Denial of Service (Print Station Abuse)

### A. Feature summary
Orders are sent to physical print stations (kitchen/receipt printers) upon creation.

### B. Files involved
- `apps/backend/src/orders/orders.service.ts`

### C. Logic trace
1. Unauthenticated or authenticated user creates an order via POST `/orders`.
2. `OrdersService.create` immediately calls `this.printStationService.routeOrderToPrinters()`.

### D. Issues found
- **File:** `apps/backend/src/orders/orders.service.ts`
- **Function:** `create()`
- **Severity:** High
- **What is wrong:** The system triggers a physical print job instantly, without waiting for payment or staff approval.
- **Why it matters:** An attacker can spam bogus orders and trigger physical print jobs, jamming the restaurant's printers and exhausting paper supplies (Physical DoS).
- **Suggested fix:** Defer `routeOrderToPrinters` until the order is marked `PAID` or accepted by staff (state transition to `IN_PROGRESS`).
- **Safe to fix now:** Yes.

### E. Missing tests
- Integration test: Verify that calling `POST /orders` creates the order but does NOT trigger a print job until paid.

### F. Questions before fixing
- Should we automatically print unpaid cash orders, or wait for staff to manually accept them first?

---

## 28. Dashboard CPU & Memory Exhaustion (ReDoS-like)

### A. Feature summary
Dashboard displays revenue trends and analytics over a date range.

### B. Files involved
- `apps/backend/src/dashboard/dashboard.service.ts`
- `apps/backend/src/dashboard/dashboard.controller.ts`

### C. Logic trace
1. Manager requests analytics with `startDate` and `endDate`.
2. `DashboardService` loops day-by-day `while (current <= endDt)`.
3. Queries orders using `findMany` without a `take` limit.

### D. Issues found
- **File:** `apps/backend/src/dashboard/dashboard.service.ts`
- **Function:** `getRevenueTrend()` and `getRevenueTrendFromView()`
- **Severity:** High
- **What is wrong:** There is no maximum duration enforced on the date range, and queries pull unbounded records into memory.
- **Why it matters:** An attacker with dashboard access can input massive date ranges (year 0001 to 9999), blocking the Node.js event loop with millions of iterations and causing an Out-Of-Memory crash.
- **Suggested fix:** Enforce a maximum date range (e.g., 365 days) in the DTO validation. Add a maximum `take` limit on raw data fetches, or push the aggregation to the database.
- **Safe to fix now:** Yes.

### E. Missing tests
- Integration test: Assert that requesting a date range > 365 days throws a 400 Bad Request.

### F. Questions before fixing
- None.

---

## 29. CSV/Excel Formula Injection on Menu Export

### A. Feature summary
Restaurants can export their menu to CSV or XLSX format.

### B. Files involved
- `apps/frontend/src/lib/menuExport.ts`
- `apps/backend/src/menu-import/menu-import.controller.ts`

### C. Logic trace
1. User uploads a CSV/XLSX or modifies an item via the dashboard.
2. The name/description strings are saved as-is.
3. User exports the menu; strings are written to CSV/XLSX.

### D. Issues found
- **File:** `apps/frontend/src/lib/menuExport.ts`
- **Function:** Export logic
- **Severity:** Medium
- **What is wrong:** Incoming menu names and descriptions are not sanitized for formula prefixes (`=`, `+`, `-`, `@`).
- **Why it matters:** If an attacker modifies a menu item name to `=cmd|' /C calc'!A0`, exporting it and opening it in Excel could execute arbitrary code (Formula Injection).
- **Suggested fix:** Prefix any string starting with `=, +, -, @` with a single quote `'` during export or sanitize them on the backend upon creation.
- **Safe to fix now:** Yes.

### E. Missing tests
- Unit test: Verify that strings starting with `=` are escaped when exported to CSV.

### F. Questions before fixing
- Should we fix this purely on the export function, or sanitize on the backend during input?

---

## 30. Translation API Abuse (Cost Exhaustion)

### A. Feature summary
Standard item creation/update automatically triggers the translation service to DeepL.

### B. Files involved
- `apps/backend/src/translation/translation.service.ts`
- `apps/backend/src/menu/item.controller.ts`

### C. Logic trace
1. User updates an item description via `PATCH /items/:id`.
2. Backend calls DeepL for configured languages.

### D. Issues found
- **File:** `apps/backend/src/menu/item.controller.ts`
- **Function:** `update()`
- **Severity:** High
- **What is wrong:** The standard endpoints fall back to the global 100 requests/minute limit, which is too high for translation costs.
- **Why it matters:** A malicious user can spam description updates across multiple languages, sending hundreds of thousands of characters per minute to DeepL, resulting in massive API bills.
- **Suggested fix:** Add a stricter `@Throttle()` limit to endpoints that trigger translations, or implement character-based accounting/limits per restaurant.
- **Safe to fix now:** Yes.

### E. Missing tests
- Integration test: Verify that translation-triggering endpoints enforce a strict rate limit.

### F. Questions before fixing
- Should we throttle the endpoints or implement a hard character limit per month per restaurant?
