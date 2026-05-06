import { useState, useContext } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import RestaurantContext from '../../context/RestaurantContext';
import { useAnalytics } from '../../hooks/useAnalytics';
import { getFeedbackSummary } from '../../lib/api';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, ShoppingCart, DollarSign, BarChart3, CheckCircle, Star, ExternalLink, Calendar, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const PERIOD_KEYS: Record<number, string> = {
  7: 'analytics.days7',
  14: 'analytics.days14',
  30: 'analytics.days30',
};

const PERIOD_VALUES = [7, 14, 30];

const AnalyticsView = () => {
  const { activeRestaurant }: any = useContext(RestaurantContext);
  const [period, setPeriod] = useState(7);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const { t } = useTranslation();
  
  const { data, isLoading, error } = useAnalytics(activeRestaurant?.id, period, startDate || undefined, endDate || undefined);
  const { data: feedbackData } = useQuery({
    queryKey: ['feedbackSummary', activeRestaurant?.id],
    queryFn: () => getFeedbackSummary(activeRestaurant!.id),
    enabled: !!activeRestaurant?.id,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-32">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel border-destructive/20 text-destructive p-8 rounded-[2rem] text-center">
        <p className="font-serif font-bold text-xl mb-2">{t('analytics.loadingFailed')}</p>
        <p className="text-sm opacity-70">{t('analytics.checkConnection')}</p>
      </div>
    );
  }

  if (!data) return null;

  const formatCurrency = (value: number) => `€${value.toFixed(2)}`;
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  
  const handlePeriodChange = (days: number) => {
    setPeriod(days);
    setStartDate('');
    setEndDate('');
  };

  const handleExportCSV = () => {
    if (!data) return;
    
    // Use semicolon as delimiter and add sep=; for maximum Excel compatibility in European locales
    let csv = 'sep=;\n';
    csv += 'Report Period;Total Revenue;Total Orders;Avg Order Value\n';
    csv += `"${startDate && endDate ? `${startDate} to ${endDate}` : `Last ${period} days`}";"€${data.totalRevenue.toFixed(2)}";"${data.totalOrders}";"€${data.avgOrderValue.toFixed(2)}"\n\n`;

    csv += 'Date;Revenue;Orders\n';
    data.revenueTrend.forEach(row => {
      csv += `"${row.date}";"€${row.revenue.toFixed(2)}";"${row.orders}"\n`;
    });

    csv += '\nTop Items;Quantity Sold;Revenue\n';
    data.topItems.forEach(item => {
      csv += `"${item.name}";"${item.quantity}";"€${item.revenue.toFixed(2)}"\n`;
    });

    // Add UTF-8 BOM for proper Excel encoding
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `analytics-report-${activeRestaurant?.name?.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="space-y-10">
      {/* Header with Period Selector */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <h2 className="text-3xl font-serif font-black text-foreground tracking-tight">{t('analytics.title', { name: activeRestaurant?.name })}</h2>
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mt-2 flex items-center gap-2">
            <Calendar className="w-3 h-3" />
            {startDate && endDate 
                ? `${formatDate(startDate)} — ${formatDate(endDate)}` 
                : t('analytics.lastNDays', { days: period })}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
            <button 
              onClick={handleExportCSV}
              className="flex items-center gap-2 bg-foreground text-background px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform shadow-xl"
            >
              <Download className="w-3.5 h-3.5" />
              {t('analytics.export')}
            </button>
            <div className="flex bg-secondary/30 border border-border/40 rounded-xl p-1.5 gap-2 items-center shadow-inner w-full sm:w-auto">
              <input 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)} 
                className="text-[10px] font-black uppercase tracking-widest border-none bg-transparent outline-none text-foreground cursor-pointer px-2" 
              />
              <span className="text-muted-foreground text-[10px] font-black">{t('analytics.dateTo').toUpperCase()}</span>
              <input 
                type="date" 
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)} 
                className="text-[10px] font-black uppercase tracking-widest border-none bg-transparent outline-none text-foreground cursor-pointer px-2" 
              />
            </div>

            <div className="flex bg-secondary/50 rounded-xl p-1 gap-1 w-full sm:w-auto">
            {PERIOD_VALUES.map(val => (
                <button
                key={val}
                onClick={() => handlePeriodChange(val)}
                className={`flex-1 sm:flex-none px-5 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                    period === val && !startDate && !endDate
                    ? 'bg-foreground text-background shadow-lg scale-[1.02]'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
                >
                {t(PERIOD_KEYS[val])}
                </button>
            ))}
            </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <KpiCard
          title={t('analytics.totalRevenue')}
          value={formatCurrency(data.totalRevenue)}
          change={data.comparison.revenueChange}
          icon={<DollarSign className="h-5 w-5" />}
          color="accent"
        />
        <KpiCard
          title={t('analytics.totalOrders')}
          value={data.totalOrders.toString()}
          change={data.comparison.ordersChange}
          icon={<ShoppingCart className="h-5 w-5" />}
          color="blue"
        />
        <KpiCard
          title={t('analytics.avgOrderValue')}
          value={formatCurrency(data.avgOrderValue)}
          icon={<BarChart3 className="h-5 w-5" />}
          color="purple"
        />
        <KpiCard
          title={t('analytics.servedRate')}
          value={`${data.servedRate}%`}
          icon={<CheckCircle className="h-5 w-5" />}
          color="emerald"
        />
      </div>

      {/* Revenue Trend Chart */}
      <div className="glass-panel p-8 rounded-[2.5rem] border-white/5 relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-10 opacity-[0.03] pointer-events-none group-hover:scale-110 transition-transform duration-1000">
           <TrendingUp className="w-64 h-64" />
        </div>
        <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-10">{t('analytics.financialTrend')}</h3>
        {data.revenueTrend.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={data.revenueTrend} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--color-accent))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--color-accent))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" vertical={false} opacity={0.1} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 10, fontWeight: 900, fill: 'hsl(var(--color-muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                dy={15}
              />
              <YAxis
                tickFormatter={(v) => `€${v}`}
                tick={{ fontSize: 10, fontWeight: 900, fill: 'hsl(var(--color-muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                dx={-10}
              />
              <Tooltip
                content={<CustomTooltip currency={true} />}
                cursor={{ stroke: 'hsl(var(--color-accent))', strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="hsl(var(--color-accent))"
                strokeWidth={4}
                fillOpacity={1}
                fill="url(#revenueGradient)"
                animationDuration={2000}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState message={t('analytics.noRevenue')} />
        )}
      </div>

      {/* Two-column layout: Top Items + Peak Hours */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="glass-panel p-8 rounded-[2.5rem] border-white/5">
          <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-10">{t('analytics.popularSelections')}</h3>
          {data.topItems.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data.topItems} layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 10 }}>
                <XAxis type="number" hide />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={140}
                  tick={{ fontSize: 10, fontWeight: 800, fill: 'hsl(var(--color-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="quantity" fill="hsl(var(--color-accent))" radius={[0, 10, 10, 0]} barSize={24} animationDuration={1500} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message={t('analytics.noItemData')} />
          )}
        </div>

        <div className="glass-panel p-8 rounded-[2.5rem] border-white/5">
          <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-10">{t('analytics.peakHours')}</h3>
          {data.peakHours.some(h => h.orders > 0) ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={data.peakHours.filter(h => h.hour >= 8 && h.hour <= 23)}
                margin={{ top: 0, right: 10, bottom: 0, left: 0 }}
              >
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9, fontWeight: 800, fill: 'hsl(var(--color-muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                  dy={10}
                />
                <YAxis hide />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="orders" radius={[10, 10, 10, 10]} barSize={12} animationDuration={1800}>
                  {data.peakHours
                    .filter(h => h.hour >= 8 && h.hour <= 23)
                    .map((entry, index) => {
                      const maxOrders = Math.max(...data.peakHours.map(h => h.orders));
                      const opacity = maxOrders > 0 ? (entry.orders / maxOrders) * 0.8 + 0.2 : 0.2;
                      return <Cell key={`cell-${index}`} fill="hsl(var(--color-accent))" fillOpacity={opacity} />;
                    })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message={t('analytics.noOrderData')} />
          )}
        </div>
      </div>

      {/* Two-column layout: Category Breakdown + Top Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="glass-panel p-8 rounded-[2.5rem] border-white/5">
          <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-10">{t('analytics.categoryBreakdown', 'Category Breakdown')}</h3>
          {data.categoryBreakdown && data.categoryBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={data.categoryBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={120}
                  paddingAngle={5}
                  dataKey="revenue"
                  nameKey="category"
                  stroke="none"
                >
                  {data.categoryBreakdown.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={`hsl(var(--color-accent) / ${Math.max(0.2, 1 - (index * 0.15))})`} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip currency={true} />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message={t('analytics.noCategoryData', 'No category data')} />
          )}
        </div>

        <div className="glass-panel p-8 rounded-[2.5rem] border-white/5">
          <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-10">{t('analytics.topTables', 'Top Tables by Revenue')}</h3>
          {data.ordersByTable && data.ordersByTable.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data.ordersByTable} margin={{ top: 0, right: 30, bottom: 0, left: 0 }}>
                <XAxis dataKey="table" tick={{ fontSize: 10, fontWeight: 800, fill: 'hsl(var(--color-muted-foreground))' }} axisLine={false} tickLine={false} dy={10} />
                <YAxis tickFormatter={(v) => `€${v}`} tick={{ fontSize: 10, fontWeight: 800, fill: 'hsl(var(--color-muted-foreground))' }} axisLine={false} tickLine={false} dx={-10} />
                <Tooltip content={<CustomTooltip currency={true} />} />
                <Bar dataKey="revenue" fill="hsl(var(--color-accent))" radius={[10, 10, 10, 10]} barSize={24} animationDuration={1800} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message={t('analytics.noTableData', 'No table data')} />
          )}
        </div>
      </div>


      {/* Feedback & Satisfaction */}
      {feedbackData && (
        <div className="glass-panel p-8 rounded-[2.5rem] border-white/5">
          <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-10">{t('analytics.guestSatisfaction')}</h3>
          {feedbackData.totalFeedbacks > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
               {/* Big Rating Card */}
               <div className="flex flex-col items-center justify-center p-10 bg-accent/5 rounded-[2rem] border border-accent/10 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-accent/5 translate-y-full group-hover:translate-y-0 transition-transform duration-700 animate-pulse" />
                  <p className="text-7xl font-serif font-black text-accent mb-4 relative z-10">{feedbackData.averageRating}</p>
                  <div className="flex gap-1 mb-4 relative z-10">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className={`h-6 w-6 ${s <= Math.round(feedbackData.averageRating) ? 'fill-accent text-accent' : 'text-muted/20'}`} />
                    ))}
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground relative z-10">
                    {t('analytics.basedOnReviews', { count: feedbackData.totalFeedbacks })}
                  </p>
               </div>

               {/* Rating Breakdown */}
               <div className="lg:col-span-2 space-y-6 flex flex-col justify-center">
                  {[5, 4, 3, 2, 1].map((rating) => {
                    const count = feedbackData.ratingDistribution[rating] || 0;
                    const pct = feedbackData.totalFeedbacks > 0 ? (count / feedbackData.totalFeedbacks) * 100 : 0;
                    return (
                      <div key={rating} className="flex items-center gap-6">
                        <span className="text-xs font-black w-8 flex items-center gap-1 text-foreground">
                          {rating} <Star className="h-3 w-3 fill-accent text-accent" />
                        </span>
                        <div className="flex-1 bg-secondary/50 rounded-full h-3 overflow-hidden shadow-inner">
                          <div
                            className="h-full rounded-full transition-all duration-1000 bg-accent"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-black text-muted-foreground w-10 text-right">{count}</span>
                      </div>
                    );
                  })}
                  <div className="pt-6 grid grid-cols-2 gap-4">
                     <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10 flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">{t('analytics.positiveRate')}</span>
                        <span className="text-xl font-serif font-black text-emerald-500">{feedbackData.positiveRate}%</span>
                     </div>
                     <div className="p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10 flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-blue-500">{t('analytics.googleImpact')}</span>
                        <span className="text-xl font-serif font-black text-blue-500 flex items-center gap-2">
                           {feedbackData.googleRedirects} <ExternalLink className="w-4 h-4" />
                        </span>
                     </div>
                  </div>
               </div>
            </div>
          ) : (
            <EmptyState message={t('analytics.noFeedback')} />
          )}
        </div>
      )}
    </div>
  );
};

