# Pricing and tier-entitlement review

**Status:** Active discovery track — 5 Sep 2026

## Objective

Align the commercial promise, backend entitlements, customer-facing pricing
page, and measurable notification costs before changing prices or enforcing
usage limits. This is a product review track, not another P2/P3 security loop.

## Starting evidence

- The pricing page currently presents four tiers: FREE, STARTER,
  PROFESSIONAL, and ENTERPRISE, with monthly/yearly billing and a frontend
  feature comparison matrix.
- Reservations are currently gated at PROFESSIONAL+ through the effective-tier
  feature service. The review must decide whether that access boundary and its
  upgrade experience are commercially correct.
- SMS accounting is currently **track-only**. The default allowance is 50
  included segments/month for PROFESSIONAL and 200 for ENTERPRISE; FREE and
  STARTER have zero included segments. Usage is measured in SMS segments using
  the restaurant's IANA timezone, with separate estimated and provider costs.
- The usage summary already exposes effective tier, included/used/remaining/
  overage segments, delivery count, and cost summaries. It is the evidence
  seam for a later warning or billing decision, not an enforcement decision.
- Segment math distinguishes GSM-7 and UCS-2 messages, including multipart
  thresholds. The policy must therefore be expressed in segments, not sends.

## Questions to resolve

1. **Package and entitlement matrix** — Which capabilities belong in each tier,
   and which are hard entitlements versus usage allowances? Reconcile the
   frontend matrix, backend `FeatureFlag` definitions, effective `forceTier`
   behavior, and upgrade/downgrade semantics.
2. **Reservation access** — Keep reservations at PROFESSIONAL+, introduce a
   lighter reservation tier, or separate booking access from notification
   volume? Define what remains usable when notification delivery fails or an
   allowance is exhausted.
3. **Included SMS segments** — Validate 50/200 against observed restaurant
   usage and provider invoices after a complete billing period. Decide whether
   allowances are per restaurant, pooled across an account, or prorated on
   mid-month tier changes.
4. **Overage policy** — Choose hard stop, prepaid/purchased packs,
   pay-as-you-go, or a grace period. Define caps, warnings, owner consent,
   retries, failed messages, multipart billing, timezone boundaries, and what
   happens during tier changes. Keep reservation creation independent until a
   policy is approved and implemented.
5. **Email/SMS positioning** — Separate transactional email, transactional SMS,
   OTP, reservation lifecycle messages, and future marketing campaigns. Decide
   which channel is included, which is an add-on, and how reliability,
   deliverability, opt-in, and regional cost are communicated on the pricing
   page.

## Planned slices

- Produce one canonical tier/entitlement/usage table with owner-approved
  decisions and explicit unresolved cells.
- Compare real usage-dashboard observations with provider cost evidence and
  scenario-model reservation volumes, GSM-7/UCS-2 multipart traffic, and
  mid-month tier changes.
- Specify the owner-facing warning and overage states before any enforcement
  code or billing integration.
- Reconcile backend gates, frontend pricing copy, upgrade UX, and translated
  messaging; add contract tests only after the policy is approved.

## Non-goals and guardrails

- No price, tier, reservation, or SMS enforcement change is authorized by this
  brief alone.
- No backend deployment, isolated-staging activation, real payment test,
  domain/DMARC/edge work, or credential-retirement work is part of this track.
- Do not delete, reset, truncate, or backfill application data. Any future
  accounting migration must remain additive and forward-only.

## Exit criteria

The review is complete when the owner has approved the canonical package matrix,
reservation rule, segment allowance/proration rules, overage policy, channel
positioning, warning states, and the smallest implementation slices with
acceptance tests and rollout/rollback notes.
