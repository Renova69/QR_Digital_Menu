# Community 9

**Community 9** — 21 nodes

## Nodes

### TranslationService

- **ID:** `translation_translation_service_translationservice`
- **Type:** code
- **Degree:** 14
- **Source:** `apps/backend/src/translation/translation.service.ts` @ L6
- **Outbound:**
  - → `.apiKey()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.baseUrl()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.sleep()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.translateText()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.translateObject()` [_`method`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `menu-crud.service.spec.ts` [_`imports`_ | c72]
  - ↔ `menu-crud.service.ts` [_`imports`_ | c73]
  - ↔ `menu-translation.service.spec.ts` [_`imports`_ | c33]
  - ↔ `menu-translation.service.ts` [_`imports`_ | c6]
  - ↔ `restaurants.service.ts` [_`imports`_ | c62]

### StripeProvider

- **ID:** `payment_stripe_provider_stripeprovider`
- **Type:** code
- **Degree:** 13
- **Source:** `apps/backend/src/payment/stripe.provider.ts` @ L6
- **Outbound:**
  - → `.constructWebhookEvent()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.createExpressAccount()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.createAccountLink()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.retrieveAccount()` [_`method`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `payment.module.ts` [_`imports`_ | c15]
  - ↔ `payment.service.ts` [_`imports`_ | c13]
  - ↔ `stripe.provider.ts` [_`contains`_ | c43]
  - ↔ `.constructor()` [_`method`_ | c43]
  - ↔ `.onModuleInit()` [_`method`_ | c43]

### stripe.provider.spec.ts

- **ID:** `apps_backend_src_payment_stripe_provider_spec_ts`
- **Type:** code
- **Degree:** 7
- **Source:** `apps/backend/src/payment/stripe.provider.spec.ts` @ L1
- **Outbound:**
  - → `StripeProvider` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `payload` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `stripe.provider.ts` [_`imports_from`_ | c43]
  - ↔ `result` [_`contains`_ | c43]
  - ↔ `p` [_`contains`_ | c43]
  - ↔ `warnSpy` [_`contains`_ | c43]
  - ↔ `devProvider` [_`contains`_ | c43]

### AppController

- **ID:** `src_app_controller_appcontroller`
- **Type:** code
- **Degree:** 6
- **Source:** `apps/backend/src/app.controller.ts` @ L6
- **Outbound:**
  - → `.getRoot()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.getApiInfo()` [_`method`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `app.controller.ts` [_`contains`_ | c123]
  - ↔ `.constructor()` [_`method`_ | c123]
  - ↔ `app.module.ts` [_`imports`_ | c15]

### .sleep()

- **ID:** `translation_translation_service_translationservice_sleep`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/backend/src/translation/translation.service.ts` @ L27
- **Outbound:**
  - → `.translateObject()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `.withRetry()` [_`calls`_ | c6]

### app.controller.spec.ts

- **ID:** `apps_backend_src_app_controller_spec_ts`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/backend/src/app.controller.spec.ts` @ L1
- **Outbound:**
  - → `AppController` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `result` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `app.controller.ts` [_`imports_from`_ | c123]

### .onModuleInit()

- **ID:** `prisma_prisma_service_prismaservice_onmoduleinit`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/backend/src/prisma/prisma.service.ts` @ L48
- **Outbound:**
  - → `.sleep()` [_`calls`_ | INFERRED | score: 0.8]
- **Cross-community:**
  - ↔ `jitteredDelay()` [_`calls`_ | c6]
  - ↔ `PrismaService` [_`method`_ | c6]

### .translateObject()

- **ID:** `translation_translation_service_translationservice_translateobject`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/backend/src/translation/translation.service.ts` @ L72
- **Cross-community:**
  - ↔ `.translateTexts()` [_`calls`_ | c33]

### payment-provider.interface.ts

- **ID:** `apps_backend_src_payment_payment_provider_interface_ts`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/payment/payment-provider.interface.ts` @ L1
- **Outbound:**
  - → `IPaymentProvider` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `stripe.provider.ts` [_`imports_from`_ | c43]

### IPaymentProvider

- **ID:** `payment_payment_provider_interface_ipaymentprovider`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/payment/payment-provider.interface.ts` @ L3
- **Cross-community:**
  - ↔ `stripe.provider.ts` [_`imports`_ | c43]

### .translateText()

- **ID:** `translation_translation_service_translationservice_translatetext`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/translation/translation.service.ts` @ L67
- **Cross-community:**
  - ↔ `.translateTexts()` [_`calls`_ | c33]

### payload

- **ID:** `payment_stripe_provider_spec_payload`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/payment/stripe.provider.spec.ts` @ L58

### .constructWebhookEvent()

- **ID:** `payment_stripe_provider_stripeprovider_constructwebhookevent`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/payment/stripe.provider.ts` @ L48

### .createAccountLink()

- **ID:** `payment_stripe_provider_stripeprovider_createaccountlink`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/payment/stripe.provider.ts` @ L65

### .createExpressAccount()

- **ID:** `payment_stripe_provider_stripeprovider_createexpressaccount`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/payment/stripe.provider.ts` @ L60

### .retrieveAccount()

- **ID:** `payment_stripe_provider_stripeprovider_retrieveaccount`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/payment/stripe.provider.ts` @ L79

### .getApiInfo()

- **ID:** `src_app_controller_appcontroller_getapiinfo`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/app.controller.ts` @ L37

### .getRoot()

- **ID:** `src_app_controller_appcontroller_getroot`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/app.controller.ts` @ L12

### result

- **ID:** `src_app_controller_spec_result`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/app.controller.spec.ts` @ L17

### .apiKey()

- **ID:** `translation_translation_service_translationservice_apikey`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/translation/translation.service.ts` @ L17

### .baseUrl()

- **ID:** `translation_translation_service_translationservice_baseurl`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/translation/translation.service.ts` @ L21
