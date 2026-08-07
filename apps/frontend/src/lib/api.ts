import axios from "axios";
import { logApiError } from "./clientLogger";
import {
  findHostedCheckoutToken,
  isPublicTableSessionCheckout,
} from "./tableSessionCredential";

// Auth transport is the httpOnly `token` cookie ONLY (#F1). Every token-issuing
// endpoint (login/register/otp/google/pin-login) sets it server-side, and it is
// sent cross-origin via SameSite=None. The backend rejects Bearer auth in
// production, so the old in-memory Bearer fallback was dead weight + an XSS
// surface — removed.

// Use relative /api/v1 for all environments.
// - Local Dev: Vite proxy catches it and forwards to backend.
// - Vercel Prod: vercel.json rewrite catches it and forwards to Cloud Run.
// This ensures requests are always same-origin, bypassing Safari/Edge CSRF blocks.
const API_URL = "/api/v1";

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

// M-PAY-1: TableSession.token is a bearer-like public bill credential. Keep it
// in a dedicated header so Vercel/Cloud Run request URLs, browser history, and
// Referer values never receive it. All table-session helpers go through this
// one transport seam.
const TABLE_SESSION_TOKEN_HEADER = "X-Table-Session-Token";
const withTableSessionToken = (
  token: string,
  config: Record<string, any> = {},
) => ({
  ...config,
  headers: {
    ...(config.headers ?? {}),
    [TABLE_SESSION_TOKEN_HEADER]: token,
  },
});

// L-FE-5: the raw pathname on /impersonate/:code embeds a one-time
// impersonation secret, which backend logging persists verbatim if sent as
// a header value. Redact known-sensitive dynamic segments before tracing.
function getTraceOrigin(): string {
  if (typeof window === "undefined") return "ssr";
  return window.location.pathname.replace(
    /\/impersonate\/[^/]+/,
    "/impersonate/:code",
  );
}

export const getMenu = async (restaurantId: string, lang?: string) => {
  const response = await api.get(`/menu/public/${restaurantId}`, {
    params: lang ? { lang } : undefined,
  });
  return response.data;
};

export const getMenuMeta = async (restaurantId: string, lang?: string) => {
  const response = await api.get(`/menu/public/${restaurantId}/meta`, {
    params: lang ? { lang } : undefined,
  });
  return response.data as { restaurant: any; categories: any[] };
};

export const getCategoryItems = async (
  restaurantId: string,
  categoryId: string,
  lang?: string,
  signal?: AbortSignal,
) => {
  const response = await api.get(
    `/menu/public/${restaurantId}/categories/${categoryId}/items`,
    {
      params: lang ? { lang } : undefined,
      signal,
    },
  );
  return response.data as any[];
};

// Batched: items for every visible category in one request, keyed by categoryId.
// Used for the initial public-menu load and language switch instead of one
// request per category.
export const getAllCategoryItems = async (
  restaurantId: string,
  lang?: string,
  signal?: AbortSignal,
) => {
  const response = await api.get(`/menu/public/${restaurantId}/items`, {
    params: lang ? { lang } : undefined,
    signal,
  });
  return response.data as Record<string, any[]>;
};

export const getTrendingItems = async (restaurantId: string, lang?: string) => {
  const response = await api.get(`/menu/public/${restaurantId}/trending`, {
    params: lang ? { lang } : undefined,
  });
  return response.data;
};

export const login = async (email: string, password: string) => {
  const response = await api.post("/auth/login", { email, password });
  return response.data;
};

export const register = async (
  email: string,
  password: string,
  name?: string,
) => {
  const response = await api.post("/auth/register", { email, password, name });
  return response.data;
};

export const verifyRegistration = async (
  email: string,
  password: string,
  code: string,
) => {
  const response = await api.post("/auth/register/verify", {
    email,
    password,
    code,
  });
  return response.data;
};

export const getCurrentUser = async () => {
  const response = await api.get("/auth/me");
  return response.data;
};

export const createOrder = async (orderData: any, idempotencyKey?: string) => {
  const submissionKey =
    idempotencyKey ?? orderData.posSubmission?.clientOrderId;
  const response = await api.post("/orders", orderData, {
    headers: submissionKey ? { "Idempotency-Key": submissionKey } : undefined,
  });
  return response.data;
};

