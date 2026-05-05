import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getOrders, updateOrderStatus as apiUpdateOrderStatus } from '../lib/api';
import { useSocket } from './SocketContext';

// Define order status types
export type OrderStatus = 'NEW' | 'IN_PROGRESS' | 'SERVED' | 'CANCELED';

// Define order interface
interface Order {
  id: string;
  customerName: string;
  customerPhone?: string;
  tableId: string;
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
  createdAt: string;
  updatedAt: string;
}

// Define context type
interface OrderContextType {
  orders: Order[];
  refreshOrders: () => Promise<void>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
}

// Create the context
const OrderContext = createContext<OrderContextType | undefined>(undefined);

// Create the provider component
export function OrderProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const { socket, isConnected } = useSocket();

  // Function to refresh orders from API
  const refreshOrders = async () => {
    try {
      const data = await getOrders();
      setOrders(data);
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    }
  };

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

  // Initial load and socket listeners
  useEffect(() => {
    refreshOrders();

    if (!socket || !isConnected) return;

    const handleNewOrder = () => {
      // Small chime for new UI event
      const audio = new Audio('/notification.mp3');
      audio.play().catch(() => {}); // Catch autoplay restrictions
      
      // We can either append to state or just refresh fully
      refreshOrders();
    };

    const handleOrderStatusChanged = () => {
       // Refresh or perfectly mutate state
       refreshOrders();
    };

    socket.on('newOrder', handleNewOrder);
    socket.on('orderStatusChanged', handleOrderStatusChanged);

    return () => {
      socket.off('newOrder', handleNewOrder);
      socket.off('orderStatusChanged', handleOrderStatusChanged);
    };
  }, [socket, isConnected]);

  const value = {
      orders,
      refreshOrders,
      updateOrderStatus,
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
