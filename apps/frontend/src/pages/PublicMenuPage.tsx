import { useCallback, useState, useEffect, useRef } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import type { Restaurant } from "../services/restaurantService";
import {
  getMenuMeta,
  getCategoryItems,
  createAssistanceRequest,
  getSessionBill,
  recordMenuView,
  abandonCheckout,
} from "../lib/api";
import { getVisitorId } from "../lib/visitorId";
import { BRANDING_FONT_NAMES } from "../lib/brandingFonts";
import { PaymentModal } from "../components/payment/PaymentModal";
import { useCart } from "../context/CartContext";
import { Button } from "../components/ui/button";
import CartIcon from "../components/cart/CartIcon";
import { ItemWithOptions } from "../components/menu/ItemWithOptions";
import { AlertTriangle, Bell, LogOut, UserCircle } from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck } from "@fortawesome/free-solid-svg-icons";
import { useTranslation } from "react-i18next";
import { TopBar } from "../components/menu/TopBar";
import { FilterPanel } from "../components/menu/FilterPanel";
import { TrendingCarousel } from "../components/menu/TrendingCarousel";
import { CategoryPills } from "../components/menu/CategoryPills";
import SocialBar from "../components/menu/SocialBar";
import Footer from "../components/menu/Footer";
import { CustomerLoginModal } from "../components/auth/CustomerLoginModal";
import { useAuth } from "../context/AuthContext";
import { getImageUrl } from "../lib/getImageUrl";
import type { FeatureFlag } from "../hooks/useFeature";
import type {
  BrandPalette,
  BrandMode,
} from "../components/branding/ThemePresets";
import { getReadableTextColor } from "../utils/colors";
import {
  clearOwnedOrderIds,
  getOwnedOrderIds,
} from "../lib/publicOrderOwnership";
import { useSocket } from "../context/SocketContext";

const DEFAULT_PUBLIC_LIGHT: BrandPalette = {
  bg: "#FFFFFF",
  text: "#0E0B1A",
  card: "#FFFFFF",
  accent: "#4F46E5",
};

const DEFAULT_PUBLIC_DARK: BrandPalette = {
  bg: "#0B0A14",
  text: "#F5F4FA",
  card: "#15131F",
  accent: "#8B6FFF",
};

const hostedCheckoutStorageKey = (token: string) => `hosted-checkout:${token}`;

function hasHostedCheckoutMarker(token: string | null | undefined) {
  if (!token) return false;
  try {
    return !!sessionStorage.getItem(hostedCheckoutStorageKey(token));
  } catch {
    return false;
  }
}

function clearHostedCheckoutMarker(token: string | null | undefined) {
  if (!token) return;
  try {
    sessionStorage.removeItem(hostedCheckoutStorageKey(token));
  } catch {}
}

// POS Payment QR opens /checkout?session=<token>; that token is never written
// to localStorage (only normal table ordering does that). On a hosted-checkout
// return we may therefore have no table-based token — recover it from the marker
// so cancel can still abandon the PENDING payment and the marker is cleaned up.
function findHostedCheckoutToken(): string | null {
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith("hosted-checkout:")) {
        return key.slice("hosted-checkout:".length);
      }
    }
  } catch {}
  return null;
}

function resolvePublicPalette(
  restaurant: Restaurant | undefined,
  mode: BrandMode,
): BrandPalette | null {
  if (!restaurant) return null;
  const hasPairedBrand =
    !!restaurant.themeLightBgColor ||
    !!restaurant.themeLightTextColor ||
    !!restaurant.themeLightCardColor ||
    !!restaurant.themeLightAccentColor ||
    !!restaurant.themeDarkBgColor ||
    !!restaurant.themeDarkTextColor ||
    !!restaurant.themeDarkCardColor ||
    !!restaurant.themeDarkAccentColor;
  const hasLegacyBrand = !!(
    restaurant.themeBgColor && restaurant.themeTextColor
  );
  if (!hasPairedBrand && !hasLegacyBrand && !restaurant.accentColor)
    return null;

  if (mode === "dark") {
    return {
      bg: restaurant.themeDarkBgColor || DEFAULT_PUBLIC_DARK.bg,
      text: restaurant.themeDarkTextColor || DEFAULT_PUBLIC_DARK.text,
      card: restaurant.themeDarkCardColor || DEFAULT_PUBLIC_DARK.card,
      accent:
        restaurant.themeDarkAccentColor ||
        restaurant.accentColor ||
        DEFAULT_PUBLIC_DARK.accent,
    };
  }

  return {
    bg:
      restaurant.themeLightBgColor ||
      restaurant.themeBgColor ||
      DEFAULT_PUBLIC_LIGHT.bg,
    text:
      restaurant.themeLightTextColor ||
      restaurant.themeTextColor ||
      DEFAULT_PUBLIC_LIGHT.text,
    card:
      restaurant.themeLightCardColor ||
      restaurant.themeCardColor ||
      restaurant.themeBgColor ||
      DEFAULT_PUBLIC_LIGHT.card,
    accent:
      restaurant.themeLightAccentColor ||
      restaurant.accentColor ||
      DEFAULT_PUBLIC_LIGHT.accent,
  };
}

