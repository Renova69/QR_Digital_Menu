import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  login as apiLogin,
  register as apiRegister,
  verifyRegistration as apiVerifyRegistration,
} from "../lib/api";
import api from "../lib/api";
import { isPosTransportFailure } from "../lib/posOfflineOrders";
import {
  clearOfflineShift,
  loadOfflineStaff,
  saveOfflineStaff,
} from "../lib/posOfflineShift";

interface User {
  id: string;
  email: string;
  name?: string;
  role: string;
  restaurantId?: string;
  onboardingComplete?: boolean;
  isImpersonation?: boolean;
  impersonationSessionId?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<any>;
  register: (email: string, password: string, name?: string) => Promise<any>;
  verifyRegistration: (
    email: string,
    password: string,
    code: string,
  ) => Promise<any>;
  loginWithToken: (user: User) => void;
  updateUser: (user: User) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
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
  const [prefetchedRestaurants, setPrefetchedRestaurants] = useState<
    any[] | null
  >(null);

  const clearPrefetch = () => setPrefetchedRestaurants(null);
  const queryClient = useQueryClient();

  // Prevents initializeAuth from overwriting a user set by loginWithToken or logout
  // when the /auth/me request was in-flight before the manual auth action completed.
  const manualAuthRef = useRef(false);

  useEffect(() => {
    // Guard against setState after unmount: if the provider is torn down while
    // /auth/me (or /restaurants) is still in flight, the settling promise must
    // not schedule a React update — otherwise it throws post-teardown (e.g.
    // "window is not defined" under jsdom, which fails the test run).
    let active = true;
    const initializeAuth = async () => {
      try {
        // Fetch /auth/me first to verify authentication
        const meResult = await api.get("/auth/me");
        if (!active) return;

        // A login or logout occurred while /auth/me was in-flight — don't overwrite.
        if (manualAuthRef.current) {
          setIsLoading(false);
          return;
        }

        const userData = meResult.data;
        setUser(userData);
        if (userData) saveOfflineStaff(userData);
        else clearOfflineShift();

        // Only fetch restaurants if the user is authenticated, avoiding 401 errors
        if (userData) {
          try {
            const restaurantsResult = await api.get("/restaurants");
            if (!active) return;
            setPrefetchedRestaurants(restaurantsResult.data);
          } catch (err) {
            // It's safe to let the logger catch this if it fails despite auth
            if (!active) return;
            setPrefetchedRestaurants(null);
          }
        }
      } catch (error) {
        // Not authenticated
        if (!active) return;
        if (manualAuthRef.current) {
          setIsLoading(false);
          return;
        }
        if (isPosTransportFailure(error)) {
          const offlineStaff = loadOfflineStaff();
          if (offlineStaff) {
            setUser(offlineStaff);
            setPrefetchedRestaurants(null);
            return;
          }
        }
        clearOfflineShift();
        setUser(null);
        setPrefetchedRestaurants(null);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    initializeAuth();
    return () => {
      active = false;
    };
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
      saveOfflineStaff(user);
      return { user };
    } catch (error: any) {
      setIsError(true);
      const msg =
        error.response?.data?.message ||
        t("auto.loginFailed", "Login failed. Please check your credentials.");
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
      saveOfflineStaff(user);
      return { user };
    } catch (error: any) {
      setIsError(true);
      const msg =
        error.response?.data?.message ||
        t("auto.registrationFailed", "Registration failed. Please try again.");
      setErrorMessage(msg);
      throw error;
    }
  };

  const verifyRegistration = async (
    email: string,
    password: string,
    code: string,
  ) => {
    try {
      setIsError(false);
      setErrorMessage(null);
      const { user } = await apiVerifyRegistration(email, password, code);
      queryClient.clear();
      setPrefetchedRestaurants(null);
      setUser(user);
      saveOfflineStaff(user);
      return { user };
    } catch (error: any) {
      setIsError(true);
      const msg =
        error.response?.data?.message ||
        t(
          "auto.verificationFailed",
          "Verification failed. Please check the code.",
        );
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
    saveOfflineStaff(user);
  };

  const updateUser = (user: User) => {
    setUser(user);
    saveOfflineStaff(user);
  };

  const refreshUser = async () => {
    const res = await api.get("/auth/me");
    setUser(res.data);
    if (res.data) saveOfflineStaff(res.data);
    else clearOfflineShift();
  };

  const logout = async () => {
    manualAuthRef.current = true;
    try {
      await api.post("/auth/logout");
    } catch (_error) {
      // Cookie cleared server-side regardless
    }
    queryClient.clear();
    localStorage.removeItem("cartItems");
    localStorage.removeItem("tableNumber");
    sessionStorage.removeItem("cartRestaurantId");
    clearOfflineShift();
    // Clear POS draft so a different staff member on a shared device cannot
    // inherit the previous waiter's open-table session/items (H2).
    sessionStorage.removeItem("posCartDraft");
    setUser(null);
    setPrefetchedRestaurants(null);
  };

  useEffect(() => {
    if (user && user.role !== "customer") {
      import("../utils/pushSubscription")
        .then(({ subscribeToPushNotifications }) => {
          subscribeToPushNotifications();
        })
        .catch((err) => {
          console.error("Failed to load push subscription utility:", err);
        });
    }
  }, [user]);

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    login,
    register,
    verifyRegistration,
    loginWithToken,
    updateUser,
    logout,
    refreshUser,
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
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
