import { Link } from 'react-router-dom';
import { useState } from 'react';
import {
  ArrowRight,
  BarChart2,
  Check,
  ChefHat,
  Clock,
  CreditCard,
  Gift,
  Languages,
  LayoutDashboard,
  MessageSquare,
  Palette,
  QrCode,
  Shield,
  ShoppingCart,
  Smartphone,
  Users,
  Zap,
  Upload,
  TrendingUp,
  UserCheck,
  MonitorSmartphone,
  Plus,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';

/* ═══════════════════════════════════════════════════════════
   DATA
   ═══════════════════════════════════════════════════════════ */

type TierKey = 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

type Plan = {
  key: TierKey;
  name: string;
  price: string;
  period: string;
  description: string;
  badge?: string;
  highlight?: boolean;
  cta: string;
  href: string;
  bullets: string[];
  accent: string;
};

type FeatureRow = {
  label: string;
  free: boolean | string;
  starter: boolean | string;
  professional: boolean | string;
  enterprise: boolean | string;
};

const featureCards = [
  {
    icon: QrCode,
    title: 'QR Code Menus',
    text: 'Customers scan, browse, filter by allergens, and order from a polished menu that works beautifully on every phone — no app download required.',
    tone: 'from-violet-500 to-purple-600',
    toneBg: 'bg-violet-500/10 text-violet-500',
  },
  {
    icon: ShoppingCart,
    title: 'Online Ordering & Checkout',
    text: 'Turn menu views into orders with table context, persistent carts, option variations, special requests, and server-validated pricing.',
    tone: 'from-blue-500 to-indigo-600',
    toneBg: 'bg-blue-500/10 text-blue-500',
  },
  {
    icon: CreditCard,
    title: 'Stripe Connect Payments',
    text: 'End-to-end pay-at-table with Stripe Connect. Tips, platform fees, real-time payment notifications, and full payment history.',
    tone: 'from-emerald-500 to-teal-600',
    toneBg: 'bg-emerald-500/10 text-emerald-500',
  },
  {
    icon: ChefHat,
    title: 'Kitchen Display System',
    text: 'Real-time kanban board for kitchen staff. Elapsed timers, urgency flags at 15 min, audio alerts, and a dark-only UI optimized for kitchen glare.',
    tone: 'from-orange-500 to-red-500',
    toneBg: 'bg-orange-500/10 text-orange-500',
  },
  {
    icon: MonitorSmartphone,
    title: 'Waiter POS',
    text: 'Full-viewport mobile POS for tableside ordering. Seat assignment, item notes, split bill, QR bill, and complete isolation from customer carts.',
    tone: 'from-pink-500 to-rose-600',
    toneBg: 'bg-pink-500/10 text-pink-500',
  },
  {
    icon: LayoutDashboard,
    title: 'Live Table Management',
    text: 'Color-coded real-time table grid with zone/section grouping. Occupied, paid, empty status — updated instantly via WebSocket.',
    tone: 'from-cyan-500 to-blue-500',
    toneBg: 'bg-cyan-500/10 text-cyan-500',
  },
  {
    icon: Gift,
    title: 'Loyalty & VIP Tiers',
    text: 'FIFO point ledger with configurable earn/redeem rates, timezone-aware happy hour multipliers, and Bronze/Silver/Gold VIP tiers.',
    tone: 'from-amber-500 to-yellow-600',
    toneBg: 'bg-amber-500/10 text-amber-500',
  },
  {
    icon: BarChart2,
    title: 'Analytics & Reporting',
    text: 'Revenue trends, top dishes, peak hours, category breakdown, table performance, and customer feedback — exportable as CSV or XLSX.',
    tone: 'from-indigo-500 to-violet-600',
    toneBg: 'bg-indigo-500/10 text-indigo-500',
  },
  {
    icon: Languages,
    title: 'Multi-Language Menus',
    text: 'Platform-managed DeepL auto-translation with lazy caching. Serve locals and tourists with EN/BG/RO menus — no API key needed from owners.',
    tone: 'from-teal-500 to-emerald-600',
    toneBg: 'bg-teal-500/10 text-teal-500',
  },
  {
    icon: Palette,
    title: 'Custom Branding',
    text: 'Match the restaurant identity with custom colors, fonts, logo, dark mode, social links, and a branded public menu footer.',
    tone: 'from-fuchsia-500 to-pink-600',
    toneBg: 'bg-fuchsia-500/10 text-fuchsia-500',
  },
  {
    icon: Users,
    title: 'Staff & Role Management',
    text: 'RBAC with Owner, Manager, Waiter, Kitchen roles. Staff PINs, device enrollment, order attribution, and tier-aware role limits.',
    tone: 'from-sky-500 to-blue-600',
    toneBg: 'bg-sky-500/10 text-sky-500',
  },
  {
    icon: Upload,
    title: 'Menu Import/Export',
    text: 'Import menus from OCR JSON or XLSX. Export as JSON, CSV, or XLSX for backup, migration, or bulk editing in Excel/Google Sheets.',
    tone: 'from-lime-500 to-green-600',
    toneBg: 'bg-lime-500/10 text-lime-500',
  },
  {
    icon: UserCheck,
    title: 'Customer Accounts',
    text: 'Frictionless customer login via email OTP or Google OAuth. Loyalty profile, order history, point balance, and VIP tier progress.',
    tone: 'from-rose-500 to-red-600',
    toneBg: 'bg-rose-500/10 text-rose-500',
  },
  {
    icon: TrendingUp,
    title: 'Smart Upselling',
    text: 'Drink upsell suggestions at checkout, perfect pairing modals on add-to-cart, and trending carousel showing top dishes automatically.',
    tone: 'from-yellow-500 to-orange-500',
    toneBg: 'bg-yellow-500/10 text-yellow-500',
  },
  {
    icon: MessageSquare,
    title: 'Feedback & Reviews',
    text: 'Post-order star rating and comments. Positive reviews redirect to Google Reviews. Low ratings stay private for the owner to review.',
    tone: 'from-purple-500 to-indigo-600',
    toneBg: 'bg-purple-500/10 text-purple-500',
  },
  {
    icon: Shield,
    title: 'Security & Compliance',
    text: 'GDPR module, CSRF protection, httpOnly JWT cookies, admin audit trail, brute-force lockout, rate limiting, and TypeScript strict mode.',
    tone: 'from-slate-500 to-gray-700',
    toneBg: 'bg-slate-500/10 text-slate-500',
  },
] as const;

const advantageItems = [
  {
    icon: Clock,
    label: 'Launch a menu in minutes',
    text: 'Import items via OCR or XLSX, organize categories with drag-and-drop, generate QR codes, and keep everything editable in real time.',
  },
  {
    icon: CreditCard,
    label: 'Reduce ordering friction',
    text: 'Guests order and pay from the table without waiting for the next waiter touch. No app download, no sign-up wall.',
  },
  {
    icon: MessageSquare,
    label: 'Know what guests need',
    text: 'Collect feedback, call-waiter requests, and customer signals in real time — before problems become complaints.',
  },
  {
    icon: Zap,
    label: 'Move faster every shift',
    text: 'Live kitchen display, smart analytics, role-based staff tools, and zone-filtered POS keep teams aligned and efficient.',
  },
] as const;

const comparisonRows: FeatureRow[] = [
  { label: 'Digital menu builder', free: true, starter: true, professional: true, enterprise: true },
  { label: 'QR code management', free: true, starter: true, professional: true, enterprise: true },
  { label: 'OCR / XLSX menu import', free: true, starter: true, professional: true, enterprise: true },
  { label: 'Menu export (JSON/CSV/XLSX)', free: true, starter: true, professional: true, enterprise: true },
  { label: 'Online ordering', free: false, starter: true, professional: true, enterprise: true },
  { label: 'Basic analytics & summary', free: false, starter: true, professional: true, enterprise: true },
  { label: 'Stripe pay-at-table', free: false, starter: false, professional: true, enterprise: true },
  { label: 'Call waiter button', free: false, starter: false, professional: true, enterprise: true },
  { label: 'Multi-language menus (DeepL)', free: false, starter: false, professional: true, enterprise: true },
  { label: 'Custom branding & themes', free: false, starter: false, professional: true, enterprise: true },
  { label: 'Loyalty program & VIP tiers', free: false, starter: false, professional: true, enterprise: true },
  { label: 'Customer accounts & profiles', free: false, starter: false, professional: true, enterprise: true },
  { label: 'Advanced analytics & XLSX export', free: false, starter: false, professional: true, enterprise: true },
  { label: 'Smart upselling & pairings', free: false, starter: false, professional: true, enterprise: true },
  { label: 'Feedback & Google Reviews', free: false, starter: false, professional: true, enterprise: true },
  { label: 'POS & kitchen display (KDS)', free: false, starter: false, professional: false, enterprise: true },
  { label: 'Table zones & sections', free: false, starter: false, professional: false, enterprise: true },
  { label: 'Staff attribution & itemized bills', free: false, starter: false, professional: false, enterprise: true },
  { label: 'Staff seats', free: '1', starter: '1', professional: '5', enterprise: 'Unlimited' },
  { label: 'Multi-location support', free: false, starter: false, professional: false, enterprise: true },
  { label: 'Priority support', free: false, starter: false, professional: false, enterprise: true },
  { label: 'Super-admin ops panel', free: false, starter: false, professional: false, enterprise: true },
];

const faqItems = [
  {
    question: 'Can I use QR Menu without taking online payments?',
    answer: 'Yes. You can start with the digital menu and QR code workflow, then add ordering, payments, loyalty, POS, or kitchen tools when the restaurant is ready. Each feature unlocks at the right tier.',
  },
  {
    question: 'Do guests need to download an app?',
    answer: 'No. Guests open the menu from a QR scan in their phone browser — no app store, no sign-up wall. The experience is fast and familiar on both iPhone and Android.',
  },
  {
    question: 'Which plan is best for a growing restaurant?',
    answer: 'Professional is the best fit for most restaurants because it includes payments, full analytics, loyalty programs, multi-language menus, custom branding, and up to 5 staff members.',
  },
  {
    question: 'Can I upgrade or downgrade later?',
    answer: 'Yes. Plans are built to let restaurants start small and unlock more tools as the team grows. You can upgrade or downgrade anytime through the Stripe customer portal.',
  },
  {
    question: 'Does the platform support kitchen and staff workflows?',
    answer: 'Yes. Enterprise includes a full Kitchen Display System (KDS), Waiter POS, table zones, staff attribution, itemized bills, multi-location support, and priority service features.',
  },
  {
    question: 'How does the loyalty program work?',
    answer: 'Customers earn points on every order using a FIFO ledger system. Points can be redeemed for cash discounts or free items. The system supports VIP tiers (Bronze/Silver/Gold), happy hour multipliers, signup bonuses, and automated expiry reminders.',
  },
  {
    question: 'What languages are supported for menus?',
    answer: 'The platform auto-translates menus into English, Bulgarian, and Romanian using DeepL. The restaurant owner never needs to supply an API key — translation is platform-managed with intelligent caching.',
  },
];

/* ═══════════════════════════════════════════════════════════
   COMPONENTS
   ═══════════════════════════════════════════════════════════ */

function FeatureValue({ value }: { value: boolean | string }) {
  if (typeof value === 'string') {
    return <span className="text-xs font-bold text-foreground">{value}</span>;
  }
  return value ? (
    <span className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
      <Check className="h-3.5 w-3.5" />
    </span>
  ) : (
    <span className="text-muted-foreground/40">—</span>
  );
}

function PhoneMockup() {
  return (
    <div className="flex justify-center self-start pt-2">
      <div className="relative w-[320px] rounded-[48px] p-3" style={{ background: 'linear-gradient(160deg, #1F1D2A 0%, #0E0C16 100%)', boxShadow: '0 30px 80px -20px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.04) inset, 0 0 0 2px #2a2740' }}>
        {/* notch */}
        <div className="absolute left-1/2 top-[18px] z-20 h-[30px] w-[110px] -translate-x-1/2 rounded-[20px] bg-black" />
        {/* screen */}
        <div className="flex h-[636px] flex-col overflow-hidden rounded-[38px] bg-white px-4 pt-3.5 text-[#0E0B1A]">
          {/* status bar */}
          <div className="flex items-center justify-between px-1 pb-3 pt-1.5 text-sm font-semibold text-[#0E0B1A]">
            <span>9:41</span>
            <span className="inline-flex items-center gap-[5px]">
              <svg width="14" height="10" viewBox="0 0 18 12"><path d="M1 9h2v3H1zM5 6h2v6H5zM9 3h2v9H9zM13 0h2v12h-2z" fill="currentColor"/></svg>
              <svg width="14" height="10" viewBox="0 0 18 12" fill="currentColor"><path d="M9 2C5.5 2 2.5 3.5 0 5.5L9 12l9-6.5C15.5 3.5 12.5 2 9 2z"/></svg>
              <svg width="22" height="12" viewBox="0 0 26 12" fill="none"><rect x="1" y="1" width="22" height="10" rx="2" stroke="currentColor"/><rect x="3" y="3" width="17" height="6" rx="1" fill="currentColor"/><rect x="24" y="4" width="2" height="4" rx="1" fill="currentColor"/></svg>
            </span>
          </div>
          {/* header */}
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-base font-bold text-[#0E0B1A]">The Good Food Co. <span className="ml-0.5 text-[10px] text-[#888]">▾</span></div>
              <div className="mt-0.5 text-[11px] text-[#666]">Good Food, Good Mood 🙂</div>
            </div>
            <div className="relative grid h-9 w-9 place-items-center rounded-full bg-[#EFEBFF] text-[#6E56F8]">
              <ShoppingCart className="h-[18px] w-[18px]" />
              <span className="absolute -right-1 -top-1 grid h-[18px] w-[18px] place-items-center rounded-full bg-[#6E56F8] text-[10px] font-bold text-white">3</span>
            </div>
          </div>
          {/* banner */}
          <div className="relative mb-3 flex h-[92px] overflow-hidden rounded-[14px] p-3.5 text-white" style={{ background: 'linear-gradient(135deg, #6B2D1A 0%, #2A1108 100%)' }}>
            <div className="z-10">
              <div className="mb-1 text-base font-bold">Happy Hour 🍹</div>
              <div className="text-[11px] opacity-90">20% off on all orders</div>
              <div className="mt-1 text-[10px] opacity-80">Mon – Fri • 2PM – 5PM</div>
            </div>
            <div className="absolute right-[-10px] top-1/2 h-[90px] w-[90px] -translate-y-1/2 rounded-full" style={{ background: 'radial-gradient(circle at 35% 35%, #F08054 0%, #C44E2A 50%, #6B2D1A 90%)', boxShadow: 'inset -10px -8px 20px rgba(0,0,0,.3)' }}>
              <div className="absolute left-1/2 top-0 h-[30px] w-[2px] -translate-x-1/2 rotate-[8deg] rounded-sm bg-white" />
            </div>
          </div>
          {/* search */}
          <div className="mb-3 flex items-center gap-2 rounded-[10px] bg-[#F5F5F8] px-3 py-2.5 text-xs text-[#888]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            Search dishes...
          </div>
          {/* tabs */}
          <div className="mb-3.5 flex gap-1.5">
            {['All', 'Popular', 'Pizza', 'Pasta', 'Burgers'].map((tab, i) => (
              <span key={tab} className={`rounded-2xl px-3 py-1.5 text-[11px] font-medium ${i === 0 ? 'bg-[#6E56F8] text-white' : 'bg-[#F5F5F8] text-[#555]'}`}>{tab}</span>
            ))}
          </div>
          {/* list header */}
          <div className="mb-2.5 flex items-center justify-between text-[13px] font-bold">
            <span>Popular Dishes</span>
            <span className="text-[11px] font-semibold text-[#6E56F8]">View all</span>
          </div>
          {/* dishes */}
          <div className="flex flex-1 flex-col gap-2.5 overflow-hidden">
            {[
              { name: 'Margherita Pizza', desc: 'Fresh tomatoes, mozzarella, basil, olive oil and sea salt.', price: '€12.90', bg: 'linear-gradient(135deg, #F5A572, #C44E2A)', inner: '#E8C547', shape: 'circle' },
              { name: 'Truffle Pasta', desc: 'Creamy truffle sauce with parmesan and herbs.', price: '€15.90', bg: 'linear-gradient(135deg, #F4DB95, #C9A04E)', inner: 'rgba(255,255,255,.18)', shape: 'square' },
              { name: 'Grilled Salmon', desc: 'Served with seasonal vegetables.', price: '€18.90', bg: 'linear-gradient(135deg, #F08054, #C44E2A)', inner: 'rgba(255,255,255,.18)', shape: 'square' },
            ].map((dish) => (
              <div key={dish.name} className="grid grid-cols-[44px_1fr_28px] items-center gap-2.5">
                <div className="relative h-[44px] w-[44px] overflow-hidden rounded-[10px]" style={{ background: dish.bg }}>
                  <div className="absolute inset-0 m-auto" style={dish.shape === 'circle' ? { width: 30, height: 30, borderRadius: '50%', background: dish.inner } : { inset: 4, position: 'absolute', borderRadius: 8, background: dish.inner }} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#0E0B1A]">{dish.name}</div>
                  <div className="mt-0.5 line-clamp-2 text-[10px] text-[#888]">{dish.desc}</div>
                  <div className="mt-0.5 text-[11px] font-bold text-[#0E0B1A]">{dish.price}</div>
                </div>
                <button className="grid h-[26px] w-[26px] cursor-pointer place-items-center rounded-full bg-[#6E56F8] text-base font-semibold text-white">+</button>
              </div>
            ))}
          </div>
          {/* cart bar */}
          <div className="-mx-4 flex items-center justify-between bg-[#6E56F8] px-[18px] pb-[18px] pt-3.5 text-sm font-semibold text-white">
            <span className="inline-flex items-center gap-2">
              <ShoppingCart className="h-[18px] w-[18px]" />
              <span className="relative -left-1 grid h-4 w-4 place-items-center rounded-full bg-white text-[10px] font-bold text-[#6E56F8]">3</span>
              View Cart
            </span>
            <span className="text-sm font-bold">€41.70</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardPreview() {
  return (
    <div className="relative self-start pt-2">
      <div className="rounded-[22px] border border-border bg-card p-[22px] shadow-lg">
        {/* header */}
        <div className="mb-[18px] flex items-center justify-between">
          <div>
            <div className="text-lg font-bold text-foreground">Dashboard</div>
            <div className="mt-0.5 text-xs text-muted-foreground">Overview of your restaurant</div>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs text-muted-foreground">
            May 1 – May 22, 2025
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
          </div>
        </div>
        {/* KPIs */}
        <div className="mb-4 grid grid-cols-4 gap-2.5">
          {[
            { label: 'Total Orders', value: '1,246', trend: '↑ 18.6%' },
            { label: 'Total Revenue', value: '€12,430', trend: '↑ 22.1%' },
            { label: 'New Customers', value: '324', trend: '↑ 9.1%' },
            { label: 'Avg. Order Value', value: '€18.25', trend: '↑ 8.9%' },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-xl border border-border bg-secondary p-3">
              <div className="mb-1 text-[11px] text-muted-foreground">{kpi.label}</div>
              <div className="flex flex-wrap items-baseline gap-1.5 text-[17px] font-bold text-foreground">
                {kpi.value}
                <span className="text-[10px] font-semibold text-emerald-500">{kpi.trend}</span>
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">vs Apr 1 – Apr 22</div>
            </div>
          ))}
        </div>
        {/* row 1: chart + top dishes */}
        <div className="mb-3.5 grid grid-cols-[1.45fr_1fr] gap-3.5">
          {/* chart */}
          <div className="rounded-[14px] border border-border bg-secondary p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-bold text-foreground">Orders Overview</span>
              <div className="inline-flex gap-0.5 text-[11px] text-muted-foreground">
                <span className="rounded-md px-2 py-1">Day</span>
                <span className="rounded-md px-2 py-1">Week</span>
                <span className="rounded-md bg-primary/10 px-2 py-1 font-semibold text-primary">Month</span>
              </div>
            </div>
            <svg className="h-[130px] w-full" viewBox="0 0 360 130" preserveAspectRatio="none">
              <defs>
                <linearGradient id="heroLineGrad" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#8B6FFF" stopOpacity="0.35"/>
                  <stop offset="100%" stopColor="#8B6FFF" stopOpacity="0"/>
                </linearGradient>
              </defs>
              <g stroke="currentColor" className="text-border" strokeDasharray="2,3" fill="none">
                <line x1="0" y1="20" x2="360" y2="20"/><line x1="0" y1="55" x2="360" y2="55"/><line x1="0" y1="90" x2="360" y2="90"/>
              </g>
              <g className="fill-muted-foreground text-[9px]">
                <text x="6" y="18" fill="currentColor">1.5K</text><text x="6" y="58" fill="currentColor">1K</text><text x="6" y="93" fill="currentColor">500</text>
              </g>
              <path d="M30,90 L75,75 L120,80 L165,55 L210,65 L255,40 L300,45 L345,25" fill="none" stroke="#8B6FFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M30,90 L75,75 L120,80 L165,55 L210,65 L255,40 L300,45 L345,25 L345,120 L30,120 Z" fill="url(#heroLineGrad)"/>
              <g fill="#8B6FFF">
                <circle cx="30" cy="90" r="3"/><circle cx="75" cy="75" r="3"/><circle cx="120" cy="80" r="3"/><circle cx="165" cy="55" r="3"/>
                <circle cx="210" cy="65" r="3"/><circle cx="255" cy="40" r="3"/><circle cx="300" cy="45" r="3"/><circle cx="345" cy="25" r="3"/>
              </g>
              <g className="fill-muted-foreground text-[8px]">
                <text x="20" y="128" fill="currentColor">May 1</text><text x="75" y="128" fill="currentColor">May 6</text><text x="135" y="128" fill="currentColor">May 11</text>
                <text x="200" y="128" fill="currentColor">May 16</text><text x="260" y="128" fill="currentColor">May 22</text>
              </g>
            </svg>
          </div>
          {/* top dishes */}
          <div className="rounded-[14px] border border-border bg-secondary p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-bold text-foreground">Top Dishes</span>
              <span className="text-[11px] font-semibold text-primary">View all</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {[
                { rank: 1, name: 'Margherita Pizza', count: 342, bg: 'radial-gradient(circle, #F5A572, #C44E2A)' },
                { rank: 2, name: 'Truffle Pasta', count: 289, bg: 'radial-gradient(circle, #F4DB95, #C9A04E)' },
                { rank: 3, name: 'Grilled Salmon', count: 207, bg: 'radial-gradient(circle, #F08054, #C44E2A)' },
                { rank: 4, name: 'Cheeseburger', count: 187, bg: 'radial-gradient(circle, #D9A45E, #8B4513)' },
                { rank: 5, name: 'Caesar Salad', count: 156, bg: 'radial-gradient(circle, #88C97A, #3E8E41)' },
              ].map((d) => (
                <div key={d.name} className="grid grid-cols-[18px_22px_1fr_auto] items-center gap-2 text-[11px]">
                  <span className="font-semibold text-muted-foreground">{d.rank}</span>
                  <div className="h-[22px] w-[22px] rounded-md" style={{ background: d.bg }} />
                  <span className="font-medium text-foreground">{d.name}</span>
                  <span className="font-semibold text-muted-foreground">{d.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* row 2: donut + live orders */}
        <div className="grid grid-cols-[1.45fr_1fr] gap-3.5">
          {/* donut */}
          <div className="rounded-[14px] border border-border bg-secondary p-3.5">
            <div className="mb-2.5 text-xs font-bold text-foreground">Sales by Channel</div>
            <div className="grid grid-cols-[100px_1fr] items-center gap-2.5">
              <div className="relative">
                <svg viewBox="0 0 100 100" className="h-[100px] w-[100px]">
                  <circle r="40" cx="50" cy="50" fill="none" stroke="#6E56F8" strokeWidth="14" strokeDasharray="113 251" transform="rotate(-90 50 50)"/>
                  <circle r="40" cx="50" cy="50" fill="none" stroke="#A78BFA" strokeWidth="14" strokeDasharray="88 251" strokeDashoffset="-113" transform="rotate(-90 50 50)"/>
                  <circle r="40" cx="50" cy="50" fill="none" stroke="#34D399" strokeWidth="14" strokeDasharray="38 251" strokeDashoffset="-201" transform="rotate(-90 50 50)"/>
                  <circle r="40" cx="50" cy="50" fill="none" stroke="#FBBF24" strokeWidth="14" strokeDasharray="25 251" strokeDashoffset="-239" transform="rotate(-90 50 50)"/>
                </svg>
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                  <div className="text-[13px] font-bold text-foreground">€12,430</div>
                  <div className="text-[9px] text-muted-foreground">Total</div>
                </div>
              </div>
              <div className="flex flex-col gap-1 text-[10px]">
                {[
                  { color: '#6E56F8', label: 'Dine-in', pct: '45%' },
                  { color: '#A78BFA', label: 'QR Order', pct: '35%' },
                  { color: '#34D399', label: 'Takeaway', pct: '15%' },
                  { color: '#FBBF24', label: 'Delivery', pct: '5%' },
                ].map((item) => (
                  <div key={item.label} className="grid grid-cols-[10px_1fr_auto] items-center gap-1.5 text-muted-foreground">
                    <span className="h-2 w-2 rounded-sm" style={{ background: item.color }} />
                    <span>{item.label}</span>
                    <span className="font-semibold text-foreground">{item.pct}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* live orders */}
          <div className="rounded-[14px] border border-border bg-secondary p-3.5">
            <div className="mb-2.5 text-xs font-bold text-foreground">Live Orders</div>
            <table className="w-full border-collapse text-[10.5px]">
              <tbody>
                {[
                  { id: '#1254', table: 'Table 12', items: '2 items', price: '€24.90', status: 'Preparing', statusColor: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
                  { id: '#1255', table: 'Table 5', items: '3 items', price: '€33.60', status: 'Preparing', statusColor: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
                  { id: '#1256', table: 'Table 8', items: '1 item', price: '€18.20', status: 'Ready', statusColor: 'bg-emerald-500/15 text-emerald-600' },
                  { id: '#1257', table: 'Table 3', items: '4 items', price: '€52.00', status: 'Preparing', statusColor: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
                ].map((order) => (
                  <tr key={order.id}>
                    <td className="py-[5px] font-semibold text-foreground">{order.id}</td>
                    <td className="py-[5px] text-muted-foreground">{order.table}</td>
                    <td className="py-[5px] text-muted-foreground">{order.items}</td>
                    <td className="py-[5px] text-muted-foreground">{order.price}</td>
                    <td className="py-[5px]"><span className={`inline-block rounded-[5px] px-1.5 py-0.5 text-[9px] font-semibold ${order.statusColor}`}>{order.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-1.5 text-right text-[11px] font-semibold text-primary">View all orders</div>
          </div>
        </div>
      </div>
      {/* floating QR card */}
      <div className="absolute -bottom-10 -right-2 w-[150px] -rotate-3 rounded-[14px] p-3.5 text-white shadow-[0_20px_40px_-10px_rgba(110,86,248,.5)]" style={{ background: 'linear-gradient(160deg, #6E56F8 0%, #4A39B8 100%)' }}>
        <div className="mb-2.5 text-[11px] font-semibold leading-tight">Scan to view<br/>our menu</div>
        <div className="rounded-lg bg-white p-1.5">
          <svg viewBox="0 0 100 100" width="100%" height="100%">
            <rect x="0" y="0" width="100" height="100" fill="#fff"/>
            <g fill="#0E0B1A">
              <rect x="6" y="6" width="22" height="22"/><rect x="10" y="10" width="14" height="14" fill="#fff"/><rect x="13" y="13" width="8" height="8"/>
              <rect x="72" y="6" width="22" height="22"/><rect x="76" y="10" width="14" height="14" fill="#fff"/><rect x="79" y="13" width="8" height="8"/>
              <rect x="6" y="72" width="22" height="22"/><rect x="10" y="76" width="14" height="14" fill="#fff"/><rect x="13" y="79" width="8" height="8"/>
              <g>
                <rect x="34" y="6" width="4" height="4"/><rect x="42" y="6" width="4" height="4"/><rect x="50" y="6" width="4" height="4"/><rect x="58" y="6" width="4" height="4"/><rect x="64" y="6" width="4" height="4"/>
                <rect x="34" y="14" width="4" height="4"/><rect x="46" y="14" width="4" height="4"/><rect x="54" y="14" width="4" height="4"/><rect x="62" y="14" width="4" height="4"/>
                <rect x="38" y="22" width="4" height="4"/><rect x="50" y="22" width="4" height="4"/><rect x="58" y="22" width="4" height="4"/><rect x="66" y="22" width="4" height="4"/>
                <rect x="6" y="34" width="4" height="4"/><rect x="14" y="34" width="4" height="4"/><rect x="22" y="34" width="4" height="4"/><rect x="34" y="34" width="4" height="4"/><rect x="42" y="34" width="4" height="4"/><rect x="50" y="34" width="4" height="4"/><rect x="62" y="34" width="4" height="4"/><rect x="74" y="34" width="4" height="4"/><rect x="82" y="34" width="4" height="4"/><rect x="90" y="34" width="4" height="4"/>
                <rect x="10" y="42" width="4" height="4"/><rect x="18" y="42" width="4" height="4"/><rect x="30" y="42" width="4" height="4"/><rect x="38" y="42" width="4" height="4"/><rect x="46" y="42" width="4" height="4"/><rect x="54" y="42" width="4" height="4"/><rect x="62" y="42" width="4" height="4"/><rect x="70" y="42" width="4" height="4"/><rect x="78" y="42" width="4" height="4"/><rect x="86" y="42" width="4" height="4"/>
                <rect x="6" y="50" width="4" height="4"/><rect x="22" y="50" width="4" height="4"/><rect x="34" y="50" width="4" height="4"/><rect x="42" y="50" width="4" height="4"/><rect x="50" y="50" width="4" height="4"/><rect x="58" y="50" width="4" height="4"/><rect x="74" y="50" width="4" height="4"/><rect x="82" y="50" width="4" height="4"/><rect x="90" y="50" width="4" height="4"/>
                <rect x="14" y="58" width="4" height="4"/><rect x="26" y="58" width="4" height="4"/><rect x="38" y="58" width="4" height="4"/><rect x="46" y="58" width="4" height="4"/><rect x="58" y="58" width="4" height="4"/><rect x="66" y="58" width="4" height="4"/><rect x="78" y="58" width="4" height="4"/><rect x="86" y="58" width="4" height="4"/>
                <rect x="34" y="74" width="4" height="4"/><rect x="42" y="74" width="4" height="4"/><rect x="50" y="74" width="4" height="4"/><rect x="58" y="74" width="4" height="4"/><rect x="66" y="74" width="4" height="4"/>
                <rect x="38" y="82" width="4" height="4"/><rect x="46" y="82" width="4" height="4"/><rect x="54" y="82" width="4" height="4"/><rect x="62" y="82" width="4" height="4"/><rect x="74" y="82" width="4" height="4"/><rect x="86" y="82" width="4" height="4"/>
                <rect x="34" y="90" width="4" height="4"/><rect x="50" y="90" width="4" height="4"/><rect x="58" y="90" width="4" height="4"/><rect x="66" y="90" width="4" height="4"/><rect x="78" y="90" width="4" height="4"/><rect x="90" y="90" width="4" height="4"/>
              </g>
            </g>
          </svg>
        </div>
        <div className="mt-2 text-xs font-bold">Table 12</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════════════════ */

const HomePage = () => {
  const { t } = useTranslation();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const plans: Plan[] = [
    {
      key: 'FREE',
      name: 'Free',
      price: 'EUR 0',
      period: 'forever',
      description: 'Start with a clean digital menu, QR codes, OCR import, and XLSX export — completely free.',
      cta: 'Start free',
      href: '/register',
      accent: 'border-slate-300/60',
      bullets: [
        'Digital menu editor',
        'QR code management',
        'OCR & XLSX menu import',
        'Menu export (JSON/CSV/XLSX)',
        '1 staff member',
      ],
    },
    {
      key: 'STARTER',
      name: 'Starter',
      price: 'EUR 15',
      period: 'per month',
      description: 'Add online ordering and basic analytics for a small restaurant team.',
      cta: 'Choose Starter',
      href: '/register',
      accent: 'border-blue-500/35',
      bullets: [
        'Everything in Free',
        'Online ordering',
        'Basic analytics & summary',
        'Order status workflow',
        '1 staff member',
      ],
    },
    {
      key: 'PROFESSIONAL',
      name: 'Professional',
      price: 'EUR 25',
      period: 'per month',
      description: 'The strongest package for restaurants ready to grow revenue and customer retention.',
      badge: 'Most popular',
      highlight: true,
      cta: 'Choose Professional',
      href: '/register',
      accent: 'border-primary',
      bullets: [
        'Stripe pay-at-table',
        'Full analytics & XLSX export',
        'Loyalty & VIP tiers',
        'Multi-language menus (DeepL)',
        'Custom branding & themes',
        'Customer accounts',
        'Smart upselling & pairings',
        'Call waiter & feedback',
        'Up to 5 staff members',
      ],
    },
    {
      key: 'ENTERPRISE',
      name: 'Enterprise',
      price: 'EUR 45',
      period: 'per month',
      description: 'Advanced operations for multi-location brands, large teams, and full kitchen workflows.',
      cta: 'Choose Enterprise',
      href: '/register',
      accent: 'border-emerald-500/35',
      bullets: [
        'Everything in Professional',
        'POS & kitchen display (KDS)',
        'Table zones & sections',
        'Staff attribution & itemized bills',
        'Multi-location support',
        'Thermal printer support',
        'Advanced roles (RBAC)',
        'Super-admin ops panel',
        'Priority support',
        'Unlimited staff',
      ],
    },
  ];

  return (
    <div className="relative left-1/2 min-h-screen w-screen -translate-x-1/2 overflow-x-clip bg-background text-foreground">

      {/* ══════════════════ 1. ANNOUNCEMENT BAR ══════════════════ */}
      <section className="border-b border-border bg-foreground text-background">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-3 text-center sm:flex-row sm:px-6 lg:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-background/75">
            Built for restaurants that want the menu, orders, payments, and service flow in one place.
          </p>
          <Link
            to="/register"
            className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-background px-4 py-2 text-xs font-black uppercase tracking-wider text-foreground transition hover:opacity-90"
          >
            Launch your QR menu
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      {/* ══════════════════ 2. HERO — 3-column CC-DESIGN layout ══════════════════ */}
      <section className="relative overflow-hidden border-b border-border bg-background dark:bg-[radial-gradient(ellipse_1100px_600px_at_75%_30%,rgba(110,86,248,0.18),transparent_70%),radial-gradient(ellipse_800px_500px_at_20%_80%,rgba(110,86,248,0.12),transparent_70%),var(--color-background)]">
        {/* dot grid */}
        <div className="absolute inset-0 -z-0 bg-[radial-gradient(rgba(110,86,248,0.12)_1px,transparent_1px)] bg-[size:24px_24px]" aria-hidden="true" />
        <div className="relative z-10 mx-auto max-w-[1480px] px-5 py-14 sm:px-10 md:px-[60px] md:pb-20 md:pt-14">
          {/* 3-column grid — stacks on mobile */}
          <div className="grid items-start gap-8 xl:grid-cols-[minmax(420px,1fr)_360px_minmax(540px,1fr)]">
            {/* LEFT: copy */}
            <div className="flex flex-col items-start">
              {/* pill */}
              <span className="mb-7 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-[13px] font-medium text-foreground shadow-sm">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M2 12l10-9 10 9-2 2-8-7-8 7z"/><path d="M5 12v9h14v-9"/></svg>
                Built for restaurants. Loved by customers.
              </span>
              {/* title */}
              <h1 className="mb-6 text-[clamp(40px,5vw,60px)] font-extrabold leading-[1.05] tracking-[-0.035em] text-foreground">
                <span className="text-primary">Mobile-first</span><br/>
                digital menus for<br/>
                modern restaurants
              </h1>
              {/* subtitle */}
              <p className="mb-7 max-w-[480px] text-lg leading-[1.55] text-muted-foreground">
                QR MENU helps restaurants streamline operations, boost sales, and deliver exceptional experiences — all from a scan.
              </p>
              {/* feature pills grid */}
              <div className="mb-8 grid max-w-[540px] grid-cols-4 gap-2.5">
                {[
                  { icon: <Smartphone className="h-[18px] w-[18px]" />, line1: 'No app', line2: 'download' },
                  { icon: <QrCode className="h-[18px] w-[18px]" />, line1: 'Works from', line2: 'QR scan' },
                  { icon: <Zap className="h-[18px] w-[18px]" />, line1: 'Real-time', line2: 'updates' },
                  { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>, line1: 'Light / Dark', line2: 'mode' },
                ].map((fp) => (
                  <div key={fp.line1} className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-3 text-[12.5px] font-medium leading-tight text-foreground">
                    <span className="shrink-0 text-muted-foreground">{fp.icon}</span>
                    <span>{fp.line1}<br/>{fp.line2}</span>
                  </div>
                ))}
              </div>
              {/* CTAs */}
              <div className="mb-[18px] flex gap-3">
                <Button asChild size="lg" className="h-[52px] cursor-pointer rounded-[14px] px-[26px] text-base">
                  <Link to="/register">
                    Start Free Trial
                    <ArrowRight className="ml-2 h-[18px] w-[18px]" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-[52px] cursor-pointer rounded-[14px] px-[26px] text-base">
                  <Link to="/pricing">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="mr-2"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/><polygon points="10,8 16,12 10,16" fill="currentColor"/></svg>
                    Watch Demo
                  </Link>
                </Button>
              </div>
              {/* trust line */}
              <div className="flex flex-wrap gap-6 text-[13px] text-muted-foreground">
                {['No credit card required', 'Setup in minutes', 'Cancel anytime'].map((t) => (
                  <span key={t} className="inline-flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-primary" />
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* CENTER: phone */}
            <div className="hidden xl:block">
              <PhoneMockup />
            </div>

            {/* RIGHT: dashboard */}
            <div className="hidden xl:block">
              <DashboardPreview />
            </div>
          </div>

          {/* mobile: show phone only below hero copy */}
          <div className="mt-10 flex justify-center xl:hidden">
            <PhoneMockup />
          </div>
        </div>
      </section>

      {/* ══════════════════ 3. TRUST BAR ══════════════════ */}
      <section className="bg-card py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs font-black uppercase tracking-[0.24em] text-muted-foreground">
            Trusted by modern restaurants, cafes, bars, hotels, and food halls
          </p>
          <div className="mt-7 grid grid-cols-2 gap-4 text-center text-sm font-black uppercase tracking-[0.12em] text-muted-foreground/55 sm:grid-cols-4 lg:grid-cols-8">
            {['Urban Grill', 'Pasta House', 'Tokyo Sushi', 'Cafe Deluxe', 'Burger District', 'Ocean Breeze', 'Bistro Central', 'Spice Route'].map((name) => (
              <span key={name} className="transition-colors duration-200 hover:text-muted-foreground">{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════ 4. MAIN ADVANTAGES ══════════════════ */}
      <section className="border-y border-border bg-secondary/40 py-20 md:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-primary">Main advantages</p>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-foreground md:text-5xl">
              A better guest experience with fewer moving parts.
            </h2>
            <p className="mt-5 text-base leading-8 text-muted-foreground">
              QR Menu replaces scattered tools with one operational layer: guests get a fast self-serve experience while staff get live context and clean workflows.
            </p>
            <div className="mt-8">
              <Button asChild size="lg" className="h-12 cursor-pointer rounded-2xl px-6">
                <Link to="/register">
                  Get started free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {advantageItems.map(({ icon: Icon, label, text }) => (
              <article key={label} className="group cursor-pointer rounded-2xl border border-border bg-card p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl">
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-black text-foreground">{label}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════ 5. FULL FEATURE SUITE (16 features) ══════════════════ */}
      <section id="features" className="bg-background py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-primary">Feature suite</p>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-foreground md:text-5xl">
              Every feature a serious restaurant SaaS should have.
            </h2>
            <p className="mt-5 text-base leading-8 text-muted-foreground">
              From the first QR scan to repeat visits — the platform covers menus, ordering, payments, kitchen ops, loyalty, analytics, staff management, and more.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featureCards.map(({ icon: Icon, title, text, toneBg }) => (
              <article
                key={title}
                className="group cursor-pointer rounded-2xl border border-border bg-card p-6 transition duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl"
              >
                <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-transparent ${toneBg}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-black text-foreground">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════ 6. OPERATIONS COMMAND CENTER ══════════════════ */}
      <section className="bg-[#101019] py-20 text-white md:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:px-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-300">Operations command center</p>
            <h2 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
              One dashboard for menu health, orders, payments, loyalty, and staff.
            </h2>
            <p className="mt-5 text-base leading-8 text-white/68">
              Managers see what is selling, what needs attention, how tables are moving, and where revenue is coming from — without switching systems.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {[
                'Live table status with zones',
                'Order and payment history',
                'Top dishes and demand trends',
                'Customer retention signals',
                'Kitchen queue health',
                'Staff attribution tracking',
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm font-bold text-white/82">
                  <Check className="h-4 w-4 shrink-0 text-emerald-300" />
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ['Live orders', '38', '12 preparing'],
                ['Tables active', '21', '6 need service'],
                ['Payments', 'EUR 2.8k', 'today'],
              ].map(([label, value, meta]) => (
                <div key={label} className="rounded-2xl bg-white/[0.06] p-5">
                  <p className="text-xs font-bold text-white/45">{label}</p>
                  <p className="mt-2 text-3xl font-black">{value}</p>
                  <p className="mt-1 text-xs font-bold text-violet-200">{meta}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl bg-white/[0.06] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-black">Kitchen queue</p>
                <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-black text-emerald-200">Healthy</span>
              </div>
              <div className="mt-5 space-y-3">
                {[
                  ['#1254', 'Table 12', '4 items', 'Preparing'],
                  ['#1255', 'Table 5', '2 items', 'Ready'],
                  ['#1256', 'Takeaway', '6 items', 'New'],
                ].map(([id, table, items, status]) => (
                  <div key={id} className="grid grid-cols-[64px_1fr_auto_auto] items-center gap-3 rounded-xl border border-white/10 bg-black/15 px-4 py-3 text-xs">
                    <span className="font-black">{id}</span>
                    <span className="text-white/70">{table}</span>
                    <span className="text-white/55">{items}</span>
                    <span className="rounded-lg bg-white/10 px-2 py-1 font-black">{status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════ 7. PRICING ══════════════════ */}
      <section id="pricing" className="bg-background py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-primary">All 4 tiers</p>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-foreground md:text-5xl">
              Start free, then grow into the tools your restaurant actually needs.
            </h2>
            <p className="mt-5 text-base leading-8 text-muted-foreground">
              Clear plans for simple menus, ordering, revenue growth, and full restaurant operations. Save 15% with annual billing.
            </p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => (
              <article
                key={plan.key}
                className={`relative flex min-h-[440px] cursor-pointer flex-col rounded-2xl border bg-card p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl ${plan.accent} ${plan.highlight ? 'ring-2 ring-primary/20' : ''}`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white">
                    {plan.badge}
                  </div>
                )}
                <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">{plan.key}</p>
                <h3 className="mt-4 text-2xl font-black text-foreground">{plan.name}</h3>
                <p className="mt-3 min-h-[56px] text-sm leading-6 text-muted-foreground">{plan.description}</p>
                <div className="mt-5">
                  <span className="text-4xl font-black tracking-tight text-foreground">{plan.price}</span>
                  <span className="ml-2 text-xs font-bold text-muted-foreground">{plan.period}</span>
                </div>
                <ul className="mt-6 flex-1 space-y-3">
                  {plan.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2.5 text-sm font-medium text-muted-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {bullet}
                    </li>
                  ))}
                </ul>
                <Button asChild variant={plan.highlight ? 'default' : 'outline'} className="mt-7 w-full cursor-pointer">
                  <Link to={plan.href}>{plan.cta}</Link>
                </Button>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════ 8. PLAN COMPARISON TABLE ══════════════════ */}
      <section className="border-y border-border bg-secondary/40 py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-primary">Plan comparison</p>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-foreground md:text-5xl">
              Compare what each tier unlocks.
            </h2>
          </div>
          <div className="mt-10 overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
            <table className="w-full min-w-[820px]">
              <thead>
                <tr className="border-b border-border bg-secondary/70">
                  <th className="w-[34%] px-5 py-4 text-left text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">Feature</th>
                  {plans.map((plan) => (
                    <th key={plan.key} className="px-4 py-4 text-center text-xs font-black uppercase tracking-[0.16em] text-foreground">
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, index) => (
                  <tr key={row.label} className={`border-b border-border/70 ${index % 2 ? 'bg-secondary/20' : 'bg-card'}`}>
                    <td className="px-5 py-4 text-sm font-bold text-foreground">{row.label}</td>
                    <td className="px-4 py-4 text-center"><FeatureValue value={row.free} /></td>
                    <td className="px-4 py-4 text-center"><FeatureValue value={row.starter} /></td>
                    <td className="px-4 py-4 text-center"><FeatureValue value={row.professional} /></td>
                    <td className="px-4 py-4 text-center"><FeatureValue value={row.enterprise} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ══════════════════ 9. FAQ ══════════════════ */}
      <section className="bg-background py-20 md:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-primary">FAQ</p>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-foreground md:text-5xl">
              Questions before launch?
            </h2>
            <p className="mt-5 text-base leading-8 text-muted-foreground">
              Here are the answers most restaurants need before replacing printed menus or adding digital ordering.
            </p>
          </div>
          <div className="space-y-3">
            {faqItems.map((item, idx) => (
              <div
                key={item.question}
                className="rounded-2xl border border-border bg-card shadow-sm transition-all duration-300"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="flex w-full cursor-pointer items-center justify-between gap-4 p-5 text-left text-base font-black text-foreground"
                >
                  {item.question}
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-primary transition-transform duration-300 ${openFaq === idx ? 'rotate-45' : ''}`}
                  >
                    <Plus className="h-4 w-4" />
                  </span>
                </button>
                <div
                  className={`grid transition-all duration-300 ${openFaq === idx ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                >
                  <div className="overflow-hidden">
                    <p className="px-5 pb-5 text-sm leading-7 text-muted-foreground">{item.answer}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════ 10. FINAL CTA ══════════════════ */}
      <section className="relative overflow-hidden bg-foreground px-4 py-16 text-background sm:px-6 md:py-24 lg:px-8">
        <div className="absolute inset-0 -z-0" aria-hidden="true">
          <div className="absolute left-1/4 top-1/2 h-[400px] w-[600px] -translate-y-1/2 rounded-full bg-primary/20 blur-[120px]" />
          <div className="absolute right-1/4 top-1/3 h-[300px] w-[400px] rounded-full bg-violet-500/15 blur-[100px]" />
        </div>
        <div className="relative z-10 mx-auto max-w-5xl text-center">
          <div className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-background text-foreground">
            <QrCode className="h-7 w-7" />
          </div>
          <h2 className="text-4xl font-black tracking-tight md:text-6xl">
            Make the first scan feel like your best service moment.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-background/68">
            Launch a stunning QR menu today, then grow into ordering, payments, loyalty, POS, kitchen display, and multi-location operations when the restaurant is ready.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              to="/register"
              className="inline-flex h-14 cursor-pointer items-center justify-center rounded-2xl bg-background px-8 text-sm font-black uppercase tracking-wider text-foreground transition hover:opacity-90"
            >
              Start Free Trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link
              to="/pricing"
              className="inline-flex h-14 cursor-pointer items-center justify-center rounded-2xl border border-background/20 px-8 text-sm font-black uppercase tracking-wider text-background transition hover:bg-background/10"
            >
              View Pricing
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════════════ 11. FOOTER ══════════════════ */}
      <footer className="border-t border-border bg-background py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-white">
                  <QrCode className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-foreground">QR Menu</p>
                </div>
              </div>
              <p className="mt-4 max-w-xs text-sm leading-6 text-muted-foreground">
                The all-in-one digital restaurant platform. Menus, ordering, payments, loyalty, analytics, staff tools, POS, and kitchen display — all from a QR scan.
              </p>
            </div>
            <div>
              <h5 className="mb-4 text-xs font-black uppercase tracking-[0.18em] text-foreground">Product</h5>
              <div className="space-y-3">
                {['Features', 'Pricing', 'Integrations', 'Changelog', 'Help Center'].map((item) => (
                  <Link key={item} to="#" className="block text-sm text-muted-foreground transition-colors hover:text-primary">{item}</Link>
                ))}
              </div>
            </div>
            <div>
              <h5 className="mb-4 text-xs font-black uppercase tracking-[0.18em] text-foreground">Company</h5>
              <div className="space-y-3">
                {['About', 'Blog', 'Careers', 'Contact', 'Security'].map((item) => (
                  <Link key={item} to="#" className="block text-sm text-muted-foreground transition-colors hover:text-primary">{item}</Link>
                ))}
              </div>
            </div>
            <div>
              <h5 className="mb-4 text-xs font-black uppercase tracking-[0.18em] text-foreground">Legal</h5>
              <div className="space-y-3">
                <Link to="/privacy" className="block text-sm text-muted-foreground transition-colors hover:text-primary">Privacy Policy</Link>
                <Link to="/terms" className="block text-sm text-muted-foreground transition-colors hover:text-primary">Terms of Service</Link>
                <Link to="/cookies" className="block text-sm text-muted-foreground transition-colors hover:text-primary">Cookie Policy</Link>
                <Link to="#" className="block text-sm text-muted-foreground transition-colors hover:text-primary">GDPR</Link>
              </div>
            </div>
          </div>
          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-8 md:flex-row">
            <span className="text-xs text-muted-foreground">© {new Date().getFullYear()} QR Menu. All rights reserved.</span>
            <span className="text-xs text-muted-foreground">Made for restaurants, with care.</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
