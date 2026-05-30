# Community 14

**Community 14** — 15 nodes

## Nodes

### PaymentService
- **ID:** `payment_payment_service_paymentservice`
- **Type:** code
- **Degree:** 24
- **Source:** `apps/backend/src/payment/payment.service.ts` @ L16
- **Outbound:**
  - → `.handleWebhookEvent()` [_`method`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `payment.controller.ts` [_`imports`_ | c13]
  - ↔ `payment.module.ts` [_`imports`_ | c15]
  - ↔ `payment.service.spec.ts` [_`imports`_ | c11]
  - ↔ `payment.service.ts` [_`contains`_ | c13]
  - ↔ `.constructor()` [_`method`_ | c11]

### PaymentController
- **ID:** `payment_payment_controller_paymentcontroller`
- **Type:** code
- **Degree:** 18
- **Source:** `apps/backend/src/payment/payment.controller.ts` @ L25
- **Cross-community:**
  - ↔ `payment.controller.ts` [_`contains`_ | c13]
  - ↔ `.constructor()` [_`method`_ | c47]
  - ↔ `.getOrCreateSession()` [_`method`_ | c47]
  - ↔ `.forceOpenSession()` [_`method`_ | c47]
  - ↔ `.getSessionBill()` [_`method`_ | c47]

### PaymentHistoryQueryDto
- **ID:** `dto_payment_history_query_dto_paymenthistoryquerydto`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/backend/src/payment/dto/payment-history-query.dto.ts` @ L4
- **Cross-community:**
  - ↔ `payment.controller.ts` [_`imports`_ | c13]
  - ↔ `payment-history-query.dto.spec.ts` [_`imports`_ | c18]
  - ↔ `payment-history-query.dto.ts` [_`contains`_ | c18]

### closeSession()
- **ID:** `lib_api_closesession`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/frontend/src/lib/api.ts` @ L399
- **Cross-community:**
  - ↔ `PosCartDrawer.tsx` [_`imports`_ | c2]
  - ↔ `TableView.tsx` [_`imports`_ | c27]
  - ↔ `api.ts` [_`contains`_ | c3]

### closeSessionWithCard()
- **ID:** `lib_api_closesessionwithcard`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/lib/api.ts` @ L404
- **Cross-community:**
  - ↔ `PosCartDrawer.tsx` [_`imports`_ | c2]
  - ↔ `api.ts` [_`contains`_ | c3]

### forceOpenSession()
- **ID:** `lib_api_forceopensession`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/lib/api.ts` @ L373
- **Cross-community:**
  - ↔ `PosTableModal.tsx` [_`imports`_ | c3]
  - ↔ `api.ts` [_`contains`_ | c3]

### getOrCreateSession()
- **ID:** `lib_api_getorcreatesession`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/lib/api.ts` @ L368
- **Cross-community:**
  - ↔ `PosTableModal.tsx` [_`imports`_ | c3]
  - ↔ `api.ts` [_`contains`_ | c3]

### getPaymentHistory()
- **ID:** `lib_api_getpaymenthistory`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/lib/api.ts` @ L224
- **Cross-community:**
  - ↔ `api.ts` [_`contains`_ | c3]
  - ↔ `PaymentsView.tsx` [_`imports`_ | c0]

### getTableSessions()
- **ID:** `lib_api_gettablesessions`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/lib/api.ts` @ L414
- **Cross-community:**
  - ↔ `TableView.tsx` [_`imports`_ | c27]
  - ↔ `api.ts` [_`contains`_ | c3]

### dto
- **ID:** `dto_payment_history_query_dto_spec_dto`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/payment/dto/payment-history-query.dto.spec.ts` @ L8
- **Cross-community:**
  - ↔ `payment-history-query.dto.spec.ts` [_`contains`_ | c18]

### .handleWebhookEvent()
- **ID:** `payment_payment_service_paymentservice_handlewebhookevent`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/payment/payment.service.ts` @ L239

### created
- **ID:** `payment_payment_service_spec_created`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/payment/payment.service.spec.ts` @ L89
- **Cross-community:**
  - ↔ `payment.service.spec.ts` [_`contains`_ | c11]

### existing
- **ID:** `payment_payment_service_spec_existing`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/payment/payment.service.spec.ts` @ L78
- **Cross-community:**
  - ↔ `payment.service.spec.ts` [_`contains`_ | c11]

### session
- **ID:** `payment_payment_service_spec_session`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/payment/payment.service.spec.ts` @ L114
- **Cross-community:**
  - ↔ `payment.service.spec.ts` [_`contains`_ | c11]

### sessions
- **ID:** `payment_payment_service_spec_sessions`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/payment/payment.service.spec.ts` @ L329
- **Cross-community:**
  - ↔ `payment.service.spec.ts` [_`contains`_ | c11]
