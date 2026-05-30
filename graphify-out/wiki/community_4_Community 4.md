# Community 4

**Community 4** — 38 nodes

## Nodes

### Waiter Point-of-Sale at /staff/pos Р Р†Р вЂљРІР‚Сњ full-viewport mobile-first tableside ordering, isolated PosContext, seat-level grouping, 3 session-end actions
- **ID:** `WaiterPOS`
- **Type:** code
- **Degree:** 16
- **Source:** `docs/superpowers/plans/2026-05-09-waiter-pos-plan.md`
- **Outbound:**
  - → `Isolated POS cart state Р Р†Р вЂљРІР‚Сњ in-memory only, PosCartItem with submitted flag, PosSession, 15 methods, completely separate from customer CartContext` [_`depends_on`_ | EXTRACTED | score: 1.0]
  - → `Auth guard for staff roles Р Р†Р вЂљРІР‚Сњ allows OWNER+STAFF, redirects unauthenticated to /login, CUSTOMER to /profile` [_`uses`_ | EXTRACTED | score: 1.0]
  - → `Third layout (alongside AppLayout and PublicLayout) Р Р†Р вЂљРІР‚Сњ full-viewport shell with sticky top bar, scrollable content, fixed bottom action bar, safe-area insets` [_`has_layout`_ | EXTRACTED | score: 1.0]
  - → `Radix Dialog table grid Р Р†Р вЂљРІР‚Сњ getTablesWithStatus() with live status colors, Force Open button for overriding open sessions` [_`uses`_ | EXTRACTED | score: 1.0]
  - → `Slide-up cart panel Р Р†Р вЂљРІР‚Сњ items grouped by seat, qty controls, submit button with pending count/total, split bill, QR bill` [_`uses`_ | EXTRACTED | score: 1.0]
  - → `Seat selector pill row Р Р†Р вЂљРІР‚Сњ Seat 1 | Seat 2 | Seat 3 | Shared, sets activeSeat in PosContext` [_`uses`_ | EXTRACTED | score: 1.0]
  - → `Split bill calculator Р Р†Р вЂљРІР‚Сњ pure UI math: (getTotal() / n).toFixed(2), capped at 20 people` [_`uses`_ | EXTRACTED | score: 1.0]
  - → `QR code bill display Р Р†Р вЂљРІР‚Сњ QRCodeSVG pointed at session bill URL, size 256` [_`uses`_ | EXTRACTED | score: 1.0]
  - → `Sticky horizontal category filter pills Р Р†Р вЂљРІР‚Сњ overflow-x-auto scrollbar-hide, active state with bg-accent/10 border border-accent` [_`uses`_ | EXTRACTED | score: 1.0]
  - → `Order specialRequests serialization Р Р†Р вЂљРІР‚Сњ per-seat item notes aggregated: '[Seat 1] Ribeye: no salt | [Seat 2] Salmon: extra lemon | [Shared] Water'` [_`uses`_ | EXTRACTED | score: 1.0]
  - → `Waiter POS design spec Р Р†Р вЂљРІР‚Сњ architecture decisions, component tree, data flow, session lifecycle, styling rules` [_`implements`_ | EXTRACTED | score: 1.0]
  - → `forceOpenSession() Р Р†Р вЂљРІР‚Сњ backend method: close any existing OPEN session, create new TableSession with status OPEN, return {token, id}` [_`calls`_ | EXTRACTED | score: 1.0]
  - → `closeSessionWithCard() Р Р†Р вЂљРІР‚Сњ backend method: sum order totals, create MYPOS Payment record, set session PAID, emit socket events` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `Radix Dialog for menu option selection Р Р†Р вЂљРІР‚Сњ VARIATION/ADDON choice selection + item note input, mounted-root pattern for performance` [_`uses`_ | c81]

