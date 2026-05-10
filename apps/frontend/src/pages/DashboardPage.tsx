import { useState, useRef, useContext, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { type LucideIcon, LayoutDashboard, ShoppingBag, Bell, Table2, Settings, BarChart2, CreditCard } from 'lucide-react';
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
import MenuImportView from './Dashboard/MenuImportView';
import NotificationBell from '../components/NotificationBell';
import PaymentToast from '../components/PaymentToast';
import { NotificationProvider } from '../context/NotificationContext';

type TabId = 'summary' | 'analytics' | 'orders' | 'payments' | 'assistance' | 'tables' | 'settings' | 'import';

const BOTTOM_NAV_TABS: { id: TabId; Icon: LucideIcon; labelKey: string }[] = [
  { id: 'summary',    Icon: LayoutDashboard, labelKey: 'dashboard.tabs.home' },
  { id: 'orders',     Icon: ShoppingBag,     labelKey: 'dashboard.tabs.orders' },
  { id: 'payments',  Icon: CreditCard,    labelKey: 'dashboard.tabs.payments' },
  { id: 'assistance', Icon: Bell,            labelKey: 'dashboard.tabs.requests' },
  { id: 'tables',     Icon: Table2,          labelKey: 'dashboard.tabs.tables' },
  { id: 'settings',  Icon: Settings,        labelKey: 'dashboard.tabs.settings' },
];

const VALID_TABS: TabId[] = ['summary', 'analytics', 'orders', 'payments', 'assistance', 'tables', 'settings', 'import'];

const DashboardPage = () => {
  const { user } = useAuth();
  const { orders } = useOrders();
  const { requests } = useAssistance();
  const { activeRestaurant, restaurants, loading: restaurantsLoading, error: restaurantsError }: any = useContext(RestaurantContext);
  const [activeTab, setActiveTab] = useState<TabId>('summary');
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const tab = searchParams.get('tab') as TabId | null;
    if (tab && VALID_TABS.includes(tab)) {
      setActiveTab(tab);
    }
  }, []);

  const { t, i18n } = useTranslation();
  const paymentsEnabled = (activeRestaurant as any)?.paymentsEnabled ?? false;

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

  return (
    <div className="pt-28 pb-8 md:pb-12 px-4 md:px-6 lg:px-8 max-w-7xl mx-auto min-h-screen"
         style={{ paddingBottom: 'max(2rem, calc(env(safe-area-inset-bottom, 0px) + 5.5rem))' }}>
      {/* Page header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 md:mb-12 gap-6 animate-in fade-in slide-in-from-top-4 duration-700">
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
        <div className="glass-panel p-4 sm:p-8 md:p-12 rounded-[2rem] md:rounded-[4rem] min-h-[60vh] border-white/10 dark:border-white/5 animate-in fade-in slide-in-from-bottom-8 duration-1000 overflow-hidden relative shadow-2xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 blur-[100px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-accent/5 blur-[120px] pointer-events-none" />

          {/* Desktop tab navigation — hidden on mobile (bottom nav used instead) */}
          <div className="hidden md:flex mb-12 border-b border-border/40 overflow-x-auto pb-2 items-center justify-between hide-scrollbar">
            <nav className="flex space-x-2 min-w-max" aria-label="Tabs">
              {[
                { id: 'summary',    label: t('dashboard.tabs.summary') },
                { id: 'analytics',  label: t('dashboard.tabs.analytics') },
                { id: 'orders',     label: t('dashboard.tabs.orders'),     count: newOrdersCount },
                { id: 'payments',    label: t('dashboard.tabs.payments') },
                { id: 'assistance', label: t('dashboard.tabs.assistance'), count: unresolvedRequestsCount },
                { id: 'tables',     label: t('dashboard.tabs.tables') },
                { id: 'settings',   label: t('dashboard.tabs.settings') },
                { id: 'import',     label: t('dashboard.tabs.import') },
              ].filter(tab => tab.id !== 'payments' || paymentsEnabled).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabId)}
                  className={`${activeTab === tab.id
                    ? 'bg-foreground text-background shadow-2xl scale-105 z-10'
                    : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground'}
                    px-7 py-4 rounded-[1.2rem] font-black text-[11px] uppercase tracking-[0.15em] transition-all flex items-center gap-2.5 active:scale-95`}
                >
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className="bg-accent text-accent-foreground text-[10px] font-black px-2.5 py-1 rounded-full shadow-lg shadow-accent/20">
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
              <div className="w-px h-8 bg-border/40 mx-4 self-center" />
              <Link
                to="/dashboard/menu"
                className="text-muted-foreground hover:bg-secondary/80 hover:text-foreground px-7 py-4 rounded-[1.2rem] font-black text-[11px] uppercase tracking-[0.15em] transition-all"
              >
                {t('dashboard.tabs.menuEditor')}
              </Link>
            </nav>
          </div>

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

          <div className="relative z-10">
            {activeTab === 'summary' && activeRestaurant && (
              <div className="space-y-8 md:space-y-12">
                <SummaryView onViewAnalytics={() => setActiveTab('analytics')} />
              </div>
            )}
            {activeTab === 'analytics' && activeRestaurant && <AnalyticsView />}
            {activeTab === 'orders' && <OrdersView />}
            {activeTab === 'payments' && activeRestaurant && <PaymentsView />}
            {activeTab === 'assistance' && <AssistanceView />}
            {activeTab === 'tables' && activeRestaurant && <TableView />}
            {activeTab === 'settings' && activeRestaurant && <SettingsView />}
            {activeTab === 'import' && activeRestaurant && <MenuImportView />}
          </div>
        </div>
        <PaymentToast />
      </NotificationProvider>
      ) : (
        <div className="glass-panel p-20 text-center rounded-[3rem]">
          <p className="text-2xl font-serif font-bold text-muted-foreground">{t('common.pleaseLogin')}</p>
        </div>
      )}

      {/* Mobile bottom navigation */}
      <nav
        className="fixed bottom-0 inset-x-0 z-50 md:hidden"
        aria-label="Mobile navigation"
      >
        <div
          className="glass-panel border-t border-white/10 bg-background/95 backdrop-blur-2xl"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="flex items-stretch h-16">
            {BOTTOM_NAV_TABS.filter(tab => tab.id !== 'payments' || paymentsEnabled).map(({ id, Icon, labelKey }) => {
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
                  {/* Active indicator bar */}
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
          </div>
        </div>
      </nav>
    </div>
  );
};

export default DashboardPage;
