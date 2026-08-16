import { useCallback, useState, useEffect, useRef, useMemo } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import type { Restaurant } from "../services/restaurantService";
import {
  createAssistanceRequest,
  getSessionBill,
  resolvePublicServicePoint,
} from "../lib/api";
import { buildPublicMenuLanguages } from "../lib/menuLanguage";
import { getTranslatedArray } from "../lib/translation";
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
import { usePaymentReturn } from "../hooks/usePaymentReturn";
import { useMenuSocket } from "../hooks/useMenuSocket";
import { usePublicMenuData } from "../hooks/usePublicMenuData";
import { useCanonicalUrl } from "../hooks/useCanonicalUrl";
import { getMenuUrl, normalizeRestaurantId } from "../lib/menuUrl";
import NotFoundPage from "./NotFoundPage";
import {
  storePaymentConfirmationContext,
  type PaymentCompletionDetails,
} from "../lib/paymentConfirmationContext";

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

const PublicMenuContent = ({ restaurantId }: { restaurantId: string }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const { setTableNumber, orderLocation, setOrderLocation } = useCart();

  // Menu data lifecycle: meta + batched items fetch, language resolution, view
  // tracking, and cart hygiene. Table/session bootstrap stays below.
  const {
    menuMeta,
    loadedItemsMap,
    setLoadedItemsMap,
    loading,
    error,
    selectedLang,
    activeLanguageRef,
    changeLanguage,
    allLoadedItems,
  } = usePublicMenuData(restaurantId);

  const [tableNumber, setTableNumberState] = useState<string | null>(null);
  const [servicePointResolution, setServicePointResolution] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [assistanceSent, setAssistanceSent] = useState(false);
  const [assistanceLoading, setAssistanceLoading] = useState(false);
  const [assistanceError, setAssistanceError] = useState(false);
  const [noTableNotice, setNoTableNotice] = useState(false);
  const ASSIST_COOLDOWN_MS = 60000;
  const assistCooldownKey =
    restaurantId && tableNumber
      ? `assist-cd-${restaurantId}-${tableNumber}`
      : null;
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

  const { t } = useTranslation();
  const { user, logout } = useAuth();
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
  const tableCallWaiterEnabled = callWaiterEnabled && !!tableNumber;
  const requestedServicePointToken = useMemo(
    () => new URLSearchParams(location.search).get("sp"),
    [location.search],
  );
  const servicePointReady =
    !requestedServicePointToken || servicePointResolution === "ready";
  const showActionBar =
    (ordersEnabled && servicePointReady) ||
    tableCallWaiterEnabled ||
    customersAuthEnabled;
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
  const hasActiveFilters =
    activeDietTags.length > 0 || excludedAllergens.length > 0;
  const sessionLocationKey =
    tableNumber ?? (orderLocation?.token ? `sp-${orderLocation.token}` : null);
  const sessionStorageKey =
    restaurantId && sessionLocationKey
      ? `session-${restaurantId}-${sessionLocationKey}`
      : null;
  const canRequestBill =
    paymentsEnabled &&
    (!orderLocation || orderLocation.paymentMethods.includes("ONLINE"));

  const clearPaidSession = useCallback(
    (completion?: PaymentCompletionDetails) => {
      const tokenToClear = sessionToken;
      setIsPaymentModalOpen(false);
      if (restaurantId && sessionLocationKey && tokenToClear) {
        clearOwnedOrderIds(restaurantId, sessionLocationKey, tokenToClear);
        if (sessionStorageKey) localStorage.removeItem(sessionStorageKey);
      }
      setSessionToken(null);
      setOwnedOrderIds([]);
      setPendingCashRequestId(null);
      if (completion?.paymentId && tokenToClear) {
        storePaymentConfirmationContext({
          paymentId: completion.paymentId,
          sessionToken: tokenToClear,
          ...(typeof completion.amount === "number"
            ? { amount: completion.amount }
            : {}),
          ...(completion.provider ? { provider: completion.provider } : {}),
          ...(typeof completion.remaining === "number"
            ? { remaining: completion.remaining }
            : {}),
          ...(restaurantId ? { restaurantId } : {}),
          menuReturnUrl: `${location.pathname}${location.search}`,
          ...(tableNumber ? { tableNumber } : {}),
          completedAt: Date.now(),
        });
        navigate("/payment-confirmation", { replace: true });
      } else {
        setPaymentBanner({
          ok: true,
          text: t("payment.paymentReceived", "Payment received successfully"),
        });
      }
    },
    [
      location.pathname,
      location.search,
      navigate,
      restaurantId,
      sessionLocationKey,
      sessionStorageKey,
      sessionToken,
      t,
      tableNumber,
    ],
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

  // Categories merged with loaded items — used by CartIcon for name resolution
  const categoriesForCart = useMemo(
    () =>
      menuMeta?.categories.map((cat: any) => ({
        ...cat,
        items: Array.isArray(loadedItemsMap[cat.id])
          ? (loadedItemsMap[cat.id] as any[])
          : [],
      })) ?? [],
    [menuMeta, loadedItemsMap],
  );

  // Hosted-checkout (ePay / BORICA / myPOS) return + pageshow-abandon handling.
  usePaymentReturn({
    restaurantId,
    sessionToken,
    setSessionToken,
    setIsPaymentModalOpen,
    setPaymentBanner,
  });

  useEffect(() => {
    if (!paymentBanner) return;
    const timer = setTimeout(() => setPaymentBanner(null), 8000);
    return () => clearTimeout(timer);
  }, [paymentBanner]);

  // Realtime: table-session payment pushes + live "86" availability.
  useMenuSocket({
    restaurantId,
    sessionToken,
    clearPaidSession,
    pendingCashRequestId,
    setPendingCashRequestId,
    setIsPaymentModalOpen,
    setPaymentBanner,
    setLoadedItemsMap,
    activeLanguageRef,
  });

  // Table + session bootstrap from the URL. The menu-data fetch lives in
  // usePublicMenuData; the two halves are order-independent (this reads the
  // table/lang from the URL, never from menu-data state), so they run as
  // separate effects with no behaviour change.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const table = params.get("table");
    const servicePointToken = params.get("sp");
    let cancelled = false;

    if (servicePointToken && restaurantId) {
      setTableNumberState(null);
      setTableNumber(null);
      setOrderLocation(null);
      setSessionToken(null);
      setServicePointResolution("loading");

      resolvePublicServicePoint(restaurantId, servicePointToken)
        .then((servicePoint) => {
          if (cancelled) return;
          setOrderLocation({
            type: servicePoint.type,
            label: servicePoint.name,
            token: servicePoint.publicToken,
            fulfillmentModes: servicePoint.fulfillmentModes,
            paymentMethods: servicePoint.paymentMethods,
          });
          setServicePointResolution("ready");
          const stored = localStorage.getItem(
            `session-${restaurantId}-sp-${servicePointToken}`,
          );
          setSessionToken(stored);
        })
        .catch(() => {
          if (cancelled) return;
          setOrderLocation(null);
          setServicePointResolution("error");
        });

      return () => {
        cancelled = true;
      };
    }

    setOrderLocation(null);
    setServicePointResolution("idle");
    setTableNumberState(table);
    if (table) {
      setTableNumber(table);
      const stored = localStorage.getItem(`session-${restaurantId}-${table}`);
      if (stored) setSessionToken(stored);
    } else {
      setTableNumber(null);
      setSessionToken(null);
    }
    return () => {
      cancelled = true;
    };
  }, [restaurantId, location.search, setOrderLocation, setTableNumber]);

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
    if (sessionStorageKey) {
      const stored = localStorage.getItem(sessionStorageKey);
      setSessionToken(stored);
    }
  }, [sessionStorageKey]);

  useEffect(() => {
    setOwnedOrderIds(
      getOwnedOrderIds(restaurantId, sessionLocationKey, sessionToken),
    );
  }, [restaurantId, sessionLocationKey, sessionToken, isPaymentModalOpen]);

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
    const createdLinks: HTMLLinkElement[] = [];

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
          createdLinks.push(link);
        }
      });
    }

    return () => {
      createdLinks.forEach((link) => link.remove());
    };
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
    // Filter values and search terms are language-specific display strings.
    // Clear them so values selected in the previous language cannot hide every
    // item once translated allergen/tag values replace them, then hand the
    // data reload (i18n + debounced fetch + meta merge) to the data hook.
    clearFilters();
    setSearchQuery("");
    changeLanguage(code);
  };

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

  // Point search engines at the vanity URL even when the visitor arrived via a
  // printed legacy QR code. No redirect — a 301 on every scan would cost a
  // round trip on restaurant wifi for something the canonical tag already does.
  // Routed through the same getMenuUrl seam every other menu URL uses — kept
  // guarded so a missing slug still yields null and useCanonicalUrl no-ops
  // rather than falling back to a legacy canonical.
  useCanonicalUrl(
    restaurantTheme?.slug
      ? getMenuUrl({ id: restaurantId, slug: restaurantTheme.slug })
      : null,
  );

  // Languages selectable on the public menu: the menu source language first
  // (what the owner authors in — NOT their dashboard UI language), then the
  // configured target languages (deduplicated).
  const availableLanguages = buildPublicMenuLanguages(
    menuMeta?.restaurant?.menuSourceLanguage,
    menuMeta?.restaurant?.targetLanguages,
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

  // Dietary and allergen tags are aggregated separately, straight from the item
  // fields (item.allergens vs item.dietaryTags). This keeps the two groups apart
  // without a language-specific keyword list, so allergens entered in any
  // language classify correctly. Must stay on the raw canonical value
  // (item[field]) rather than the translated display array — resolveTag()
  // matches preset tags by their stable key ("organic"), not by a cached
  // DeepL translation of it ("биологичен"), which was silently breaking
  // icon lookups (and surfacing stale/garbled pre-preset-system
  // translations like "halal" -> "да избере") for any tag with a cached
  // translation. The translated array is now only a fallback for legacy
  // free-text tags that have no raw value at all.
  const aggregateTags = useCallback(
    (field: "allergens" | "dietaryTags"): { tag: string; count: number }[] => {
      const tagCounts = new Map<string, number>();
      for (const item of allLoadedItems) {
        const tags =
          item[field] ?? getTranslatedArray(item, selectedLang, field) ?? [];
        for (const tag of tags) {
          tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
        }
      }
      return [...tagCounts.entries()]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => a.tag.localeCompare(b.tag));
    },
    [allLoadedItems, selectedLang],
  );
  const allergenTags = useMemo(
    () => aggregateTags("allergens"),
    [aggregateTags],
  );
  const dietaryTags = useMemo(
    () => aggregateTags("dietaryTags"),
    [aggregateTags],
  );

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
            className="flex min-h-[44px] min-w-[44px] items-center justify-center text-lg leading-none text-white/80 hover:text-white"
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
          tableNumber={tableNumber ?? orderLocation?.label ?? null}
          targetLanguages={availableLanguages}
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

        {servicePointResolution === "error" && (
          <div className="mb-8 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive shadow-sm">
            <p className="font-bold">
              {t(
                "servicePoints.invalidQr",
                "This service-point QR is invalid or inactive. Please scan the current QR or ask staff for help.",
              )}
            </p>
          </div>
        )}

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
                      sourceLang={menuMeta.restaurant.menuSourceLanguage}
                    />
                  </div>
                )}

                {/* Filter Panel */}
                <FilterPanel
                  isOpen={filterDrawerOpen}
                  onClose={() => setFilterDrawerOpen(false)}
                  dietaryTags={dietaryTags}
                  allergenTags={allergenTags}
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
                      category.originalName ||
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
                              loading="lazy"
                              decoding="async"
                              sizes="(min-width: 768px) 896px, 100vw"
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
                                  item.originalName ||
                                  item.name,
                                description:
                                  (selectedLang &&
                                    item.translations?.[selectedLang]
                                      ?.description) ||
                                  item.originalDescription ||
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
                {tableCallWaiterEnabled && (
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
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center p-2.5 hover:opacity-70 transition-opacity"
                      >
                        <LogOut className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsLoginModalOpen(true)}
                      className="min-h-[44px] px-3 py-2 rounded-xl bg-secondary text-secondary-foreground text-[10px] font-black uppercase tracking-wider hover:bg-secondary/80 transition-colors"
                    >
                      {t("publicMenu.signIn", "Sign In")}
                    </button>
                  ))}
              </div>

              {/* RIGHT GROUP: Bill + Cart */}
              <div className="flex items-center gap-0.5">
                {sessionToken && canRequestBill && (
                  <Button
                    variant="default"
                    size="sm"
                    className="brand-cta min-h-[44px] text-white text-[10px] px-3 py-2 rounded-xl font-bold"
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
                          if (sessionStorageKey)
                            localStorage.removeItem(sessionStorageKey);
                        }
                      }
                    }}
                  >
                    {t("payment.requestBill")}
                  </Button>
                )}
                {ordersEnabled && servicePointReady && (
                  <div className="flex-shrink-0">
                    <CartIcon
                      categories={categoriesForCart}
                      restaurantId={restaurantId}
                      selectedLang={selectedLang}
                      tier={tier}
                      features={features}
                      paymentsEnabled={paymentsEnabled}
                      themeVars={themeVars}
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
            onSuccess={clearPaidSession}
            onCashRequestCreated={setPendingCashRequestId}
          />
        )}

      {/* Footer */}
      <Footer
        restaurantName={menuMeta?.restaurant?.name ?? ""}
        address={menuMeta?.restaurant?.address}
        city={menuMeta?.restaurant?.city}
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

const PublicMenuPage = ({
  restaurantIdOverride,
}: { restaurantIdOverride?: string } = {}) => {
  const params = useParams<{ restaurantId: string }>();
  const restaurantId =
    restaurantIdOverride ?? normalizeRestaurantId(params.restaurantId);

  if (!restaurantId) return <NotFoundPage />;

  return <PublicMenuContent restaurantId={restaurantId} />;
};

export default PublicMenuPage;
