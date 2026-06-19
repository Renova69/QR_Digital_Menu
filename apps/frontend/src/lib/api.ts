import axios from 'axios';
import { logApiError } from './clientLogger';

// Auth transport is the httpOnly `token` cookie ONLY (#F1). Every token-issuing
// endpoint (login/register/otp/google/pin-login) sets it server-side, and it is
// sent cross-origin via SameSite=None. The backend rejects Bearer auth in
// production, so the old in-memory Bearer fallback was dead weight + an XSS
// surface — removed.

// Use relative /api/v1 for all environments.
// - Local Dev: Vite proxy catches it and forwards to backend.
// - Vercel Prod: vercel.json rewrite catches it and forwards to Cloud Run.
// This ensures requests are always same-origin, bypassing Safari/Edge CSRF blocks.
const API_URL = '/api/v1';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

export const getMenu = async (restaurantId: string) => {
  const response = await api.get(`/menu/public/${restaurantId}`);
  return response.data;
};

export const getMenuMeta = async (restaurantId: string) => {
  const response = await api.get(`/menu/public/${restaurantId}/meta`);
  return response.data as { restaurant: any; categories: any[] };
};

export const getCategoryItems = async (restaurantId: string, categoryId: string, lang?: string) => {
  const response = await api.get(`/menu/public/${restaurantId}/categories/${categoryId}/items`, {
    params: lang ? { lang } : undefined,
  });
  return response.data as any[];
};

export const getTrendingItems = async (restaurantId: string) => {
  const response = await api.get(`/menu/public/${restaurantId}/trending`);
  return response.data;
};

export const login = async (email: string, password: string) => {
  const response = await api.post('/auth/login', { email, password });
  return response.data;
}

export const register = async (email: string, password: string, name?: string) => {
    const response = await api.post('/auth/register', { email, password, name });
    return response.data;
}

export const verifyRegistration = async (email: string, password: string, code: string) => {
    const response = await api.post('/auth/register/verify', { email, password, code });
    return response.data;
}

export const getCurrentUser = async () => {
    const response = await api.get('/auth/me');
    return response.data;
}

export const createOrder = async (orderData: any) => {
    const response = await api.post('/orders', orderData);
    return response.data;
}

export const getOrders = async (params?: { startDate?: string; endDate?: string; page?: number; limit?: number }) => {
    const response = await api.get('/orders', { params });
    return response.data?.data ?? response.data;
}

export const updateOrderStatus = async (orderId: string, status: string) => {
    const response = await api.patch(`/orders/${orderId}/status`, { status });
    return response.data;
}

export const getAssistanceRequests = async () => {
    const response = await api.get('/assistance-requests');
    return response.data?.data ?? response.data;
}

export const updateAssistanceRequest = async (requestId: string, updates: { isResolved?: boolean }) => {
    const response = await api.patch(`/assistance-requests/${requestId}`, updates);
    return response.data;
}

export const createAssistanceRequest = async (tableId: string, restaurantId: string, type: 'STANDARD' | 'URGENT' = 'STANDARD') => {
    const response = await api.post('/assistance-requests', { tableId, restaurantId, type });
    return response.data;
}

// Restaurants / Settings
export const updateRestaurant = async (restaurantId: string, data: any) => {
  const response = await api.patch(`/restaurants/${restaurantId}`, data);
  return response.data;
};

export const getLogoBase64 = async (restaurantId: string): Promise<{ dataUrl: string } | null> => {
  const response = await api.get(`/restaurants/${restaurantId}/logo-base64`);
  return response.data;
};

export const triggerTranslation = async (restaurantId: string) => {
  const response = await api.post(`/restaurants/${restaurantId}/translate-all`);
  return response.data;
};

// Tables
export const getTables = async (restaurantId: string) => {
  const response = await api.get(`/restaurants/${restaurantId}/tables`);
  return response.data;
};

export const createTable = async (restaurantId: string, name: string, zoneId?: string) => {
  const response = await api.post(`/restaurants/${restaurantId}/tables`, { name, zoneId });
  return response.data;
};

export const deleteTable = async (tableId: string) => {
  const response = await api.delete(`/tables/${tableId}`);
  return response.data;
};

