import {
  createContext,
  useCallback,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import { getOrders, updateOrderStatus as apiUpdateOrderStatus } from '../lib/api';
import { useSocket } from './SocketContext';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { useRestaurantContext } from './RestaurantContext';

// Define order status types
export type OrderStatus = 'NEW' | 'IN_PROGRESS' | 'SERVED' | 'CANCELED' | 'COMPLETED';

// Define order interface
interface Order {
  id: string;
  customerName: string;
  customerPhone?: string;
  tableId: string;
  tableName?: string | null;
  status: OrderStatus;
  items: Array<{
    id: string;
    menuItemId: string;
    quantity: number;
    selectedOptions: any[];
    menuItem: {
      id: string;
      name: string;
      price: number;
      description?: string;
    };
  }>;
  totalPrice: number;
  specialRequests?: string;
  source?: 'CUSTOMER' | 'POS';
  staffName?: string | null;
  staff?: {
    id: string;
    name: string | null;
    email: string;
    role: string;
  } | null;
  createdAt: string;
  updatedAt: string;
  tableSession?: {
    status: string;
  };
}

// Define context type
interface OrderContextType {
  orders: Order[];
  refreshOrders: () => Promise<void>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  batchUpdateOrderStatus: (orderIds: string[], status: OrderStatus) => Promise<void>;
}

// Create the context
const OrderContext = createContext<OrderContextType | undefined>(undefined);

// Create the provider component
export function OrderProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const { socket, isConnected } = useSocket();
  const { user, isAuthenticated } = useAuth();
  const { activeRestaurant } = useRestaurantContext();
  const queryClient = useQueryClient();
  const role = user?.role?.toUpperCase();
  const canAccessOrders =
    isAuthenticated &&
    !!role &&
    ['OWNER', 'MANAGER', 'WAITER', 'KITCHEN', 'STAFF'].includes(role);

  // Function to refresh orders from API
  const refreshOrders = useCallback(async () => {
    if (!canAccessOrders) {
      setOrders([]);
      return;
    }

    try {
      const data = await getOrders();
      setOrders(data);
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    }
  }, [canAccessOrders]);

  // Function to update order status
  const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
    try {
      await apiUpdateOrderStatus(orderId, status);
      await refreshOrders();
    } catch (error) {
      console.error('Failed to update order status:', error);
      throw error;
    }
  };

  const batchUpdateOrderStatus = async (orderIds: string[], status: OrderStatus) => {
    try {
      await Promise.all(orderIds.map((id) => apiUpdateOrderStatus(id, status)));
      await refreshOrders();
    } catch (error) {
      console.error('Failed to batch update order status:', error);
      throw error;
    }
  };

  // Initial load when a staff/owner session becomes available.
  useEffect(() => {
    void refreshOrders();
  }, [refreshOrders]);

  // Socket listeners only refresh in response to order events.
  useEffect(() => {
    const restaurantId = activeRestaurant?.id;
    if (!canAccessOrders || !socket || !isConnected || !restaurantId) return;
    socket.emit('joinRestaurantOrdersRoom', restaurantId);

    const handleNewOrder = () => {
      // Small chime for new UI event
      const audio = new Audio('/notification.mp3');
      audio.play().catch(() => {}); // Catch autoplay restrictions

      // We can either append to state or just refresh fully
      refreshOrders();
      void queryClient.invalidateQueries({ queryKey: ['analytics'] });
    };

    const handleOrderStatusChanged = () => {
       // Refresh or perfectly mutate state
       refreshOrders();
       void queryClient.invalidateQueries({ queryKey: ['analytics'] });
    };

    socket.on('newOrder', handleNewOrder);
    socket.on('orderStatusChanged', handleOrderStatusChanged);

    return () => {
      socket.off('newOrder', handleNewOrder);
      socket.off('orderStatusChanged', handleOrderStatusChanged);
      socket.emit('leaveRestaurantOrdersRoom', restaurantId);
    };
  }, [
    activeRestaurant?.id,
    canAccessOrders,
    socket,
    isConnected,
    refreshOrders,
    queryClient,
  ]);

  const value = {
      orders,
      refreshOrders,
      updateOrderStatus,
      batchUpdateOrderStatus,
  }

  return (
    <OrderContext.Provider value={value}>
      {children}
    </OrderContext.Provider>
  );
}

// Custom hook for easier access to order context
export function useOrders() {
  const context = useContext(OrderContext);
  if (context === undefined) {
    throw new Error('useOrders must be used within an OrderProvider');
  }
  return context;
}
