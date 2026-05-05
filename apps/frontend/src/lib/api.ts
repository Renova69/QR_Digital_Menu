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

// Analytics
export const getAnalytics = async (restaurantId: string, period: number, startDate?: string, endDate?: string) => {
  const response = await api.get('/dashboard/analytics', {
    params: { restaurantId, period, ...(startDate && { startDate }), ...(endDate && { endDate }) },
  });
  return response.data;
};

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

export default api;