export const getTableOrders = async (tableId: string, restaurantId: string) => {
  const response = await api.get(`/tables/${tableId}/orders`, {
    params: { restaurantId },
  });
  return response.data as Array<{
    id: string;
    customerName: string;
    totalPrice: number;
    status: string;
    specialRequests: string | null;
    createdAt: string;
    source?: 'CUSTOMER' | 'POS';
    staffName?: string | null;
    staffRole?: string | null;
    items: Array<{ name: string; quantity: number; totalPrice?: number; options?: string[] }>;
  }>;
};

export const getTableStatuses = async (restaurantId: string, zoneId?: string) => {
  const response = await api.get(`/tables/status/${restaurantId}`, {
    params: zoneId ? { zoneId } : undefined,
  });
  return response.data as Array<{
    id: string;
    name: string;
    status: 'empty' | 'occupied' | 'paid';
    sessionId: string | null;
    sessionToken: string | null;
    orderCount: number;
    totalAmount: number;
    customerNames: string[];
    sessionStatus: string | null;
    updatedAt: string;
    zone?: { id: string; name: string };
  }>;
};

export const updateTable = async (tableId: string, data: { name?: string; zoneId?: string | null }) => {
  const response = await api.patch(`/tables/${tableId}`, data);
  return response.data;
};

// ── Table Zones ─────────────────────────────────────────────────────────────────

export interface TableZone {
  id: string;
  name: string;
  restaurantId: string;
  displayOrder: number;
  _count?: { tables: number };
}

export const getZones = async (restaurantId: string) => {
  const response = await api.get(`/restaurants/${restaurantId}/zones`);
  return response.data as TableZone[];
};

export const createZone = async (restaurantId: string, name: string, displayOrder?: number) => {
  const response = await api.post(`/restaurants/${restaurantId}/zones`, { name, displayOrder });
  return response.data as TableZone;
};

export const updateZone = async (zoneId: string, data: { name?: string; displayOrder?: number }) => {
  const response = await api.patch(`/zones/${zoneId}`, data);
  return response.data as TableZone;
};

export const deleteZone = async (zoneId: string) => {
  const response = await api.delete(`/zones/${zoneId}`);
  return response.data;
};

export const reorderZones = async (restaurantId: string, items: { id: string; displayOrder: number }[]) => {
  const response = await api.patch(`/restaurants/${restaurantId}/zones/reorder`, { items });
  return response.data;
};

// Analytics
export const getAnalytics = async (restaurantId: string, period: number, startDate?: string, endDate?: string) => {
  const response = await api.get('/dashboard/analytics', {
    params: {
      restaurantId,
      ...(startDate && endDate ? { startDate, endDate } : { period }),
    },
  });
  return response.data;
};

export const getPaymentSummary = async (restaurantId: string, startDate?: string, endDate?: string) => {
  const response = await api.get('/dashboard/payments-summary', {
    params: { restaurantId, ...(startDate && { startDate }), ...(endDate && { endDate }) },
  });
  return response.data as {
    totalCollected: number;
    refundAmount: number;
    byMethod: { method: string; amount: number }[];
  };
};

export const getLoyaltyAnalytics = async (restaurantId: string) => {
  const response = await api.get(`/loyalty/${restaurantId}/analytics`);
  return response.data as {
    totalMembers: number;
    totalPointsOutstanding: number;
    totalPointsRedeemed: number;
    repeatRate: number;
    topMember: { name: string; points: number } | null;
  };
};

export const getPaymentHistory = (
  restaurantId: string,
  params?: { status?: string; startDate?: string; endDate?: string; page?: number; limit?: number },
) =>
  api
    .get(`/payments/history/${restaurantId}`, { params })
    .then((res) => res.data);

export const getPaymentsExport = (
  restaurantId: string,
  params?: { from?: string; to?: string },
) =>
  api
    .get(`/payments/export/${restaurantId}`, { params })
    .then((res) => res.data as any[]);

export const getPaymentOverview = (
  restaurantId: string,
  params?: { startDate?: string; endDate?: string },
) =>
  api
    .get(`/payments/overview/${restaurantId}`, { params })
    .then((res) => res.data as {
      account: {
        paymentsEnabled: boolean;
        stripeOnboarded: boolean;
        stripeAccountId: string | null;
        epayEnabled: boolean;
        epayMode: 'DEMO' | 'LIVE';
        epayClientId: string | null;
        epayMerchantEmail: string | null;
        epayPage: 'credit_paydirect' | 'paylogin';
        epaySecretConfigured: boolean;
        platformFeePercent: number;
        tipsEnabled: boolean;
        tipOptions: number[];
      };
      metrics: {
        totalCollected: number;
        averageTransaction: number;
        tipsCollected: number;
        platformFees: number;
        refundsIssued: number;
        netCollected: number;
        successfulTransactions: number;
        refundsCount: number;
      };
      statusCounts: Array<{ status: string; count: number }>;
      methodTotals: Array<{ method: string; amount: number; fees: number; count: number }>;
      currency: string;
      latestPaymentAt: string | null;
    });

