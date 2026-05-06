# QR Menu App — Coding Roadmap

> **Last Updated:** May 6, 2026  
> **MVP Status:** ✅ Complete  
> **V2 Status:** ✅ Phases 9–14 Complete  
> **V2.5 Status:** ✅ Phases 15–17 + Mobile UX Overhaul + UI/UX Audit & Theme Polish Complete  
> **Bug Fixes & Polish (May 6, 2026):** ✅ Customer auth OTP, cart language sync, options pre-selection, QR print, analytics dark mode, translation gaps, menu health false positive  
> **Current Focus:** Bug fixes & polish only (Phases 18+ paused)

---

## 🟢 V1 — MVP (Complete)

All foundational phases were completed on **April 9, 2026**. The application is fully functional with digital menu management, QR code ordering, and a restaurant admin dashboard.

### Phase 1: Project Setup ✅

- NestJS backend with TypeScript
- Prisma ORM with PostgreSQL 15
- React 18 + Vite + TypeScript frontend
- Tailwind CSS, Radix UI, TanStack Query, dnd-kit
- Axios API client with interceptors
- Docker Compose for local development (backend, frontend, postgres)

### Phase 2: Authentication ✅

- JWT authentication with Passport.js
- Google OAuth sign-in (full end-to-end flow)
- Auth endpoints: `/api/auth/register`, `/api/auth/login`, `/api/auth/google`, `/api/auth/me`
- JWT stored in localStorage with auto-attach via Axios interceptors
- Protected routes with JWT guard (backend) and `<ProtectedRoute>` (frontend)
- 401 auto-redirect with public path exclusions
- React Error Boundary for graceful error handling

### Phase 3: Restaurant Management ✅

- Restaurant CRUD (`/api/restaurants`)
- Users can own and manage multiple restaurants
- Owner-only auth guards
- Restaurant context with active restaurant switching
- Create restaurant onboarding flow for new users

### Phase 4: Menu Builder & Image Upload ✅

- Category CRUD with ordering
- Menu item CRUD (name, description, price in EUR, allergens, dietary tags)
- Image upload for menu items (local file storage via `/uploads/`)
- Drag-and-drop reorder for categories and items (dnd-kit)
- "Out of Stock" toggle
- Variations & add-ons (MenuOption model with VARIATION/ADDON types)
- Side-by-side live preview in menu editor
- Options management modal

### Phase 5: Table Management & QR Codes ✅

- `RestaurantTable` model with CRUD endpoints
- Table management UI in dashboard
- QR code generation per table (react-qr-code)
- QR codes link to `/menu/public/:restaurantId?table=:tableName`
- QR code download as PNG
- Public menu captures table context from URL

### Phase 6: Contactless Ordering ✅

- Order creation with server-side price calculation (prevents manipulation)
- Option price modifiers included in total calculation
- Cart context with table number tracking
- Checkout flow (customer name + phone + special requests)
- Staff order management with status workflow: `NEW → IN_PROGRESS → SERVED → CANCELED`
- Order notification badge on dashboard

### Phase 7: Dashboard & Polish ✅

- Dashboard summary: orders today, total revenue, open assistance requests, recent orders
- Restaurant branding editor (logo upload, accent color)
- Restaurant branding applied to public menu
- Tabbed dashboard (Summary, Orders, Assistance, Tables, Menu Editor)
- Loading spinners and error states across all pages
- Responsive design

### Phase 8: Deployment & Production Readiness ✅

- Docker Compose with backend, frontend, postgres, test-app services
- Health check endpoints
- Rate limiting via `@nestjs/throttler`
- Swagger/OpenAPI documentation at `/api-docs`
- Environment variable configuration with `.env.example`
- Upload volume persistence
- Database migration strategy with Prisma

---

## 🔵 V2 — Premium Features (Complete)

### Phase 9: Smart Analytics Dashboard ✅

- Revenue trends chart (daily, weekly, monthly) via `AnalyticsView.tsx`
- Top best-selling items with revenue contribution
- Peak ordering hours heatmap
- Average order value (AOV) tracking
- Period comparison (7/14/30 days)
- Guest satisfaction metrics from feedback data

### Phase 10: Customer Feedback & Google Review Redirect ✅

- Post-order feedback form via `FeedbackPage.tsx`
- Star rating + optional comment
- Smart routing: 4-5 stars → redirect to Google Reviews page
- Smart routing: 1-3 stars → private feedback to owner
- `Feedback` Prisma model linked to orders and restaurants

### Phase 11: Automated Dayparting (Scheduled Menus) ✅