function getStoredPublicTheme(
  restaurantId: string | undefined,
  fallback: BrandMode,
): BrandMode {
  if (typeof window === "undefined") return fallback;
  const key = restaurantId ? `theme-${restaurantId}` : "theme";
  const stored = localStorage.getItem(key) as BrandMode | null;
  return stored ?? fallback;
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Target languages that read right-to-left. Drives the `dir` on the menu root so
// Arabic (and any future RTL target) mirrors layout instead of rendering LTR.
const RTL_LANGS = new Set(["ar", "he", "fa", "ur"]);

const PublicMenuPage = () => {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const { setTableNumber, pruneInvalidItems, clearCart } = useCart();

  // Clear cart when navigating to a different restaurant's menu.
  // localStorage keeps this in sync with cartItems (both same storage tier).
  useEffect(() => {
    const CART_RESTAURANT_KEY = "cartRestaurantId";
    const prev = localStorage.getItem(CART_RESTAURANT_KEY);
    if (prev && prev !== restaurantId) {
      clearCart();
    }
    if (restaurantId) {
      localStorage.setItem(CART_RESTAURANT_KEY, restaurantId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);
  const [tableNumber, setTableNumberState] = useState<string | null>(null);
  const viewRecordedRef = useRef<string | null>(null);

  // Phase 1: restaurant branding + category names (fast, no items)
  const [menuMeta, setMenuMeta] = useState<{
    restaurant: Restaurant;
    categories: any[];
  } | null>(null);
  // Phase 2: per-category items — undefined=not started, null=loading, array=loaded
  const [loadedItemsMap, setLoadedItemsMap] = useState<
    Record<string, any[] | null>
  >({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assistanceSent, setAssistanceSent] = useState(false);
  const [assistanceLoading, setAssistanceLoading] = useState(false);
  const [assistanceError, setAssistanceError] = useState(false);
  const [noTableNotice, setNoTableNotice] = useState(false);
  const ASSIST_COOLDOWN_MS = 60000;
  const assistCooldownKey =
    restaurantId && tableNumber
      ? `assist-cd-${restaurantId}-${tableNumber}`
      : null;
  const [selectedLang, setSelectedLang] = useState<string>("");

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [ownedOrderIds, setOwnedOrderIds] = useState<string[]>([]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [pendingCashRequestId, setPendingCashRequestId] = useState<
    string | null
  >(null);
  const [paymentBanner, setPaymentBanner] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [isAssistanceDialogOpen, setIsAssistanceDialogOpen] = useState(false);

  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const { socket, isConnected } = useSocket();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  const tier = menuMeta?.restaurant?.tier as string | undefined;
  const features = Array.isArray(menuMeta?.restaurant?.features)
    ? (menuMeta.restaurant.features as FeatureFlag[])
    : [];
  const hasFeature = (feature: FeatureFlag) => features.includes(feature);
  const ordersEnabled = hasFeature("orders:receive");
  const paymentsEnabled = !!menuMeta?.restaurant?.paymentsEnabled;
  const callWaiterEnabled = hasFeature("orders:call-waiter");
  const languagesEnabled = hasFeature("languages:multi");
  const upsellEnabled = hasFeature("upselling");
  const customersAuthEnabled = hasFeature("customers:auth");
  const showActionBar =
    ordersEnabled || callWaiterEnabled || customersAuthEnabled;
  const [activeDietTags, setActiveDietTags] = useState<string[]>([]);
  const [excludedAllergens, setExcludedAllergens] = useState<string[]>([]);

  const categoryRefs = useRef<Record<string, HTMLElement | null>>({});
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [publicThemeMode, setPublicThemeMode] = useState<BrandMode>(() =>
    getStoredPublicTheme(restaurantId, "light"),
  );
  const themeInitialized = useRef(false);
  const langFetchId = useRef(0);
  const langFetchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasActiveFilters =
    activeDietTags.length > 0 || excludedAllergens.length > 0;

  const clearPaidSession = useCallback(
    (message?: string) => {
      const tokenToClear = sessionToken;
      setIsPaymentModalOpen(false);
      if (restaurantId && tableNumber && tokenToClear) {
        clearOwnedOrderIds(restaurantId, tableNumber, tokenToClear);
        localStorage.removeItem(`session-${restaurantId}-${tableNumber}`);
      }
      setSessionToken(null);
      setOwnedOrderIds([]);
      setPendingCashRequestId(null);
      setPaymentBanner({
        ok: true,
        text:
          message ??
          t("payment.paymentReceived", "Payment received successfully"),
      });
    },
    [restaurantId, sessionToken, tableNumber, t],
  );

  const toggleDietTag = (tag: string) => {
    setActiveDietTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const toggleAllergen = (allergen: string) => {
    setExcludedAllergens((prev) =>
      prev.includes(allergen)
        ? prev.filter((a) => a !== allergen)
        : [...prev, allergen],
    );
  };

  const clearFilters = () => {
    setActiveDietTags([]);
    setExcludedAllergens([]);
  };

  // All items currently loaded across all categories
  const allLoadedItems: any[] = Object.values(loadedItemsMap).flatMap(
    (items) => (Array.isArray(items) ? items : []),
  );

  // Categories merged with loaded items — used by CartIcon for name resolution
  const categoriesForCart =
    menuMeta?.categories.map((cat: any) => ({
      ...cat,
      items: Array.isArray(loadedItemsMap[cat.id])
        ? (loadedItemsMap[cat.id] as any[])
        : [],
    })) ?? [];

  // Load all categories for a given lang; called on initial load and lang change.
  // resetFirst=true (initial load) wipes to null (shows skeletons).
  // resetFirst=false (lang switch) keeps existing items visible while translations load.
  const loadAllCategoryItems = (
    categories: any[],
    lang: string | undefined,
    cancelled: { v: boolean },
    resetFirst = true,
  ) => {
    langFetchId.current += 1;
    const myFetchId = langFetchId.current;
    if (resetFirst) {
      setLoadedItemsMap(
        Object.fromEntries(categories.map((c: any) => [c.id, null])),
      );
    }
    categories.forEach(async (cat: any) => {
      const stale = () => cancelled.v || langFetchId.current !== myFetchId;
      try {
        const items = await getCategoryItems(restaurantId!, cat.id, lang);
        if (!stale())
          setLoadedItemsMap((prev) => ({ ...prev, [cat.id]: items }));
      } catch {
        if (stale()) return;
        // On translation failure, fall back to default-language items
        try {
          const fallback = await getCategoryItems(
            restaurantId!,
            cat.id,
            undefined,
          );
          if (!stale())
            setLoadedItemsMap((prev) => ({ ...prev, [cat.id]: fallback }));
        } catch {
          // Preserve existing items rather than wiping to empty on complete failure
          if (!stale())
            setLoadedItemsMap((prev) =>
              Array.isArray(prev[cat.id]) ? prev : { ...prev, [cat.id]: [] },
            );
        }
      }
    });
  };

  // Handle hosted-checkout return params (ePay / BORICA / myPOS redirect back to menu).
  // Runs once on mount and on URL change.  Strips the param to keep the URL clean.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const paymentOutcome = params.get("payment");
    if (!paymentOutcome) return;

    const tableParam = params.get("table");
    const sessionKey =
      restaurantId && tableParam
        ? `session-${restaurantId}-${tableParam}`
        : null;
    // Fall back to the marker token so the POS Payment QR flow (token only in the
    // /checkout URL, never in localStorage) is cleaned up correctly too.
    const storedToken =
      (sessionKey ? localStorage.getItem(sessionKey) : null) ??
      findHostedCheckoutToken();

    if (
      paymentOutcome === "borica-ok" ||
      paymentOutcome === "epay-ok" ||
      paymentOutcome === "mypos-ok"
    ) {
      // Clear the stored session token so a new one is created on the next order.
      clearHostedCheckoutMarker(storedToken);
      if (restaurantId && tableParam && storedToken) {
        clearOwnedOrderIds(restaurantId, tableParam, storedToken);
      }
      if (sessionKey) localStorage.removeItem(sessionKey);
      setSessionToken(null);
      setIsPaymentModalOpen(false);
      setPaymentBanner({
        ok: true,
        text: t("payment.paymentReceived", "Payment received successfully"),
      });
      // Strip the outcome param from the URL without triggering a navigation.
      params.delete("payment");
      const next = params.toString()
        ? `?${params.toString()}`
        : location.pathname;
      navigate(next, { replace: true });
    } else if (
      paymentOutcome === "borica-cancel" ||
      paymentOutcome === "epay-cancel" ||
      paymentOutcome === "mypos-cancel"
    ) {
      // Payment was cancelled — abandon any PENDING payment row so the customer
      // can choose a different provider without hitting the "already processing" guard.
      if (storedToken) {
        abandonCheckout(storedToken).catch(() => {});
      }
      clearHostedCheckoutMarker(storedToken);
      setIsPaymentModalOpen(false);
      setPaymentBanner({
        ok: false,
        text: t(
          "payment.paymentCancelled",
          "Payment cancelled — you can try again.",
        ),
      });
      params.delete("payment");
      const next = params.toString()
        ? `?${params.toString()}`
        : location.pathname;
      navigate(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  useEffect(() => {
    if (!paymentBanner) return;
    const timer = setTimeout(() => setPaymentBanner(null), 8000);
    return () => clearTimeout(timer);
  }, [paymentBanner]);

  useEffect(() => {
    if (!socket || !isConnected || !sessionToken) return;

    socket.emit("joinTableSessionRoom", { token: sessionToken });

    const handlePaymentConfirmed = () => {
      clearPaidSession();
    };

    const handleBillUpdated = (payload: { sessionPaid?: boolean }) => {
      if (payload?.sessionPaid) clearPaidSession();
    };

    const handleCashRequestUpdated = (request: {
      id?: string;
      status?: string;
    }) => {
      if (!pendingCashRequestId || request?.id !== pendingCashRequestId) return;
      if (request.status === "PAID") {
        clearPaidSession();
        return;
      }
      if (request.status === "CANCELLED") {
        setPendingCashRequestId(null);
        setIsPaymentModalOpen(false);
        setPaymentBanner({
          ok: false,
          text: t(
            "payment.cashRequestCancelled",
            "Staff cancelled this cash request. Please ask your waiter or try again.",
          ),
        });
      }
    };

    socket.on("payment:confirmed", handlePaymentConfirmed);
    socket.on("bill:updated", handleBillUpdated);
    socket.on("cashPaymentRequest:updated", handleCashRequestUpdated);

    return () => {
      socket.off("payment:confirmed", handlePaymentConfirmed);
      socket.off("bill:updated", handleBillUpdated);
      socket.off("cashPaymentRequest:updated", handleCashRequestUpdated);
      socket.emit("leaveTableSessionRoom", { token: sessionToken });
    };
  }, [
    clearPaidSession,
    isConnected,
    pendingCashRequestId,
    sessionToken,
    socket,
    t,
  ]);

  useEffect(() => {
    const abandonHostedCheckoutIfReturned = () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("payment")) return;

      const tableParam = params.get("table");
      const storedToken =
        (restaurantId && tableParam
          ? localStorage.getItem(`session-${restaurantId}-${tableParam}`)
          : sessionToken) ?? findHostedCheckoutToken();

      if (!storedToken || !hasHostedCheckoutMarker(storedToken)) return;

      clearHostedCheckoutMarker(storedToken);
      setIsPaymentModalOpen(false);
      abandonCheckout(storedToken).catch(() => {});
    };

    abandonHostedCheckoutIfReturned();
    window.addEventListener("pageshow", abandonHostedCheckoutIfReturned);
    return () =>
      window.removeEventListener("pageshow", abandonHostedCheckoutIfReturned);
  }, [restaurantId, sessionToken, location.search]);

  // Main fetch effect: meta first, then parallel category items
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const table = params.get("table");
    setTableNumberState(table);
    if (table) {
      setTableNumber(table);
      const stored = localStorage.getItem(`session-${restaurantId}-${table}`);
      if (stored) setSessionToken(stored);
    }

    if (!restaurantId) return;

    const viewKey = `${restaurantId}:${table ?? ""}`;
    if (viewRecordedRef.current !== viewKey) {
      viewRecordedRef.current = viewKey;
      recordMenuView(restaurantId, { table, visitorId: getVisitorId() });
    }

    const cancelled = { v: false };

    const fetchMenu = async () => {
      try {
        setLoading(true);
        setError(null);
        setMenuMeta(null);
        setLoadedItemsMap({});

        const data = await getMenuMeta(restaurantId);
        if (cancelled.v) return;

        if (!data?.restaurant) {
          setError(t("publicMenu.failedLoad"));
          return;
        }

        setMenuMeta(data);

        let initialLang: string | undefined;
        if (data.restaurant?.targetLanguages?.length > 0) {
          const langs: string[] = data.restaurant.targetLanguages;
          initialLang = langs[0];
          setSelectedLang(initialLang);
          void i18n.changeLanguage(initialLang);
          // Warm every target-language UI bundle in the background so switching the
          // language selector never suspends (no blank flash while a chunk loads).
          void i18n.loadLanguages(langs);
        }

        loadAllCategoryItems(data.categories, initialLang, cancelled);
      } catch (err) {
        if (!cancelled.v) {
          console.error("Public Menu Fetch Error:", err);
          setError(t("publicMenu.failedLoad"));
        }
      } finally {
        if (!cancelled.v) setLoading(false);
      }
    };

    fetchMenu();
    return () => {
      cancelled.v = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, location.search]);

  // Prune stale cart items once every category has loaded
  useEffect(() => {
    if (!menuMeta?.categories?.length) return;
    const allLoaded = menuMeta.categories.every((cat: any) =>
      Array.isArray(loadedItemsMap[cat.id]),
    );
    if (!allLoaded) return;
    const validItemIds = allLoadedItems.map((i: any) => i.id);
    const removedCount = pruneInvalidItems(validItemIds);
    if (removedCount > 0) {
      console.warn(
        `[PublicMenu] Removed ${removedCount} stale cart item(s) not present in current menu.`,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedItemsMap]);

  // IntersectionObserver: track active category for scroll-spy pill nav
  useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: "-20% 0px -70% 0px",
      threshold: 0,
    };

    const observerCallback = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setActiveCategory(entry.target.id);
        }
      });
    };

    const observer = new IntersectionObserver(
      observerCallback,
      observerOptions,
    );

    const timeoutId = setTimeout(() => {
      Object.values(categoryRefs.current).forEach((ref) => {
        if (ref) observer.observe(ref);
      });
    }, 1000);

    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [menuMeta]);

  useEffect(() => {
    if (tableNumber) {
      const stored = localStorage.getItem(
        `session-${restaurantId}-${tableNumber}`,
      );
      setSessionToken(stored);
    }
  }, [restaurantId, tableNumber]);

  useEffect(() => {
    setOwnedOrderIds(getOwnedOrderIds(restaurantId, tableNumber, sessionToken));
  }, [restaurantId, tableNumber, sessionToken, isPaymentModalOpen]);

  // Restore call-waiter cooldown across reloads — the 60s anti-spam window is
  // persisted per restaurant+table so reloading the page can't bypass it.
  useEffect(() => {
    if (!assistCooldownKey) return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(assistCooldownKey);
    } catch {
      /* ignore */
    }
    if (!stored) return;
    const elapsed = Date.now() - Number(stored);
    if (
      !Number.isFinite(elapsed) ||
      elapsed < 0 ||
      elapsed >= ASSIST_COOLDOWN_MS
    )
      return;
    setAssistanceSent(true);
    const id = setTimeout(
      () => setAssistanceSent(false),
      ASSIST_COOLDOWN_MS - elapsed,
    );
    return () => clearTimeout(id);
  }, [assistCooldownKey]);

  useEffect(() => {
    if (menuMeta?.restaurant) {
      const { fontHeading, fontBody } = menuMeta.restaurant;
      const fontsToLoad = new Set<string>();
      if (fontHeading) fontsToLoad.add(fontHeading);
      if (fontBody) fontsToLoad.add(fontBody);

      fontsToLoad.forEach((font) => {
        // Allowlist == the branding editor's font set (#12) — also guards
        // against arbitrary values being interpolated into the Fonts URL.
        if (!BRANDING_FONT_NAMES.has(font)) return;
        const linkId = `font-${font.replace(/ /g, "-")}`;
        if (!document.getElementById(linkId)) {
          const link = document.createElement("link");
          link.id = linkId;
          link.rel = "stylesheet";
          link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font).replace(/%20/g, "+")}:wght@400;700;900&display=swap`;
          document.head.appendChild(link);
        }
      });
    }
  }, [menuMeta?.restaurant]);

  const handleAssistanceRequest = async (
    type: "STANDARD" | "URGENT" = "STANDARD",
  ) => {
    if (!tableNumber) {
      setNoTableNotice(true);
      setTimeout(() => setNoTableNotice(false), 3500);
      return;
    }
    if (!restaurantId || assistanceSent || assistanceLoading) return;

    // Start the 60s anti-spam cooldown and show the "staff notified" confirmation.
    const startCooldown = () => {
      try {
        if (assistCooldownKey)
          localStorage.setItem(assistCooldownKey, String(Date.now()));
      } catch {
        /* ignore */
      }
      setAssistanceSent(true);
      setTimeout(() => setAssistanceSent(false), ASSIST_COOLDOWN_MS);
    };

    try {
      setAssistanceLoading(true);
      await createAssistanceRequest(tableNumber, restaurantId, type);
      startCooldown();
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      // 409 = a recent request of this type already exists; 429 = rate-limited.
      // In both cases the table's call is effectively already registered, so we
      // confirm to the guest and apply the cooldown — this stops the button from
      // re-firing and prevents the retry storm that produced the 429s.
      if (status === 409 || status === 429) {
        startCooldown();
      } else {
        console.error("Assistance Request Error:", err);
        setAssistanceError(true);
        setTimeout(() => setAssistanceError(false), 4000);
      }
    } finally {
      setAssistanceLoading(false);
    }
  };

  const handleLanguageChange = (code: string) => {
    // Immediate: update UI language + translated item names from embedded translations
    setSelectedLang(code);
    void i18n.changeLanguage(code);
    // Debounced: only fire API fetch after 350ms of no further switches
    // This prevents N×categories requests on rapid switching
    if (langFetchDebounce.current) clearTimeout(langFetchDebounce.current);
    langFetchDebounce.current = setTimeout(() => {
      if (menuMeta?.categories?.length && restaurantId) {
        const cancelled = { v: false };
        loadAllCategoryItems(menuMeta.categories, code, cancelled, false);
      }
    }, 350);
  };

  useEffect(() => {
    return () => {
      if (langFetchDebounce.current) clearTimeout(langFetchDebounce.current);
    };
  }, []);

  const scrollToCategory = (id: string) => {
    categoryRefs.current[id]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const restaurantTheme = menuMeta?.restaurant;
  const activeBrandPalette = resolvePublicPalette(
    restaurantTheme,
    publicThemeMode,
  );

  // Seed the theme from the restaurant's defaultTheme exactly once, on first load.
  // After that, the user's localStorage choice or in-session toggle takes precedence.
  // Re-runs if the restaurantId changes (navigation to a different restaurant).
  useEffect(() => {
    if (!restaurantTheme?.defaultTheme) return;
    if (themeInitialized.current) return;
    themeInitialized.current = true;
    const fallback =
      (restaurantTheme.defaultTheme as BrandMode | undefined) ?? "light";
    setPublicThemeMode(getStoredPublicTheme(restaurantId, fallback));
  }, [restaurantId, restaurantTheme?.defaultTheme]);

  // Reset initialization flag when navigating to a different restaurant.
  useEffect(() => {
    themeInitialized.current = false;
  }, [restaurantId]);

  // Dietary/allergen tags derived from all currently loaded items
  const dietTags: { tag: string; count: number }[] = (() => {
    const tagCounts = new Map<string, number>();
    for (const item of allLoadedItems) {
      const tags = [...(item.allergens ?? []), ...(item.dietaryTags ?? [])];
      for (const tag of tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }
    return [...tagCounts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => a.tag.localeCompare(b.tag));
  })();

  const themeVars = restaurantTheme
    ? ({
        "--font-heading": restaurantTheme.fontHeading
          ? `"${restaurantTheme.fontHeading}", serif`
          : undefined,
        "--font-body": restaurantTheme.fontBody
          ? `"${restaurantTheme.fontBody}", sans-serif`
          : undefined,
        "--color-accent":
          activeBrandPalette?.accent ||
          restaurantTheme.accentColor ||
          undefined,
        "--color-primary":
          activeBrandPalette?.accent ||
          restaurantTheme.accentColor ||
          undefined,
        "--brand":
          activeBrandPalette?.accent ||
          restaurantTheme.accentColor ||
          undefined,
        "--brand-2":
          activeBrandPalette?.accent ||
          restaurantTheme.accentColor ||
          undefined,
        "--gradient-brand":
          activeBrandPalette?.accent ||
          restaurantTheme.accentColor ||
          undefined,
        "--brand-contrast": activeBrandPalette
          ? getReadableTextColor(activeBrandPalette.accent)
          : undefined,
        ...(activeBrandPalette
          ? {
              "--ambient-primary": hexToRgba(
                activeBrandPalette.accent,
                publicThemeMode === "dark" ? 0.18 : 0.07,
              ),
              "--ambient-secondary": hexToRgba(
                activeBrandPalette.accent,
                publicThemeMode === "dark" ? 0.12 : 0.045,
              ),
              "--custom-bg": activeBrandPalette.bg,
              "--custom-text": activeBrandPalette.text,
              "--custom-card": activeBrandPalette.card,
              // Set these directly on the wrapper so child elements inherit them,
              // overriding the .dark { !important } vars on html.
              "--color-background": activeBrandPalette.bg,
              "--color-foreground": activeBrandPalette.text,
              "--color-card": activeBrandPalette.card,
              "--color-card-foreground": activeBrandPalette.text,
              "--color-popover": activeBrandPalette.bg,
              "--color-popover-foreground": activeBrandPalette.text,
              "--color-secondary": hexToRgba(
                activeBrandPalette.text,
                publicThemeMode === "dark" ? 0.12 : 0.07,
              ),
              "--color-secondary-foreground": activeBrandPalette.text,
              "--color-muted": hexToRgba(
                activeBrandPalette.text,
                publicThemeMode === "dark" ? 0.13 : 0.075,
              ),
              "--color-muted-foreground": hexToRgba(
                activeBrandPalette.text,
                0.62,
              ),
              "--color-border": hexToRgba(
                activeBrandPalette.text,
                publicThemeMode === "dark" ? 0.15 : 0.12,
              ),
              "--color-input": hexToRgba(
                activeBrandPalette.text,
                publicThemeMode === "dark" ? 0.15 : 0.12,
              ),
              "--color-bg-elev": activeBrandPalette.card,
              "--color-bg-muted": hexToRgba(
                activeBrandPalette.text,
                publicThemeMode === "dark" ? 0.1 : 0.05,
              ),
              "--color-bg-section": activeBrandPalette.bg,
              "--glass-opacity": publicThemeMode === "dark" ? "0.88" : "0.95",
              "--shadow-sm":
                publicThemeMode === "dark"
                  ? `0 1px 2px ${hexToRgba("#000000", 0.34)}`
                  : `0 1px 2px ${hexToRgba(activeBrandPalette.text, 0.08)}`,
              "--shadow-md":
                publicThemeMode === "dark"
                  ? `0 10px 26px ${hexToRgba("#000000", 0.38)}`
                  : `0 10px 26px ${hexToRgba(activeBrandPalette.text, 0.1)}`,
              "--shadow-lg":
                publicThemeMode === "dark"
                  ? `0 24px 60px ${hexToRgba("#000000", 0.46)}`
                  : `0 24px 60px ${hexToRgba(activeBrandPalette.text, 0.12)}`,
              "--color-primary-foreground": getReadableTextColor(
                activeBrandPalette.accent,
              ),
              "--color-accent-foreground": getReadableTextColor(
                activeBrandPalette.accent,
              ),
              "--color-ring": activeBrandPalette.accent,
            }
          : {}),
      } as React.CSSProperties)
    : {};

  return (
    <div
      dir={RTL_LANGS.has(selectedLang) ? "rtl" : "ltr"}
      className="relative min-h-screen premium-bg text-foreground selection:bg-primary/30 transition-colors duration-1000"
      style={{
        ...themeVars,
        fontFamily: "var(--font-body, inherit)",
        paddingBottom: showActionBar
          ? "max(8rem, calc(5rem + env(safe-area-inset-bottom, 0px)))"
          : "2rem",
      }}
    >
      {paymentBanner && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl px-4 py-3 text-white shadow-lg max-w-[92vw] ${
            paymentBanner.ok ? "bg-green-600" : "bg-amber-600"
          }`}
        >
          <span className="text-sm font-semibold">{paymentBanner.text}</span>
          <button
            type="button"
            onClick={() => setPaymentBanner(null)}
            className="text-white/80 hover:text-white text-lg leading-none"
            aria-label={t("common.close", "Close")}
          >
            ×
          </button>
        </div>
      )}

      {/* Ambient Depth Background */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-[10%] -right-[10%] w-[60%] h-[60%] rounded-full opacity-10 blur-[120px] transition-colors duration-1000"
          style={{
            backgroundColor:
              activeBrandPalette?.accent ||
              menuMeta?.restaurant?.accentColor ||
              "var(--color-accent)",
          }}
        />
        <div
          className="absolute -bottom-[10%] -left-[10%] w-[50%] h-[50%] rounded-full opacity-5 blur-[100px] transition-colors duration-1000"
          style={{
            backgroundColor:
              activeBrandPalette?.accent ||
              menuMeta?.restaurant?.accentColor ||
              "var(--color-accent)",
          }}
        />
      </div>

      <div className="relative z-10 container mx-auto px-4 max-w-4xl">
        {/* Social Bar — restaurant name + social icons (top) */}
        <SocialBar
          restaurantName={menuMeta?.restaurant?.name ?? ""}
          logoUrl={menuMeta?.restaurant?.logoUrl}
          websiteUrl={menuMeta?.restaurant?.websiteUrl}
          facebookUrl={menuMeta?.restaurant?.facebookUrl}
          instagramUrl={menuMeta?.restaurant?.instagramUrl}
          tiktokUrl={menuMeta?.restaurant?.tiktokUrl}
          youtubeUrl={menuMeta?.restaurant?.youtubeUrl}
        />

        <TopBar
          tableNumber={tableNumber}
          targetLanguages={menuMeta?.restaurant?.targetLanguages ?? []}
          selectedLang={selectedLang}
          onLanguageChange={handleLanguageChange}
          restaurantId={restaurantId}
          defaultTheme={
            (restaurantTheme?.defaultTheme as "light" | "dark") ?? "light"
          }
          onThemeChange={setPublicThemeMode}
          onFilterClick={() => setFilterDrawerOpen(true)}
          filtersActive={hasActiveFilters}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          languagesEnabled={languagesEnabled}
        />

        {assistanceSent && (
          <div className="glass-panel border-l-4 border-emerald-500 text-emerald-600 dark:text-emerald-400 p-4 mb-8 rounded-2xl shadow-xl animate-in zoom-in-95 duration-300">
            <p className="font-bold">
              <FontAwesomeIcon icon={faCircleCheck} className="mr-1" />
              {t("publicMenu.staffNotified")}
            </p>
          </div>
        )}

        {assistanceError && (
          <div className="glass-panel border-l-4 border-destructive text-destructive p-4 mb-8 rounded-2xl shadow-xl animate-in zoom-in-95 duration-300">
            <p className="font-bold">
              {t(
                "publicMenu.assistanceError",
                "Couldn't reach staff. Please try again or ask a waiter.",
              )}
            </p>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-32 space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            <p className="text-muted-foreground font-medium opacity-60">
              {t("publicMenu.preparingMenu", "Preparing your menu...")}
            </p>
          </div>
        )}

        {error && (
          <div className="glass-panel border-t-4 border-destructive p-12 rounded-[2.5rem] shadow-2xl mb-8 text-center animate-in fade-in duration-500">
            <h3 className="text-2xl font-display font-bold mb-4">{error}</h3>
            <p className="text-muted-foreground mb-6">
              {t(
                "publicMenu.checkLink",
                "Please check the link or ask staff for assistance.",
              )}
            </p>
            <Button
              onClick={() => window.location.reload()}
              variant="outline"
              className="rounded-xl"
            >
              {t("publicMenu.tryAgain", "Try Again")}
            </Button>
          </div>
        )}

        {!loading && !error && menuMeta && (
          <>
            {menuMeta.categories.length === 0 ? (
              <div className="text-center glass-panel p-20 rounded-[3rem] mt-8">
                <p className="text-2xl font-display font-bold opacity-30">
                  {t("publicMenu.noItems")}
                </p>
              </div>
            ) : (
              <>
                {/* Trending Carousel */}
                {upsellEnabled && restaurantId && (
                  <div className="mt-4">
                    <TrendingCarousel
                      restaurantId={restaurantId}
                      allMenuItems={allLoadedItems}
                      selectedLang={selectedLang}
                    />
                  </div>
                )}

                {/* Filter Panel */}
                <FilterPanel
                  isOpen={filterDrawerOpen}
                  onClose={() => setFilterDrawerOpen(false)}
                  dietTags={dietTags}
                  activeDietTags={activeDietTags}
                  onDietTagToggle={toggleDietTag}
                  excludedAllergens={excludedAllergens}
                  onAllergenToggle={toggleAllergen}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  filtersActive={hasActiveFilters}
                  onClearFilters={clearFilters}
                />

                {/* Category Horizontal Scroll Pills */}
                <CategoryPills
                  categories={menuMeta.categories}
                  activeCategory={activeCategory}
                  selectedLang={selectedLang}
                  onSelect={scrollToCategory}
                />

                <div className="space-y-14 md:space-y-24">
                  {menuMeta.categories.map((category: any) => {
                    const catName =
                      (selectedLang &&
                        category.translations?.[selectedLang]?.name) ||
                      category.name;
                    const categoryItems = loadedItemsMap[category.id];
                    const isItemsLoading =
                      categoryItems === null || categoryItems === undefined;

                    // Compute filtered items at map level so we can suppress the whole category during search
                    const filteredItems = isItemsLoading
                      ? []
                      : (() => {
                          let result = categoryItems as any[];
                          if (searchQuery.trim()) {
                            const q = searchQuery.toLowerCase();
                            result = result.filter((item: any) => {
                              if (item.name.toLowerCase().includes(q))
                                return true;
                              if (
                                (item.description ?? "")
                                  .toLowerCase()
                                  .includes(q)
                              )
                                return true;
                              if (
                                selectedLang &&
                                item.translations?.[selectedLang]
                              ) {
                                const tr = item.translations[selectedLang];
                                if ((tr.name ?? "").toLowerCase().includes(q))
                                  return true;
                                if (
                                  (tr.description ?? "")
                                    .toLowerCase()
                                    .includes(q)
                                )
                                  return true;
                              }
                              return false;
                            });
                          }
                          if (activeDietTags.length > 0) {
                            result = result.filter((item: any) =>
                              activeDietTags.every((tag) =>
                                [
                                  ...(item.allergens ?? []),
                                  ...(item.dietaryTags ?? []),
                                ].includes(tag),
                              ),
                            );
                          }
                          if (excludedAllergens.length > 0) {
                            result = result.filter(
                              (item: any) =>
                                !excludedAllergens.some((allergen) =>
                                  (item.allergens ?? []).some(
                                    (a: string) =>
                                      a.toLowerCase() ===
                                      allergen.toLowerCase(),
                                  ),
                                ),
                            );
                          }
                          return result;
                        })();

                    // Hide entire category when search or filters yield no matches
                    if (
                      !isItemsLoading &&
                      (searchQuery.trim() || hasActiveFilters) &&
                      filteredItems.length === 0
                    ) {
                      return null;
                    }

                    return (
                      <div
                        key={category.id}
                        id={category.id}
                        ref={(el) => {
                          categoryRefs.current[category.id] = el;
                        }}
                        className="scroll-mt-32"
                      >
                        {category.imageUrl ? (
                          <div className="relative rounded-[2.5rem] overflow-hidden mb-8 md:mb-12 aspect-[2/1] md:aspect-[3/1] shadow-2xl">
                            <img
                              src={getImageUrl(category.imageUrl)}
                              alt={catName}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                            <div className="absolute bottom-0 left-0 right-0 p-5 md:p-8">
                              <h2
                                className="text-3xl md:text-5xl font-display font-bold tracking-tight mb-2 drop-shadow-lg"
                                style={{
                                  fontFamily: "var(--font-heading, inherit)",
                                  color: "white",
                                }}
                              >
                                {catName}
                              </h2>
                              <div className="w-12 h-1 bg-white/60 rounded-full"></div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center mb-8 md:mb-12">
                            <h2
                              className="text-3xl md:text-5xl font-display font-bold tracking-tight mb-3"
                              style={{
                                fontFamily: "var(--font-heading, inherit)",
                              }}
                            >
                              {catName}
                            </h2>
                            <div className="w-12 h-1 bg-accent rounded-full"></div>
                          </div>
                        )}

                        {isItemsLoading ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-8">
                            {[...Array(4)].map((_, i) => (
                              <div
                                key={i}
                                className="h-24 rounded-2xl bg-muted/20 animate-pulse"
                              />
                            ))}
                          </div>
                        ) : filteredItems.length === 0 ? (
                          <p className="text-center text-muted-foreground text-sm py-8 opacity-50">
                            {t(
                              "publicMenu.noItemsMatchFilter",
                              "No items match this filter",
                            )}
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-8">
                            {filteredItems.map((item: any) => {
                              const translatedItem = {
                                ...item,
                                name:
                                  (selectedLang &&
                                    item.translations?.[selectedLang]?.name) ||
                                  item.name,
                                description:
                                  (selectedLang &&
                                    item.translations?.[selectedLang]
                                      ?.description) ||
                                  item.description,
                              };
                              const pairings = upsellEnabled
                                ? allLoadedItems.filter((i: any) =>
                                    item.relatedItemIds?.includes(i.id),
                                  )
                                : [];
                              return (
                                <ItemWithOptions
                                  key={item.id}
                                  item={translatedItem}
                                  perfectPairings={pairings}
                                  ordersEnabled={ordersEnabled}
                                  lang={selectedLang}
                                />
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {/* No-table notice */}
        {noTableNotice && (
          <div
            className="fixed left-0 right-0 z-50 flex justify-center px-4 md:px-6 pointer-events-none"
            style={{
              bottom:
                "calc(max(1.5rem, env(safe-area-inset-bottom, 0px) + 0.75rem) + 5rem)",
            }}
          >
            <div
              className="glass-panel max-w-[480px] w-full px-5 py-3.5 rounded-2xl border-primary/30 text-sm font-semibold text-foreground/80 text-center animate-in fade-in slide-in-from-bottom-2 duration-300"
              role="alert"
              aria-live="polite"
            >
              {t(
                "publicMenu.scanQrForAssistance",
                "Scan your table's QR code to call for assistance",
              )}
            </div>
          </div>
        )}

        {/* Action Bar — hidden on FREE tier (no icons to show) */}
        {showActionBar && (
          <div
            className="fixed left-0 right-0 z-50 flex justify-center pointer-events-none px-4 md:px-6"
            style={{
              bottom:
                "max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))",
            }}
          >
            <div
              className={`flex items-center w-full max-w-[480px] ${ordersEnabled ? "justify-between" : "justify-end"} p-1.5 md:p-2.5 glass-panel rounded-[2rem] md:rounded-[2.5rem] shadow-[0_30px_70px_-15px_rgba(0,0,0,0.5)] border-white/20 dark:border-white/10 pointer-events-auto bg-white/90 dark:bg-black/90`}
            >
              {/* LEFT GROUP: Waiter + Profile/Sign-In */}
              <div className="flex items-center gap-0.5">
                {callWaiterEnabled && (
                  <button
                    onClick={() => {
                      if (assistanceSent || assistanceLoading) return;
                      if (!tableNumber) {
                        handleAssistanceRequest();
                        return;
                      }
                      setIsAssistanceDialogOpen(true);
                    }}
                    disabled={assistanceSent || assistanceLoading}
                    aria-label={
                      tableNumber
                        ? t("publicMenu.callWaiter")
                        : t(
                            "publicMenu.scanQrForAssistance",
                            "Scan QR to call waiter",
                          )
                    }
                    className="flex items-center justify-center p-2.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-60 disabled:cursor-not-allowed transition-all min-h-[44px] min-w-[44px]"
                  >
                    <div className="relative">
                      <Bell className="h-5 w-5 text-primary" />
                      {tableNumber && !assistanceSent && (
                        <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-destructive rounded-full border-2 border-white dark:border-black" />
                      )}
                    </div>
                  </button>
                )}

                {customersAuthEnabled &&
                  (user ? (
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() =>
                          navigate(
                            `/profile?returnTo=${encodeURIComponent(location.pathname + location.search)}`,
                          )
                        }
                        aria-label={t("publicMenu.myProfile")}
                        className="flex items-center justify-center p-2.5 min-h-[44px] min-w-[44px] hover:opacity-70 transition-opacity text-primary"
                      >
                        <UserCircle className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => logout()}
                        aria-label={t("publicMenu.logout")}
                        className="p-2.5 hover:opacity-70 transition-opacity"
                      >
                        <LogOut className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsLoginModalOpen(true)}
                      className="px-3 py-2 rounded-xl bg-secondary text-secondary-foreground text-[10px] font-black uppercase tracking-wider hover:bg-secondary/80 transition-colors"
                    >
                      {t("publicMenu.signIn", "Sign In")}
                    </button>
                  ))}
              </div>

              {/* RIGHT GROUP: Bill + Cart */}
              <div className="flex items-center gap-0.5">
                {sessionToken && paymentsEnabled && (
                  <Button
                    variant="default"
                    size="sm"
                    className="brand-cta text-white text-[10px] px-3 py-2 rounded-xl font-bold"
                    onClick={async () => {
                      try {
                        await getSessionBill(sessionToken);
                        setIsPaymentModalOpen(true);
                      } catch (err: any) {
                        // Only forget the session when the server says it is
                        // truly gone (404/410). Transient network/5xx errors must
                        // NOT delete a still-valid session token.
                        const status = err?.response?.status;
                        if (status === 404 || status === 410) {
                          setSessionToken(null);
                          if (tableNumber)
                            localStorage.removeItem(
                              `session-${restaurantId}-${tableNumber}`,
                            );
                        }
                      }
                    }}
                  >
                    {t("payment.requestBill")}
                  </Button>
                )}
                {ordersEnabled && (
                  <div className="flex-shrink-0">
                    <CartIcon
                      categories={categoriesForCart}
                      restaurantId={restaurantId}
                      selectedLang={selectedLang}
                      tier={tier}
                      features={features}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Assistance dialog */}
      {isAssistanceDialogOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 px-4"
          onClick={() => setIsAssistanceDialogOpen(false)}
        >
          <div
            className="bg-card text-card-foreground rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-6 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-border rounded-full mx-auto sm:hidden" />
            <h2 className="text-lg font-bold text-foreground text-center">
              {t("publicMenu.howCanWeHelp", "How can we help?")}
            </h2>
            <p className="text-sm text-muted-foreground text-center">
              {t(
                "publicMenu.selectAssistanceType",
                "Choose the type of help you need",
              )}
            </p>
            <div className="space-y-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsAssistanceDialogOpen(false);
                  handleAssistanceRequest("STANDARD");
                }}
                className="w-full flex items-center gap-3 p-4 rounded-xl border border-border hover:bg-secondary/60 transition-colors text-left min-h-[56px]"
              >
                <Bell className="h-5 w-5 text-primary flex-shrink-0" />
                <div>
                  <p className="font-bold text-sm text-foreground">
                    {t("publicMenu.callWaiter", "Call Waiter")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "publicMenu.callWaiterDesc",
                      "I'd like to order or ask a question",
                    )}
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAssistanceDialogOpen(false);
                  handleAssistanceRequest("URGENT");
                }}
                className="w-full flex items-center gap-3 p-4 rounded-xl border border-destructive/30 hover:bg-destructive/5 transition-colors text-left min-h-[56px]"
              >
                <AlertTriangle className="w-5 h-5 flex-shrink-0 text-destructive" />
                <div>
                  <p className="font-bold text-sm text-foreground">
                    {t("publicMenu.needHelp", "Need Urgent Help")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "publicMenu.needHelpDesc",
                      "I need immediate assistance",
                    )}
                  </p>
                </div>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setIsAssistanceDialogOpen(false)}
              className="w-full py-3 rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors min-h-[44px]"
            >
              {t("common.cancel", "Cancel")}
            </button>
          </div>
        </div>
      )}

      {customersAuthEnabled && (
        <CustomerLoginModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
          returnTo={location.pathname + location.search}
        />
      )}

      {isPaymentModalOpen &&
        sessionToken &&
        restaurantId &&
        paymentsEnabled && (
          <PaymentModal
            sessionToken={sessionToken}
            ownedOrderIds={ownedOrderIds}
            onClose={() => setIsPaymentModalOpen(false)}
            onSuccess={() => clearPaidSession()}
            onCashRequestCreated={setPendingCashRequestId}
          />
        )}

      {/* Footer */}
      <Footer
        restaurantName={menuMeta?.restaurant?.name ?? ""}
        address={menuMeta?.restaurant?.address}
        contactInfo={menuMeta?.restaurant?.contactInfo}
        websiteUrl={menuMeta?.restaurant?.websiteUrl}
        facebookUrl={menuMeta?.restaurant?.facebookUrl}
        instagramUrl={menuMeta?.restaurant?.instagramUrl}
        tiktokUrl={menuMeta?.restaurant?.tiktokUrl}
        youtubeUrl={menuMeta?.restaurant?.youtubeUrl}
      />
    </div>
  );
};

export default PublicMenuPage;
