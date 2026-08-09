import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  useRef,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import {
  getRestaurants,
  getRestaurantById,
  createRestaurant as createRestaurantApi,
} from "../services/restaurantService";
import type { Restaurant } from "../services/restaurantService";
import { useAuth } from "./AuthContext";
import { useSocket } from "./SocketContext";
import { isPosTransportFailure } from "../lib/posOfflineOrders";
import {
  loadOfflineRestaurant,
  saveOfflineRestaurant,
} from "../lib/posOfflineShift";
import { normalizeRestaurantId } from "../lib/menuUrl";

export type { Restaurant };

export interface RestaurantContextType {
  restaurants: Restaurant[];
  activeRestaurant: Restaurant | null;
  loading: boolean;
  error: Error | null;
  createRestaurant: (restaurantData: {
    name: string;
    city?: string;
    dashboardLanguage?: string;
    menuSourceLanguage?: string;
  }) => Promise<void>;
  selectRestaurant: (restaurant: Restaurant | null) => void;
  fetchRestaurants: () => Promise<void>;
}

const RestaurantContext = createContext<RestaurantContextType | undefined>(
  undefined,
);

export const useRestaurantContext = () => {
  const context = useContext(RestaurantContext);
  if (!context) {
    throw new Error(
      "useRestaurantContext must be used within RestaurantProvider",
    );
  }
  return context;
};

export const RestaurantProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { user, prefetchedRestaurants, clearPrefetch } = useAuth();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [activeRestaurant, setActiveRestaurant] = useState<Restaurant | null>(
    null,
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const { socket, isConnected } = useSocket();
  const activeRestaurantId = normalizeRestaurantId(activeRestaurant?.id);
  const fetchVersionRef = useRef(0);
  const initializedUserKeyRef = useRef<string | null>(null);

  // Watch for activeRestaurant changes and join/leave socket rooms
  useEffect(() => {
    if (!socket || !isConnected || !activeRestaurantId) return;

    socket.emit("joinRestaurantRoom", activeRestaurantId);

    return () => {
      socket.emit("leaveRestaurantRoom", activeRestaurantId);
    };
  }, [activeRestaurantId, socket, isConnected]);

  // Internal fetch — accepts prefetched data to skip network call on initial load
  // showLoading=false for background refreshes to avoid unmounting mounted views
  const _fetchRestaurants = useCallback(
    async (prefetchedData?: any[] | null, showLoading = true) => {
      const requestVersion = ++fetchVersionRef.current;
      if (showLoading) setLoading(true);
      try {
        setError(null);
        const role = user?.role?.toUpperCase();
        const isAssignedStaff =
          !!user?.restaurantId &&
          ["MANAGER", "WAITER", "KITCHEN", "STAFF"].includes(role || "");

        if (isAssignedStaff) {
          const restaurant = await getRestaurantById(user.restaurantId!);
          if (requestVersion !== fetchVersionRef.current) return;
          setRestaurants([restaurant]);
          setActiveRestaurant(restaurant);
          saveOfflineRestaurant(restaurant, user.id);
          if (showLoading) setLoading(false);
          return;
        }

        // Use prefetched data when available (eliminates sequential waterfall on login)
        const data: Restaurant[] = Array.isArray(prefetchedData)
          ? prefetchedData
          : await getRestaurants();
        if (requestVersion !== fetchVersionRef.current) return;

        setRestaurants(data);
        if (data.length > 0) {
          setActiveRestaurant((current) => {
            if (current) {
              const updated = data.find((r: Restaurant) => r.id === current.id);
              return updated || data[0];
            }
            return data[0];
          });
        } else if (user?.restaurantId) {
          // Staff user: fetch their assigned restaurant
          try {
            const r = await getRestaurantById(user.restaurantId);
            if (requestVersion !== fetchVersionRef.current) return;
            setRestaurants([r]);
            setActiveRestaurant(r);
          } catch {
            if (requestVersion !== fetchVersionRef.current) return;
            setActiveRestaurant(null);
          }
        } else {
          setActiveRestaurant(null);
        }
      } catch (err) {
        if (requestVersion !== fetchVersionRef.current) return;
        const cachedRestaurant =
          user && isPosTransportFailure(err)
            ? loadOfflineRestaurant(user.id, user.restaurantId)
            : null;
        if (cachedRestaurant) {
          setRestaurants([cachedRestaurant]);
          setActiveRestaurant(cachedRestaurant);
          setError(null);
        } else {
          setError(err as Error);
        }
      } finally {
        if (requestVersion === fetchVersionRef.current) {
          setLoading(false);
        }
      }
    },
    [user?.id, user?.restaurantId, user?.role],
  );

  // Public API — always fetches fresh from network, no loading spinner (background refresh)
  const fetchRestaurants = useCallback(
    () => _fetchRestaurants(undefined, false),
    [_fetchRestaurants],
  );

  useEffect(() => {
    if (!user) {
      fetchVersionRef.current += 1;
      initializedUserKeyRef.current = null;
      setRestaurants([]);
      setActiveRestaurant(null);
      setLoading(false);
      return;
    }

    const userKey = `${user.id}:${user.role}:${user.restaurantId ?? ""}`;
    const hasPrefetch = Array.isArray(prefetchedRestaurants);
    const isNewUser = initializedUserKeyRef.current !== userKey;
    if (!isNewUser && !hasPrefetch) return;

    initializedUserKeyRef.current = userKey;
    void _fetchRestaurants(hasPrefetch ? prefetchedRestaurants : undefined);
    if (hasPrefetch && clearPrefetch) clearPrefetch();
  }, [
    _fetchRestaurants,
    prefetchedRestaurants,
    user?.id,
    user?.restaurantId,
    user?.role,
  ]);

  const createRestaurant = useCallback(
    async (restaurantData: {
      name: string;
      city?: string;
      dashboardLanguage?: string;
      menuSourceLanguage?: string;
    }) => {
      const newRestaurant = await createRestaurantApi(restaurantData);
      setRestaurants((prev) => [...prev, newRestaurant]);
      setActiveRestaurant(newRestaurant);
      if (user) saveOfflineRestaurant(newRestaurant, user.id);
    },
    [user?.id],
  );

  const selectRestaurant = useCallback(
    (restaurant: Restaurant | null) => {
      setActiveRestaurant(restaurant);
      if (restaurant && user) saveOfflineRestaurant(restaurant, user.id);
    },
    [user?.id],
  );

  const value = useMemo(
    () => ({
      restaurants,
      activeRestaurant,
      loading,
      error,
      createRestaurant,
      selectRestaurant,
      fetchRestaurants,
    }),
    [
      activeRestaurant,
      createRestaurant,
      error,
      fetchRestaurants,
      loading,
      restaurants,
      selectRestaurant,
    ],
  );

  return (
    <RestaurantContext.Provider value={value}>
      {children}
    </RestaurantContext.Provider>
  );
};

export default RestaurantContext;