- `AvailabilityType` enum: `ALWAYS`, `SCHEDULED`, `HIDDEN`
- `startTime`, `endTime`, `daysOfWeek` fields on `MenuCategory`
- Admin UI for setting schedule per category
- Timezone support per restaurant (`timezone` field on `Restaurant`)
- Categories auto-show/hide on public menu based on schedule

### Phase 12: Multi-Language Menu ✅

- Language selector on public menu (EN, BG, RO)
- JSON `translations` field on `MenuCategory` and `MenuItem`
- DeepL API integration for auto-translation
- Manual override for translations
- Dashboard localized with i18next (EN, BG, RO)

### Phase 13: Real-Time Updates (WebSockets) ✅

- WebSocket gateway via `@nestjs/websockets` + Socket.io (`EventsGateway`)
- `SocketContext.tsx` on frontend with restaurant room joining
- Real-time order push notifications to staff dashboard
- Real-time "Call Waiter" alerts
- Audio notification (`notification.mp3`) for new events
- Order room support for customer-side tracking

### Phase 14: Upselling & Smart Suggestions ✅

- Item pairing system via `relatedItemIds` on `MenuItem`
- Perfect Pairing modal (deterministic trigger on Add to Cart)
- Trending Carousel on public menu ("Popular right now")
- `trendingMode` on Restaurant (AUTO mode)
- Add-to-cart toast confirmation with localized text

---

## 🔷 V2.5 — Visual Polish, Branding & Menu Intelligence ✅

### Phase 15: Image Experience Upgrade ✅
**Goal:** Make menu item images more impactful and interactive.

**Shipped:**
- Square aspect ratio for item images (portrait photos display correctly)
- Click-to-zoom lightbox with pinch-to-zoom (scale 1–4×) and swipe-to-dismiss (mobile)
- Swipe-down backdrop fade and 80px threshold to close (`ImageLightbox.tsx` full rewrite)
- Category banner images (`imageUrl` on `MenuCategory`) with upload in dashboard Menu Editor
- Mobile quality fixes: banner `aspect-[2/1] md:aspect-[3/1]`, item cards capped at `h-48` on mobile, padding `p-4 md:p-6`

**Selling Point:** *"Every dish looks its best — customers eat with their eyes first."*

---

### Phase 16: Advanced Branding & Theming ✅
**Goal:** Full brand customization with smart guardrails.

**Shipped:**
- Google Fonts integration with live preview — 16 curated fonts (Serif / Sans-Serif / Display) loaded dynamically from Google Fonts (`FontPicker.tsx`)
- Full color scheme editor: background, text, card, accent colors (`ColorSchemeEditor.tsx`)
- WCAG contrast validator with ratio display — pass ≥4.5:1, warning ≥3.0:1, fail below (`colors.ts` + `ColorSchemeEditor`)
- Live theme preview panel in branding editor (`BrandingPreview.tsx`)
- Per-restaurant theme applied to public menu via CSS custom properties (`PublicMenuPage.tsx`)
- Schema fields: `fontHeading`, `fontBody`, `themeBgColor`, `themeTextColor`, `themeCardColor`, `accentColor`

**Selling Point:** *"Your brand, your colors, your fonts — with built-in safeguards so it always looks great."*

---

### Phase 17: Menu Check (Smart Assistant) ✅
**Goal:** Automated menu quality audit — catch issues before customers see them.

**Shipped:**
- Dashboard widget scanning menu completeness (`MenuCheckWidget.tsx` in `SummaryView`)
- Backend audit endpoint `GET /menu/audit/:restaurantId` (`audit.controller.ts` + `menu.service.ts`)
- Detects: items without descriptions, missing images, empty categories, €0 prices, missing translations
- Severity levels: error / warning / info with color-coded icons
- One-click navigation to fix each issue
- Auto-refresh after fixes

**Selling Point:** *"Your menu is always complete, accurate, and ready for customers."*

---

### Mobile UX Overhaul ✅
**Goal:** App feels native on mobile — the primary device for both customers (QR scan) and restaurant owners (in-service management).

