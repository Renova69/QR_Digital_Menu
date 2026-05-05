import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  getAssistanceRequests,
  updateAssistanceRequest as apiUpdateAssistanceRequest
} from '../lib/api';
import { useSocket } from './SocketContext';

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

  // Function to refresh requests from API
  const refreshRequests = async () => {
    try {
      const data = await getAssistanceRequests();
      setRequests(data);
    } catch (error) {
      console.error('Failed to fetch assistance requests:', error);
    }
  };

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

  // Initial load and socket listeners
  useEffect(() => {
    refreshRequests();

    if (!socket || !isConnected) return;

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
  }, [socket, isConnected]);

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
