export type ReservationStatus =
  | "PENDING"
  | "CONFIRMED"
  | "DECLINED"
  | "CANCELLED"
  | "NO_SHOW"
  | "ARRIVED";

export type ReservationOccasion =
  | "NONE"
  | "BIRTHDAY"
  | "ANNIVERSARY"
  | "BUSINESS"
  | "FAMILY"
  | "OTHER";

export type ReservationAction =
  | "ACCEPT"
  | "DECLINE"
  | "CANCEL"
  | "NO_SHOW"
  | "ARRIVED";

// Mirror of the backend reservation-tags vocabulary.
export const CUSTOMER_PREFERENCES = [
  "VEGAN",
  "VEGETARIAN",
  "GLUTEN_INTOLERANT",
  "LACTOSE_INTOLERANT",
  "NUT_ALLERGY",
  "PET",
  "HIGH_CHAIR",
  "QUIET_TABLE",
] as const;

export const DIETARY_PREFERENCES: readonly string[] = [
  "VEGAN",
  "VEGETARIAN",
  "GLUTEN_INTOLERANT",
  "LACTOSE_INTOLERANT",
  "NUT_ALLERGY",
];

export const STAFF_PATRON_TAGS = [
  "VIP",
  "REGULAR",
  "WINE_LOVER",
  "OFTEN_LATE",
  "NO_SHOW_RISK",
  "PREFERS_TERRACE",
  "PREFERS_WINDOW",
  "NEEDS_CALL_CONFIRMATION",
] as const;

export interface AvailabilitySlot {
  startsAt: string; // UTC ISO
  label: string; // local HH:mm
}

export interface ReservationPublicConfig {
  enabled: boolean;
  restaurant: {
    name: string;
    logoUrl: string | null;
    address: string | null;
    contactInfo: string | null;
    timezone: string | null;
    accentColor?: string | null;
    defaultTheme?: string | null;
    themeBgColor?: string | null;
    themeTextColor?: string | null;
    themeCardColor?: string | null;
    themeLightBgColor?: string | null;
    themeLightTextColor?: string | null;
    themeLightCardColor?: string | null;
    themeLightAccentColor?: string | null;
    themeDarkBgColor?: string | null;
    themeDarkTextColor?: string | null;
    themeDarkCardColor?: string | null;
    themeDarkAccentColor?: string | null;
  };
  languages?: string[];
  defaultLanguage?: string;
  policy: {
    slotIntervalMinutes: number;
    minLeadMinutes: number;
    bookingHorizonDays: number;
    maxTotalGuests: number;
    requirePhone: boolean;
    allergenSectionEnabled: boolean;
    customPreferences: string[];
    zones: string[];
  } | null;
  allergens: { allergens: string[]; dietaryTags: string[] };
}

export interface ReservationCreateResult {
  referenceCode: string;
  status: ReservationStatus;
  startsAt: string;
}

export interface StaffReservation {
  id: string;
  referenceCode: string;
  status: ReservationStatus;
  source: "PUBLIC" | "STAFF";
  startsAt: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string | null;
  adultsCount: number;
  childrenCount: number;
  totalGuests: number;
  occasion: ReservationOccasion;
  customerNotes: string | null;
  internalNotes: string | null;
  customerPreferences: string[];
  preferredZone: string | null;
  durationMinutes: number | null;
  endsAt: string | null;
  allergyNotes: string | null;
  staffTags: string[];
  marketingConsent: boolean;
  createdAt: string;
}

export interface ReservationSettings {
  enabled: boolean;
  slotIntervalMinutes: number;
  minLeadMinutes: number;
  bookingHorizonDays: number;
  maxTotalGuests: number;
  maxCoversPerSlot: number | null;
  autoConfirm: boolean;
  requirePhone: boolean;
  allergenSectionEnabled: boolean;
  customPreferences: string[];
  notifyEmail?: string | null;
  notifyPhone?: string | null;
  diningDurationMinutes?: number;
  largePartyThreshold?: number;
  largePartyDurationMinutes?: number;
}

export interface ServiceHours {
  weekday: number; // ISO 1..7
  openMinute: number;
  lastSlotMinute: number;
}

export interface CreateReservationInput {
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
  startsAt: string;
  adultsCount: number;
  childrenCount?: number;
  occasion?: ReservationOccasion;
  customerNotes?: string;
  customerPreferences?: string[];
  allergyNotes?: string;
  dietaryConsent?: boolean;
  marketingConsent?: boolean;
  idempotencyKey?: string;
}