**Shipped:**
- `index.html`: `viewport-fit=cover`, `apple-mobile-web-app-capable`, `black-translucent` status bar, title "QR Menu"
- `App.tsx`: layout routes — `AppLayout` (Header + container) for dashboard/auth, `PublicLayout` (bare) for all customer-facing routes (`/menu/public`, `/checkout`, `/order-confirmation`, `/feedback`)
- `index.css`: `pt-safe / pb-safe` utilities (`env(safe-area-inset-*)`), `cart-panel-enter` CSS animation (slides up from bottom on mobile, right on desktop — media-query-driven, no JS)
- `CartDrawer.tsx`: bottom sheet on mobile (`fixed bottom-0 h-[88vh] rounded-t-[2.5rem]`), right drawer on desktop — safe area on footer padding
- `PublicMenuPage.tsx`: hero `mb-20→mb-10 md:mb-20`, category gaps `space-y-24→space-y-14 md:space-y-24`, grid `gap-8→gap-5 md:gap-8`, bottom action bar full-width with `env(safe-area-inset-bottom)`, all tap targets ≥ 44px
- `CheckoutPage.tsx`: glass panels `p-8→p-5 md:p-8`, safe-area bottom padding
- `OrderConfirmationPage.tsx`: full premium redesign — live status card (Clock/ChefHat/CheckCircle2/XCircle), order reference, feedback CTA, safe area
- `DashboardPage.tsx`: desktop keeps horizontal tab nav; mobile gets `fixed bottom-0 md:hidden` bottom nav (6 items: Home/Orders/Requests/Tables/Settings/Stats) with active indicator bar, red badges, safe-area padding

**Key files:**
- `apps/frontend/src/App.tsx` — layout route split
- `apps/frontend/src/components/cart/CartDrawer.tsx` — bottom sheet
- `apps/frontend/src/pages/DashboardPage.tsx` — mobile bottom nav
- `apps/frontend/src/index.css` — safe-area utilities + cart animation

---

---

### UI/UX Audit & Theme Polish ✅ — May 4, 2026
**Goal:** Address design debt, fix UX bugs, harden accessibility, improve dark/light mode integration with custom branding.

**Shipped:**

**Design system (`index.css` full rewrite):**
- Warm restaurant color palette — all colors via HSL CSS custom properties (`--color-accent: hsl(0 72% 51%)` restaurant red, warm whites/near-blacks)
- Dropped Plus Jakarta Sans — fonts reduced from 3 → 2 (Outfit body, Playfair Display headings)
- Fixed `.text-glow` — was using invalid `hsla(var(--color-accent), 0.25)` syntax; corrected to `color-mix(in srgb, var(--color-accent) 25%, transparent)`
- Fixed `.premium-bg` — same invalid `hsla()` issue corrected
- Removed `html { @apply transition-colors duration-500 }` — caused 500ms global delay on all color transitions; replaced with targeted `body { transition: background-color 200ms ease }`
- Added `@media (prefers-reduced-motion: reduce)` for `.animate-float`
- Font preconnect added to `index.html`

**QR table / assistance flow fixes (`PublicMenuPage.tsx`):**
- Removed browser `prompt()` for table number — table is always in QR URL (`?table=<name>`), no user input required
- Call Waiter: shows inline `role="alert"` / `aria-live="polite"` glass panel notice (3.5s) when no table context, rather than prompting
- Call Waiter button properly disabled during `assistanceLoading` state
- Fixed invalid `group-disabled:scale-100` Tailwind modifier (not a valid group modifier — removed)
- Removed decorative `animate-pulse` from loading text (accessibility — continuous motion without user trigger)
- Fixed logo alt text (`${name} logo` instead of empty string)
- Added `<label htmlFor>` + `id` on language select for screen reader association

**Dark/light mode + branding integration:**
- New `defaultTheme String? @default("light")` field on `Restaurant` (schema pushed to Neon, DTO updated)
- `ThemeToggle.tsx` refactored — accepts `storageKey?: string` + `defaultTheme?: 'light' | 'dark'`; improved `aria-label` reflects current action
- Public menu uses per-restaurant localStorage key (`theme-{restaurantId}`) — each venue's preference stored independently from dashboard
- ThemeToggle always visible on public menu (previously hidden when custom branding active — now customers can always toggle)
- Public menu uses restaurant's `defaultTheme` as initial fallback (no stored preference → owner default → light)
- `BrandingEditor.tsx` — Light/Dark pill toggle UI for owners; `defaultTheme` included in PATCH payload

**Key files changed:**
- `apps/frontend/src/index.css`
- `apps/frontend/index.html`
- `apps/frontend/src/pages/PublicMenuPage.tsx`
- `apps/frontend/src/components/ui/ThemeToggle.tsx`
- `apps/frontend/src/components/ui/BrandingEditor.tsx`
- `apps/backend/prisma/schema.prisma`
- `apps/backend/src/restaurants/dto/update-restaurant.dto.ts`

---

### Planned: Translation — Platform-Managed API
**Decision:** Owners will NOT need their own DeepL API key. The platform provides a single `DEEPL_API_KEY` env var on the backend.

