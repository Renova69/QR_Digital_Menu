import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { getRestaurants, getRestaurantById, createRestaurant as createRestaurantApi } from '../services/restaurantService';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';

interface Restaurant {
  id: string;
  name: string;
  country: string;
  ownerId: string;
  dashboardLanguage?: string;
  trendingMode?: 'AUTO' | 'MANUAL' | 'OFF';
  fontHeading?: string;
  fontBody?: string;
  themeBgColor?: string;
  themeTextColor?: string;
  themeCardColor?: string;
  isLoyaltyEnabled?: boolean;
  loyaltySignupBonus?: number;
  loyaltyExchangeRate?: number;
  loyaltyRedeemRate?: number;
  loyaltyPointExpiryDays?: number;
  loyaltyExpiryReminderDays?: number;
  happyHourEnable?: boolean;
  happyHourStartTime?: string;
  happyHourEndTime?: string;
  happyHourMultiplier?: number;
  paymentsEnabled?: boolean;
  stripeOnboarded?: boolean;
  stripeAccountId?: string;
  tipsEnabled?: boolean;
  tipOptions?: number[];
  platformFeePercent?: number;
  notifyAllStaffOnPayment?: boolean;
  tier?: 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
  forceTier?: 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE' | null;
  tierUpdatedAt?: string;
  stripeSubscriptionId?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  tiktokUrl?: string;
}

interface RestaurantContextType {
  restaurants: Restaurant[];
  activeRestaurant: Restaurant | null;
  loading: boolean;
  error: Error | null;
  createRestaurant: (restaurantData: { name: string; city?: string; dashboardLanguage?: string }) => Promise<void>;
  selectRestaurant: (restaurant: Restaurant | null) => void;
  fetchRestaurants: () => Promise<void>;
}

const RestaurantContext = createContext<RestaurantContextType | undefined>(undefined);

export const RestaurantProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, prefetchedRestaurants } = useAuth();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [activeRestaurant, setActiveRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const { socket, isConnected } = useSocket();

  // Watch for activeRestaurant changes and join/leave socket rooms
  useEffect(() => {
    if (!socket || !isConnected) return;

    if (activeRestaurant) {
      socket.emit('joinRestaurantRoom', activeRestaurant.id);
    }

    return () => {
      if (activeRestaurant) {
        socket.emit('leaveRestaurantRoom', activeRestaurant.id);
      }
    };
  }, [activeRestaurant, socket, isConnected]);

  // Internal fetch — accepts prefetched data to skip network call on initial load
  const _fetchRestaurants = async (prefetchedData?: any[] | null) => {
    setLoading(true);
    try {
      setError(null);
      const role = user?.role?.toUpperCase();
      const isAssignedStaff =
        !!user?.restaurantId &&
        ['MANAGER', 'WAITER', 'KITCHEN', 'STAFF'].includes(role || '');

      if (isAssignedStaff) {
        const restaurant = await getRestaurantById(user.restaurantId!);
        setRestaurants([restaurant]);
        setActiveRestaurant(restaurant);
        return;
      }

      // Use prefetched data when available (eliminates sequential waterfall on login)
      const data: Restaurant[] = Array.isArray(prefetchedData)
        ? prefetchedData
        : await getRestaurants();

      setRestaurants(data);
      if (data.length > 0) {
        setActiveRestaurant(current => {
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
          setRestaurants([r]);
          setActiveRestaurant(r);
        } catch {
          setActiveRestaurant(null);
        }
      } else {
        setActiveRestaurant(null);
      }
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  // Public API — always fetches fresh from network
  const fetchRestaurants = () => _fetchRestaurants();

  useEffect(() => {
    if (user) {
      // Pass prefetched restaurants from AuthContext (set in parallel with /auth/me)
      _fetchRestaurants(prefetchedRestaurants);
    } else {
      setRestaurants([]);
      setActiveRestaurant(null);
      setLoading(false);
    }
  }, [user]);

  const createRestaurant = async (restaurantData: { name: string; city?: string; dashboardLanguage?: string }) => {
    const newRestaurant = await createRestaurantApi(restaurantData);
    setRestaurants(prev => [...prev, newRestaurant]);
    setActiveRestaurant(newRestaurant);
  };

  const selectRestaurant = (restaurant: Restaurant | null) => {
    setActiveRestaurant(restaurant);
  };

  const value = {
    restaurants,
    activeRestaurant,
    loading,
    error,
    createRestaurant,
    selectRestaurant,
    fetchRestaurants,
  };

  return (
    <RestaurantContext.Provider value={value}>
      {children}
    </RestaurantContext.Provider>
  );
};

export default RestaurantContext;
