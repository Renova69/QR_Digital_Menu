import { useState, useRef, useContext, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { type LucideIcon, LayoutDashboard, ShoppingBag, Bell, Table2, Settings, BarChart2, CreditCard, ChefHat, Monitor, Upload, Utensils } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useOrders } from '../context/OrderContext';
import { useAssistance } from '../context/AssistanceContext';
import OrdersView from './Dashboard/OrdersView';
import AssistanceView from './Dashboard/AssistanceView';
import TableView from '../components/tables/TableView';
import RestaurantContext from '../context/RestaurantContext';
import CreateRestaurantForm from '../components/CreateRestaurantForm';
import { Link } from 'react-router-dom';
import SummaryView from './Dashboard/SummaryView';
import AnalyticsView from './Dashboard/AnalyticsView';
import SettingsView from './Dashboard/SettingsView';
import { useTranslation } from 'react-i18next';
import PaymentsView from './Dashboard/PaymentsView';
import MenuImportExportView from './Dashboard/MenuImportExportView';
import NotificationBell from '../components/NotificationBell';
import PaymentToast from '../components/PaymentToast';
import { NotificationProvider } from '../context/NotificationContext';
import SubscriptionBanner from '../components/subscription/SubscriptionBanner';
import { useFeature } from '../hooks/useFeature';

type TabId = 'summary' | 'analytics' | 'orders' | 'payments' | 'assistance' | 'tables' | 'settings' | 'import';

const BOTTOM_NAV_TABS: { id: TabId; Icon: LucideIcon; labelKey: string }[] = [
  { id: 'summary',    Icon: LayoutDashboard, labelKey: 'dashboard.tabs.home' },
  { id: 'orders',     Icon: ShoppingBag,     labelKey: 'dashboard.tabs.orders' },
  { id: 'payments',  Icon: CreditCard,       labelKey: 'dashboard.tabs.payments' },
  { id: 'assistance', Icon: Bell,            labelKey: 'dashboard.tabs.requests' },
  { id: 'tables',     Icon: Table2,          labelKey: 'dashboard.tabs.tables' },
  { id: 'settings',  Icon: Settings,         labelKey: 'dashboard.tabs.settings' },
];

const VALID_TABS: TabId[] = ['summary', 'analytics', 'orders', 'payments', 'assistance', 'tables', 'settings', 'import'];

