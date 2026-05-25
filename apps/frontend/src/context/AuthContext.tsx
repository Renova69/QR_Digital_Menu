import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { login as apiLogin, register as apiRegister, setAuthToken } from '../lib/api';
import api from '../lib/api';

interface User {
  id: string;
  email: string;
  name?: string;
  role: string;
  restaurantId?: string;
  onboardingComplete?: boolean;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<any>;
  register: (email: string, password: string, name?: string) => Promise<any>;
  loginWithToken: (user: User) => void;
  updateUser: (user: User) => void;
  logout: () => Promise<void>;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  prefetchedRestaurants: any[] | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [prefetchedRestaurants, setPrefetchedRestaurants] = useState<any[] | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const initializeAuth = async () => {
      // Fetch /auth/me and /restaurants in parallel — eliminates the sequential waterfall
      // /restaurants will 401 if not logged in; Promise.allSettled handles that safely
      const [meResult, restaurantsResult] = await Promise.allSettled([
        api.get('/auth/me'),
        api.get('/restaurants'),
      ]);

      const userData = meResult.status === 'fulfilled' ? meResult.value.data : null;
      const restaurantsData =
        restaurantsResult.status === 'fulfilled' ? restaurantsResult.value.data : null;

      // React 18 batches these automatically — single re-render
      setUser(userData);
      setPrefetchedRestaurants(restaurantsData);
      setIsLoading(false);
    };

    initializeAuth();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      setIsError(false);
      setErrorMessage(null);
      const { user, token } = await apiLogin(email, password);
      queryClient.clear();
      if (token) setAuthToken(token);
      setUser(user);
      return { user };
    } catch (error: any) {
      setIsError(true);
      const msg = error.response?.data?.message || 'Login failed. Please check your credentials.';
      setErrorMessage(msg);
      throw error;
    }
  };

  const register = async (email: string, password: string, name?: string) => {
    try {
      setIsError(false);
      setErrorMessage(null);
      const { user, token } = await apiRegister(email, password, name);
      queryClient.clear();
      if (token) setAuthToken(token);
      setUser(user);
      return { user };
    } catch (error: any) {
      setIsError(true);
      const msg = error.response?.data?.message || 'Registration failed. Please try again.';
      setErrorMessage(msg);
      throw error;
    }
  };

  const loginWithToken = (user: User) => {
    queryClient.clear();
    setUser(user);
  };

  const updateUser = (user: User) => setUser(user);

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (_error) {
      // Cookie cleared server-side regardless
    }
    setAuthToken(null);
    queryClient.clear();
    localStorage.removeItem('cartItems');
    localStorage.removeItem('tableNumber');
    sessionStorage.removeItem('cartRestaurantId');
    setUser(null);
    setPrefetchedRestaurants(null);
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    login,
    register,
    loginWithToken,
    updateUser,
    logout,
    isLoading,
    isError,
    errorMessage,
    prefetchedRestaurants,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
