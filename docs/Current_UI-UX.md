# Current UI/UX — Dashboard Layout Map

**Generated:** 2026-05-14
**Source:** Live codebase analysis of `apps/frontend/src/`

---

## Route Architecture

```
App.tsx
  /dashboard        → ProtectedRoute → DashboardPage (tab-based SPA, no sub-routes)
  /dashboard/menu   → ProtectedRoute → MenuProvider → MenuEditorPage (sibling route, linked from tab bar)
```

Both routes share `AppLayout`:
```
SocketProvider → OrderProvider → AssistanceProvider → RestaurantProvider → NotificationProvider
  ├── <Header />          (fixed top bar: theme toggle, language picker, nav links)
  └── <main>              (container, mx-auto, p-4)
       └── <Outlet />     (renders DashboardPage or MenuEditorPage)
```

`ProtectedRoute.tsx` blocks CUSTOMER, WAITER, KITCHEN roles from `/dashboard`. WAITER redirects to `/staff/pos`, KITCHEN to `/staff/kitchen`.

---

## DashboardPage Shell

File: `apps/frontend/src/pages/DashboardPage.tsx` (lines 36-292)

```
┌─────────────────────────────────────────────────┐
│  Page Header: title, welcome text,              │
│  "View Public Menu" button, NotificationBell    │
├─────────────────────────────────────────────────┤
│  Desktop Tab Bar (8 tabs, hidden on mobile)     │
│  [Summary] [Analytics] [Orders] [Payments*]     │
│  [Assistance] [Tables] [Settings] [Import]      │
│  + external links: Menu Editor / POS / Kitchen  │
├─────────────────────────────────────────────────┤
│  Active Tab Content (conditional render)         │
├─────────────────────────────────────────────────┤
│  Mobile Bottom Nav (7 items, hidden on md+)      │
│  [Summary] [Orders] [Payments*] [Assistance]    │
│  [Tables] [Settings] [Analytics]                │
└─────────────────────────────────────────────────┘
```

\* Payments tab hidden when `activeRestaurant.paymentsEnabled !== true`.

Tab state: `useState<TabId>('summary')`. On mount, reads `?tab=` URL search param to pre-select.

---

## Tab 1: Summary

File: `apps/frontend/src/pages/Dashboard/SummaryView.tsx`

| Section | Content |
|---------|---------|
| 3 KPI cards | Total Revenue (€), New Orders (count), Pending Assistance (count) — glass-panel styling, Lucide icons, colored accent bar |
| Loyalty section | 3 cards: VIP members, points redeemed, points outstanding — only when `isLoyaltyEnabled` && data loaded |
| MenuCheckWidget | Calls `/menu/audit/:id`, lists issues with severity badges (error/warning/info), "Fix" button navigates to `/dashboard/menu` with `targetCategoryId`/`targetItemId` state |

Loyalty data fetched once via `useEffect` → `api.get(/loyalty/{restaurantId}/analytics)`.

---

## Tab 2: Analytics

File: `apps/frontend/src/pages/Dashboard/AnalyticsView.tsx`
Hook: `apps/frontend/src/hooks/useAnalytics.ts` (TanStack Query, `staleTime: 0`, `refetchInterval: 30000`)

| Section | Chart |
|---------|-------|
| 4 KPI cards | Total Revenue, Total Orders, Avg Order Value, Served Rate — each with % change comparison |
| Revenue Trend | `AreaChart` (Recharts), gradient fill, X-axis date labels, Y-axis currency |
| Top Items | Horizontal `BarChart` — quantity per item name |
| Peak Hours | `BarChart` filtered to hours 8-23, opacity-scaled bars |
| Category Breakdown | `PieChart` donut, inner/outer radius |
| Top Tables | `BarChart` — revenue per table |
| Feedback | Average rating (star display), 1-5 distribution bars, positive %, Google redirect count |

Controls: CSV export, date range pickers, period quick-select (7d/14d/30d).

---

## Tab 3: Orders

File: `apps/frontend/src/pages/Dashboard/OrdersView.tsx`
Data source: `OrderContext` via `useOrders()`

5 status filter tabs: `NEW` / `IN_PROGRESS` / `SERVED` / `COMPLETED` / `CANCELED`

Each order card shows: truncated ID, table number, timestamp, status badge (color-coded), item list (qty + name + price), selected options as tags, special requests alert, total price.

Action buttons depend on status:
- **NEW** → Start Preparing / Cancel
- **IN_PROGRESS** → Mark Served / Cancel
- **SERVED** → Mark Completed / Reopen
- **COMPLETED** → Reopen
- Paid indicator when `paymentsEnabled && tableSession.status === 'PAID'`

---

## Tab 4: Payments

File: `apps/frontend/src/pages/Dashboard/PaymentsView.tsx`
Data source: TanStack Query `['paymentHistory', restaurantId, statusFilter, page]`

| Section | Content |
|---------|---------|
| Header | Title + status filter dropdown (All/Succeeded/Pending/Failed/Refunded) |
| Warning | Stripe missing banner (conditional) |
| Table | Columns: Date, Table, Customer, Amount, Tip, Status (color-coded badges) |
| Pagination | Previous/Next with page indicator |
| Empty state | CreditCard icon + "No payments yet" |

---

## Tab 5: Assistance

File: `apps/frontend/src/pages/Dashboard/AssistanceView.tsx`
Data source: `AssistanceContext` via `useAssistance()`

| Section | Content |
|---------|---------|
| Header | Title with active count (pulsing red badge) + resolved count |
| Active grid | 2-column grid: table number, timestamp, "Mark Resolved" button |
| Resolved list | Last 5 resolved, sorted by `updatedAt` desc, "Reopen" button |

---

## Tab 6: Tables

