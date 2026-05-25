import { useState, useRef, useContext, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  type LucideIcon,
  LayoutDashboard,
  ShoppingBag,
  Bell,
  Table2,
  Settings,
  BarChart2,
  CreditCard,
  ChefHat,
  Monitor,
  Utensils,
  HelpCircle,
  Lock,
  QrCode,
  Zap,
  LogOut,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useOrders } from '../context/OrderContext';
import { useAssistance } from '../context/AssistanceContext';
import OrdersView from './Dashboard/OrdersView';
import AssistanceView from './Dashboard/AssistanceView';
import TableView from '../components/tables/TableView';
import RestaurantContext from '../context/RestaurantContext';
import CreateRestaurantForm from '../components/CreateRestaurantForm';
import SummaryView from './Dashboard/SummaryView';
import AnalyticsView from './Dashboard/AnalyticsView';
import SettingsView from './Dashboard/SettingsView';
import { useTranslation } from 'react-i18next';
import PaymentsView from './Dashboard/PaymentsView';
import HelpView from './Dashboard/HelpView';
import NotificationBell from '../components/NotificationBell';
import PaymentToast from '../components/PaymentToast';
import { NotificationProvider } from '../context/NotificationContext';
import SubscriptionBanner from '../components/subscription/SubscriptionBanner';
import UpgradeModal from '../components/subscription/UpgradeModal';
import { useFeature, type FeatureFlag } from '../hooks/useFeature';
import { ThemeToggle } from '../components/ui/ThemeToggle';

type TabId =
  | 'summary'
  | 'analytics'
  | 'orders'
  | 'payments'
  | 'assistance'
  | 'tables'
  | 'settings'
  | 'help';

const BOTTOM_NAV_TABS: { id: TabId; Icon: LucideIcon; labelKey: string }[] = [
  { id: 'summary', Icon: LayoutDashboard, labelKey: 'dashboard.tabs.home' },
  { id: 'orders', Icon: ShoppingBag, labelKey: 'dashboard.tabs.orders' },
  { id: 'payments', Icon: CreditCard, labelKey: 'dashboard.tabs.payments' },
  { id: 'assistance', Icon: Bell, labelKey: 'dashboard.tabs.requests' },
  { id: 'tables', Icon: Table2, labelKey: 'dashboard.tabs.tables' },
  { id: 'settings', Icon: Settings, labelKey: 'dashboard.tabs.settings' },
];

const VALID_TABS: TabId[] = [
  'summary',
  'analytics',
  'orders',
  'payments',
  'assistance',
  'tables',
  'settings',
  'help',
];

const DASHBOARD_LANGUAGES = [
  { code: 'bg', label: 'BG' },
  { code: 'en', label: 'EN' },
  { code: 'ro', label: 'RO' },
];