### Stripe Connect pay-at-table Р Р†Р вЂљРІР‚Сњ IPaymentProvider interface, StripeProvider, PaymentService, PaymentIntent, webhooks, TableSession/Payment models
- **ID:** `StripeConnectPayments`
- **Type:** code
- **Degree:** 7
- **Source:** `docs/superpowers/plans/2026-05-06-stripe-payments.md`
- **Outbound:**
  - → `TableSession model Р Р†Р вЂљРІР‚Сњ groups orders per browser session, statuses: OPEN/PAID/CLOSED_NO_PAYMENT` [_`depends_on`_ | EXTRACTED | score: 1.0]
  - → `Payment provider interface Р Р†Р вЂљРІР‚Сњ abstracts StripeProvider, future MyPOS, Square implementations behind common contract` [_`implements`_ | EXTRACTED | score: 1.0]
  - → `3-step payment UI Р Р†Р вЂљРІР‚Сњ tip selection, Stripe Elements card input, confirmation with receipt` [_`has_ui_component`_ | EXTRACTED | score: 1.0]
  - → `Notification context + NotificationBell (badge count) + PaymentToast (slide-in) for real-time payment confirmations` [_`uses`_ | EXTRACTED | score: 1.0]
  - → `WebSocket gateway (socket.io) Р Р†Р вЂљРІР‚Сњ emits table:status-changed, payment:confirmed, newOrder events for real-time updates` [_`uses`_ | EXTRACTED | score: 1.0]
  - → `Stripe Connect design spec Р Р†Р вЂљРІР‚Сњ platform model, TableSession/Payment DB models, backend architecture, onboarding flow, MyPOS future integration` [_`implements`_ | EXTRACTED | score: 1.0]
  - → `Stripe Connect Express account onboarding Р Р†Р вЂљРІР‚Сњ generateConnectLink(), getStripeStatus(), disconnectStripe() in RestaurantsService` [_`uses`_ | EXTRACTED | score: 1.0]

### Platform-managed DeepL API translation Р Р†Р вЂљРІР‚Сњ 3 paths: fire-and-forget pre-warm, Translate All button, lazy on-demand with DB caching, 300ms rate limiting, free/pro tier detection
- **ID:** `DeepLTranslationService`
- **Type:** code
- **Degree:** 5
- **Source:** `docs/superpowers/plans/2026-05-05-analytics-translation.md`
- **Outbound:**
  - → `Translation architecture design Р Р†Р вЂљРІР‚Сњ platform key (DEEPL_API_KEY env var), no per-restaurant key, 3 translation paths, targetLanguages validation, lang query param` [_`implements`_ | EXTRACTED | score: 1.0]
  - → `Analytics fixes Р Р†Р вЂљРІР‚Сњ staleTime:0, socket-driven cache invalidation, Luxon timezone-aware date/hour grouping, dark mode Recharts axis colors` [_`bundled_with`_ | EXTRACTED | score: 1.0]
  - → `All i18n key additions for customer pages, dashboard, menu editor, global chrome Р Р†Р вЂљРІР‚Сњ ~70 new keys across EN/BG/RO` [_`builds_on`_ | EXTRACTED | score: 1.0]

### TableSession model Р Р†Р вЂљРІР‚Сњ groups orders per browser session, statuses: OPEN/PAID/CLOSED_NO_PAYMENT
- **ID:** `TableSession_Model`
- **Type:** code
- **Degree:** 5
- **Source:** `docs/superpowers/plans/2026-05-06-stripe-payments.md`
- **Outbound:**
  - → `Table detail modal Р Р†Р вЂљРІР‚Сњ shows orders with item names + payment info for active table sessions` [_`reads`_ | INFERRED | score: 0.85]
  - → `Waiter Point-of-Sale at /staff/pos Р Р†Р вЂљРІР‚Сњ full-viewport mobile-first tableside ordering, isolated PosContext, seat-level grouping, 3 session-end actions` [_`depends_on`_ | EXTRACTED | score: 1.0]
  - → `forceOpenSession() Р Р†Р вЂљРІР‚Сњ backend method: close any existing OPEN session, create new TableSession with status OPEN, return {token, id}` [_`manipulates`_ | EXTRACTED | score: 1.0]
  - → `closeSessionWithCard() Р Р†Р вЂљРІР‚Сњ backend method: sum order totals, create MYPOS Payment record, set session PAID, emit socket events` [_`manipulates`_ | EXTRACTED | score: 1.0]