export const getPaymentDetail = (paymentId: string) =>
  api
    .get(`/payments/${paymentId}`)
    .then((res) => res.data);

export const getPaymentPayouts = (restaurantId: string) =>
  api
    .get(`/payments/payouts/${restaurantId}`)
    .then((res) => res.data as {
      estimatedBalance: number;
      platformFees: number;
      totalCollected: number;
      methodTotals: Array<{ method: string; amount: number; fees: number; count: number }>;
      stripeAccountId: string | null;
      stripeOnboarded: boolean;
      note: string;
    });

export const getPaymentSettings = (restaurantId: string) =>
  api
    .get(`/payments/settings/${restaurantId}`)
    .then((res) => res.data);

export const refundPayment = (paymentId: string, data?: { amount?: number; reason?: string }) =>
  api
    .post(`/payments/${paymentId}/refund`, data ?? {})
    .then((res) => res.data);

// Feedback
export const submitFeedback = async (data: {
  rating: number;
  comment?: string;
  orderId: string;
  restaurantId: string;
  redirectedToGoogle?: boolean;
}) => {
  const response = await api.post('/feedback', data);
  return response.data;
};

export const getGoogleReviewUrl = async (restaurantId: string) => {
  const response = await api.get(`/feedback/google-review-url/${restaurantId}`);
  return response.data;
};

export const getFeedbackSummary = async (restaurantId: string) => {
  const response = await api.get('/feedback/summary', {
    params: { restaurantId },
  });
  return response.data;
};

