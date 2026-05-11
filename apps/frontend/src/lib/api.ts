import axios from 'axios';

const api = axios.create({
  baseURL: (import.meta as any).env.VITE_API_URL || 'http://localhost:3000/api',
  withCredentials: true,
});

export const getMenu = async (restaurantId: string) => {
  const response = await api.get(`/menu/public/${restaurantId}`);
  return response.data;
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
    return response.data;
}

export const updateOrderStatus = async (orderId: string, status: string) => {
    const response = await api.patch(`/orders/${orderId}/status`, { status });
    return response.data;
}

export const getAssistanceRequests = async () => {
    const response = await api.get('/assistance-requests');
    return response.data;
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

// Request interceptor — attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — handle 401 Unauthorized
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      delete api.defaults.headers.common['Authorization'];
      // Only redirect if not already on login or public pages
      const publicPaths = ['/login', '/auth/callback', '/menu/public'];
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
  return response.data as Array<{ id: string; token: string; tableId: string; status: string; createdAt: string; paidAt?: string }>;
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

// Menu Import
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

export default api;
