---
phase: 6
plan: 2
title: "Dashboard Summary & UX Polish"
wave: 2
depends_on: ["01"]
files_modified:
  - frontend/src/pages/DashboardPage.tsx
  - frontend/src/pages/Dashboard/SummaryView.tsx
  - frontend/src/components/ui/BrandingEditor.tsx
requirements: [REQ-013, REQ-014]
autonomous: true
must_haves:
  - Dashboard includes a "Summary" tab enumerating metrics.
  - Owners can upload a logo and edit their color picker inside the dashboard.
  - Clean loading states replace primitive text loads globally inside the Dashboard views.
---

<objective>
Solidify the internal Application Dashboard replacing primitive UX logic with rich UI flows. Aggregate contextual stats internally compiling standard arrays into explicit summaries covering Sales and Request capacities, then implement the UI hooks interacting cleanly backwards toward the backend branding REST operations established in Wave 1.
</objective>

## Tasks

<task id="2.1">
<title>Build Dashboard Summary View</title>
<read_first>
- frontend/src/pages/DashboardPage.tsx
</read_first>
<action>
1. Create `frontend/src/pages/Dashboard/SummaryView.tsx`.
2. Component parses local `useOrders()` array and `useAssistance()` arrays internally.
3. Establish 3 metric cards using standard Tailwind classes (`Total Revenue`, `New Orders`, `Pending Requests`). Wait, `Total Revenue` sums `totalPrice` where `status !== 'CANCELED' && createdAt > Today()`. 
4. Inject `SummaryView` into `DashboardPage.tsx` acting absolutely as the default `activeTab` state.
</action>
<acceptance_criteria>
- Dashboard lands natively across `SummaryView` showing explicit metric widgets correctly.
</acceptance_criteria>
</task>

<task id="2.2">
<title>Dashboard Branding Editor UI</title>
<action>
Within `SummaryView` or an explicitly injected "Settings" Tab inside the core Dashboard layout, render an input form for standard brand fields tying to `patchRestaurant` API endpoint wrapper.
1. `type="color"` input mapped implicitly onto `accentColor`. 
2. Logo file uploader mechanism leveraging logic akin to the Menu Item Image forms previously defined (can trigger the generic backend uploader route `POST /menu/upload` or similar, saving URL string explicitly overriding restaurant).
</action>
<acceptance_criteria>
- Branding parameters edit effectively.
</acceptance_criteria>
</task>

<task id="2.3">
<title>Global Loading States & UX Consistency</title>
<action>
Audit `DashboardPage` and `PublicMenuPage` replacing pure string nodes (`Loading...`) with an SVG circular spinner component or explicit Pulse `Skeleton` objects providing modern perceived performance. Resolve mobile padding gaps if the core navigation flows fail to shrink adequately scaling cleanly below 768px tailwind breakpoints securely.
</action>
<acceptance_criteria>
- Spinners natively display in-place flawlessly improving wait sensations natively.
</acceptance_criteria>
</task>
