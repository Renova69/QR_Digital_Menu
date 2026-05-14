# Current UI/UX — Public Menu Page

**Generated:** 2026-05-14
**Source:** Live codebase analysis of `apps/frontend/src/`

---

## Route Architecture

```
App.tsx
  /menu/public/:restaurantId?table=<name>&lang=<code>  → PublicLayout → PublicMenuPage
  /checkout                                              → PublicLayout → CheckoutPage
  /order-confirmation/:id                                → PublicLayout → OrderConfirmationPage
  /feedback/:id                                          → PublicLayout → FeedbackPage
```

`PublicLayout` (App.tsx:51-61) — no Header, no container, no `<main>` wrapper. Full viewport control:

```
SocketProvider → RestaurantProvider → NotificationProvider → CartProvider
  └── <Outlet />  (renders PublicMenuPage)
```

Contrast with `AppLayout` which wraps with `<Header />` + `<main className="container mx-auto p-4">`.

---

## Entry Points

| Trigger | URL |
|---------|-----|
| QR code scan | `/menu/public/:restaurantId?table=<name>` |
| Direct link | `/menu/public/:restaurantId` |
| Language override | `?lang=bg` / `?lang=en` / `?lang=ro` (validated against `restaurant.targetLanguages`) |

---

## PublicMenuPage Shell

File: `apps/frontend/src/pages/PublicMenuPage.tsx` (812 lines)

### On Mount (lines 56-109)

1. Read `restaurantId` from URL params
2. Read `table` from query string → store in `localStorage.tableNumber`
3. Load session token from `localStorage[`session-${table}`]`
4. Call `GET /api/menu/public/:restaurantId` → returns `{ restaurant, categories[] }`
5. Backend: fetches Restaurant branding + all MenuCategory rows with items/options, filters by availabilityType/dayparting/timezone, excludes out-of-stock items, applies lazy DeepL translations if `?lang=` provided
6. Frontend: stores `menuData`, prunes stale cart items, sets `selectedLang` from browser language ∩ `targetLanguages`, loads Google Fonts dynamically

### Intersection Observer (lines 111-141)

1s after render, observes each category `<div>` with `rootMargin: "-20% 0px -70% 0px"` → tracks `activeCategory` for sticky nav pill highlighting.

---

## Component Tree (Full)

```
PublicLayout (App.tsx:51-61)
  SocketProvider          — same-origin socket.io, websocket+long-polling
  RestaurantProvider      — activeRestaurant, joins socket room
  NotificationProvider    — listens payment:confirmed socket event
  CartProvider            — items[], localStorage-backed, prunes stale items
    │
    PublicMenuPage (PublicMenuPage.tsx:25-812)
    │
    ├── [Loading]          — Centered spinner + "Preparing your menu..." (lines 309-316)
    ├── [Error]            — Glass panel + "Try Again" button (lines 318-332)
    ├── [Empty menu]       — "No items yet" placeholder (lines 398-404)
    │
    ├── Header Area (lines 337-396)
    │   ├── Restaurant Logo (<img>, lines 339-348)
    │   ├── Restaurant Name (h1, font-serif, text-5xl md:text-8xl, lines 354-363)
    │   ├── Language Selector (<select>, lines 368-395)
    │   └── ThemeToggle (sun/moon, per-restaurant localStorage key, lines 287-300)
    │
    ├── TrendingCarousel (TrendingCarousel.tsx:12-59)
    │   └── Horizontal scroll with snap, ItemWithOptions cards
    │
    ├── Dietary/Allergen Filter Pills (lines 419-448)
    │   └── Computed from all items' allergens + dietaryTags
    │
    ├── Sticky Category Navigation (lines 451-517)
    │   ├── Desktop: horizontal scrolling pill buttons (hidden md:flex)
    │   └── Mobile: native <select> overlay (md:hidden)
    │
    ├── Category Sections (lines 519-621)
    │   ├── Category banner image (optional, lines 536-555)
    │   ├── Translated name heading
    │   └── Item grid (1-col md:2-col) of ItemWithOptions cards
    │       └── [Empty filter] per category (lines 576-581)
    │
    ├── Fixed Bottom Action Bar (lines 644-739) — glass panel
    │   ├── Call Waiter button (Bell icon)
    │   │   ├── No table → scan-QR alert (role="alert", aria-live="polite")
    │   │   └── Has table → Assistance Dialog (bottom sheet / centered dialog)
    │   ├── [if authenticated] Profile chip + Logout
    │   ├── [if !authenticated] Sign In button → CustomerLoginModal portal
    │   ├── [if sessionToken] Request Bill button → PaymentModal portal
    │   └── CartIcon (badge count) → CartDrawer portal
    │
    └── Portals (all render to document.body)
        ├── CartDrawer (CartDrawer.tsx:27-305)
        ├── CustomerLoginModal (CustomerLoginModal.tsx:31-321)
        ├── PaymentModal (PaymentModal.tsx:102-232)
        ├── ImageLightbox (ImageLightbox.tsx:10-130)
        ├── PerfectPairingModal (ItemWithOptions.tsx:307-380)
        └── AssistanceDialog (PublicMenuPage.tsx:743-789)
```

