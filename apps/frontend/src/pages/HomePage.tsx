import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import {
  QrCode, Smartphone, Layers, Star, TrendingUp, ShoppingCart,
  ChefHat, CreditCard, Globe, Shield, MessageSquare, Import,
  BarChart2, Gift, Palette, Zap, Users, Check, ArrowRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

const featureKeys = [
  'qrOrdering', 'tableManagement', 'waiterPos', 'kitchenDisplay',
  'multiLanguage', 'analytics', 'payments', 'loyalty', 'branding',
  'staffAccess', 'feedback', 'menuImport',
] as const;

const featureIcons: Record<string, { icon: typeof QrCode, color: string }> = {
  qrOrdering:      { icon: QrCode,        color: 'bg-accent/10 text-accent border-accent/20' },
  tableManagement: { icon: ShoppingCart,  color: 'bg-blue-500/10 text-blue-500 border-blue-500/10' },
  waiterPos:       { icon: Smartphone,    color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/10' },
  kitchenDisplay:  { icon: ChefHat,       color: 'bg-orange-500/10 text-orange-500 border-orange-500/10' },
  multiLanguage:   { icon: Globe,         color: 'bg-violet-500/10 text-violet-500 border-violet-500/10' },
  analytics:       { icon: BarChart2,     color: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/10' },
  payments:        { icon: CreditCard,    color: 'bg-rose-500/10 text-rose-500 border-rose-500/10' },
  loyalty:         { icon: Gift,          color: 'bg-amber-500/10 text-amber-500 border-amber-500/10' },
  branding:        { icon: Palette,       color: 'bg-pink-500/10 text-pink-500 border-pink-500/10' },
  staffAccess:     { icon: Shield,        color: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/10' },
  feedback:        { icon: MessageSquare, color: 'bg-teal-500/10 text-teal-500 border-teal-500/10' },
  menuImport:      { icon: Import,        color: 'bg-slate-500/10 text-slate-500 border-slate-500/10' },
};

type TierKey = 'starter' | 'pro' | 'enterprise';

const HomePage = () => {
  const { t } = useTranslation();

  const tiers: Array<{
    key: TierKey;
    name: string;
    price: string;
    period: string;
    desc: string;
    accent: string;
    features: string[];
    cta: string;
    highlight: boolean;
    badge?: string;
  }> = [
    {
      key: 'starter',
      name: t('landing.tiers.starterName'),
      price: '29',
      period: '/month',
      desc: t('landing.tiers.starterDesc'),
      accent: 'border-border/60',
      features: Array.from({ length: 6 }, (_, i) => t(`landing.tiers.starterFeature${i + 1}` as any)),
      cta: t('landing.getStarted'),
      highlight: false,
    },
    {
      key: 'pro',
      name: t('landing.tiers.proName'),
      price: '79',
      period: '/month',
      desc: t('landing.tiers.proDesc'),
      accent: 'border-accent/60 bg-accent/5 ring-2 ring-accent/20',
      features: Array.from({ length: 10 }, (_, i) => t(`landing.tiers.proFeature${i + 1}` as any)),
      cta: t('landing.getStarted'),
      highlight: true,
      badge: t('landing.mostPopular'),
    },
    {
      key: 'enterprise',
      name: t('landing.tiers.enterpriseName'),
      price: '199',
      period: '/month',
      desc: t('landing.tiers.enterpriseDesc'),
      accent: 'border-border/60',
      features: Array.from({ length: 10 }, (_, i) => t(`landing.tiers.enterpriseFeature${i + 1}` as any)),
      cta: t('landing.contactSales'),
      highlight: false,
    },
  ];

  const mockTabs = [
    t('landing.overview'),
    t('landing.orders'),
    t('landing.analytics'),
    t('landing.tables'),
    t('landing.settings'),
  ];

  const mockCards = [
    { label: t('landing.revenue'), value: '€2,847', color: 'bg-accent' },
    { label: t('landing.ordersCount'), value: '34', color: 'bg-blue-500' },
    { label: t('landing.tablesActive'), value: '8/12', color: 'bg-emerald-500' },
  ];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Ambient background blurs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-accent/10 rounded-full blur-[150px]" />
        <div className="absolute top-[10%] -right-[5%] w-[35%] h-[60%] bg-blue-500/8 rounded-full blur-[140px]" />
        <div className="absolute bottom-[5%] left-[20%] w-[40%] h-[40%] bg-amber-500/6 rounded-full blur-[130px]" />
        <div className="absolute -bottom-[10%] right-[10%] w-[30%] h-[30%] bg-violet-500/6 rounded-full blur-[120px]" />
      </div>

      {/* ──────────────── HERO ──────────────── */}
      <section className="relative pt-36 md:pt-44 pb-20 md:pb-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col items-center text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 text-accent text-xs font-black uppercase tracking-[0.15em] mb-8 border border-accent/20 backdrop-blur-md animate-in fade-in slide-in-from-top-4 duration-500">
          <Zap className="w-3.5 h-3.5 fill-accent text-accent" />
          <span>{t('landing.heroBadge')}</span>
        </div>

        {/* Headline */}
        <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-serif font-black text-foreground tracking-tight mb-6 max-w-5xl leading-[0.95] animate-in fade-in slide-in-from-top-8 duration-700">
          {t('landing.heroLine1')}{' '}
          <span className="text-accent text-glow">{t('landing.heroWordAccent')}</span>
          <br />
          <span className="text-muted-foreground/60">{t('landing.heroLine2')}</span>
        </h1>

        {/* Subtext */}
        <p className="text-base md:text-lg text-muted-foreground mb-10 max-w-2xl font-medium leading-relaxed animate-in fade-in duration-1000">
          {t('landing.heroSubtext')}
        </p>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row gap-4 mb-16 animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <Link to="/register">
            <Button size="lg" className="w-full sm:w-auto text-base px-10 py-6 font-black bg-foreground text-background hover:scale-105 hover:shadow-[0_20px_50px_-12px_hsl(var(--color-foreground)/0.3)] transition-all duration-300 shadow-xl cursor-pointer rounded-2xl">
              {t('landing.startFreeTrial')}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
          <Link to="/login">
            <Button size="lg" variant="outline" className="w-full sm:w-auto text-base px-8 py-6 font-bold border-2 border-border text-foreground hover:bg-muted hover:scale-105 transition-all duration-300 rounded-2xl cursor-pointer">
              {t('landing.viewLiveDemo')}
            </Button>
          </Link>
        </div>

        {/* Hero mockup — fake dashboard card */}
        <div className="relative w-full max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-1200">
          <div className="glass-panel w-full rounded-2xl md:rounded-3xl p-4 sm:p-6 aspect-[16/9] sm:aspect-[21/9] relative overflow-hidden shadow-2xl">
            {/* Fake browser chrome */}
            <div className="absolute top-0 inset-x-0 h-10 md:h-12 border-b border-black/5 dark:border-white/10 flex items-center px-4 gap-2 bg-black/5 dark:bg-white/5">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-yellow-400" />
              <div className="w-3 h-3 rounded-full bg-green-400" />
              <span className="ml-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
                app.qrmenu.io
              </span>
            </div>
            {/* Fake content */}
            <div className="absolute inset-x-4 sm:inset-x-8 top-16 md:top-20 bottom-4 sm:bottom-8">
              <div className="flex gap-3 md:gap-4 mb-4 md:mb-6">
                {mockTabs.map((tab, i) => (
                  <div
                    key={tab}
                    className={`h-6 md:h-8 rounded-xl text-[9px] md:text-xs font-black uppercase tracking-widest px-4 md:px-5 flex items-center ${
                      i === 0
                        ? 'bg-foreground text-background shadow-lg'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {tab}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3 md:gap-5 mb-4 md:mb-6">
                {mockCards.map((card) => (
                  <div key={card.label} className="glass-panel rounded-xl md:rounded-2xl p-3 md:p-5 border-white/5">
                    <div className={`w-2 h-2 rounded-full ${card.color} mb-2 md:mb-3`} />
                    <p className="text-muted-foreground/60 text-[8px] md:text-[10px] font-black uppercase tracking-widest mb-1">
                      {card.label}
                    </p>
                    <p className="text-sm md:text-2xl font-serif font-black text-foreground">{card.value}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 glass-panel rounded-xl p-2 md:p-3 border-white/5">
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-muted shrink-0" />
                    <div className="flex-1">
                      <div className="h-2.5 md:h-3 bg-muted rounded-full w-2/3 mb-1" />
                      <div className="h-2 md:h-2.5 bg-muted/50 rounded-full w-1/3" />
                    </div>
                    <div className="text-[8px] md:text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest">
                      {t('landing.table')} {i + 1}
                    </div>
                    <div className="px-2 py-1 rounded-lg bg-accent/10 text-[8px] md:text-[10px] font-black text-accent uppercase">
                      {t('landing.statusNew')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────── FEATURE SHOWCASE ──────────────── */}
      <section className="relative py-24 md:py-32 border-t border-border bg-secondary/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section header */}
          <div className="text-center mb-16 md:mb-20">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-accent mb-4">
              {t('landing.featuresBadge')}
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-6xl font-serif font-black text-foreground tracking-tight mb-4">
              {t('landing.featuresTitle')}
            </h2>
            <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-medium">
              {t('landing.featuresSubtitle')}
            </p>
          </div>

          {/* Feature grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
            {featureKeys.map((key) => {
              const { icon: Icon, color } = featureIcons[key];
              const title = t(`landing.features.${key}.title`);
              const desc = t(`landing.features.${key}.desc`);
              return (
                <div
                  key={key}
                  className="group glass-panel rounded-[2rem] p-6 md:p-8 border-white/5 hover:shadow-[0_20px_50px_-15px_var(--color-accent)/0.15] hover:-translate-y-1.5 transition-all duration-400"
                >
                  <div className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center border ${color} mb-5 group-hover:scale-110 transition-transform duration-300`}>
                    <Icon className="w-6 h-6 md:w-7 md:h-7" />
                  </div>
                  <h3 className="text-lg md:text-xl font-serif font-black text-foreground tracking-tight mb-2">
                    {title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed font-medium">
                    {desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ──────────────── PRICING TIERS (demo) ──────────────── */}
      <section className="relative py-24 md:py-32 border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section header */}
          <div className="text-center mb-16 md:mb-20">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase tracking-[0.15em] mb-4 border border-amber-500/20">
              <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
              {t('landing.pricingBadge')}
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-6xl font-serif font-black text-foreground tracking-tight mb-4">
              {t('landing.pricingTitle')}
            </h2>
            <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-medium">
              {t('landing.pricingSubtitle')}
            </p>
          </div>

          {/* Tier cards */}
          <div className="grid md:grid-cols-3 gap-8 md:gap-6 max-w-5xl mx-auto items-start">
            {tiers.map((tier) => (
              <div
                key={tier.key}
                className={`relative glass-panel rounded-[2.5rem] p-8 md:p-10 border ${tier.accent} flex flex-col transition-all duration-400 hover:-translate-y-2 hover:shadow-2xl ${
                  tier.highlight ? 'md:scale-105 z-10 shadow-2xl' : ''
                }`}
              >
                {tier.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-1 rounded-full bg-accent text-accent-foreground text-[10px] font-black uppercase tracking-widest shadow-lg shadow-accent/30 whitespace-nowrap">
                    <Star className="w-3 h-3 fill-accent-foreground text-accent-foreground" />
                    {tier.badge}
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-xl font-serif font-black text-foreground tracking-tight mb-1">
                    {tier.name}
                  </h3>
                  <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                    {tier.desc}
                  </p>
                </div>

                <div className="mb-8">
                  <span className="text-5xl font-serif font-black text-foreground tracking-tight">
                    &euro;{tier.price}
                  </span>
                  <span className="text-muted-foreground font-medium">{tier.period}</span>
                </div>

                <ul className="space-y-3.5 mb-10 flex-1">
                  {tier.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <Check className="w-4 h-4 mt-0.5 shrink-0 text-accent" />
                      <span className="text-muted-foreground font-medium">{f}</span>
                    </li>
                  ))}
                </ul>

                <Link to={tier.key === 'enterprise' ? '/login' : '/register'}>
                  <Button
                    className={`w-full py-6 rounded-2xl font-black text-sm uppercase tracking-widest transition-all duration-300 ${
                      tier.highlight
                        ? 'bg-accent text-accent-foreground hover:shadow-[0_20px_40px_-10px_var(--color-accent)/0.4] hover:-translate-y-1 shadow-xl'
                        : 'bg-foreground text-background hover:shadow-xl hover:-translate-y-1'
                    } cursor-pointer`}
                  >
                    {tier.cta}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────── BOTTOM CTA ──────────────── */}
      <section className="relative py-24 md:py-32 border-t border-border bg-secondary/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl sm:text-5xl md:text-7xl font-serif font-black text-foreground tracking-tight mb-6 leading-[0.95]">
            {t('landing.bottomCtaTitle')}{' '}
            <span className="text-accent text-glow">{t('landing.bottomCtaWordAccent')}</span>?
          </h2>
          <p className="text-base md:text-lg text-muted-foreground mb-10 max-w-xl mx-auto font-medium leading-relaxed">
            {t('landing.bottomCtaSubtitle')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/register">
              <Button size="lg" className="w-full sm:w-auto text-base px-12 py-6 font-black bg-accent text-accent-foreground hover:scale-105 hover:shadow-[0_20px_50px_-12px_var(--color-accent)/0.4] transition-all duration-300 shadow-xl cursor-pointer rounded-2xl">
                {t('landing.bottomCtaButton')}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline" className="w-full sm:w-auto text-base px-10 py-6 font-bold border-2 border-border text-foreground hover:bg-muted hover:scale-105 transition-all duration-300 rounded-2xl cursor-pointer">
                {t('landing.bottomCtaLogin')}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ──────────────── FOOTER ──────────────── */}
      <footer className="relative border-t border-border py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground tracking-tight">
            <QrCode className="w-4 h-4 text-accent" />
            QR Menu
          </div>
          <p className="text-xs text-muted-foreground font-medium">
            &copy; {new Date().getFullYear()} {t('landing.footerRights')}
          </p>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