**Migration scope (when ready):**
- `TranslationService` reads `process.env.DEEPL_API_KEY` instead of accepting `apiKey` param — drop the `apiKey` argument from `translateTexts`, `translateText`, `translateObject`
- All callers (menu translation endpoints) stop passing `restaurant.deeplApiKey`
- `restaurant.deeplApiKey` column stays in schema (existing data) but is deprecated — remove the input from `SettingsView.tsx`
- `restaurant.googleTranslateApiKey` is already marked deprecated in schema — remove from settings UI at the same time

**Do NOT add any new code that reads `restaurant.deeplApiKey` until this migration is complete.**

---

### Bug Fixes & Translation Gaps ✅ — May 6, 2026

**Customer Auth — Email OTP Sign-in:**
- `VerificationToken` model: 6-digit code bcrypt-hashed, 10-min expiry, 60s rate-limit, `@@index([email])`
- `User.phone String?` field added
- `POST /api/auth/otp/send` + `POST /api/auth/otp/verify` (public routes, no guard)
- Resend REST API for email delivery; dev mode returns `devCode` in response + console.log when `RESEND_API_KEY` absent
- `CustomerLoginModal` rewritten: 3-step state machine (`entry → otp → welcome`), Google button, 60s resend countdown, welcome card for new users
- `AuthContext.loginWithToken(token, user)` — no extra API call, mirrors existing `login()` pattern
- Profile chip + logout icon in public menu action bar; profile page navigates back via `?returnTo` param
- `CustomerProfilePage` fully translated, tier colors from `acc.tier` (not hardcoded thresholds)

**UI Bug Fixes:**
- **Cart language sync** — `resolveItemName()` in `CartDrawer` resolves live translated name by item ID + `selectedLang`; prop chain `PublicMenuPage → CartIcon → CartDrawer`
- **Options pre-selection** — `ItemWithOptions` auto-selects first `VARIATION` choice on item open; eliminates base-item-without-variant orders
- **QR print layout** — single column, `@page { size: A4 portrait; margin: 12mm }`, `breakInside: avoid` per card
- **Analytics dark mode** — Recharts axes use `hsl(var(--color-muted-foreground))` fill; custom `ChartTooltip` with theme-aware classes
- **Menu health false positive** — category-image audit rule removed (no UI to add category images)

**Translation Gaps (~120 new keys, EN/BG/RO):**
- `auth.otp.*` — full OTP flow (20 keys)
- `publicMenu.signIn`, `myProfile`, `calling`, `scanQrForAssistance`, `selectLanguage`, `pairing.*`, `drinkUpsell.*`
- `profile.*` — full profile page (22 keys)

---

## 🔶 V3 — Growth Features (Planned)

### Phase 18: Staff Role Management & Permissions
**Goal:** Multi-user access with role-based permissions.

**Scope:**
- Expand `UserRole` enum: `OWNER`, `MANAGER`, `WAITER`, `KITCHEN`
- Permission matrix per role
- Staff invitation system via email
- Staff activity log
- `StaffInvite` model with expiring tokens

**Selling Point:** *"Give your staff exactly the access they need — nothing more."*

---

### Phase 19: Digital Payment Integration (Stripe)
**Goal:** Tableside payment without waiting for the check.

**Scope:**
- Stripe Payment Intents API integration
- Pay-at-table flow after ordering
- Split payment support (divide by items or equally)
- Tip suggestions (15%, 18%, 20%, custom)
- Stripe Connect for platform fee (SaaS revenue model)

**Selling Point:** *"Customers pay at the table. No waiting. Tips go up. Tables turn faster."*

---

### Phase 20: Multi-Location / Franchise Management
**Goal:** Centralized management for restaurant chains.

**Scope:**
- Menu templates (create once, deploy to multiple locations)
- Bulk price updates across locations
- Cross-location analytics comparison
- Organization-level user management

**Selling Point:** *"Manage all your restaurants from one screen."*

---

## 🟡 V4 — Scale & Enterprise (Future)

- Move database to AWS RDS / GCP Cloud SQL
- Move file uploads to S3 / GCS
- Deploy backend to AWS ECS / GCP Cloud Run
- Redis for caching and real-time queues
- CDN for static assets and menu images
- POS system integration (Square, Toast, Lightspeed)
- Inventory management and waste tracking
- Advanced loyalty program with points/tiers
- SMS/Email marketing campaigns
- Native mobile app for staff (React Native)
- Kubernetes orchestration for enterprise scale
