import {
  createContext,
  useCallback,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import {
  getAssistanceRequests,
  updateAssistanceRequest as apiUpdateAssistanceRequest
} from '../lib/api';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';

// Define assistance request interface
interface AssistanceRequest {
  id: string;
  tableId: string;
  isResolved: boolean;
  createdAt: string;
  updatedAt: string;
}

// Define context type
interface AssistanceContextType {
  requests: AssistanceRequest[];
  refreshRequests: () => Promise<void>;
  markAsResolved: (requestId: string) => Promise<void>;
  markAsUnresolved: (requestId: string) => Promise<void>;
}

// Create the context
const AssistanceContext = createContext<AssistanceContextType | undefined>(undefined);

// Create the provider component
export function AssistanceProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState<AssistanceRequest[]>([]);
  const { socket, isConnected } = useSocket();
  const { user, isAuthenticated } = useAuth();
  const role = user?.role?.toUpperCase();
  const canAccessAssistance =
    isAuthenticated &&
    !!role &&
    ['OWNER', 'MANAGER', 'WAITER', 'KITCHEN', 'STAFF'].includes(role);

  // Function to refresh requests from API
  const refreshRequests = useCallback(async () => {
    if (!canAccessAssistance) {
      setRequests([]);
      return;
    }

    try {
      const data = await getAssistanceRequests();
      setRequests(data);
    } catch (error) {
      console.error('Failed to fetch assistance requests:', error);
    }
  }, [canAccessAssistance]);

  // Function to mark request as resolved
  const markAsResolved = async (requestId: string) => {
    try {
      await apiUpdateAssistanceRequest(requestId, { isResolved: true });
      await refreshRequests();
    } catch (error) {
      console.error('Failed to mark request as resolved:', error);
      throw error;
    }
  };

  // Function to mark request as unresolved (for re-opening)
  const markAsUnresolved = async (requestId: string) => {
    try {
      await apiUpdateAssistanceRequest(requestId, { isResolved: false });
      await refreshRequests();
    } catch (error) {
      console.error('Failed to mark request as unresolved:', error);
      throw error;
    }
  };

  // Initial load when a staff/owner session becomes available.
  useEffect(() => {
    void refreshRequests();
  }, [refreshRequests]);

  // Socket listeners only refresh in response to assistance events.
  useEffect(() => {
    if (!canAccessAssistance || !socket || !isConnected) return;

    const handleNewRequest = () => {
      // Audio notification for call waiter
      const audio = new Audio('/notification.mp3');
      audio.play().catch(() => {});
      
      refreshRequests();
    };

    const handleStatusChanged = () => {
      refreshRequests();
    };

    socket.on('newAssistanceRequest', handleNewRequest);
    socket.on('assistanceStatusChanged', handleStatusChanged);

    return () => {
      socket.off('newAssistanceRequest', handleNewRequest);
      socket.off('assistanceStatusChanged', handleStatusChanged);
    };
  }, [canAccessAssistance, socket, isConnected, refreshRequests]);

  const value = {
      requests,
      refreshRequests,
      markAsResolved,
      markAsUnresolved,
  }

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
    throw new Error('useAssistance must be used within an AssistanceProvider');
  }
  return context;
}
