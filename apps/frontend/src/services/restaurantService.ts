import api from "../lib/api";

const PRIVATE_GET_CONFIG = {
  headers: {
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  },
};

export interface Restaurant {
  id: string;
  name: string;
  slug?: string | null;
  city?: string;
  country: string;
  ownerId: string;
  dashboardLanguage?: string;
  menuSourceLanguage?: string;
  accentColor?: string;
  logoUrl?: string;
  logoThumbnailUrl?: string;
  googleReviewUrl?: string;
  address?: string;
  contactInfo?: string;
  targetLanguages?: string[];
  timezone?: string;
  defaultTheme?: "light" | "dark";
  trendingMode?: "AUTO" | "MANUAL" | "OFF";
  fontHeading?: string;
  fontBody?: string;
  themeBgColor?: string;
  themeTextColor?: string;
  themeCardColor?: string;
  themeLightBgColor?: string;
  themeLightTextColor?: string;
  themeLightCardColor?: string;
  themeLightAccentColor?: string;
  themeDarkBgColor?: string;
  themeDarkTextColor?: string;
  themeDarkCardColor?: string;
  themeDarkAccentColor?: string;
  isLoyaltyEnabled?: boolean;
  loyaltySignupBonus?: number;
  loyaltyExchangeRate?: number;
  loyaltyRedeemRate?: number;
  loyaltyMaxRedemptionPercent?: number;
  loyaltyPointExpiryDays?: number;
  loyaltyExpiryReminderDays?: number;
  loyaltySilverThreshold?: number;
  loyaltyGoldThreshold?: number;
  loyaltySilverMultiplier?: number;
  loyaltyGoldMultiplier?: number;
  happyHourEnable?: boolean;
  happyHourDays?: number[];
  happyHourStartTime?: string;
  happyHourEndTime?: string;
  happyHourMultiplier?: number;
  paymentsEnabled?: boolean;
  stripeOnboarded?: boolean;
  stripeAccountId?: string;
  epayEnabled?: boolean;
  epayMode?: "DEMO" | "LIVE";
  epayClientId?: string | null;
  epayMerchantEmail?: string | null;
  epaySecretConfigured?: boolean;
  epayPage?: "credit_paydirect" | "paylogin";
  boricaEnabled?: boolean;
  boricaMode?: "DEMO" | "LIVE";
  boricaTerminalId?: string | null;
  boricaMerchantId?: string | null;
  boricaMerchantName?: string | null;
  boricaPrivateKeyConfigured?: boolean;
  boricaPublicCert?: string | null;
  boricaCurrency?: "EUR";
  myposEnabled?: boolean;
  myposMode?: "DEMO" | "LIVE";
  myposClientNumber?: string | null;
  myposStoreId?: string | null;
  myposKeyIndex?: string | null;
  myposPrivateKeyConfigured?: boolean;
  myposPublicCert?: string | null;
  myposCurrency?: "EUR";
  tipsEnabled?: boolean;
  tipOptions?: number[];
  platformFeePercent?: number;
  notifyAllStaffOnPayment?: boolean;
  sharedDeviceModeEnabled?: boolean;
  isActive?: boolean;
  tier?: "FREE" | "STARTER" | "PROFESSIONAL" | "ENTERPRISE";
  features?: string[];
  forceTier?: "FREE" | "STARTER" | "PROFESSIONAL" | "ENTERPRISE" | null;
  tierUpdatedAt?: string;
  stripeSubscriptionId?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  tiktokUrl?: string;
  websiteUrl?: string;
  youtubeUrl?: string;
}

export const getRestaurants = async (): Promise<Restaurant[]> => {
  try {
    const response = await api.get<Restaurant[]>(
      "/restaurants",
      PRIVATE_GET_CONFIG,
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching restaurants:", error);
    throw error;
  }
};

export const createRestaurant = async (restaurantData: {
  name: string;
  slug?: string;
  city?: string;
  dashboardLanguage?: string;
  menuSourceLanguage?: string;
}): Promise<Restaurant> => {
  try {
    const response = await api.post<Restaurant>("/restaurants", restaurantData);
    return response.data;
  } catch (error) {
    console.error("Error creating restaurant:", error);
    throw error;
  }
};

export const checkRestaurantSlugAvailable = async (
  slug: string,
): Promise<{ available: boolean }> => {
  const response = await api.get<{ available: boolean }>(
    "/restaurants/slug/available",
    { params: { slug } },
  );
  return response.data;
};

export const getRestaurantById = async (id: string): Promise<Restaurant> => {
  try {
    const response = await api.get<Restaurant>(
      `/restaurants/${id}`,
      PRIVATE_GET_CONFIG,
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching restaurant:", error);
    throw error;
  }
};

export const updateRestaurant = async (
  id: string,
  data: Partial<Restaurant>,
): Promise<Restaurant> => {
  try {
    const response = await api.patch<Restaurant>(`/restaurants/${id}`, data);
    return response.data;
  } catch (error) {
    console.error("Error updating restaurant:", error);
    throw error;
  }
};
