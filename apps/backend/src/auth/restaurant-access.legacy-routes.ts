/** Frozen, explicit rollout inventory, NOT a claim that JWT alone proves tenancy.
 * Remove entries as routes adopt RequireRestaurantAccess. A new method/controller
 * fails CI unless it is guarded or its different authorization is reviewed here.
 * No wildcard exemptions, no snapshot auto-update. See ops/security/RESTAURANT_ACCESS.md.
 */
export const LEGACY_RESTAURANT_ACCESS_ROUTES = [
  {
    file: 'app.controller.ts',
    controller: 'AppController',
    routes: ['getRoot', 'getApiInfo'],
    reason: 'Public service information; no tenant identity.',
  },
  {
    file: 'assistance/assistance.controller.ts',
    controller: 'AssistanceController',
    routes: ['create', 'findAll', 'findOne', 'update', 'remove'],
    reason:
      'P3-3 follow-up: existing controller/service/resource or token authorization remains unchanged; not yet declaratively migrated.',
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
      'findAll',
      'getSummary',
      'getVisit',
    ],
    reason:
      'P3-3 follow-up: existing controller/service/resource or token authorization remains unchanged; not yet declaratively migrated.',
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
      'getAnalytics',
      'getExpiryReminders',
      'notifyExpiryReminders',
      'getPublicConfig',
      'enroll',
      'getPoints',
    ],
    reason:
      'P3-3 follow-up: existing controller/service/resource or token authorization remains unchanged; not yet declaratively migrated.',
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
      'P3-3 follow-up: existing controller/service/resource or token authorization remains unchanged; not yet declaratively migrated.',
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
    file: 'notifications/notification-delivery.controller.ts',
    controller: 'NotificationDeliveryController',
    routes: ['list', 'retry'],
    reason:
      'P3-3 follow-up: existing controller/service/resource or token authorization remains unchanged; not yet declaratively migrated.',
  },
  {
    file: 'orders/orders.controller.ts',
    controller: 'OrdersController',
    routes: ['create', 'findAll', 'findOne', 'bulkUpdate', 'update'],
    reason:
      'P3-3 follow-up: existing controller/service/resource or token authorization remains unchanged; not yet declaratively migrated.',
  },
  {
    file: 'payment/payment.controller.ts',
    controller: 'PaymentController',
    routes: [
      'getOrCreateSession',
      'forceOpenSession',
      'getSessionBill',
      'createPaymentIntent',
      'createCheckout',
      'createCashPaymentRequest',
      'abandonCheckout',
      'closeSession',
      'closeSessionWithCard',
      'closeSessionWithCash',
      'reconcileStuckSession',
      'settlePartial',
      'getTableSessions',
      'getPaymentsOverview',
      'getPayoutsSnapshot',
      'getPaymentSettings',
      'getPaymentHistory',
      'getPaymentNotificationFeed',
      'markPaymentNotificationsRead',
      'getPaymentReconciliationIssues',
      'resolvePaymentReconciliationIssue',
      'reopenSessionForRecollection',
      'getCashPaymentRequests',
      'confirmCashPaymentRequest',
      'cancelCashPaymentRequest',
      'exportPayments',
      'getPaymentDetail',
      'refundPayment',
      'handleWebhook',
      'handleEpayNotify',
      'handleMyposNotify',
      'handleBoricaCallback',
    ],
    reason:
      'P3-3 follow-up: existing controller/service/resource or token authorization remains unchanged; not yet declaratively migrated.',
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
    file: 'reservations/reservations.controller.ts',
    controller: 'ReservationsController',
    routes: [
      'getSettings',
      'updateSettings',
      'setServiceHours',
      'deleteServiceHours',
      'analytics',
      'listBlackouts',
      'addBlackout',
      'removeBlackout',
      'list',
      'createManual',
      'action',
      'updateInternal',
    ],
    reason:
      'P3-3 follow-up: existing controller/service/resource or token authorization remains unchanged; not yet declaratively migrated.',
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
    routes: [
      'getStatus',
      'createCheckout',
      'confirmSession',
      'createPortal',
      'webhook',
    ],
    reason:
      'P3-3 follow-up: existing controller/service/resource or token authorization remains unchanged; not yet declaratively migrated.',
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
    file: 'table-zones/table-zones.controller.ts',
    controller: 'TableZonesController',
    routes: ['findAll', 'create', 'update', 'remove', 'reorder'],
    reason:
      'P3-3 follow-up: existing controller/service/resource or token authorization remains unchanged; not yet declaratively migrated.',
  },
  {
    file: 'tables/tables.controller.ts',
    controller: 'TablesController',
    routes: [
      'create',
      'bulkCreate',
      'findAll',
      'createServicePoint',
      'findServicePoints',
      'resolvePublicServicePoint',
      'getTablesWithStatus',
      'getTableOrders',
      'update',
      'rotatePublicToken',
      'remove',
    ],
    reason:
      'P3-3 follow-up: existing controller/service/resource or token authorization remains unchanged; not yet declaratively migrated.',
  },
  {
    file: 'users-data/users-data.controller.ts',
    controller: 'UsersDataController',
    routes: ['exportData', 'deleteAccount'],
    reason:
      'Account-scoped privacy operations, not a caller-selected restaurant.',
  },
] as const;