### Analytics fixes Р Р†Р вЂљРІР‚Сњ staleTime:0, socket-driven cache invalidation, Luxon timezone-aware date/hour grouping, dark mode Recharts axis colors
- **ID:** `Analytics_Fixes`
- **Type:** code
- **Degree:** 4
- **Source:** `docs/superpowers/plans/2026-05-05-analytics-translation.md`
- **Outbound:**
  - → `Analytics redesign spec Р Р†Р вЂљРІР‚Сњ staleTime bug, timezone inconsistency, socket-driven invalidation strategy` [_`implements`_ | EXTRACTED | score: 1.0]
  - → `Recharts dark mode fix Р Р†Р вЂљРІР‚Сњ XAxis/YAxis tick fills from 'currentColor' to explicit 'hsl(var(--color-muted-foreground))', custom ChartTooltip with glass-panel` [_`part_of`_ | INFERRED | score: 0.85]

### Slide-up cart panel Р Р†Р вЂљРІР‚Сњ items grouped by seat, qty controls, submit button with pending count/total, split bill, QR bill
- **ID:** `PosCartDrawer`
- **Type:** code
- **Degree:** 4
- **Source:** `docs/superpowers/plans/2026-05-09-waiter-pos-plan.md`
- **Outbound:**
  - → `Split bill calculator Р Р†Р вЂљРІР‚Сњ pure UI math: (getTotal() / n).toFixed(2), capped at 20 people` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `QR code bill display Р Р†Р вЂљРІР‚Сњ QRCodeSVG pointed at session bill URL, size 256` [_`contains`_ | EXTRACTED | score: 1.0]

### CartDrawer component Р Р†Р вЂљРІР‚Сњ glass-panel slide-out via createPortal, seat-grouped items, resolveItemName for live translation sync
- **ID:** `CartDrawer`
- **Type:** code
- **Degree:** 3
- **Source:** `scratch_CartDrawer_portal.txt`
- **Outbound:**
  - → `Cart language sync utility Р Р†Р вЂљРІР‚Сњ looks up live translated name from categories prop by item ID and lang key, bypassing stale add-time name snapshot` [_`uses`_ | EXTRACTED | score: 1.0]
  - → `POS cart item type Р Р†Р вЂљРІР‚Сњ cartId (uuid), menuItemId, price, quantity, selectedOptions, seatNumber, itemNote, submitted boolean flag` [_`conceptually_related_to`_ | INFERRED | score: 0.8]
  - → `Slide-up cart panel Р Р†Р вЂљРІР‚Сњ items grouped by seat, qty controls, submit button with pending count/total, split bill, QR bill` [_`semantically_similar_to`_ | INFERRED | score: 0.85]

### WebSocket gateway (socket.io) Р Р†Р вЂљРІР‚Сњ emits table:status-changed, payment:confirmed, newOrder events for real-time updates
- **ID:** `EventsGateway`
- **Type:** code
- **Degree:** 3
- **Source:** `docs/superpowers/plans/2026-05-06-stripe-payments.md`
- **Outbound:**
  - → `Dashboard Live Table View Р Р†Р вЂљРІР‚Сњ getTablesWithStatus() with parallel Promise.all, filter modes (Active/Occupied/Paid/All), color-coded TableCard, socket-driven invalidation` [_`updates`_ | EXTRACTED | score: 1.0]
  - → `Waiter Point-of-Sale at /staff/pos Р Р†Р вЂљРІР‚Сњ full-viewport mobile-first tableside ordering, isolated PosContext, seat-level grouping, 3 session-end actions` [_`indirectly_depends_on`_ | EXTRACTED | score: 1.0]

### Translation architecture design Р Р†Р вЂљРІР‚Сњ platform key (DEEPL_API_KEY env var), no per-restaurant key, 3 translation paths, targetLanguages validation, lang query param
- **ID:** `TranslationArchitecture`
- **Type:** document
- **Degree:** 3
- **Source:** `docs/superpowers/specs/2026-05-05-analytics-translation-design.md`
- **Outbound:**
  - → `i18next translation JSON files Р Р†Р вЂљРІР‚Сњ EN/BG/RO locales with ~200+ keys covering auth, menu, dashboard, checkout, profile, POS` [_`uses`_ | EXTRACTED | score: 1.0]
  - → `Analytics redesign spec Р Р†Р вЂљРІР‚Сњ staleTime bug, timezone inconsistency, socket-driven invalidation strategy` [_`bundled_with`_ | EXTRACTED | score: 1.0]