File: `apps/frontend/src/components/tables/TableView.tsx`
2 internal sub-tabs:

### Live View
File: `apps/frontend/src/pages/Dashboard/LiveTablesView.tsx`

- Data: `getTableStatuses` query + socket listener on `table:status-changed`
- Filter dropdown: Active (default), Occupied, Paid, All
- Grid of `TableCard` components: color-coded left border
  - Red → occupied, Amber → waiting, Green → paid, Gray → empty
  - Shows: table name, customer count, order count badge
- Click opens `TableDetailModal`: status, customers, order list, payment info

### QR Management
- Add table form (Input + Button)
- "Print All QR" button
- Table list with session indicator (OPEN/PAID) + close session action
- Per-table "Generate QR" button → modal with `QRCodeSVG` + download PNG
- `PrintableQRCodes`: hidden `print:block` component, A4 portrait, one card/page

---

## Tab 7: Settings

File: `apps/frontend/src/pages/Dashboard/SettingsView.tsx`
4 internal sub-tabs:

### General
| Field | Details |
|-------|---------|
| Location & Contact | Address + contactInfo inputs |
| Timezone | Dropdown — 19 IANA timezone options |
| Localization | 12 language toggle buttons, "Translate All Now" button |

### Loyalty
| Field | Details |
|-------|---------|
| Enable | Toggle on/off |
| Signup Bonus | Points awarded on registration |
| Earn Rate | 1-100 (points per €1), @Max(100) enforced |
| Redeem Rate | Points needed for €1 discount |
| Cashback Preview | Live calculation with 15% warning |
| Expiry | Expiry days, reminder days |
| VIP Tiers | Silver/Gold thresholds + multipliers, validation (silver < gold) |
| Happy Hour | Enable toggle, start/end time, multiplier |
| Payment Notifications | Toggle (conditional on paymentsEnabled) |

### Payments
| Field | Details |
|-------|---------|
| Accept Payments | Toggle on/off |
| Stripe Connect | Onboarding flow (create account link, status check, disconnect) |
| Tips | Enable toggle, quick-tip options (add/remove) |
| Save | Separate save button (not main form submit) |

### Staff
| Field | Details |
|-------|---------|
| Shared Device Mode | Toggle → writes `localStorage.sharedDevice` |
| Bond a Device | Enrollment QR + copy link, 10-min expiry |
| Invite Form | Name (required), email (optional), role dropdown (MANAGER/WAITER/KITCHEN) |
| Staff Table | Name, email (`.local` hidden as "—"), role badge, rebond button, delete |
| StaffCreatedModal | QR code, PIN display + copy, expiry countdown |

### BrandingEditor
File: `apps/frontend/src/components/ui/BrandingEditor.tsx`
Rendered below settings form (not a sub-tab):

- Logo upload via `ImageUploadInput`
- Typography: 2x `FontPicker` (heading + body fonts)
- Color scheme: `ColorSchemeEditor` (4 colors)
- Default theme: light/dark picker (writes `Restaurant.defaultTheme`)
- Google Review URL input
- Live `BrandingPreview` panel

---

## Tab 8: Import

File: `apps/frontend/src/pages/Dashboard/MenuImportView.tsx`

| Section | Content |
|---------|---------|
| Success banner | Shown after successful import |
| ApiKeyPanel | OCR API key with reveal/hide, copy, curl example, regenerate |
| FileImporter | Drag-drop zone (.json/.csv), parses to payload, `PreviewTable` |
| Confirm | Triggers `confirmMenuImport` mutation, invalidates `['menu']` cache |

---

## Mobile Bottom Navigation

Fixed at bottom, hidden on `md:` breakpoint. 7 items:

```
[Summary] [Orders] [Payments*] [Assistance] [Tables] [Settings] [Analytics]
```

\* Payments hidden when `paymentsEnabled !== true`.
Analytics shown as icon-only extra (not in main `BOTTOM_NAV_TABS` array).

---

## Key UI Components Referenced

| Component | File |
|-----------|------|
| Header | `apps/frontend/src/components/Header.tsx` |
| ProtectedRoute | `apps/frontend/src/components/ProtectedRoute.tsx` |
| AppLayout | `apps/frontend/src/App.tsx` (lines 33-48) |
| NotificationBell | `apps/frontend/src/components/NotificationBell.tsx` |
| PaymentToast | `apps/frontend/src/components/PaymentToast.tsx` |
| TableCard | `apps/frontend/src/components/tables/TableCard.tsx` |
| TableDetailModal | `apps/frontend/src/components/tables/TableDetailModal.tsx` |
| PrintableQRCodes | `apps/frontend/src/components/tables/PrintableQRCodes.tsx` |
| MenuCheckWidget | `apps/frontend/src/components/dashboard/MenuCheckWidget.tsx` |
| BrandingEditor | `apps/frontend/src/components/ui/BrandingEditor.tsx` |
| StaffCreatedModal | `apps/frontend/src/components/staff/StaffCreatedModal.tsx` |
| CreateRestaurantForm | `apps/frontend/src/components/CreateRestaurantForm.tsx` |

## Context Providers Active on Dashboard

| Context | Purpose |
|---------|---------|
| `AuthContext` | User session, role |
| `RestaurantContext` | Active restaurant, list |
| `SocketContext` | Real-time events |
| `OrderContext` | Orders state + socket sync |
| `AssistanceContext` | Assistance requests + socket sync |
| `NotificationContext` | Payment notifications + socket sync |

## External Dependencies

- **lucide-react** — icons
- **recharts** — AreaChart, BarChart, PieChart
- **@tanstack/react-query** — server state
- **react-i18next** — translations
- **react-router-dom** — routing
- **qrcode.react** — QR code generation
- **@fortawesome/react-fontawesome** — icons in SettingsView
