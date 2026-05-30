# Community 2

**Community 2** — 83 nodes

## Nodes

### App.tsx
- **ID:** `apps_frontend_src_app_tsx`
- **Type:** code
- **Degree:** 57
- **Source:** `apps/frontend/src/App.tsx` @ L1
- **Outbound:**
  - → `AuthContext.tsx` [_`imports_from`_ | EXTRACTED | score: 1.0]
  - → `AuthProvider()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `CartProvider()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `OrderProvider()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `AssistanceProvider()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `SocketProvider()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `RestaurantProvider()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `Header.tsx` [_`imports_from`_ | EXTRACTED | score: 1.0]
  - → `PosLayout.tsx` [_`imports_from`_ | EXTRACTED | score: 1.0]
  - → `NotificationProvider()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `AppLayout()` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `PublicLayout()` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `App()` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `CartContext.tsx` [_`imports_from`_ | c63]
  - ↔ `OrderContext.tsx` [_`imports_from`_ | c25]
  - ↔ `AssistanceContext.tsx` [_`imports_from`_ | c10]
  - ↔ `SocketContext.tsx` [_`imports_from`_ | c25]
  - ↔ `PublicMenuPage.tsx` [_`imports_from`_ | c35]

### useAuth()
- **ID:** `context_authcontext_useauth`
- **Type:** code
- **Degree:** 54
- **Source:** `apps/frontend/src/context/AuthContext.tsx` @ L139
- **Outbound:**
  - → `NotificationProvider()` [_`calls`_ | EXTRACTED | score: 1.0]
  - → `OrderProvider()` [_`calls`_ | EXTRACTED | score: 1.0]
  - → `RestaurantProvider()` [_`calls`_ | EXTRACTED | score: 1.0]
  - → `DashboardPage()` [_`calls`_ | EXTRACTED | score: 1.0]
  - → `LoginPage()` [_`calls`_ | EXTRACTED | score: 1.0]
  - → `RegisterPage()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `ProtectedRoute.tsx` [_`imports`_ | c7]
  - ↔ `StaffRoute.tsx` [_`imports`_ | c7]
  - ↔ `SuperAdminRoute.tsx` [_`imports`_ | c7]
  - ↔ `SuperAdminRoute()` [_`calls`_ | c7]
  - ↔ `CustomerLoginModal.tsx` [_`imports`_ | c23]

