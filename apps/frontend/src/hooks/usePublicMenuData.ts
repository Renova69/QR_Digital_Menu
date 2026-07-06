import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Restaurant } from "../services/restaurantService";
import { getMenuMeta, getAllCategoryItems, recordMenuView } from "../lib/api";
import { getVisitorId } from "../lib/visitorId";
import {
  buildPublicMenuLanguages,
  resolveInitialLanguage,
} from "../lib/menuLanguage";
import { useCart } from "../context/CartContext";

export interface PublicMenuMeta {
  restaurant: Restaurant;
  categories: any[];
}

export interface PublicMenuData {
  menuMeta: PublicMenuMeta | null;
  setMenuMeta: Dispatch<SetStateAction<PublicMenuMeta | null>>;
  loadedItemsMap: Record<string, any[] | null>;
  setLoadedItemsMap: Dispatch<SetStateAction<Record<string, any[] | null>>>;
  loading: boolean;
  error: string | null;
  selectedLang: string;
  setSelectedLang: Dispatch<SetStateAction<string>>;
  activeLanguageRef: MutableRefObject<string>;
  langFetchDebounce: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  loadAllCategoryItems: (
    categories: any[],
    lang: string | undefined,
    cancelled: { v: boolean },
    resetFirst?: boolean,
  ) => void;
  allLoadedItems: any[];
}

/**
 * Owns the public menu's data lifecycle: the fast meta paint, the batched
 * per-category items load, language resolution, view-tracking, and the two
 * cart-hygiene effects (clear-on-restaurant-change, prune-stale). Deliberately
 * excludes table/session bootstrap — the caller keeps that; the two are
 * order-independent (this reads `table`/`lang` from the URL, never from session
 * state), so they run as separate effects without a behaviour change.
 */
export function usePublicMenuData(
  restaurantId: string | undefined,
): PublicMenuData {
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const { clearCart, pruneInvalidItems } = useCart();

  const [menuMeta, setMenuMeta] = useState<PublicMenuMeta | null>(null);
  const [loadedItemsMap, setLoadedItemsMap] = useState<
    Record<string, any[] | null>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLang, setSelectedLang] = useState<string>("");

  const viewRecordedRef = useRef<string | null>(null);
  const langFetchId = useRef(0);
  const langFetchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // L-TRANS-3: aborts the previous batch's in-flight category request whenever a
  // newer batch starts (rapid lang switch) or the page unmounts.
  const categoryFetchAbortRef = useRef<AbortController | null>(null);
  const activeLanguageRef = useRef("");

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

  // All items currently loaded across all categories
  const allLoadedItems: any[] = useMemo(
    () =>
      Object.values(loadedItemsMap).flatMap((items) =>
        Array.isArray(items) ? items : [],
      ),
    [loadedItemsMap],
  );

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
    // Free the previous batch's in-flight request instead of letting it run to
    // completion unfreed (L-TRANS-3).
    categoryFetchAbortRef.current?.abort();
    const controller = new AbortController();
    categoryFetchAbortRef.current = controller;
    const stale = () => cancelled.v || langFetchId.current !== myFetchId;

    // Map the batched {categoryId: items} response onto the full category set
    // from meta; any category the batch omits (e.g. it turned unavailable)
    // resolves to an empty list rather than sticking on its skeleton.
    const mapFrom = (itemsByCategory: Record<string, any[]>) =>
      Object.fromEntries(
        categories.map((c: any) => [
          c.id,
          Array.isArray(itemsByCategory[c.id]) ? itemsByCategory[c.id] : [],
        ]),
      );

    // One request fetches every visible category's items (one restaurant read +
    // one DeepL translation batch on the backend) instead of a per-category
    // fan-out that re-read the restaurant row and burst DeepL N times.
    void getAllCategoryItems(restaurantId!, lang, controller.signal)
      .then((itemsByCategory) => {
        if (!stale()) setLoadedItemsMap(mapFrom(itemsByCategory));
      })
      .catch(async () => {
        if (stale()) return;
        // A translated fetch failed — retry once in the default language so the
        // menu still renders instead of hanging on skeletons.
        if (lang) {
          try {
            const fallback = await getAllCategoryItems(
              restaurantId!,
              undefined,
              controller.signal,
            );
            if (!stale()) setLoadedItemsMap(mapFrom(fallback));
            return;
          } catch {
            // fall through to preserve-existing handling
          }
        }
        // Total failure: keep any items already shown, else empty so skeletons
        // resolve rather than spin forever.
        if (!stale())
          setLoadedItemsMap((prev) =>
            Object.fromEntries(
              categories.map((c: any) => [
                c.id,
                Array.isArray(prev[c.id]) ? prev[c.id] : [],
              ]),
            ),
          );
      });
  };

  // Main fetch: meta first, then batched category items.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const table = params.get("table");

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

        const data = await getMenuMeta(
          restaurantId,
          params.get("lang") ?? undefined,
        );
        if (cancelled.v) return;

        if (!data?.restaurant) {
          setError(t("publicMenu.failedLoad"));
          return;
        }

        setMenuMeta(data);

        // The public menu opens in the owner's default (dashboard) language —
        // not the first target language — unless a ?lang= deep-link overrides it.
        const available = buildPublicMenuLanguages(
          data.restaurant?.dashboardLanguage,
          data.restaurant?.targetLanguages,
        );
        const dashboardLang = available[0];
        const initialLang =
          resolveInitialLanguage(available, params.get("lang")) ??
          dashboardLang;
        activeLanguageRef.current = initialLang;
        setSelectedLang(initialLang);
        void i18n.changeLanguage(initialLang);

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
      categoryFetchAbortRef.current?.abort();
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

  // Clean up the debounce timer + any in-flight batch on unmount.
  useEffect(() => {
    return () => {
      if (langFetchDebounce.current) clearTimeout(langFetchDebounce.current);
      categoryFetchAbortRef.current?.abort();
    };
  }, []);

  return {
    menuMeta,
    setMenuMeta,
    loadedItemsMap,
    setLoadedItemsMap,
    loading,
    error,
    selectedLang,
    setSelectedLang,
    activeLanguageRef,
    langFetchDebounce,
    loadAllCategoryItems,
    allLoadedItems,
  };
}