export interface OrderQueryParams {
  restaurantId?: string;
  period?: number;
  startDate?: string;
  endDate?: string;
  statuses?: string[];
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

const serializeOrderParams = (params?: OrderQueryParams) => ({
  ...params,
  ...(params?.statuses?.length ? { statuses: params.statuses.join(",") } : {}),
});

export const getOrdersPage = async <T = any>(params?: OrderQueryParams) => {
  const response = await api.get<PaginatedResponse<T>>("/orders", {
    params: serializeOrderParams(params),
  });
  return response.data;
};

export const getOrders = async (params?: OrderQueryParams) => {
  const response = await api.get("/orders", {
    params: serializeOrderParams(params),
  });
  return response.data?.data ?? response.data;
};

export const updateOrderStatus = async (orderId: string, status: string) => {
  const response = await api.patch(`/orders/${orderId}/status`, { status });
  return response.data;
};

export interface BulkOrderStatusUpdate {
  id: string;
  restaurantId: string;
  status: string;
  tableId: string | null;
  tableSessionId: string | null;
  updatedAt: string;
}

export const MAX_BULK_ORDER_STATUS_UPDATES = 100;

export interface BulkOrderStatusResult {
  updated: BulkOrderStatusUpdate[];
  failed: Array<{
    id: string;
    reason: "STATUS_CHANGED";
    currentStatus: string;
    updatedAt: string;
  }>;
}

export const bulkUpdateOrderStatus = async (
  restaurantId: string,
  orderIds: string[],
  fromStatus: string,
  status: string,
) => {
  const response = await api.patch<BulkOrderStatusResult>(
    "/orders/status/bulk",
    {
      restaurantId,
      orderIds,
      fromStatus,
      status,
    },
  );
  return response.data;
};

export interface AssistanceRequestQuery {
  restaurantId: string;
  isResolved?: boolean;
  page?: number;
  limit?: number;
}

export const getAssistanceRequests = async (params: AssistanceRequestQuery) => {
  const response = await api.get("/assistance-requests", { params });
  return response.data;
};

export const updateAssistanceRequest = async (
  requestId: string,
  updates: { isResolved?: boolean },
) => {
  const response = await api.patch(
    `/assistance-requests/${requestId}`,
    updates,
  );
  return response.data;
};

export type AssistanceRequestType = "STANDARD" | "URGENT" | "CASH_PAYMENT";

export const createAssistanceRequest = async (
  tableId: string,
  restaurantId: string,
  type: AssistanceRequestType = "STANDARD",
) => {
  const response = await api.post("/assistance-requests", {
    tableId,
    restaurantId,
    type,
  });
  return response.data;
};

// Restaurants / Settings
export const updateRestaurant = async (restaurantId: string, data: any) => {
  const response = await api.patch(`/restaurants/${restaurantId}`, data);
  return response.data;
};

export const getLogoBase64 = async (
  restaurantId: string,
): Promise<{ dataUrl: string } | null> => {
  const response = await api.get(`/restaurants/${restaurantId}/logo-base64`);
  return response.data;
};

export const triggerTranslation = async (restaurantId: string) => {
  const response = await api.post(`/restaurants/${restaurantId}/translate-all`);
  return response.data;
};

export interface TranslationStatus {
  pending: number;
  failed: number;
  current: number;
  active: boolean;
  latestRunId: string | null;
  latestRunStatus: string | null;
}

export const getTranslationStatus = async (
  restaurantId: string,
): Promise<TranslationStatus> => {
  const response = await api.get(
    `/restaurants/${restaurantId}/translation-status`,
  );
  return response.data;
};

// Tables
export type ServicePointType = "TABLE" | "ROOM" | "PICKUP" | "OTHER";
export type FulfillmentMode = "DINE_IN" | "ROOM_DELIVERY" | "PICKUP";
export type ServicePointPaymentMethod =
  | "ONLINE"
  | "CASH"
  | "PAY_ON_DELIVERY"
  | "PAY_AT_PICKUP";

export interface ServicePoint {
  id: string;
  name: string;
  restaurantId?: string;
  zoneId?: string | null;
  type: ServicePointType;
  publicToken: string | null;
  isActive: boolean;
  fulfillmentModes: FulfillmentMode[];
  paymentMethods: ServicePointPaymentMethod[];
  zone?: { id: string; name: string; zoneKey?: string | null } | null;
  // Present on GET /restaurants/:id/service-points — a service point allows
  // multiple concurrent guest sessions (unlike a table's single OPEN
  // session), so this is an array, not a single nullable session.
  activeSessions?: Array<{
    sessionId: string;
    sessionToken: string;
    orderCount: number;
    totalAmount: number;
    createdAt: string;
  }>;
}

export const getTables = async (restaurantId: string) => {
  const response = await api.get(`/restaurants/${restaurantId}/tables`);
  return response.data as ServicePoint[];
};

export const createTable = async (
  restaurantId: string,
  name: string,
  zoneId?: string,
) => {
  const response = await api.post(`/restaurants/${restaurantId}/tables`, {
    name,
    zoneId,
  });
  return response.data;
};

export const getServicePoints = async (restaurantId: string) => {
  const response = await api.get(`/restaurants/${restaurantId}/service-points`);
  return response.data as ServicePoint[];
};

export const createServicePoint = async (
  restaurantId: string,
  data: {
    name: string;
    type: Exclude<ServicePointType, "TABLE">;
    isActive?: boolean;
    fulfillmentModes?: FulfillmentMode[];
    paymentMethods?: ServicePointPaymentMethod[];
  },
) => {
  const response = await api.post(
    `/restaurants/${restaurantId}/service-points`,
    data,
  );
  return response.data as ServicePoint;
};

export const resolvePublicServicePoint = async (
  restaurantId: string,
  token: string,
) => {
  const response = await api.get(
    `/restaurants/${restaurantId}/service-points/public/${encodeURIComponent(token)}`,
  );
  return response.data as ServicePoint;
};

export const rotateServicePointToken = async (servicePointId: string) => {
  const response = await api.post(
    `/tables/${servicePointId}/public-token/rotate`,
  );
  return response.data as ServicePoint;
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
    source?: "CUSTOMER" | "POS";
    staffName?: string | null;
    staffRole?: string | null;
    items: Array<{
      name: string;
      quantity: number;
      totalPrice?: number;
      options?: string[];
    }>;
  }>;
};

export const getTableStatuses = async (
  restaurantId: string,
  zoneId?: string,
) => {
  const response = await api.get(`/tables/status/${restaurantId}`, {
    params: zoneId ? { zoneId } : undefined,
  });
  return response.data as Array<{
    id: string;
    name: string;
    status: "empty" | "occupied" | "paid";
    sessionId: string | null;
    sessionToken: string | null;
    orderCount: number;
    totalAmount: number;
    customerNames: string[];
    sessionStatus: string | null;
    updatedAt: string;
    zone?: { id: string; name: string; zoneKey: string | null };
    zoneId?: string | null;
    zoneName?: string | null;
    zoneKey?: string | null;
  }>;
};

export const updateTable = async (
  tableId: string,
  data: {
    name?: string;
    zoneId?: string | null;
    isActive?: boolean;
    fulfillmentModes?: FulfillmentMode[];
    paymentMethods?: ServicePointPaymentMethod[];
  },
) => {
  const response = await api.patch(`/tables/${tableId}`, data);
  return response.data as ServicePoint;
};

// ── Table Zones ─────────────────────────────────────────────────────────────────

export interface TableZone {
  id: string;
  name: string;
  zoneKey?: string | null;
  restaurantId: string;
  displayOrder: number;
  _count?: { tables: number };
}

export const getZones = async (restaurantId: string) => {
  const response = await api.get(`/restaurants/${restaurantId}/zones`);
  return response.data as TableZone[];
};

export const createZone = async (
  restaurantId: string,
  name: string,
  zoneKey?: string | null,
  displayOrder?: number,
) => {
  const response = await api.post(`/restaurants/${restaurantId}/zones`, {
    name,
    zoneKey: zoneKey ?? undefined,
    displayOrder,
  });
  return response.data as TableZone;
};

export const updateZone = async (
  zoneId: string,
  data: { name?: string; zoneKey?: string | null; displayOrder?: number },
) => {
  const response = await api.patch(`/zones/${zoneId}`, data);
  return response.data as TableZone;
};

export const deleteZone = async (zoneId: string) => {
  const response = await api.delete(`/zones/${zoneId}`);
  return response.data;
};

export const reorderZones = async (
  restaurantId: string,
  items: { id: string; displayOrder: number }[],
) => {
  const response = await api.patch(
    `/restaurants/${restaurantId}/zones/reorder`,
    { items },
  );
  return response.data;
};

// Analytics
export const getAnalytics = async (
  restaurantId: string,
  period: number,
  startDate?: string,
  endDate?: string,
  language?: string,
) => {
  const response = await api.get("/dashboard/analytics", {
    params: {
      restaurantId,
      ...(language && { lang: language }),
      ...(startDate && endDate ? { startDate, endDate } : { period }),
    },
  });
  return response.data;
};

export const getPaymentSummary = async (
  restaurantId: string,
  period: number,
  startDate?: string,
  endDate?: string,
) => {
  const response = await api.get("/dashboard/payments-summary", {
    params: {
      restaurantId,
      ...(!startDate && !endDate ? { period } : {}),
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
    },
  });
  return response.data as {
    totalCollected: number;
    refundAmount: number;
    byMethod: { method: string; amount: number }[];
  };
};

// ── Daily target ───────────────────────────────────────────────────────────

export const getDailyTarget = async (restaurantId: string, date?: string) => {
  const response = await api.get("/dashboard/target", {
    params: { restaurantId, ...(date && { date }) },
  });
  return response.data as { target: number; actual: number };
};

export const setDailyTarget = async (
  restaurantId: string,
  dailyRevenue: number,
  date?: string,
) => {
  const response = await api.put(
    "/dashboard/target",
    { dailyRevenue, ...(date && { date }) },
    {
      params: { restaurantId },
    },
  );
  return response.data;
};

