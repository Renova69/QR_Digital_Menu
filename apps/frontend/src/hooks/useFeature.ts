import { useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import RestaurantContext from "../context/RestaurantContext";
import { useAuth } from "../context/AuthContext";
import { getSubscriptionStatus } from "../lib/api";

const ALL_FEATURE_FLAGS = [
  "menu:view",
  "menu:edit",
  "menu:import",
  "qr:manage",
  "orders:receive",
  "orders:call-waiter",
  "analytics:basic",
  "analytics:full",
  "payments:epay",
  "payments:borica",
  "payments:mypos",
  "payments:stripe",
  "languages:multi",
  "branding:custom",
  "loyalty",
  "customers:auth",
  "upselling",
  "dayparting",
  "pos",
  "kds",
  "rbac",
  "multilocation",
  "printers:thermal",
  "templates:menu",
  "staff:unlimited",
  "reservations:enabled",
] as const;

export type FeatureFlag = (typeof ALL_FEATURE_FLAGS)[number];

export type SubscriptionTier =
  | "FREE"
  | "STARTER"
  | "PROFESSIONAL"
  | "ENTERPRISE";

// Fallback only — API response is authoritative.
// This local map mirrors the backend tier→feature mapping and is used only
// while the subscription-status query is loading (or when the user has no
// restaurant). Once the API resolves, useTier()/useFeature() always prefer
// the server-derived `features` array over this constant.
const TIER_FEATURES: Record<SubscriptionTier, FeatureFlag[]> = {
  FREE: [
    "menu:view",
    "menu:edit",
    "menu:import",
    "qr:manage",
    "analytics:basic",
  ],
  STARTER: [
    "menu:view",
    "menu:edit",
    "menu:import",
    "qr:manage",
    "analytics:basic",
    "orders:receive",
    "orders:call-waiter",
    "languages:multi",
  ],
  PROFESSIONAL: [
    "menu:view",
    "menu:edit",
    "menu:import",
    "qr:manage",
    "orders:receive",
    "orders:call-waiter",
    "analytics:basic",
    "analytics:full",
    "payments:epay",
    "payments:borica",
    "payments:mypos",
    "payments:stripe",
    "languages:multi",
    "branding:custom",
    "loyalty",
    "customers:auth",
    "upselling",
    "dayparting",
    "reservations:enabled",
  ],
  ENTERPRISE: [...ALL_FEATURE_FLAGS],
};

function getStaffLimit(tier: SubscriptionTier): number {
  switch (tier) {
    case "FREE":
      return 0;
    case "STARTER":
      return 1;
    case "PROFESSIONAL":
      return 5;
    case "ENTERPRISE":
      return 999999;
  }
}

function getAllowedStaffRoles(tier: SubscriptionTier): string[] {
  switch (tier) {
    case "STARTER":
      return ["STAFF"];
    case "PROFESSIONAL":
      return ["STAFF", "MANAGER"];
    case "ENTERPRISE":
      return ["STAFF", "MANAGER", "WAITER", "KITCHEN"];
    default:
      return [];
  }
}

export interface SubscriptionInfo {
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  status: string;
  interval: string | null;
}

export function useTier(): {
  tier: SubscriptionTier;
  features: FeatureFlag[];
  staffLimit: number;
  allowedStaffRoles: string[];
  hasSubscription: boolean;
  subscription: SubscriptionInfo | null;
  isLoading: boolean;
} {
  const ctx = useContext(RestaurantContext);
  const { user } = useAuth();
  const activeRestaurantId = ctx?.activeRestaurant?.id ?? null;
  const userId = user?.id ?? null;
  const hasRestaurant = !!activeRestaurantId && !!userId;

  const { data, isLoading } = useQuery({
    queryKey: ["subscription-status", userId, activeRestaurantId],
    queryFn: () => getSubscriptionStatus(activeRestaurantId ?? undefined),
    staleTime: 60_000,
    refetchInterval: 30_000,
    enabled: hasRestaurant,
  });

  // Prefer live API tier (already has forceTier applied server-side).
  // Fall back to context while query is loading or user has no restaurant.
  const tier =
    (data?.tier as SubscriptionTier) ??
    (ctx?.activeRestaurant?.forceTier as SubscriptionTier | null | undefined) ??
    (ctx?.activeRestaurant?.tier as SubscriptionTier) ??
    "FREE";
  const apiFeatures = Array.isArray(data?.features)
    ? (data.features as FeatureFlag[])
    : null;
  const apiStaffLimit =
    typeof data?.staffLimit === "number" && Number.isFinite(data.staffLimit)
      ? data.staffLimit
      : null;
  const apiAllowedStaffRoles = Array.isArray(data?.allowedStaffRoles)
    ? (data.allowedStaffRoles as string[])
    : null;

  return {
    tier,
    features: apiFeatures ?? TIER_FEATURES[tier] ?? TIER_FEATURES.FREE,
    staffLimit: apiStaffLimit ?? getStaffLimit(tier),
    allowedStaffRoles: apiAllowedStaffRoles ?? getAllowedStaffRoles(tier),
    hasSubscription: data?.hasSubscription ?? false,
    subscription: (data?.subscription as SubscriptionInfo | null) ?? null,
    isLoading,
  };
}

export function useFeature(feature: FeatureFlag): boolean {
  const { features } = useTier();
  return features.includes(feature);
}

/**
 * Synchronous feature check against the LOCAL {@link TIER_FEATURES} constant.
 *
 * This does NOT consult the server-resolved effective tier (forceTier, live
 * subscription status, etc.). It is a best-effort fallback for contexts where a
 * tier string is already known but no hook is available (e.g. derived from
 * route state). Callers that can use a hook should prefer {@link useFeature}
 * (or {@link useTier}), which is authoritative because it reads the API response.
 */
export function hasTierFeature(
  tier: string | undefined | null,
  feature: FeatureFlag,
): boolean {
  const t = (tier as SubscriptionTier) ?? "FREE";
  const feats = TIER_FEATURES[t] ?? TIER_FEATURES.FREE;
  return feats.includes(feature);
}
