This file contains Audit/report 

Use `superpowers:brainstorm` for this task.

I have a full report/audit file that lists issues in this codebase. Your job is **not** to blindly trust the report. Treat every audit finding as a hypothesis until you independently verify it.


Project goal:
Fix all real issues from the audit using the best, safest, most maintainable solutions.

Strict workflow:

1. **Start with brainstorming only**

   * Use the Superpowers brainstorming workflow properly.
   * Do not edit files or implement fixes yet.
   * First understand the project structure, tech stack, test setup, build process, and the audit report.
   * Ask only truly blocking clarification questions. Otherwise make reasonable assumptions and clearly label them.

2. **Verify before trusting**

   * For every audit finding, independently verify whether it is real.
   * Use code inspection, tests, build/lint/typecheck output, runtime reproduction, dependency checks, logs, or minimal proof scripts where appropriate.
   * Do not mark anything as confirmed unless you have evidence.
   * If a finding cannot be verified, mark it as “Needs more evidence” and explain exactly what is missing.

3. **Classify each audit item**
   For every issue in the report, produce a table with:

   * Audit item / ID
   * Claimed problem
   * Verification status: `Verified`, `False positive`, `Already fixed`, `Duplicate`, `Needs more evidence`, or `Won’t fix`
   * Evidence used
   * Severity
   * Root cause
   * Recommended fix
   * Risk of the fix
   * Tests or validation needed

4. **Find related issues**

   * Do not only fix the exact lines mentioned in the audit.
   * Search the codebase for the same pattern, related bugs, insecure assumptions, duplicated logic, missing validation, bad error handling, or similar architectural problems.
   * Add any newly discovered issues to the table, clearly marked as “Discovered during verification.”

5. **Choose the best solution**

   * Prefer root-cause fixes over superficial patches.
   * Avoid unnecessary rewrites.
   * Preserve existing behavior unless the behavior is clearly wrong or unsafe.
   * Consider security, correctness, maintainability, performance, backward compatibility, and testability.
   * If there are multiple solution options, compare them and recommend the best one.

6. **Create an implementation plan before coding**
   Before making any changes, present a phased plan:

   * Phase 1: safest/highest-priority fixes
   * Phase 2: medium-risk fixes
   * Phase 3: cleanup/refactors only if justified
     For each phase include:
   * Files likely to change
   * Tests to add/update
   * Commands to run for validation
   * Rollback/risk notes

7. **Approval gate**

   * Stop after the verification summary and implementation plan.
   * Do not modify files until I approve the plan.

8. **When implementation is approved later**

   * Work in small, reviewable batches.
   * Add or update tests before/alongside fixes where practical.
   * Run relevant tests, linting, type checks, and build commands.
   * After each batch, summarize exactly what changed and what evidence proves it works.
   * Never hide failing tests. If something fails, diagnose it honestly.

Important rules:

* Do not assume the audit is correct.
* Do not claim an issue is fixed unless you verified it.
* Do not make broad refactors unless they directly support a verified fix.
* Do not remove functionality without explaining why.
* Do not silence errors, warnings, or tests just to make the report clean.
* If you are unsure, say what you are unsure about and how you would verify it.




# Customer-Facing Feature Audit Issues

This file documents the findings, issues, and open questions uncovered during the review of the **Customer-Facing (Public Menu & Ordering)** feature.

---