### All i18n key additions for customer pages, dashboard, menu editor, global chrome Р Р†Р вЂљРІР‚Сњ ~70 new keys across EN/BG/RO
- **ID:** `TranslationCompleteness`
- **Type:** code
- **Degree:** 3
- **Source:** `docs/superpowers/plans/2026-05-05-translation-completeness.md`
- **Outbound:**
  - → `Translation gaps design spec Р Р†Р вЂљРІР‚Сњ two bug classes (hardcoded strings, missing locale keys), three phases, duplicate language picker fix, QR print CSS fix` [_`implements`_ | EXTRACTED | score: 1.0]
  - → `i18next translation JSON files Р Р†Р вЂљРІР‚Сњ EN/BG/RO locales with ~200+ keys covering auth, menu, dashboard, checkout, profile, POS` [_`extends`_ | EXTRACTED | score: 1.0]

### Waiter POS design spec Р Р†Р вЂљРІР‚Сњ architecture decisions, component tree, data flow, session lifecycle, styling rules
- **ID:** `WaiterPOS_Design`
- **Type:** document
- **Degree:** 3
- **Source:** `docs/superpowers/specs/2026-05-09-waiter-pos-design.md`

### closeSessionWithCard() Р Р†Р вЂљРІР‚Сњ backend method: sum order totals, create MYPOS Payment record, set session PAID, emit socket events
- **ID:** `closeSessionWithCard`
- **Type:** code
- **Degree:** 3
- **Source:** `docs/superpowers/plans/2026-05-09-waiter-pos-plan.md`

### i18next translation JSON files Р Р†Р вЂљРІР‚Сњ EN/BG/RO locales with ~200+ keys covering auth, menu, dashboard, checkout, profile, POS
- **ID:** `i18next_Locale_Files`
- **Type:** code
- **Degree:** 3
- **Source:** `docs/superpowers/specs/2026-05-05-translation-completeness-design.md`

### Analytics redesign spec Р Р†Р вЂљРІР‚Сњ staleTime bug, timezone inconsistency, socket-driven invalidation strategy
- **ID:** `AnalyticsDesign`
- **Type:** document
- **Degree:** 2
- **Source:** `docs/superpowers/specs/2026-05-05-analytics-translation-design.md`

### Dayparting (scheduled category availability) Р Р†Р вЂљРІР‚Сњ HIDDEN/ALWAYS/SCHEDULED modes, dayOfWeek array + time window with overnight range support, Luxon timezone-aware
- **ID:** `DaypartingLogic`
- **Type:** code
- **Degree:** 2
- **Source:** `scratch_new_getPublicMenu.txt`
- **Outbound:**
  - → `Platform-managed DeepL API translation Р Р†Р вЂљРІР‚Сњ 3 paths: fire-and-forget pre-warm, Translate All button, lazy on-demand with DB caching, 300ms rate limiting, free/pro tier detection` [_`conceptually_related_to`_ | INFERRED | score: 0.6]

### Payment provider interface Р Р†Р вЂљРІР‚Сњ abstracts StripeProvider, future MyPOS, Square implementations behind common contract
- **ID:** `IPaymentProvider`
- **Type:** code
- **Degree:** 2
- **Source:** `docs/superpowers/plans/2026-05-06-stripe-payments.md`
- **Outbound:**
  - → `closeSessionWithCard() Р Р†Р вЂљРІР‚Сњ backend method: sum order totals, create MYPOS Payment record, set session PAID, emit socket events` [_`abstracts`_ | INFERRED | score: 0.7]

### POS cart item type Р Р†Р вЂљРІР‚Сњ cartId (uuid), menuItemId, price, quantity, selectedOptions, seatNumber, itemNote, submitted boolean flag
- **ID:** `PosCartItem`
- **Type:** code
- **Degree:** 2
- **Source:** `docs/superpowers/plans/2026-05-09-waiter-pos-plan.md`

### Isolated POS cart state Р Р†Р вЂљРІР‚Сњ in-memory only, PosCartItem with submitted flag, PosSession, 15 methods, completely separate from customer CartContext
- **ID:** `PosContext`
- **Type:** code
- **Degree:** 2
- **Source:** `docs/superpowers/plans/2026-05-09-waiter-pos-plan.md`
- **Outbound:**
  - → `POS cart item type Р Р†Р вЂљРІР‚Сњ cartId (uuid), menuItemId, price, quantity, selectedOptions, seatNumber, itemNote, submitted boolean flag` [_`manages`_ | EXTRACTED | score: 1.0]

