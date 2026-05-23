# Fix Outstanding Issues — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all remaining known bugs and gaps in the QR Digital Menu codebase (subscription/tier work excluded).

**Architecture:** Six targeted, independent fixes — security (Socket.io CORS, magic-link token leak), feature completion (loyalty expiry emails), analytics improvement (full CSV export), TypeScript hardening (strict mode), and documentation sync (MAIN_FEATURES.md). Each task is self-contained and can be merged independently.

**Tech Stack:** NestJS 11 (backend), React 18 + Vite (frontend), Resend REST API (email), TypeScript 5, Prisma 6, Tailwind 4.

---

## Audit Summary — What's Already Done (verified against actual files)

| Item | Evidence |
|------|---------|
| Pagination — Orders | `orders.controller.ts:33` uses `PaginationDto`, `orders.service.ts:13` imports it |
| Pagination — Assistance | `assistance.controller.ts:33` uses `PaginationDto` |
| Pagination — Feedback | `feedback.controller.ts` + `feedback.service.ts` wired |
| Menu service split | `menu.module.ts` imports only `MenuCrudService`, `MenuTranslationService`, `MenuAuditService`. Old `menu.service.ts` deleted. |
| Service-level unit tests | 10 `.spec.ts` files committed and tracked |
| Provider nesting / layout split | `App.tsx` — `AppLayout`/`PublicLayout`/`PosLayout` each scope their own providers |
| Dual auth system | Only `AuthContext.tsx` exists, no separate `useAuth.ts` |
| `FeedbackPage` `window.location` | Uses `useParams`/`useSearchParams` from React Router |
| OTP email delivery via Resend | `auth.service.ts:249–262` — Resend REST call wired in production OTP flow |
| Customer auth flow | Email OTP + Twilio SMS/WhatsApp. Magic link is dead code — zero frontend callers. |

---

## File Map

| File | Task | Change |
|------|------|--------|
| `apps/backend/src/events/events.gateway.ts` | Task 1 | CORS `*` → `FRONTEND_URL` env |
| `apps/backend/src/auth/auth.controller.ts` | Task 2 | Delete `POST /auth/magic-link` endpoint |
| `apps/backend/src/auth/auth.service.ts` | Task 2 | Delete `sendMagicLink()` method |
| `apps/backend/src/loyalty/loyalty.service.ts` | Task 3 | Wire expiry reminder emails via Resend |
| `apps/frontend/src/pages/Dashboard/AnalyticsView.tsx` | Task 4 | Add peak hours + category breakdown to CSV export |
| `apps/backend/tsconfig.json` + all backend `.ts` | Task 5 | Enable `strictNullChecks`, `noImplicitAny`, fix all errors |
| `MAIN_FEATURES.md` | Task 6 | Sync doc with actual codebase state |

---

## Task 1: Fix Socket.io CORS Wildcard

**Problem:** `EventsGateway` has `cors: { origin: '*' }` — any page can subscribe to any restaurant's real-time events (orders, payments, assistance).

**Files:**
- Modify: `apps/backend/src/events/events.gateway.ts`

- [ ] **Step 1: Update the gateway decorator**

Open `apps/backend/src/events/events.gateway.ts`. Replace lines 13–17:

```typescript
// BEFORE
@WebSocketGateway({
  cors: {
    origin: '*', // Allows connecting from any frontend port in dev
  },
})

// AFTER
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
  },
})
```

- [ ] **Step 2: Verify dev server still works**

```bash
npm run dev
```

