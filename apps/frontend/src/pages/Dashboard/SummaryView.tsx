import { useOrders } from "../../context/OrderContext";
import { useAssistance } from "../../context/AssistanceContext";
import {
  TrendingUp,
  ShoppingCart,
  Bell,
  Users,
  Gift,
  Star,
  HelpCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { MenuCheckWidget } from "../../components/dashboard/MenuCheckWidget";
import { useEffect, useState, useContext } from "react";
import api from "../../lib/api";
import RestaurantContext from "../../context/RestaurantContext";
import { useTier } from "../../hooks/useFeature";

interface SummaryViewProps {
  onViewAnalytics?: () => void;
  onViewHelp?: () => void;
}

const SummaryView = ({ onViewAnalytics, onViewHelp }: SummaryViewProps) => {
  const { orders } = useOrders();
  const { requests } = useAssistance();
  const { t } = useTranslation();
  const { activeRestaurant } = useContext(RestaurantContext) as any;
  const [loyaltyData, setLoyaltyData] = useState<any>(null);
  const { tier } = useTier();
  const isFree = tier === 'FREE';

  useEffect(() => {
    if (activeRestaurant?.id) {
      api
        .get(`/loyalty/${activeRestaurant.id}/analytics`)
        .then((res) => setLoyaltyData(res.data))
        .catch(console.error);
    }
  }, [activeRestaurant]);

  const totalRevenue = orders
    .filter((o) => o.status !== "CANCELED")
    .reduce((sum, order) => sum + order.totalPrice, 0);

  const pendingOrders = orders.filter((o) => o.status === "NEW").length;
  const pendingRequests = requests.filter((r) => !r.isResolved).length;

  return (
    <div className="space-y-10">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-3xl font-serif font-black text-foreground tracking-tight mb-1">
            {t("dashboard.overview")}
          </h2>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-60">
            {t('summary.statusSnapshot')}
          </p>
        </div>
        {onViewAnalytics && !isFree && (
          <button
            onClick={onViewAnalytics}
            className="text-[10px] font-black uppercase tracking-[0.2em] text-accent hover:text-accent/80 flex items-center gap-2 transition-all hover:gap-3 px-4 py-2 bg-accent/5 rounded-xl border border-accent/10"
          >
            {t("dashboard.viewFullAnalytics")}
            <TrendingUp className="h-3 w-3" />
          </button>
        )}
      </div>
      {!isFree && (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="glass-panel p-8 rounded-[2.5rem] border-white/5 group hover:shadow-[0_20px_50px_-15px_hsla(var(--color-accent),0.2)] transition-all duration-500">
          <div className="flex items-center justify-between mb-6">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              {t("dashboard.totalRevenue")}
            </p>
            <div className="p-3.5 rounded-2xl bg-accent/10 border border-accent/10">
              <TrendingUp className="h-5 w-5 text-accent" />
            </div>
          </div>
          <p className="text-4xl font-serif font-black text-accent tracking-tighter">
            €{totalRevenue.toFixed(2)}
          </p>
          <div className="mt-4 h-1 w-12 bg-accent/20 rounded-full group-hover:w-full transition-all duration-700"></div>
        </div>

        <div className="glass-panel p-8 rounded-[2.5rem] border-white/5 group hover:shadow-[0_20px_50px_-15px_rgba(59,130,246,0.2)] transition-all duration-500">
          <div className="flex items-center justify-between mb-6">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              {t("dashboard.newOrders")}
            </p>
            <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/10">
              <ShoppingCart className="h-5 w-5 text-blue-500" />
            </div>
          </div>
          <p className="text-5xl font-serif font-black text-blue-500 tracking-tighter">
            {pendingOrders}
          </p>
          <div className="mt-4 h-1 w-12 bg-blue-500/20 rounded-full group-hover:w-full transition-all duration-700"></div>
        </div>

        <div className="glass-panel p-8 rounded-[2.5rem] border-white/5 group hover:shadow-[0_20px_50px_-15px_rgba(249,115,22,0.2)] transition-all duration-500">
          <div className="flex items-center justify-between mb-6">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              {t("dashboard.pendingAssistance")}
            </p>
            <div className="p-3.5 rounded-2xl bg-orange-500/10 border border-orange-500/10">
              <Bell className="h-5 w-5 text-orange-500" />
            </div>
          </div>
          <p className="text-5xl font-serif font-black text-orange-500 tracking-tighter">
            {pendingRequests}
          </p>
          <div className="mt-4 h-1 w-12 bg-orange-500/20 rounded-full group-hover:w-full transition-all duration-700"></div>
        </div>
      </div>
      )}

      {loyaltyData && activeRestaurant?.isLoyaltyEnabled && (
        <div className="mt-8">
          <h3 className="text-xl font-serif font-black text-foreground tracking-tight mb-6">
            {t('summary.loyaltyProgramPerformance')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="glass-panel p-8 rounded-[2rem] border-white/5 border-l-4 border-l-purple-500 bg-gradient-to-br from-background to-purple-500/5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  {t('summary.totalVipMembers')}
                </p>
                <Users className="h-4 w-4 text-purple-500" />
              </div>
              <p className="text-3xl font-black text-foreground">
                {loyaltyData.totalMembers}
              </p>
            </div>
            <div className="glass-panel p-8 rounded-[2rem] border-white/5 border-l-4 border-l-blue-500 bg-gradient-to-br from-background to-blue-500/5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  {t('summary.pointsRedeemed')}
                </p>
                <Star className="h-4 w-4 text-blue-500" />
              </div>
              <p className="text-3xl font-black text-foreground">
                {loyaltyData.totalPointsRedeemed}
              </p>
              <p className="text-xs font-semibold text-blue-500 mt-2">
                {t('summary.freebiesIssued')}
              </p>
            </div>
            <div className="glass-panel p-8 rounded-[2rem] border-white/5 border-l-4 border-l-green-500 bg-gradient-to-br from-background to-green-500/5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  {t('summary.pointsOutstandingLiability')}
                </p>
                <Gift className="h-4 w-4 text-green-500" />
              </div>
              <p className="text-3xl font-black text-foreground">
                {loyaltyData.totalPointsOutstanding}
              </p>
              <p className="text-xs font-semibold text-green-500 mt-2">
                {t('summary.unspentCustomerPoints')}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="pt-8 border-t border-border/40">
        <MenuCheckWidget />
      </div>

      {onViewHelp && (
        <div className="glass-panel p-8 rounded-[2.5rem] border-white/5 bg-gradient-to-br from-background to-accent/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mt-10 hover:shadow-[0_20px_50px_-15px_hsla(var(--color-accent),0.15)] transition-all duration-500 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-48 h-48 bg-accent/5 blur-[80px] pointer-events-none" />
          <div className="flex items-start gap-5">
            <div className="p-4 bg-accent/10 border border-accent/20 rounded-2xl shrink-0 group-hover:scale-105 transition-transform duration-300">
              <HelpCircle className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h3 className="text-xl font-serif font-black text-foreground tracking-tight">
                {t("summary.helpCenterTitle", "Help Center & Tutorials")}
              </h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-xl leading-relaxed">
                {t("summary.helpCenterDesc", "Need help setting up table QR codes, configuring Stripe payments, or managing VIP loyalty points? View our step-by-step guides and FAQs.")}
              </p>
            </div>
          </div>
          <button
            onClick={onViewHelp}
            className="w-full md:w-auto shrink-0 text-center bg-foreground text-background font-black uppercase tracking-[0.15em] text-[10px] px-6 py-4 rounded-xl hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 transition-all cursor-pointer"
          >
            {t("summary.goToHelpCenter", "Go to Help Center")}
          </button>
        </div>
      )}
    </div>
  );
};

export default SummaryView;
