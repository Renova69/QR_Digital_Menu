# Landing Page FAQ + Dashboard Help Relocation

**Date:** 2026-05-22
**Status:** Approved

## Goal

Move help content out of the dashboard's primary tab bar. Add a pre-sale FAQ section to the public landing page (`/`). Keep full operator documentation accessible inside the authenticated dashboard via a secondary sidebar link.

## Changes

### 1. New: Landing Page FAQ Section

- **File:** `apps/frontend/src/components/landing/LandingFAQ.tsx` (new)
- **Placed in:** `HomePage.tsx` between Bottom CTA section and Footer
- **Content:** 5 pre-sale FAQ items in an accordion — targeting prospective restaurant owners
- **Style:** Matches HomePage's glass-panel aesthetic, same section wrapper pattern
- **i18n:** New keys under `landing.faq.*` in all three locale files
- **No search bar, no sidebar, no category nav** — simple vertical accordion

### 2. Modified: Dashboard Sidebar

- **File:** `apps/frontend/src/pages/DashboardPage.tsx`
- Remove `help` from `desktopNavItems` array (line 104-114)
- Add a `HelpCircle` sidebar footer link in the existing external-tools divider (after Kitchen/KDS)
- `?tab=help` route continues to work — HelpView component is untouched
- `SummaryView`'s `onViewHelp` prop continues to work

### 3. Unchanged

- `HelpView.tsx` — zero modifications
- All existing `help.*` i18n keys preserved
- Mobile bottom nav — help was never there, no change

## FAQ Questions (Landing Page)

Based on real restaurant owner concerns from market research + app feature knowledge.

| #   | Question                                      | Answer covers                                                                                                                                                                                    |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | What is QR Menu and how does it work?         | Scan→browse→order→pay flow. Customers scan table QR, see digital menu, place orders from phone. Kitchen/staff get orders instantly. No app download needed.                                      |
| 2   | Do I need special hardware or printers?       | No hardware required. Cloud-based. Print QR codes on any printer (A4 templates: Classic, Premium, Minimal). Tablets optional for POS/KDS. QR codes permanent — menu updates don't need reprint.  |
| 3   | How much does it cost? Are there hidden fees? | Starter €29/mo, Pro €79/mo, Enterprise €199/mo. No per-order commission. Stripe card processing fees standard. Cancel anytime, no lock-in.                                                       |
| 4   | How quickly can I go live?                    | Same day. Create restaurant profile, add tables, build menu, print QR codes. No technical skills needed.                                                                                         |
| 5   | How do tableside payments and tipping work?   | Stripe Connect. Customer taps "Request Bill" → sees itemized bill → selects tip % (customizable) → pays by card from phone. Split bill up to 20 people. Waiter can also close with card via POS. |
| 6   | Which languages does the menu support?        | Auto-translation via DeepL to English, Bulgarian, Romanian. Add target languages in Settings. "Translate All Now" batch-translates existing menu. Customer sees menu in their browser language.  |
| 7   | What about customer data privacy (GDPR)?      | Full GDPR compliance. Cookie consent banners. Auto-generated /privacy and /terms. Right-to-erasure: purge customer data with one click. No passwords stored — Email OTP login only.              |
| 8   | Can I try it before subscribing?              | Yes. Free trial, no credit card required. Full feature access during trial.                                                                                                                      |

## Files Touched

```
NEW  apps/frontend/src/components/landing/LandingFAQ.tsx
MOD  apps/frontend/src/pages/HomePage.tsx          (insert <LandingFAQ /> section)
MOD  apps/frontend/src/pages/DashboardPage.tsx     (move help link to sidebar footer)
MOD  apps/frontend/src/locales/en/translation.json (new landing.faq.* keys)
MOD  apps/frontend/src/locales/bg/translation.json (new landing.faq.* keys)
MOD  apps/frontend/src/locales/ro/translation.json (new landing.faq.* keys)
```

## UI/UX Refinement

After implementation, invoke `ui-ux-pro-max` skill to audit and polish:

- FAQ accordion animations and hover states
- Spacing/rhythm consistency with surrounding sections
- Typography hierarchy (section title, question, answer)
- Dark/light theme appearance
