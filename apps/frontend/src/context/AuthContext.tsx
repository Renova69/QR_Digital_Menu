import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { login as apiLogin, register as apiRegister, verifyRegistration as apiVerifyRegistration } from '../lib/api';
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
  verifyRegistration: (email: string, password: string, code: string) => Promise<any>;
  loginWithToken: (user: User) => void;
  updateUser: (user: User) => void;
  logout: () => Promise<void>;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  prefetchedRestaurants: any[] | null;
  clearPrefetch: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [prefetchedRestaurants, setPrefetchedRestaurants] = useState<any[] | null>(null);

  const clearPrefetch = () => setPrefetchedRestaurants(null);
  const queryClient = useQueryClient();

  // Prevents initializeAuth from overwriting a user set by loginWithToken or logout
  // when the /auth/me request was in-flight before the manual auth action completed.
  const manualAuthRef = useRef(false);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Fetch /auth/me first to verify authentication
        const meResult = await api.get('/auth/me');
        
        // A login or logout occurred while /auth/me was in-flight — don't overwrite.
        if (manualAuthRef.current) {
          setIsLoading(false);
          return;
        }

        const userData = meResult.data;
        setUser(userData);

        // Only fetch restaurants if the user is authenticated, avoiding 401 errors
        if (userData) {
          try {
            const restaurantsResult = await api.get('/restaurants');
            setPrefetchedRestaurants(restaurantsResult.data);
          } catch (err) {
            // It's safe to let the logger catch this if it fails despite auth
            setPrefetchedRestaurants(null);
          }
        }
      } catch (error) {
        // Not authenticated
        if (manualAuthRef.current) {
          setIsLoading(false);
          return;
        }
        setUser(null);
        setPrefetchedRestaurants(null);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      setIsError(false);
      setErrorMessage(null);
      const { user } = await apiLogin(email, password);
      queryClient.clear();
      // Auth rides the httpOnly cookie set by the login response (#F1).
      // Clear stale prefetch from previous session before setting new user
      setPrefetchedRestaurants(null);
      setUser(user);
      return { user };
    } catch (error: any) {
      setIsError(true);
      const msg =
        error.response?.data?.message ||
        t('auto.loginFailed', 'Login failed. Please check your credentials.');
      setErrorMessage(msg);
      throw error;
    }
  };

  const register = async (email: string, password: string, name?: string) => {
    try {
      setIsError(false);
      setErrorMessage(null);
      const result = await apiRegister(email, password, name);
      if (result.requiresVerification) {
        return result;
      }
      const { user } = result;
      queryClient.clear();
      // Auth rides the httpOnly cookie set by the register response (#F1).
      // Clear stale prefetch from previous session before setting new user
      setPrefetchedRestaurants(null);
      setUser(user);
      return { user };
    } catch (error: any) {
      setIsError(true);
      const msg =
        error.response?.data?.message ||
        t('auto.registrationFailed', 'Registration failed. Please try again.');
      setErrorMessage(msg);
      throw error;
    }
  };

  const verifyRegistration = async (email: string, password: string, code: string) => {
    try {
      setIsError(false);
      setErrorMessage(null);
      const { user } = await apiVerifyRegistration(email, password, code);
      queryClient.clear();
      setPrefetchedRestaurants(null);
      setUser(user);
      return { user };
    } catch (error: any) {
      setIsError(true);
      const msg =
        error.response?.data?.message ||
        t('auto.verificationFailed', 'Verification failed. Please check the code.');
      setErrorMessage(msg);
      throw error;
    }
  };

  const loginWithToken = (user: User) => {
    // Auth rides the httpOnly cookie set by the issuing endpoint (#F1);
    // we only need to adopt the user into context here.
    manualAuthRef.current = true;
    setIsLoading(false);
    queryClient.clear();
    setPrefetchedRestaurants(null);
    setUser(user);
  };

  const updateUser = (user: User) => setUser(user);

  const logout = async () => {
    manualAuthRef.current = true;
    try {
      await api.post('/auth/logout');
    } catch (_error) {
      // Cookie cleared server-side regardless
    }
    queryClient.clear();
    localStorage.removeItem('cartItems');
    localStorage.removeItem('tableNumber');
    sessionStorage.removeItem('cartRestaurantId');
    // Clear POS draft so a different staff member on a shared device cannot
    // inherit the previous waiter's open-table session/items (H2).
    sessionStorage.removeItem('posCartDraft');
    setUser(null);
    setPrefetchedRestaurants(null);
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    login,
    register,
    verifyRegistration,
    loginWithToken,
    updateUser,
    logout,
    isLoading,
    isError,
    errorMessage,
    prefetchedRestaurants,
    clearPrefetch,
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
