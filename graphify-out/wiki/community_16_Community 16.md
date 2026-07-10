# Community 16

**Community 16** — 14 nodes

## Nodes

### DashboardService

- **ID:** `dashboard_dashboard_service_dashboardservice`
- **Type:** code
- **Degree:** 19
- **Source:** `apps/backend/src/dashboard/dashboard.service.ts` @ L8
- **Outbound:**
  - → `.getRevenueTrend()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.getTopItems()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.getPeakHours()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.getPeriodStats()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.getOrdersByStatus()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.getCategoryBreakdown()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.getOrdersByTable()` [_`method`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `dashboard.module.ts` [_`imports`_ | c15]
  - ↔ `dashboard.service.spec.ts` [_`imports`_ | c6]
  - ↔ `dashboard.service.ts` [_`contains`_ | c6]
  - ↔ `.constructor()` [_`method`_ | c55]
  - ↔ `.getSummary()` [_`method`_ | c55]

### dashboard.controller.ts

- **ID:** `apps_backend_src_dashboard_dashboard_controller_ts`
- **Type:** code
- **Degree:** 18
- **Source:** `apps/backend/src/dashboard/dashboard.controller.ts` @ L1
- **Outbound:**
  - → `DashboardService` [_`imports`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `jwt-auth.guard.ts` [_`imports_from`_ | c38]
  - ↔ `JwtAuthGuard` [_`imports`_ | c38]
  - ↔ `date-range-query.dto.ts` [_`imports_from`_ | c13]
  - ↔ `DateRangeQueryDto` [_`imports`_ | c13]
  - ↔ `dashboard.service.ts` [_`imports_from`_ | c6]

### auth-user.decorator.ts

- **ID:** `apps_backend_src_auth_auth_user_decorator_ts`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/auth/auth-user.decorator.ts` @ L1
- **Outbound:**
  - → `AuthUser` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `dashboard.controller.ts` [_`imports_from`_ | EXTRACTED | score: 1.0]

### AuthUser

- **ID:** `auth_auth_user_decorator_authuser`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/auth/auth-user.decorator.ts` @ L3
- **Outbound:**
  - → `dashboard.controller.ts` [_`imports`_ | EXTRACTED | score: 1.0]

### .getCategoryBreakdown()

- **ID:** `dashboard_dashboard_service_dashboardservice_getcategorybreakdown`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/dashboard/dashboard.service.ts` @ L443
- **Cross-community:**
  - ↔ `.getAnalytics()` [_`calls`_ | c55]

### .getOrdersByStatus()

- **ID:** `dashboard_dashboard_service_dashboardservice_getordersbystatus`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/dashboard/dashboard.service.ts` @ L422
- **Cross-community:**
  - ↔ `.getAnalytics()` [_`calls`_ | c55]

### .getOrdersByTable()

- **ID:** `dashboard_dashboard_service_dashboardservice_getordersbytable`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/dashboard/dashboard.service.ts` @ L583
- **Cross-community:**
  - ↔ `.getAnalytics()` [_`calls`_ | c55]

### .getPeakHours()

- **ID:** `dashboard_dashboard_service_dashboardservice_getpeakhours`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/dashboard/dashboard.service.ts` @ L308
- **Cross-community:**
  - ↔ `.getAnalytics()` [_`calls`_ | c55]

### .getPeriodStats()

- **ID:** `dashboard_dashboard_service_dashboardservice_getperiodstats`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/dashboard/dashboard.service.ts` @ L341
- **Cross-community:**
  - ↔ `.getAnalytics()` [_`calls`_ | c55]

### .getRevenueTrend()

- **ID:** `dashboard_dashboard_service_dashboardservice_getrevenuetrend`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/dashboard/dashboard.service.ts` @ L219
- **Cross-community:**
  - ↔ `.getAnalytics()` [_`calls`_ | c55]

### .getTopItems()

- **ID:** `dashboard_dashboard_service_dashboardservice_gettopitems`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/dashboard/dashboard.service.ts` @ L265
- **Cross-community:**
  - ↔ `.getAnalytics()` [_`calls`_ | c55]

### getAnalytics()

- **ID:** `lib_api_getanalytics`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/lib/api.ts` @ L192
- **Cross-community:**
  - ↔ `useAnalytics.ts` [_`imports`_ | c69]
  - ↔ `api.ts` [_`contains`_ | c3]

### .getSummary()

- **ID:** `feedback_feedback_service_feedbackservice_getsummary`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/feedback/feedback.service.ts` @ L97
- **Cross-community:**
  - ↔ `FeedbackService` [_`method`_ | c18]