## Issue 1: Translation Bypass for Newly Added Modifier Choices
* **File:** `apps/backend/src/menu/menu-translation.service.ts` ([menu-translation.service.ts](file:///F:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/menu/menu-translation.service.ts#L59))
* **Function:** `MenuTranslationService.applyLazyTranslations`
* **Severity:** **High**
* **Description:** 
  The loop collecting menu options to send to DeepL uses an all-or-nothing check:
  ```typescript
  for (const option of item.options ?? []) {
    const existing = this.asTransObj(option.translations);
    if (!existing[lang]?.name) { // <-- Checks ONLY if option name is translated
      const textMap: Record<string, string> = { name: option.name };
      ((option.choices as any[]) || []).forEach((c: any) => {
        if (c.name) textMap[`choice_${c.name}`] = c.name;
      });
      pending.push({ type: 'option', entity: option, existing, textMap });
    }
  }
  ```
  If the parent option's name is already translated (e.g., from a previous translation run), the entire option block is skipped. If a restaurant owner later adds a new choice to an existing option, that choice will never be translated because the option name is already translated.
* **Impact:** Newly added option choices (modifiers) remain untranslated on the public menu when a customer switches language.
* **Suggested Fix:** Change the condition to also check if any choice names are missing translations under `existing[lang]?.choices`, and only translate the missing choices.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 2: Validation Gap - Option Multi-Selection
* **File:** `apps/backend/src/orders/orders.service.ts` ([orders.service.ts](file:///F:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/orders/orders.service.ts#L335))
* **Function:** `OrdersService.create`
* **Severity:** **Medium**
* **Description:**
  When validating the customer's selected options during order creation, the server checks that options exist and that the choices belong to those options:
  ```typescript
  if (!isRedeemedFree && item.selectedOptions?.length) {
    const itemOptions = optionsMap.get(item.menuItemId) || [];
    for (const selected of item.selectedOptions) {
      const option = itemOptions.find((o) => o.id === selected.optionId);
      ...
      const choice = choices.find((c) => c.name === selected.choiceName);
      ...
      optionsTotal += choice.priceModifier || 0;
    }
  }
  ```
  However, it does not validate that `VARIATION` type options (which are mutually exclusive choices like size or doneness) have at most one choice selected.
* **Impact:** A malicious client could send multiple choices for a single `VARIATION` option (e.g. choosing both "Medium" and "Rare" for a steak, or multiple sizes). The server will sum all of their price modifiers and record them on the order, creating logically contradictory orders.
* **Suggested Fix:** Group `item.selectedOptions` by `optionId` and, for each option of type `VARIATION`, ensure that there is at most one selection.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 3: Storage Scope Mismatch Breaking Tab Isolation
* **File:** `apps/frontend/src/pages/PublicMenuPage.tsx` ([PublicMenuPage.tsx](file:///F:/PROGRAMING/QR_Digital_Menu-main/apps/frontend/src/pages/PublicMenuPage.tsx#L117-L127))
* **Function:** `PublicMenuPage` mount/unmount effects
* **Severity:** **Medium**
* **Description:**
  The frontend uses `localStorage` to persist `cartItems` but uses `sessionStorage` to store `cartRestaurantId`:
  ```typescript
  useEffect(() => {
    const CART_RESTAURANT_KEY = 'cartRestaurantId';
    const prev = sessionStorage.getItem(CART_RESTAURANT_KEY);
    if (prev && prev !== restaurantId) {
      clearCart();
    }
    if (restaurantId) {
      sessionStorage.setItem(CART_RESTAURANT_KEY, restaurantId);
    }
  }, [restaurantId]);
  ```
  If a user opens a new browser tab for a different restaurant (e.g., scanning another QR code), `sessionStorage` in the new tab is empty (`null`). Thus, the mismatch check is bypassed, and the cart is not cleared on mount. The items from the first restaurant remain in the cart. The pruning logic only removes them once the second restaurant's menu finishes loading from the API.
* **Impact:** A noticeable visual flicker where incorrect cart items are temporarily visible and interactable in the cart/checkout button.
* **Suggested Fix:** Store `cartRestaurantId` in `localStorage` rather than `sessionStorage`, so it is shared across tabs alongside `cartItems`, allowing immediate cleanup on mount when navigating to a different restaurant.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 4: Validation Gap - Unchecked Tables on Assistance Requests
* **File:** `apps/backend/src/assistance/assistance.service.ts` ([assistance.service.ts](file:///F:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/assistance/assistance.service.ts#L77-L83))
* **Function:** `AssistanceService.create`
* **Severity:** **Medium/Low**
* **Description:**
  When a customer requests waiter assistance, the server directly creates an `assistanceRequest` with the client-supplied `tableId` (which is actually the table's user-visible name/number, e.g., "15") without verifying whether a table with that name exists in the restaurant.
* **Impact:** Attackers can send requests for arbitrary table names (e.g., "Table 9999", or code injection payloads), spamming the staff POS/dashboard.
* **Suggested Fix:** Verify that `createAssistanceDto.tableId` corresponds to a valid `RestaurantTable` record for the specified `restaurantId` before creating the request.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 5: Security - Missing Rate Limiting (Throttling) on Feedback Submissions
* **File:** `apps/backend/src/feedback/feedback.controller.ts` ([feedback.controller.ts](file:///F:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/feedback/feedback.controller.ts#L22))
* **Function:** `FeedbackController.create` and `getGoogleReviewUrl`
* **Severity:** **Medium/Low**
* **Description:**
  Unlike public menu retrieval routes, `POST /feedback` is completely unthrottled on the backend.
* **Impact:** Public users can flood the database with ratings and comments for any order, potentially exhausting storage or degrading DB query performance.
* **Suggested Fix:** Add a `@Throttle({ default: { limit: 5, ttl: 60000 } })` decorator to limit feedback submissions from a single client.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 6: Dead / Broken Code - Choice Translation Retrieval Mismatch
* **File:** `apps/frontend/src/components/menu/ItemWithOptions.tsx` ([ItemWithOptions.tsx](file:///F:/PROGRAMING/QR_Digital_Menu-main/apps/frontend/src/components/menu/ItemWithOptions.tsx#L426))
* **Function:** `ItemWithOptions` choices translation lookup
* **Severity:** **Low**
* **Description:**
  The frontend attempts to retrieve option choice translations using `getTranslatedArray`:
  ```typescript
  const translatedChoices = getTranslatedArray(option, currentLang, 'choices');
  ```
  However, choice translations are stored in the database as an object map (`Record<string, string>`) mapping original names to translated names, not as an array of strings. As a result, `getTranslatedArray` always returns `undefined`, and the code falls back to `option.choices`.
  Also, the backend already mutates `option.choices` in-memory to provide translated choices, making this local lookup redundant. If `getTranslatedArray` were to return the raw object, the code would throw a TypeError because it attempts to treat an object or string array as `OptionChoice` objects.
* **Impact:** Redundant, dead, and confusing code that hides a type mismatch.
* **Suggested Fix:** Remove the call to `getTranslatedArray` for `'choices'` and use `option.choices` directly, as the backend already translates choices before sending them.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Questions & Decisions Needed

Before implementing the fixes, the following clarifying questions need to be aligned:

1. **For Issue 2 (Variation limits):** Should a `VARIATION` option enforce exactly one choice (if required/defaulted) or only *at most* one choice (if optional)?
2. **For Issue 4 (Assistance validation):** Should sending an invalid table name throw a `400 BadRequestException` or a `404 NotFoundException`?
3. **For Issue 5 (Throttling limit):** What is the preferred request limit and time-to-live (TTL) for throttling feedback submissions? E.g., is 5 requests per 60 seconds suitable?
4. **General Validation:** Do we want to add any client-side schema validations or rely purely on the backend enforcing these integrity checks?

---

# SaaS Subscription Tiers & Stripe Payments Feature Audit Issues

This section documents the findings, issues, and open questions uncovered during the review of the **SaaS Subscription Tiers & Stripe Payments** feature.

---

## Issue 7: Logic Bug - Multi-Restaurant Owner Session Confirmation Mismatch
* **File:** `apps/backend/src/subscription/subscription.service.ts` ([subscription.service.ts](file:///F:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/subscription/subscription.service.ts#L176-L183))
* **Function:** `SubscriptionService.confirmCheckoutSession`
* **Severity:** **High**
* **Description:**
  When checking if a checkout session was already processed via the in-memory `processedSessions` cache:
  ```typescript
  if (this.processedSessions.has(sessionId)) {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { ownerId: userId },
      select: { tier: true, forceTier: true },
    });
    const tier = restaurant?.forceTier ?? restaurant?.tier ?? 'FREE';
    return { tier: String(tier) };
  }
  ```
  The code retrieves the *first* restaurant owned by the user. If the owner has multiple restaurants (e.g. Restaurant A on FREE tier and Restaurant B on PROFESSIONAL), this can return the incorrect restaurant's tier (e.g., returning FREE instead of PROFESSIONAL), leading to a state mismatch on the confirmation page.
* **Impact:** Owners of multiple restaurants who upgrade one of their locations may see their upgrade fail to reflect in the frontend due to the cache hit returning the wrong restaurant's status.
* **Suggested Fix:** Change the in-memory cache `processedSessions` from a `Set<string>` to a `Map<string, string>` mapping `sessionId -> restaurantId`. When hitting the cache, query the exact restaurant by ID: `findUnique({ where: { id: restaurantId } })`.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 8: Data Consistency/UX Bug - Disconnect Stripe Leaves Payments Enabled
* **File:** `apps/backend/src/restaurants/restaurants.service.ts` ([restaurants.service.ts](file:///F:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/restaurants/restaurants.service.ts#L589-L596))
* **Function:** `RestaurantsService.disconnectStripe`
* **Severity:** **Medium**
* **Description:**
  When a restaurant owner disconnects Stripe in the dashboard settings, the backend resets `stripeAccountId` and `stripeOnboarded` but leaves `paymentsEnabled: true`:
  ```typescript
  async disconnectStripe(restaurantId: string, userId: string) {
    await this.findOneForBilling(restaurantId, userId);

    return this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { stripeAccountId: null, stripeOnboarded: false }, // <-- paymentsEnabled remains true!
    });
  }
  ```
* **Impact:** Public customers will still see "Pay Bill" checkout buttons on the public menu. Clicking the button opens the payment modal but displays a non-functional warning stating that online payment is not configured.
* **Suggested Fix:** In `disconnectStripe`, if the restaurant has no other active payment providers (ePay and Borica are disabled/unconfigured), set `paymentsEnabled` to `false`.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 9: Stale DB State - KYC Restricted Stripe Account Status Sync
* **File:** `apps/backend/src/restaurants/restaurants.service.ts` ([restaurants.service.ts](file:///F:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/restaurants/restaurants.service.ts#L568-L587))
* **Function:** `RestaurantsService.getStripeStatus`
* **Severity:** **Medium**
* **Description:**
  If Stripe restricts/disables a connected Express account (due to compliance/KYC), `stripeProvider.retrieveAccount` returns `chargesEnabled = false`. However, `getStripeStatus` does not update the database state if `chargesEnabled` is `false`:
  ```typescript
  const chargesEnabled = await this.stripeProvider.retrieveAccount(
    restaurant.stripeAccountId,
  );

  if (chargesEnabled && !restaurant.stripeOnboarded) {
    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { stripeOnboarded: true, paymentsEnabled: true },
    });
  }

  return { stripeOnboarded: chargesEnabled }; // <-- Database stripeOnboarded remains true if it was already true!
  ```
* **Impact:** Public menus will continue to offer card payments via Stripe because `stripeOnboarded` remains `true` in the database. Customer transactions will then fail with a 500 error at the Stripe API level during intent creation instead of showing a clean payment-disabled message.
* **Suggested Fix:** If `chargesEnabled` is `false` and the database has `stripeOnboarded` set to `true`, update the database to set `stripeOnboarded: false` and `paymentsEnabled: false` (or disable it if no other provider is configured).
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 10: Unhandled Exception - Deleted Stripe Connected Account Crashes Dashboard
* **File:** `apps/backend/src/restaurants/restaurants.service.ts` ([restaurants.service.ts](file:///F:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/restaurants/restaurants.service.ts#L575))
* **Function:** `RestaurantsService.getStripeStatus`
* **Severity:** **Medium**
* **Description:**
  If a restaurant owner deletes their connected Express account directly from the Stripe dashboard, calling `stripeProvider.retrieveAccount` throws an unhandled `StripeInvalidRequestError`.
* **Impact:** The status endpoint throws a 500 Internal Server Error, which crashes the dashboard billing/settings tab and prevents the owner from disconnecting the invalid account or linking a new one.
* **Suggested Fix:** Wrap `retrieveAccount` in a try-catch block. If an error is thrown due to the account not existing, handle it gracefully (e.g., return `chargesEnabled = false` or automatically clear `stripeAccountId` and `stripeOnboarded` in the DB).
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 11: Critical Data Sync Bug - Stale Grace Expiry Re-Downgrades Paid Tier
* **File:** `apps/backend/src/subscription/subscription.service.ts` ([subscription.service.ts](file:///F:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/subscription/subscription.service.ts#L219-L230))
* **Function:** `SubscriptionService.confirmCheckoutSession`
* **Severity:** **High**
* **Description:**
  When `confirmCheckoutSession` is called to upgrade a restaurant that was previously in a `past_due` state, it updates `tier`, `stripeSubscriptionId`, and `tierUpdatedAt`, but fails to clear `pastDueGraceExpiry`:
  ```typescript
  await this.prisma.restaurant.updateMany({
    where: {
      stripeCustomerId: customerId,
      OR: [{ tierUpdatedAt: null }, { tierUpdatedAt: { lt: eventTime } }],
    },
    data: {
      tier: tier as any,
      stripeSubscriptionId: subscriptionId,
      stripePriceId: priceId ?? null,
      tierUpdatedAt: eventTime,
      // pastDueGraceExpiry is NOT cleared here!
    },
  });
  ```
* **Impact:** The stale grace expiry remains in the database. When the hourly `enforceGraceExpiry` cron runs, it checks `pastDueGraceExpiry < now` and immediately downgrades the newly updated restaurant back to the `FREE` tier.
* **Suggested Fix:** Add `pastDueGraceExpiry: null` to the update payload in `confirmCheckoutSession`.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Stripe & Subscription Questions & Decisions Needed

1. **For Issue 7 (Multi-restaurant fast-path):** Is using an in-memory `Map<string, string>` (`sessionId -> restaurantId`) with horizontal-scaling fallback to Stripe API retrieval acceptable, or should checkout sessions be registered in the database for absolute scalability?
2. **For Issue 8 (Stripe disconnection):** Should `disconnectStripe` automatically reset `paymentsEnabled` to `false`, or should the frontend/backend verify active provider configuration before offering checkout?
3. **For Issue 9 (KYC restriction status):** When Stripe reports `chargesEnabled = false` for an onboarded account, should the backend immediately mark `stripeOnboarded = false` and `paymentsEnabled = false`, or keep the account linked but disabled?
4. **For Issue 10 (Deleted account):** When Stripe returns a "no such account" error, should we automatically clean up the database state by clearing `stripeAccountId` and `stripeOnboarded`, or leave it for the user to click disconnect?

---

# Loyalty & Retention Engine Feature Audit Issues

This section documents the findings, issues, and open questions uncovered during the review of the **Loyalty & Retention Engine** feature.

---

## Issue 12: Performance Bug - Database Transaction Lockup in Loyalty Analytics
* **File:** `apps/backend/src/loyalty/loyalty.service.ts` ([loyalty.service.ts](file:///F:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/loyalty/loyalty.service.ts#L440-L457))
* **Function:** `LoyaltyService.getAnalytics`
* **Severity:** **High**
* **Description:**
  When the restaurant owner views the loyalty analytics page on the dashboard, the backend initiates a transaction that loops over all loyalty accounts in the restaurant to run `expireAccountPoints(tx, account.id)`:
  ```typescript
  const accounts = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const existing = await tx.loyaltyAccount.findMany({
      where: { restaurantId },
    });

    for (const account of existing) {
      await expireAccountPoints(tx, account.id); // <-- Loop of write queries in a single transaction!
    }

    return tx.loyaltyAccount.findMany({ where: { restaurantId } });
  });
  ```
  If a restaurant has thousands of loyalty members, this will execute thousands of queries inside a single Postgres transaction, holding write locks on the `LoyaltyAccount` and `LoyaltyPointLedger` tables.
* **Impact:** Every time the owner views the analytics page, it will cause heavy lock contention, slowing down customer orders/checkouts or causing database timeouts and deadlocks.
* **Suggested Fix:** Remove the write/expiration loop entirely from `getAnalytics`. Analytics should be a read-only endpoint. background point expiration should be handled solely by the daily cron job.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 13: Performance Bug - Transaction Lockup in Expiry Notification Delivery
* **File:** `apps/backend/src/loyalty/loyalty.service.ts` ([loyalty.service.ts](file:///F:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/loyalty/loyalty.service.ts#L307-L348) & [L527-L564](file:///F:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/loyalty/loyalty.service.ts#L527-L564))
* **Function:** `LoyaltyService.notifyExpiryReminders` and `LoyaltyService.runDailyExpiryReminders`
* **Severity:** **High**
* **Description:**
  Both the manual notify endpoint and the daily cron run `expireAccountPoints` inside a loop over all members within a single transaction. This holds locks across all member records and ledger tables.
* **Impact:** For large databases, this will lock up the tables and cause transaction timeouts.
* **Suggested Fix:** Run point expiration in small batches (e.g. 50 accounts at a time) or execute them in separate, short-lived transactions instead of one giant transaction.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 14: Data Sync/Failure Bug - Pre-stamping Expiry Reminders before Email Success
* **File:** `apps/backend/src/loyalty/loyalty.service.ts` ([loyalty.service.ts](file:///F:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/loyalty/loyalty.service.ts#L331-L334) & [L551-L554](file:///F:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/loyalty/loyalty.service.ts#L551-L554))
* **Function:** `LoyaltyService.notifyExpiryReminders` and `LoyaltyService.runDailyExpiryReminders`
* **Severity:** **Medium**
* **Description:**
  The service calls `markRemindersSent` to update the ledger batches in the database *before* actually sending the emails via the Resend API:
  ```typescript
  await markRemindersSent(tx, batches.map(b => b.id));
  // Transaction commits
  ...
  for (const candidate of candidates) {
    await fetch('https://api.resend.com/emails', ...); // <-- Outside transaction!
  }
  ```
  If the Resend API call fails (due to rate-limiting, network error, or invalid key) or if the server crashes mid-loop, some or all customers will never receive their alerts, but their ledger batches are marked as "reminder sent" in the DB.
* **Impact:** Customers' points will expire without warnings being successfully delivered, and the cron will not retry sending them on subsequent runs.
* **Suggested Fix:** Fetch the candidates without updating the database first. Loop through candidates, send the emails, and call `markRemindersSent` inside a small transaction only for each successfully sent email.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 15: Concurrency/Race Condition Bug - Double Point Redemptions / Negative Balances
* **File:** `apps/backend/src/orders/orders.service.ts` ([orders.service.ts](file:///F:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/orders/orders.service.ts#L399-L417))
* **Function:** `OrdersService.create`
* **Severity:** **High**
* **Description:**
  When checking and deducting points during order creation, the server queries `loyaltyAcc` using `findUnique` and queries `loyaltyPointLedger` using `findMany` inside a Prisma transaction, but does not lock these rows.
  If the customer submits two orders concurrently, both transactions can read the same positive balance, proceed to deduct points, and write negative points or decrement the same ledger batch twice.
* **Impact:** Corrupted point balances (negative points) and out-of-sync point ledgers, leading to crashes on subsequent checkouts.
* **Suggested Fix:** Lock the `LoyaltyAccount` row using `SELECT ... FOR UPDATE` via raw SQL at the beginning of the loyalty transaction block in `OrdersService.create`.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 16: Bad Architecture/Error Handling - throwing Error('Forbidden') results in 500 error
* **File:** `apps/backend/src/loyalty/loyalty.service.ts` ([loyalty.service.ts](file:///F:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/loyalty/loyalty.service.ts#L303))
* **Function:** `notifyExpiryReminders`, `getExpiryReminderCandidates`, `getAnalytics`
* **Severity:** **Low**
* **Description:**
  The service checks if the user is the owner of the restaurant, and throws `new Error('Forbidden')` if they are not. In NestJS, a generic `Error` thrown from a service is caught by the global exception filter and returned to the client as a `500 Internal Server Error` instead of a proper `403 Forbidden`.
* **Impact:** Client receives a generic 500 error instead of a descriptive 403 Forbidden error, which hides authorization problems and clutters server error logs.
* **Suggested Fix:** Throw NestJS's built-in `ForbiddenException('You do not have access to this restaurant')` instead of a generic `Error`.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Loyalty & Retention Questions & Decisions Needed

1. **For Issue 12 & 13 (Analytics & notification lockup):** Is it acceptable to make `getAnalytics` completely read-only (skipping point expiration)? Point expiration will still run daily via cron and lazily whenever the specific user logs in or places an order.
2. **For Issue 14 (Email delivery success):** Should we implement a background queue/job processor (like BullMQ) or is performing Resend API fetches in a loop and updating the DB per successful email acceptable for now?
3. **For Issue 15 (Concurrency lock):** Since we are using PostgreSQL, is using a raw SQL `SELECT ... FOR UPDATE` to serialize concurrent updates on a single customer's loyalty account acceptable?
4. **For Issue 16 (Generic Error):** Should we create a global exception filter or simply replace all service-level generic authorization `Error` throws with proper NestJS HTTP exceptions (like `ForbiddenException` / `UnauthorizedException`)?

---

# Restaurant Operations (Owner Dashboard) Feature Audit Issues

This section documents the findings, issues, and open questions uncovered during the review of the **Restaurant Operations (Owner Dashboard)** feature.

---

## Issue 17: Severe Logic Bug - Poisoned Translation Cache on DeepL API Failures
* **File:** `apps/backend/src/translation/translation.service.ts` ([translation.service.ts](file:///F:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/translation/translation.service.ts#L59-L64))
* **Function:** `TranslationService.translateTexts`
* **Severity:** **High**
* **Description:**
  When a DeepL API request fails (e.g. rate limits, network error, or invalid key), `translateTexts` catches the error, logs it, and returns the original untranslated input strings.
  In `menu-translation.service.ts`, the caller `applyLazyTranslations` treats this response as successful and saves these default-language strings into the database's `translations` JSON column under the requested language key.
  Because the translation record now exists, future requests bypass translation entirely, permanently locking the item/category in the default language even when the DeepL API is back online.
* **Impact:** Once a translation fails once, that menu item is permanently cached as untranslated in the database, preventing future translation attempts.
* **Suggested Fix:** Modify `translateTexts` to return an indicator of success/failure (or throw an error) when the call fails, and ensure `applyLazyTranslations` skips updating the database translations column for any failed items.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 18: Logic / Security Edge Case - Broken PNG Downloads for QR Codes with Cross-Origin Logos (Tainted Canvas)
* **File:** `apps/frontend/src/components/tables/TableView.tsx` ([TableView.tsx](file:///F:/PROGRAMING/QR_Digital_Menu-main/apps/frontend/src/components/tables/TableView.tsx#L246-L275))
* **Function:** `TableView.handleDownloadQR`
* **Severity:** **High**
* **Description:**
  When generating and downloading a PNG file for a table's QR code, the code extracts the SVG element from `QRCodeSVG`, draws it onto an HTML5 canvas, and calls `canvas.toDataURL('image/png')` to trigger the download.
  If the restaurant has a custom logo, `QRCodeSVG` embeds this logo as an `<image>` tag inside the SVG. Since this logo is hosted on a different origin (the backend server or cloud storage bucket) and the SVG image tag lacks `crossOrigin="anonymous"`, the browser taints the canvas, throwing a `SecurityError: The operation is insecure` at the `toDataURL` call, which completely crashes the download flow.
* **Impact:** Owners who upload a logo to brand their menu will find their "Download PNG" button completely broken and non-functional, unable to download print-ready QR codes.
* **Suggested Fix:** Pre-load the logo image into a base64 Data URL (e.g., via a helper function using fetch or canvas) in the frontend before passing it to `QRCodeSVG`'s `imageSettings.src`. This keeps the canvas clean and allows seamless PNG downloads.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 19: UI/UX Bug - Table Performance Charts and XLSX Exports Display Database CUIDs instead of Table Names
* **File:** `apps/backend/src/dashboard/dashboard.service.ts` ([dashboard.service.ts](file:///F:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/dashboard/dashboard.service.ts#L609-L641))
* **Function:** `DashboardService.getOrdersByTable`
* **Severity:** **Medium**
* **Description:**
  The `getOrdersByTable` function queries orders, groups them by `tableId` (which contains database CUID strings like `clqxyz1234`), and returns them directly in the response. It does not resolve these CUIDs to human-readable table names (e.g. `Table 5`).
* **Impact:** In both the dashboard analytics table yield chart (under Performance Analytics) and the generated XLSX report sheets (Table Yield), tables are labeled with database CUIDs instead of human-readable table names, making table performance metrics unreadable for the restaurant owner.
* **Suggested Fix:** Use the `tableName` field on the `Order` model (which is already populated at order creation) when grouping or mapping the metrics (e.g., `const key = order.tableName || order.tableId || 'Unknown Table'`).
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Restaurant Operations Questions & Decisions Needed

1. **For Issue 17 (DeepL failures):** When a lazy translation fails, should we propagate the error as a user-visible notification/HTTP error, or is logging the error and letting the default language render on the client (without writing to the DB cache) acceptable?
2. **For Issue 18 (Tainted Canvas PNG downloads):** Since fetching the logo as a blob on the client-side to convert to base64 requires the logo server to have proper CORS headers, should we add a fallback that downloads a pure QR code without the logo if the fetched logo fails due to CORS?
3. **For Issue 19 (Table performance CUIDs):** If older orders in the database do not have a `tableName` (from before the migration), how should we resolve the name? (e.g. look up the `RestaurantTable` record by ID dynamically and cache it in a Map, or fallback to the CUID)?
4. **For Live Table Gateway (Denial of Service risk):** The `joinRestaurantRoom` handler makes two database calls without rate-limiting on incoming socket events. Should we implement a socket-level rate-limiter or message check for joining rooms?

---

# Platform Super-Admin Panel Feature Audit Issues

This section documents the findings, issues, and open questions uncovered during the review of the **Platform Super-Admin Panel** feature.

---

## Issue 20: Concurrency/Audit - Stale Auto-Expiry Overrides Do Not Write to AdminAuditLog
* **File:** `apps/backend/src/subscription/subscription.service.ts` ([subscription.service.ts](file:///f:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/subscription/subscription.service.ts#L508-L526))
* **Function:** `SubscriptionService.enforceForceTierExpiry`
* **Severity:** **Medium**
* **Description:**
  The `enforceForceTierExpiry` hourly cron job clears expired super-admin overrides (`forceTier` and `forceTierExpiresAt`) directly via `updateMany` in the database, but does not create any entries in the `AdminAuditLog` table.
* **Impact:** The audit log will show that a super-admin applied a tier override, but the override will disappear from the database without any audit log trail indicating that it expired. This breaks audit log completeness and accountability.
* **Suggested Fix:** Instead of doing a bulk `updateMany` blindly, fetch the IDs of restaurants whose overrides have expired, loop and clear them, and write a corresponding audit log entry for each (or write a bulk audit log record).
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 21: Critical Logic Error - Multi-Restaurant Owners Locked Out of Active Restaurants If One is Suspended/Deleted
* **File:** `apps/backend/src/auth/jwt.strategy.ts` ([jwt.strategy.ts](file:///f:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/auth/jwt.strategy.ts#L70-L76))
* **Function:** `JwtStrategy.validate`
* **Severity:** **High**
* **Description:**
  When checking if a restaurant is active, the `JwtStrategy` validates `user.restaurants[0]?.isActive`. If an owner owns multiple restaurants (e.g., Restaurant A which is active, and Restaurant B which is suspended or soft-deleted), and Postgres returns the suspended/deleted restaurant first, the owner will be completely blocked from logging in with `ACCOUNT_SUSPENDED` even when trying to access the active restaurant's dashboard.
* **Impact:** Deleting or suspending one restaurant of a multi-location owner completely locks them out of all their other active restaurants.
* **Suggested Fix:** Do not block the entire user session at the JWT validation level based on a random index `restaurants[0]`. The active check should be deferred to controller-level verification (e.g. `verifyDashboardAccess` already verifies permissions and can check if that specific restaurant is active).
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 22: Critical Bug / DB Crash - "Delete Staff" Crashes for Active Staff Members Who Processed Orders
* **File:** `apps/backend/src/super-admin/super-admin.service.ts` ([super-admin.service.ts](file:///f:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/super-admin/super-admin.service.ts#L721-L732))
* **Function:** `SuperAdminService.deleteStaff`
* **Severity:** **High**
* **Description:**
  The service executes `prisma.user.delete({ where: { id: staffId } })`. However, in the database schema, there is a foreign key from the `Order` model's `staffUserId` to the `User` table without any `onDelete` cascade or set-null rule.
* **Impact:** If a staff member has ever processed or been attributed to an order, calling `deleteStaff` will throw a foreign key constraint violation error at the database level, causing the action to crash with a 500 Internal Server Error, making it impossible to delete them.
* **Suggested Fix:** Change the `Order` model's `staff` relation in `schema.prisma` to have `onDelete: SetNull`. Alternatively, in `deleteStaff`, update all orders associated with that staff user to set `staffUserId = null` before deleting the user.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 23: UI/State Bug - Confirmation Text in the Delete Staff Dialog is Not Reset on Open
* **File:** `apps/frontend/src/pages/super-admin/TenantDetailPage.tsx` ([TenantDetailPage.tsx](file:///f:/PROGRAMING/QR_Digital_Menu-main/apps/frontend/src/pages/super-admin/TenantDetailPage.tsx#L427-L432))
* **Component:** `TenantDetailPage`
* **Severity:** **Medium/Low**
* **Description:**
  The `confirmationText` state is shared across all dialogs on the tenant detail page. When the "Delete Staff" dialog opens, `confirmationText` is not reset to `""` (unlike the other dialogs where the trigger buttons clear it).
* **Impact:** If a super-admin completes a delete/restore/suspend action by typing `"CONFIRM"` and then clicks "Delete Staff" for a member, the dialog will open with the delete button already active because `confirmationText` is still `"CONFIRM"`. The admin could accidentally delete the staff member with a single misclick without typing anything.
* **Suggested Fix:** Reset `confirmationText` to `""` whenever the `staffToDelete` state is updated, or use local state variables for each dialog's confirmation text.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 24: Bad Architecture / DRY Violation - Route Layout Unprotected in React-Router Tree
* **File:** `apps/frontend/src/App.tsx` ([App.tsx](file:///f:/PROGRAMING/QR_Digital_Menu-main/apps/frontend/src/App.tsx#L172-L213))
* **Component:** `App` routes
* **Severity:** **Medium/Low**
* **Description:**
  The `SuperAdminLayout` route is rendered without being wrapped in `SuperAdminRoute`. Instead, every single child route under `/super-admin` is individually wrapped with `SuperAdminRoute`.
* **Impact:** Violates DRY and is highly error-prone. If a developer adds a new route inside the `SuperAdminLayout` and forgets to wrap the page component in `SuperAdminRoute`, the page will be exposed to normal logged-in users. Also, the super admin sidebar is loaded and rendered briefly before redirecting.
* **Suggested Fix:** Wrap the `SuperAdminLayout` itself in `SuperAdminRoute` inside `App.tsx`, and remove the individual wrappers from the child pages.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 25: Logic Bug / Data Loss - upsertMenu Deletes Options and Permanently Wipes Option Translations
* **File:** `apps/backend/src/menu-import/menu-import.service.ts` ([menu-import.service.ts](file:///f:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/menu-import/menu-import.service.ts#L273-L294))
* **Function:** `MenuImportService.upsertMenu`
* **Severity:** **High**
* **Description:**
  When importing/upserting a menu, the service deletes all existing options for the item using `tx.menuOption.deleteMany({ where: { menuItemId } })` and recreates them from the payload. However, the recreated options do not import any existing translations.
* **Impact:** Any manual or lazy translations stored on the `MenuOption` records (which reside in the `translations` JSON column) are permanently lost whenever a menu is imported, even if the options themselves didn't change.
* **Suggested Fix:** Instead of blindly deleting all options, retrieve the existing options, match them by name/key, update them, and preserve their `translations` JSON data.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 26: Logic Bug / GDPR Compliance - Daily Retention Cron Keeps Expired Verification Tokens Longer Than Requested
* **File:** `apps/backend/src/users-data/retention.service.ts` ([retention.service.ts](file:///f:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/users-data/retention.service.ts#L22-L29))
* **Function:** `RetentionService.runDailyRetention`
* **Severity:** **Low**
* **Description:**
  The retention cron deletes verification tokens where `expiresAt < now - ttlDays`.
* **Impact:** Since `expiresAt` is the absolute expiration time of the token, checking `expiresAt < now - ttlDays` keeps expired, invalid tokens in the database for an extra `ttlDays` period. The correct calculation should just delete tokens where `expiresAt < now`.
* **Suggested Fix:** Change the query to `expiresAt: { lt: now }`.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 27: Logic Gap - Soft-Deleted/Suspended Restaurants Dashboard Access is Not Blocked
* **File:** `apps/backend/src/dashboard/dashboard.controller.ts` ([dashboard.controller.ts](file:///f:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/dashboard/dashboard.controller.ts#L25-L41))
* **Function:** `DashboardController.verifyDashboardAccess`
* **Severity:** **Medium/Low**
* **Description:**
  `verifyDashboardAccess` does not check if `restaurant.deletedAt` is null or if `restaurant.isActive` is true.
* **Impact:** An authenticated owner can still load stats, analytics, and summaries of suspended or soft-deleted restaurants, which could lead to inconsistent UI states or data leakage of frozen accounts.
* **Suggested Fix:** Select `isActive` and `deletedAt` in the restaurant query within `verifyDashboardAccess`, and throw a `ForbiddenException` if the restaurant is suspended (`isActive === false`) or soft-deleted (`deletedAt !== null`).
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Super-Admin Questions & Decisions Needed

1. **For Issue 20 (Auto-Expiry Audits):** When a tier override expires via the hourly cron, should we record the actor in `AdminAuditLog` as a system user (e.g. `SYSTEM`) or keep the audit log for manual super-admin actions only?
2. **For Issue 21 (Multi-restaurant active session blocks):** Should we completely remove the active-restaurant check from `JwtStrategy` and rely entirely on controller-level checks (like `verifyDashboardAccess`), or should we check that at least one of the user's restaurants is active at session validation time?
4. **For Issue 25 (UpsertMenu wiping translations):** Should the menu import endpoint support importing options with translations, or should it only preserve existing translations for options that match by name?

---

# Kitchen Printer Integration Feature Audit Issues

This section documents the findings, issues, and open questions uncovered during the review of the **Kitchen Printer Integration** feature.

---

## Issue 28: Multi-Restaurant Owner Settings Collision
* **File:** `apps/backend/src/print-station/print-station.controller.ts` ([print-station.controller.ts](file:///f:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/print-station/print-station.controller.ts#L22-L29))
* **Function:** `PrintStationController.getRestaurantId`
* **Severity:** **High**
* **Description:**
  The controller resolves the current restaurant context using `restaurantsService.findByOwner(userId)` which returns the *first* restaurant matching the owner's user ID:
  ```typescript
  private async getRestaurantId(userId: string, userRole: string): Promise<string> {
    if (userRole !== 'OWNER') {
      throw new ForbiddenException('Print station management requires OWNER role');
    }
    const restaurant = await this.restaurantsService.findByOwner(userId);
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    return restaurant.id;
  }
  ```
* **Impact:** Owners of multiple restaurants can only view and manage print stations for their first restaurant. If they navigate to the Print Stations view of another restaurant, the app displays the first restaurant's configuration, and any edits/additions will be incorrectly applied to the wrong restaurant.
* **Suggested Fix:** Change `PrintStationController` endpoints to accept `restaurantId` (e.g. as a query parameter or path parameter), and verify that the requesting owner owns that specific restaurant before proceeding.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 29: TCP Write/End Timeout Gaps
* **File:** `apps/printer-agent/src/services/printer.ts` ([printer.ts](file:///f:/PROGRAMING/QR_Digital_Menu-main/apps/printer-agent/src/services/printer.ts#L25-L37))
* **Function:** `sendToPrinter`
* **Severity:** **High**
* **Description:**
  The connection timeout timer is cleared as soon as a TCP connection is successfully opened:
  ```typescript
  client = TcpSocket.createConnection({ host: ip, port }, () => {
    clearTimeout(timer); // <-- Timeout cleared too early!
    client!.write(data, 'binary', (writeErr?: Error | null) => {
      if (writeErr) {
        done(writeErr);
      } else {
        client!.end();
        done();
      }
    });
  });
  ```
  If `client.write` or `client.end` hangs indefinitely (e.g. if the printer accepts the connection but enters a blocked state without dropping it), the Promise hangs forever because the timeout timer has already been cleared.
* **Impact:** The printer agent's print job processing thread hangs indefinitely, preventing any subsequent print jobs from being printed.
* **Suggested Fix:** Do not clear the timeout timer in the connection callback. Instead, let `done()` handle the `clearTimeout(timer)` cleanup, ensuring the 10-second timeout covers the entire duration of the connection, writing, and closing processes.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 30: Unhandled State Transition in Print Ack (ACK Race Condition)
* **File:** `apps/backend/src/print-station/print-station.service.ts` ([print-station.service.ts](file:///f:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/print-station/print-station.service.ts#L244-L286))
* **Function:** `PrintStationService.handlePrintAck`
* **Severity:** **High**
* **Description:**
  The server processes print acknowledgements and updates the database record of the print job without checking if the job is already in a terminal state (like `PRINTED`):
  ```typescript
  if (success) {
    await this.prisma.printJob.update({
      where: { id: jobId },
      data: { status: 'PRINTED', errorMessage: null },
    });
    ...
  } else {
    const permanentlyFailed = job.attempts >= MAX_PRINT_ATTEMPTS;
    await this.prisma.printJob.update({
      where: { id: jobId },
      data: {
        status: permanentlyFailed ? 'FAILED' : 'PENDING',
        errorMessage: error ?? 'Unknown printer error',
      },
    });
    ...
  }
  ```
  If two agent sockets are connected (or if network packet duplicates cause re-delivery of messages) and one agent successfully prints a ticket while the other encounters a print error, a late or concurrent failed ACK can overwrite the `PRINTED` status in the DB back to `PENDING` or `FAILED`.
* **Impact:** Completed print jobs can be demoted back to `PENDING` or `FAILED`, resulting in double printing or incorrect status reporting in the dashboard.
* **Suggested Fix:** If the retrieved print job is already in the `PRINTED` state, early return and ignore subsequent ACKs.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 31: Missing App-Level Task Registration for Android Foreground Service
* **File:** `apps/printer-agent/index.js` ([index.js](file:///f:/PROGRAMING/QR_Digital_Menu-main/apps/printer-agent/index.js))
* **Severity:** **Medium**
* **Description:**
  The Expo `printer-agent` mobile app utilizes `@supersami/rn-foreground-service` to start a foreground notification on Android. However, it does not call `ForegroundService.register()` in `index.js` to register the background task handler before launching the root component.
* **Impact:** On Android, starting the foreground service without task registration can cause crashes or fail to keep the JS thread active, causing WebSocket connections to drop when the app is in the background.
* **Suggested Fix:** Add proper registration for the foreground service in `index.js`.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 32: Print Station Audit Trail Wiped on Cascade Delete
* **File:** `apps/backend/prisma/schema.prisma` ([schema.prisma](file:///f:/PROGRAMING/QR_Digital_Menu-main/apps/backend/prisma/schema.prisma#L225))
* **Severity:** **Medium**
* **Description:**
  The `PrintJob` model's relation to `PrintStation` is configured with `onDelete: Cascade`. Removing a print station from the dashboard completely deletes all print jobs associated with it.
* **Impact:** The restaurant loses all historical print job records and logs for that station, breaking historical reporting and audit trails.
* **Suggested Fix:** Make `printStationId` optional (`String?`) on the `PrintJob` model, and update the relation's onDelete rule to `SetNull`.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 33: Hardcoded Missing Item Notes in Print Routing
* **File:** `apps/backend/src/print-station/print-station.service.ts` ([print-station.service.ts](file:///f:/PROGRAMING/QR_Digital_Menu-main/apps/backend/src/print-station/print-station.service.ts#L163))
* **Function:** `PrintStationService.routeOrderToPrinters`
* **Severity:** **Low**
* **Description:**
  When mapping order items to printer payloads, the service maps `notes: null` hardcoded. Although the EscPos print utility supports rendering item-level notes, the system currently only supports order-level notes/special requests.
* **Impact:** Item-level special requests cannot be printed on tickets.
* **Suggested Fix:** Update the `OrderItem` schema and create order payload to support item-level comments, then map them properly in `routeOrderToPrinters`.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Kitchen Printer Integration Questions & Decisions Needed

1. **For Issue 28 (Multi-restaurant settings):** Should we update all printer-related API paths to follow `/restaurants/:restaurantId/print-stations` or pass `restaurantId` as a header/query parameter?
2. **For Issue 29 (TCP Write/End Timeout):** Is 10 seconds an appropriate overall timeout duration for the entire printer connection, write, and close process?
3. **For Issue 30 (ACK Race Condition):** Should we also log or warn if a client sends a failed ACK for an already printed job, or just ignore it silently?
4. **For Issue 32 (Cascade deletion):** Do we want to keep print jobs for deleted print stations, or is cascade deletion acceptable if the owner is warned?

---

## Issue 34: Unsafe Fallback Counter for Loyalty Redemptions
* **File:** `apps/backend/src/orders/orders.service.ts`
* **Function:** `OrdersService.create`
* **Severity:** **Medium**
* **Description:**
  When redeeming points without a specific `cartId` (the fallback logic for legacy clients), `redeemCounts` is used to comp items. The fallback counter `usedCounts` is incremented per `menuItemId`. However, because it maps purely by `menuItemId`, a desynced or malicious client could pass options that result in comping the most expensive configuration of a given item rather than the specific one intended.
* **Impact:** Potential financial loss via exploiting the fallback redemption logic to comp expensive options.
* **Suggested Fix:** Deprecate `redeemItemIds` fallback entirely and strictly require `redeemCartIds` for all item redemptions to ensure deterministic line-item matching.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 35: Stripe Payment Intent Double-Confirmation Race Condition Mitigation
* **File:** `apps/backend/src/payment/payment.service.ts`
* **Function:** `PaymentService.createPaymentIntent`
* **Severity:** **High**
* **Description:**
  While the system attempts to cancel stale `PENDING` intents, if two users at the same table tap "Pay" simultaneously, they will generate two separate `PaymentIntent`s. If both are confirmed concurrently before either webhook arrives, Stripe will charge both cards. The DB transaction in `claimSuccessfulPaymentForOpenSession` protects the DB session from being claimed twice, but the duplicate Stripe charge will still go through.
* **Impact:** Double-charging the customer if two payment intents are created and concurrently confirmed.
* **Suggested Fix:** Ensure idempotency keys for `createPaymentIntent` are tied strictly to the `tableSessionId` and its current `totalPrice` hash, rather than generating a new `payment.id` for each retry. This ensures Stripe returns the *same* intent for concurrent requests.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 36: Potential Stripe Webhook Signature Verification Failure
* **File:** `apps/backend/src/payment/payment.controller.ts`
* **Function:** `PaymentController.handleWebhook`
* **Severity:** **High**
* **Description:**
  The controller passes `req.body` directly to `handleWebhookEvent(payload: Buffer, signature: string)`. Stripe's `constructWebhookEvent` strictly requires the raw, unparsed request body (Buffer or raw string). By default, NestJS parses `req.body` into a JSON object. If `req.body` is parsed, the Stripe signature verification will always fail.
* **Impact:** Stripe webhooks will fail to process entirely, resulting in successful Stripe payments never being marked as paid in the system, and table sessions remaining `OPEN`.
* **Suggested Fix:** Ensure `req.rawBody` is enabled in NestJS configuration and pass `req.rawBody` (instead of `req.body`) to the webhook handler.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Order Processing & State Machine Questions & Decisions Needed

1. **For Issue 34 (Loyalty Fallback):** Can we safely remove the `redeemItemIds` fallback logic entirely, or are there legacy V1 clients in production that rely on it?
2. **For Issue 35 (Stripe Double-Charge):** If we change the Stripe idempotency key to bind to the session + amount, we must handle the case where the amount changes (e.g. someone orders another drink while a payment intent is pending). Should we cancel the old intent automatically when the cart is modified?
3. **For Issue 36 (Webhook Body):** Does `main.ts` currently configure `rawBody: true` in the `NestFactory.create` options? If so, `req.rawBody` must be explicitly accessed.

---

## Issue 37: Redis Adapter Scaling Bug in Print Job Emit
* **File:** `apps/backend/src/events/events.gateway.ts`
* **Function:** `EventsGateway.emitPrintJob`
* **Severity:** **Critical**
* **Description:**
  To check if an agent is connected before emitting, the code checks `this.server.sockets.adapter.rooms.get(room)`. When scaled horizontally with `RedisIoAdapter`, this map ONLY contains sockets connected to the *current* local Node.js process. If the agent is connected to Replica B, and the order arrives at Replica A, `rooms.get(room)` returns undefined. As a result, Replica A skips the `emit()` call and marks the job as `PENDING`. The job will never print until the agent manually disconnects and reconnects.
* **Impact:** Print jobs will randomly fail to print in a multi-pod production environment.
* **Suggested Fix:** With the Redis adapter, use `await this.server.in(room).fetchSockets()` to query across the cluster, or simply emit the event unconditionally and rely on an ACK to confirm delivery rather than checking room presence pre-emit.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 38: WebSocket Memory Leak in IP Rate Limiter
* **File:** `apps/backend/src/events/events.gateway.ts`
* **Function:** `EventsGateway.isWsRateLimited`
* **Severity:** **High**
* **Description:**
  The `wsConnectAttempts` Map is used to track IP addresses for rate limiting WebSocket handshakes. However, there is no cleanup mechanism (e.g., `setInterval` or TTL) to remove old IPs from the Map once their `resetAt` time expires. 
* **Impact:** In production, every unique IP that connects will be stored permanently in memory. Over time (e.g., under a distributed DDoS or just normal traffic), this will cause an Out-Of-Memory (OOM) crash on the Node.js process.
* **Suggested Fix:** Implement a periodic cleanup interval to sweep and delete expired IPs from the Map, or replace it with a proper Redis-backed rate limiter (like `@nestjs/throttler` adapted for WebSockets) since Redis is already available.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 39: Missing WebSocket Room Eviction on Role Revocation
* **File:** `apps/backend/src/events/events.gateway.ts`
* **Function:** `EventsGateway.handleJoinRoom`
* **Severity:** **Medium**
* **Description:**
  While there is an explicit mechanism to kick print agents if their token is revoked (`disconnectAgentByTokenId`), there is no equivalent mechanism to kick human users from a `restaurant_${restaurantId}` room if their staff role is revoked, or if the restaurant is suspended.
* **Impact:** A fired employee or a suspended tenant can continue receiving real-time business events (new orders, payments, call waiter requests) indefinitely as long as they don't disconnect their socket.
* **Suggested Fix:** Implement an `evictUser(userId: string)` method that iterates local sockets (or uses Redis pub/sub) to forcefully disconnect sockets belonging to a user whose role or status has changed.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Websockets & Real-time Events Architecture Questions & Decisions Needed

1. **For Issue 37 (Redis Room Check):** If we remove the pre-emit check, the backend won't immediately know if the job was received. Should we refactor `emitPrintJob` to use Socket.IO's new `.timeout().emitWithAck()` feature so we can wait 2-3 seconds for an agent ACK across the cluster before falling back to `PENDING`?
2. **For Issue 38 (Rate Limiting Memory Leak):** Should we implement a simple `setInterval` to clean the local Map, or migrate the WebSocket rate limiting to Redis entirely?

---

## Issue 40: Account Takeover via Unverified Email Linkage (Google OAuth)
* **File:** `apps/backend/src/auth/auth.service.ts`
* **Function:** `AuthService.validateGoogleUser` & `AuthService.register`
* **Severity:** **High**
* **Description:**
  The `/auth/register` endpoint allows an attacker to create an account with any email address and a custom password without email verification. Later, if the true owner of that email signs in using Google OAuth, `validateGoogleUser` finds the existing unverified account by email and links the `googleId` to it. The attacker can then continue to log into the victim's account using the password they originally set.
* **Impact:** Full account takeover. The attacker gains access to the victim's dashboard, restaurant, and Stripe integration.
* **Suggested Fix:** Ensure that when linking a Google login to an existing password-based account, the existing account's email must have been explicitly verified. Alternatively, upon linking, invalidate the existing password so the attacker loses access.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 41: Shared Device Staff PIN Collision Bug
* **File:** `apps/backend/src/users/users.service.ts`
* **Function:** `UsersService.createStaffMember`
* **Severity:** **Medium**
* **Description:**
  For device roles (Waiter/Kitchen), the system randomly generates a 4-digit PIN using `crypto.randomInt(1000, 10000)`. It does not verify if this PIN is already assigned to another staff member at the same restaurant. If a collision occurs, `pinLogin` iterates over all staff with that PIN and returns the first one. The second staff member with that PIN will be permanently locked out and unable to log into their own account.
* **Impact:** A staff member cannot log in, and their actions are incorrectly attributed to another staff member. With ~30 staff, the birthday paradox makes a collision noticeable.
* **Suggested Fix:** Add a uniqueness check loop when generating a new PIN, querying the database to ensure the generated PIN hash does not already exist for that `restaurantId`.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 42: SMS Toll Fraud Vulnerability via Twilio OTP
* **File:** `apps/backend/src/auth/auth.service.ts`
* **Function:** `AuthService.sendOtp`
* **Severity:** **Medium**
* **Description:**
  The system enforces a 60-second database-backed cooldown for email OTP requests. However, Twilio SMS/WhatsApp OTP requests (`phone && !email` branch) bypass this database check and rely solely on the controller's IP-based `@Throttle`. A distributed botnet can bypass IP limits and rapidly hit the endpoint for a target phone number.
* **Impact:** SMS pumping / toll fraud resulting in high Twilio API costs.
* **Suggested Fix:** Track SMS OTP requests in the database (or Redis) keyed by phone number, and enforce a strict 60-second global cooldown per phone number regardless of the requesting IP.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Authentication & Authorization Questions & Decisions Needed

1. **For Issue 40 (Account Takeover):** Should we implement a strict email verification flow (e.g., sending a magic link to verify) before allowing dashboard access, or simply wipe the password when a Google login links to an unverified email?
2. **For Issue 42 (SMS Fraud):** Since we already have the `VerificationToken` table for emails, can we add a `phone` column to it to track the 60-second SMS cooldown?

---

# Feature: Reporting, Analytics & Data Export

## Issue 43: Analytics Cache Memory Leak / OOM DOS
* **File:** `apps/backend/src/dashboard/dashboard.service.ts`
* **Function:** `DashboardService.getAnalytics`
* **Severity:** **High**
* **Description:**
  The `analyticsCache` is an in-memory `Map` that uses arbitrary user-supplied dates (`startDateStr`, `endDateStr`) as part of its cache key. The system never sweeps or deletes expired entries from this Map.
* **Impact:** An attacker can loop requests to `/analytics` with randomized dates, or just regular heavy usage over time, will cause the Map to grow infinitely, leading to an Out-Of-Memory (OOM) crash on the backend.
* **Suggested Fix:** Replace the naive `Map` with a proper TTL-evicting cache like `node-cache` or NestJS's built-in `CacheModule` to ensure expired keys are garbage collected.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 44: Truncated Data in Analytics Aggregations (`take: 10000`)
* **File:** `apps/backend/src/dashboard/dashboard.service.ts`
* **Function:** `getTopItems`, `getPeakHours`, `getCategoryBreakdown`, `getOrdersByTable`
* **Severity:** **High**
* **Description:**
  When the fast-path materialized views are not used or not ready, the fallback logic pulls raw rows from the database into Node.js memory using `findMany` to calculate analytics. However, these queries are hardcoded with `take: 10000`. 
* **Impact:** For any restaurant exceeding 10,000 items/orders in the requested period, the dataset is silently truncated. The resulting analytics, peak hours, and category breakdowns will be completely inaccurate.
* **Suggested Fix:** Replace these in-memory loops with Prisma SQL aggregations (`groupBy` or `$queryRaw`) so the database processes the full dataset and only returns the final metrics.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 45: Materialized View Cron Job Concurrency Clash
* **File:** `apps/backend/src/dashboard/dashboard-views.service.ts`
* **Function:** `refreshViews`
* **Severity:** **Medium**
* **Description:**
  The `@Cron(CronExpression.EVERY_HOUR)` decorator executes `REFRESH MATERIALIZED VIEW CONCURRENTLY` exactly at the top of the hour. In a multi-pod production environment, all Node.js replicas will attempt this refresh simultaneously.
* **Impact:** Causes database lock contention, redundant CPU load on the database, and potential refresh failures.
* **Suggested Fix:** Implement a distributed lock (e.g., Redis Redlock) before executing the refresh, or run this specific cron job in a singleton worker pod.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 46: DST Timezone Drift in View-backed Peak Hours
* **File:** `apps/backend/src/dashboard/dashboard.service.ts`
* **Function:** `getPeakHoursFromView`
* **Severity:** **Medium**
* **Description:**
  The fast-path materialized view `mv_peak_hours` groups orders by `hour_utc`. The backend reconstructs the local hour by taking the *current* timezone offset (`DateTime.now().setZone(tz).offset`) and applying it statically to the entire historical dataset.
* **Impact:** Because Daylight Saving Time (DST) changes offsets dynamically, a report generated in winter covering summer months will shift all summer peak hours incorrectly by 1 hour (or vice versa).
* **Suggested Fix:** The grouping must handle the timezone at the database level (`AT TIME ZONE`) so the view accurately aggregates the local hour based on the date of the record.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 47: Frontend Excel Export API Mismatch Bug
* **File:** `apps/frontend/src/lib/analyticsExport.ts`
* **Function:** `downloadAnalyticsExport`
* **Severity:** **Medium**
* **Description:**
  The frontend uses `write-excel-file/browser` to generate `.xlsx` reports. However, the code calls `const wb = await writeXlsxFile(sheets); await wb.toFile(fileName);`. The `toFile()` method does not exist on the returned object in the browser implementation of `write-excel-file`.
* **Impact:** Clicking the "Export" button on the frontend will throw a TypeError (`wb.toFile is not a function`), breaking the entire export feature.
* **Suggested Fix:** Change the API call to match the correct browser usage: `await writeXlsxFile(sheets, { fileName });`.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Reporting, Analytics & Data Export Questions & Decisions Needed

1. **For Issue 43 (Memory Leak):** Should we just add `node-cache` as a dependency for localized caching, or migrate this cache to Redis since we already use Redis for websockets?
2. **For Issue 45 (Cron Clashing):** Do you prefer using a Redis Redlock for the materialized view cron job, or should we expose an internal HTTP endpoint that an external trigger (like Google Cloud Scheduler) hits?

---

# Feature: Production & Deployment Workflow

## Issue 48: Missing Database Migrations in Deployment
* **File:** `apps/backend/Dockerfile` & `deploy.ps1`
* **Function:** Docker `CMD` / Deployment Script
* **Severity:** **High**
* **Description:**
  Neither the backend `Dockerfile` nor the `deploy.ps1` script runs `npx prisma migrate deploy` prior to or during the container startup.
* **Impact:** Any database schema changes pushed to production will not be automatically applied to the PostgreSQL database. When the new containers boot up and try to query new columns or tables, the queries will crash, causing downtime.
* **Suggested Fix:** Update the `Dockerfile` `CMD` to a shell execution that handles migrations before booting the app: `CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]`.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 49: WebSockets Breaking on Cloud Run (No Session Affinity)
* **File:** `deploy.ps1` & `apps/frontend/src/context/SocketContext.tsx`
* **Severity:** **High**
* **Description:**
  Socket.IO in the frontend is configured to use `transports: ['websocket', 'polling']`. It attempts an HTTP long-polling handshake before upgrading to WebSockets. The backend is deployed to Google Cloud Run via `deploy.ps1`, but the `--session-affinity` flag is omitted.
* **Impact:** Without session affinity, the sequential HTTP polling requests from a single client will be routed to different backend container instances. This breaks the Socket.IO handshake, resulting in `400 Bad Request: Session ID unknown` errors, completely breaking real-time features.
* **Suggested Fix:** Add the `--session-affinity` flag to the `gcloud run deploy` command in `deploy.ps1`, OR force the frontend to skip polling by setting `transports: ['websocket']` in `SocketContext.tsx`.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Issue 50: Single-Stage Dockerfile Bloat & Security Risk
* **File:** `apps/backend/Dockerfile`
* **Severity:** **Medium**
* **Description:**
  The `Dockerfile` builds the application and runs it within the same build stage. It installs `devDependencies`, builds the app, but leaves all raw source files (`src/`) and build tools (like `typescript` and `jest`) in the final image. Furthermore, the container runs as the default `root` user.
* **Impact:** The production image size is massively bloated. Running as `root` inside the container increases the blast radius if an RCE vulnerability is ever discovered in a dependency.
* **Suggested Fix:** Implement a Multi-Stage Dockerfile. Build the app in a `builder` stage, then copy only `dist/`, `package.json`, and `prisma/` to a final Alpine image. Run `npm ci --omit=dev` and specify `USER node` to drop root privileges.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Production & Deployment Questions & Decisions Needed

1. **For Issue 48 (Migrations):** Running `prisma migrate deploy` inside the Docker `CMD` is the easiest fix, but in a scaled environment, multiple containers booting at once might try to migrate concurrently. Are you okay with relying on Prisma's built-in migration locks, or would you prefer a separate Cloud Build migration step?
2. **For Issue 49 (WebSockets):** Should we enable Session Affinity in Cloud Run, or just force native WebSockets on the frontend? Forcing WebSockets is faster and uses less CPU, but drops support for very old corporate firewalls that block WS.

---

# Feature: File Uploads & Cloud Storage (R2 / Image Processing)

## Issue 51: WebP MIME Type Mismatch
* **File:** `apps/backend/src/restaurants/restaurants.controller.ts` & `apps/backend/src/menu/category.controller.ts`
* **Severity:** **Low**
* **Description:**
  The `StorageService` explicitly allows and optimizes `image/webp` files. However, the `FileInterceptor` configuration in the controllers strictly limits uploads to `['image/jpeg', 'image/png']`.
* **Impact:** Users attempting to upload modern WebP images will receive a validation error, creating a poor UX, despite the backend fully supporting it.
* **Suggested Fix:** Add `'image/webp'` to the `allowedTypes` array in the `fileFilter` configuration of the upload controllers.
* **Safe to Fix Now:** Yes (Requires approval first).

---

# Feature: Multi-Language Translation Engine (DeepL)

## Issue 52: Synchronous Blocking Translation and Missing Rate Limit
* **File:** `apps/backend/src/restaurants/restaurants.service.ts` & `apps/backend/src/restaurants/restaurants.controller.ts`
* **Function:** `translateAll`
* **Severity:** **Medium / High**
* **Description:**
  The `translateAll` endpoint sequentially processes every category, item, and option using the DeepL API, adding a 300ms sleep `await new Promise(...)` in the loop to prevent rate-limiting. There is no `@Throttle()` on the controller.
* **Impact:** For a medium-to-large menu, this synchronous operation will take minutes to complete, resulting in a 504 Gateway Timeout for the user's browser (Cloud Run / Vercel will sever the connection). Furthermore, a malicious user could spam this endpoint to intentionally exhaust the server's DeepL quotas.
* **Suggested Fix:** Add a strict `@Throttle()` decorator to `translateAll`. Consider changing the implementation to batch translation requests, or move the logic to a background job returning a 202 Accepted status.
* **Safe to Fix Now:** Yes (Adding Throttle is safe. Backgrounding requires architecture discussion).

---

# Feature: Menu Import / Export Engine (XLSX / AI)

## Issue 53: Algorithmic DoS Vulnerability in Menu Import Arrays
* **File:** `apps/backend/src/menu-import/dto/import-menu.dto.ts`
* **Severity:** **High**
* **Description:**
  The validation decorators allow massive payload structures: up to 200 categories, 500 items per category, 50 options per item, and 100 choices per option. This mathematically permits up to 500,000,000 choices in a single JSON payload. The `MenuImportService` attempts to iterate and upsert these inside a single Prisma `$transaction`.
* **Impact:** Even if the JSON size is constrained to 1MB, an attacker could craft a dense payload that forces the database to execute tens of thousands of write operations inside a single transaction, locking tables, spiking CPU, and causing an application-wide Denial of Service (OOM or DB Timeout).
* **Suggested Fix:** Drastically reduce the `@ArrayMaxSize()` limits to realistic bounds (e.g., 20 categories, 100 items per category) and implement an absolute upper bound on the total number of items allowed per import.
* **Safe to Fix Now:** Yes (Requires approval first).

---

# Feature: Public Assistance & Guest Feedback System

## Issue 54: Unauthenticated Notification Spam (Call Waiter DoS)
* **File:** `apps/backend/src/assistance/assistance.controller.ts`
* **Severity:** **Critical**
* **Description:**
  The public endpoint `POST /assistance-requests` allows customers to request assistance. It is completely unprotected (no authentication, no `@Throttle()`).
* **Impact:** Because `tableId` and `restaurantId` are statically printed on QR codes, an attacker can write a simple script to hit this endpoint thousands of times per minute. Every hit broadcasts a WebSocket event to all staff devices, causing a "Notification DoS" that makes the restaurant's POS system entirely unusable due to infinite ringing/alerts.
* **Suggested Fix:** Apply strict IP-based rate limiting via `@Throttle({ default: { limit: 3, ttl: 60000 } })` to prevent spam, and optionally limit active unacknowledged requests per table.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Remaining Infrastructure Questions & Decisions Needed

1. **For Issue 52 (Translation Timeout):** For now, adding a Throttle secures it, but the timeout issue remains for massive menus. Do you want to refactor `translateAll` into a background polling job, or simply batch the DeepL requests to reduce the 300ms sleep overhead?
2. **For Issue 54 (Assistance Spam):** Do you want to limit "Call Waiter" strictly by IP address, or should we also add a database rule that rejects new requests from a table if they already have an "URGENT" request pending?

---

# Feature: Table Zones & Management

## Issue 55: Unchecked Duplicate Table Names in Bulk Creation
* **File:** `apps/backend/src/tables/tables.service.ts`
* **Function:** `bulkCreate`
* **Severity:** **Medium**
* **Description:**
  While the standard `create` endpoint meticulously checks for duplicate table names (e.g., "Table 1") before inserting, the `bulkCreate` endpoint blindly generates tables named `Table ${i + 1}` inside a Prisma transaction without checking if a table with that name already exists in the restaurant. The database schema (`schema.prisma`) lacks a `@@unique([restaurantId, name])` constraint to prevent this at the database level.
* **Impact:** Clicking the "Bulk create 10 tables" button twice will result in two "Table 1"s, two "Table 2"s, etc. Duplicate table names create severe confusion for staff handling orders, managing sessions, and associating QR codes.
* **Suggested Fix:** Add a `@@unique([restaurantId, name])` constraint in `schema.prisma` to enforce database-level uniqueness, or update `bulkCreate` to fetch existing tables and append an offset (e.g., if "Table 10" exists, start the new bulk batch at "Table 11").
* **Safe to Fix Now:** Yes (Requires approval first. Adding a DB constraint requires a migration).

---

# Feature: User & Staff Management

## Issue 56: Biased PIN Generation Space (Never Starts with 0)
* **File:** `apps/backend/src/users/users.service.ts`
* **Functions:** `createStaffMember`, `resetStaffPin`
* **Severity:** **Low**
* **Description:**
  Waiters and Kitchen staff authenticate via a 4-digit PIN. The code generates this PIN using `crypto.randomInt(1000, 10000).toString()`. Mathematically, this produces numbers between 1000 and 9999.
* **Impact:** A PIN can never start with a `0` (e.g., `0123` or `0000`). This reduces the theoretical entropy of the 4-digit PIN space from 10,000 combinations to exactly 9,000 combinations. While not a massive security flaw (since brute-forcing is locked down to 5 attempts per device via `auth.service.ts`), it's a structural logic flaw.
* **Suggested Fix:** Change the generation logic to `crypto.randomInt(0, 10000).toString().padStart(4, '0')` to utilize the full 10,000 combination entropy space.
* **Safe to Fix Now:** Yes (Requires approval first).

---

## Final Infrastructure Questions & Decisions Needed

1. **For Issue 55 (Duplicate Tables):** Do you want to fix this at the database layer (adding a unique constraint and running a migration), or just make the TypeScript logic smarter so `bulkCreate` continues numbering from the highest existing table number?