// ── Daily closeout ─────────────────────────────────────────────────────────

export const getDailyCloseout = async (restaurantId: string, date: string) => {
  const response = await api.get(`/dashboard/closeout/${restaurantId}`, {
    params: { date },
  });
  return response.data as {
    date: string;
    revenueByMethod: { method: string; amount: number }[];
    totalCollected: number;
    totalTips: number;
    orderedRevenue: number;
    discountPointsRedeemed: number;
    refundedAmount: number;
    canceledRevenue: number;
    netRevenue: number;
    totalOrderCount: number;
    canceledOrderCount: number;
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
  params?: {
    status?: string;
    provider?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  },
) =>
  api
    .get(`/payments/history/${restaurantId}`, { params })
    .then((res) => res.data);

export type PaymentNotificationKind = "PAYMENT_SUCCEEDED" | "PAYMENT_REFUNDED";

export interface PaymentNotificationFeedItem {
  id: string;
  paymentId: string;
  tableSessionId: string | null;
  amount: number;
  tipAmount: number;
  currency: string;
  tableNumber: string | null;
  customerName: string | null;
  provider: string;
  status: string;
  kind: PaymentNotificationKind;
  occurredAt: string;
  read: boolean;
}

export interface PaymentNotificationFeed {
  data: PaymentNotificationFeedItem[];
  unreadCount: number;
  readThrough: string | null;
}

export const getPaymentNotificationFeed = (restaurantId: string, limit = 20) =>
  api
    .get<PaymentNotificationFeed>(`/payments/notifications/${restaurantId}`, {
      params: { limit },
    })
    .then((res) => res.data);

export const markPaymentNotificationsRead = (restaurantId: string) =>
  api
    .post<{
      readThrough: string;
    }>(`/payments/notifications/${restaurantId}/read`)
    .then((res) => res.data);

export type PaymentReconciliationProvider =
  | "STRIPE"
  | "EPAY"
  | "BORICA"
  | "MYPOS"
  | "CASH";

export type PaymentReconciliationReason =
  | "SESSION_NOT_OPEN"
  | "SCOPE_AMOUNT_MISMATCH"
  | "SCOPE_CONFLICT"
  | "PROVIDER_CONFIRMATION_MISMATCH"
  | "PROVIDER_STATUS_UNKNOWN"
  | "HISTORICAL_CAPTURE"
  | "REFUND_LEFT_BALANCE";

export type PaymentReconciliationStatus = "OPEN" | "RESOLVED" | "DISMISSED";

export interface PaymentReconciliationIssue {
  id: string;
  paymentId: string;
  restaurantId: string;
  tableSessionId: string | null;
  provider: PaymentReconciliationProvider;
  reason: PaymentReconciliationReason;
  status: PaymentReconciliationStatus;
  amount: number;
  currency: string;
  providerReference: string | null;
  providerStatus: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  payment: {
    id: string;
    status: string;
    provider: PaymentReconciliationProvider;
    amount: number;
    currency: string;
    tipAmount: number;
    providerReference: string | null;
    stripePaymentIntentId: string | null;
    createdAt: string;
  };
  tableSession: {
    id: string;
    status: "OPEN" | "PAID" | "CLOSED_PAID" | "CLOSED_NO_PAYMENT";
    table: { name: string };
  } | null;
}

export const getPaymentReconciliationIssues = (
  restaurantId: string,
  status: PaymentReconciliationStatus = "OPEN",
) =>
  api
    .get(`/payments/reconciliation/${restaurantId}`, { params: { status } })
    .then((res) => res.data as PaymentReconciliationIssue[]);

export const resolvePaymentReconciliationIssue = (
  issueId: string,
  data: {
    status: Exclude<PaymentReconciliationStatus, "OPEN">;
    note?: string;
  },
) =>
  api
    .post(`/payments/reconciliation/issues/${issueId}/resolve`, data)
    .then((res) => res.data as PaymentReconciliationIssue);

export const reopenPaymentReconciliationIssue = (
  issueId: string,
  data?: { note?: string },
) =>
  api
    .post(
      `/payments/reconciliation/issues/${issueId}/reopen-session`,
      data ?? {},
    )
    .then((res) => res.data as PaymentReconciliationIssue);

export const getPaymentsExport = (
  restaurantId: string,
  params?: {
    from?: string;
    to?: string;
    status?: string;
    provider?: string;
    search?: string;
  },
) =>
  api
    .get(`/payments/export/${restaurantId}`, { params })
    .then((res) => res.data as any[]);

export const getPaymentOverview = (
  restaurantId: string,
  params?: { startDate?: string; endDate?: string },
) =>
  api.get(`/payments/overview/${restaurantId}`, { params }).then(
    (res) =>
      res.data as {
        account: {
          paymentsEnabled: boolean;
          stripeOnboarded: boolean;
          stripeAccountId: string | null;
          epayEnabled: boolean;
          epayMode: "DEMO" | "LIVE";
          epayClientId: string | null;
          epayMerchantEmail: string | null;
          epayPage: "credit_paydirect" | "paylogin";
          epaySecretConfigured: boolean;
          boricaEnabled?: boolean;
          boricaMode?: "DEMO" | "LIVE";
          boricaTerminalId?: string | null;
          boricaMerchantId?: string | null;
          boricaMerchantName?: string | null;
          boricaPublicCert?: string | null;
          boricaCurrency?: "EUR";
          boricaPrivateKeyConfigured?: boolean;
          myposEnabled?: boolean;
          myposMode?: "DEMO" | "LIVE";
          myposClientNumber?: string | null;
          myposStoreId?: string | null;
          myposKeyIndex?: string | null;
          myposPublicCert?: string | null;
          myposCurrency?: "EUR";
          myposPrivateKeyConfigured?: boolean;
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
        methodTotals: Array<{
          method: string;
          amount: number;
          fees: number;
          count: number;
        }>;
        currency: string;
        latestPaymentAt: string | null;
      },
  );

export const getPaymentDetail = (paymentId: string) =>
  api.get(`/payments/${paymentId}`).then((res) => res.data);

export const getPaymentPayouts = (restaurantId: string) =>
  api.get(`/payments/payouts/${restaurantId}`).then(
    (res) =>
      res.data as {
        estimatedBalance: number;
        platformFees: number;
        totalCollected: number;
        methodTotals: Array<{
          method: string;
          amount: number;
          fees: number;
          count: number;
        }>;
        stripeAccountId: string | null;
        stripeOnboarded: boolean;
      },
  );

export const getPaymentSettings = (restaurantId: string) =>
  api.get(`/payments/settings/${restaurantId}`).then((res) => res.data);

export const refundPayment = (
  paymentId: string,
  data?: { amount?: number; reason?: string },
) =>
  api.post(`/payments/${paymentId}/refund`, data ?? {}).then((res) => res.data);

// Feedback
export const submitFeedback = async (data: {
  rating: number;
  comment?: string;
  orderId: string;
  restaurantId: string;
  redirectedToGoogle?: boolean;
}) => {
  const response = await api.post("/feedback", data);
  return response.data;
};

export type FeedbackInvitationResponse = {
  eligible: boolean;
  submitted: boolean;
  reason?:
    | "PAYMENT_PENDING"
    | "PAYMENT_EXPIRED"
    | "ORDERS_NOT_SERVED"
    | "ALREADY_PROMPTED";
  invitationToken?: string;
  payment: {
    id: string;
    amount: number;
    currency: string;
    provider: string;
  };
  restaurant: {
    id: string;
    name: string;
    googleReviewUrl: string | null;
  };
};

// `paymentId` is optional: the server resolves the session's latest succeeded
// payment when the client can't name one (hosted-checkout return without its
// sessionStorage marker, or a waiter-settled payment).
export const createFeedbackInvitation = async (
  sessionToken: string,
  data: { paymentId?: string } = {},
) => {
  const response = await api.post(
    "/feedback/invitations",
    data,
    withTableSessionToken(sessionToken),
  );
  return response.data as FeedbackInvitationResponse;
};

export const submitVisitFeedback = async (data: {
  invitationToken: string;
  rating: number;
  comment?: string;
}) => {
  const response = await api.post("/feedback/visit", data);
  return response.data;
};

export const markFeedbackInvitationPresented = async (
  invitationToken: string,
) => {
  const response = await api.post("/feedback/visit/presented", {
    invitationToken,
  });
  return response.data;
};

export const markGoogleReviewClick = async (invitationToken: string) => {
  const response = await api.post("/feedback/visit/google-click", {
    invitationToken,
  });
  return response.data;
};

export const getGoogleReviewUrl = async (restaurantId: string) => {
  const response = await api.get(`/feedback/google-review-url/${restaurantId}`);
  return response.data;
};

export const getFeedbackSummary = async (
  restaurantId: string,
  startDate?: string,
  endDate?: string,
) => {
  const response = await api.get("/feedback/summary", {
    params: { restaurantId, startDate, endDate },
  });
  return response.data;
};

export type FeedbackReview = {
  id: string;
  source: "LOCAL" | "GOOGLE";
  rating: number;
  comment: string | null;
  createdAt: string;
  authorName: string | null;
  tableName: string | null;
  orderTotal: number | null;
  payment: {
    provider: string;
    amount: number;
    currency: string;
  } | null;
  googleReviewClickedAt: string | null;
};

export type FeedbackReviewPage = {
  data: FeedbackReview[];
  total: number;
  page: number;
  totalPages: number;
};

export type FeedbackReviewQuery = {
  restaurantId: string;
  page?: number;
  limit?: number;
  rating?: number;
  hasComment?: boolean;
  sort?: "NEWEST" | "OLDEST";
  startDate?: string;
  endDate?: string;
};

export const getFeedbackReviews = async (
  params: FeedbackReviewQuery,
): Promise<FeedbackReviewPage> => {
  const response = await api.get("/feedback", { params });
  return response.data;
};

// Module-level CSRF token — fetched once from /auth/csrf-token endpoint.
// Cannot use document.cookie cross-origin (backend on different host than frontend in dev).
let csrfToken: string | null = null;
// Dedupe concurrent first-time fetches (#F2): N parallel state-changing requests at
// startup would each fire their own GET /auth/csrf-token. Share one in-flight promise.
let csrfFetchPromise: Promise<void> | null = null;
const fetchCsrfToken = async (force = false): Promise<void> => {
  if (force) csrfToken = null;
  if (csrfToken) return;
  if (!csrfFetchPromise) {
    csrfFetchPromise = (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/csrf-token`, {
          credentials: "include",
          cache: "no-store",
        });
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

const STATE_CHANGING_METHODS = new Set(["post", "patch", "delete", "put"]);

const isStateChangingMethod = (method?: string) =>
  !!method && STATE_CHANGING_METHODS.has(method.toLowerCase());

const setCsrfHeader = (config: any) => {
  if (!csrfToken) return;
  config.headers = config.headers ?? {};
  config.headers["X-CSRF-Token"] = csrfToken;
};

api.interceptors.request.use(async (config) => {
  // Auth rides the httpOnly cookie (sent automatically via withCredentials).
  // CSRF token — attach to state-changing requests
  if (isStateChangingMethod(config.method)) {
    if (!csrfToken) await fetchCsrfToken();
    setCsrfHeader(config);
  }

  // ── Frontend trace headers ──────────────────────────────────────────
  // These let the backend LoggingInterceptor correlate requests back to
  // the page/component that fired them, helping track down sources of
  // excessive API calls.
  config.headers = config.headers ?? {};
  config.headers["X-Trace-Origin"] = getTraceOrigin();
  // crypto.randomUUID() requires a secure context (HTTPS); fall back for HTTP dev.
  config.headers["X-Correlation-Id"] =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  config.headers["X-Request-Started-At"] = String(Date.now());

  return config;
});

// Response interceptor — handle 401 Unauthorized (cookie expired)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (axios.isCancel(error) || error?.code === "ERR_CANCELED") {
      return Promise.reject(error);
    }

    const responseMessage =
      error?.response?.data?.message ??
      error?.response?.data?.error ??
      error?.message;
    const requestConfig = error?.config;
    const isInvalidCsrf =
      error?.response?.status === 403 &&
      responseMessage === "Invalid CSRF token";

    if (
      isInvalidCsrf &&
      requestConfig &&
      isStateChangingMethod(requestConfig.method) &&
      !(requestConfig as any)._csrfRetry
    ) {
      (requestConfig as any)._csrfRetry = true;
      await fetchCsrfToken(true);
      setCsrfHeader(requestConfig);
      return api(requestConfig);
    }

    logApiError(error);

    if (error.response?.status === 401) {
      // Never redirect for /auth/me — AuthContext handles auth check failures itself.
      // /auth/me/password's 401 means "wrong current password" (see
      // AuthService.changePassword), not an expired session — the caller's own
      // try/catch already surfaces that inline, so it must not trigger a
      // global logout redirect either.
      const requestUrl = error.config?.url || "";
      if (
        requestUrl.endsWith("/auth/me") ||
        requestUrl.endsWith("/auth/me/password") ||
        requestUrl.endsWith("/auth/pin-login")
      ) {
        return Promise.reject(error);
      }
      const publicPaths = [
        "/login",
        "/register",
        "/auth/callback",
        "/menu/public",
        "/device-enroll",
        "/device-login",
      ];
      const currentPath = window.location.pathname;
      // POS payment-QR bill is viewed unauthenticated with a fragment token.
      // Only that variant bypasses the login redirect — authenticated customer
      // checkout still redirects on 401 (M2).
      const isPublicCheckout =
        typeof window !== "undefined" &&
        (isPublicTableSessionCheckout(currentPath, window.location.hash) ||
          (currentPath.startsWith("/checkout") &&
            findHostedCheckoutToken(window.sessionStorage) !== null));
      if (
        !isPublicCheckout &&
        !publicPaths.some((p) => currentPath.startsWith(p))
      ) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);

// Payment / TableSession

export const getOrCreateSession = async (
  tableId: string,
  restaurantId: string,
  sessionToken?: string,
) => {
  const response = await api.post("/payments/session", {
    tableId,
    restaurantId,
    sessionToken,
  });
  return response.data as { session: any; token: string };
};

export const forceOpenSession = async (
  tableId: string,
  restaurantId: string,
) => {
  const response = await api.post("/payments/session/force-open", {
    tableId,
    restaurantId,
  });
  return response.data as { session: any; token: string };
};

export interface SessionBillItem {
  orderItemId: string;
  name: string;
  quantity: number;
  paidQuantity: number;
  unitPrice: number;
  unitPriceWithOptions: number;
  originalUnitPriceWithOptions?: number;
  redeemedWithPoints?: boolean;
  selectedOptions: any[];
}

export interface SessionBillOrder {
  id: string;
  source: "CUSTOMER" | "POS";
  customerName?: string | null;
  customerPhone?: string | null;
  staffName: string | null;
  staffRole: string | null;
  totalPrice: number;
  items: SessionBillItem[];
}

export interface PendingBillPayment {
  id: string;
  tableSessionId: string;
  source: "ONLINE_PAYMENT" | "CASH_REQUEST";
  provider: CheckoutProvider | "CASH";
  status: "PENDING";
  scope: "FULL_TABLE" | "ORDER_ITEMS";
  orderIds: string[];
  amount: number;
  createdAt: string;
}

export interface SessionBill {
  sessionId: string;
  tableId: string;
  tableName?: string | null;
  orders: SessionBillOrder[];
  subtotal: number;
  paidSubtotal: number;
  remaining: number;
  splitItemsAvailable: boolean;
  restaurantId: string;
  targetLanguages?: string[];
  tipsEnabled: boolean;
  tipOptions: number[];
  paymentProviders: Array<CheckoutProvider>;
  pendingPayment: PendingBillPayment | null;
}

export type CashPaymentRequestStatus = "PENDING" | "PAID" | "CANCELLED";
export type CashPaymentRequestScope = "FULL_TABLE" | "ORDER_ITEMS";

export interface CashPaymentRequest {
  id: string;
  restaurantId: string;
  tableSessionId: string | null;
  tableId: string | null;
  tableName: string | null;
  status: CashPaymentRequestStatus;
  scope: CashPaymentRequestScope;
  orderIds: string[];
  requestedAmount: number;
  currency: string;
  paymentId: string | null;
  resolvedById: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const getSessionBill = async (token: string, lang?: string) => {
  const response = await api.get(
    "/payments/session/bill",
    withTableSessionToken(token, {
      params: lang ? { lang } : undefined,
    }),
  );
  return response.data as SessionBill;
};

export type SplitMode = "ITEM" | "EVEN" | "CUSTOM";
export type SplitProvider = "CASH" | "MYPOS";

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

export const settlePartial = async (
  token: string,
  data: SettlePartialRequest,
) => {
  const response = await api.post(
    "/payments/session/settle-partial",
    data,
    withTableSessionToken(token),
  );
  return response.data as {
    amount: number;
    remaining: number;
    sessionPaid: boolean;
  };
};

export const createPaymentIntent = async (
  token: string,
  tipPercent: number,
) => {
  const response = await api.post(
    "/payments/session/intent",
    { tipPercent },
    withTableSessionToken(token),
  );
  return response.data as {
    clientSecret: string;
    paymentId: string;
    total: number;
    tipAmount: number;
  };
};

export type CheckoutProvider = "STRIPE" | "EPAY" | "BORICA" | "MYPOS";

export type BoricaCardholderDetails = {
  cardholderName: string;
  email: string;
  phone?: string;
  billingAddress: string;
};

export type StripeCheckoutResponse = {
  provider: "STRIPE";
  clientSecret: string;
  paymentId: string;
  total: number;
  tipAmount: number;
};

export type EpayCheckoutResponse = {
  provider: "EPAY";
  paymentId: string;
  total: number;
  tipAmount: number;
  action: string;
  method: "POST";
  fields: Record<string, string>;
};

export type BoricaCheckoutResponse = {
  provider: "BORICA";
  paymentId: string;
  total: number;
  tipAmount: number;
  action: string;
  method: "POST";
  fields: Record<string, string>;
};

export type MyposCheckoutResponse = {
  provider: "MYPOS";
  paymentId: string;
  total: number;
  tipAmount: number;
  action: string;
  method: "POST";
  fields: Record<string, string>;
};

export type CheckoutResponse =
  | StripeCheckoutResponse
  | EpayCheckoutResponse
  | BoricaCheckoutResponse
  | MyposCheckoutResponse;

export const createCheckout = async (
  token: string,
  data: {
    provider: CheckoutProvider;
    tipPercent?: number;
    boricaCardholder?: BoricaCardholderDetails;
    orderIds?: string[];
  },
) => {
  const response = await api.post(
    "/payments/session/checkout",
    data,
    withTableSessionToken(token),
  );
  return response.data as CheckoutResponse;
};

export const createCashPaymentRequest = async (
  token: string,
  data: { restaurantId: string; orderIds?: string[] },
) => {
  const response = await api.post(
    "/payments/session/cash-request",
    data,
    withTableSessionToken(token),
  );
  return response.data as CashPaymentRequest;
};

export const abandonCheckout = async (token: string): Promise<void> => {
  await api.post(
    "/payments/session/abandon",
    undefined,
    withTableSessionToken(token),
  );
};

export const closeSession = async (token: string, restaurantId: string) => {
  const response = await api.post(
    "/payments/session/close",
    { restaurantId },
    withTableSessionToken(token),
  );
  return response.data;
};

export const closeSessionWithCard = async (
  token: string,
  restaurantId: string,
) => {
  const response = await api.post(
    "/payments/session/close-card",
    { restaurantId },
    withTableSessionToken(token),
  );
  return response.data as { amount: number };
};

export const closeSessionWithCash = async (
  token: string,
  restaurantId: string,
) => {
  const response = await api.post(
    "/payments/session/close-cash",
    { restaurantId },
    withTableSessionToken(token),
  );
  return response.data as { amount: number };
};

export const getCashPaymentRequests = async (
  restaurantId: string,
  status: "ALL" | CashPaymentRequestStatus = "ALL",
) => {
  const response = await api.get(`/payments/cash-requests/${restaurantId}`, {
    params: { status },
  });
  return response.data as CashPaymentRequest[];
};

export const confirmCashPaymentRequest = async (requestId: string) => {
  const response = await api.post(
    `/payments/cash-requests/${requestId}/confirm`,
  );
  return response.data as CashPaymentRequest;
};

export const cancelCashPaymentRequest = async (requestId: string) => {
  const response = await api.post(
    `/payments/cash-requests/${requestId}/cancel`,
  );
  return response.data as CashPaymentRequest;
};

export const getTableSessions = async (restaurantId: string) => {
  const response = await api.get(`/payments/sessions/${restaurantId}`);
  const body = response.data as {
    data: Array<{
      id: string;
      token: string;
      tableId: string;
      status: string;
      createdAt: string;
      paidAt?: string;
      isServicePoint?: boolean;
    }>;
    meta: { total: number; page: number; limit: number };
  };
  return body.data;
};

export const generateStripeConnectLink = async (
  restaurantId: string,
  returnUrl?: string,
  refreshUrl?: string,
) => {
  const response = await api.post(
    `/restaurants/${restaurantId}/stripe/connect`,
    { returnUrl, refreshUrl },
  );
  return response.data as { url: string };
};

export const getStripeStatus = async (restaurantId: string) => {
  const response = await api.get(`/restaurants/${restaurantId}/stripe/status`);
  return response.data as { stripeOnboarded: boolean };
};

export const disconnectStripe = async (restaurantId: string) => {
  const response = await api.post(
    `/restaurants/${restaurantId}/stripe/disconnect`,
  );
  return response.data;
};

// Menu Import / Export
// The plaintext key is only ever returned once (on first creation or
// regeneration). Afterwards the backend reports `configured: true` only — the
// stored key is hashed and cannot be revealed (#10).
export const getImportApiKey = async (restaurantId: string) => {
  const response = await api.get(
    `/restaurants/${restaurantId}/menu/import/api-key`,
  );
  return response.data as {
    apiKey?: string;
    generated?: boolean;
    configured?: boolean;
  };
};

export const regenerateImportApiKey = async (restaurantId: string) => {
  const response = await api.post(
    `/restaurants/${restaurantId}/menu/import/api-key/regenerate`,
  );
  return response.data as { apiKey: string };
};

export const confirmMenuImport = async (restaurantId: string, payload: any) => {
  const response = await api.post(
    `/restaurants/${restaurantId}/menu/import/confirm`,
    payload,
  );
  return response.data as {
    success: boolean;
    created: number;
    updated: number;
    categories: number;
  };
};

export const exportMenu = async (restaurantId: string) => {
  const response = await api.get(`/restaurants/${restaurantId}/menu/export`);
  return response.data as { restaurantId: string; categories: any[] };
};

export type BulkEditItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  costPrice: number | null;
  weight: string | null;
  currency: "EUR" | "BGN";
  categoryId: string;
  allergens: string[];
  dietaryTags: string[];
  tags: string[];
  isFeatured: boolean;
  isOutOfStock: boolean;
  rewardPointsMode: "OFF" | "AUTO" | "CUSTOM";
  rewardPointsPrice: number | null;
};

export type BulkItemUpdate = { id: string } & Partial<
  Omit<BulkEditItem, "id" | "categoryId" | "currency">
>;

export type BulkUpdateResult = {
  updated: string[];
  failed: { id: string; error: string }[];
};

export const getBulkEditItems = async (restaurantId: string) => {
  const response = await api.get(
    `/restaurants/${restaurantId}/menu/bulk-items`,
  );
  return response.data as BulkEditItem[];
};

export const bulkUpdateMenuItems = async (
  restaurantId: string,
  updates: BulkItemUpdate[],
) => {
  const response = await api.patch(
    `/restaurants/${restaurantId}/menu/bulk-items`,
    { updates },
  );
  return response.data as BulkUpdateResult;
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
  const response = await api.delete(
    `/restaurants/${restaurantId}/staff/${userId}`,
    {
      params: options.hard ? { hard: true } : undefined,
    },
  );
  return response.data;
};

export const updateStaff = async (
  restaurantId: string,
  userId: string,
  data: { role?: string; isActive?: boolean },
) => {
  const response = await api.patch(
    `/restaurants/${restaurantId}/staff/${userId}`,
    data,
  );
  // Backend mints a fresh PIN (rawPin) when a role change makes the user a device role.
  return response.data as StaffMember & { rawPin?: string };
};

export const resetStaffPin = async (restaurantId: string, userId: string) => {
  const response = await api.post(
    `/restaurants/${restaurantId}/staff/${userId}/reset-pin`,
  );
  return response.data as {
    user: { id: string; email: string; name: string | null; role: string };
    rawPin: string;
  };
};

export const createDeviceEnrollment = async (restaurantId: string) => {
  const response = await api.post(
    `/restaurants/${restaurantId}/device-enrollment`,
    {
      mode: "STAFF_DEVICE",
    },
  );
  return response.data as { enrollmentUrl: string; expiresAt: string };
};

export const listDeviceEnrollments = async (restaurantId: string) => {
  const response = await api.get(
    `/restaurants/${restaurantId}/device-enrollments`,
  );
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

export const revokeDeviceEnrollment = async (
  restaurantId: string,
  tokenId: string,
) => {
  const response = await api.delete(
    `/restaurants/${restaurantId}/device-enrollments/${tokenId}`,
  );
  return response.data as { success: boolean; revokedAt: string };
};

export const verifyDeviceEnrollment = async (token: string) => {
  const response = await api.post("/device-enrollment/verify", { token });
  return response.data as {
    restaurantId: string;
    restaurantName: string;
    allowedModes: string[];
  };
};

export const getDeviceEnrollmentStatus = async (token: string) => {
  const response = await api.post("/device-enrollment/status", { token });
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
  const response = await api.get("/subscription/status", {
    params: restaurantId ? { restaurantId } : undefined,
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
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

export const createCheckoutSession = async (
  tier: string,
  billingPeriod: "monthly" | "yearly" = "monthly",
  onboarding = false,
  restaurantId?: string,
) => {
  const response = await api.post("/subscription/checkout", {
    tier,
    billingPeriod,
    onboarding,
    restaurantId,
  });
  return response.data as { url: string };
};

export const confirmCheckoutSession = async (sessionId: string) => {
  const response = await api.post("/subscription/confirm-session", {
    sessionId,
  });
  return response.data as { tier: string };
};

export const createPortalSession = async (restaurantId?: string) => {
  const response = await api.post("/subscription/portal", { restaurantId });
  return response.data as { url: string };
};

export const updateProfile = async (name: string) => {
  const response = await api.patch("/auth/me", { name });
  return response.data;
};

export const changePassword = async (
  currentPassword: string,
  newPassword: string,
) => {
  const response = await api.patch("/auth/me/password", {
    currentPassword,
    newPassword,
  });
  return response.data as { success: boolean };
};

export const updateOnboardingStep = async (step: string) => {
  const response = await api.patch("/auth/onboarding-step", { step });
  return response.data as { success: boolean };
};

export const bulkCreateTables = async (restaurantId: string, count: number) => {
  const response = await api.post(`/restaurants/${restaurantId}/tables/bulk`, {
    count,
  });
  return response.data as Array<{ id: string; name: string }>;
};

// Super Admin
export const getSuperAdminStats = () =>
  api
    .get("/super-admin/stats")
    .then((r) => r.data as import("../types").SuperAdminStats);

export const getSuperAdminTenants = (params?: {
  page?: number;
  limit?: number;
  search?: string;
  tier?: string;
  status?: string;
  subscription?: string;
}) =>
  api
    .get("/super-admin/tenants", { params })
    .then(
      (r) =>
        r.data as import("../types").PaginatedResponse<
          import("../types").TenantSummary
        >,
    );

export const getSuperAdminTenant = (id: string) =>
  api
    .get(`/super-admin/tenants/${id}`)
    .then((r) => r.data as import("../types").TenantDetail);

const SUPER_ADMIN_CONFIRMATION = "CONFIRM";

export const updateTenantTier = (
  id: string,
  forceTier: string | null,
  forceTierExpiresInDays?: number | null,
) =>
  api
    .patch(`/super-admin/tenants/${id}/tier`, {
      forceTier,
      forceTierExpiresInDays: forceTierExpiresInDays ?? undefined,
      confirmation: SUPER_ADMIN_CONFIRMATION,
    })
    .then((r) => r.data);

export const updateTenantStatus = (id: string, isActive: boolean) =>
  api
    .patch(`/super-admin/tenants/${id}/status`, {
      isActive,
      confirmation: SUPER_ADMIN_CONFIRMATION,
    })
    .then((r) => r.data);

export const deleteTenant = (id: string) =>
  api
    .delete(`/super-admin/tenants/${id}`, {
      data: { confirmation: SUPER_ADMIN_CONFIRMATION },
    })
    .then((r) => r.data);

export const restoreTenant = (id: string) =>
  api
    .post(`/super-admin/tenants/${id}/restore`, {
      confirmation: SUPER_ADMIN_CONFIRMATION,
    })
    .then((r) => r.data);

export const deleteTenantStaff = (restaurantId: string, userId: string) =>
  api
    .delete(`/super-admin/tenants/${restaurantId}/staff/${userId}`, {
      data: { confirmation: SUPER_ADMIN_CONFIRMATION },
    })
    .then((r) => r.data);

export const importMenuForTenant = (id: string, dto: object) =>
  api.post(`/super-admin/tenants/${id}/menu/import`, dto).then((r) => r.data);

export const resetTenantOwnerPassword = (id: string, password: string) =>
  api
    .patch(`/super-admin/tenants/${id}/reset-password`, {
      password,
      confirmation: SUPER_ADMIN_CONFIRMATION,
    })
    .then((r) => r.data);

export const updateTenantPayments = (id: string, paymentsEnabled: boolean) =>
  api
    .patch(`/super-admin/tenants/${id}/payments`, {
      paymentsEnabled,
      confirmation: SUPER_ADMIN_CONFIRMATION,
    })
    .then((r) => r.data);

// ── GDPR / Legal helpers ─────────────────────────────────────────────────────

export const getPublicLegalSettings = () =>
  api.get("/platform-settings/public").then((r) => r.data);

export const getAdminLegalSettings = () =>
  api.get("/super-admin/platform-settings").then((r) => r.data);

export const updateAdminLegalSettings = (patch: Record<string, unknown>) =>
  api.patch("/super-admin/platform-settings", patch).then((r) => r.data);

export const postConsent = (payload: {
  restaurantId?: string;
  visitorId: string;
  category: "ANALYTICS" | "MARKETING";
  granted: boolean;
  policyVersion: number;
}) => api.post("/consent", payload).then((r) => r.data);

export const exportUserData = () =>
  api.get("/users/me/export").then((r) => r.data);

export const deleteUserAccount = () =>
  api.delete("/users/me/delete").then((r) => r.data);

// ── Help Content ──────────────────────────────────────────────────────────────

export interface HelpContentItem {
  id: string;
  section: "landing" | "dashboard";
  categoryKey: string;
  itemKey: string;
  sortOrder: number;
  locale: "en" | "bg" | "ro";
  title: string;
  body: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export const getHelpContent = (
  section: "landing" | "dashboard",
  locale?: string,
) =>
  api
    .get(`/help-content/${section}`, {
      params: locale ? { locale } : undefined,
    })
    .then((r) => r.data as HelpContentItem[]);

export const getAdminHelpContent = (section: string) =>
  api
    .get("/super-admin/help-content", { params: { section } })
    .then((r) => r.data as HelpContentItem[]);

export const createHelpContent = (dto: {
  section: string;
  categoryKey: string;
  itemKey: string;
  sortOrder?: number;
  locale: string;
  title: string;
  body: string;
  active?: boolean;
}) =>
  api
    .post("/super-admin/help-content", dto)
    .then((r) => r.data as HelpContentItem);

export const updateHelpContent = (
  id: string,
  dto: { title?: string; body?: string; sortOrder?: number; active?: boolean },
) =>
  api
    .patch(`/super-admin/help-content/${id}`, dto)
    .then((r) => r.data as HelpContentItem);

export const deleteHelpContent = (id: string) =>
  api.delete(`/super-admin/help-content/${id}`).then((r) => r.data);

export const reorderHelpContent = (
  items: { id: string; sortOrder: number }[],
) =>
  api.patch("/super-admin/help-content/reorder", { items }).then((r) => r.data);

export const recordMenuView = (
  restaurantId: string,
  data: { table?: string | null; visitorId?: string },
): void => {
  api
    .post(`/menu/public/${restaurantId}/view`, {
      table: data.table ?? undefined,
      visitorId: data.visitorId,
    })
    .catch(() => undefined);
};

export interface ScanStats {
  totalViews: number;
  uniqueVisitors: number;
  todayViews: number;
  perTable: Array<{ tableName: string; views: number; uniqueVisitors: number }>;
}

export const getScanStats = (
  restaurantId: string,
  period: number,
  startDate?: string,
  endDate?: string,
): Promise<ScanStats> =>
  api
    .get(`/dashboard/scan-stats/${restaurantId}`, {
      params: startDate && endDate ? { startDate, endDate } : { period },
    })
    .then((r) => r.data as ScanStats);

// ─── Print Stations ───────────────────────────────────────────────────────────

export const getPrintStations = (restaurantId?: string) =>
  api.get("/print-stations", { params: { restaurantId } }).then((r) => r.data);

export const getPrintStationHealth = (restaurantId?: string) =>
  api
    .get("/print-stations/health", { params: { restaurantId } })
    .then((r) => r.data);

export const createPrintStation = (
  restaurantId: string | undefined,
  data: {
    name: string;
    printerIp: string;
    printerPort?: number;
  },
) =>
  api
    .post("/print-stations", data, { params: { restaurantId } })
    .then((r) => r.data);

export const updatePrintStation = (
  restaurantId: string | undefined,
  id: string,
  data: Partial<{
    name: string;
    printerIp: string;
    printerPort: number;
    isActive: boolean;
    receiptTemplate?: Record<string, unknown>;
  }>,
) =>
  api
    .patch(`/print-stations/${id}`, data, { params: { restaurantId } })
    .then((r) => r.data);

export const deletePrintStation = (
  restaurantId: string | undefined,
  id: string,
) =>
  api
    .delete(`/print-stations/${id}`, { params: { restaurantId } })
    .then((r) => r.data);

export const generateAgentToken = (
  restaurantId: string | undefined,
  stationId: string,
  label?: string,
) =>
  api
    .post(
      `/print-stations/${stationId}/tokens`,
      { label },
      {
        params: { restaurantId },
      },
    )
    .then((r) => r.data);

export const revokeAgentToken = (
  restaurantId: string | undefined,
  tokenId: string,
) =>
  api
    .delete(`/print-stations/tokens/${tokenId}`, {
      params: { restaurantId },
    })
    .then((r) => r.data);

// ── Super-admin: tenant ops ───────────────────────────────────────────────────
export const superAdminForceLogout = (id: string) =>
  api
    .post(`/super-admin/tenants/${id}/force-logout`, {
      confirmation: "CONFIRM",
    })
    .then((r) => r.data);

export const superAdminRegenerateApiKey = (id: string) =>
  api
    .post(`/super-admin/tenants/${id}/regenerate-api-key`, {
      confirmation: "CONFIRM",
    })
    .then((r) => r.data);

export const superAdminImpersonate = (id: string) =>
  api
    .post(`/super-admin/tenants/${id}/impersonate`, {
      confirmation: "CONFIRM",
    })
    .then((r) => r.data);

// ── Super-admin: payment sessions ────────────────────────────────────────────
export const superAdminGetSessions = (id: string, page = 1, limit = 20) =>
  api
    .get(`/super-admin/tenants/${id}/sessions`, { params: { page, limit } })
    .then((r) => r.data);

export const superAdminForceCloseSession = (
  tenantId: string,
  sessionId: string,
) =>
  api
    .delete(`/super-admin/tenants/${tenantId}/sessions/${sessionId}`, {
      data: { confirmation: "CONFIRM" },
    })
    .then((r) => r.data);

// ── Super-admin: loyalty ──────────────────────────────────────────────────────
export const superAdminGetLoyalty = (id: string) =>
  api.get(`/super-admin/tenants/${id}/loyalty`).then((r) => r.data);

export const superAdminAdjustLoyalty = (
  id: string,
  loyaltyAccountId: string,
  delta: number,
  note?: string,
) =>
  api
    .post(`/super-admin/tenants/${id}/loyalty/adjust`, {
      loyaltyAccountId,
      delta,
      note,
    })
    .then((r) => r.data);

export const superAdminClearLoyalty = (id: string, loyaltyAccountId: string) =>
  api
    .post(`/super-admin/tenants/${id}/loyalty/clear`, { loyaltyAccountId })
    .then((r) => r.data);

// ── Super-admin: MRR ─────────────────────────────────────────────────────────
export const superAdminGetMrr = () =>
  api.get("/super-admin/mrr").then((r) => r.data);

// ── Super-admin: GDPR data requests ──────────────────────────────────────────
export const superAdminGetDataRequests = (params?: {
  page?: number;
  limit?: number;
  status?: string;
  type?: string;
}) => api.get("/super-admin/data-requests", { params }).then((r) => r.data);

export const superAdminUpdateDataRequest = (
  id: string,
  patch: {
    status?: string;
    notes?: string;
    downloadUrl?: string;
    confirmation?: "CONFIRM";
  },
) => api.patch(`/super-admin/data-requests/${id}`, patch).then((r) => r.data);

// ── Impersonation exchange (public — no auth required) ────────────────────────
export const exchangeImpersonation = (code: string) =>
  api.post("/auth/impersonate/exchange", { code }).then((r) => r.data);

export const exitImpersonation = () =>
  api.post("/auth/impersonate/exit").then((r) => r.data);

// ── Reservations ───────────────────────────────────────────────────────────
// Public (unauthenticated) booking surface.
export const getReservationConfig = (restaurantId: string) =>
  api.get(`/reservations/public/${restaurantId}/config`).then((r) => r.data);

export const getReservationAvailability = (
  restaurantId: string,
  date: string,
  adults: number,
  children: number,
) =>
  api
    .get(`/reservations/public/${restaurantId}/availability`, {
      params: { date, adults, children },
    })
    .then((r) => r.data);

export const createReservation = (restaurantId: string, input: any) =>
  api.post(`/reservations/public/${restaurantId}`, input).then((r) => r.data);

// ── Guest self-service via private manage link (Feature 2) ────────────────
export const getManageReservation = (restaurantId: string, token: string) =>
  api
    .get(
      `/reservations/public/${restaurantId}/manage/${encodeURIComponent(token)}`,
    )
    .then((r) => r.data);

export const cancelManageReservation = (restaurantId: string, token: string) =>
  api
    .post(
      `/reservations/public/${restaurantId}/manage/${encodeURIComponent(
        token,
      )}/cancel`,
    )
    .then((r) => r.data);

export const modifyManageReservation = (
  restaurantId: string,
  token: string,
  body: { startsAt?: string; adultsCount?: number; childrenCount?: number },
) =>
  api
    .post(
      `/reservations/public/${restaurantId}/manage/${encodeURIComponent(
        token,
      )}/modify`,
      body,
    )
    .then((r) => r.data);

export const getReservationStatus = (
  restaurantId: string,
  referenceCode: string,
) =>
  api
    .get(`/reservations/public/${restaurantId}/status/${referenceCode}`)
    .then((r) => r.data);

// Dashboard (authenticated) surface.
export const listReservations = (
  restaurantId: string,
  params: { date?: string; status?: string; upcoming?: string } = {},
) => api.get(`/reservations/${restaurantId}`, { params }).then((r) => r.data);

export const getReservationSettings = (restaurantId: string) =>
  api.get(`/reservations/${restaurantId}/settings`).then((r) => r.data);

export const updateReservationSettings = (
  restaurantId: string,
  data: Record<string, unknown>,
) =>
  api.put(`/reservations/${restaurantId}/settings`, data).then((r) => r.data);

export const setReservationServiceHours = (
  restaurantId: string,
  rows: { weekday: number; openMinute: number; lastSlotMinute: number }[],
) =>
  api
    .post(`/reservations/${restaurantId}/service-hours`, { rows })
    .then((r) => r.data);

export const deleteReservationServiceHours = (
  restaurantId: string,
  weekday: number,
) =>
  api
    .delete(`/reservations/${restaurantId}/service-hours/${weekday}`)
    .then((r) => r.data);

// ── Analytics (Feature 6) ────────────────────────────────────────────────
export const getReservationAnalytics = (restaurantId: string) =>
  api.get(`/reservations/${restaurantId}/analytics`).then((r) => r.data);

// ── Blackout days (Feature 5) ────────────────────────────────────────────
export const listReservationBlackouts = (restaurantId: string) =>
  api.get(`/reservations/${restaurantId}/blackouts`).then((r) => r.data);

export const addReservationBlackout = (
  restaurantId: string,
  date: string,
  reason?: string,
) =>
  api
    .post(`/reservations/${restaurantId}/blackouts`, { date, reason })
    .then((r) => r.data);

export const removeReservationBlackout = (restaurantId: string, date: string) =>
  api
    .delete(`/reservations/${restaurantId}/blackouts/${date}`)
    .then((r) => r.data);

export interface ManualReservationInput {
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
  localStartsAt: string;
  adultsCount: number;
  childrenCount?: number;
  customerNotes?: string;
  internalNotes?: string;
  staffTags?: string[];
}

export const createManualReservation = (
  restaurantId: string,
  input: ManualReservationInput,
) =>
  api.post(`/reservations/${restaurantId}/manual`, input).then((r) => r.data);

export const reservationAction = (
  reservationId: string,
  restaurantId: string,
  action: string,
  reason?: string,
) =>
  api
    .post(`/reservations/action/${reservationId}`, {
      restaurantId,
      action,
      reason,
    })
    .then((r) => r.data);

export const updateReservationInternal = (
  reservationId: string,
  restaurantId: string,
  data: { internalNotes?: string; staffTags?: string[] },
) =>
  api
    .patch(`/reservations/internal/${reservationId}`, {
      restaurantId,
      ...data,
    })
    .then((r) => r.data);

export default api;
