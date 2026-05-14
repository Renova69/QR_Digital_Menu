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
