import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  ReactNode,
} from "react";
import { useSocket } from "./SocketContext";
import { useAuth } from "./AuthContext";
import RestaurantContext from "./RestaurantContext";

export interface PaymentNotification {
  id: string;
  paymentId: string;
  tableSessionId: string;
  amount: number;
  tipAmount: number;
  tableNumber: string | null;
  customerName: string | null;
  timestamp: number;
  read: boolean;
}

interface NotificationContextType {
  notifications: PaymentNotification[];
  unreadCount: number;
  showToast: PaymentNotification | null;
  dismissToast: () => void;
  markAllRead: () => void;
  clearAll: () => void;
  __providerMounted: boolean;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  unreadCount: 0,
  showToast: null,
  dismissToast: () => {},
  markAllRead: () => {},
  clearAll: () => {},
  __providerMounted: false,
});

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [notifications, setNotifications] = useState<PaymentNotification[]>([]);
  const [showToast, setShowToast] = useState<PaymentNotification | null>(null);
  const { socket, isConnected } = useSocket();
  const { user } = useAuth();
  const activeRestaurant = useContext(RestaurantContext)
    ?.activeRestaurant as any;
  const userRoleRef = useRef<string | null>(null);

  useEffect(() => {
    if (user && "role" in user) {
      userRoleRef.current = (user as any).role;
    }
  }, [user]);

  useEffect(() => {
    if (!socket || !isConnected || !activeRestaurant) return;

    const handlePaymentConfirmed = (data: {
      paymentId: string;
      tableSessionId: string;
      amount: number;
      tipAmount: number;
      tableNumber: string | null;
      customerName: string | null;
    }) => {
      const notifyAll = activeRestaurant.notifyAllStaffOnPayment ?? true;
      const isOwner = userRoleRef.current === "OWNER";

      if (!notifyAll && !isOwner) return;

      const notification: PaymentNotification = {
        id: `pn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        ...data,
        timestamp: Date.now(),
        read: false,
      };

      setNotifications((prev) => [notification, ...prev].slice(0, 20));
      setShowToast(notification);

      if (window.matchMedia("(pointer: coarse)").matches) {
        try {
          navigator.vibrate(200);
        } catch {}
      }
    };

    socket.on("payment:confirmed", handlePaymentConfirmed);

    const handlePaymentRefunded = (data: {
      paymentId: string;
      tableSessionId: string;
      amount: number;
      tableNumber: string | null;
      refundId: string;
    }) => {
      const notification: PaymentNotification = {
        id: `rf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        paymentId: data.refundId,
        tableSessionId: data.tableSessionId,
        amount: data.amount,
        tipAmount: 0,
        tableNumber: data.tableNumber,
        customerName: null,
        timestamp: Date.now(),
        read: false,
      };
      setNotifications((prev) => [notification, ...prev].slice(0, 20));
      setShowToast(notification);
    };

    socket.on("payment:refunded", handlePaymentRefunded);
    return () => {
      socket.off("payment:confirmed", handlePaymentConfirmed);
      socket.off("payment:refunded", handlePaymentRefunded);
    };
  }, [socket, isConnected, activeRestaurant]);

  const dismissToast = useCallback(() => setShowToast(null), []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    setShowToast(null);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      showToast,
      dismissToast,
      markAllRead,
      clearAll,
      __providerMounted: true,
    }),
    [
      clearAll,
      dismissToast,
      markAllRead,
      notifications,
      showToast,
      unreadCount,
    ],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => useContext(NotificationContext);
export default NotificationContext;
