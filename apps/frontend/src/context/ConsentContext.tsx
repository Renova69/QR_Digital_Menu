import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getPublicLegalSettings, postConsent } from "../lib/api";
import { getVisitorId } from "../lib/visitorId";
import {
  VANITY_MENU_PATH,
  useResolvedRestaurantId,
} from "../lib/tenantResolution";

export type ConsentCategoryKey = "analytics" | "marketing";

interface StoredConsentState {
  analytics?: boolean;
  marketing?: boolean;
  policyVersion: number;
  ts: number;
}

interface ConsentContextValue {
  // Only categories relevant to the current page — computed dynamically,
  // never stored. Empty means nothing optional to consent to here.
  categories: ConsentCategoryKey[];
  isBannerVisible: boolean;
  restaurantId: string | null;
  storageKey: string;
  currentState: Partial<Record<ConsentCategoryKey, boolean>>;
  isPreferencesOpen: boolean;
  accept: () => void;
  reject: () => void;
  openPreferences: () => void;
  closePreferences: () => void;
  save: (state: Partial<Record<ConsentCategoryKey, boolean>>) => void;
}

const ConsentContext = createContext<ConsentContextValue | undefined>(
  undefined,
);

// CookieConsentBanner renders as a sibling of <Routes>, not nested inside a
// matched route's element tree — so useParams() isn't available here.
// useLocation() + a path match is the only reliable way to detect "we're on
// restaurant X's public menu" from this position.
const RESTAURANT_MENU_PATH = /^\/menu\/public\/([^/]+)/;

function storageKeyFor(restaurantId: string | null): string {
  return restaurantId
    ? `consent:restaurant:${restaurantId}`
    : "consent:platform";
}

function readStored(key: string): StoredConsentState | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as StoredConsentState) : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, state: StoredConsentState): void {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // localStorage may be blocked (private browsing, quota) — consent still
    // works for this session in memory, it just won't persist across visits.
  }
}

export function ConsentProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const resolvedRestaurantId = useResolvedRestaurantId();
  const restaurantId = useMemo(() => {
    const match = location.pathname.match(RESTAURANT_MENU_PATH);
    if (match) return match[1];
    // On /m/<slug> the path carries a slug, not an id. Keying consent on the
    // slug would give one visitor two divergent records for one restaurant,
    // so use the resolved id published by the route.
    if (VANITY_MENU_PATH.test(location.pathname)) return resolvedRestaurantId;
    return null;
  }, [location.pathname, resolvedRestaurantId]);

  const { data: settings } = useQuery({
    queryKey: ["public-legal-settings"],
    queryFn: getPublicLegalSettings,
    staleTime: 5 * 60 * 1000,
  });

  const policyVersion = (settings?.policyVersion as number | undefined) ?? 1;

  const categories = useMemo<ConsentCategoryKey[]>(() => {
    if (!settings?.cookieBannerEnabled) return [];
    if (restaurantId) {
      // Marketing activates once a restaurant has a retargeting pixel
      // configured (sub-project B) — always empty until then.
      return [];
    }
    return settings.analyticsCookieEnabled ? ["analytics"] : [];
  }, [settings, restaurantId]);

  const storageKey = storageKeyFor(restaurantId);
  const [stored, setStored] = useState<StoredConsentState | null>(() =>
    readStored(storageKey),
  );

  // Re-read on scope change (e.g. navigating from one restaurant's menu to
  // another, or between a menu and a platform page).
  useEffect(() => {
    setStored(readStored(storageKey));
  }, [storageKey]);

  const [isPreferencesOpen, setPreferencesOpen] = useState(false);

  const isStale = !stored || stored.policyVersion < policyVersion;
  const isBannerVisible = categories.length > 0 && isStale;

  const persist = (next: Partial<Record<ConsentCategoryKey, boolean>>) => {
    const state: StoredConsentState = {
      ...next,
      policyVersion,
      ts: Date.now(),
    };
    writeStored(storageKey, state);
    setStored(state);

    for (const category of categories) {
      postConsent({
        restaurantId: restaurantId ?? undefined,
        visitorId: getVisitorId(),
        category: category.toUpperCase() as "ANALYTICS" | "MARKETING",
        granted: !!next[category],
        policyVersion,
      }).catch(() => {
        // Fire-and-forget audit log — never blocks the UI on network failure.
      });
    }
    setPreferencesOpen(false);
  };

  const value: ConsentContextValue = {
    categories,
    isBannerVisible,
    restaurantId,
    storageKey,
    currentState: stored ?? {},
    isPreferencesOpen,
    accept: () => persist(Object.fromEntries(categories.map((c) => [c, true]))),
    reject: () =>
      persist(Object.fromEntries(categories.map((c) => [c, false]))),
    openPreferences: () => setPreferencesOpen(true),
    closePreferences: () => setPreferencesOpen(false),
    save: persist,
  };

  return (
    <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConsent(): ConsentContextValue {
  const ctx = useContext(ConsentContext);
  if (!ctx) {
    throw new Error("useConsent must be used within a ConsentProvider");
  }
  return ctx;
}