---

## ItemWithOptions — Menu Item Card

File: `apps/frontend/src/components/menu/ItemWithOptions.tsx` (391 lines)

| Feature | Detail |
|---------|--------|
| Image | Square aspect, click → ImageLightbox portal (pinch-to-zoom, swipe-to-close) |
| Name + Price | Translated via `item.translations[currentLang]?.name` |
| Description | `line-clamp-2 md:line-clamp-3`, translated |
| Dietary tags | Emerald badges (`item.dietaryTags`) |
| Allergens | Amber badges (`item.allergens`) |
| Options: VARIATION | Radio buttons, auto-selects first choice on `item.id` change |
| Options: ADD_ON | Checkboxes, unselected by default |
| Add to Cart | Builds `cartId` from `item.id-optionId:choiceName` pipe-separated keys |
| Toast | 2.2s animated overlay on add-to-cart |
| Perfect Pairing | If `relatedItemIds` exist → portal modal with pairing suggestions |

---

## CartDrawer — Cart Overlay

File: `apps/frontend/src/components/cart/CartDrawer.tsx` (305 lines)

| State | Visual |
|-------|--------|
| Empty | Shopping cart icon + "Your cart is empty" |
| Has items | Item list: quantity ±, name (resolved via `resolveItemName()` for live translation), options, price, total |
| Drink upsell | Checkout clicked, no drinks in cart → drink suggestion list with "Add" buttons |
| Clear Cart | Button empties cart |

**Mobile:** Bottom sheet (`h-[88vh]`, `rounded-t-[2.5rem]`, `cartSlideUp` animation)
**Desktop:** Right panel (`max-w-sm`, `rounded-l-[2.5rem]`, `cartSlideRight` animation)

"Proceed to Checkout" → navigates to `/checkout`.

---

## CustomerLoginModal

File: `apps/frontend/src/components/auth/CustomerLoginModal.tsx` (321 lines)

3-step state machine:

| Step | Content |
|------|---------|
| **Entry** | Google OAuth button + email/phone tabs + country code selector (10 countries) |
| **OTP** | 6-digit code input + devCode banner (dev mode) + 60s resend countdown |
| **Welcome** | New customer welcome card + "Let's Order" button |

Auth flow: `POST /api/auth/otp/send` → `POST /api/auth/otp/verify` → `AuthContext.loginWithToken(token, user)`.

---

## PaymentModal

File: `apps/frontend/src/components/payment/PaymentModal.tsx` (232 lines)

3-step flow:

| Step | Content |
|------|---------|
| **Tip** | Bill subtotal + tip percentage buttons (from `restaurant.quickTipOptions`) |
| **Stripe** | `PaymentElement` form via `@stripe/react-stripe-js` |
| **Done** | Checkmark + "Payment Received" |

Calls: `GET /api/payments/session/:token/bill` → `POST /api/payments/session/:token/intent` → Stripe `confirmPayment`.

---

## All UI States