### AuthContext.tsx
- **ID:** `apps_frontend_src_context_authcontext_tsx`
- **Type:** code
- **Degree:** 37
- **Source:** `apps/frontend/src/context/AuthContext.tsx` @ L1
- **Outbound:**
  - → `setAuthToken()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `User` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `AuthContext` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `AuthProvider()` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `useAuth()` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `ProtectedRoute.tsx` [_`imports_from`_ | c7]
  - ↔ `StaffRoute.tsx` [_`imports_from`_ | c7]
  - ↔ `SuperAdminRoute.tsx` [_`imports_from`_ | c7]
  - ↔ `CustomerLoginModal.tsx` [_`imports_from`_ | c23]
  - ↔ `TableView.tsx` [_`imports_from`_ | c27]

### App.test.tsx
- **ID:** `apps_frontend_src_app_test_tsx`
- **Type:** code
- **Degree:** 23
- **Source:** `apps/frontend/src/App.test.tsx` @ L1
- **Outbound:**
  - → `App.tsx` [_`imports_from`_ | EXTRACTED | score: 1.0]
  - → `PublicLayout()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `AppLayout()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `useOrders()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `useAssistance()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `AuthContext.tsx` [_`imports_from`_ | EXTRACTED | score: 1.0]
  - → `AuthProvider()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `useNotifications()` [_`imports`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `CartContext.tsx` [_`imports_from`_ | c63]
  - ↔ `useCart()` [_`imports`_ | c63]
  - ↔ `OrderContext.tsx` [_`imports_from`_ | c25]
  - ↔ `AssistanceContext.tsx` [_`imports_from`_ | c10]
  - ↔ `RestaurantContext.tsx` [_`imports_from`_ | c17]

### useSocket()
- **ID:** `context_socketcontext_usesocket`
- **Type:** code
- **Degree:** 17
- **Source:** `apps/frontend/src/context/SocketContext.tsx` @ L11
- **Outbound:**
  - → `OrderConfirmationPage.tsx` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `LiveTablesView()` [_`calls`_ | EXTRACTED | score: 1.0]
  - → `KitchenPage()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `PosTableModal.tsx` [_`imports`_ | c3]
  - ↔ `AssistanceContext.tsx` [_`imports`_ | c10]
  - ↔ `NotificationContext.tsx` [_`imports`_ | c39]
  - ↔ `OrderContext.tsx` [_`imports`_ | c25]
  - ↔ `RestaurantContext.tsx` [_`imports`_ | c17]

### useOrders()
- **ID:** `context_ordercontext_useorders`
- **Type:** code
- **Degree:** 11
- **Source:** `apps/frontend/src/context/OrderContext.tsx` @ L143
- **Outbound:**
  - → `DashboardPage()` [_`calls`_ | EXTRACTED | score: 1.0]
  - → `OrdersView()` [_`calls`_ | EXTRACTED | score: 1.0]
  - → `KitchenPage()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `OrderConsumer()` [_`calls`_ | c10]
  - ↔ `OrderContext.tsx` [_`contains`_ | c25]
  - ↔ `DashboardPage.tsx` [_`imports`_ | c39]
  - ↔ `OperationsView.tsx` [_`imports`_ | c10]
  - ↔ `OrdersView.tsx` [_`imports`_ | c75]

### useAssistance()
- **ID:** `context_assistancecontext_useassistance`
- **Type:** code
- **Degree:** 9
- **Source:** `apps/frontend/src/context/AssistanceContext.tsx` @ L130
- **Outbound:**
  - → `DashboardPage()` [_`calls`_ | EXTRACTED | score: 1.0]
  - → `AssistanceView()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `AssistanceConsumer()` [_`calls`_ | c10]
  - ↔ `AssistanceContext.tsx` [_`contains`_ | c10]
  - ↔ `DashboardPage.tsx` [_`imports`_ | c39]
  - ↔ `AssistanceView.tsx` [_`imports`_ | c10]
  - ↔ `OperationsView.tsx` [_`imports`_ | c10]

### Header.tsx
- **ID:** `apps_frontend_src_components_header_tsx`
- **Type:** code
- **Degree:** 7
- **Source:** `apps/frontend/src/components/Header.tsx` @ L1
- **Outbound:**
  - → `AuthContext.tsx` [_`imports_from`_ | EXTRACTED | score: 1.0]
  - → `useAuth()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `ThemeToggle()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `DASHBOARD_LANGUAGES` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `Header()` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `ThemeToggle.tsx` [_`imports_from`_ | c90]

### OrderConfirmationPage.tsx
- **ID:** `apps_frontend_src_pages_orderconfirmationpage_tsx`
- **Type:** code
- **Degree:** 7
- **Source:** `apps/frontend/src/pages/OrderConfirmationPage.tsx` @ L1
- **Cross-community:**
  - ↔ `SocketContext.tsx` [_`imports_from`_ | c25]
  - ↔ `STATUS_STEP` [_`contains`_ | c25]
  - ↔ `StatusKey` [_`contains`_ | c25]
  - ↔ `STATUS_STYLE` [_`contains`_ | c25]
  - ↔ `OrderProgressStepper()` [_`contains`_ | c25]

### useNotifications()
- **ID:** `context_notificationcontext_usenotifications`
- **Type:** code
- **Degree:** 7
- **Source:** `apps/frontend/src/context/NotificationContext.tsx` @ L109
- **Cross-community:**
  - ↔ `NotificationConsumer()` [_`calls`_ | c39]
  - ↔ `NotificationBell.tsx` [_`imports`_ | c39]
  - ↔ `PaymentToast.tsx` [_`imports`_ | c39]
  - ↔ `NotificationContext.tsx` [_`contains`_ | c39]

### SummaryView()
- **ID:** `dashboard_summaryview_summaryview`
- **Type:** code
- **Degree:** 6
- **Source:** `apps/frontend/src/pages/Dashboard/SummaryView.tsx` @ L34
- **Cross-community:**
  - ↔ `useAnalytics()` [_`calls`_ | c88]
  - ↔ `useFeature()` [_`calls`_ | c8]
  - ↔ `usePaymentSummary()` [_`calls`_ | c88]
  - ↔ `useScanStats()` [_`calls`_ | c88]
  - ↔ `useSummaryDateRange()` [_`calls`_ | c88]

### NotificationProvider()
- **ID:** `context_notificationcontext_notificationprovider`
- **Type:** code
- **Degree:** 5
- **Source:** `apps/frontend/src/context/NotificationContext.tsx` @ L38
- **Outbound:**
  - → `useSocket()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `NotificationContext.tsx` [_`contains`_ | c39]
  - ↔ `DashboardPage.tsx` [_`imports`_ | c39]

### DashboardPage()
- **ID:** `pages_dashboardpage_dashboardpage`
- **Type:** code
- **Degree:** 5
- **Source:** `apps/frontend/src/pages/DashboardPage.tsx` @ L96
- **Cross-community:**
  - ↔ `useFeature()` [_`calls`_ | c8]
  - ↔ `DashboardPage.tsx` [_`contains`_ | c39]

### TableDetailModal()
- **ID:** `tables_tabledetailmodal_tabledetailmodal`
- **Type:** code
- **Degree:** 5
- **Source:** `apps/frontend/src/components/tables/TableDetailModal.tsx` @ L126
- **Cross-community:**
  - ↔ `TableDetailModal.tsx` [_`contains`_ | c0]
  - ↔ `formatTime()` [_`calls`_ | c0]
  - ↔ `formatDate()` [_`calls`_ | c0]
  - ↔ `getElapsedLabel()` [_`calls`_ | c0]
  - ↔ `cn()` [_`calls`_ | c0]

### ThemeToggle()
- **ID:** `ui_themetoggle_themetoggle`
- **Type:** code
- **Degree:** 5
- **Source:** `apps/frontend/src/components/ui/ThemeToggle.tsx` @ L21
- **Cross-community:**
  - ↔ `TopBar.tsx` [_`imports`_ | c90]
  - ↔ `ThemeToggle.tsx` [_`contains`_ | c90]
  - ↔ `DashboardPage.tsx` [_`imports`_ | c39]
  - ↔ `MenuEditorPage.tsx` [_`imports`_ | c50]

### AssistanceProvider()
- **ID:** `context_assistancecontext_assistanceprovider`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/frontend/src/context/AssistanceContext.tsx` @ L38
- **Outbound:**
  - → `useSocket()` [_`calls`_ | EXTRACTED | score: 1.0]
  - → `useAuth()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `AssistanceContext.tsx` [_`contains`_ | c10]

### AuthProvider()
- **ID:** `context_authcontext_authprovider`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/frontend/src/context/AuthContext.tsx` @ L31
- **Cross-community:**
  - ↔ `AuthContext.test.tsx` [_`imports`_ | c7]

### OrderProvider()
- **ID:** `context_ordercontext_orderprovider`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/frontend/src/context/OrderContext.tsx` @ L58
- **Outbound:**
  - → `useSocket()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `OrderContext.tsx` [_`contains`_ | c25]

### RestaurantProvider()
- **ID:** `context_restaurantcontext_restaurantprovider`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/frontend/src/context/RestaurantContext.tsx` @ L29
- **Outbound:**
  - → `useSocket()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `RestaurantContext.tsx` [_`contains`_ | c17]

### getTableStatuses()
- **ID:** `lib_api_gettablestatuses`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/frontend/src/lib/api.ts` @ L133
- **Cross-community:**
  - ↔ `PosTableModal.tsx` [_`imports`_ | c3]
  - ↔ `api.ts` [_`contains`_ | c3]
  - ↔ `LiveTablesView.tsx` [_`imports`_ | c3]
  - ↔ `SummaryView.tsx` [_`imports`_ | c88]

### KitchenPage()
- **ID:** `staff_kitchenpage_kitchenpage`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/frontend/src/pages/staff/KitchenPage.tsx` @ L20
- **Cross-community:**
  - ↔ `useFeature()` [_`calls`_ | c8]
  - ↔ `KitchenPage.tsx` [_`contains`_ | c25]

### LoginDialog()
- **ID:** `ui_logindialog_logindialog`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/frontend/src/components/ui/LoginDialog.tsx` @ L14
- **Outbound:**
  - → `useAuth()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `LoginDialog.tsx` [_`contains`_ | c7]
  - ↔ `LoginPage.tsx` [_`imports`_ | c7]
  - ↔ `RegisterPage.tsx` [_`imports`_ | c7]

### getOrders()
- **ID:** `lib_api_getorders`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/frontend/src/lib/api.ts` @ L66
- **Cross-community:**
  - ↔ `OrderContext.tsx` [_`imports`_ | c25]
  - ↔ `api.ts` [_`contains`_ | c3]
  - ↔ `SummaryView.tsx` [_`imports`_ | c88]

### PosTableModal()
- **ID:** `pos_postablemodal_postablemodal`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/frontend/src/components/pos/PosTableModal.tsx` @ L29
- **Outbound:**
  - → `useSocket()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `PosTableModal.tsx` [_`contains`_ | c3]
  - ↔ `usePos()` [_`calls`_ | c2]

### TableCard()
- **ID:** `tables_tablecard_tablecard`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/frontend/src/components/tables/TableCard.tsx` @ L58
- **Cross-community:**
  - ↔ `TableCard.tsx` [_`contains`_ | c0]
  - ↔ `formatElapsed()` [_`calls`_ | c0]
  - ↔ `cn()` [_`calls`_ | c0]

### PosLayout.tsx
- **ID:** `apps_frontend_src_pages_pos_poslayout_tsx`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/pages/pos/PosLayout.tsx` @ L1
- **Outbound:**
  - → `PosLayout()` [_`contains`_ | EXTRACTED | score: 1.0]

### Header()
- **ID:** `components_header_header`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/components/Header.tsx` @ L14
- **Outbound:**
  - → `useAuth()` [_`calls`_ | EXTRACTED | score: 1.0]

### NotificationBell()
- **ID:** `components_notificationbell_notificationbell`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/components/NotificationBell.tsx` @ L5
- **Outbound:**
  - → `useNotifications()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `NotificationBell.tsx` [_`contains`_ | c39]

### PaymentToast()
- **ID:** `components_paymenttoast_paymenttoast`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/components/PaymentToast.tsx` @ L5
- **Outbound:**
  - → `useNotifications()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `PaymentToast.tsx` [_`contains`_ | c39]

### ProtectedRoute()
- **ID:** `components_protectedroute_protectedroute`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/components/ProtectedRoute.tsx` @ L6
- **Outbound:**
  - → `useAuth()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `ProtectedRoute.tsx` [_`contains`_ | c7]

### StaffRoute()
- **ID:** `components_staffroute_staffroute`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/components/StaffRoute.tsx` @ L11
- **Outbound:**
  - → `useAuth()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `StaffRoute.tsx` [_`contains`_ | c7]

### CartProvider()
- **ID:** `context_cartcontext_cartprovider`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/context/CartContext.tsx` @ L38
- **Cross-community:**
  - ↔ `CartContext.tsx` [_`contains`_ | c63]

### SocketProvider()
- **ID:** `context_socketcontext_socketprovider`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/context/SocketContext.tsx` @ L13
- **Cross-community:**
  - ↔ `SocketContext.tsx` [_`contains`_ | c25]

### AssistanceView()
- **ID:** `dashboard_assistanceview_assistanceview`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/pages/Dashboard/AssistanceView.tsx` @ L78
- **Cross-community:**
  - ↔ `AssistanceView.tsx` [_`contains`_ | c10]

### LiveTablesView()
- **ID:** `dashboard_livetablesview_livetablesview`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/pages/Dashboard/LiveTablesView.tsx` @ L26
- **Cross-community:**
  - ↔ `LiveTablesView.tsx` [_`contains`_ | c3]

### OrdersView()
- **ID:** `dashboard_ordersview_ordersview`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/pages/Dashboard/OrdersView.tsx` @ L119
- **Cross-community:**
  - ↔ `OrdersView.tsx` [_`contains`_ | c75]

### PaymentsView()
- **ID:** `dashboard_paymentsview_paymentsview`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/pages/Dashboard/PaymentsView.tsx` @ L36
- **Cross-community:**
  - ↔ `cn()` [_`calls`_ | c0]
  - ↔ `PaymentsView.tsx` [_`contains`_ | c0]

### getAssistanceRequests()
- **ID:** `lib_api_getassistancerequests`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/lib/api.ts` @ L76
- **Cross-community:**
  - ↔ `AssistanceContext.tsx` [_`imports`_ | c10]
  - ↔ `api.ts` [_`contains`_ | c3]

### setAuthToken()
- **ID:** `lib_api_setauthtoken`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/lib/api.ts` @ L6
- **Cross-community:**
  - ↔ `api.ts` [_`contains`_ | c3]

### updateOrderStatus()
- **ID:** `lib_api_updateorderstatus`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/lib/api.ts` @ L71
- **Cross-community:**
  - ↔ `OrderContext.tsx` [_`imports`_ | c25]
  - ↔ `api.ts` [_`contains`_ | c3]

### LoginPage()
- **ID:** `pages_loginpage_loginpage`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/pages/LoginPage.tsx` @ L6
- **Cross-community:**
  - ↔ `LoginPage.tsx` [_`contains`_ | c7]

### RegisterPage()
- **ID:** `pages_registerpage_registerpage`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/pages/RegisterPage.tsx` @ L6
- **Cross-community:**
  - ↔ `RegisterPage.tsx` [_`contains`_ | c7]

### getRestaurants()
- **ID:** `services_restaurantservice_getrestaurants`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/services/restaurantService.ts` @ L64
- **Cross-community:**
  - ↔ `RestaurantContext.tsx` [_`imports`_ | c17]
  - ↔ `restaurantService.ts` [_`contains`_ | c17]

### AppLayout()
- **ID:** `src_app_applayout`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/App.tsx` @ L57

### PublicLayout()
- **ID:** `src_app_publiclayout`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/App.tsx` @ L75

### restaurant.entity.ts
- **ID:** `apps_backend_src_restaurants_entities_restaurant_entity_ts`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/restaurants/entities/restaurant.entity.ts` @ L1
- **Cross-community:**
  - ↔ `Restaurant` [_`contains`_ | c179]

### DASHBOARD_LANGUAGES
- **ID:** `components_header_dashboard_languages`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/Header.tsx` @ L8

### RestaurantList()
- **ID:** `components_restaurantlist_restaurantlist`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/RestaurantList.tsx` @ L4
- **Cross-community:**
  - ↔ `RestaurantList.tsx` [_`contains`_ | c17]

### ALLOWED_ROLES
- **ID:** `components_staffroute_allowed_roles`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/StaffRoute.tsx` @ L4
- **Cross-community:**
  - ↔ `StaffRoute.tsx` [_`contains`_ | c7]

### AssistanceContext
- **ID:** `context_assistancecontext_assistancecontext`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/context/AssistanceContext.tsx` @ L35
- **Cross-community:**
  - ↔ `AssistanceContext.tsx` [_`contains`_ | c10]

### AssistanceContextType
- **ID:** `context_assistancecontext_assistancecontexttype`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/context/AssistanceContext.tsx` @ L27
- **Cross-community:**
  - ↔ `AssistanceContext.tsx` [_`contains`_ | c10]

### AssistanceRequest
- **ID:** `context_assistancecontext_assistancerequest`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/context/AssistanceContext.tsx` @ L17
- **Cross-community:**
  - ↔ `AssistanceContext.tsx` [_`contains`_ | c10]

### AuthContext
- **ID:** `context_authcontext_authcontext`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/context/AuthContext.tsx` @ L29

### User
- **ID:** `context_authcontext_user`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/context/AuthContext.tsx` @ L6

### NotificationContext
- **ID:** `context_notificationcontext_notificationcontext`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/context/NotificationContext.tsx` @ L28
- **Cross-community:**
  - ↔ `NotificationContext.tsx` [_`contains`_ | c39]

### PaymentNotification
- **ID:** `context_notificationcontext_paymentnotification`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/context/NotificationContext.tsx` @ L6
- **Cross-community:**
  - ↔ `NotificationContext.tsx` [_`contains`_ | c39]

### OrderContext
- **ID:** `context_ordercontext_ordercontext`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/context/OrderContext.tsx` @ L55
- **Cross-community:**
  - ↔ `OrderContext.tsx` [_`contains`_ | c25]

### RestaurantContext
- **ID:** `context_restaurantcontext_restaurantcontext`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/context/RestaurantContext.tsx` @ L19
- **Cross-community:**
  - ↔ `RestaurantContext.tsx` [_`contains`_ | c17]

### SocketContext
- **ID:** `context_socketcontext_socketcontext`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/context/SocketContext.tsx` @ L9
- **Cross-community:**
  - ↔ `SocketContext.tsx` [_`contains`_ | c25]

### FilterMode
- **ID:** `dashboard_livetablesview_filtermode`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/pages/Dashboard/LiveTablesView.tsx` @ L12
- **Cross-community:**
  - ↔ `LiveTablesView.tsx` [_`contains`_ | c3]

### AuditIssue
- **ID:** `dashboard_menucheckwidget_auditissue`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/dashboard/MenuCheckWidget.tsx` @ L8
- **Cross-community:**
  - ↔ `MenuCheckWidget.tsx` [_`contains`_ | c17]

### MenuCheckWidget()
- **ID:** `dashboard_menucheckwidget_menucheckwidget`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/dashboard/MenuCheckWidget.tsx` @ L16
- **Cross-community:**
  - ↔ `MenuCheckWidget.tsx` [_`contains`_ | c17]

### BOTTOM_NAV_TABS
- **ID:** `pages_dashboardpage_bottom_nav_tabs`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/pages/DashboardPage.tsx` @ L57
- **Cross-community:**
  - ↔ `DashboardPage.tsx` [_`contains`_ | c39]

### TabId
- **ID:** `pages_dashboardpage_tabid`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/pages/DashboardPage.tsx` @ L47
- **Cross-community:**
  - ↔ `DashboardPage.tsx` [_`contains`_ | c39]

### VALID_TABS
- **ID:** `pages_dashboardpage_valid_tabs`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/pages/DashboardPage.tsx` @ L79
- **Cross-community:**
  - ↔ `DashboardPage.tsx` [_`contains`_ | c39]

### OAuthCallbackPage()
- **ID:** `pages_oauthcallbackpage_oauthcallbackpage`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/pages/OAuthCallbackPage.tsx` @ L5
- **Cross-community:**
  - ↔ `OAuthCallbackPage.tsx` [_`contains`_ | c3]

### PosLayout()
- **ID:** `pos_poslayout_poslayout`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/pages/pos/PosLayout.tsx` @ L5

### STATUS_COLORS
- **ID:** `pos_postablemodal_status_colors`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/pos/PosTableModal.tsx` @ L23
- **Cross-community:**
  - ↔ `PosTableModal.tsx` [_`contains`_ | c3]

### TableStatus
- **ID:** `pos_postablemodal_tablestatus`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/pos/PosTableModal.tsx` @ L11
- **Cross-community:**
  - ↔ `PosTableModal.tsx` [_`contains`_ | c3]

### App()
- **ID:** `src_app_app`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/App.tsx` @ L87

### COLUMNS
- **ID:** `staff_kitchenpage_columns`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/pages/staff/KitchenPage.tsx` @ L12
- **Cross-community:**
  - ↔ `KitchenPage.tsx` [_`contains`_ | c25]

### elapsedMinutes()
- **ID:** `staff_kitchenpage_elapsedminutes`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/pages/staff/KitchenPage.tsx` @ L7
- **Cross-community:**
  - ↔ `KitchenPage.tsx` [_`contains`_ | c25]

### TableCardProps
- **ID:** `tables_tablecard_tablecardprops`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/tables/TableCard.tsx` @ L6
- **Cross-community:**
  - ↔ `TableCard.tsx` [_`contains`_ | c0]

### OrderDetail
- **ID:** `tables_tabledetailmodal_orderdetail`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/tables/TableDetailModal.tsx` @ L7
- **Cross-community:**
  - ↔ `TableDetailModal.tsx` [_`contains`_ | c0]

### statusLabels
- **ID:** `tables_tabledetailmodal_statuslabels`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/tables/TableDetailModal.tsx` @ L42
- **Cross-community:**
  - ↔ `TableDetailModal.tsx` [_`contains`_ | c0]

### OrderStatus
- **ID:** `types_index_orderstatus`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/types/index.ts` @ L1
- **Cross-community:**
  - ↔ `index.ts` [_`contains`_ | c49]

### LoginDialogProps
- **ID:** `ui_logindialog_logindialogprops`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/ui/LoginDialog.tsx` @ L7
- **Cross-community:**
  - ↔ `LoginDialog.tsx` [_`contains`_ | c7]

### ThemeToggleProps
- **ID:** `ui_themetoggle_themetoggleprops`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/ui/ThemeToggle.tsx` @ L4
- **Cross-community:**
  - ↔ `ThemeToggle.tsx` [_`contains`_ | c90]
