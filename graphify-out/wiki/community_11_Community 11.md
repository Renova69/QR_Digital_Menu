# Community 11

**Community 11** — 18 nodes

## Nodes

### api.ts

- **ID:** `apps_frontend_src_lib_api_ts`
- **Type:** code
- **Degree:** 159
- **Source:** `apps/frontend/src/lib/api.ts` @ L1
- **Outbound:**
  - → `api` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `getCurrentUser()` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `createOrder()` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `triggerTranslation()` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `getTables()` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `deleteTable()` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `submitFeedback()` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `getGoogleReviewUrl()` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `fetchCsrfToken()` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `publicPaths` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `generateStripeConnectLink()` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `CustomerLoginModal.tsx` [_`imports_from`_ | c23]
  - ↔ `MenuCheckWidget.tsx` [_`imports_from`_ | c17]
  - ↔ `LandingFAQ.tsx` [_`imports_from`_ | c74]
  - ↔ `CookieConsentBanner.tsx` [_`imports_from`_ | c99]
  - ↔ `ManageOptionsModal.tsx` [_`imports_from`_ | c57]

### SettingsView()

- **ID:** `dashboard_settingsview_settingsview`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/frontend/src/pages/Dashboard/SettingsView.tsx` @ L17
- **Cross-community:**
  - ↔ `useRestaurantContext()` [_`calls`_ | c8]
  - ↔ `useTier()` [_`calls`_ | c8]
  - ↔ `useFeature()` [_`calls`_ | c8]
  - ↔ `SettingsView.tsx` [_`contains`_ | c8]

### createOrder()

- **ID:** `lib_api_createorder`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/frontend/src/lib/api.ts` @ L61
- **Cross-community:**
  - ↔ `PosCartDrawer.tsx` [_`imports`_ | c2]
  - ↔ `CheckoutPage.tsx` [_`imports`_ | c117]

### generateStripeConnectLink()

- **ID:** `lib_api_generatestripeconnectlink`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/frontend/src/lib/api.ts` @ L420
- **Cross-community:**
  - ↔ `PaymentSettingsTab.tsx` [_`imports`_ | c8]
  - ↔ `PaymentSetupStep.tsx` [_`imports`_ | c20]

### deleteTable()

- **ID:** `lib_api_deletetable`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/lib/api.ts` @ L113
- **Cross-community:**
  - ↔ `TableView.tsx` [_`imports`_ | c27]

### getGoogleReviewUrl()

- **ID:** `lib_api_getgooglereviewurl`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/lib/api.ts` @ L303
- **Cross-community:**
  - ↔ `FeedbackPage.tsx` [_`imports`_ | c23]

### getTables()

- **ID:** `lib_api_gettables`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/lib/api.ts` @ L103
- **Cross-community:**
  - ↔ `TableView.tsx` [_`imports`_ | c27]

### submitFeedback()

- **ID:** `lib_api_submitfeedback`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/lib/api.ts` @ L292
- **Cross-community:**
  - ↔ `FeedbackPage.tsx` [_`imports`_ | c23]

### triggerTranslation()

- **ID:** `lib_api_triggertranslation`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/lib/api.ts` @ L97
- **Cross-community:**
  - ↔ `GeneralSettingsTab.tsx` [_`imports`_ | c8]

### api

- **ID:** `lib_api_api`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/lib/api.ts` @ L19

### fetchCsrfToken()

- **ID:** `lib_api_fetchcsrftoken`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/lib/api.ts` @ L318

### getCurrentUser()

- **ID:** `lib_api_getcurrentuser`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/lib/api.ts` @ L56

### publicPaths

- **ID:** `lib_api_publicpaths`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/lib/api.ts` @ L356

### FeedbackPage()

- **ID:** `pages_feedbackpage_feedbackpage`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/pages/FeedbackPage.tsx` @ L11
- **Cross-community:**
  - ↔ `FeedbackPage.tsx` [_`contains`_ | c23]

### FeedbackStep

- **ID:** `pages_feedbackpage_feedbackstep`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/pages/FeedbackPage.tsx` @ L9
- **Cross-community:**
  - ↔ `FeedbackPage.tsx` [_`contains`_ | c23]