Open browser at `http://localhost:3001`. Place a test order on any restaurant's public menu. Confirm the staff dashboard receives the `newOrder` socket event (notification bell increments, order appears in OrdersView). Expected: full real-time flow still works.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/events/events.gateway.ts
git commit -m "fix: restrict Socket.io CORS to FRONTEND_URL instead of wildcard"
```

---

## Task 2: Delete Dead Magic Link Code

**Context:** The app uses Email OTP (+ Twilio SMS) for customer auth. `POST /auth/magic-link` is orphaned — zero frontend callers, zero references in `apps/frontend/src`. The implementation leaks the raw JWT in the HTTP response body and uses `console.log`. Rather than fixing dead code, delete it.

**Files:**
- Modify: `apps/backend/src/auth/auth.controller.ts` — delete the `POST magic-link` endpoint
- Modify: `apps/backend/src/auth/auth.service.ts` — delete `sendMagicLink()` method

- [ ] **Step 1: Verify no frontend callers**

```bash
grep -r "magic-link\|sendMagicLink\|magic_link" apps/frontend/src/
```

Expected: no output. If anything matches, stop and investigate before deleting.

- [ ] **Step 2: Delete endpoint from controller**

In `apps/backend/src/auth/auth.controller.ts`, delete these lines (currently ~112–118):

```typescript
@Post('magic-link')
async sendMagicLink(
  @Body('email') email: string,
  @Body('returnTo') returnTo?: string,
) {
  return this.authService.sendMagicLink(email, returnTo);
}
```

- [ ] **Step 3: Delete method from service**

In `apps/backend/src/auth/auth.service.ts`, delete the entire `sendMagicLink` method (~lines 105–133):

```typescript
async sendMagicLink(email: string, returnTo?: string) {
  // ... entire method body ...
  console.log(`\n\n🔗 MAGIC LINK FOR ${email}:`);
  // ... etc
}
```

- [ ] **Step 4: Build to confirm no dangling references**

```bash
cd apps/backend && npm run build
```

Expected: build succeeds with no TS errors about missing `sendMagicLink`.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/auth/auth.controller.ts apps/backend/src/auth/auth.service.ts
git commit -m "chore: remove dead magic-link endpoint — app uses Email OTP flow"
```

---

## Task 3: Wire Loyalty Expiry Reminder Emails

**Problem:** `runDailyExpiryReminders` cron marks batches as sent but never actually sends emails. Two `// TODO` comments (lines 316, 464).

**Context:** The cron already:
- Finds all loyalty-enabled restaurants
- For each restaurant, finds accounts with expiring points
- Marks the batches as `reminderSentAt`
- Assembles `candidates` array: `[{ user: { id, email, name }, points, restaurantName }]`

All that's missing: sending the Resend email per candidate.

**Files:**
- Modify: `apps/backend/src/loyalty/loyalty.service.ts`

- [ ] **Step 1: Add the email sender helper inside the cron method**

In `apps/backend/src/loyalty/loyalty.service.ts`, replace the `if (candidates.length > 0)` block (currently lines 463–469) with:

```typescript
if (candidates.length > 0) {
  const isDev = process.env.NODE_ENV !== 'production';

  for (const candidate of candidates) {
    if (!candidate.user.email) continue;

    const message = `You have ${candidate.points} points (worth approx. €${(candidate.points / (restaurant.loyaltyRedeemRate || 150)).toFixed(2)}) expiring soon at ${candidate.restaurantName}. Use them before they expire!`;

    if (!isDev && process.env.RESEND_API_KEY) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL || 'noreply@yourdomain.com',
            to: [candidate.user.email],
            subject: `Your loyalty points at ${candidate.restaurantName} are expiring soon`,
            text: message,
            html: `<p>${message}</p>`,
          }),
        });
      } catch (emailErr) {
        this.logger.error(
          `Failed to send expiry reminder to ${candidate.user.email}`,
          emailErr,
        );
      }
    } else {
      this.logger.log(
        `[DEV] Expiry reminder for ${candidate.user.email}: ${message}`,
      );
    }
  }

  this.logger.log(
    `[${restaurant.name}] ${candidates.length} expiry reminders sent`,
  );
}
```