// Module-level CSRF token — fetched once from /auth/csrf-token endpoint.
// Cannot use document.cookie cross-origin (backend on different host than frontend in dev).
let csrfToken: string | null = null;
// Dedupe concurrent first-time fetches (#F2): N parallel state-changing requests at
// startup would each fire their own GET /auth/csrf-token. Share one in-flight promise.
let csrfFetchPromise: Promise<void> | null = null;
const fetchCsrfToken = async (): Promise<void> => {
  if (csrfToken) return;
  if (!csrfFetchPromise) {
    csrfFetchPromise = (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/csrf-token`, { credentials: 'include' });
        const data = await res.json();
        csrfToken = data?.csrfToken ?? null;
      } catch {
        csrfToken = null;
      } finally {
        csrfFetchPromise = null;
      }
    })();
  }
  return csrfFetchPromise;
};

api.interceptors.request.use(async (config) => {
  // Auth rides the httpOnly cookie (sent automatically via withCredentials).
  // CSRF token — attach to state-changing requests
  if (config.method && ['post', 'patch', 'delete', 'put'].includes(config.method)) {
    if (!csrfToken) await fetchCsrfToken();
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
  }
  return config;
});

// Response interceptor — handle 401 Unauthorized (cookie expired)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    logApiError(error);

    if (error.response?.status === 401) {
      // Never redirect for /auth/me — AuthContext handles auth check failures itself
      const requestUrl = error.config?.url || '';
      if (
        requestUrl.endsWith('/auth/me') ||
        requestUrl.endsWith('/auth/pin-login')
      ) {
        return Promise.reject(error);
      }
      const publicPaths = ['/login', '/register', '/auth/callback', '/menu/public', '/device-enroll', '/device-login'];
      const currentPath = window.location.pathname;
      // POS payment-QR bill is viewed unauthenticated at /checkout?session=...
      // Only that variant bypasses the login redirect — authenticated customer
      // checkout still redirects on 401 (M2).
      const isPublicCheckout =
        currentPath.startsWith('/checkout') &&
        new URLSearchParams(window.location.search).has('session');
      if (!isPublicCheckout && !publicPaths.some(p => currentPath.startsWith(p))) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Payment / TableSession

export const getOrCreateSession = async (tableId: string, restaurantId: string, sessionToken?: string) => {
  const response = await api.post('/payments/session', { tableId, restaurantId, sessionToken });
  return response.data as { session: any; token: string };
};

export const forceOpenSession = async (tableId: string, restaurantId: string) => {
  const response = await api.post('/payments/session/force-open', { tableId, restaurantId });
  return response.data as { session: any; token: string };
};

export interface SessionBillItem {
  orderItemId: string;
  name: string;
  quantity: number;
  paidQuantity: number;
  unitPrice: number;
  unitPriceWithOptions: number;
  selectedOptions: any[];
}

export interface SessionBillOrder {
  id: string;
  source: 'CUSTOMER' | 'POS';
  customerName?: string | null;
  customerPhone?: string | null;
  staffName: string | null;
  staffRole: string | null;
  totalPrice: number;
  items: SessionBillItem[];
}

export interface SessionBill {
  orders: SessionBillOrder[];
  subtotal: number;
  paidSubtotal: number;
  remaining: number;
  splitItemsAvailable: boolean;
  restaurantId: string;
  tipsEnabled: boolean;
  tipOptions: number[];
  paymentProviders: Array<CheckoutProvider>;
}

export const getSessionBill = async (token: string) => {
  const response = await api.get(`/payments/session/${token}/bill`);
  return response.data as SessionBill;
};

export type SplitMode = 'ITEM' | 'EVEN' | 'CUSTOM';
export type SplitProvider = 'CASH' | 'MYPOS';

export interface SettlePartialRequest {
  restaurantId: string;
  mode: SplitMode;
  provider: SplitProvider;
  // ITEM mode only — which order-item units this payment covers.
  allocations?: Array<{ orderItemId: string; quantity: number }>;
  // CUSTOM mode only.
  amount?: number;
  // EVEN mode only — settle remaining / splitCount.
  splitCount?: number;
  tipPercent?: number;
}

export const settlePartial = async (token: string, data: SettlePartialRequest) => {
  const response = await api.post(`/payments/session/${token}/settle-partial`, data);
  return response.data as { amount: number; remaining: number; sessionPaid: boolean };
};

export const createPaymentIntent = async (token: string, tipPercent: number) => {
  const response = await api.post(`/payments/session/${token}/intent`, { tipPercent });
  return response.data as {
    clientSecret: string;
    paymentId: string;
    total: number;
    tipAmount: number;
  };
};

export type CheckoutProvider = 'STRIPE' | 'EPAY' | 'BORICA';

export type BoricaCardholderDetails = {
  cardholderName: string;
  email: string;
  phone?: string;
  billingAddress: string;
};

export type StripeCheckoutResponse = {
  provider: 'STRIPE';
  clientSecret: string;
  paymentId: string;
  total: number;
  tipAmount: number;
};

export type EpayCheckoutResponse = {
  provider: 'EPAY';
  paymentId: string;
  total: number;
  tipAmount: number;
  action: string;
  method: 'POST';
  fields: Record<string, string>;
};

export type BoricaCheckoutResponse = {
  provider: 'BORICA';
  paymentId: string;
  total: number;
  tipAmount: number;
  action: string;
  method: 'POST';
  fields: Record<string, string>;
};

export type CheckoutResponse = StripeCheckoutResponse | EpayCheckoutResponse | BoricaCheckoutResponse;

export const createCheckout = async (
  token: string,
  data: {
    provider: CheckoutProvider;
    tipPercent?: number;
    boricaCardholder?: BoricaCardholderDetails;
  },
) => {
  const response = await api.post(`/payments/session/${token}/checkout`, data);
  return response.data as CheckoutResponse;
};

export const abandonCheckout = async (token: string): Promise<void> => {
  await api.post(`/payments/session/${token}/abandon`);
};

export const closeSession = async (token: string, restaurantId: string) => {
  const response = await api.post(`/payments/session/${token}/close`, { restaurantId });
  return response.data;
};

export const closeSessionWithCard = async (token: string, restaurantId: string) => {
  const response = await api.post(`/payments/session/${token}/close-card`, { restaurantId });
  return response.data as { amount: number };
};

export const closeSessionWithCash = async (token: string, restaurantId: string) => {
  const response = await api.post(`/payments/session/${token}/close-cash`, { restaurantId });
  return response.data as { amount: number };
};

export const getTableSessions = async (restaurantId: string) => {
  const response = await api.get(`/payments/sessions/${restaurantId}`);
  const body = response.data as { data: Array<{ id: string; token: string; tableId: string; status: string; createdAt: string; paidAt?: string }>; meta: { total: number; page: number; limit: number } };
  return body.data;
};

export const generateStripeConnectLink = async (restaurantId: string, returnUrl?: string, refreshUrl?: string) => {
  const response = await api.post(`/restaurants/${restaurantId}/stripe/connect`, { returnUrl, refreshUrl });
  return response.data as { url: string };
};

export const getStripeStatus = async (restaurantId: string) => {
  const response = await api.get(`/restaurants/${restaurantId}/stripe/status`);
  return response.data as { stripeOnboarded: boolean };
};

export const disconnectStripe = async (restaurantId: string) => {
  const response = await api.post(`/restaurants/${restaurantId}/stripe/disconnect`);
  return response.data;
};

// Menu Import / Export
// The plaintext key is only ever returned once (on first creation or
// regeneration). Afterwards the backend reports `configured: true` only — the
// stored key is hashed and cannot be revealed (#10).
export const getImportApiKey = async (restaurantId: string) => {
  const response = await api.get(`/restaurants/${restaurantId}/menu/import/api-key`);
  return response.data as { apiKey?: string; generated?: boolean; configured?: boolean };
};

export const regenerateImportApiKey = async (restaurantId: string) => {
  const response = await api.post(`/restaurants/${restaurantId}/menu/import/api-key/regenerate`);
  return response.data as { apiKey: string };
};

export const confirmMenuImport = async (restaurantId: string, payload: any) => {
  const response = await api.post(`/restaurants/${restaurantId}/menu/import/confirm`, payload);
  return response.data as { success: boolean; created: number; updated: number; categories: number };
};

export const exportMenu = async (restaurantId: string) => {
  const response = await api.get(`/restaurants/${restaurantId}/menu/export`);
  return response.data as { restaurantId: string; categories: any[] };
};

// Staff Management
export type StaffMember = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export const listStaff = async (restaurantId: string) => {
  const response = await api.get(`/restaurants/${restaurantId}/staff`);
  return response.data as StaffMember[];
};

export const createStaff = async (
  restaurantId: string,
  data: { name: string; email?: string; role: string },
) => {
  const response = await api.post(`/restaurants/${restaurantId}/staff`, data);
  return response.data as {
    user: { id: string; email: string; name: string | null; role: string };
    rawPin: string;
    tempPassword?: string;
  };
};

export const removeStaff = async (
  restaurantId: string,
  userId: string,
  options: { hard?: boolean } = {},
) => {
  const response = await api.delete(`/restaurants/${restaurantId}/staff/${userId}`, {
    params: options.hard ? { hard: true } : undefined,
  });
  return response.data;
};

export const updateStaff = async (
  restaurantId: string,
  userId: string,
  data: { role?: string; isActive?: boolean },
) => {
  const response = await api.patch(`/restaurants/${restaurantId}/staff/${userId}`, data);
  // Backend mints a fresh PIN (rawPin) when a role change makes the user a device role.
  return response.data as StaffMember & { rawPin?: string };
};

export const resetStaffPin = async (restaurantId: string, userId: string) => {
  const response = await api.post(`/restaurants/${restaurantId}/staff/${userId}/reset-pin`);
  return response.data as {
    user: { id: string; email: string; name: string | null; role: string };
    rawPin: string;
  };
};

export const createDeviceEnrollment = async (restaurantId: string) => {
  const response = await api.post(`/restaurants/${restaurantId}/device-enrollment`, {
    mode: 'STAFF_DEVICE',
  });
  return response.data as { enrollmentUrl: string; expiresAt: string };
};

export const listDeviceEnrollments = async (restaurantId: string) => {
  const response = await api.get(`/restaurants/${restaurantId}/device-enrollments`);
  return response.data as Array<{
    id: string;
    createdAt: string;
    expiresAt: string;
    usedAt: string | null;
    revokedAt: string | null;
    createdBy: { id: string; name: string | null; email: string };
    staffBindings: Array<{
      firstSeenAt: string;
      lastSeenAt: string;
      user: { id: string; name: string | null; email: string; role: string };
    }>;
  }>;
};

export const revokeDeviceEnrollment = async (restaurantId: string, tokenId: string) => {
  const response = await api.delete(`/restaurants/${restaurantId}/device-enrollments/${tokenId}`);
  return response.data as { success: boolean; revokedAt: string };
};

export const verifyDeviceEnrollment = async (token: string) => {
  const response = await api.post('/device-enrollment/verify', { token });
  return response.data as {
    restaurantId: string;
    restaurantName: string;
    allowedModes: string[];
  };
};

export const getDeviceEnrollmentStatus = async (token: string) => {
  const response = await api.post('/device-enrollment/status', { token });
  return response.data as {
    restaurantId: string;
    restaurantName: string;
    sharedDeviceModeEnabled: boolean;
    enrolled: boolean;
    revoked: boolean;
  };
};

// Subscription / SaaS billing
export interface SubscriptionDetails {
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  status: string;
  interval: string | null;
}

export const getSubscriptionStatus = async (restaurantId?: string) => {
  const response = await api.get('/subscription/status', {
    params: restaurantId ? { restaurantId } : undefined,
  });
  return response.data as {
    tier: string;
    features: string[];
    staffLimit: number;
    allowedStaffRoles: string[];
    hasSubscription: boolean;
    subscription: SubscriptionDetails | null;
  };
};

export const createCheckoutSession = async (tier: string, billingPeriod: 'monthly' | 'yearly' = 'monthly', onboarding = false, restaurantId?: string) => {
  const response = await api.post('/subscription/checkout', { tier, billingPeriod, onboarding, restaurantId });
  return response.data as { url: string };
};

export const confirmCheckoutSession = async (sessionId: string) => {
  const response = await api.post('/subscription/confirm-session', { sessionId });
  return response.data as { tier: string };
};

export const createPortalSession = async (restaurantId?: string) => {
  const response = await api.post('/subscription/portal', { restaurantId });
  return response.data as { url: string };
};

export const updateProfile = async (name: string) => {
  const response = await api.patch('/auth/me', { name });
  return response.data;
};

export const changePassword = async (currentPassword: string, newPassword: string) => {
  const response = await api.patch('/auth/me/password', {
    currentPassword,
    newPassword,
  });
  return response.data as { success: boolean };
};

export const updateOnboardingStep = async (step: string) => {
  const response = await api.patch('/auth/onboarding-step', { step });
  return response.data as { success: boolean };
};

export const bulkCreateTables = async (restaurantId: string, count: number) => {
  const response = await api.post(`/restaurants/${restaurantId}/tables/bulk`, { count });
  return response.data as Array<{ id: string; name: string }>;
};

// Super Admin
export const getSuperAdminStats = () =>
  api.get('/super-admin/stats').then((r) => r.data as import('../types').SuperAdminStats);

export const getSuperAdminTenants = (
  params?: { page?: number; limit?: number; search?: string; tier?: string; status?: string; subscription?: string },
) =>
  api
    .get('/super-admin/tenants', { params })
    .then((r) => r.data as import('../types').PaginatedResponse<import('../types').TenantSummary>);

export const getSuperAdminTenant = (id: string) =>
  api.get(`/super-admin/tenants/${id}`).then((r) => r.data as import('../types').TenantDetail);

const SUPER_ADMIN_CONFIRMATION = 'CONFIRM';

export const updateTenantTier = (id: string, forceTier: string | null) =>
  api.patch(`/super-admin/tenants/${id}/tier`, { forceTier, confirmation: SUPER_ADMIN_CONFIRMATION }).then((r) => r.data);

export const updateTenantStatus = (id: string, isActive: boolean) =>
  api.patch(`/super-admin/tenants/${id}/status`, { isActive, confirmation: SUPER_ADMIN_CONFIRMATION }).then((r) => r.data);

export const deleteTenant = (id: string) =>
  api.delete(`/super-admin/tenants/${id}`, { data: { confirmation: SUPER_ADMIN_CONFIRMATION } }).then((r) => r.data);

export const restoreTenant = (id: string) =>
  api.post(`/super-admin/tenants/${id}/restore`, { confirmation: SUPER_ADMIN_CONFIRMATION }).then((r) => r.data);

export const deleteTenantStaff = (restaurantId: string, userId: string) =>
  api
    .delete(`/super-admin/tenants/${restaurantId}/staff/${userId}`, {
      data: { confirmation: SUPER_ADMIN_CONFIRMATION },
    })
    .then((r) => r.data);

export const importMenuForTenant = (id: string, dto: object) =>
  api.post(`/super-admin/tenants/${id}/menu/import`, dto).then((r) => r.data);

export const resetTenantOwnerPassword = (id: string, password: string) =>
  api.patch(`/super-admin/tenants/${id}/reset-password`, { password, confirmation: SUPER_ADMIN_CONFIRMATION }).then((r) => r.data);

export const updateTenantPayments = (id: string, paymentsEnabled: boolean) =>
  api.patch(`/super-admin/tenants/${id}/payments`, { paymentsEnabled, confirmation: SUPER_ADMIN_CONFIRMATION }).then((r) => r.data);

// ── GDPR / Legal helpers ─────────────────────────────────────────────────────

export const getPublicLegalSettings = () =>
  api.get('/platform-settings/public').then((r) => r.data);

export const getAdminLegalSettings = () =>
  api.get('/super-admin/platform-settings').then((r) => r.data);

export const updateAdminLegalSettings = (patch: Record<string, unknown>) =>
  api.patch('/super-admin/platform-settings', patch).then((r) => r.data);

export const exportUserData = () =>
  api.get('/users/me/export').then((r) => r.data);

export const deleteUserAccount = () =>
  api.delete('/users/me/delete').then((r) => r.data);

// ── Help Content ──────────────────────────────────────────────────────────────

export interface HelpContentItem {
  id: string;
  section: 'landing' | 'dashboard';
  categoryKey: string;
  itemKey: string;
  sortOrder: number;
  locale: 'en' | 'bg' | 'ro';
  title: string;
  body: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export const getHelpContent = (section: 'landing' | 'dashboard', locale?: string) =>
  api
    .get(`/help-content/${section}`, { params: locale ? { locale } : undefined })
    .then((r) => r.data as HelpContentItem[]);

export const getAdminHelpContent = (section: string) =>
  api.get('/super-admin/help-content', { params: { section } }).then((r) => r.data as HelpContentItem[]);

export const createHelpContent = (dto: {
  section: string;
  categoryKey: string;
  itemKey: string;
  sortOrder?: number;
  locale: string;
  title: string;
  body: string;
  active?: boolean;
}) => api.post('/super-admin/help-content', dto).then((r) => r.data as HelpContentItem);

export const updateHelpContent = (id: string, dto: { title?: string; body?: string; sortOrder?: number; active?: boolean }) =>
  api.patch(`/super-admin/help-content/${id}`, dto).then((r) => r.data as HelpContentItem);

export const deleteHelpContent = (id: string) =>
  api.delete(`/super-admin/help-content/${id}`).then((r) => r.data);

export const reorderHelpContent = (items: { id: string; sortOrder: number }[]) =>
  api.patch('/super-admin/help-content/reorder', { items }).then((r) => r.data);

export const recordMenuView = (
  restaurantId: string,
  data: { table?: string | null; visitorId?: string },
): void => {
  api
    .post(`/menu/public/${restaurantId}/view`, { table: data.table ?? undefined, visitorId: data.visitorId })
    .catch(() => undefined);
};

export interface ScanStats {
  totalViews: number;
  uniqueVisitors: number;
  todayViews: number;
  perTable: Array<{ tableName: string; views: number; uniqueVisitors: number }>;
}

export const getScanStats = (restaurantId: string): Promise<ScanStats> =>
  api.get(`/dashboard/scan-stats/${restaurantId}`).then((r) => r.data as ScanStats);

// ─── Print Stations ───────────────────────────────────────────────────────────

export const getPrintStations = () =>
  api.get('/print-stations').then((r) => r.data);

export const getPrintStationHealth = () =>
  api.get('/print-stations/health').then((r) => r.data);

export const createPrintStation = (data: {
  name: string;
  printerIp: string;
  printerPort?: number;
}) => api.post('/print-stations', data).then((r) => r.data);

export const updatePrintStation = (
  id: string,
  data: Partial<{ name: string; printerIp: string; printerPort: number; isActive: boolean; receiptTemplate?: Record<string, unknown> }>,
) => api.patch(`/print-stations/${id}`, data).then((r) => r.data);

export const deletePrintStation = (id: string) =>
  api.delete(`/print-stations/${id}`).then((r) => r.data);

export const generateAgentToken = (stationId: string, label?: string) =>
  api.post(`/print-stations/${stationId}/tokens`, { label }).then((r) => r.data);

export const revokeAgentToken = (tokenId: string) =>
  api.delete(`/print-stations/tokens/${tokenId}`).then((r) => r.data);

export default api;
