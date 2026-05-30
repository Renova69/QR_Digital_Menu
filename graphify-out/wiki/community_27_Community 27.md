# Community 27

**Community 27** — 7 nodes

## Nodes

### ErrorBoundary.tsx
- **ID:** `apps_frontend_src_components_errorboundary_tsx`
- **Type:** code
- **Degree:** 5
- **Source:** `apps/frontend/src/components/ErrorBoundary.tsx` @ L1
- **Outbound:**
  - → `Props` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `State` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `ErrorBoundary` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `App.tsx` [_`imports_from`_ | c22]
  - ↔ `DashboardPage.tsx` [_`imports_from`_ | c39]

### ErrorBoundary
- **ID:** `components_errorboundary_errorboundary`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/frontend/src/components/ErrorBoundary.tsx` @ L12
- **Outbound:**
  - → `.getDerivedStateFromError()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.componentDidCatch()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.render()` [_`method`_ | EXTRACTED | score: 1.0]

### .componentDidCatch()
- **ID:** `components_errorboundary_errorboundary_componentdidcatch`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/ErrorBoundary.tsx` @ L22

### .getDerivedStateFromError()
- **ID:** `components_errorboundary_errorboundary_getderivedstatefromerror`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/ErrorBoundary.tsx` @ L18

### .render()
- **ID:** `components_errorboundary_errorboundary_render`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/ErrorBoundary.tsx` @ L30

### Props
- **ID:** `components_errorboundary_props`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/ErrorBoundary.tsx` @ L3

### State
- **ID:** `components_errorboundary_state`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/ErrorBoundary.tsx` @ L7
