# Checkout Loyalty Tier Progress Row — Design

## Context

Sourced from a NotebookLM CRO library (81 sources, general e-commerce conversion
principles). Most of its checklist (trust badges, checkout progress steps, minimal
form fields, cross-sell/upsell modals, dietary-tag clarity, toast confirmations) is
already implemented in this codebase — the diner ordering funnel
(`PublicMenuPage` → `ItemWithOptions` → `CartDrawer` → `CheckoutPage`) is more
CRO-mature than a typical starter e-commerce site. Menu-homepage trust/rating
badges were explicitly rejected: a diner who already scanned a table QR code is
not cold traffic deciding whether to trust the restaurant.

The one genuine, non-redundant gap: the backend already computes VIP tier
progress (`tier`, `tierMultiplier`, `tierProgressPercent`, `pointsToNextTier`,
`nextTierName` via `buildRewardSummary()` in `loyalty.service.ts`) and ships it
to the frontend on every `GET /loyalty/:id/config` / `POST /loyalty/:id/enroll`
call that `CheckoutPage` already makes — but nothing in the ordering flow
displays it. It's the notebook's own headline principle (prioritize RPV/AOV via
visible progress-to-reward) and the data is already sitting unused in
`loyaltyData` state.

## Scope

Single additive UI change. No new endpoints, no new state, no change to
pricing/discount/redemption logic (money-critical code stays untouched).

**In scope:** one JSX block inside `CheckoutPage.tsx`'s existing
`{user && restaurantId && restaurantConfig?.isLoyaltyEnabled && (...)}` panel.

**Out of scope (explicitly rejected):**

- Cart drawer / item page / menu homepage changes — reviewed and already
  adequate or not applicable to a seated-diner (non-cold-traffic) context.
- Fake scarcity ("only 3 left"), free-shipping-style progress bars, abandoned-cart
  recovery emails — don't map to dine-in ordering (no shipping, no delayed
  cart abandonment, no live inventory data to back a scarcity claim honestly).
- Guest/anonymous diners — tier data requires an enrolled loyalty account
  (`user` present); guests see no change, same as today.

## UI

Layout "A" (compact inline), placed directly under the existing "N pts
available (€X value)" line, above the redeem-toggle row, inside the same card
— no new card, no added visual weight beyond one line + a thin progress bar.

- **Bronze/Silver:** `🥉/🥈 <Tier> · [progress bar tierProgressPercent%] · N pts to <nextTierName>`
- **Gold (max tier):** static badge, no bar — `🥇 Gold — earning 1.5x on every order`
  (driven by `pointsToNextTier === 0`, matches existing `tierInfo` "Max Tier" contract)

Reuses existing Tailwind primitives already in the file (same `primary/10`
card, `text-xs`/`text-[10px]` scale used elsewhere in this panel) — no new
design tokens.

## Data

All fields already present in `loyaltyData` (the `res.data` from
`GET /loyalty/:id/config` or `POST /loyalty/:id/enroll`, both hitting
`LoyaltyService.getPoints()` → `buildRewardSummary()`):

```
loyaltyData.tier              // 'Bronze' | 'Silver' | 'Gold'
loyaltyData.tierProgressPercent
loyaltyData.pointsToNextTier
loyaltyData.nextTierName
```

Per `CLAUDE.md`: frontend consumes tier info directly from the API, never
recomputes it client-side. This design follows that — no client-side tier math.

## i18n

New keys under the `checkout` namespace, added to whichever locale bundles
`src/locales/*/translation.json` currently ships (verify exact set at
implementation time — `en`/`bg`/`ro` are the confirmed baseline per
`CLAUDE.md`; the translation pipeline has since expanded to more UI locales,
so match whatever directories exist):

- `checkout.tierProgress.toNext` — "{{points}} pts to {{tier}}"
- `checkout.tierProgress.maxTier` — "Earning {{multiplier}}x on every order"
- Tier display names reuse the raw `Bronze`/`Silver`/`Gold` enum values with a
  small local emoji map — no translation needed for the enum itself.

## Testing

Extend `CheckoutPage.test.tsx` (or equivalent) with cases:

- Bronze/Silver: renders progress bar + "N pts to <nextTier>" using mocked
  `loyaltyData`.
- Gold: renders static max-tier badge, no progress bar.
- `!user` or `!restaurantConfig?.isLoyaltyEnabled`: row absent (panel doesn't
  render at all, existing behavior unchanged).

## Risk

Low. Presentational-only addition inside an already-conditionally-rendered
panel; no new network calls; no touch to `getTotal`, discount, or redemption
math. Isolated to a git worktree per user request — easy to discard if the
result isn't liked.
