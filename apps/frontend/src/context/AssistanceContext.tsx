import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  useEffect,
  ReactNode,
} from "react";
import {
  getAssistanceRequests,
  updateAssistanceRequest as apiUpdateAssistanceRequest,
} from "../lib/api";
import { useSocket } from "./SocketContext";
import { useAuth } from "./AuthContext";
import { useRestaurantContext } from "./RestaurantContext";

const ACTIVE_PAGE_SIZE = 100;
const RESOLVED_PAGE_SIZE = 50;

interface AssistancePage {
  data: AssistanceRequest[];
  total: number;
  page: number;
  totalPages: number;
}

// Define assistance request interface
interface AssistanceRequest {
  id: string;
  tableId: string;
  isResolved: boolean;
  type?: "STANDARD" | "URGENT" | "CASH_PAYMENT";
  createdAt: string;
  updatedAt: string;
}

// Define context type
interface AssistanceContextType {
  requests: AssistanceRequest[];
  refreshRequests: () => Promise<void>;
  markAsResolved: (requestId: string) => Promise<void>;
  markAsUnresolved: (requestId: string) => Promise<void>;
  loadMoreResolved: () => Promise<void>;
  hasMoreResolved: boolean;
  isLoading: boolean;
  isLoadingMoreResolved: boolean;
  error: string | null;
}

// Create the context
const AssistanceContext = createContext<AssistanceContextType | undefined>(
  undefined,
);

// Create the provider component
export function AssistanceProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState<AssistanceRequest[]>([]);
  const [resolvedPage, setResolvedPage] = useState(1);
  const [resolvedTotalPages, setResolvedTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMoreResolved, setIsLoadingMoreResolved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const { socket, isConnected } = useSocket();
  const { user, isAuthenticated } = useAuth();
  const { activeRestaurant } = useRestaurantContext();
  const role = user?.role?.toUpperCase();
  const canAccessAssistance =
    isAuthenticated &&
    !!role &&
    ["OWNER", "MANAGER", "WAITER", "KITCHEN", "STAFF"].includes(role);

  // Function to refresh requests from API
  const refreshRequests = useCallback(async () => {
    const restaurantId = activeRestaurant?.id;
    const version = ++requestVersion.current;
    if (!canAccessAssistance || !restaurantId) {
      setRequests([]);
      setError(null);
      setIsLoading(false);
      setIsLoadingMoreResolved(false);
      setResolvedPage(1);
      setResolvedTotalPages(1);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const active: AssistanceRequest[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const response = (await getAssistanceRequests({
          restaurantId,
          isResolved: false,
          page,
          limit: ACTIVE_PAGE_SIZE,
        })) as AssistancePage;
        active.push(...response.data);
        totalPages = response.totalPages;
        page += 1;
      } while (page <= totalPages);

      const resolved = (await getAssistanceRequests({
        restaurantId,
        isResolved: true,
        page: 1,
        limit: RESOLVED_PAGE_SIZE,
      })) as AssistancePage;

      if (requestVersion.current !== version) return;
      setRequests([...active, ...resolved.data]);
      setResolvedPage(1);
      setResolvedTotalPages(resolved.totalPages);
    } catch (error) {
      console.error("Failed to fetch assistance requests:", error);
      if (requestVersion.current === version) {
        setError("assistance.fetchFailed");
      }
    } finally {
      if (requestVersion.current === version) setIsLoading(false);
    }
  }, [activeRestaurant?.id, canAccessAssistance]);

  const loadMoreResolved = useCallback(async () => {
    const restaurantId = activeRestaurant?.id;
    const version = requestVersion.current;
    if (
      !restaurantId ||
      isLoadingMoreResolved ||
      resolvedPage >= resolvedTotalPages
    ) {
      return;
    }

    setIsLoadingMoreResolved(true);
    setError(null);
    try {
      const nextPage = resolvedPage + 1;
      const response = (await getAssistanceRequests({
        restaurantId,
        isResolved: true,
        page: nextPage,
        limit: RESOLVED_PAGE_SIZE,
      })) as AssistancePage;
      if (requestVersion.current !== version) return;
      setRequests((current) => {
        const seen = new Set(current.map((request) => request.id));
        return [
          ...current,
          ...response.data.filter((request) => !seen.has(request.id)),
        ];
      });
      setResolvedPage(nextPage);
      setResolvedTotalPages(response.totalPages);
    } catch (error) {
      console.error("Failed to fetch resolved assistance requests:", error);
      if (requestVersion.current === version) {
        setError("assistance.fetchMoreFailed");
      }
    } finally {
      if (requestVersion.current === version) setIsLoadingMoreResolved(false);
    }
  }, [
    activeRestaurant?.id,
    isLoadingMoreResolved,
    resolvedPage,
    resolvedTotalPages,
  ]);

  // Function to mark request as resolved
  const markAsResolved = async (requestId: string) => {
    try {
      await apiUpdateAssistanceRequest(requestId, { isResolved: true });
      await refreshRequests();
    } catch (error) {
      console.error("Failed to mark request as resolved:", error);
      throw error;
    }
  };

  // Function to mark request as unresolved (for re-opening)
  const markAsUnresolved = async (requestId: string) => {
    try {
      await apiUpdateAssistanceRequest(requestId, { isResolved: false });
      await refreshRequests();
    } catch (error) {
      console.error("Failed to mark request as unresolved:", error);
      throw error;
    }
  };

  // Initial load when a staff/owner session becomes available.
  useEffect(() => {
    setRequests([]);
    void refreshRequests();
  }, [activeRestaurant?.id, refreshRequests]);

  // Socket listeners only refresh in response to assistance events.
  useEffect(() => {
    if (!canAccessAssistance || !socket || !isConnected) return;

    const handleNewRequest = () => {
      // Audio notification for call waiter
      const audio = new Audio("/notification.mp3");
      audio.play().catch(() => {});

      refreshRequests();
    };

    const handleStatusChanged = () => {
      refreshRequests();
    };

    socket.on("newAssistanceRequest", handleNewRequest);
    socket.on("assistanceStatusChanged", handleStatusChanged);
    socket.on("cashPaymentRequest:created", handleNewRequest);
    socket.on("cashPaymentRequest:updated", handleStatusChanged);

    return () => {
      socket.off("newAssistanceRequest", handleNewRequest);
      socket.off("assistanceStatusChanged", handleStatusChanged);
      socket.off("cashPaymentRequest:created", handleNewRequest);
      socket.off("cashPaymentRequest:updated", handleStatusChanged);
    };
  }, [canAccessAssistance, socket, isConnected, refreshRequests]);

  const value = {
    requests,
    refreshRequests,
    markAsResolved,
    markAsUnresolved,
    loadMoreResolved,
    hasMoreResolved: resolvedPage < resolvedTotalPages,
    isLoading,
    isLoadingMoreResolved,
    error,
  };

  return (
    <AssistanceContext.Provider value={value}>
      {children}
    </AssistanceContext.Provider>
  );
}

// Custom hook for easier access to assistance context
export function useAssistance() {
  const context = useContext(AssistanceContext);
  if (context === undefined) {
    throw new Error("useAssistance must be used within an AssistanceProvider");
  }
  return context;
}
