import { useState, useEffect, useRef } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { getMenu, createAssistanceRequest, getSessionBill } from "../lib/api";
import { Category } from "../types";
import { PaymentModal } from "../components/payment/PaymentModal";
import { useCart } from "../context/CartContext";
import { Button } from "../components/ui/button";
import CartIcon from "../components/cart/CartIcon";
import { ItemWithOptions } from "../components/menu/ItemWithOptions";
import { Bell, Globe, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ThemeToggle } from "../components/ui/ThemeToggle";
import { TrendingCarousel } from "../components/menu/TrendingCarousel";
import { CustomerLoginModal } from "../components/auth/CustomerLoginModal";
import { useAuth } from "../context/AuthContext";

const PublicMenuPage = () => {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const { setTableNumber, pruneInvalidItems } = useCart();
  const [tableNumber, setTableNumberState] = useState<string | null>(null);

  const [menuData, setMenuData] = useState<{
    restaurant: any;
    categories: Category[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assistanceSent, setAssistanceSent] = useState(false);
  const [assistanceLoading, setAssistanceLoading] = useState(false);
  const [noTableNotice, setNoTableNotice] = useState(false);
  const [selectedLang, setSelectedLang] = useState<string>("");

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  const categoryRefs = useRef<Record<string, HTMLElement | null>>({});
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

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

    const fetchMenu = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getMenu(restaurantId);

        if (!data || !data.restaurant) {
          setError(t("publicMenu.failedLoad"));
          return;
        }

        setMenuData(data);
        const validItemIds = data.categories.flatMap((c: any) =>
          (c.items || []).map((i: any) => i.id),
        );
        const removedCount = pruneInvalidItems(validItemIds);
        if (removedCount > 0) {
          console.warn(
            `[PublicMenu] Removed ${removedCount} stale cart item(s) not present in current menu.`,
          );
        }

        if (data.restaurant?.targetLanguages?.length > 0) {
          const defaultLang = i18n.language || "en";
          setSelectedLang(defaultLang);
        }
      } catch (err) {
        console.error("Public Menu Fetch Error:", err);
        setError(t("publicMenu.failedLoad"));
      } finally {
        setLoading(false);
      }
    };

    fetchMenu();
    // Only re-fetch when restaurant or URL query params change.
    // Cart functions (setTableNumber, pruneInvalidItems) are memoized/stable via useCallback.
    // t/i18n are used inside but should not trigger a re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, location.search]);

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
  }, [menuData]);

  useEffect(() => {
    if (tableNumber) {
      const stored = localStorage.getItem(`session-${tableNumber}`);
      setSessionToken(stored);
    }
  }, [tableNumber]);

  useEffect(() => {
    if (menuData?.restaurant) {
      const { fontHeading, fontBody } = menuData.restaurant;
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
  }, [menuData?.restaurant]);

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedLang(val);
    i18n.changeLanguage(val);
  };

  const getImageUrl = (url: string) => {
    if (url.startsWith("http")) return url;
    const apiUrl =
      (import.meta as any).env.VITE_API_URL || "http://localhost:3000/api";
    const baseUrl = apiUrl.replace("/api", "");
    return `${baseUrl}/${url}`;
  };

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
      setTimeout(() => setAssistanceSent(false), 3000);
    } catch (err) {
      console.error("Assistance Request Error:", err);
    } finally {
      setAssistanceLoading(false);
    }
  };

  const scrollToCategory = (id: string) => {
    categoryRefs.current[id]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const restaurantTheme = menuData?.restaurant;
  const hasCustomTheme = !!(
    restaurantTheme?.themeBgColor && restaurantTheme?.themeTextColor
  );

  const themeVars = restaurantTheme
    ? ({
        "--theme-bg": restaurantTheme.themeBgColor || undefined,
        "--theme-text": restaurantTheme.themeTextColor || undefined,
        "--theme-card": restaurantTheme.themeCardColor || undefined,
        "--font-heading": restaurantTheme.fontHeading
          ? `"${restaurantTheme.fontHeading}", serif`
          : undefined,
        "--font-body": restaurantTheme.fontBody
          ? `"${restaurantTheme.fontBody}", sans-serif`
          : undefined,
        "--color-accent": restaurantTheme.accentColor || undefined,
        ...(hasCustomTheme
          ? {
              "--color-background": restaurantTheme.themeBgColor,
              "--color-foreground": restaurantTheme.themeTextColor,
              "--color-card":
                restaurantTheme.themeCardColor || restaurantTheme.themeBgColor,
              "--color-card-foreground": restaurantTheme.themeTextColor,
              "--color-popover": restaurantTheme.themeBgColor,
              "--color-popover-foreground": restaurantTheme.themeTextColor,
            }
          : {}),
      } as React.CSSProperties)
    : {};

  return (
    <div
      className="relative min-h-screen overflow-x-hidden premium-bg text-foreground selection:bg-accent/30 transition-colors duration-1000"
      style={{
        ...themeVars,
        backgroundColor: "var(--theme-bg, var(--color-background))",
        color: "var(--theme-text, var(--color-foreground))",
        fontFamily: "var(--font-body, inherit)",
        paddingBottom: 'max(8rem, calc(5rem + env(safe-area-inset-bottom, 0px)))',
      }}
    >
      {/* Theme Toggle — always visible; scoped per restaurant so each venue remembers preference */}
      <div className="fixed top-6 right-6 z-50 animate-in fade-in slide-in-from-right-4 duration-700 pointer-events-auto">
        <ThemeToggle
          storageKey={restaurantId ? `theme-${restaurantId}` : 'theme'}
          defaultTheme={(restaurantTheme?.defaultTheme as 'light' | 'dark') ?? 'light'}
        />
      </div>

      {/* Ambient Depth Background */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-[10%] -right-[10%] w-[60%] h-[60%] rounded-full opacity-10 blur-[120px] transition-colors duration-1000"
          style={{
            backgroundColor:
              menuData?.restaurant?.accentColor || "var(--color-accent)",
          }}
        />
        <div
          className="absolute -bottom-[10%] -left-[10%] w-[50%] h-[50%] rounded-full opacity-5 blur-[100px] transition-colors duration-1000"
          style={{
            backgroundColor:
              menuData?.restaurant?.accentColor || "var(--color-accent)",
          }}
        />
      </div>

      <div className="relative z-10 container mx-auto px-4 max-w-4xl">
        {tableNumber && (
          <div className="glass-panel border-l-4 border-accent p-5 mb-10 rounded-[1.5rem] flex justify-between items-center animate-in fade-in slide-in-from-top-4 duration-700">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-accent rounded-full animate-pulse shadow-[0_0_10px_var(--color-accent)]"></div>
              <p className="font-black tracking-[0.08em] text-xs uppercase opacity-70">
                {t("publicMenu.viewingTable", { tableNumber })}
              </p>
            </div>
          </div>
        )}

        {assistanceSent && (
          <div className="glass-panel border-l-4 border-emerald-500 text-emerald-600 dark:text-emerald-400 p-4 mb-8 rounded-2xl shadow-xl animate-in zoom-in-95 duration-300">
            <p className="font-bold">{t("publicMenu.staffNotified")}</p>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-32 space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent"></div>
            <p className="text-muted-foreground font-medium opacity-60">
              Preparing your menu...
            </p>
          </div>
        )}

        {error && (
          <div className="glass-panel border-t-4 border-destructive p-12 rounded-[2.5rem] shadow-2xl mb-8 text-center animate-in fade-in duration-500">
            <h3 className="text-2xl font-serif font-bold mb-4">{error}</h3>
            <p className="text-muted-foreground mb-6">
              Please check the link or ask staff for assistance.
            </p>
            <Button
              onClick={() => window.location.reload()}
              variant="outline"
              className="rounded-xl"
            >
              Try Again
            </Button>
          </div>
        )}

        {!loading && !error && menuData && (
          <>
            <div className="mb-10 md:mb-20 pt-8 text-center animate-in fade-in slide-in-from-bottom-8 duration-1000">
              <div className="inline-block p-1 bg-gradient-to-tr from-accent/20 to-transparent rounded-[3.2rem] mb-6 md:mb-10 shadow-2xl">
                <div className="p-5 md:p-8 glass-panel rounded-[3rem] bg-white dark:bg-zinc-950/40">
                  {menuData.restaurant?.logoUrl ? (
                    <img
                      src={
                        menuData.restaurant.logoUrl.startsWith("http")
                          ? menuData.restaurant.logoUrl
                          : `${((import.meta as any).env.VITE_API_URL || "http://localhost:3000/api").replace("/api", "")}/${menuData.restaurant.logoUrl}`
                      }
                      alt={`${menuData.restaurant?.name ?? ''} logo`}
                      className="max-h-28 mx-auto object-contain drop-shadow-2xl"
                    />
                  ) : (
                    <div className="w-24 h-24 bg-accent/10 rounded-full flex items-center justify-center border border-accent/20">
                      <span className="text-5xl font-serif font-black text-accent">
                        {menuData.restaurant?.name?.[0]}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <h1
                className="text-5xl md:text-8xl font-serif font-black tracking-tighter mb-4 md:mb-6 text-foreground leading-[0.9] text-glow"
                style={{
                  fontFamily: "var(--font-heading, inherit)",
                  color: "var(--theme-text, inherit)",
                }}
              >
                {menuData.restaurant?.name}
              </h1>

              <div className="inline-flex items-center gap-4 p-1.5 glass-panel rounded-2xl border border-white/10 shadow-xl overflow-hidden">
                <div className="pl-4 pr-2 flex items-center gap-2 border-r border-white/10 dark:border-white/5">
                  <Globe className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                  <span className="text-xs font-black uppercase tracking-[0.15em] text-muted-foreground whitespace-nowrap">
                    {t("publicMenu.language", "Language")}
                  </span>
                </div>
                <label htmlFor="lang-select" className="sr-only">{t("publicMenu.selectLanguage", "Select language")}</label>
                <div className="relative flex items-center pr-2">
                  <select
                    id="lang-select"
                    value={selectedLang || i18n.language}
                    onChange={handleLanguageChange}
                    className="bg-transparent border-none text-foreground font-black text-xs uppercase tracking-widest focus:ring-0 cursor-pointer outline-none appearance-none pr-6 py-2 min-w-[80px]"
                  >
                    <option value="en" className="bg-white dark:bg-zinc-950 text-black dark:text-white">English</option>
                    <option value="bg" className="bg-white dark:bg-zinc-950 text-black dark:text-white">Български</option>
                    <option value="ro" className="bg-white dark:bg-zinc-950 text-black dark:text-white">Română</option>
                  </select>
                  <svg className="absolute right-0 w-3 h-3 text-muted-foreground pointer-events-none" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
            </div>

            {menuData.categories.length === 0 ? (
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
                      allMenuItems={menuData.categories.flatMap(
                        (c) => c.items || [],
                      )}
                    />
                  </div>
                )}

                {/* Premium Sticky Navigation */}
                <div className="sticky top-4 md:top-6 z-40 mb-10 md:mb-20 px-2 lg:px-0">
                  <div className="glass-panel p-2 rounded-[2rem] flex overflow-x-auto hide-scrollbar gap-2 border-white/10 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.4)]">
                    {menuData.categories.map((cat: any) => {
                      const catName =
                        (selectedLang &&
                          cat.translations &&
                          cat.translations[selectedLang]?.name) ||
                        cat.name;
                      return (
                        <button
                          key={`nav-${cat.id}`}
                          onClick={() => scrollToCategory(cat.id)}
                          data-active={activeCategory === cat.id}
                          className="whitespace-nowrap px-8 py-3.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all duration-300 active:scale-95 hover:bg-black/5 dark:hover:bg-white/5
                                                  data-[active=true]:shadow-[0_10px_25px_-5px_var(--color-primary)] text-muted-foreground"
                          style={
                            activeCategory === cat.id
                              ? {
                                  backgroundColor:
                                    "var(--theme-text, var(--color-foreground))",
                                  color:
                                    "var(--theme-bg, var(--color-background))",
                                }
                              : {}
                          }
                        >
                          {catName}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-14 md:space-y-24">
                  {menuData.categories.map((category: any) => {
                    const catName =
                      (selectedLang &&
                        category.translations &&
                        category.translations[selectedLang]?.name) ||
                      category.name;
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
                                className="text-3xl md:text-5xl font-serif font-bold tracking-tight mb-2 drop-shadow-lg"
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
                              className="text-3xl md:text-5xl font-serif font-bold tracking-tight mb-3"
                              style={{
                                fontFamily: "var(--font-heading, inherit)",
                                color: "var(--theme-text, inherit)",
                              }}
                            >
                              {catName}
                            </h2>
                            <div className="w-12 h-1 bg-accent rounded-full"></div>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-8">
                          {category.items.map((item: any) => {
                            const translatedItem = {
                              ...item,
                              name:
                                (selectedLang &&
                                  item.translations &&
                                  item.translations[selectedLang]?.name) ||
                                item.name,
                              description:
                                (selectedLang &&
                                  item.translations &&
                                  item.translations[selectedLang]
                                    ?.description) ||
                                item.description,
                            };
                            const allMenuItems = menuData.categories.flatMap(
                              (c) => c.items || [],
                            );
                            const pairings = allMenuItems.filter((i: any) =>
                              item.relatedItemIds?.includes(i.id),
                            );
                            return (
                              <ItemWithOptions
                                key={item.id}
                                item={translatedItem}
                                perfectPairings={pairings}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {/* No-table notice — shown above action bar when waiter called without table */}
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
          <div className="flex items-center w-full max-w-[480px] justify-between p-2 md:p-2.5 glass-panel rounded-[2rem] md:rounded-[2.5rem] shadow-[0_30px_70px_-15px_rgba(0,0,0,0.5)] border-white/20 dark:border-white/10 pointer-events-auto bg-white/90 dark:bg-black/90">
            <button
              onClick={handleAssistanceRequest}
              disabled={assistanceSent || assistanceLoading}
              aria-label={tableNumber ? t("publicMenu.callWaiter") : t("publicMenu.scanQrForAssistance", "Scan QR to call waiter")}
              className="flex items-center gap-2 md:gap-4 pl-4 md:pl-8 pr-3 md:pr-6 py-3 md:py-4 rounded-[1.75rem] hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-60 disabled:cursor-not-allowed transition-all group flex-1 min-h-[48px]"
            >
              <div className="relative flex-shrink-0">
                <Bell className="h-5 w-5 md:h-6 md:w-6 text-accent group-hover:scale-110 transition-transform" />
                {tableNumber && !assistanceSent && (
                  <div className="absolute -top-1 -right-1 w-2 h-2 md:w-2.5 md:h-2.5 bg-destructive rounded-full border-2 border-white dark:border-black" />
                )}
              </div>
              <span className="font-black text-xs md:text-sm uppercase tracking-[0.1em] md:tracking-[0.15em] text-foreground/90 truncate">
                {assistanceSent
                  ? t("publicMenu.staffNotified")
                  : assistanceLoading
                  ? t("publicMenu.calling", "Calling…")
                  : t("publicMenu.callWaiter")}
              </span>
            </button>
            <div className="w-px h-8 bg-border/40 mx-1 md:mx-2 flex-shrink-0" />

            {user ? (
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  onClick={() =>
                    navigate(
                      `/profile?returnTo=${encodeURIComponent(
                        location.pathname + location.search,
                      )}`,
                    )
                  }
                  className="flex flex-col items-center justify-center px-2 md:px-3 min-h-[48px] hover:opacity-70 transition-opacity"
                >
                  <span className="text-xs font-black uppercase text-accent truncate max-w-[56px] md:max-w-[72px]">
                    {user.name?.split(" ")[0] || t("publicMenu.myProfile")}
                  </span>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase">
                    {t("publicMenu.myProfile")}
                  </span>
                </button>
                <button
                  onClick={() => logout()}
                  aria-label={t("publicMenu.logout")}
                  className="p-2 hover:opacity-70 transition-opacity"
                >
                  <LogOut className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsLoginModalOpen(true)}
                className="flex items-center justify-center px-3 md:px-4 py-2 min-h-[44px] bg-secondary text-secondary-foreground rounded-xl text-xs font-black uppercase tracking-widest hover:bg-secondary/80 transition-colors flex-shrink-0"
              >
                {t("publicMenu.signIn", "Sign In")}
              </button>
            )}

            <div className="w-px h-8 bg-border/40 mx-1 md:mx-2 flex-shrink-0" />
            {sessionToken && (
              <Button
                variant="default"
                size="sm"
                className="bg-accent text-accent-foreground flex-shrink-0"
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
            <div className="w-px h-8 bg-border/40 mx-1 md:mx-2 flex-shrink-0" />
            <div className="pr-2 md:pr-4 flex-shrink-0">
              <CartIcon
                categories={menuData?.categories}
                restaurantId={restaurantId}
                selectedLang={selectedLang}
              />
            </div>
          </div>
        </div>
      </div>

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
