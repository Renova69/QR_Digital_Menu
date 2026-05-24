import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import {
  QrCode, Smartphone, Star, ShoppingCart,
  ChefHat, CreditCard, Globe, Shield, MessageSquare, Import,
  BarChart2, Gift, Palette, Zap, Check, ArrowRight, Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LandingFAQ from '../components/landing/LandingFAQ';

const featureCards = [
  { icon: QrCode,        color: 'bg-violet-500/15 text-violet-500',  borderColor: 'border-violet-500/20',  key: 'qrOrdering' },
  { icon: ShoppingCart,  color: 'bg-blue-500/15 text-blue-500',      borderColor: 'border-blue-500/20',    key: 'tableManagement' },
  { icon: Smartphone,    color: 'bg-emerald-500/15 text-emerald-500',borderColor: 'border-emerald-500/20', key: 'waiterPos' },
  { icon: ChefHat,       color: 'bg-orange-500/15 text-orange-500',  borderColor: 'border-orange-500/20',  key: 'kitchenDisplay' },
  { icon: Globe,         color: 'bg-pink-500/15 text-pink-500',      borderColor: 'border-pink-500/20',    key: 'multiLanguage' },
  { icon: BarChart2,     color: 'bg-cyan-500/15 text-cyan-500',      borderColor: 'border-cyan-500/20',    key: 'analytics' },
  { icon: CreditCard,    color: 'bg-rose-500/15 text-rose-500',      borderColor: 'border-rose-500/20',    key: 'payments' },
  { icon: Gift,          color: 'bg-amber-500/15 text-amber-500',    borderColor: 'border-amber-500/20',   key: 'loyalty' },
  { icon: Palette,       color: 'bg-fuchsia-500/15 text-fuchsia-500',borderColor: 'border-fuchsia-500/20', key: 'branding' },
  { icon: Shield,        color: 'bg-indigo-500/15 text-indigo-500',  borderColor: 'border-indigo-500/20',  key: 'staffAccess' },
  { icon: MessageSquare, color: 'bg-teal-500/15 text-teal-500',      borderColor: 'border-teal-500/20',    key: 'feedback' },
  { icon: Import,        color: 'bg-slate-500/15 text-slate-400',    borderColor: 'border-slate-500/20',   key: 'menuImport' },
] as const;

type TierKey = 'starter' | 'pro' | 'enterprise';

const trustLogos = [
  'BISTRO', 'The Plate Room', 'Burgeria', 'Sato', 'Sigma'
];

const HomePage = () => {
  const { t } = useTranslation();

  const tiers: Array<{
    key: TierKey;
    name: string;
    price: string;
    period: string;
    desc: string;
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
      features: Array.from({ length: 6 }, (_, i) => t(`landing.tiers.starterFeature${i + 1}`, `Feature ${i + 1}`)),
      cta: t('landing.getStarted'),
      highlight: false,
    },
    {
      key: 'pro',
      name: t('landing.tiers.proName'),
      price: '79',
      period: '/month',
      desc: t('landing.tiers.proDesc'),
      features: Array.from({ length: 10 }, (_, i) => t(`landing.tiers.proFeature${i + 1}`, `Feature ${i + 1}`)),
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
      features: Array.from({ length: 10 }, (_, i) => t(`landing.tiers.enterpriseFeature${i + 1}`, `Feature ${i + 1}`)),
      cta: t('landing.contactSales'),
      highlight: false,
    },
  ];

  const everythingList = [
    t('landing.everything1', 'Light & Dark modes'),
    t('landing.everything2', 'Cloud-based & secure'),
    t('landing.everything3', 'Real-time orders'),
    t('landing.everything4', '24/7 support'),
  ];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Ambient violet blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[55%] rounded-full blur-[160px]" style={{ background: 'hsl(258 90% 60% / 0.12)' }} />
        <div className="absolute top-[5%] -right-[8%] w-[40%] h-[55%] rounded-full blur-[140px]" style={{ background: 'hsl(285 85% 65% / 0.09)' }} />
        <div className="absolute bottom-[0%] left-[15%] w-[45%] h-[40%] rounded-full blur-[150px]" style={{ background: 'hsl(265 95% 70% / 0.07)' }} />
      </div>

      {/* ──────────────── HERO ──────────────── */}
      <section className="relative pt-28 md:pt-32 pb-16 md:pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1fr_260px_1fr] gap-8 lg:gap-10 items-start">

          {/* Left: copy */}
          <div className="text-center lg:text-left">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-[0.15em] mb-7 border border-primary/20 backdrop-blur-md" style={{ background: 'rgba(110, 86, 248, 0.08)', color: 'var(--brand-2)' }}>
              <Zap className="w-3.5 h-3.5" />
              <span>{t('landing.heroBadge', 'Built for restaurants. Loved by customers.')}</span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl font-display font-bold text-foreground tracking-tight mb-5 leading-[1.05]">
              {t('landing.heroLine1', 'Mobile-first digital menus for')}{' '}
              <span className="brand-gradient-text">{t('landing.heroWordAccent', 'modern restaurants')}</span>
            </h1>

            <p className="text-base text-muted-foreground mb-7 max-w-md font-medium leading-relaxed">
              {t('landing.heroSubtext', 'QR MENU helps restaurants streamline operations, boost sales, and deliver exceptional experiences — all from a scan.')}
            </p>

            {/* Feature pills */}
            <div className="grid grid-cols-2 gap-2.5 mb-7 max-w-[400px]">
              {[
                { icon: QrCode,     label: t('landing.fp1', 'QR Ordering') },
                { icon: BarChart2,  label: t('landing.fp2', 'Live Analytics') },
                { icon: CreditCard, label: t('landing.fp3', 'Stripe Pay') },
                { icon: Gift,       label: t('landing.fp4', 'VIP Loyalty') },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2.5 px-3 py-2.5 bg-card border border-border rounded-xl text-xs font-medium text-foreground">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  {label}
                </div>
              ))}
            </div>

            {/* CTA row */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <Link to="/register">
                <Button size="lg" className="w-full sm:w-auto text-sm px-8 py-5 font-bold rounded-2xl cursor-pointer">
                  {t('landing.startFreeTrial', 'Start Free Trial')}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Link to="/login">
                <Button size="lg" variant="outline" className="w-full sm:w-auto text-sm px-8 py-5 font-bold rounded-2xl cursor-pointer border-border/60">
                  {t('landing.viewLiveDemo', 'Watch Demo')}
                </Button>
              </Link>
            </div>

            {/* Trust chips */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 text-xs text-muted-foreground font-medium">
              {[
                t('landing.noCreditCard', 'No credit card required'),
                t('landing.setupIn5', 'Setup in 5 minutes'),
                t('landing.cancelAnytime', 'Cancel anytime'),
              ].map((item) => (
                <span key={item} className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                  {item}
                </span>
              ))}
            </div>
          </div>

          {/* Center: phone mockup */}
          <div className="hidden md:flex justify-center items-start pt-2">
            <div className="relative w-[220px] shrink-0">
              <div className="relative w-full rounded-[2.5rem] overflow-hidden shadow-2xl border-4" style={{ borderColor: 'hsl(248 25% 18%)', background: 'hsl(245 40% 7%)' }}>
                {/* Notch */}
                <div className="w-20 h-5 mx-auto rounded-b-2xl bg-black mt-1 mb-3" />
                {/* Phone screen content */}
                <div className="px-3 pb-6">
                  {/* Restaurant header */}
                  <div className="rounded-2xl p-3 mb-3" style={{ background: 'var(--brand)' }}>
                    <p className="text-[10px] text-white/70 font-medium">The Good Food Co.</p>
                    <p className="text-white font-bold text-sm">Happy Hour 🍹</p>
                    <div className="flex gap-1.5 mt-2">
                      {['Popular', 'Drinks', 'Mains'].map((c) => (
                        <span key={c} className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${c === 'Popular' ? 'bg-white text-violet-700' : 'bg-white/20 text-white'}`}>{c}</span>
                      ))}
                    </div>
                  </div>
                  {/* Menu items */}
                  {[
                    { name: 'Truffle Pasta', price: '€18', img: '🍝' },
                    { name: 'Sea Bass', price: '€24', img: '🐟' },
                    { name: 'Tiramisu', price: '€8', img: '🍰' },
                  ].map((item) => (
                    <div key={item.name} className="flex items-center gap-2 glass-panel rounded-xl p-2 mb-2">
                      <span className="text-lg w-8 h-8 flex items-center justify-center rounded-lg bg-card/60">{item.img}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-foreground truncate">{item.name}</p>
                        <p className="text-[9px] text-muted-foreground">Restaurant special</p>
                      </div>
                      <span className="text-[10px] font-bold text-primary shrink-0">{item.price}</span>
                    </div>
                  ))}
                  {/* Add to cart row */}
                  <div className="mt-3 brand-cta rounded-xl py-2 text-center text-[10px] font-bold text-white">
                    Add to Cart
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: dashboard preview */}
          <div className="hidden lg:block">
            <div className="bg-card border border-border rounded-[1.375rem] p-5" style={{ boxShadow: 'var(--shadow-lg)' }}>
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-[15px] font-bold text-foreground">Dashboard</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Live overview</p>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-secondary border border-border rounded-lg text-[11px] text-muted-foreground font-medium">
                  Today
                </div>
              </div>

              {/* KPI grid */}
              <div className="grid grid-cols-4 gap-2 mb-3.5">
                {[
                  { label: 'Revenue',   val: '€12,420', trend: '+12%' },
                  { label: 'Orders',    val: '3,842',   trend: '+8%'  },
                  { label: 'Avg Order', val: '€18.25',  trend: '+3%'  },
                  { label: 'Customers', val: '324',     trend: '+5%'  },
                ].map((k) => (
                  <div key={k.label} className="p-2 bg-secondary border border-border rounded-xl">
                    <p className="text-[9px] text-muted-foreground mb-1">{k.label}</p>
                    <p className="text-xs font-bold text-foreground leading-tight">{k.val}</p>
                    <span className="text-[8.5px] font-semibold text-emerald-500">{k.trend}</span>
                  </div>
                ))}
              </div>

              {/* Orders chart */}
              <div className="bg-secondary border border-border rounded-xl p-3 mb-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-bold text-foreground">Orders Overview</p>
                  <div className="flex gap-1 text-[9px] text-muted-foreground">
                    {['7d', '30d', '3m'].map((p) => (
                      <span key={p} className={`px-1.5 py-0.5 rounded-md ${p === '7d' ? 'bg-card font-semibold text-foreground' : ''}`}>{p}</span>
                    ))}
                  </div>
                </div>
                <div className="flex items-end gap-0.5 h-14">
                  {[4, 7, 5, 9, 8, 12, 10].map((h, i) => (
                    <div key={i} className="flex-1 rounded-sm" style={{ height: `${(h / 12) * 100}%`, background: 'rgba(110, 86, 248, 0.35)' }} />
                  ))}
                </div>
              </div>

              {/* Recent orders mini-table */}
              <div className="space-y-1">
                {[
                  { table: 'Table 3', items: '3 items', amount: '€42.50', status: 'NEW'   },
                  { table: 'Table 7', items: '5 items', amount: '€67.00', status: 'READY' },
                  { table: 'Table 1', items: '2 items', amount: '€28.00', status: 'DONE'  },
                ].map((o) => (
                  <div key={o.table} className="flex items-center gap-2 text-[10px] py-1.5 px-2 rounded-lg hover:bg-secondary transition-colors">
                    <span className="font-semibold text-foreground w-12">{o.table}</span>
                    <span className="text-muted-foreground flex-1">{o.items}</span>
                    <span className="font-bold text-foreground">{o.amount}</span>
                    <span className={`font-bold px-1.5 py-0.5 rounded-md text-[8.5px] ${
                      o.status === 'NEW'   ? 'bg-primary/10 text-primary' :
                      o.status === 'READY' ? 'bg-emerald-500/10 text-emerald-500' :
                                             'bg-muted text-muted-foreground'
                    }`}>{o.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Trust strip */}
        <div className="mt-16 md:mt-20 text-center">
          <p className="text-xs text-muted-foreground font-medium mb-5 uppercase tracking-widest">
            {t('landing.trustedBy', 'Trusted by 2,500+ restaurants worldwide')}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
            {trustLogos.map((name) => (
              <span key={name} className="text-sm font-display font-bold text-muted-foreground/40 tracking-tight uppercase">
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────── FEATURES GRID ──────────────── */}
      <section id="features" className="relative py-24 md:py-32 border-t border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 md:mb-20">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-primary mb-4">
              {t('landing.featuresBadge', 'Everything you need')}
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-display font-bold text-foreground tracking-tight mb-4">
              {t('landing.featuresTitle', 'All-in-one restaurant platform')}
            </h2>
            <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-medium">
              {t('landing.featuresSubtitle', 'From QR menus to payments to loyalty — manage your entire restaurant from one dashboard.')}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 mb-12">
            {featureCards.map(({ icon: Icon, color, borderColor, key }) => (
              <div
                key={key}
                className="group glass-panel rounded-[1.5rem] p-6 md:p-7 hover:shadow-[0_20px_50px_-15px_hsl(258_90%_60%/0.2)] hover:-translate-y-1.5 transition-all duration-300"
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center border ${color} ${borderColor} mb-4 group-hover:scale-110 transition-transform duration-300`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-base font-display font-bold text-foreground tracking-tight mb-1.5">
                  {t(`landing.features.${key}.title`, key)}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t(`landing.features.${key}.desc`, 'Powerful feature for modern restaurants.')}
                </p>
              </div>
            ))}
          </div>

          {/* Everything you need panel */}
          <div className="rounded-[2rem] p-8 md:p-12 flex flex-col md:flex-row items-center gap-8 md:gap-16" style={{ background: 'linear-gradient(135deg, hsl(248 40% 10%), hsl(258 50% 14%))' }}>
            <div className="flex-1">
              <h3 className="text-2xl md:text-3xl font-display font-bold text-white mb-4">
                {t('landing.everythingTitle', 'Everything you need.')}
                <br />
                <span className="brand-gradient-text">{t('landing.onePlatform', 'One powerful platform.')}</span>
              </h3>
              <ul className="space-y-3">
                {everythingList.map((item) => (
                  <li key={item} className="flex items-center gap-3 text-white/80 text-sm font-medium">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--gradient-brand)' }}>
                      <Check className="w-3 h-3 text-white" />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-3 w-full md:w-auto">
              <Link to="/register">
                <Button size="lg" className="w-full md:w-52 cursor-pointer">
                  {t('landing.startFreeTrial', 'Start Free Trial')}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Link to="/login">
                <Button size="lg" variant="outline" className="w-full md:w-52 cursor-pointer border-white/20 text-white hover:bg-white/10">
                  {t('landing.viewLiveDemo', 'Watch Demo')}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────── PRICING ──────────────── */}
      <section className="relative py-24 md:py-32 border-t border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 md:mb-20">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-500 text-[10px] font-bold uppercase tracking-[0.15em] mb-4 border border-amber-500/20">
              <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
              {t('landing.pricingBadge', 'Pricing')}
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-display font-bold text-foreground tracking-tight mb-4">
              {t('landing.pricingTitle', 'Simple, transparent pricing')}
            </h2>
            <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-medium">
              {t('landing.pricingSubtitle', 'No hidden fees. No surprises. Cancel any time.')}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto items-start">
            {tiers.map((tier) => (
              <div
                key={tier.key}
                className={`relative glass-panel rounded-[2rem] p-8 flex flex-col transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl ${
                  tier.highlight ? 'md:scale-105 z-10 shadow-2xl ring-2 ring-primary/30' : ''
                }`}
              >
                {tier.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest text-white shadow-lg whitespace-nowrap" style={{ background: 'var(--gradient-brand)' }}>
                    <Star className="w-3 h-3 fill-white" />
                    {tier.badge}
                  </div>
                )}
                <div className="mb-5">
                  <h3 className="text-lg font-display font-bold text-foreground tracking-tight mb-1">{tier.name}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{tier.desc}</p>
                </div>
                <div className="mb-6">
                  <span className="text-4xl font-display font-bold text-foreground">&euro;{tier.price}</span>
                  <span className="text-muted-foreground text-sm font-medium">{tier.period}</span>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {tier.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      <Check className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>
                <Link to={tier.key === 'enterprise' ? '/login' : '/register'}>
                  <Button className={`w-full py-5 rounded-2xl font-bold text-sm cursor-pointer ${!tier.highlight ? 'variant-outline' : ''}`} variant={tier.highlight ? 'default' : 'outline'}>
                    {tier.cta}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────── BOTTOM CTA ──────────────── */}
      <section className="relative py-24 md:py-32 border-t border-border/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-display font-bold text-foreground tracking-tight mb-6 leading-tight">
            {t('landing.bottomCtaTitle', 'Ready to grow your')}{' '}
            <span className="brand-gradient-text text-glow">{t('landing.bottomCtaWordAccent', 'restaurant')}</span>?
          </h2>
          <p className="text-base md:text-lg text-muted-foreground mb-10 max-w-xl mx-auto font-medium leading-relaxed">
            {t('landing.bottomCtaSubtitle', 'Join thousands of restaurants already using QR Menu to drive more orders and happier customers.')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/register">
              <Button size="lg" className="w-full sm:w-auto text-sm px-12 py-5 cursor-pointer rounded-2xl">
                {t('landing.bottomCtaButton', 'Start Free Trial')}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline" className="w-full sm:w-auto text-sm px-10 py-5 cursor-pointer rounded-2xl border-border/60">
                {t('landing.bottomCtaLogin', 'Log In')}
              </Button>
            </Link>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 mt-8 text-xs text-muted-foreground font-medium">
            <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-primary" />{t('landing.trustedBy2500', '2,500+ restaurants')}</span>
            <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-primary" />{t('landing.noCreditCard', 'No credit card')}</span>
            <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-primary" />{t('landing.cancelAnytime', 'Cancel anytime')}</span>
          </div>
        </div>
      </section>

      {/* ──────────────── FAQ ──────────────── */}
      <LandingFAQ />

      {/* ──────────────── FOOTER ──────────────── */}
      <footer className="relative border-t border-border/50 py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'var(--gradient-brand)' }}>
              <QrCode className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-display font-bold brand-gradient-text tracking-tight">
              QR MENU
            </span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/legal/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">{t('footer.privacy', 'Privacy')}</Link>
            <Link to="/legal/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors">{t('footer.terms', 'Terms')}</Link>
            <Link to="/legal/cookies" className="text-xs text-muted-foreground hover:text-foreground transition-colors">{t('footer.cookies', 'Cookies')}</Link>
          </div>
          <p className="text-xs text-muted-foreground font-medium">
            &copy; {new Date().getFullYear()} {t('landing.footerRights', 'QR Menu. All rights reserved.')}
          </p>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
