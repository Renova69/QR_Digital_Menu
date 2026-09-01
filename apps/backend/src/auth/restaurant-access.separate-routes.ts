/** Reviewed routes whose authorization is not restaurant-management membership.
 * Public, account, super-admin and credential-scoped contracts stay separate.
 * This is not a rollout backlog: all management routes declare their policy.
 * No wildcard exemptions or snapshot auto-update; new routes must be classified.
 * See ops/security/RESTAURANT_ACCESS.md.
 */
export const SEPARATE_AUTHORIZATION_ROUTES = [
  {
    file: 'app.controller.ts',
    controller: 'AppController',
    routes: ['getRoot', 'getApiInfo'],
    reason: 'Public service information; no tenant identity.',
  },
  {
    file: 'assistance/assistance.controller.ts',
    controller: 'AssistanceController',
    routes: ['create'],
    reason:
      'Public call-waiter creation retains QR-token validation, deduplication and throttling; all management routes are migrated.',
  },
  {
    file: 'auth/auth.controller.ts',
    controller: 'AuthController',
    routes: [
      'register',
      'verifyRegistration',
      'login',
      'getProfile',
      'updateProfile',
      'changePassword',
      'updateOnboardingStep',
      'googleAuth',
      'googleAuthRedirect',
      'sendOtp',
      'verifyOtp',
      'addIdentity',
      'verifyIdentity',
      'logout',
      'listSessions',
      'signOutEverywhere',
      'revokeSession',
      'getCsrfToken',
      'exchangeImpersonation',
      'exitImpersonation',
      'pinLogin',
    ],
    reason:
      'Account/session authentication and self-service; separate auth/session controls.',
  },
  {
    file: 'client-logs/client-logs.controller.ts',
    controller: 'ClientLogsController',
    routes: ['collect', 'collectCsp'],
    reason: 'Public diagnostic ingestion; separate validation/throttling.',
  },
  {
    file: 'consent/consent.controller.ts',
    controller: 'ConsentController',
    routes: ['recordConsent'],
    reason: 'Public consent recording; separate consent validation.',
  },
  {
    file: 'feedback/feedback.controller.ts',
    controller: 'FeedbackController',
    routes: [
      'create',
      'issueVisitInvitation',
      'createVisitFeedback',
      'markVisitFeedbackPresented',
      'markGoogleReviewClick',
      'getGoogleReviewUrl',
    ],
    reason:
      'Public review links and session/invitation-token authorization; management reads are migrated.',
  },
  {
    file: 'health/health.controller.ts',
    controller: 'HealthController',
    routes: ['check', 'ready'],
    reason: 'Public health/readiness probes, not tenant operations.',
  },
  {
    file: 'help-content/help-content.controller.ts',
    controller: 'HelpContentController',
    routes: ['getPublic', 'getAll', 'create', 'reorder', 'update', 'delete'],
    reason:
      'Public help plus super-admin writes; pinned by super-admin.guard-coverage.spec.ts.',
  },
  {
    file: 'loyalty/loyalty.controller.ts',
    controller: 'LoyaltyController',
    routes: [
      'getLoyaltyAccounts',
      'getHistory',
      'getPublicConfig',
      'enroll',
      'getPoints',
    ],
    reason:
      'Customer account-scoped loyalty membership/history/points plus public config; owner management routes are migrated.',
  },
  {
    file: 'menu/public-menu.controller.ts',
    controller: 'PublicMenuController',
    routes: [
      'getAllMenuData',
      'resolveSlug',
      'getPublicMenu',
      'getPublicMenuMeta',
      'getCategoryItems',
      'getPublicMenuItems',
      'getTrendingItems',
    ],
    reason:
      'Public menu/slug reads and the JWT-only menu-index hint; no restaurant-management membership is required.',
  },
  {
    file: 'menu-import/menu-import.controller.ts',
    controller: 'MenuImportController',
    routes: ['importFromOcr'],
    reason:
      'OCR import uses ApiKeyGuard with a hashed per-restaurant Bearer key; dashboard JWT routes are migrated.',
  },
  {
    file: 'menu-views/menu-view.controller.ts',
    controller: 'MenuViewController',
    routes: ['recordView'],
    reason:
      'Public view recording; getScanStats is migrated and must not be exempted.',
  },
  {
    file: 'notifications/email-receipt.controller.ts',
    controller: 'EmailReceiptController',
    routes: ['resend'],
    reason:
      'Public Resend callback authenticates the exact raw body with a timestamped provider signature and carries no dashboard session authority.',
  },
  {
    file: 'notifications/sms-receipt.controller.ts',
    controller: 'SmsReceiptController',
    routes: ['twilio', 'smsGateway'],
    reason:
      'Public provider callbacks authenticate with Twilio or SMS Gateway signatures and carry no dashboard session authority.',
  },
  {
    file: 'orders/orders.controller.ts',
    controller: 'OrdersController',
    routes: ['create'],
    reason:
      'Public order creation retains OptionalJwtAuthGuard, QR/session validation, idempotency and POS attribution; management routes are migrated.',
  },
  {
    file: 'payment/payment.controller.ts',
    controller: 'PaymentController',
    routes: [
      'getOrCreateSession',
      'getSessionBill',
      'createPaymentIntent',
      'createCheckout',
      'createCashPaymentRequest',
      'abandonCheckout',
      'handleWebhook',
      'handleEpayNotify',
      'handleMyposNotify',
      'handleBoricaCallback',
    ],
    reason:
      'Public QR session creation, table-session credential operations and provider-signature webhooks; all JWT payment management is declaratively guarded.',
  },
  {
    file: 'platform-settings/platform-settings.controller.ts',
    controller: 'PlatformSettingsController',
    routes: ['getPublic', 'getAdmin', 'updateAdmin'],
    reason:
      'Public settings plus super-admin writes; pinned by super-admin.guard-coverage.spec.ts.',
  },
  {
    file: 'push/push.controller.ts',
    controller: 'PushController',
    routes: ['subscribe'],
    reason:
      "Authenticated user's push subscription, not restaurant authorization.",
  },
  {
    file: 'reservations/public-reservations.controller.ts',
    controller: 'PublicReservationsController',
    routes: [
      'config',
      'availability',
      'create',
      'status',
      'manageGet',
      'manageCancel',
      'manageModify',
    ],
    reason:
      'Public restaurant booking and manage-token routes; separate token/booking controls.',
  },
  {
    file: 'reservations/reservation-redirect.controller.ts',
    controller: 'ReservationRedirectController',
    routes: ['redirect'],
    reason: 'Public permanent booking redirect.',
  },
  {
    file: 'restaurants/device-enrollment.controller.ts',
    controller: 'DeviceEnrollmentController',
    routes: ['verify', 'status'],
    reason:
      'Enrollment/status token verification rather than dashboard JWT access.',
  },
  {
    file: 'restaurants/restaurants.controller.ts',
    controller: 'RestaurantsController',
    routes: ['create', 'findAll'],
    reason:
      'JWT account-scoped restaurant creation and listing; there is no caller-selected existing restaurant.',
  },
  {
    file: 'restaurants/slug/slug.controller.ts',
    controller: 'SlugController',
    routes: ['available'],
    reason:
      'JWT-only advisory slug availability over an already-public namespace; no tenant membership required.',
  },
  {
    file: 'restaurants/slug/slug.controller.ts',
    controller: 'OnboardingSlugController',
    routes: ['available'],
    reason:
      'Authenticated onboarding slug availability; no existing tenant required.',
  },
  {
    file: 'subscription/subscription.controller.ts',
    controller: 'SubscriptionController',
    routes: ['confirmSession', 'webhook'],
    reason:
      'Checkout confirmation binds the Stripe session to the authenticated account; webhook verifies the provider signature. Restaurant billing management is guarded.',
  },
  {
    file: 'super-admin/super-admin.controller.ts',
    controller: 'SuperAdminController',
    routes: [
      'getStats',
      'getTenants',
      'getTenant',
      'updateTier',
      'updateStatus',
      'resetOwnerPassword',
      'updatePaymentsEnabled',
      'deleteRestaurant',
      'restoreRestaurant',
      'reassignSlug',
      'deleteStaff',
      'importMenu',
      'getAuditLog',
      'forceLogout',
      'regenerateApiKey',
      'getTenantSessions',
      'forceCloseSession',
      'getLoyaltyAccounts',
      'adjustLoyaltyPoints',
      'clearLoyaltyPoints',
      'getMrr',
      'getDataRequests',
      'updateDataRequest',
      'impersonate',
    ],
    reason:
      'Separate JwtAuthGuard + SuperAdminGuard; pinned by super-admin.guard-coverage.spec.ts.',
  },
  {
    file: 'tables/tables.controller.ts',
    controller: 'TablesController',
    routes: ['resolvePublicServicePoint'],
    reason:
      'Anonymous service-point QR lookup; random publicToken, active/plan checks and throttling remain in place.',
  },
  {
    file: 'users-data/users-data.controller.ts',
    controller: 'UsersDataController',
    routes: ['exportData', 'deleteAccount'],
    reason:
      'Account-scoped privacy operations, not a caller-selected restaurant.',
  },
] as const;