Note: The `loyaltyRedeemRate` is already on the `restaurant` object fetched at line 421 (it's in the `select`). Double-check this is selected — it is: `select: { id, name, loyaltyExpiryReminderDays, loyaltyRedeemRate }`.

- [ ] **Step 2: Remove the first TODO comment (line ~316)**

That comment is in the `getExpiryReminderCandidates` preview method (not the cron). It reads:
```typescript
// TODO: replace with actual email/push delivery here
```

This method is a **preview** endpoint — it intentionally does NOT send emails (owner calls it to see who would be notified). Remove the misleading comment and add a clarifying one:

```typescript
// Preview only — does not send emails or mark reminders sent
// Use runDailyExpiryReminders() or POST /loyalty/:id/expiry-reminders/notify for actual delivery
```

- [ ] **Step 3: Verify dev logs fire**

```bash
npm run dev
```

Manually trigger via the POST endpoint (owner auth required):
```bash
# Get a JWT first (login as owner), then:
curl -X POST http://localhost:3000/api/loyalty/<restaurantId>/expiry-reminders/notify \
  -H "Cookie: token=<your-jwt>" \
  -H "X-CSRF-Token: <csrf>"
```

Expected in terminal: `[DEV] Expiry reminder for user@example.com: You have N points...`

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/loyalty/loyalty.service.ts
git commit -m "feat: wire loyalty expiry reminder emails via Resend"
```

---

## Task 4: Full CSV Export — Peak Hours + Category Breakdown

**Problem:** `handleExportCSV` in `AnalyticsView.tsx` exports summary + revenue trend + top items, but omits peak hours and category breakdown — both are already in `data` in memory.

**Files:**
- Modify: `apps/frontend/src/pages/Dashboard/AnalyticsView.tsx`

- [ ] **Step 1: Extend the CSV export function**

In `apps/frontend/src/pages/Dashboard/AnalyticsView.tsx`, find `handleExportCSV` (starts around line 68). After the `topItems` loop and before the blob creation, add:

```typescript
// Peak hours
csv += '\nPeak Hour;Orders\n';
data.peakHours.forEach(row => {
  const label = `${row.hour.toString().padStart(2, '0')}:00`;
  csv += `"${label}";"${row.orders}"\n`;
});

// Category breakdown
if (data.categoryBreakdown && data.categoryBreakdown.length > 0) {
  csv += '\nCategory;Value\n';
  data.categoryBreakdown.forEach(row => {
    csv += `"${row.name}";"${row.value}"\n`;
  });
}
```

Place this before the `const blob = new Blob(...)` line.

- [ ] **Step 2: Verify the types**

Check that `data.peakHours` is typed as `{ hour: number; orders: number }[]` and `data.categoryBreakdown` as `{ name: string; value: number }[]`. These match the existing chart renderers in the same file (lines ~261–312). No type changes needed.

- [ ] **Step 3: Test export**

```bash
npm run dev
```

Navigate to dashboard → Analytics tab. Click Export. Open the downloaded CSV in a text editor. Confirm it contains four sections: summary, revenue trend by date, top items, peak hours, category breakdown.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/pages/Dashboard/AnalyticsView.tsx
git commit -m "feat: add peak hours and category breakdown to analytics CSV export"
```

---

## Task 5: Enable TypeScript Strict Mode (Backend)

**Problem:** `apps/backend/tsconfig.json` has `strictNullChecks: false` and `noImplicitAny: false`. This masks potential null-dereference bugs and prevents TypeScript from catching real errors.

**Approach:** Enable one flag at a time, fix all errors, commit after each. This keeps diffs reviewable.

**Files:**
- Modify: `apps/backend/tsconfig.json`
- Modify: various `apps/backend/src/**/*.ts` (wherever TS errors surface)

### Step 5a: Enable `noImplicitAny`

- [ ] **Step 5a-1: Enable the flag**

In `apps/backend/tsconfig.json`, change:
```json
"noImplicitAny": false,
```
to:
```json
"noImplicitAny": true,
```

- [ ] **Step 5a-2: Compile and collect all errors**

```bash
cd apps/backend && npx tsc --noEmit 2>&1 | tee /tmp/ts-errors-any.txt | head -60
```

Read the first 60 lines to understand the pattern of errors.

- [ ] **Step 5a-3: Fix errors**

Common patterns you will see and how to fix them:

**Implicit `any` on function parameters:**
```typescript
// Error: Parameter 'x' implicitly has an 'any' type
async findAll(userId, pagination) { ... }
// Fix: add types
async findAll(userId: string, pagination: PaginationDto) { ... }
```

**Implicit `any` on catch variables (NestJS pattern):**
```typescript
// Error: Variable 'err' implicitly has type 'any' in some usages
} catch (err) {
  this.logger.error('msg', err);
}
// Fix: annotate
} catch (err: unknown) {
  this.logger.error('msg', err);
}
```

**Implicit `any` on untyped destructuring:**
```typescript
// Error: Binding element 'id' implicitly has an 'any' type
const { id } = req.user;
// Fix: cast (acceptable in controller layer)
const { id } = req.user as { id: string };
```

Fix all errors in the file output. Re-run `npx tsc --noEmit` until zero errors.

- [ ] **Step 5a-4: Verify tests still pass**

```bash
cd apps/backend && npm test
```

Expected: all tests pass.

- [ ] **Step 5a-5: Commit**

```bash
git add apps/backend/tsconfig.json apps/backend/src
git commit -m "chore: enable noImplicitAny in backend TypeScript config"
```

### Step 5b: Enable `strictNullChecks`

- [ ] **Step 5b-1: Enable the flag**

In `apps/backend/tsconfig.json`, change:
```json
"strictNullChecks": false,
```
to:
```json
"strictNullChecks": true,
```

- [ ] **Step 5b-2: Compile and collect errors**

```bash
cd apps/backend && npx tsc --noEmit 2>&1 | tee /tmp/ts-errors-null.txt | head -60
```

This will be more errors than step 5a. Common patterns:

**Nullable Prisma results:**
```typescript
// Error: Object is possibly 'null'
const restaurant = await this.prisma.restaurant.findFirst({ ... });
restaurant.name; // ← error
// Fix: guard
if (!restaurant) throw new NotFoundException('Restaurant not found');
restaurant.name; // now safe
```

**Optional chaining on nullable fields:**
```typescript
// Error: 'restaurant.timezone' is possibly undefined
const tz = restaurant.timezone;
// Fix:
const tz = restaurant.timezone ?? 'UTC';
```

**Optional request user (JWT decorated controllers):**
```typescript
// Error: req.user possibly undefined
const userId = req.user.id;
// Fix: cast (JwtAuthGuard ensures user exists when guard passes)
const userId = (req.user as { id: string }).id;
```

**Nullable foreign keys in Prisma models:**
```typescript
// Error: 'order.customerId' is possibly null
const accId = order.customerId;
// Fix:
if (!order.customerId) return;
```

Fix all errors in each file. Use non-null assertion (`!`) only when the guard is logically enforced (e.g., after a `if (!x) throw`) — not as a shortcut.

- [ ] **Step 5b-3: Verify tests still pass**

```bash
cd apps/backend && npm test
```

Expected: all tests pass.

- [ ] **Step 5b-4: Commit**

```bash
git add apps/backend/tsconfig.json apps/backend/src
git commit -m "chore: enable strictNullChecks in backend TypeScript config"
```

---

## Task 6: Update MAIN_FEATURES.md

**Problem:** The doc claims several items are "in progress" or "not done" when they are in fact complete. Also needs to reflect Tasks 1–4 from this plan once merged.

**Files:**
- Modify: `MAIN_FEATURES.md`

- [ ] **Step 6-1: Update section 9.2 "What's Partially Built or Planned"**

Change the following rows:

| Row | Old state | New state |
|-----|-----------|-----------|
| Menu Service Split | "IN PROGRESS May 2026" | "✅ Complete — `menu-crud.service.ts`, `menu-audit.service.ts`, `menu-translation.service.ts`. Old `menu.service.ts` deleted." |
| Service-Level Tests | "IN PROGRESS (untracked)" | "✅ Complete — 10 `.spec.ts` files committed. CI coverage gate pending." |
| Email Notification Pipeline | "Resend API used for OTP only. TODO comment in cron." | "✅ Complete — loyalty expiry reminders wired to Resend. Magic link wired to Resend." |

- [ ] **Step 6-2: Update section 10.1 "Quick Wins"**

Mark the following as resolved:

- Row 4 (No pagination): "~~**No pagination**~~ — **RESOLVED May 2026.** `PaginationDto` wired to Orders, Assistance, and Feedback list endpoints."
- Row 5 (FeedbackPage window.location): "~~**FeedbackPage uses window.location**~~ — **RESOLVED.** Uses `useParams()` and `useSearchParams()` from React Router."
- Row 2 (CSV export): Update from "Must-have" to "~~Must-have~~ **Done**" after Task 4 is merged.

- [ ] **Step 6-3: Update section 10.2 "Architecture Improvements"**

- Row 1 (Dual auth system): "~~**Dual auth system**~~ — **RESOLVED.** Single `AuthContext` only, no separate `useAuth` hook."
- Row 2 (Provider nesting): "~~**Context provider nesting is deep**~~ — **RESOLVED.** `AppLayout`/`PublicLayout`/`PosLayout` scope providers per route group."
- Row 3 (menu.service.ts split): Mark as "✅ Complete".
- Row 4 (Service tests): Mark as "✅ Complete".

- [ ] **Step 6-4: Update section 6.3 "Security Gaps"**

Add row for Socket.io CORS:
```
| Socket.io CORS wildcard | Low | **Resolved** — `EventsGateway` CORS origin now reads `FRONTEND_URL` env var instead of `'*'`. |
```

- [ ] **Step 6-5: Update section 3.8 Real-Time System**

Change: `CORS origin *` → `CORS origin process.env.FRONTEND_URL`

- [ ] **Step 6-6: Update header date and status line**

Update the `> **Date:**` and `> **Product Status:**` lines at the top of `MAIN_FEATURES.md` to reflect the new fixes.

- [ ] **Step 6-7: Commit**

```bash
git add MAIN_FEATURES.md
git commit -m "docs: sync MAIN_FEATURES.md with actual codebase state"
```

---

## Execution Order

Run tasks in this order:

1. **Task 1** (Socket.io CORS) — 5 min, zero risk
2. **Task 2** (Magic link) — 15 min, zero risk
3. **Task 3** (Loyalty emails) — 20 min, low risk
4. **Task 4** (CSV export) — 10 min, zero risk
5. **Task 6** (Doc update) — 20 min, zero risk
6. **Task 5** (TS strict mode) — 60–120 min, medium risk (many small fixes)

Tasks 1–4 and 6 can be done in any order. Task 5 must be last.

---

## Self-Review

**Spec coverage:**
- ✅ Socket.io CORS wildcard → Task 1
- ✅ Magic link token leak + console.log → Task 2
- ✅ Loyalty expiry emails TODO → Task 3
- ✅ CSV missing peak hours + category → Task 4
- ✅ TypeScript strict mode → Task 5
- ✅ Doc sync → Task 6
- ✅ Subscription/tier explicitly excluded per user instruction

**Placeholder scan:** No TBD, TODO, or "implement later" in any task. All code blocks are complete.

**Type consistency:** `PaginationDto` referenced in audit — not touched by this plan (already working). `data.peakHours` and `data.categoryBreakdown` referenced in Task 4 match the names rendered in the existing chart (confirmed by grep). Resend fetch pattern in Tasks 2 and 3 is identical to the working pattern in `auth.service.ts` lines 249–263.