### Third layout (alongside AppLayout and PublicLayout) Р Р†Р вЂљРІР‚Сњ full-viewport shell with sticky top bar, scrollable content, fixed bottom action bar, safe-area insets
- **ID:** `PosLayout`
- **Type:** code
- **Degree:** 2
- **Source:** `docs/superpowers/plans/2026-05-09-waiter-pos-plan.md`
- **Outbound:**
  - → `Waiter POS design spec Р Р†Р вЂљРІР‚Сњ architecture decisions, component tree, data flow, session lifecycle, styling rules` [_`specifies`_ | EXTRACTED | score: 1.0]

### QR code bill display Р Р†Р вЂљРІР‚Сњ QRCodeSVG pointed at session bill URL, size 256
- **ID:** `PosQRBill`
- **Type:** code
- **Degree:** 2
- **Source:** `docs/superpowers/plans/2026-05-09-waiter-pos-plan.md`

### Split bill calculator Р Р†Р вЂљРІР‚Сњ pure UI math: (getTotal() / n).toFixed(2), capped at 20 people
- **ID:** `PosSplitBill`
- **Type:** code
- **Degree:** 2
- **Source:** `docs/superpowers/plans/2026-05-09-waiter-pos-plan.md`

### Recharts dark mode fix Р Р†Р вЂљРІР‚Сњ XAxis/YAxis tick fills from 'currentColor' to explicit 'hsl(var(--color-muted-foreground))', custom ChartTooltip with glass-panel
- **ID:** `RechartsDarkMode`
- **Type:** code
- **Degree:** 2
- **Source:** `docs/superpowers/plans/2026-05-06-remaining-fixes-customer-auth.md`
- **Cross-community:**
  - ↔ `Email OTP authentication Р Р†Р вЂљРІР‚Сњ VerificationToken model, bcrypt-hashed 6-digit code, 10-min expiry, 60s rate limit, Resend REST API, dev mode code logging` [_`bundled_with`_ | c81]

### forceOpenSession() Р Р†Р вЂљРІР‚Сњ backend method: close any existing OPEN session, create new TableSession with status OPEN, return {token, id}
- **ID:** `forceOpenSession`
- **Type:** code
- **Degree:** 2
- **Source:** `docs/superpowers/plans/2026-05-09-waiter-pos-plan.md`

### Public menu service method Р Р†Р вЂљРІР‚Сњ fetches restaurant, dayparting-filtered categories, in-stock items ordered by sort order
- **ID:** `getPublicMenu`
- **Type:** code
- **Degree:** 2
- **Source:** `scratch_new_getPublicMenu.txt`
- **Outbound:**
  - → `Dayparting (scheduled category availability) Р Р†Р вЂљРІР‚Сњ HIDDEN/ALWAYS/SCHEDULED modes, dayOfWeek array + time window with overnight range support, Luxon timezone-aware` [_`implements`_ | EXTRACTED | score: 1.0]
  - → `Platform-managed DeepL API translation Р Р†Р вЂљРІР‚Сњ 3 paths: fire-and-forget pre-warm, Translate All button, lazy on-demand with DB caching, 300ms rate limiting, free/pro tier detection` [_`calls`_ | INFERRED | score: 0.8]

### Cart language sync utility Р Р†Р вЂљРІР‚Сњ looks up live translated name from categories prop by item ID and lang key, bypassing stale add-time name snapshot
- **ID:** `resolveItemName`
- **Type:** code
- **Degree:** 2
- **Source:** `scratch_CartDrawer_portal.txt`
- **Outbound:**
  - → `i18next translation JSON files Р Р†Р вЂљРІР‚Сњ EN/BG/RO locales with ~200+ keys covering auth, menu, dashboard, checkout, profile, POS` [_`depends_on`_ | INFERRED | score: 0.9]

### Order specialRequests serialization Р Р†Р вЂљРІР‚Сњ per-seat item notes aggregated: '[Seat 1] Ribeye: no salt | [Seat 2] Salmon: extra lemon | [Shared] Water'
- **ID:** `specialRequests_Serialization`
- **Type:** code
- **Degree:** 2
- **Source:** `docs/superpowers/plans/2026-05-09-waiter-pos-plan.md`
- **Outbound:**
  - → `Waiter POS design spec Р Р†Р вЂљРІР‚Сњ architecture decisions, component tree, data flow, session lifecycle, styling rules` [_`specifies`_ | EXTRACTED | score: 1.0]

