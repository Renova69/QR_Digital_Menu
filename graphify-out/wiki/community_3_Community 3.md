# Community 3

**Community 3** — 52 nodes

## Nodes

### PrismaService

- **ID:** `prisma_prisma_service_prismaservice`
- **Type:** code
- **Degree:** 55
- **Source:** `apps/backend/src/prisma/prisma.service.ts` @ L28
- **Outbound:**
  - → `.enableShutdownHooks()` [_`method`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `assistance.service.spec.ts` [_`imports`_ | c24]
  - ↔ `assistance.service.ts` [_`imports`_ | c24]
  - ↔ `auth.service.ts` [_`imports`_ | c44]
  - ↔ `jwt.strategy.ts` [_`imports`_ | c6]
  - ↔ `dashboard-views.service.ts` [_`imports`_ | c6]

### orders.service.spec.ts

- **ID:** `apps_backend_src_orders_orders_service_spec_ts`
- **Type:** code
- **Degree:** 17
- **Source:** `apps/backend/src/orders/orders.service.spec.ts` @ L1
- **Outbound:**
  - → `OrdersService` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `PrismaService` [_`imports`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `events.gateway.ts` [_`imports_from`_ | c24]
  - ↔ `EventsGateway` [_`imports`_ | c24]
  - ↔ `orders.service.ts` [_`imports_from`_ | c34]
  - ↔ `prisma.service.ts` [_`imports_from`_ | c6]
  - ↔ `feature.service.ts` [_`imports_from`_ | c13]

### LoyaltyService

- **ID:** `loyalty_loyalty_service_loyaltyservice`
- **Type:** code
- **Degree:** 15
- **Source:** `apps/backend/src/loyalty/loyalty.service.ts` @ L45
- **Outbound:**
  - → `.buildRewardSummary()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.getPublicConfig()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.enroll()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.getPoints()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.getLoyaltyAccounts()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.getHistory()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.notifyExpiryReminders()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.getExpiryReminderCandidates()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.runDailyExpiryReminders()` [_`method`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `loyalty.controller.ts` [_`imports`_ | c13]
  - ↔ `loyalty.module.ts` [_`imports`_ | c15]
  - ↔ `loyalty.service.spec.ts` [_`imports`_ | c1]
  - ↔ `loyalty.service.ts` [_`contains`_ | c1]
  - ↔ `.constructor()` [_`method`_ | c1]

### loyalty-ledger.utils.ts

- **ID:** `apps_backend_src_loyalty_loyalty_ledger_utils_ts`
- **Type:** code
- **Degree:** 12
- **Source:** `apps/backend/src/loyalty/loyalty-ledger.utils.ts` @ L1
- **Outbound:**
  - → `SPENDABLE_ENTRY_TYPES` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `addDays()` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `getRewardValue()` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `getFirstRewardProgress()` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `expireAccountPoints()` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `redeemAccountPoints()` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `addEarnedPointBatch()` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `getExpiringPointBatches()` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `markRemindersSent()` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `loyalty-ledger.utils.spec.ts` [_`imports_from`_ | c1]
  - ↔ `loyalty.service.ts` [_`imports_from`_ | c1]
  - ↔ `orders.service.ts` [_`imports_from`_ | c34]

### LoyaltyController

- **ID:** `loyalty_loyalty_controller_loyaltycontroller`
- **Type:** code
- **Degree:** 11
- **Source:** `apps/backend/src/loyalty/loyalty.controller.ts` @ L9
- **Outbound:**
  - → `.getExpiryReminders()` [_`method`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `loyalty.controller.ts` [_`contains`_ | c13]
  - ↔ `.constructor()` [_`method`_ | c97]
  - ↔ `.getLoyaltyAccounts()` [_`method`_ | c97]
  - ↔ `.getHistory()` [_`method`_ | c97]
  - ↔ `.getAnalytics()` [_`method`_ | c97]

### OrdersService

- **ID:** `orders_orders_service_ordersservice`
- **Type:** code
- **Degree:** 9
- **Source:** `apps/backend/src/orders/orders.service.ts` @ L33
- **Outbound:**
  - → `.updateStatus()` [_`method`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `orders.controller.ts` [_`imports`_ | c34]
  - ↔ `orders.module.ts` [_`imports`_ | c15]
  - ↔ `orders.service.ts` [_`contains`_ | c34]
  - ↔ `.constructor()` [_`method`_ | c56]
  - ↔ `.create()` [_`method`_ | c56]

### loyalty-tiers.utils.ts

- **ID:** `apps_backend_src_loyalty_loyalty_tiers_utils_ts`
- **Type:** code
- **Degree:** 8
- **Source:** `apps/backend/src/loyalty/loyalty-tiers.utils.ts` @ L1
- **Outbound:**
  - → `TierName` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `TierConfig` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `TierInfo` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `getTierInfo()` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `tierConfigFromRestaurant()` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `loyalty-tiers.utils.spec.ts` [_`imports_from`_ | c1]
  - ↔ `loyalty.service.ts` [_`imports_from`_ | c1]
  - ↔ `orders.service.ts` [_`imports_from`_ | c34]

### .buildRewardSummary()

- **ID:** `loyalty_loyalty_service_loyaltyservice_buildrewardsummary`
- **Type:** code
- **Degree:** 6
- **Source:** `apps/backend/src/loyalty/loyalty.service.ts` @ L50
- **Outbound:**
  - → `.getPoints()` [_`calls`_ | EXTRACTED | score: 1.0]

### addDays()

- **ID:** `loyalty_loyalty_ledger_utils_adddays`
- **Type:** code
- **Degree:** 5
- **Source:** `apps/backend/src/loyalty/loyalty-ledger.utils.ts` @ L11
- **Outbound:**
  - → `getExpiringPointBatches()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `loyalty-ledger.utils.spec.ts` [_`imports`_ | c1]
  - ↔ `loyalty.service.ts` [_`imports`_ | c1]
  - ↔ `orders.service.ts` [_`imports`_ | c34]

### getTierInfo()

- **ID:** `loyalty_loyalty_tiers_utils_gettierinfo`
- **Type:** code
- **Degree:** 5
- **Source:** `apps/backend/src/loyalty/loyalty-tiers.utils.ts` @ L18
- **Outbound:**
  - → `.buildRewardSummary()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `loyalty-tiers.utils.spec.ts` [_`imports`_ | c1]
  - ↔ `loyalty.service.ts` [_`imports`_ | c1]
  - ↔ `orders.service.ts` [_`imports`_ | c34]

### tierConfigFromRestaurant()

- **ID:** `loyalty_loyalty_tiers_utils_tierconfigfromrestaurant`
- **Type:** code
- **Degree:** 5
- **Source:** `apps/backend/src/loyalty/loyalty-tiers.utils.ts` @ L57
- **Outbound:**
  - → `.buildRewardSummary()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `loyalty-tiers.utils.spec.ts` [_`imports`_ | c1]
  - ↔ `loyalty.service.ts` [_`imports`_ | c1]
  - ↔ `orders.service.ts` [_`imports`_ | c34]

### CreateOrderDto

- **ID:** `dto_create_order_dto_createorderdto`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/backend/src/orders/dto/create-order.dto.ts` @ L44
- **Cross-community:**
  - ↔ `orders.controller.ts` [_`imports`_ | c34]
  - ↔ `orders.service.ts` [_`imports`_ | c34]
  - ↔ `create-order.dto.spec.ts` [_`imports`_ | c34]
  - ↔ `create-order.dto.ts` [_`contains`_ | c34]

### addEarnedPointBatch()

- **ID:** `loyalty_loyalty_ledger_utils_addearnedpointbatch`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/backend/src/loyalty/loyalty-ledger.utils.ts` @ L125
- **Cross-community:**
  - ↔ `loyalty-ledger.utils.spec.ts` [_`imports`_ | c1]
  - ↔ `loyalty.service.ts` [_`imports`_ | c1]
  - ↔ `orders.service.ts` [_`imports`_ | c34]

### expireAccountPoints()

- **ID:** `loyalty_loyalty_ledger_utils_expireaccountpoints`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/backend/src/loyalty/loyalty-ledger.utils.ts` @ L32
- **Cross-community:**
  - ↔ `loyalty-ledger.utils.spec.ts` [_`imports`_ | c1]
  - ↔ `loyalty.service.ts` [_`imports`_ | c1]
  - ↔ `orders.service.ts` [_`imports`_ | c34]

### getRewardValue()

- **ID:** `loyalty_loyalty_ledger_utils_getrewardvalue`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/backend/src/loyalty/loyalty-ledger.utils.ts` @ L15
- **Outbound:**
  - → `.buildRewardSummary()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `loyalty-ledger.utils.spec.ts` [_`imports`_ | c1]
  - ↔ `loyalty.service.ts` [_`imports`_ | c1]

### UpdateOrderDto

- **ID:** `dto_update_order_dto_updateorderdto`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/backend/src/orders/dto/update-order.dto.ts` @ L4
- **Cross-community:**
  - ↔ `orders.controller.ts` [_`imports`_ | c34]
  - ↔ `orders.service.ts` [_`imports`_ | c34]
  - ↔ `update-order.dto.ts` [_`contains`_ | c34]

### getExpiringPointBatches()

- **ID:** `loyalty_loyalty_ledger_utils_getexpiringpointbatches`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/backend/src/loyalty/loyalty-ledger.utils.ts` @ L155
- **Cross-community:**
  - ↔ `loyalty.service.ts` [_`imports`_ | c1]

### getFirstRewardProgress()

- **ID:** `loyalty_loyalty_ledger_utils_getfirstrewardprogress`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/backend/src/loyalty/loyalty-ledger.utils.ts` @ L20
- **Outbound:**
  - → `.buildRewardSummary()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `loyalty.service.ts` [_`imports`_ | c1]

### redeemAccountPoints()

- **ID:** `loyalty_loyalty_ledger_utils_redeemaccountpoints`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/backend/src/loyalty/loyalty-ledger.utils.ts` @ L82
- **Cross-community:**
  - ↔ `loyalty-ledger.utils.spec.ts` [_`imports`_ | c1]
  - ↔ `orders.service.ts` [_`imports`_ | c34]

### .getPoints()

- **ID:** `loyalty_loyalty_service_loyaltyservice_getpoints`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/backend/src/loyalty/loyalty.service.ts` @ L156

### markRemindersSent()

- **ID:** `loyalty_loyalty_ledger_utils_markreminderssent`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/loyalty/loyalty-ledger.utils.ts` @ L177
- **Cross-community:**
  - ↔ `loyalty.service.ts` [_`imports`_ | c1]

### LoyaltyModule

- **ID:** `loyalty_loyalty_module_loyaltymodule`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/loyalty/loyalty.module.ts` @ L11
- **Cross-community:**
  - ↔ `app.module.ts` [_`imports`_ | c15]
  - ↔ `loyalty.module.ts` [_`contains`_ | c15]

### .enroll()

- **ID:** `loyalty_loyalty_service_loyaltyservice_enroll`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/loyalty/loyalty.service.ts` @ L106
- **Outbound:**
  - → `.getPoints()` [_`calls`_ | EXTRACTED | score: 1.0]

### TierConfig

- **ID:** `loyalty_loyalty_tiers_utils_tierconfig`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/loyalty/loyalty-tiers.utils.ts` @ L3
- **Cross-community:**
  - ↔ `loyalty-tiers.utils.spec.ts` [_`imports`_ | c1]

### TierInfo

- **ID:** `loyalty_loyalty_tiers_utils_tierinfo`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/loyalty/loyalty-tiers.utils.ts` @ L10
- **Cross-community:**
  - ↔ `loyalty.service.ts` [_`imports`_ | c1]

### .updateStatus()

- **ID:** `orders_orders_service_ordersservice_updatestatus`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/orders/orders.service.ts` @ L491
- **Cross-community:**
  - ↔ `.findOne()` [_`calls`_ | c56]

### OrderItemDto

- **ID:** `dto_create_order_dto_orderitemdto`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/orders/dto/create-order.dto.ts` @ L28
- **Cross-community:**
  - ↔ `create-order.dto.ts` [_`contains`_ | c34]

### OrderItemOptionDto

- **ID:** `dto_create_order_dto_orderitemoptiondto`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/orders/dto/create-order.dto.ts` @ L14
- **Cross-community:**
  - ↔ `create-order.dto.ts` [_`contains`_ | c34]

### .getExpiryReminders()

- **ID:** `loyalty_loyalty_controller_loyaltycontroller_getexpiryreminders`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/loyalty/loyalty.controller.ts` @ L37

### batches

- **ID:** `loyalty_loyalty_ledger_utils_spec_batches`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/loyalty/loyalty-ledger.utils.spec.ts` @ L84
- **Cross-community:**
  - ↔ `loyalty-ledger.utils.spec.ts` [_`contains`_ | c1]

### date

- **ID:** `loyalty_loyalty_ledger_utils_spec_date`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/loyalty/loyalty-ledger.utils.spec.ts` @ L12
- **Cross-community:**
  - ↔ `loyalty-ledger.utils.spec.ts` [_`contains`_ | c1]

### expiredEntries

- **ID:** `loyalty_loyalty_ledger_utils_spec_expiredentries`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/loyalty/loyalty-ledger.utils.spec.ts` @ L43
- **Cross-community:**
  - ↔ `loyalty-ledger.utils.spec.ts` [_`contains`_ | c1]

### expiresAt

- **ID:** `loyalty_loyalty_ledger_utils_spec_expiresat`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/loyalty/loyalty-ledger.utils.spec.ts` @ L175
- **Cross-community:**
  - ↔ `loyalty-ledger.utils.spec.ts` [_`contains`_ | c1]

### makeTx()

- **ID:** `loyalty_loyalty_ledger_utils_spec_maketx`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/loyalty/loyalty-ledger.utils.spec.ts` @ L30
- **Cross-community:**
  - ↔ `loyalty-ledger.utils.spec.ts` [_`contains`_ | c1]

### tx

- **ID:** `loyalty_loyalty_ledger_utils_spec_tx`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/loyalty/loyalty-ledger.utils.spec.ts` @ L42
- **Cross-community:**
  - ↔ `loyalty-ledger.utils.spec.ts` [_`contains`_ | c1]

### SPENDABLE_ENTRY_TYPES

- **ID:** `loyalty_loyalty_ledger_utils_spendable_entry_types`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/loyalty/loyalty-ledger.utils.ts` @ L5

### LOYALTY_CONFIG_FIELDS

- **ID:** `loyalty_loyalty_service_loyalty_config_fields`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/loyalty/loyalty.service.ts` @ L28
- **Cross-community:**
  - ↔ `loyalty.service.ts` [_`contains`_ | c1]

### .getExpiryReminderCandidates()

- **ID:** `loyalty_loyalty_service_loyaltyservice_getexpiryremindercandidates`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/loyalty/loyalty.service.ts` @ L360

### .getHistory()

- **ID:** `loyalty_loyalty_service_loyaltyservice_gethistory`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/loyalty/loyalty.service.ts` @ L253

### .getLoyaltyAccounts()

- **ID:** `loyalty_loyalty_service_loyaltyservice_getloyaltyaccounts`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/loyalty/loyalty.service.ts` @ L200

### .getPublicConfig()

- **ID:** `loyalty_loyalty_service_loyaltyservice_getpublicconfig`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/loyalty/loyalty.service.ts` @ L99

### .notifyExpiryReminders()

- **ID:** `loyalty_loyalty_service_loyaltyservice_notifyexpiryreminders`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/loyalty/loyalty.service.ts` @ L271

### .runDailyExpiryReminders()

- **ID:** `loyalty_loyalty_service_loyaltyservice_rundailyexpiryreminders`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/loyalty/loyalty.service.ts` @ L477

### TIER_FIELDS

- **ID:** `loyalty_loyalty_service_tier_fields`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/loyalty/loyalty.service.ts` @ L21
- **Cross-community:**
  - ↔ `loyalty.service.ts` [_`contains`_ | c1]

### config

- **ID:** `loyalty_loyalty_tiers_utils_spec_config`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/loyalty/loyalty-tiers.utils.spec.ts` @ L58
- **Cross-community:**
  - ↔ `loyalty-tiers.utils.spec.ts` [_`contains`_ | c1]

### defaultConfig

- **ID:** `loyalty_loyalty_tiers_utils_spec_defaultconfig`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/loyalty/loyalty-tiers.utils.spec.ts` @ L4
- **Cross-community:**
  - ↔ `loyalty-tiers.utils.spec.ts` [_`contains`_ | c1]

### info

- **ID:** `loyalty_loyalty_tiers_utils_spec_info`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/loyalty/loyalty-tiers.utils.spec.ts` @ L13
- **Cross-community:**
  - ↔ `loyalty-tiers.utils.spec.ts` [_`contains`_ | c1]

### TierName

- **ID:** `loyalty_loyalty_tiers_utils_tiername`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/loyalty/loyalty-tiers.utils.ts` @ L1

### LOYALTY_CONFIG

- **ID:** `orders_orders_service_loyalty_config`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/orders/orders.service.ts` @ L27
- **Cross-community:**
  - ↔ `orders.service.ts` [_`contains`_ | c34]

### .enableShutdownHooks()

- **ID:** `prisma_prisma_service_prismaservice_enableshutdownhooks`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/prisma/prisma.service.ts` @ L130
