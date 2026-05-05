---
phase: 4
plan: 2
title: "Dashboard Table UI & QR Generation"
wave: 2
depends_on: ["01"]
files_modified:
  - frontend/src/lib/api.ts
  - frontend/src/pages/DashboardPage.tsx
  - frontend/src/components/tables/TableView.tsx
requirements: [REQ-008, REQ-009]
autonomous: true
must_haves:
  - Dashboard has a Tables tab
  - Frontend users can create a new Table (name)
  - QR codes are dynamically generated off the actual Table entities
---

<objective>
Introduce the table management user interface into the dashboard so restaurant owners can structurally manage their tables. Connect the UI to the backend's table endpoints, and re-wire the QR-code generator to trigger per-table.
</objective>

## Tasks

<task id="2.1">
<title>Add Table API methods</title>
<read_first>
- frontend/src/lib/api.ts
</read_first>
<action>
In `frontend/src/lib/api.ts`, add methods:
```typescript
export const getTables = async (restaurantId: string) => {
  const response = await api.get(`/restaurants/${restaurantId}/tables`);
  return response.data;
};

export const createTable = async (restaurantId: string, name: string) => {
  const response = await api.post(`/restaurants/${restaurantId}/tables`, { name });
  return response.data;
};

export const deleteTable = async (tableId: string) => {
  const response = await api.delete(`/tables/${tableId}`);
  return response.data;
};
```
</action>
<acceptance_criteria>
- Endpoints successfully bound inside `api.ts`.
</acceptance_criteria>
</task>

<task id="2.2">
<title>Create TableView UI component</title>
<action>
Create `frontend/src/components/tables/TableView.tsx`. It should:
1. Accept `restaurantId` as a prop.
2. Fetch tables via React Query `useQuery(getTables)`.
3. Provide an input field + 'Add Table' button mapping to a create mutation.
4. Render a list of tables. Each table row should have a "Generate QR" button and a "Delete" button.
5. Reuse the QR Code presentation modal logic existing in `DashboardPage.tsx` previously: When clicking "Generate QR", open a `<Modal>` with `<QRCode value={window.location.origin + "/menu/public/" + restaurantId + "?table=" + encodeURIComponent(table.name)} size={256} />`.
</action>
<acceptance_criteria>
- File `TableView.tsx` exists and implements CRUD and QR visuals natively.
</acceptance_criteria>
</task>

<task id="2.3">
<title>Integrate TableView into DashboardPage</title>
<read_first>
- frontend/src/pages/DashboardPage.tsx
</read_first>
<action>
In `frontend/src/pages/DashboardPage.tsx`, transition the UI:
1. Modify the `activeTab` states to allow `'tables'` instead of `'qr'` purely.
2. Update the navigation buttons sequentially. 
3. Remove the old standalone `<Input />` for ad-hoc Table generation in `DashboardPage`.
4. Render `<TableView restaurantId={activeRestaurant.id} />` when `activeTab === 'tables'`.
</action>
<acceptance_criteria>
- Dashboard shows a clean "Tables & QR" tab.
- Old manual ad-hoc table generator is purged in favor of the formal `TableView`.
</acceptance_criteria>
</task>