const DashboardPage = () => {
  const { user, logout } = useAuth();
  const { orders } = useOrders();
  const { requests } = useAssistance();
  const {
    activeRestaurant,
    restaurants,
    loading: restaurantsLoading,
    error: restaurantsError,
  }: any = useContext(RestaurantContext);
  const [activeTab, setActiveTab] = useState<TabId>('summary');
  const [lockedFeatureClicked, setLockedFeatureClicked] =
    useState<FeatureFlag | null>(null);
  const [searchParams] = useSearchParams();
  const tabFromParamApplied = useRef(false);

  useEffect(() => {
    if (tabFromParamApplied.current) return;
    const tab = searchParams.get('tab') as TabId | null;
    if (tab && VALID_TABS.includes(tab)) {
      setActiveTab(tab);
      tabFromParamApplied.current = true;
    }
  }, [searchParams]);

  const { t, i18n } = useTranslation();
  const paymentsEnabled = (activeRestaurant as any)?.paymentsEnabled ?? false;
  const canAnalytics = useFeature('analytics:full');
  const canOrders = useFeature('orders:receive');
  const canPayments = useFeature('payments:stripe');
  const canAssistance = useFeature('orders:call-waiter');
  const canPos = useFeature('pos');
  const canKds = useFeature('kds');

  const lastRestaurantId = useRef<string | null>(null);
  if (activeRestaurant?.id !== lastRestaurantId.current) {
    if (activeRestaurant?.dashboardLanguage) {
      i18n.changeLanguage(activeRestaurant.dashboardLanguage);
    }
    lastRestaurantId.current = activeRestaurant?.id || null;
  }

  const newOrdersCount = orders.filter((o) => o.status === 'NEW').length;
  const unresolvedRequestsCount = requests.filter((r) => !r.isResolved).length;

  const getBadge = (id: TabId) => {
    if (id === 'orders') return newOrdersCount;
    if (id === 'assistance') return unresolvedRequestsCount;
    return 0;
  };

  if (restaurantsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (restaurantsError) {
    return (
      <div className="p-8 text-muted-foreground">
        Error loading restaurants.
      </div>
    );
  }

  if (restaurants.length === 0) {
    return (
      <div className="min-h-screen premium-bg flex items-center justify-center p-4">
        <div className="w-full max-w-xl">
          <CreateRestaurantForm />
        </div>
      </div>
    );
  }

  const desktopNavItems: Array<{
    id: TabId;
    Icon: LucideIcon;
    label: string;
    feature: FeatureFlag | null;
    locked: boolean;
    hidden?: boolean;
  }> = [
    {
      id: 'summary' as TabId,
      Icon: LayoutDashboard,
      label: t('dashboard.tabs.summary'),
      feature: null,
      locked: false,
    },
    {
      id: 'orders' as TabId,
      Icon: ShoppingBag,
      label: t('dashboard.tabs.orders'),
      feature: 'orders:receive',
      locked: !canOrders,
    },
    {
      id: 'assistance' as TabId,
      Icon: Bell,
      label: t('dashboard.tabs.assistance'),
      feature: 'orders:call-waiter',
      locked: !canAssistance,
    },
    {
      id: 'tables' as TabId,
      Icon: Table2,
      label: t('dashboard.tabs.tables'),
      feature: null,
      locked: false,
    },
    {
      id: 'payments' as TabId,
      Icon: CreditCard,
      label: t('dashboard.tabs.payments'),
      feature: 'payments:stripe',
      locked: !canPayments,
      hidden: !paymentsEnabled,
    },
    {
      id: 'analytics' as TabId,
      Icon: BarChart2,
      label: t('dashboard.tabs.analytics'),
      feature: 'analytics:full',
      locked: !canAnalytics,
    },
    {
      id: 'settings' as TabId,
      Icon: Settings,
      label: t('dashboard.tabs.settings'),
      feature: null,
      locked: false,
    },
  ];

  const userName =
    user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'there';
  const restaurantName = activeRestaurant?.name || '';

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── FIXED LEFT SIDEBAR (desktop) ── */}
      <aside className="hidden md:flex flex-col w-[260px] shrink-0 sidebar-dark h-full overflow-y-auto hide-scrollbar z-40">
        {/* Wordmark */}
        <div className="px-5 py-5 border-b border-border/40">
          <Link to="/" className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'var(--brand)' }}
            >
              <QrCode className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-display font-bold brand-gradient-text tracking-tight">
              QR MENU
            </span>
          </Link>
        </div>

        {/* Main nav */}
        <nav
          className="flex-1 px-3 py-4 space-y-0.5"
          aria-label="Dashboard navigation"
        >
          {desktopNavItems.map(
            ({ id, Icon, label, feature, locked, hidden }) => {
              if (hidden) return null;
              const badge = getBadge(id);
              const isActive = !locked && activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() =>
                    locked
                      ? feature && setLockedFeatureClicked(feature)
                      : setActiveTab(id)
                  }
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer ${
                    locked
                      ? 'text-foreground/25 hover:bg-muted/30'
                      : isActive
                        ? 'text-white font-semibold'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  }`}
                  style={
                    isActive
                      ? {
                          background: 'var(--brand)',
                          boxShadow: '0 6px 16px -6px rgba(110, 86, 248, 0.55)',
                        }
                      : {}
                  }
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : ''}`}
                  />
                  <span className="flex-1 text-left truncate">{label}</span>
                  {!locked && badge > 0 && (
                    <span
                      className="text-[9px] font-black min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1 text-white"
                      style={{ background: 'var(--brand)' }}
                    >
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                  {locked && (
                    <Lock className="w-3.5 h-3.5 shrink-0 opacity-30" />
                  )}
                </button>
              );
            },
          )}

          <div className="pt-4 mt-4 border-t border-border/40 space-y-0.5">
            <Link
              to="/dashboard/menu"
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
            >
              <Utensils className="w-4 h-4 shrink-0" />
              <span className="truncate">{t('dashboard.tabs.menuEditor')}</span>
            </Link>
            {canPos ? (
              <Link
                to="/staff/pos"
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
              >
                <Monitor className="w-4 h-4 shrink-0" />
                <span className="flex-1 truncate">
                  {t('dashboard.tabs.pos')}
                </span>
              </Link>
            ) : (
              <button
                onClick={() => setLockedFeatureClicked('pos')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-foreground/25 hover:bg-muted/30 cursor-pointer transition-all"
              >
                <Monitor className="w-4 h-4 shrink-0" />
                <span className="flex-1 truncate">
                  {t('dashboard.tabs.pos')}
                </span>
                <Lock className="w-3.5 h-3.5 opacity-40" />
              </button>
            )}
            {canKds ? (
              <Link
                to="/staff/kitchen"
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
              >
                <ChefHat className="w-4 h-4 shrink-0" />
                <span className="flex-1 truncate">
                  {t('dashboard.tabs.kitchen')}
                </span>
              </Link>
            ) : (
              <button
                onClick={() => setLockedFeatureClicked('kds')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-foreground/25 hover:bg-muted/30 cursor-pointer transition-all"
              >
                <ChefHat className="w-4 h-4 shrink-0" />
                <span className="flex-1 truncate">
                  {t('dashboard.tabs.kitchen')}
                </span>
                <Lock className="w-3.5 h-3.5 opacity-40" />
              </button>
            )}
            <button
              onClick={() => setActiveTab('help')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all cursor-pointer"
            >
              <HelpCircle className="w-4 h-4 shrink-0" />
              <span className="truncate">{t('dashboard.tabs.help')}</span>
            </button>
          </div>
        </nav>

        {/* Pro Plan card */}
        <div className="px-3 pb-4">
          <div
            className="rounded-2xl p-4"
            style={{
              background: 'var(--gradient-brand-soft)',
              border: '1px solid rgba(110, 86, 248, 0.2)',
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold text-foreground">
                Pro Plan
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
              {t('dashboard.proCard', 'Unlock analytics, loyalty & more')}
            </p>
            <button
              onClick={() => setLockedFeatureClicked('analytics:full')}
              className="w-full py-2 rounded-xl text-[11px] font-bold text-white transition-all hover:opacity-90 cursor-pointer"
              style={{ background: 'var(--brand)' }}
            >
              {t('dashboard.upgrade', 'Upgrade Plan')}
            </button>
          </div>

          {/* User footer */}
          <div className="mt-3 flex items-center gap-3 px-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ background: 'var(--brand)' }}
            >
              {userName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">
                {user?.name || user?.email}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                {user?.role}
              </p>
            </div>
            <button
              onClick={() => {
                logout();
              }}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all cursor-pointer"
              aria-label="Logout"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top header bar */}
        <header className="hidden md:flex items-center justify-between px-6 py-3 bg-card border-b border-border/60 shrink-0">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {t('dashboard.welcomeBack', 'Welcome back')},{' '}
              <span className="font-bold">{userName}</span>
            </p>
            {restaurantName && (
              <p className="text-xs text-muted-foreground">
                {t('dashboard.happeningAt', "Here's what's happening at")}{' '}
                {restaurantName}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <select
              value={i18n.language?.slice(0, 2) ?? 'en'}
              onChange={(e) => void i18n.changeLanguage(e.target.value)}
              className="h-8 px-3 rounded-xl text-xs font-bold uppercase tracking-widest text-foreground/70 cursor-pointer bg-secondary border border-border hover:bg-muted transition-all"
            >
              {DASHBOARD_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            <ThemeToggle size="sm" />
            {paymentsEnabled && <NotificationBell />}
            {activeRestaurant && (
              <a
                href={`/menu/public/${activeRestaurant.id}?table=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="h-8 flex items-center gap-1.5 px-3 rounded-xl text-[11px] font-bold text-white hover:opacity-90 transition-all"
                style={{ background: 'var(--brand)' }}
              >
                <Users className="w-3.5 h-3.5" />
                {t('dashboard.viewPublicMenu', 'View Menu')}
              </a>
            )}
          </div>
        </header>

        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-card border-b border-border/60 shrink-0">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--brand)' }}
            >
              <QrCode className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-display font-bold brand-gradient-text">
              QR MENU
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle size="sm" />
            {paymentsEnabled && <NotificationBell />}
          </div>
        </header>

        {/* Scrollable content area */}
        <main className="flex-1 overflow-y-auto hide-scrollbar bg-background">
          <div
            className="p-4 md:p-6 pb-24 md:pb-8"
            style={{ minHeight: '100%' }}
          >
            {user ? (
              <NotificationProvider>
                <SubscriptionBanner />

                {activeTab === 'summary' && activeRestaurant && <SummaryView />}
                {activeTab === 'analytics' &&
                  activeRestaurant &&
                  canAnalytics && <AnalyticsView />}
                {activeTab === 'orders' && <OrdersView />}
                {activeTab === 'payments' &&
                  activeRestaurant &&
                  paymentsEnabled && <PaymentsView />}
                {activeTab === 'assistance' && <AssistanceView />}
                {activeTab === 'tables' && activeRestaurant && <TableView />}
                {activeTab === 'settings' && activeRestaurant && (
                  <SettingsView />
                )}
                {activeTab === 'help' && activeRestaurant && <HelpView />}

                <PaymentToast />
                <UpgradeModal
                  feature={lockedFeatureClicked}
                  onClose={() => setLockedFeatureClicked(null)}
                />
              </NotificationProvider>
            ) : (
              <div className="glass-panel p-20 text-center rounded-[2rem]">
                <p className="text-xl font-display font-bold text-muted-foreground">
                  {t('common.pleaseLogin')}
                </p>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav
        className="fixed bottom-0 inset-x-0 z-50 md:hidden"
        aria-label="Mobile navigation"
      >
        <div
          className="bg-card border-t border-border/60"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="flex items-stretch h-16">
            {BOTTOM_NAV_TABS.filter(
              (tab) => !(tab.id === 'payments' && !paymentsEnabled),
            ).map(({ id, Icon, labelKey }) => {
              const mobileFeatureMap: Partial<Record<TabId, FeatureFlag>> = {
                orders: 'orders:receive',
                payments: 'payments:stripe',
                assistance: 'orders:call-waiter',
              };
              const tabFeature = mobileFeatureMap[id] ?? null;
              const isLocked =
                (id === 'orders' && !canOrders) ||
                (id === 'payments' && !canPayments) ||
                (id === 'assistance' && !canAssistance);
              const badge = getBadge(id);
              const isActive = !isLocked && activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() =>
                    isLocked
                      ? tabFeature && setLockedFeatureClicked(tabFeature)
                      : setActiveTab(id)
                  }
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-colors active:scale-95 ${
                    isLocked
                      ? 'text-foreground/25'
                      : isActive
                        ? 'text-primary'
                        : 'text-muted-foreground'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {isActive && (
                    <div
                      className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
                      style={{ background: 'var(--brand)' }}
                    />
                  )}
                  <div className="relative">
                    <Icon className="w-[22px] h-[22px]" />
                    {!isLocked && badge > 0 && (
                      <span
                        className="absolute -top-1.5 -right-2 text-[9px] font-black min-w-[16px] h-4 rounded-full flex items-center justify-center px-0.5 text-white"
                        style={{ background: 'var(--brand)' }}
                      >
                        {badge > 9 ? '9+' : badge}
                      </span>
                    )}
                    {isLocked && (
                      <Lock className="absolute -bottom-1 -right-1 w-3 h-3 opacity-60" />
                    )}
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-wide leading-none">
                    {t(labelKey)}
                  </span>
                </button>
              );
            })}
            <button
              onClick={() =>
                canAnalytics
                  ? setActiveTab('analytics')
                  : setLockedFeatureClicked('analytics:full')
              }
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-colors active:scale-95 ${
                canAnalytics
                  ? activeTab === 'analytics'
                    ? 'text-primary'
                    : 'text-muted-foreground'
                  : 'text-foreground/25'
              }`}
              aria-current={
                canAnalytics && activeTab === 'analytics' ? 'page' : undefined
              }
            >
              {canAnalytics && activeTab === 'analytics' && (
                <div
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
                  style={{ background: 'var(--brand)' }}
                />
              )}
              <div className="relative">
                <BarChart2 className="w-[22px] h-[22px]" />
                {!canAnalytics && (
                  <Lock className="absolute -bottom-1 -right-1 w-3 h-3 opacity-60" />
                )}
              </div>
              <span className="text-[9px] font-bold uppercase tracking-wide leading-none">
                {t('dashboard.tabs.stats')}
              </span>
            </button>
          </div>
        </div>
      </nav>
    </div>
  );
};

export default DashboardPage;
