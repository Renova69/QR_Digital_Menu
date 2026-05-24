import api from '../lib/api';

interface Restaurant {
  id: string;
  name: string;
  country: string;
  ownerId: string;
  dashboardLanguage?: string;
  accentColor?: string;
  logoUrl?: string;
  googleReviewUrl?: string;
  address?: string;
  contactInfo?: string;
  targetLanguages?: string[];
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
  facebookUrl?: string;
  instagramUrl?: string;
  tiktokUrl?: string;
}

export const getRestaurants = async (): Promise<Restaurant[]> => {
  try {
    const response = await api.get<Restaurant[]>('/restaurants');
    return response.data;
  } catch (error) {
    console.error('Error fetching restaurants:', error);
    throw error;
  }
};

export const createRestaurant = async (restaurantData: { name: string; city?: string; dashboardLanguage?: string }): Promise<Restaurant> => {
  try {
    const response = await api.post<Restaurant>('/restaurants', restaurantData);
    return response.data;
  } catch (error) {
    console.error('Error creating restaurant:', error);
    throw error;
  }
};

export const getRestaurantById = async (id: string): Promise<Restaurant> => {
  try {
    const response = await api.get<Restaurant>(`/restaurants/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching restaurant:', error);
    throw error;
  }
};

export const updateRestaurant = async (id: string, data: Partial<Restaurant>): Promise<Restaurant> => {
  try {
    const response = await api.patch<Restaurant>(`/restaurants/${id}`, data);
    return response.data;
  } catch (error) {
    console.error('Error updating restaurant:', error);
    throw error;
  }
};