const DashboardPage = () => {
  const { user } = useAuth();
  const { orders } = useOrders();
  const { requests } = useAssistance();
  const { activeRestaurant, restaurants, loading: restaurantsLoading, error: restaurantsError }: any = useContext(RestaurantContext);
  const [activeTab, setActiveTab] = useState<TabId>('summary');
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
  const canAnalytics  = useFeature('analytics:basic');
  const canOrders     = useFeature('orders:receive');
  const canPayments   = useFeature('payments:stripe');
  const canAssistance = useFeature('orders:call-waiter');
  const canImport     = useFeature('menu:import');
  const canPos        = useFeature('pos');
  const canKds        = useFeature('kds');

  const lastRestaurantId = useRef<string | null>(null);
  if (activeRestaurant?.id !== lastRestaurantId.current) {
    if (activeRestaurant?.dashboardLanguage) {
      i18n.changeLanguage(activeRestaurant.dashboardLanguage);
    }
    lastRestaurantId.current = activeRestaurant?.id || null;
  }

  const newOrdersCount = orders.filter(o => o.status === 'NEW').length;
  const unresolvedRequestsCount = requests.filter(r => !r.isResolved).length;

  const getBadge = (id: TabId) => {
    if (id === 'orders') return newOrdersCount;
    if (id === 'assistance') return unresolvedRequestsCount;
    return 0;
  };

  if (restaurantsLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent" />
      </div>
    );
  }

  if (restaurantsError) {
    return <div className="p-8">Error loading restaurants.</div>;
  }

  if (restaurants.length === 0) {
    return (
      <div className="p-8 max-w-4xl mx-auto pt-32">
        <CreateRestaurantForm />
      </div>
    );
  }

  const desktopNavItems = [
    { id: 'summary'    as TabId, Icon: LayoutDashboard, label: t('dashboard.tabs.summary'),     show: true },
    { id: 'analytics'  as TabId, Icon: BarChart2,        label: t('dashboard.tabs.analytics'),   show: canAnalytics },
    { id: 'orders'     as TabId, Icon: ShoppingBag,      label: t('dashboard.tabs.orders'),      show: canOrders },
    { id: 'payments'   as TabId, Icon: CreditCard,       label: t('dashboard.tabs.payments'),    show: canPayments && paymentsEnabled },
    { id: 'assistance' as TabId, Icon: Bell,             label: t('dashboard.tabs.assistance'),  show: canAssistance },
    { id: 'tables'     as TabId, Icon: Table2,           label: t('dashboard.tabs.tables'),      show: true },
    { id: 'settings'   as TabId, Icon: Settings,         label: t('dashboard.tabs.settings'),    show: true },
    { id: 'import'     as TabId, Icon: Upload,           label: t('dashboard.tabs.importExport'),show: canImport },
  ];

  return (
    <div
      className="pt-28 pb-8 md:pb-12 px-4 md:px-6 lg:px-8 max-w-7xl mx-auto min-h-screen"
      style={{ paddingBottom: 'max(2rem, calc(env(safe-area-inset-bottom, 0px) + 5.5rem))' }}
    >
      {/* Page header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-6 animate-in fade-in slide-in-from-top-4 duration-700">
        <div>
          <h1 className="text-4xl md:text-7xl font-serif font-black text-foreground tracking-tighter mb-2 md:mb-3 leading-none">
            {t('dashboard.title')}
          </h1>
          {user && (
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-accent rounded-full" />
              <p className="text-muted-foreground font-bold tracking-widest text-[10px] uppercase opacity-50">
                {t('dashboard.welcome', { name: user.name || user.email })}
              </p>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 md:gap-4">
          {activeRestaurant && (
            <a
              href={`/menu/public/${activeRestaurant.id}?table=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative bg-foreground text-background px-5 md:px-8 py-3 md:py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all shadow-2xl hover:shadow-[0_20px_40px_-10px_var(--color-primary)] hover:-translate-y-1 flex items-center gap-2 md:gap-3 overflow-hidden"
            >
              <span className="relative z-10">{t('dashboard.viewPublicMenu')}</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 relative z-10 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          )}
          {paymentsEnabled && <NotificationBell />}
        </div>
      </div>

      {user ? (
        <NotificationProvider>
          <SubscriptionBanner />

          {/* Main panel — sidebar + content on desktop, stacked on mobile */}
          <div className="glass-panel rounded-[2rem] md:rounded-[3rem] min-h-[70vh] border-white/10 dark:border-white/5 animate-in fade-in slide-in-from-bottom-8 duration-1000 overflow-hidden relative shadow-2xl flex flex-col md:flex-row">

            {/* Ambient glow orbs */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 blur-[100px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-accent/5 blur-[120px] pointer-events-none" />

            {/* ── Desktop sidebar nav (hidden on mobile) ── */}
            <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-border/50 py-6 px-3 relative z-10">
              <nav className="flex-1 space-y-0.5" aria-label={t('dashboard.title')}>
                {desktopNavItems.filter(item => item.show).map(({ id, Icon, label }) => {
                  const badge = getBadge(id);
                  const isActive = activeTab === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setActiveTab(id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 border cursor-pointer ${
                        isActive
                          ? 'bg-accent/10 text-accent border-accent/20'
                          : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground border-transparent'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="flex-1 text-left truncate">{label}</span>
                      {badge > 0 && (
                        <span className="bg-accent text-accent-foreground text-[9px] font-black min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1 shadow-sm shadow-accent/20">
                          {badge > 9 ? '9+' : badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>

              {/* Divider + external tool links (always visible, regardless of plan) */}
              <div className="mt-4 pt-4 border-t border-border/50 space-y-0.5">
                <Link
                  to="/dashboard/menu"
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent transition-all duration-150"
                >
                  <Utensils className="w-4 h-4 shrink-0" />
                  <span className="truncate">{t('dashboard.tabs.menuEditor')}</span>
                </Link>
                {canPos && (
                  <Link
                    to="/staff/pos"
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent transition-all duration-150"
                  >
                    <Monitor className="w-4 h-4 shrink-0" />
                    <span className="truncate">{t('dashboard.tabs.pos')}</span>
                  </Link>
                )}
                {canKds && (
                  <Link
                    to="/staff/kitchen"
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent transition-all duration-150"
                  >
                    <ChefHat className="w-4 h-4 shrink-0" />
                    <span className="truncate">{t('dashboard.tabs.kitchen')}</span>
                  </Link>
                )}
              </div>
            </aside>

            {/* ── Content area ── */}
            <div className="flex-1 min-w-0 p-4 sm:p-6 md:p-10 relative z-10">

              {/* Mobile tab label — shows current tab name */}
              <div className="flex md:hidden items-center justify-between mb-6">
                <h2 className="text-lg font-black uppercase tracking-[0.15em] text-foreground">
                  {t(`dashboard.tabs.${activeTab}`)}
                </h2>
                {activeTab === 'summary' && activeRestaurant && (
                  <Link
                    to="/dashboard/menu"
                    className="text-[10px] font-black uppercase tracking-widest text-accent border border-accent/20 px-3 py-1.5 rounded-xl hover:bg-accent/10 transition-colors"
                  >
                    {t('dashboard.tabs.menuEditor')}
                  </Link>
                )}
              </div>

              {/* Tab content */}
              <div>
                {activeTab === 'summary' && activeRestaurant && (
                  <div className="space-y-8 md:space-y-12">
                    <SummaryView onViewAnalytics={() => setActiveTab('analytics')} />
                  </div>
                )}
                {activeTab === 'analytics' && activeRestaurant && <AnalyticsView />}
                {activeTab === 'orders' && <OrdersView />}
                {activeTab === 'payments' && activeRestaurant && paymentsEnabled && <PaymentsView />}
                {activeTab === 'assistance' && <AssistanceView />}
                {activeTab === 'tables' && activeRestaurant && <TableView />}
                {activeTab === 'settings' && activeRestaurant && <SettingsView />}
                {activeTab === 'import' && activeRestaurant && <MenuImportExportView />}
              </div>
            </div>
          </div>

          <PaymentToast />
        </NotificationProvider>
      ) : (
        <div className="glass-panel p-20 text-center rounded-[3rem]">
          <p className="text-2xl font-serif font-bold text-muted-foreground">{t('common.pleaseLogin')}</p>
        </div>
      )}

      {/* Mobile bottom navigation — unchanged */}
      <nav
        className="fixed bottom-0 inset-x-0 z-50 md:hidden"
        aria-label="Mobile navigation"
      >
        <div
          className="glass-panel border-t border-white/10 bg-background/95 backdrop-blur-2xl"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="flex items-stretch h-16">
            {BOTTOM_NAV_TABS.filter(tab => {
              if (tab.id === 'orders')     return canOrders;
              if (tab.id === 'payments')   return canPayments && paymentsEnabled;
              if (tab.id === 'assistance') return canAssistance;
              return true;
            }).map(({ id, Icon, labelKey }) => {
              const badge = getBadge(id);
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-colors active:scale-95 ${
                    isActive ? 'text-accent' : 'text-muted-foreground'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {isActive && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-accent" />
                  )}
                  <div className="relative">
                    <Icon className="w-[22px] h-[22px]" />
                    {badge > 0 && (
                      <span className="absolute -top-1.5 -right-2 bg-accent text-accent-foreground text-[9px] font-black min-w-[16px] h-4 rounded-full flex items-center justify-center px-0.5 shadow-lg shadow-accent/30">
                        {badge > 9 ? '9+' : badge}
                      </span>
                    )}
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-wide leading-none">
                    {t(labelKey)}
                  </span>
                </button>
              );
            })}

            {/* Analytics shortcut — icon only */}
            {canAnalytics && (
              <button
                onClick={() => setActiveTab('analytics')}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-colors active:scale-95 ${
                  activeTab === 'analytics' ? 'text-accent' : 'text-muted-foreground'
                }`}
                aria-current={activeTab === 'analytics' ? 'page' : undefined}
              >
                {activeTab === 'analytics' && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-accent" />
                )}
                <BarChart2 className="w-[22px] h-[22px]" />
                <span className="text-[9px] font-bold uppercase tracking-wide leading-none">
                  {t('dashboard.tabs.stats')}
                </span>
              </button>
            )}
          </div>
        </div>
      </nav>
    </div>
  );
};

export default DashboardPage;