| State | Trigger | Visual | File:Line |
|-------|---------|--------|-----------|
| Loading | Initial API fetch | Centered spinner + "Preparing your menu..." | PublicMenuPage.tsx:309-316 |
| Error | API failure / missing restaurant | Glass panel + error message + "Try Again" button | PublicMenuPage.tsx:318-332 |
| Empty menu | `categories.length === 0` | "No items yet" placeholder | PublicMenuPage.tsx:398-404 |
| Empty filter | No items match `activeFilter` | "No items match this filter" per category | PublicMenuPage.tsx:576-581 |
| Cart empty | `items.length === 0` | Shopping cart icon + "Your cart is empty" | CartDrawer.tsx:181-202 |
| Cart has items | Items exist | Item list with qty, options, prices, total | CartDrawer.tsx:204-248 |
| Drink upsell | Checkout clicked, no drinks | Drink suggestions with "Add" buttons | CartDrawer.tsx:128-180 |
| Authenticated user | `user` non-null | Profile chip + Logout in action bar | PublicMenuPage.tsx:676-698 |
| Unauthenticated | `user` null | "Sign In" button | PublicMenuPage.tsx:699-706 |
| Has session | `sessionToken` in localStorage | "Request Bill" button | PublicMenuPage.tsx:709-728 |
| No table | Table param missing | "Scan QR code" alert on call waiter | PublicMenuPage.tsx:628-641 |
| Assistance sent | `assistanceSent === true` | Success toast, button disabled 60s | PublicMenuPage.tsx:303-307 |
| Assistance loading | `assistanceLoading === true` | Button shows "Calling..." | PublicMenuPage.tsx:670 |
| Trending loading | API loading | Component removed from DOM (returns null) | TrendingCarousel.tsx:32 |
| Trending empty | No trending items | Component removed from DOM (returns null) | TrendingCarousel.tsx:32 |
| Pairing modal | `relatedItemIds.length > 0` | Dark backdrop + pairing cards | ItemWithOptions.tsx:307-380 |
| Image lightbox | Click item image | Full-screen zoomable image | ImageLightbox.tsx:10-130 |
| Tip step | Payment modal opens | Bill subtotal + tip % buttons | PaymentModal.tsx:151-201 |
| Stripe step | Continue after tip | Stripe PaymentElement form | PaymentModal.tsx:204-216 |
| Done step | Payment succeeds | Checkmark + "Payment Received" | PaymentModal.tsx:219-228 |
| Login entry | Click "Sign In" | Google + email/phone tabs | CustomerLoginModal.tsx:178-259 |
| Login OTP | Code sent | 6-digit input + resend countdown | CustomerLoginModal.tsx:263-301 |
| Login welcome | New customer verified | Welcome card | CustomerLoginModal.tsx:305-315 |
| No custom theme | No branding colors set | Default Tailwind theme | PublicMenuPage.tsx:210-213 |
| Custom theme | Branding colors set | CSS custom properties override | PublicMenuPage.tsx:231-249 |
| Dark mode | ThemeToggle toggled | `.dark` class on `<html>` | ThemeToggle.tsx:23-31 |

---

## Mobile vs Desktop Behavior

| Feature | Mobile | Desktop | File:Line |
|---------|--------|---------|-----------|
| Category nav | Native `<select>` dropdown | Horizontal scrolling pills | PublicMenuPage.tsx:453-516 |
| CartDrawer | Bottom sheet: `h-[88vh]`, slide-up | Right panel: `max-w-sm`, slide-right | CartDrawer.tsx:84-91 |
| Item grid | 1 column (`grid-cols-1`) | 2 columns (`md:grid-cols-2`) | PublicMenuPage.tsx:585 |
| Assistance dialog | Bottom sheet | Centered modal | PublicMenuPage.tsx:744 |
| Payment modal | Bottom sheet | Centered modal | PaymentModal.tsx:137 |
| Category banner | `aspect-[2/1]` | `md:aspect-[3/1]` | PublicMenuPage.tsx:537 |
| Heading font | `text-5xl` | `md:text-8xl` | PublicMenuPage.tsx:360 |
| Action bar buttons | Icon-only (Bell) | Icon + label | PublicMenuPage.tsx:666 |
| Item image | `h-48` | `md:aspect-square` | ItemWithOptions.tsx:164 |
| Description | `line-clamp-2` | `md:line-clamp-3` | ItemWithOptions.tsx:205 |
| Sticky nav offset | `top-4` | `md:top-6` | PublicMenuPage.tsx:451 |

---

## Branding / CSS Custom Properties

Flow: `Restaurant` DB row → API response → JS `style` object → CSS custom properties

### Restaurant fields used:
| Field | Applied as |
|-------|-----------|
| `logoUrl` | `<img>` in header (PublicMenuPage.tsx:339-348) |
| `accentColor` | Ambient background blobs + `--color-accent` CSS var (PublicMenuPage.tsx:231-249) |
| `fontHeading` | Google Font loaded dynamically → `--font-heading` (PublicMenuPage.tsx:150-168) |
| `fontBody` | Google Font loaded dynamically → `--font-body` (PublicMenuPage.tsx:150-168) |
| `themeBgColor` | `--custom-bg` → mapped to `--color-background` in `:root` |
| `themeTextColor` | `--custom-text` → mapped to `--color-foreground` in `:root` |
| `themeCardColor` | `--custom-card` → mapped to `--color-card` in `:root` |
| `defaultTheme` | `'light'` or `'dark'`, passed to ThemeToggle |

