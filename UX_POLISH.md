You are a senior product designer, UX engineer, and frontend architect.

I am working on a production SaaS platform for restaurants: a mobile-first QR digital menu, ordering, payments, loyalty, table management, kitchen display, staff/POS tools, and analytics dashboard.

Your task is to polish the frontend UX/UI using UX Pro Max and frontend best practices.

IMPORTANT RULES:

1. Do NOT rewrite the whole app.
2. Do NOT change backend logic, API contracts, authentication, payments, permissions, or business logic unless absolutely necessary.
3. Do NOT break existing routes, translations, feature flags, roles, dark/light mode, or responsive behavior.
4. First inspect and understand the current structure before changing anything.
5. Work feature-by-feature and component-by-component.
6. Prefer small, safe, high-quality improvements over large risky redesigns.
7. Keep the product mobile-first.
8. Preserve the current technology stack and design system unless you find a clear problem.
9. Every change must support both light mode and dark mode.
10. Purple should be the main CTA/accent color.
11. The final UI should feel modern, premium, clean, fast, and app-like.

PROJECT CONTEXT:
This is not just a QR menu generator. It is a mobile-first restaurant SaaS operating platform.

Main customer-facing experience:

* Customer scans QR code
* Opens digital menu on phone
* Browses categories and dishes
* Searches/filter dishes
* Adds items to cart
* Places order
* Can request bill/payment
* Can use loyalty/rewards
* Can switch language
* Can use light/dark mode

Main dashboard experience:

* Restaurant owner/staff dashboard
* Menu management
* Orders
* Tables
* Payments
* Loyalty
* Analytics
* Staff management
* Kitchen display
* POS
* Settings
* SaaS billing/subscription

DESIGN GOAL:
Make the app feel like a premium modern SaaS product combined with a native mobile food ordering app.

Visual direction:

* Mobile-first
* Clean spacing
* Rounded cards
* Soft shadows
* Purple CTA buttons
* Smooth interactions
* Modern typography
* Clear hierarchy
* Glassmorphism only where tasteful
* Better empty states
* Better loading states
* Better skeleton screens
* Better micro-interactions
* Consistent cards, buttons, tabs, badges, and modals
* Strong dark mode support
* Light mode must feel bright and premium
* Dark mode must feel deep, modern, and OLED-like

INSPIRATION:
Use the provided homepage/dashboard mockup images only as visual inspiration, not as exact implementation requirements.

Focus especially on:

* Landing/home page
* Public mobile menu page
* Checkout/cart flow
* Dashboard overview
* Menu editor
* Orders page
* Tables/live tables
* Payments page
* Analytics page
* Settings/branding page
* POS mobile interface

PHASE 1 — INSPECTION ONLY:
Before making code changes:

1. Inspect the frontend folder structure.
2. Identify the routing structure.
3. Identify the layout components.
4. Identify the design system files.
5. Identify reusable UI components.
6. Identify how light/dark mode is implemented.
7. Identify the main public menu components.
8. Identify the dashboard components.
9. Identify Tailwind/CSS/theme configuration.
10. Identify risky areas where changes could break functionality.

Then produce:

* A short UI/UX audit
* A list of the highest-impact pages to polish first
* A file-by-file improvement plan
* Any risks you see
* A suggested implementation order

STOP after Phase 1 and wait for my approval before editing files.

PHASE 2 — IMPLEMENTATION AFTER APPROVAL:
When I approve, implement only the approved scope.

Implementation rules:

1. Keep changes focused.
2. Reuse existing components where possible.
3. Create reusable components only when they reduce duplication.
4. Improve consistency of spacing, typography, buttons, cards, tabs, modals, and forms.
5. Make sure every component works in light and dark mode.
6. Make sure mobile layouts are excellent, not just acceptable.
7. Use responsive Tailwind classes properly.
8. Do not hardcode colors randomly. Use theme tokens/design variables where possible.
9. Use purple as the primary CTA/accent.
10. Keep accessibility in mind: contrast, focus states, tap targets, keyboard navigation, aria labels where needed.
11. Keep customer-facing menu extremely fast and simple.
12. Keep dashboard information dense but readable.
13. Avoid unnecessary animation that hurts performance.
14. Do not remove working functionality.
15. Do not remove existing i18n keys unless you replace them properly.

MOBILE-FIRST UX REQUIREMENTS:
For customer menu:

* Thumb-friendly navigation
* Large tap targets
* Sticky category navigation if useful
* Clear search/filter UI
* Fast dish scanning
* Clean item cards
* Strong food imagery
* Clear price display
* Clear add-to-cart button
* Cart always easy to access
* Smooth checkout
* Good empty states
* Safe-area support for mobile devices
* No desktop-first patterns forced onto mobile

For dashboard:

* Clear overview cards
* Better visual hierarchy
* Better sidebar/header polish
* Better card consistency
* Better chart/card spacing
* Better table readability
* Better responsive behavior
* Dark mode must look intentional, not just inverted
* Important actions should use purple CTA style
* Destructive actions should remain visually separate

QUALITY CHECKS AFTER EACH IMPLEMENTATION:
After changes, run the appropriate checks available in the project, such as:

* TypeScript check
* Lint
* Build
* Tests if available

Then report:

1. What files were changed
2. What UX/UI was improved
3. What was intentionally not changed
4. Any risks or follow-up tasks
5. Whether build/type/lint checks passed

OUTPUT FORMAT:
Start with the audit and implementation plan.
Do not edit files until I approve.

Your first response should be:

* “I inspected the project.”
* “Here is the UX/UI audit.”
* “Here is the proposed implementation plan.”
* “Please approve Phase 2 before I modify files.”
