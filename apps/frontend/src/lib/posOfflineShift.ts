import type { Restaurant } from "../services/restaurantService";

export interface OfflineStaffUser {
  id: string;
  email: string;
  name?: string;
  role: string;
  restaurantId?: string;
  onboardingComplete?: boolean;
  isImpersonation?: boolean;
  impersonationSessionId?: string;
}

const STAFF_KEY = "posOfflineStaffShift";
const RESTAURANT_KEY = "posOfflineRestaurantShift";
const SHIFT_TTL_MS = 12 * 60 * 60 * 1000;
const POS_ROLES = new Set(["OWNER", "MANAGER", "WAITER", "STAFF"]);

interface ExpiringSnapshot<T> {
  value: T;
  expiresAt: number;
}

interface OfflineRestaurantSnapshot {
  staffUserId: string;
  restaurant: Restaurant;
}

function storageAvailable(): boolean {
  return typeof sessionStorage !== "undefined";
}

function readSnapshot<T>(key: string): T | null {
  if (!storageAvailable()) return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as ExpiringSnapshot<T>;
    if (!snapshot?.value || snapshot.expiresAt <= Date.now()) {
      sessionStorage.removeItem(key);
      return null;
    }
    return snapshot.value;
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
}

function writeSnapshot<T>(key: string, value: T) {
  if (!storageAvailable()) return;
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({ value, expiresAt: Date.now() + SHIFT_TTL_MS }),
    );
  } catch {
    // An unavailable shift snapshot must not block a successful online login.
  }
}

export function saveOfflineStaff(user: OfflineStaffUser) {
  if (!POS_ROLES.has(user.role.toUpperCase())) {
    clearOfflineShift();
    return;
  }
  const previous = readSnapshot<OfflineStaffUser>(STAFF_KEY);
  if (previous && previous.id !== user.id && storageAvailable()) {
    sessionStorage.removeItem(RESTAURANT_KEY);
  }
  writeSnapshot(STAFF_KEY, user);
}

export function loadOfflineStaff(): OfflineStaffUser | null {
  const user = readSnapshot<OfflineStaffUser>(STAFF_KEY);
  if (!user || !POS_ROLES.has(user.role.toUpperCase())) return null;
  return user;
}

export function saveOfflineRestaurant(
  restaurant: Restaurant,
  staffUserId: string,
) {
  writeSnapshot<OfflineRestaurantSnapshot>(RESTAURANT_KEY, {
    staffUserId,
    restaurant,
  });
}

export function loadOfflineRestaurant(
  staffUserId: string,
  restaurantId?: string,
): Restaurant | null {
  const snapshot = readSnapshot<OfflineRestaurantSnapshot>(RESTAURANT_KEY);
  if (!snapshot || snapshot.staffUserId !== staffUserId) return null;
  if (restaurantId && snapshot.restaurant.id !== restaurantId) return null;
  return snapshot.restaurant;
}

export function clearOfflineShift() {
  if (!storageAvailable()) return;
  sessionStorage.removeItem(STAFF_KEY);
  sessionStorage.removeItem(RESTAURANT_KEY);
}
