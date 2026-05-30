export type OrderStatus = "NEW" | "IN_PROGRESS" | "SERVED" | "CANCELED" | "COMPLETED";

export interface Order {
  id: string;
  customerName: string;
  customerPhone: string | null;
  tableId: string;
  status: OrderStatus;
  restaurantId: string;
  totalPrice: number;
  createdAt: string;
  updatedAt: string;
}

export interface OptionChoice {
  name: string;
  priceModifier: number;
}

export interface MenuOption {
  id: string;
  name: string;
  type: "VARIATION" | "ADDON";
  choices: OptionChoice[];
  menuItemId: string;
  translations?: any;
}

export interface Item {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: "EUR" | "BGN";
  categoryId: string;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  allergens?: string[];
  dietaryTags?: string[];
  isFeatured?: boolean;
  rewardPointsPrice?: number;
  relatedItemIds?: string[];
  options?: MenuOption[];
  translations?: any;
}

export type AvailabilityType = "ALWAYS" | "SCHEDULED" | "HIDDEN";

export interface Category {
  id: string;
  name: string;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  restaurantId: string;
  items: Item[];
  availabilityType: AvailabilityType;
  startTime?: string | null;
  endTime?: string | null;
  daysOfWeek: number[];
  isDrinkCategory?: boolean;
  translations?: any;
}

// Super Admin
export interface SuperAdminStats {
  totalRestaurants: number;
  activeRestaurants: number;
  deletedRestaurants: number;
  totalUsers: number;
  userRoles: Record<string, number>;
  byTier: Record<string, number>;
  byBillingTier: Record<string, number>;
  byEffectiveTier: Record<string, number>;
  activeSubscriptions: number;
  paidPlanTenants: number;
  stripeLinkedSubscriptions: number;
  suspendedCount: number;
  forcedOverrideCount: number;
  forcedUpgrades: number;
  forcedDowngrades: number;
  recent: {
    restaurants7d: number;
    users7d: number;
    orders24h: number;
    orders7d: number;
    payments7d: {
      count: number;
      amount: number;
    };
  };
  attentionNeeded: Record<string, {
    count: number;
    items: Array<{
      id: string;
      name: string;
      ownerEmail: string;
      billingTier?: string;
      effectiveTier?: string;
      direction?: string;
    }>;
  }>;
}

export interface TenantSummary {
  id: string;
  name: string;
  tier: string;
  forceTier: string | null;
  isActive: boolean;
  deletedAt: string | null;
  stripeOnboarded: boolean;
  stripeSubscriptionId: string | null;
  paymentsEnabled: boolean;
  createdAt: string;
  owner: {
    id: string;
    email: string;
    name: string | null;
  };
}

export interface StaffMember {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
}

export interface TenantDetail extends TenantSummary {
  tierUpdatedAt: string | null;
  timezone: string;
  orderCount: number;
  menuCategoryCount: number;
  tableCount: number;
  staffMembers: StaffMember[];
  paymentSummary: {
    totalAmount: number;
    totalPayments: number;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
  };
}