// ---- Sub-components ----

const CustomTooltip = ({ active, payload, label, currency = false }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass-panel p-4 rounded-xl border-accent/20 shadow-2xl backdrop-blur-2xl">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">{label}</p>
        <p className="text-lg font-serif font-black text-accent">
          {currency ? `€${payload[0].value.toFixed(2)}` : payload[0].value}
          <span className="text-[10px] font-sans font-bold ml-2 text-foreground opacity-60 uppercase tracking-tighter">
             {payload[0].name}
          </span>
        </p>
      </div>
    );
  }
  return null;
};

const KpiCard = ({ title, value, change, icon }: any) => {
  const isPositive = change !== undefined && change >= 0;
  const { t } = useTranslation();
  
  return (
    <div className="glass-panel p-6 rounded-[2rem] border-white/5 relative overflow-hidden group hover:-translate-y-1 transition-all duration-500 border-accent/0 hover:border-accent/10">
      <div className="flex items-center justify-between mb-8 relative z-10">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{title}</span>
        <div className={`p-3 rounded-2xl bg-secondary/80 text-foreground group-hover:scale-110 transition-transform`}>
          {icon}
        </div>
      </div>
      <div className="relative z-10">
        <p className={`text-3xl font-serif font-black text-foreground mb-4`}>{value}</p>
        {change !== undefined && (
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black ${isPositive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
              {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {Math.abs(change)}%
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground opacity-60 italic">{t('analytics.vsLastPeriod')}</span>
          </div>
        )}
      </div>
    </div>
  );
};

const EmptyState = ({ message }: { message: string }) => {
  const { t } = useTranslation();
  return (
  <div className="flex flex-col items-center justify-center py-24 text-center opacity-40">
    <BarChart3 className="h-16 w-16 text-muted-foreground mb-6 animate-pulse" />
    <p className="font-serif text-xl font-bold text-foreground mb-1">{message}</p>
    <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">{t('analytics.realTimeData')}</p>
  </div>
  );
};

export default AnalyticsView;
