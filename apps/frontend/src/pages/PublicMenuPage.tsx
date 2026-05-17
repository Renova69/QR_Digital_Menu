import { useState, useEffect, useRef } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { getMenuMeta, getCategoryItems, createAssistanceRequest, getSessionBill } from "../lib/api";
import { PaymentModal } from "../components/payment/PaymentModal";
import { useCart } from "../context/CartContext";
import { Button } from "../components/ui/button";
import CartIcon from "../components/cart/CartIcon";
import { ItemWithOptions } from "../components/menu/ItemWithOptions";
import { Bell, LogOut, UserCircle } from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck } from "@fortawesome/free-solid-svg-icons";
import { useTranslation } from "react-i18next";
import { TopBar } from "../components/menu/TopBar";
import { FilterPanel } from "../components/menu/FilterPanel";
import { TrendingCarousel } from "../components/menu/TrendingCarousel";
import { CategoryPills } from "../components/menu/CategoryPills";
import { CustomerLoginModal } from "../components/auth/CustomerLoginModal";
import { useAuth } from "../context/AuthContext";
import { getImageUrl } from "../lib/getImageUrl";

const PublicMenuPage = () => {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const { setTableNumber, pruneInvalidItems } = useCart();
  const [tableNumber, setTableNumberState] = useState<string | null>(null);

  // Phase 1: restaurant branding + category names (fast, no items)
  const [menuMeta, setMenuMeta] = useState<{ restaurant: any; categories: any[] } | null>(null);
  // Phase 2: per-category items — undefined=not started, null=loading, array=loaded
  const [loadedItemsMap, setLoadedItemsMap] = useState<Record<string, any[] | null>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assistanceSent, setAssistanceSent] = useState(false);
  const [assistanceLoading, setAssistanceLoading] = useState(false);
  const [noTableNotice, setNoTableNotice] = useState(false);
  const [selectedLang, setSelectedLang] = useState<string>("");

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isAssistanceDialogOpen, setIsAssistanceDialogOpen] = useState(false);

  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  const ordersEnabled = menuMeta?.restaurant?.tier !== 'FREE';
  const [activeDietTags, setActiveDietTags] = useState<string[]>([]);
  const [excludedAllergens, setExcludedAllergens] = useState<string[]>([]);

  const categoryRefs = useRef<Record<string, HTMLElement | null>>({});
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const langFetchId = useRef(0);

  const toggleDietTag = (tag: string) => {
    setActiveDietTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const toggleAllergen = (allergen: string) => {
    setExcludedAllergens((prev) =>
      prev.includes(allergen) ? prev.filter((a) => a !== allergen) : [...prev, allergen],
    );
  };

  // All items currently loaded across all categories
  const allLoadedItems: any[] = Object.values(loadedItemsMap).flatMap(
    (items) => (Array.isArray(items) ? items : []),
  );

  // Categories merged with loaded items — used by CartIcon for name resolution
  const categoriesForCart = menuMeta?.categories.map((cat: any) => ({
    ...cat,
    items: Array.isArray(loadedItemsMap[cat.id]) ? (loadedItemsMap[cat.id] as any[]) : [],
  })) ?? [];

  // Load all categories for a given lang; called on initial load and lang change.
  // resetFirst=true (initial load) wipes to null (shows skeletons).
  // resetFirst=false (lang switch) keeps existing items visible while translations load.
  const loadAllCategoryItems = (categories: any[], lang: string | undefined, cancelled: { v: boolean }, resetFirst = true) => {
    langFetchId.current += 1;
    const myFetchId = langFetchId.current;
    if (resetFirst) {
      setLoadedItemsMap(Object.fromEntries(categories.map((c: any) => [c.id, null])));
    }
    categories.forEach(async (cat: any) => {
      const stale = () => cancelled.v || langFetchId.current !== myFetchId;
      try {
        const items = await getCategoryItems(restaurantId!, cat.id, lang);
        if (!stale()) setLoadedItemsMap((prev) => ({ ...prev, [cat.id]: items }));
      } catch {
        if (stale()) return;
        // On translation failure, fall back to default-language items
        try {
          const fallback = await getCategoryItems(restaurantId!, cat.id, undefined);
          if (!stale()) setLoadedItemsMap((prev) => ({ ...prev, [cat.id]: fallback }));
        } catch {
          if (!stale()) setLoadedItemsMap((prev) => ({ ...prev, [cat.id]: [] }));
        }
      }
    });
  };

  // Main fetch effect: meta first, then parallel category items
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const table = params.get("table");
    setTableNumberState(table);
    if (table) {
      setTableNumber(table);
      const stored = localStorage.getItem(`session-${table}`);
      if (stored) setSessionToken(stored);
    }

    if (!restaurantId) return;

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
          const browserLang = (i18n.language || "en").slice(0, 2);
          const langs: string[] = data.restaurant.targetLanguages;
          initialLang = langs.includes(browserLang) ? browserLang : langs[0];
          setSelectedLang(initialLang);
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
    return () => { cancelled.v = true; };
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
      console.warn(`[PublicMenu] Removed ${removedCount} stale cart item(s) not present in current menu.`);
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

    const observer = new IntersectionObserver(observerCallback, observerOptions);

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
      const stored = localStorage.getItem(`session-${tableNumber}`);
      setSessionToken(stored);
    }
  }, [tableNumber]);

  useEffect(() => {
    if (menuMeta?.restaurant) {
      const { fontHeading, fontBody } = menuMeta.restaurant;
      const fontsToLoad = new Set<string>();
      if (fontHeading) fontsToLoad.add(fontHeading);
      if (fontBody) fontsToLoad.add(fontBody);

      fontsToLoad.forEach((font) => {
        const linkId = `font-${font.replace(/ /g, "-")}`;
        if (!document.getElementById(linkId)) {
          const link = document.createElement("link");
          link.id = linkId;
          link.rel = "stylesheet";
          link.href = `https://fonts.googleapis.com/css2?family=${font.replace(/ /g, "+")}:wght@400;700;900&display=swap`;
          document.head.appendChild(link);
        }
      });
    }
  }, [menuMeta?.restaurant]);

  const handleAssistanceRequest = async () => {
    if (!tableNumber) {
      setNoTableNotice(true);
      setTimeout(() => setNoTableNotice(false), 3500);
      return;
    }
    if (!restaurantId || assistanceSent || assistanceLoading) return;
    try {
      setAssistanceLoading(true);
      await createAssistanceRequest(tableNumber, restaurantId);
      setAssistanceSent(true);
      setTimeout(() => setAssistanceSent(false), 60000);
    } catch (err) {
      console.error("Assistance Request Error:", err);
    } finally {
      setAssistanceLoading(false);
    }
  };

  const handleLanguageChange = (code: string) => {
    setSelectedLang(code);
    i18n.changeLanguage(code);
    // Re-fetch all category items with the new language
    if (menuMeta?.categories?.length && restaurantId) {
      const cancelled = { v: false };
      loadAllCategoryItems(menuMeta.categories, code, cancelled, false);
    }
  };

  const scrollToCategory = (id: string) => {
    categoryRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const restaurantTheme = menuMeta?.restaurant;
  const hasCustomTheme = !!(restaurantTheme?.themeBgColor && restaurantTheme?.themeTextColor);

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
        "--color-accent": restaurantTheme.accentColor || undefined,
        ...(hasCustomTheme
          ? {
              "--custom-bg": restaurantTheme.themeBgColor,
              "--custom-text": restaurantTheme.themeTextColor,
              "--custom-card": restaurantTheme.themeCardColor || restaurantTheme.themeBgColor,
            }
          : {}),
      } as React.CSSProperties)
    : {};

  return (
    <div
      className="relative min-h-screen premium-bg text-foreground selection:bg-accent/30 transition-colors duration-1000"
      style={{
        ...themeVars,
        fontFamily: "var(--font-body, inherit)",
        paddingBottom: 'max(8rem, calc(5rem + env(safe-area-inset-bottom, 0px)))',
      }}
    >
      {/* Ambient Depth Background */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-[10%] -right-[10%] w-[60%] h-[60%] rounded-full opacity-10 blur-[120px] transition-colors duration-1000"
          style={{ backgroundColor: menuMeta?.restaurant?.accentColor || "var(--color-accent)" }}
        />
        <div
          className="absolute -bottom-[10%] -left-[10%] w-[50%] h-[50%] rounded-full opacity-5 blur-[100px] transition-colors duration-1000"
          style={{ backgroundColor: menuMeta?.restaurant?.accentColor || "var(--color-accent)" }}
        />
      </div>

      <div className="relative z-10 container mx-auto px-4 max-w-4xl">
        <TopBar
          tableNumber={tableNumber}
          targetLanguages={menuMeta?.restaurant?.targetLanguages ?? []}
          selectedLang={selectedLang}
          onLanguageChange={handleLanguageChange}
          restaurantId={restaurantId}
          defaultTheme={(restaurantTheme?.defaultTheme as 'light' | 'dark') ?? 'light'}
          onFilterClick={() => setFilterDrawerOpen(true)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        {assistanceSent && (
          <div className="glass-panel border-l-4 border-emerald-500 text-emerald-600 dark:text-emerald-400 p-4 mb-8 rounded-2xl shadow-xl animate-in zoom-in-95 duration-300">
            <p className="font-bold"><FontAwesomeIcon icon={faCircleCheck} className="mr-1" />{t("publicMenu.staffNotified")}</p>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-32 space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent"></div>
            <p className="text-muted-foreground font-medium opacity-60">
              {t("publicMenu.preparingMenu", "Preparing your menu...")}
            </p>
          </div>
        )}

        {error && (
          <div className="glass-panel border-t-4 border-destructive p-12 rounded-[2.5rem] shadow-2xl mb-8 text-center animate-in fade-in duration-500">
            <h3 className="text-2xl font-serif font-bold mb-4">{error}</h3>
            <p className="text-muted-foreground mb-6">
              {t("publicMenu.checkLink", "Please check the link or ask staff for assistance.")}
            </p>
            <Button onClick={() => window.location.reload()} variant="outline" className="rounded-xl">
              {t("publicMenu.tryAgain", "Try Again")}
            </Button>
          </div>
        )}

        {!loading && !error && menuMeta && (
          <>
            {menuMeta.categories.length === 0 ? (
              <div className="text-center glass-panel p-20 rounded-[3rem] mt-8">
                <p className="text-2xl font-serif font-bold opacity-30">
                  {t("publicMenu.noItems")}
                </p>
              </div>
            ) : (
              <>
                {/* Trending Carousel */}
                {restaurantId && (
                  <div className="mt-8">
                    <TrendingCarousel
                      restaurantId={restaurantId}
                      allMenuItems={allLoadedItems}
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
                      (selectedLang && category.translations?.[selectedLang]?.name) ||
                      category.name;
                    const categoryItems = loadedItemsMap[category.id];
                    const isItemsLoading = categoryItems === null || categoryItems === undefined;

                    // Compute filtered items at map level so we can suppress the whole category during search
                    const filteredItems = isItemsLoading ? [] : (() => {
                      let result = categoryItems as any[];
                      if (searchQuery.trim()) {
                        const q = searchQuery.toLowerCase();
                        result = result.filter((item: any) => {
                          if (item.name.toLowerCase().includes(q)) return true;
                          if ((item.description ?? '').toLowerCase().includes(q)) return true;
                          if (selectedLang && item.translations?.[selectedLang]) {
                            const tr = item.translations[selectedLang];
                            if ((tr.name ?? '').toLowerCase().includes(q)) return true;
                            if ((tr.description ?? '').toLowerCase().includes(q)) return true;
                          }
                          return false;
                        });
                      }
                      if (activeDietTags.length > 0) {
                        result = result.filter((item: any) =>
                          activeDietTags.every((tag) =>
                            [...(item.allergens ?? []), ...(item.dietaryTags ?? [])].includes(tag),
                          ),
                        );
                      }
                      if (excludedAllergens.length > 0) {
                        result = result.filter((item: any) =>
                          !excludedAllergens.some((allergen) =>
                            (item.allergens ?? []).some(
                              (a: string) => a.toLowerCase() === allergen.toLowerCase(),
                            ),
                          ),
                        );
                      }
                      return result;
                    })();

                    // During search, skip entire category (heading + items) when no matches
                    if (!isItemsLoading && searchQuery.trim() && filteredItems.length === 0) {
                      return null;
                    }

                    return (
                      <div
                        key={category.id}
                        id={category.id}
                        ref={(el) => { categoryRefs.current[category.id] = el; }}
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
                                className="text-3xl md:text-5xl font-serif font-bold tracking-tight mb-2 drop-shadow-lg"
                                style={{ fontFamily: "var(--font-heading, inherit)", color: "white" }}
                              >
                                {catName}
                              </h2>
                              <div className="w-12 h-1 bg-white/60 rounded-full"></div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center mb-8 md:mb-12">
                            <h2
                              className="text-3xl md:text-5xl font-serif font-bold tracking-tight mb-3"
                              style={{ fontFamily: "var(--font-heading, inherit)" }}
                            >
                              {catName}
                            </h2>
                            <div className="w-12 h-1 bg-accent rounded-full"></div>
                          </div>
                        )}

                        {isItemsLoading ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-8">
                            {[...Array(4)].map((_, i) => (
                              <div key={i} className="h-24 rounded-2xl bg-muted/20 animate-pulse" />
                            ))}
                          </div>
                        ) : filteredItems.length === 0 ? (
                          <p className="text-center text-muted-foreground text-sm py-8 opacity-50">
                            {t('publicMenu.noItemsMatchFilter', 'No items match this filter')}
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-8">
                            {filteredItems.map((item: any) => {
                              const translatedItem = {
                                ...item,
                                name:
                                  (selectedLang && item.translations?.[selectedLang]?.name) ||
                                  item.name,
                                description:
                                  (selectedLang && item.translations?.[selectedLang]?.description) ||
                                  item.description,
                              };
                              const pairings = allLoadedItems.filter((i: any) =>
                                item.relatedItemIds?.includes(i.id),
                              );
                              return (
                                <ItemWithOptions
                                  key={item.id}
                                  item={translatedItem}
                                  perfectPairings={pairings}
                                  ordersEnabled={ordersEnabled}
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
            style={{ bottom: 'calc(max(1.5rem, env(safe-area-inset-bottom, 0px) + 0.75rem) + 5rem)' }}
          >
            <div
              className="glass-panel max-w-[480px] w-full px-5 py-3.5 rounded-2xl border-accent/30 text-sm font-semibold text-foreground/80 text-center animate-in fade-in slide-in-from-bottom-2 duration-300"
              role="alert"
              aria-live="polite"
            >
              {t("publicMenu.scanQrForAssistance", "Scan your table's QR code to call for assistance")}
            </div>
          </div>
        )}

        {/* Action Bar */}
        <div
          className="fixed left-0 right-0 z-50 flex justify-center pointer-events-none px-4 md:px-6"
          style={{ bottom: 'max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))' }}
        >
          <div className="flex items-center w-full max-w-[480px] justify-between p-1.5 md:p-2.5 glass-panel rounded-[2rem] md:rounded-[2.5rem] shadow-[0_30px_70px_-15px_rgba(0,0,0,0.5)] border-white/20 dark:border-white/10 pointer-events-auto bg-white/90 dark:bg-black/90">
            {/* LEFT GROUP: Waiter + Profile/Sign-In */}
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => {
                  if (assistanceSent || assistanceLoading) return;
                  if (!tableNumber) { handleAssistanceRequest(); return; }
                  setIsAssistanceDialogOpen(true);
                }}
                disabled={assistanceSent || assistanceLoading}
                aria-label={tableNumber ? t("publicMenu.callWaiter") : t("publicMenu.scanQrForAssistance", "Scan QR to call waiter")}
                className="flex items-center justify-center p-2.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-60 disabled:cursor-not-allowed transition-all min-h-[44px] min-w-[44px]"
              >
                <div className="relative">
                  <Bell className="h-5 w-5 text-accent" />
                  {tableNumber && !assistanceSent && (
                    <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-destructive rounded-full border-2 border-white dark:border-black" />
                  )}
                </div>
              </button>

              {user ? (
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() =>
                      navigate(
                        `/profile?returnTo=${encodeURIComponent(location.pathname + location.search)}`,
                      )
                    }
                    aria-label={t("publicMenu.myProfile")}
                    className="flex items-center justify-center p-2.5 min-h-[44px] min-w-[44px] hover:opacity-70 transition-opacity text-accent"
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
              )}
            </div>

            {/* RIGHT GROUP: Bill + Cart */}
            <div className="flex items-center gap-0.5">
              {sessionToken && (
                <Button
                  variant="default"
                  size="sm"
                  className="bg-accent text-accent-foreground text-[10px] px-3 py-2 rounded-xl font-bold"
                  onClick={async () => {
                    try {
                      await getSessionBill(sessionToken);
                      setIsPaymentModalOpen(true);
                    } catch {
                      setSessionToken(null);
                      if (tableNumber) localStorage.removeItem(`session-${tableNumber}`);
                    }
                  }}
                >
                  {t('payment.requestBill')}
                </Button>
              )}
              {ordersEnabled && (
                <div className="flex-shrink-0">
                  <CartIcon
                    categories={categoriesForCart}
                    restaurantId={restaurantId}
                    selectedLang={selectedLang}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Assistance dialog */}
      {isAssistanceDialogOpen && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 px-4" onClick={() => setIsAssistanceDialogOpen(false)}>
          <div
            className="bg-card text-card-foreground rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-6 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-border rounded-full mx-auto sm:hidden" />
            <h2 className="text-lg font-bold text-foreground text-center">
              {t("publicMenu.howCanWeHelp", "How can we help?")}
            </h2>
            <p className="text-sm text-muted-foreground text-center">
              {t("publicMenu.selectAssistanceType", "Choose the type of help you need")}
            </p>
            <div className="space-y-3 pt-1">
              <button
                type="button"
                onClick={() => { setIsAssistanceDialogOpen(false); handleAssistanceRequest(); }}
                className="w-full flex items-center gap-3 p-4 rounded-xl border border-border hover:bg-secondary/60 transition-colors text-left min-h-[56px]"
              >
                <Bell className="h-5 w-5 text-accent flex-shrink-0" />
                <div>
                  <p className="font-bold text-sm text-foreground">{t("publicMenu.callWaiter", "Call Waiter")}</p>
                  <p className="text-xs text-muted-foreground">{t("publicMenu.callWaiterDesc", "I'd like to order or ask a question")}</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => { setIsAssistanceDialogOpen(false); handleAssistanceRequest(); }}
                className="w-full flex items-center gap-3 p-4 rounded-xl border border-destructive/30 hover:bg-destructive/5 transition-colors text-left min-h-[56px]"
              >
                <span className="text-xl flex-shrink-0">🚨</span>
                <div>
                  <p className="font-bold text-sm text-foreground">{t("publicMenu.needHelp", "Need Urgent Help")}</p>
                  <p className="text-xs text-muted-foreground">{t("publicMenu.needHelpDesc", "I need immediate assistance")}</p>
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

      <CustomerLoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        returnTo={location.pathname + location.search}
      />

      {isPaymentModalOpen && sessionToken && restaurantId && (
        <PaymentModal
          sessionToken={sessionToken}
          onClose={() => setIsPaymentModalOpen(false)}
          onSuccess={() => {
            setIsPaymentModalOpen(false);
            setSessionToken(null);
            if (tableNumber) localStorage.removeItem(`session-${tableNumber}`);
          }}
        />
      )}
    </div>
  );
};

export default PublicMenuPage;
