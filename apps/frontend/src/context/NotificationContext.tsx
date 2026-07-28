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
import {
  getPaymentNotificationFeed,
  markPaymentNotificationsRead,
  type PaymentNotificationFeedItem,
  type PaymentNotificationKind,
} from "../lib/api";

export interface PaymentNotification {
  id: string;
  paymentId: string;
  tableSessionId: string | null;
  amount: number;
  tipAmount: number;
  currency: string;
  tableNumber: string | null;
  customerName: string | null;
  provider: string;
  status: string;
  kind: PaymentNotificationKind;
  occurredAt: string;
  timestamp: number;
  read: boolean;
}

interface NotificationContextType {
  notifications: PaymentNotification[];
  unreadCount: number;
  showToast: PaymentNotification | null;
  dismissToast: () => void;
  markAllRead: () => Promise<void>;
  clearAll: () => void;
  __providerMounted: boolean;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  unreadCount: 0,
  showToast: null,
  dismissToast: () => {},
  markAllRead: async () => {},
  clearAll: () => {},
  __providerMounted: false,
});

function mapFeedItem(item: PaymentNotificationFeedItem): PaymentNotification {
  return {
    ...item,
    timestamp: new Date(item.occurredAt).getTime(),
  };
}

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [notifications, setNotifications] = useState<PaymentNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showToast, setShowToast] = useState<PaymentNotification | null>(null);
  const { socket, isConnected } = useSocket();
  const { user } = useAuth();
  const activeRestaurantId = useContext(RestaurantContext)?.activeRestaurant?.id;
  const userId = user?.id;
  const knownVersionsRef = useRef<Map<string, string>>(new Map());
  const hasLoadedRef = useRef(false);
  const requestVersionRef = useRef(0);

  const refreshNotifications = useCallback(
    async (showNewNotification = false) => {
      if (!activeRestaurantId || !userId) return;
      const requestVersion = ++requestVersionRef.current;

      try {
        const feed = await getPaymentNotificationFeed(activeRestaurantId, 20);
        if (requestVersion !== requestVersionRef.current) return;

        const nextNotifications = feed.data.map(mapFeedItem);
        const newestUnseen =
          showNewNotification && hasLoadedRef.current
            ? nextNotifications.find(
                (notification) =>
                  knownVersionsRef.current.get(notification.id) !==
                  `${notification.kind}:${notification.occurredAt}`,
              )
            : null;

        knownVersionsRef.current = new Map(
          nextNotifications.map((notification) => [
            notification.id,
            `${notification.kind}:${notification.occurredAt}`,
          ]),
        );
        hasLoadedRef.current = true;
        setNotifications(nextNotifications);
        setUnreadCount(feed.unreadCount);

        if (newestUnseen) {
          setShowToast(newestUnseen);
          if (
            typeof window.matchMedia === "function" &&
            window.matchMedia("(pointer: coarse)").matches
          ) {
            try {
              navigator.vibrate(200);
            } catch {}
          }
        }
      } catch (error) {
        console.error("Failed to load payment notifications:", error);
      }
    },
    [activeRestaurantId, userId],
  );

  useEffect(() => {
    knownVersionsRef.current = new Map();
    hasLoadedRef.current = false;
    setNotifications([]);
    setUnreadCount(0);
    setShowToast(null);
    void refreshNotifications();
  }, [refreshNotifications]);

  useEffect(() => {
    if (!socket || !isConnected || !activeRestaurantId || !userId) return;

    const handlePaymentActivity = () => {
      void refreshNotifications(true);
    };
    const events = [
      "payment:confirmed",
      "bill:updated",
      "payment:refunded",
      "payment:refundRequired",
    ];
    events.forEach((event) => socket.on(event, handlePaymentActivity));
    void refreshNotifications();
    return () => {
      events.forEach((event) => socket.off(event, handlePaymentActivity));
    };
  }, [
    activeRestaurantId,
    isConnected,
    refreshNotifications,
    socket,
    userId,
  ]);

  const dismissToast = useCallback(() => setShowToast(null), []);

  const markAllRead = useCallback(async () => {
    if (!activeRestaurantId) return;
    try {
      await markPaymentNotificationsRead(activeRestaurantId);
      setNotifications((prev) =>
        prev.map((notification) => ({ ...notification, read: true })),
      );
      setUnreadCount(0);
    } catch (error) {
      console.error("Failed to mark payment notifications read:", error);
    }
  }, [activeRestaurantId]);

  const clearAll = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
    setShowToast(null);
  }, []);

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