### CSS cascade (`index.css`):
- `:root` maps `--custom-*` → `--color-*` tokens
- `.dark` **ignores** all `--custom-*` with `!important` — dark mode uses default dark palette regardless of branding

---

## Translation Mechanics

### Language Selection
- Dropdown rendered only when `restaurant.targetLanguages.length > 0` (PublicMenuPage.tsx:368)
- Initial: browser language ∩ targetLanguages, fallback to first target language (lines 90-94)
- Switch: updates `selectedLang` + calls `i18n.changeLanguage(val)` (lines 170-174)

### Item-Level Translation
- `ItemWithOptions` reads `item.translations[currentLang]?.name` at render time (ItemWithOptions.tsx:37-38)
- Category names: `category.translations[selectedLang]?.name` (PublicMenuPage.tsx:521-524)
- Options: `option.translations[currentLang]?.name` + choice names from `.choices` (ItemWithOptions.tsx:232-240)
- Allergens/dietary: stored in `translations[currentLang].allergens` / `.dietaryTags` (ItemWithOptions.tsx:209-226)
- Cart: `resolveItemName()` looks up live translated name by item ID + lang, bypassing stale add-time snapshot (CartDrawer.tsx:9-25)

### Backend Lazy Translation
- `MenuTranslationService.applyLazyTranslations()` — per category/item/option, checks if translation exists, calls DeepL if missing, saves to DB, mutates in-memory
- 300ms rate limit between API calls
- `?lang=` validated against `restaurant.targetLanguages` (arbitrary codes rejected)

---

## Data Flow

```
QR Code Scan
  │
  ▼
/menu/public/{restaurantId}?table={tableName}&lang={code}
  │
  ▼
PublicLayout — SocketProvider, RestaurantProvider, NotificationProvider, CartProvider
  │
  ▼
PublicMenuPage.tsx — on mount:
  │
  ├─ 1. Parse URL (restaurantId, table, lang)
  ├─ 2. Store table + sessionToken in localStorage
  ├─ 3. GET /api/menu/public/{restaurantId}
  │     │
  │     ▼
  │   Backend: PublicMenuController → MenuCrudService.getPublicMenu()
  │     ├─ Fetch Restaurant branding fields
  │     ├─ Fetch MenuCategory[] + items (exclude outOfStock) + options
  │     ├─ Filter by availabilityType/SCHEDULED dayparting (restaurant timezone)
  │     ├─ If lang param in targetLanguages → lazy DeepL translate + cache to DB
  │     └─ Return { restaurant, categories }
  │
  ├─ 4. setMenuData({ restaurant, categories })
  ├─ 5. pruneInvalidItems (remove stale cart items)
  ├─ 6. setSelectedLang from browser ∩ targetLanguages
  ├─ 7. Load Google Fonts dynamically
  │
  ▼
Render:
  ├─ Logo / Branding / Theme
  ├─ Language Selector
  ├─ TrendingCarousel (GET /trending)
  ├─ Dietary/Allergen filter pills
  ├─ Sticky category nav (IntersectionObserver)
  ├─ Category sections → ItemWithOptions cards
  ├─ Fixed bottom action bar
  └─ Portals: CartDrawer, CustomerLoginModal, PaymentModal, ImageLightbox, PairingModal
```

---

## Context Providers on Public Menu

| Context | Purpose | File |
|---------|---------|------|
| `AuthContext` | User session (at Router level, not PublicLayout) | `context/AuthContext.tsx` |
| `CartContext` | Cart items, totals, localStorage sync, prune | `context/CartContext.tsx` |
| `SocketContext` | Real-time socket.io connection | `context/SocketContext.tsx` |
| `RestaurantContext` | Active restaurant, socket room join | `context/RestaurantContext.tsx` |
| `NotificationContext` | Payment notifications + toast state | `context/NotificationContext.tsx` |

**NOT on public menu:** `OrderContext`, `AssistanceContext` (public menu calls assistance API directly).

---

## Key API Calls

