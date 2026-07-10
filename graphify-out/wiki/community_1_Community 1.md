# Community 1

**Community 1** — 86 nodes

## Nodes

### JwtAuthGuard

- **ID:** `auth_jwt_auth_guard_jwtauthguard`
- **Type:** code
- **Degree:** 25
- **Source:** `apps/backend/src/auth/jwt-auth.guard.ts` @ L5
- **Outbound:**
  - → `audit.controller.ts` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `menu-option.controller.ts` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `restaurants.controller.ts` [_`imports`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `auth.controller.ts` [_`imports`_ | c76]
  - ↔ `jwt-auth.guard.ts` [_`contains`_ | c38]
  - ↔ `dashboard.controller.ts` [_`imports`_ | c13]
  - ↔ `feedback.controller.ts` [_`imports`_ | c18]
  - ↔ `help-content.controller.ts` [_`imports`_ | c86]

### restaurants.controller.ts

- **ID:** `apps_backend_src_restaurants_restaurants_controller_ts`
- **Type:** code
- **Degree:** 23
- **Source:** `apps/backend/src/restaurants/restaurants.controller.ts` @ L1
- **Outbound:**
  - → `StorageService` [_`imports`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `jwt-auth.guard.ts` [_`imports_from`_ | c38]
  - ↔ `device-enrollment.service.ts` [_`imports_from`_ | c62]
  - ↔ `DeviceEnrollmentService` [_`imports`_ | c58]
  - ↔ `restaurants.service.ts` [_`imports_from`_ | c62]
  - ↔ `RestaurantsService` [_`imports`_ | c28]

### EventsGateway

- **ID:** `events_events_gateway_eventsgateway`
- **Type:** code
- **Degree:** 19
- **Source:** `apps/backend/src/events/events.gateway.ts` @ L38
- **Outbound:**
  - → `.handleConnection()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.handleDisconnect()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.handleJoinRoom()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.handleLeaveRoom()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.handleJoinOrderRoom()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.emitToRestaurant()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.emitTableStatusChanged()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.emitToOrder()` [_`method`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `assistance.service.spec.ts` [_`imports`_ | c24]
  - ↔ `assistance.service.ts` [_`imports`_ | c24]
  - ↔ `events.gateway.ts` [_`contains`_ | c24]
  - ↔ `.emitZoneChanged()` [_`method`_ | c24]
  - ↔ `events.module.ts` [_`imports`_ | c15]

### PrismaModule

- **ID:** `prisma_prisma_module_prismamodule`
- **Type:** code
- **Degree:** 18
- **Source:** `apps/backend/src/prisma/prisma.module.ts` @ L9
- **Cross-community:**
  - ↔ `app.module.ts` [_`imports`_ | c15]
  - ↔ `assistance.module.ts` [_`imports`_ | c15]
  - ↔ `auth.module.ts` [_`imports`_ | c52]
  - ↔ `dashboard.module.ts` [_`imports`_ | c15]
  - ↔ `feedback.module.ts` [_`imports`_ | c18]

### TablesService

- **ID:** `tables_tables_service_tablesservice`
- **Type:** code
- **Degree:** 14
- **Source:** `apps/backend/src/tables/tables.service.ts` @ L17
- **Outbound:**
  - → `.getTablesWithStatus()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.remove()` [_`method`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `tables.controller.ts` [_`imports`_ | c14]
  - ↔ `tables.module.ts` [_`imports`_ | c15]
  - ↔ `tables.service.spec.ts` [_`imports`_ | c14]
  - ↔ `tables.service.ts` [_`contains`_ | c14]
  - ↔ `.constructor()` [_`method`_ | c14]

### assistance.controller.ts

- **ID:** `apps_backend_src_assistance_assistance_controller_ts`
- **Type:** code
- **Degree:** 12
- **Source:** `apps/backend/src/assistance/assistance.controller.ts` @ L1
- **Outbound:**
  - → `AssistanceService` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `JwtAuthGuard` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `PaginationDto` [_`imports`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `assistance.service.ts` [_`imports_from`_ | c24]
  - ↔ `create-assistance.dto.ts` [_`imports_from`_ | c24]
  - ↔ `CreateAssistanceDto` [_`imports`_ | c24]
  - ↔ `update-assistance.dto.ts` [_`imports_from`_ | c24]
  - ↔ `UpdateAssistanceDto` [_`imports`_ | c24]

### menu-option.controller.ts

- **ID:** `apps_backend_src_menu_menu_option_controller_ts`
- **Type:** code
- **Degree:** 11
- **Source:** `apps/backend/src/menu/menu-option.controller.ts` @ L1
- **Outbound:**
  - → `MenuOptionDetailController` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `jwt-auth.guard.ts` [_`imports_from`_ | c38]
  - ↔ `menu-crud.service.ts` [_`imports_from`_ | c73]
  - ↔ `MenuCrudService` [_`imports`_ | c26]
  - ↔ `create-menu-option.dto.ts` [_`imports_from`_ | c73]
  - ↔ `CreateMenuOptionDto` [_`imports`_ | c73]

### AssistanceService

- **ID:** `assistance_assistance_service_assistanceservice`
- **Type:** code
- **Degree:** 11
- **Source:** `apps/backend/src/assistance/assistance.service.ts` @ L16
- **Cross-community:**
  - ↔ `assistance.module.ts` [_`imports`_ | c15]
  - ↔ `assistance.service.spec.ts` [_`imports`_ | c24]
  - ↔ `assistance.service.ts` [_`contains`_ | c24]
  - ↔ `.constructor()` [_`method`_ | c112]
  - ↔ `.verifyRequestAccess()` [_`method`_ | c112]

### StorageService

- **ID:** `storage_storage_service_storageservice`
- **Type:** code
- **Degree:** 11
- **Source:** `apps/backend/src/storage/storage.service.ts` @ L21
- **Outbound:**
  - → `.upload()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.uploadWithThumbnail()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.uploadOptimised()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.delete()` [_`method`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `category.controller.ts` [_`imports`_ | c61]
  - ↔ `item.controller.ts` [_`imports`_ | c73]
  - ↔ `storage.module.ts` [_`imports`_ | c60]
  - ↔ `storage.service.spec.ts` [_`imports`_ | c60]
  - ↔ `storage.service.ts` [_`contains`_ | c60]

### restaurantService.ts

- **ID:** `apps_frontend_src_services_restaurantservice_ts`
- **Type:** code
- **Degree:** 10
- **Source:** `apps/frontend/src/services/restaurantService.ts` @ L1
- **Outbound:**
  - → `createRestaurant()` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `RestaurantContext.tsx` [_`imports_from`_ | c17]
  - ↔ `api.ts` [_`imports_from`_ | c3]
  - ↔ `MenuEditorPage.tsx` [_`imports_from`_ | c50]
  - ↔ `PublicMenuPage.tsx` [_`imports_from`_ | c35]
  - ↔ `RestaurantBasicsStep.tsx` [_`imports_from`_ | c17]

### TablesController

- **ID:** `tables_tables_controller_tablescontroller`
- **Type:** code
- **Degree:** 10
- **Source:** `apps/backend/src/tables/tables.controller.ts` @ L20
- **Cross-community:**
  - ↔ `tables.controller.ts` [_`contains`_ | c14]
  - ↔ `.constructor()` [_`method`_ | c14]
  - ↔ `.create()` [_`method`_ | c14]
  - ↔ `.bulkCreate()` [_`method`_ | c14]
  - ↔ `.findAll()` [_`method`_ | c14]

### menu-translation.service.ts

- **ID:** `apps_backend_src_menu_menu_translation_service_ts`
- **Type:** code
- **Degree:** 9
- **Source:** `apps/backend/src/menu/menu-translation.service.ts` @ L1
- **Cross-community:**
  - ↔ `menu-crud.service.spec.ts` [_`imports_from`_ | c72]
  - ↔ `menu-crud.service.ts` [_`imports_from`_ | c73]
  - ↔ `menu-translation.service.spec.ts` [_`imports_from`_ | c33]
  - ↔ `prisma.service.ts` [_`imports_from`_ | c6]
  - ↔ `PrismaService` [_`imports`_ | c6]

### FeedbackService

- **ID:** `feedback_feedback_service_feedbackservice`
- **Type:** code
- **Degree:** 9
- **Source:** `apps/backend/src/feedback/feedback.service.ts` @ L12
- **Cross-community:**
  - ↔ `feedback.controller.ts` [_`imports`_ | c18]
  - ↔ `feedback.module.ts` [_`imports`_ | c18]
  - ↔ `feedback.service.spec.ts` [_`imports`_ | c18]
  - ↔ `feedback.service.ts` [_`contains`_ | c18]
  - ↔ `.constructor()` [_`method`_ | c18]

### PaginationDto

- **ID:** `dto_pagination_dto_paginationdto`
- **Type:** code
- **Degree:** 7
- **Source:** `apps/backend/src/common/dto/pagination.dto.ts` @ L4
- **Cross-community:**
  - ↔ `assistance.service.ts` [_`imports`_ | c24]
  - ↔ `pagination.dto.ts` [_`contains`_ | c18]
  - ↔ `feedback.controller.ts` [_`imports`_ | c18]
  - ↔ `feedback.service.ts` [_`imports`_ | c18]
  - ↔ `order-query.dto.ts` [_`imports`_ | c34]

### FeedbackController

- **ID:** `feedback_feedback_controller_feedbackcontroller`
- **Type:** code
- **Degree:** 7
- **Source:** `apps/backend/src/feedback/feedback.controller.ts` @ L18
- **Cross-community:**
  - ↔ `feedback.controller.ts` [_`contains`_ | c18]
  - ↔ `.constructor()` [_`method`_ | c18]
  - ↔ `.create()` [_`method`_ | c18]
  - ↔ `.getGoogleReviewUrl()` [_`method`_ | c18]
  - ↔ `.findAll()` [_`method`_ | c18]

### OrdersController

- **ID:** `orders_orders_controller_orderscontroller`
- **Type:** code
- **Degree:** 7
- **Source:** `apps/backend/src/orders/orders.controller.ts` @ L24
- **Cross-community:**
  - ↔ `orders.controller.ts` [_`contains`_ | c34]
  - ↔ `.constructor()` [_`method`_ | c129]
  - ↔ `.create()` [_`method`_ | c129]
  - ↔ `.findAll()` [_`method`_ | c129]
  - ↔ `.findOne()` [_`method`_ | c129]

### audit.controller.ts

- **ID:** `apps_backend_src_menu_audit_controller_ts`
- **Type:** code
- **Degree:** 6
- **Source:** `apps/backend/src/menu/audit.controller.ts` @ L1
- **Outbound:**
  - → `MenuAuditService` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `MenuAuditController` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `jwt-auth.guard.ts` [_`imports_from`_ | c38]
  - ↔ `menu-audit.service.ts` [_`imports_from`_ | c38]
  - ↔ `menu.module.ts` [_`imports_from`_ | c37]

### CategoryController

- **ID:** `menu_category_controller_categorycontroller`
- **Type:** code
- **Degree:** 6
- **Source:** `apps/backend/src/menu/category.controller.ts` @ L27
- **Cross-community:**
  - ↔ `category.controller.ts` [_`contains`_ | c61]
  - ↔ `.constructor()` [_`method`_ | c61]
  - ↔ `.create()` [_`method`_ | c61]
  - ↔ `.findAll()` [_`method`_ | c61]
  - ↔ `.updateOrder()` [_`method`_ | c61]

### CategoryDetailController

- **ID:** `menu_category_controller_categorydetailcontroller`
- **Type:** code
- **Degree:** 6
- **Source:** `apps/backend/src/menu/category.controller.ts` @ L60
- **Cross-community:**
  - ↔ `category.controller.ts` [_`contains`_ | c61]
  - ↔ `.constructor()` [_`method`_ | c143]
  - ↔ `.update()` [_`method`_ | c143]
  - ↔ `.remove()` [_`method`_ | c143]
  - ↔ `.uploadImage()` [_`method`_ | c143]

### ItemController

- **ID:** `menu_item_controller_itemcontroller`
- **Type:** code
- **Degree:** 6
- **Source:** `apps/backend/src/menu/item.controller.ts` @ L27
- **Outbound:**
  - → `.findAll()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.updateOrder()` [_`method`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `item.controller.ts` [_`contains`_ | c73]
  - ↔ `.constructor()` [_`method`_ | c142]
  - ↔ `.create()` [_`method`_ | c142]
  - ↔ `menu.module.ts` [_`imports`_ | c37]

### ItemDetailController

- **ID:** `menu_item_controller_itemdetailcontroller`
- **Type:** code
- **Degree:** 6
- **Source:** `apps/backend/src/menu/item.controller.ts` @ L56
- **Outbound:**
  - → `.update()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.uploadImage()` [_`method`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `item.controller.ts` [_`contains`_ | c73]
  - ↔ `.constructor()` [_`method`_ | c37]
  - ↔ `.remove()` [_`method`_ | c37]
  - ↔ `menu.module.ts` [_`imports`_ | c37]

### MenuAuditService

- **ID:** `menu_menu_audit_service_menuauditservice`
- **Type:** code
- **Degree:** 6
- **Source:** `apps/backend/src/menu/menu-audit.service.ts` @ L5
- **Outbound:**
  - → `.auditMenu()` [_`method`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `menu-audit.service.spec.ts` [_`imports`_ | c42]
  - ↔ `menu-audit.service.ts` [_`contains`_ | c38]
  - ↔ `.constructor()` [_`method`_ | c42]
  - ↔ `menu.module.ts` [_`imports`_ | c37]

### main.ts

- **ID:** `apps_backend_src_main_ts`
- **Type:** code
- **Degree:** 5
- **Source:** `apps/backend/src/main.ts` @ L1
- **Outbound:**
  - → `bootstrap()` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `app.module.ts` [_`imports_from`_ | c15]
  - ↔ `redis-io.adapter.ts` [_`imports_from`_ | c84]
  - ↔ `RedisIoAdapter` [_`imports`_ | c84]

### MenuOptionDetailController

- **ID:** `menu_menu_option_controller_menuoptiondetailcontroller`
- **Type:** code
- **Degree:** 5
- **Source:** `apps/backend/src/menu/menu-option.controller.ts` @ L38
- **Cross-community:**
  - ↔ `.constructor()` [_`method`_ | c37]
  - ↔ `.update()` [_`method`_ | c37]
  - ↔ `.remove()` [_`method`_ | c37]
  - ↔ `menu.module.ts` [_`imports`_ | c37]

### AppModule

- **ID:** `src_app_module_appmodule`
- **Type:** code
- **Degree:** 5
- **Source:** `apps/backend/src/app.module.ts` @ L75
- **Outbound:**
  - → `main.ts` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `app.e2e-spec.ts` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `dashboard.e2e-spec.ts` [_`imports`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `app.module.ts` [_`contains`_ | c15]
  - ↔ `super-admin.e2e-spec.ts` [_`imports`_ | c84]

### updateRestaurant()

- **ID:** `lib_api_updaterestaurant`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/frontend/src/lib/api.ts` @ L92
- **Cross-community:**
  - ↔ `api.ts` [_`contains`_ | c3]
  - ↔ `GeneralSettingsTab.tsx` [_`imports`_ | c8]
  - ↔ `LoyaltySettingsTab.tsx` [_`imports`_ | c8]
  - ↔ `PaymentSettingsTab.tsx` [_`imports`_ | c8]

### MenuAuditController

- **ID:** `menu_audit_controller_menuauditcontroller`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/backend/src/menu/audit.controller.ts` @ L7
- **Cross-community:**
  - ↔ `.constructor()` [_`method`_ | c37]
  - ↔ `.auditMenu()` [_`method`_ | c37]
  - ↔ `menu.module.ts` [_`imports`_ | c37]

### .uploadOptimised()

- **ID:** `storage_storage_service_storageservice_uploadoptimised`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/backend/src/storage/storage.service.ts` @ L111

### TranslationModule

- **ID:** `translation_translation_module_translationmodule`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/backend/src/translation/translation.module.ts` @ L8
- **Cross-community:**
  - ↔ `app.module.ts` [_`imports`_ | c15]
  - ↔ `menu.module.ts` [_`imports`_ | c37]
  - ↔ `restaurants.module.ts` [_`imports`_ | c15]
  - ↔ `translation.module.ts` [_`contains`_ | c37]

### AssistanceModule

- **ID:** `assistance_assistance_module_assistancemodule`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/backend/src/assistance/assistance.module.ts` @ L12
- **Cross-community:**
  - ↔ `app.module.ts` [_`imports`_ | c15]
  - ↔ `assistance.module.ts` [_`contains`_ | c15]
  - ↔ `dashboard.module.ts` [_`imports`_ | c15]

### CreateFeedbackDto

- **ID:** `dto_create_feedback_dto_createfeedbackdto`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/backend/src/feedback/dto/create-feedback.dto.ts` @ L11
- **Cross-community:**
  - ↔ `feedback.controller.ts` [_`imports`_ | c18]
  - ↔ `feedback.service.ts` [_`imports`_ | c18]
  - ↔ `create-feedback.dto.ts` [_`contains`_ | c18]

### .emitToRestaurant()

- **ID:** `events_events_gateway_eventsgateway_emittorestaurant`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/backend/src/events/events.gateway.ts` @ L99
- **Outbound:**
  - → `.emitTableStatusChanged()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `.emitZoneChanged()` [_`calls`_ | c24]

### EventsModule

- **ID:** `events_events_module_eventsmodule`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/backend/src/events/events.module.ts` @ L9
- **Cross-community:**
  - ↔ `app.module.ts` [_`imports`_ | c15]
  - ↔ `events.module.ts` [_`contains`_ | c15]
  - ↔ `tables.module.ts` [_`imports`_ | c15]

### HealthController

- **ID:** `health_health_controller_healthcontroller`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/backend/src/health/health.controller.ts` @ L5
- **Outbound:**
  - → `.check()` [_`method`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `health.controller.ts` [_`contains`_ | c15]
  - ↔ `health.module.ts` [_`imports`_ | c15]

### getStripeStatus()

- **ID:** `lib_api_getstripestatus`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/frontend/src/lib/api.ts` @ L425
- **Cross-community:**
  - ↔ `api.ts` [_`contains`_ | c3]
  - ↔ `PaymentSettingsTab.tsx` [_`imports`_ | c8]
  - ↔ `OnboardingPage.tsx` [_`imports`_ | c20]

### OrdersModule

- **ID:** `orders_orders_module_ordersmodule`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/backend/src/orders/orders.module.ts` @ L13
- **Cross-community:**
  - ↔ `app.module.ts` [_`imports`_ | c15]
  - ↔ `dashboard.module.ts` [_`imports`_ | c15]
  - ↔ `orders.module.ts` [_`contains`_ | c15]

### PaymentModule

- **ID:** `payment_payment_module_paymentmodule`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/backend/src/payment/payment.module.ts` @ L11
- **Cross-community:**
  - ↔ `app.module.ts` [_`imports`_ | c15]
  - ↔ `payment.module.ts` [_`contains`_ | c15]
  - ↔ `restaurants.module.ts` [_`imports`_ | c15]

### .generateConnectLink()

- **ID:** `restaurants_restaurants_service_restaurantsservice_generateconnectlink`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/backend/src/restaurants/restaurants.service.ts` @ L314
- **Cross-community:**
  - ↔ `RestaurantsService` [_`method`_ | c28]
  - ↔ `.findOne()` [_`calls`_ | c28]
  - ↔ `.update()` [_`calls`_ | c28]

### .translateAll()

- **ID:** `restaurants_restaurants_service_restaurantsservice_translateall`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/backend/src/restaurants/restaurants.service.ts` @ L157
- **Cross-community:**
  - ↔ `RestaurantsService` [_`method`_ | c28]
  - ↔ `.findOneForManagement()` [_`calls`_ | c28]
  - ↔ `.update()` [_`calls`_ | c28]

### .updateLogo()

- **ID:** `restaurants_restaurants_service_restaurantsservice_updatelogo`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/backend/src/restaurants/restaurants.service.ts` @ L147
- **Cross-community:**
  - ↔ `RestaurantsService` [_`method`_ | c28]
  - ↔ `.findOneForManagement()` [_`calls`_ | c28]
  - ↔ `.update()` [_`calls`_ | c28]

### createRestaurant()

- **ID:** `services_restaurantservice_createrestaurant`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/frontend/src/services/restaurantService.ts` @ L74
- **Cross-community:**
  - ↔ `RestaurantContext.tsx` [_`imports`_ | c17]
  - ↔ `RestaurantBasicsStep.tsx` [_`imports`_ | c17]

### AppService

- **ID:** `src_app_service_appservice`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/backend/src/app.service.ts` @ L4
- **Outbound:**
  - → `.getHello()` [_`method`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `app.module.ts` [_`imports`_ | c15]
  - ↔ `app.service.ts` [_`contains`_ | c161]

### restaurants-stripe.service.spec.ts

- **ID:** `apps_backend_src_restaurants_restaurants_stripe_service_spec_ts`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/restaurants/restaurants-stripe.service.spec.ts` @ L1
- **Cross-community:**
  - ↔ `restaurants.service.ts` [_`imports_from`_ | c62]
  - ↔ `RestaurantsService` [_`imports`_ | c28]

### app.e2e-spec.ts

- **ID:** `apps_backend_test_app_e2e_spec_ts`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/test/app.e2e-spec.ts` @ L1
- **Cross-community:**
  - ↔ `app.module.ts` [_`imports_from`_ | c15]

### dashboard.e2e-spec.ts

- **ID:** `apps_backend_test_dashboard_e2e_spec_ts`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/test/dashboard.e2e-spec.ts` @ L1
- **Cross-community:**
  - ↔ `app.module.ts` [_`imports_from`_ | c15]

### DashboardModule

- **ID:** `dashboard_dashboard_module_dashboardmodule`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/dashboard/dashboard.module.ts` @ L14
- **Cross-community:**
  - ↔ `app.module.ts` [_`imports`_ | c15]
  - ↔ `dashboard.module.ts` [_`contains`_ | c15]

### .emitTableStatusChanged()

- **ID:** `events_events_gateway_eventsgateway_emittablestatuschanged`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/events/events.gateway.ts` @ L103

### FeedbackModule

- **ID:** `feedback_feedback_module_feedbackmodule`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/feedback/feedback.module.ts` @ L12
- **Cross-community:**
  - ↔ `app.module.ts` [_`imports`_ | c15]
  - ↔ `feedback.module.ts` [_`contains`_ | c18]

### HealthModule

- **ID:** `health_health_module_healthmodule`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/health/health.module.ts` @ L7
- **Cross-community:**
  - ↔ `app.module.ts` [_`imports`_ | c15]
  - ↔ `health.module.ts` [_`contains`_ | c15]

### createAssistanceRequest()

- **ID:** `lib_api_createassistancerequest`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/lib/api.ts` @ L86
- **Cross-community:**
  - ↔ `api.ts` [_`contains`_ | c3]
  - ↔ `PublicMenuPage.tsx` [_`imports`_ | c35]

### createTable()

- **ID:** `lib_api_createtable`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/lib/api.ts` @ L108
- **Cross-community:**
  - ↔ `TableView.tsx` [_`imports`_ | c27]
  - ↔ `api.ts` [_`contains`_ | c3]

### disconnectStripe()

- **ID:** `lib_api_disconnectstripe`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/lib/api.ts` @ L430
- **Cross-community:**
  - ↔ `api.ts` [_`contains`_ | c3]
  - ↔ `PaymentSettingsTab.tsx` [_`imports`_ | c8]

### getTableOrders()

- **ID:** `lib_api_gettableorders`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/lib/api.ts` @ L118
- **Cross-community:**
  - ↔ `api.ts` [_`contains`_ | c3]
  - ↔ `LiveTablesView.tsx` [_`imports`_ | c3]

### updateAssistanceRequest()

- **ID:** `lib_api_updateassistancerequest`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/lib/api.ts` @ L81
- **Cross-community:**
  - ↔ `AssistanceContext.tsx` [_`imports`_ | c10]
  - ↔ `api.ts` [_`contains`_ | c3]

### MenuModule

- **ID:** `menu_menu_module_menumodule`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/menu/menu.module.ts` @ L35
- **Cross-community:**
  - ↔ `app.module.ts` [_`imports`_ | c15]
  - ↔ `menu.module.ts` [_`contains`_ | c37]

### .applyLazyTranslations()

- **ID:** `menu_menu_translation_service_menutranslationservice_applylazytranslations`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/menu/menu-translation.service.ts` @ L21
- **Cross-community:**
  - ↔ `MenuTranslationService` [_`method`_ | c72]
  - ↔ `.asTransObj()` [_`calls`_ | c72]

### .findOne()

- **ID:** `orders_orders_service_ordersservice_findone`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/orders/orders.service.ts` @ L464
- **Cross-community:**
  - ↔ `OrdersService` [_`method`_ | c56]
  - ↔ `.updateStatus()` [_`calls`_ | c56]

### RestaurantsModule

- **ID:** `restaurants_restaurants_module_restaurantsmodule`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/restaurants/restaurants.module.ts` @ L18
- **Cross-community:**
  - ↔ `app.module.ts` [_`imports`_ | c15]
  - ↔ `restaurants.module.ts` [_`contains`_ | c15]

### StorageModule

- **ID:** `storage_storage_module_storagemodule`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/storage/storage.module.ts` @ L9
- **Cross-community:**
  - ↔ `app.module.ts` [_`imports`_ | c15]
  - ↔ `storage.module.ts` [_`contains`_ | c60]

### sharp

- **ID:** `storage_storage_service_sharp`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/storage/storage.service.ts` @ L10
- **Outbound:**
  - → `.uploadOptimised()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `storage.service.ts` [_`contains`_ | c60]

### .upload()

- **ID:** `storage_storage_service_storageservice_upload`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/storage/storage.service.ts` @ L75
- **Outbound:**
  - → `.uploadOptimised()` [_`calls`_ | EXTRACTED | score: 1.0]

### .uploadWithThumbnail()

- **ID:** `storage_storage_service_storageservice_uploadwiththumbnail`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/storage/storage.service.ts` @ L94
- **Outbound:**
  - → `.uploadOptimised()` [_`calls`_ | EXTRACTED | score: 1.0]

### TablesModule

- **ID:** `tables_tables_module_tablesmodule`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/tables/tables.module.ts` @ L12
- **Cross-community:**
  - ↔ `app.module.ts` [_`imports`_ | c15]
  - ↔ `tables.module.ts` [_`contains`_ | c15]

### .getTablesWithStatus()

- **ID:** `tables_tables_service_tablesservice_gettableswithstatus`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/tables/tables.service.ts` @ L196
- **Cross-community:**
  - ↔ `.verifyRestaurantAccess()` [_`calls`_ | c14]

### .constructor()

- **ID:** `auth_auth_service_authservice_constructor`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/auth/auth.service.ts` @ L22
- **Cross-community:**
  - ↔ `AuthService` [_`method`_ | c41]

### PaginatedResult

- **ID:** `dto_pagination_dto_paginatedresult`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/common/dto/pagination.dto.ts` @ L19
- **Cross-community:**
  - ↔ `pagination.dto.ts` [_`contains`_ | c18]

### .emitToOrder()

- **ID:** `events_events_gateway_eventsgateway_emittoorder`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/events/events.gateway.ts` @ L121

### .handleConnection()

- **ID:** `events_events_gateway_eventsgateway_handleconnection`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/events/events.gateway.ts` @ L44

### .handleDisconnect()

- **ID:** `events_events_gateway_eventsgateway_handledisconnect`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/events/events.gateway.ts` @ L48

### .handleJoinOrderRoom()

- **ID:** `events_events_gateway_eventsgateway_handlejoinorderroom`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/events/events.gateway.ts` @ L87

### .handleJoinRoom()

- **ID:** `events_events_gateway_eventsgateway_handlejoinroom`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/events/events.gateway.ts` @ L57

### .handleLeaveRoom()

- **ID:** `events_events_gateway_eventsgateway_handleleaveroom`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/events/events.gateway.ts` @ L72

### .check()

- **ID:** `health_health_controller_healthcontroller_check`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/health/health.controller.ts` @ L8

### allowedTypes

- **ID:** `menu_item_controller_allowedtypes`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/menu/item.controller.ts` @ L82
- **Cross-community:**
  - ↔ `item.controller.ts` [_`contains`_ | c73]

### .findAll()

- **ID:** `menu_item_controller_itemcontroller_findall`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/menu/item.controller.ts` @ L40

### .updateOrder()

- **ID:** `menu_item_controller_itemcontroller_updateorder`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/menu/item.controller.ts` @ L45

### .update()

- **ID:** `menu_item_controller_itemdetailcontroller_update`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/menu/item.controller.ts` @ L63

### .uploadImage()

- **ID:** `menu_item_controller_itemdetailcontroller_uploadimage`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/menu/item.controller.ts` @ L90

### .auditMenu()

- **ID:** `menu_menu_audit_service_menuauditservice_auditmenu`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/menu/menu-audit.service.ts` @ L8

### .uploadLogo()

- **ID:** `restaurants_restaurants_controller_restaurantscontroller_uploadlogo`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/restaurants/restaurants.controller.ts` @ L86
- **Cross-community:**
  - ↔ `RestaurantsController` [_`method`_ | c68]

### .getHello()

- **ID:** `src_app_service_appservice_gethello`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/app.service.ts` @ L5

### bootstrap()

- **ID:** `src_main_bootstrap`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/main.ts` @ L11

### ProcessedUpload

- **ID:** `storage_storage_service_processedupload`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/storage/storage.service.ts` @ L13
- **Cross-community:**
  - ↔ `storage.service.ts` [_`contains`_ | c60]

### .delete()

- **ID:** `storage_storage_service_storageservice_delete`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/storage/storage.service.ts` @ L187

### .remove()

- **ID:** `tables_tables_service_tablesservice_remove`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/tables/tables.service.ts` @ L305

### .create()

- **ID:** `users_users_service_usersservice_create`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/users/users.service.ts` @ L27
- **Cross-community:**
  - ↔ `UsersService` [_`method`_ | c44]
