# Customer Identity Linking — V1 / V2 Design

**Date:** 2026-08-07
**Status:** Proposed — not started
**Related:** `2026-06-10-tier-enforcement-round2-design.md`, `17.07.REPORT.md § M6`

---

## Problem

A customer who signs up by **phone** and later signs in by **email** ends up with two
separate accounts and two separate point balances. Same human, two identities, and
the points appear to vanish.

### Why it happens

`AuthService.verifyOtp` (`apps/backend/src/auth/auth.service.ts`) is login-and-register
in one step. It looks the customer up by whichever identifier arrived, and **creates a
new user when it finds nothing**:

```ts
user = await this.usersService.findByPhone(phone); // or findByEmail(email)
isNew = !user;
if (!user) {
  /* create CUSTOMER */
}
```

Nothing links the two lookups. Worse, the phone path fabricates a placeholder address so
the non-null `email` column can be satisfied:

```ts
const placeholderEmail = `phone-${phone.replace(/\D/g, "")}@phone.local`;
```

So a phone-first customer already occupies the email field with a synthetic value that
will never match their real address.

### Constraint from the product side

Asking for phone **and** email at signup is rejected: a guest mid-meal who is asked for
both wonders why a restaurant needs two ways to contact them, and drops off. Picking
exactly one channel forever is also unattractive — phone costs money per message, email
is weaker at the table.

---

## Design principle

> **A second identifier may only ever be _added to_ an authenticated account.
> It must never be able to _create_ one.**

That single rule is what prevents divergence. Two accounts can only appear because the
second identifier is currently a valid account-creation path. Close that, and the split
cannot happen — no extra question at signup required.

---

## V1 — Prevent new splits

**Goal:** no _new_ fragmented identities. Existing duplicates are out of scope (V2).

### Scope

1. **Public login stays one field.**
   No channel picker in the signup path — a choice is where the confusion starts.
   Recommended primary: **phone**. Guest is present with phone in hand, SMS needs no
   app-switching, and the SIM-gateway provider (`smsProvider() === 'smsgateway'`) already
   makes per-message cost flat rather than Twilio's per-message rate.
   _This is a reversible product call — the structure below is identical if email is
   chosen as primary. What must not change is that only ONE identifier creates accounts._

2. **Add a verified second identifier from inside the session.**
   New authenticated endpoints:
   - `POST /auth/identity/add` — `{ email }` or `{ phone }`; issues an OTP to the _new_
     identifier. Requires a valid session for the account being modified.
   - `POST /auth/identity/verify` — `{ code }`; on success writes the identifier onto
     **the existing user row**, replacing any `@phone.local` placeholder.

3. **Profile UI affordance.**
   One optional row on `CustomerProfilePage`, framed as a benefit rather than a data
   request: _"Add your email — get receipts, and keep your points if you change phone."_

4. **Collision handling.**
   If the identifier already belongs to another account, **refuse** with a distinct error
   (`IDENTITY_IN_USE`). Do not silently merge, do not silently steal. Merging is V2.

5. **Placeholder cleanup.**
   Adding a real email replaces `phone-…@phone.local`. `User.email` is unique, so this
   must run inside a transaction that re-checks the collision case.

### Acceptance criteria

- Signing up by phone, then adding an email, then signing in by that email resolves to
  **one** account with the original points.
- Signing in by an email that no account holds still creates an account (email remains a
  valid _primary_ path for email-first customers) — but adding an email to an existing
  session never does.
- Adding an identifier already held elsewhere returns `IDENTITY_IN_USE` and mutates
  nothing.
- Adding an identifier requires an authenticated session; an unauthenticated call is
  rejected before any OTP is sent (no user enumeration via send-side probing).
- OTP rate limits and the existing 60s cooldown apply to the add-identity flow.

### Tests

- `auth.service.spec.ts` — add/verify happy path; collision; placeholder replacement;
  unauthenticated rejection; expired/invalid code.
- Regression: phone→email sign-in returns the same `user.id`.

---

## V2 — Merge accounts that already split

**Goal:** repair duplicates created before V1, and give support a safe path when a
customer proves ownership of both.

Substantially harder than V1 and should not be attempted alongside it. The point ledger
is FIFO with expiry batches (`loyalty-ledger.utils.ts`), so a merge is not
`UPDATE ... SET userId`.

### Scope

1. **Detection.** Report candidate duplicates. There is no shared key by construction, so
   matching is heuristic — e.g. same `Order.customerPhone`/name across accounts, or
   customer-initiated ("I have another account").

2. **Merge operation**, in one transaction:
   - Re-point `LoyaltyAccount` rows. Where both accounts hold an account at the _same_
     restaurant, balances must combine **without collapsing expiry batches** — each
     `LoyaltyPointLedger` batch keeps its own `expiresAt` and `remainingPoints`, or
     customers silently gain or lose expiry runway.
   - Re-point `Order.customerId`, `Feedback` via invitation, `PushSubscription`.
   - Preserve the surviving account's identifiers; archive the absorbed one rather than
     hard-deleting, so the merge is auditable and reversible.
   - Write an `AdminAuditLog` entry in the same transaction, matching the existing
     dangerous-action pattern.

3. **Authorisation.** Customer-initiated merge requires OTP proof of **both** identifiers.
   Admin-initiated merge is a dangerous action: `@Matches(/^CONFIRM$/)` DTO field,
   dedicated throttle, audit log.

### Risks

- **Double-spend during merge** — a redemption racing the merge could spend the same
  points twice. Lock both loyalty accounts (`lockLoyaltyAccountRow`) for the duration.
- **Unique constraint collisions** on `email` / `phone` when both rows carry real values.
- **Irreversibility** if the absorbed row is deleted. Archive, do not delete.
- Merging must never resurrect a disabled account (`isActive === false`).

---

## Open decisions

1. **Primary channel: phone or email?** Affects V1 step 1 only; structure is unchanged.
   Phone recommended (guest present, SIM gateway already built).
2. **Should `CUSTOMERS_AUTH` gate customer login at all?**
   `checkCustomersAuthFeature()` opens with `if (!restaurantId) return;`, and
   `CustomerLoginModal` posts only `{ email }` / `{ phone }` — so the tier gate never
   fires in the real flow and every plan gets customer accounts.
   Deliberately **not** fixed alongside the loyalty gating, because enforcing it changes
   _who can log in at all_ — a product decision, not a leak. The loyalty data leak it was
   masking is fixed separately at the data layer.
   If enforced: modal must send `restaurantId`, and the early return must go.
3. **Do loyalty-less accounts still have value on FREE tier?** If yes, keep customer auth
   ungated and rely on the data-layer entitlement filter alone.
