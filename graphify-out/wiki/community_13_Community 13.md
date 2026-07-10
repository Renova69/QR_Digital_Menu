# Community 13

**Community 13** — 15 nodes

## Nodes

### table.tsx

- **ID:** `apps_frontend_src_components_ui_table_tsx`
- **Type:** code
- **Degree:** 11
- **Source:** `apps/frontend/src/components/ui/table.tsx` @ L1
- **Outbound:**
  - → `Table` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `TableBody` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `TableFooter` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `TableRow` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `TableHead` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `TableCell` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `TableCaption` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `RecentOrders.tsx` [_`imports_from`_ | c79]
  - ↔ `utils.ts` [_`imports_from`_ | c40]
  - ↔ `cn()` [_`imports`_ | c0]
  - ↔ `TableHeader` [_`contains`_ | c79]

### Order

- **ID:** `types_index_order`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/frontend/src/types/index.ts` @ L3
- **Cross-community:**
  - ↔ `RecentOrders.tsx` [_`imports`_ | c79]
  - ↔ `useDashboard.ts` [_`imports`_ | c49]
  - ↔ `index.ts` [_`contains`_ | c49]

### Table

- **ID:** `ui_table_table`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/components/ui/table.tsx` @ L5
- **Cross-community:**
  - ↔ `RecentOrders.tsx` [_`imports`_ | c79]

### TableBody

- **ID:** `ui_table_tablebody`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/components/ui/table.tsx` @ L27
- **Cross-community:**
  - ↔ `RecentOrders.tsx` [_`imports`_ | c79]

### TableCell

- **ID:** `ui_table_tablecell`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/components/ui/table.tsx` @ L84
- **Cross-community:**
  - ↔ `RecentOrders.tsx` [_`imports`_ | c79]

### TableHead

- **ID:** `ui_table_tablehead`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/components/ui/table.tsx` @ L69
- **Cross-community:**
  - ↔ `RecentOrders.tsx` [_`imports`_ | c79]

### TableRow

- **ID:** `ui_table_tablerow`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/components/ui/table.tsx` @ L54
- **Cross-community:**
  - ↔ `RecentOrders.tsx` [_`imports`_ | c79]

### order.entity.ts

- **ID:** `apps_backend_src_orders_entities_order_entity_ts`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/orders/entities/order.entity.ts` @ L1
- **Cross-community:**
  - ↔ `Order` [_`contains`_ | c178]

### RecentOrders()

- **ID:** `dashboard_recentorders_recentorders`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/dashboard/RecentOrders.tsx` @ L16
- **Cross-community:**
  - ↔ `RecentOrders.tsx` [_`contains`_ | c79]

### RecentOrdersProps

- **ID:** `dashboard_recentorders_recentordersprops`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/dashboard/RecentOrders.tsx` @ L12
- **Cross-community:**
  - ↔ `RecentOrders.tsx` [_`contains`_ | c79]

### DashboardSummary

- **ID:** `hooks_usedashboard_dashboardsummary`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/hooks/useDashboard.ts` @ L5
- **Cross-community:**
  - ↔ `useDashboard.ts` [_`contains`_ | c49]

### fetchDashboardSummary()

- **ID:** `hooks_usedashboard_fetchdashboardsummary`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/hooks/useDashboard.ts` @ L12
- **Cross-community:**
  - ↔ `useDashboard.ts` [_`contains`_ | c49]

### useDashboard()

- **ID:** `hooks_usedashboard_usedashboard`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/hooks/useDashboard.ts` @ L17
- **Cross-community:**
  - ↔ `useDashboard.ts` [_`contains`_ | c49]

### TableCaption

- **ID:** `ui_table_tablecaption`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/ui/table.tsx` @ L96

### TableFooter

- **ID:** `ui_table_tablefooter`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/ui/table.tsx` @ L39
