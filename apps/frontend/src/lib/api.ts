import axios from 'axios';

// Module-level token store — AuthContext writes, interceptor reads.
// Provides dual auth: httpOnly cookie (primary) + Bearer header (fallback for cross-origin POST).
let authToken: string | null = null;
export const setAuthToken = (token: string | null) => {
  authToken = token;
};

// Dev: relative /api/v1 (Vite proxy). Production: absolute backend URL from VITE_API_URL.
// httpOnly cookies won't work cross-origin — fallback to Bearer token (set via AuthContext).
const API_URL =
  typeof window !== 'undefined' &&
  window.location.hostname !== 'localhost' &&
  import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL + '/v1'
    : '/api/v1';

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

export const getCurrentUser = async () => {
    const response = await api.get('/auth/me');
    return response.data;
}

export const callWaiter = async (restaurantId: string, table: string) => {
    const response = await api.post('/assistance', { restaurantId, table });
    return response.data;
}

export const createOrder = async (orderData: any) => {
    const response = await api.post('/orders', orderData);
    return response.data;
}

export const getOrders = async () => {
    const response = await api.get('/orders');
    // Unwrap paginated response — { data, total, page, totalPages } → array
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

export const createAssistanceRequest = async (tableId: string, restaurantId: string) => {
    const response = await api.post('/assistance-requests', { tableId, restaurantId });
    return response.data;
}

// Restaurants / Settings
export const updateRestaurant = async (restaurantId: string, data: any) => {
  const response = await api.patch(`/restaurants/${restaurantId}`, data);
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

export const createTable = async (restaurantId: string, name: string) => {
  const response = await api.post(`/restaurants/${restaurantId}/tables`, { name });
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
    items: Array<{ name: string; quantity: number }>;
  }>;
};

export const getTableStatuses = async (restaurantId: string) => {
  const response = await api.get(`/tables/status/${restaurantId}`);
  return response.data as Array<{
    id: string;
    name: string;
    status: 'empty' | 'occupied' | 'paid' | 'waiting';
    sessionId: string | null;
    orderCount: number;
    totalAmount: number;
    customerNames: string[];
    sessionStatus: string | null;
    updatedAt: string;
  }>;
};

// Analytics
export const getAnalytics = async (restaurantId: string, period: number, startDate?: string, endDate?: string) => {
  const response = await api.get('/dashboard/analytics', {
    params: { restaurantId, period, ...(startDate && { startDate }), ...(endDate && { endDate }) },
  });
  return response.data;
};

export const getPaymentHistory = (
  restaurantId: string,
  params?: { status?: string; startDate?: string; endDate?: string; page?: number; limit?: number },
) =>
  api
    .get(`/payments/history/${restaurantId}`, { params })
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
const fetchCsrfToken = async () => {
  try {
    const res = await fetch(`${API_URL}/auth/csrf-token`, { credentials: 'include' });
    const data = await res.json();
    csrfToken = data?.csrfToken ?? null;
  } catch {
    csrfToken = null;
  }
};

api.interceptors.request.use(async (config) => {
  // Bearer token — dual auth alongside httpOnly cookie
  if (authToken) {
    config.headers['Authorization'] = `Bearer ${authToken}`;
  }
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
    if (error.response?.status === 401) {
      // Never redirect for /auth/me — AuthContext handles auth check failures itself
      const requestUrl = error.config?.url || '';
      if (
        requestUrl.endsWith('/auth/me') ||
        requestUrl.endsWith('/auth/pin-login')
      ) {
        return Promise.reject(error);
      }
      const publicPaths = ['/login', '/register', '/auth/callback', '/menu/public', '/device-login'];
      const currentPath = window.location.pathname;
      if (!publicPaths.some(p => currentPath.startsWith(p))) {
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

export const getSessionBill = async (token: string) => {
  const response = await api.get(`/payments/session/${token}/bill`);
  return response.data as {
    orders: any[];
    subtotal: number;
    restaurantId: string;
    tipsEnabled: boolean;
    tipOptions: number[];
  };
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

export const generateStripeConnectLink = async (restaurantId: string) => {
  const response = await api.post(`/restaurants/${restaurantId}/stripe/connect`);
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
export const getImportApiKey = async (restaurantId: string) => {
  const response = await api.get(`/restaurants/${restaurantId}/menu/import/api-key`);
  return response.data as { apiKey: string; generated?: boolean };
};

export const revealImportApiKey = async (restaurantId: string) => {
  const response = await api.post(`/restaurants/${restaurantId}/menu/import/api-key/reveal`);
  return response.data as { apiKey: string };
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
export const listStaff = async (restaurantId: string) => {
  const response = await api.get(`/auth/restaurants/${restaurantId}/staff`);
  return response.data as Array<{ id: string; email: string; name: string | null; role: string }>;
};

export const createStaff = async (
  restaurantId: string,
  data: { name: string; email?: string; role: string },
) => {
  const response = await api.post(`/auth/restaurants/${restaurantId}/staff`, data);
  return response.data as { user: { id: string; email: string; name: string | null; role: string }; rawPin: string };
};

export const removeStaff = async (restaurantId: string, userId: string) => {
  const response = await api.delete(`/auth/restaurants/${restaurantId}/staff/${userId}`);
  return response.data;
};

export const createDeviceEnrollment = async (restaurantId: string) => {
  const response = await api.post(`/restaurants/${restaurantId}/device-enrollment`, {
    mode: 'STAFF_DEVICE',
  });
  return response.data as { enrollmentUrl: string; expiresAt: string };
};

export const verifyDeviceEnrollment = async (token: string) => {
  const response = await api.post('/device-enrollment/verify', { token });
  return response.data as {
    restaurantId: string;
    restaurantName: string;
    allowedModes: string[];
  };
};

// Subscription / SaaS billing
export const getSubscriptionStatus = async () => {
  const response = await api.get('/subscription/status');
  return response.data as {
    tier: string;
    features: string[];
    staffLimit: number;
    hasSubscription: boolean;
  };
};

export const createCheckoutSession = async (tier: string) => {
  const response = await api.post('/subscription/checkout', { tier });
  return response.data as { url: string };
};

export const createPortalSession = async () => {
  const response = await api.post('/subscription/portal');
  return response.data as { url: string };
};

// Super Admin
export const getSuperAdminStats = () =>
  api.get('/super-admin/stats').then((r) => r.data as import('../types').SuperAdminStats);

export const getSuperAdminTenants = (
  params?: { page?: number; limit?: number; search?: string; tier?: string; status?: string },
) =>
  api
    .get('/super-admin/tenants', { params })
    .then((r) => r.data as import('../types').PaginatedResponse<import('../types').TenantSummary>);

export const getSuperAdminTenant = (id: string) =>
  api.get(`/super-admin/tenants/${id}`).then((r) => r.data as import('../types').TenantDetail);

export const updateTenantTier = (id: string, forceTier: string | null) =>
  api.patch(`/super-admin/tenants/${id}/tier`, { forceTier }).then((r) => r.data);

export const updateTenantStatus = (id: string, isActive: boolean) =>
  api.patch(`/super-admin/tenants/${id}/status`, { isActive }).then((r) => r.data);

export default api;