### Analytics CSV export with UTF-8 BOM for Excel Cyrillic support, category breakdown and orders by table data
- **ID:** `CSV_Export_Analytics`
- **Type:** code
- **Degree:** 1
- **Source:** `SESSION_CHANGES.md`
- **Outbound:**
  - → `Analytics fixes Р Р†Р вЂљРІР‚Сњ staleTime:0, socket-driven cache invalidation, Luxon timezone-aware date/hour grouping, dark mode Recharts axis colors` [_`part_of`_ | INFERRED | score: 0.8]

### Dashboard Live Table View Р Р†Р вЂљРІР‚Сњ getTablesWithStatus() with parallel Promise.all, filter modes (Active/Occupied/Paid/All), color-coded TableCard, socket-driven invalidation
- **ID:** `LiveTablesView`
- **Type:** code
- **Degree:** 1
- **Source:** `docs/superpowers/plans/2026-05-09-waiter-pos-plan.md`

### Notification context + NotificationBell (badge count) + PaymentToast (slide-in) for real-time payment confirmations
- **ID:** `NotificationContext`
- **Type:** code
- **Degree:** 1
- **Source:** `docs/superpowers/plans/2026-05-06-stripe-payments.md`

### 3-step payment UI Р Р†Р вЂљРІР‚Сњ tip selection, Stripe Elements card input, confirmation with receipt
- **ID:** `PaymentModal`
- **Type:** code
- **Degree:** 1
- **Source:** `docs/superpowers/plans/2026-05-06-stripe-payments.md`

### Sticky horizontal category filter pills Р Р†Р вЂљРІР‚Сњ overflow-x-auto scrollbar-hide, active state with bg-accent/10 border border-accent
- **ID:** `PosCategoryFilter`
- **Type:** code
- **Degree:** 1
- **Source:** `docs/superpowers/plans/2026-05-09-waiter-pos-plan.md`

### Seat selector pill row Р Р†Р вЂљРІР‚Сњ Seat 1 | Seat 2 | Seat 3 | Shared, sets activeSeat in PosContext
- **ID:** `PosSeatSelector`
- **Type:** code
- **Degree:** 1
- **Source:** `docs/superpowers/plans/2026-05-09-waiter-pos-plan.md`

### Radix Dialog table grid Р Р†Р вЂљРІР‚Сњ getTablesWithStatus() with live status colors, Force Open button for overriding open sessions
- **ID:** `PosTableModal`
- **Type:** code
- **Degree:** 1
- **Source:** `docs/superpowers/plans/2026-05-09-waiter-pos-plan.md`

### Auth guard for staff roles Р Р†Р вЂљРІР‚Сњ allows OWNER+STAFF, redirects unauthenticated to /login, CUSTOMER to /profile
- **ID:** `StaffRoute`
- **Type:** code
- **Degree:** 1
- **Source:** `docs/superpowers/plans/2026-05-09-waiter-pos-plan.md`

### Stripe Connect design spec Р Р†Р вЂљРІР‚Сњ platform model, TableSession/Payment DB models, backend architecture, onboarding flow, MyPOS future integration
- **ID:** `StripeConnect_Design`
- **Type:** document
- **Degree:** 1
- **Source:** `docs/superpowers/specs/2026-05-06-stripe-payments-design.md`

### Stripe Connect Express account onboarding Р Р†Р вЂљРІР‚Сњ generateConnectLink(), getStripeStatus(), disconnectStripe() in RestaurantsService
- **ID:** `StripeConnect_Onboarding`
- **Type:** code
- **Degree:** 1
- **Source:** `docs/superpowers/plans/2026-05-06-stripe-payments.md`

### Table detail modal Р Р†Р вЂљРІР‚Сњ shows orders with item names + payment info for active table sessions
- **ID:** `TableDetailModal`
- **Type:** code
- **Degree:** 1
- **Source:** `docs/superpowers/plans/2026-05-09-waiter-pos-plan.md`

### Translation gaps design spec Р Р†Р вЂљРІР‚Сњ two bug classes (hardcoded strings, missing locale keys), three phases, duplicate language picker fix, QR print CSS fix
- **ID:** `TranslationGaps_Design`
- **Type:** document
- **Degree:** 1
- **Source:** `docs/superpowers/specs/2026-05-05-translation-completeness-design.md`