| Call | Endpoint | Auth |
|------|----------|------|
| `getMenu` | `GET /api/menu/public/:id` | Public |
| `getTrendingItems` | `GET /api/menu/public/:id/trending` | Public |
| `createAssistanceRequest` | `POST /api/assistance-requests` | Public |
| `getSessionBill` | `GET /api/payments/session/:token/bill` | Public |
| `createPaymentIntent` | `POST /api/payments/session/:token/intent` | Public |
| `sendOtp` | `POST /api/auth/otp/send` | Public |
| `verifyOtp` | `POST /api/auth/otp/verify` | Public |

---

## Key Files (All)

| File | Role | Lines | Importance |
|------|------|-------|------------|
| `apps/frontend/src/App.tsx` | Route definitions, PublicLayout | 51-61, 141-155 | Critical |
| `apps/frontend/src/pages/PublicMenuPage.tsx` | Main public menu component | 812 | Critical |
| `apps/frontend/src/components/menu/ItemWithOptions.tsx` | Menu item card with options, pairings, lightbox | 391 | Critical |
| `apps/frontend/src/components/cart/CartDrawer.tsx` | Cart side/bottom sheet overlay | 305 | High |
| `apps/frontend/src/components/cart/CartIcon.tsx` | Cart badge button | 51 | High |
| `apps/frontend/src/components/payment/PaymentModal.tsx` | 3-step payment: Tip → Stripe → Done | 232 | High |
| `apps/frontend/src/components/auth/CustomerLoginModal.tsx` | 3-step login: entry → OTP → welcome | 321 | High |
| `apps/frontend/src/components/menu/TrendingCarousel.tsx` | Horizontal trending items carousel | 59 | Medium |
| `apps/frontend/src/components/menu/ImageLightbox.tsx` | Pinch-to-zoom, swipe-to-close viewer | 130 | Medium |
| `apps/frontend/src/components/ui/ThemeToggle.tsx` | Light/dark per-restaurant toggle | 55 | Medium |
| `apps/frontend/src/context/CartContext.tsx` | Cart state: items, totals, localStorage, prune | 162 | Critical |
| `apps/frontend/src/context/AuthContext.tsx` | Auth state: user, login, logout, init | 117 | High |
| `apps/frontend/src/context/SocketContext.tsx` | Socket.io connection | 49 | High |
| `apps/frontend/src/context/NotificationContext.tsx` | Payment notifications | 111 | Medium |
| `apps/frontend/src/context/RestaurantContext.tsx` | Restaurant list, active selection | 156 | Medium |
| `apps/frontend/src/lib/api.ts` | Axios instance, CSRF interceptor, all API functions | 353 | Critical |
| `apps/frontend/src/types/index.ts` | TypeScript types: Item, Category, MenuOption, etc. | 63 | Critical |
| `apps/frontend/src/index.css` | Tailwind theme, CSS custom props, glass-panel, animations | 216 | Critical |
| `apps/frontend/index.html` | viewport-fit=cover, PWA metas | 33 | Low |
| `apps/frontend/src/pages/CheckoutPage.tsx` | Checkout form: name, phone, special requests, loyalty | 531 | High |
| `apps/frontend/src/pages/OrderConfirmationPage.tsx` | Order confirmed with live status | — | Medium |
| `apps/frontend/src/pages/FeedbackPage.tsx` | Customer feedback + Google review redirect | — | Medium |
| `apps/backend/src/menu/public-menu.controller.ts` | Public menu API routes | 37 | Critical |
| `apps/backend/src/menu/menu-crud.service.ts` | getPublicMenu() logic | — | Critical |
| `apps/backend/src/menu/menu-translation.service.ts` | Lazy DeepL translation | 152 | Critical |

---

## External Dependencies

| Library | Usage |
|---------|-------|
| `react-router-dom` v7 | Routing, `useParams`, `useNavigate`, `useLocation` |
| `axios` | HTTP client with CSRF interceptor |
| `socket.io-client` | Real-time socket for restaurant room |
| `i18next` + `react-i18next` | i18n, `useTranslation` hook |
| `lucide-react` | Icons (ShoppingCart, Bell, Globe, LogOut, UserCircle, etc.) |
| `@fortawesome/react-fontawesome` | FontAwesome icons (faCircleCheck, faBolt) |
| `@stripe/react-stripe-js` + `@stripe/stripe-js` | Stripe Elements in PaymentModal |
| `@radix-ui/react-slot` | Polymorphic `Slot` in Button |
| `class-variance-authority` | CVA variant management |
| `tailwind-merge` | Conditional Tailwind class merging |
