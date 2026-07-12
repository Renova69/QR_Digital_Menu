export type OrderStatus =
  | "PENDING_PAYMENT"
  | "NEW"
  | "IN_PROGRESS"
  | "SERVED"
  | "CANCELED"
  | "COMPLETED";

export interface Order {
  id: string;
  customerName: string;
  customerPhone: string | null;
  /** Real RestaurantTable cuid (stable identifier). */
  tableId: string;
  /** Human-readable table label for display (e.g. "1", "Terrace 3"). */
  tableName?: string | null;
  servicePointType?: string | null;
  servicePointLabel?: string | null;
  fulfillmentType?: string | null;
  paymentPreference?: string | null;
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

export interface MenuTranslationEntry {
  [key: string]: string | string[] | Record<string, string> | undefined;
  name?: string;
  description?: string;
  allergens?: string[] | Record<string, string>;
  dietaryTags?: string[] | Record<string, string>;
  choices?: Record<string, string>;
}

export type MenuTranslationMap = Record<string, MenuTranslationEntry>;

export interface MenuOption {
  id: string;
  name: string;
  originalName?: string;
  type: "VARIATION" | "ADDON";
  choices: OptionChoice[];
  menuItemId: string;
  translations?: MenuTranslationMap | null;
}

export interface Item {
  id: string;
  name: string;
  originalName?: string;
  description: string | null;
  originalDescription?: string | null;
  price: number;
  currency: "EUR" | "BGN";
  categoryId: string;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  allergens?: string[];
  dietaryTags?: string[];
  isFeatured?: boolean;
  isOutOfStock?: boolean;
  rewardPointsPrice?: number;
  costPrice?: number;
  relatedItemIds?: string[];
  options?: MenuOption[];
  translations?: MenuTranslationMap | null;
}

export type AvailabilityType = "ALWAYS" | "SCHEDULED" | "HIDDEN";

export interface Category {
  id: string;
  name: string;
  originalName?: string;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  restaurantId: string;
  items: Item[];
  availabilityType: AvailabilityType;
  startTime?: string | null;
  endTime?: string | null;
  daysOfWeek: number[];
  isDrinkCategory?: boolean;
  translations?: MenuTranslationMap | null;
  printStationId?: string | null;
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
  attentionNeeded: Record<
    string,
    {
      count: number;
      items: Array<{
        id: string;
        name: string;
        ownerEmail: string;
        billingTier?: string;
        effectiveTier?: string;
        direction?: string;
      }>;
    }
  >;
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
  forceTierExpiresAt: string | null;
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

export interface TableSession {
  id: string;
  token: string;
  tableId: string;
  status: "OPEN" | "PAID" | "CLOSED_NO_PAYMENT";
  createdAt: string;
  paidAt: string | null;
  table: { label: string } | null;
  _count: { orders: number };
}

export interface LoyaltyAccount {
  id: string;
  points: number;
  lifetimePoints: number;
  createdAt: string;
  user: { id: string; email: string; name: string | null };
}

export interface DataRequest {
  id: string;
  type: "ERASURE" | "EXPORT";
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "REJECTED";
  requestedAt: string;
  processedAt: string | null;
  notes: string | null;
  downloadUrl: string | null;
  user: { id: string; email: string; name: string | null };
}

export interface MrrTierRow {
  tier: string;
  billing: number;
  effective: number;
  price: number;
  contribution: number;
}

export interface MrrData {
  mrr: number;
  arr: number;
  byTier: MrrTierRow[];
  newLast30d: Record<string, number>;
  recentTierChanges: { action: string; metadata: unknown; createdAt: string }[];
}

export interface ImpersonationResult {
  sessionId: string;
  exchangeCode: string;
  expiresAt: string;
  targetUser: { id: string; email: string; name: string | null };
}
