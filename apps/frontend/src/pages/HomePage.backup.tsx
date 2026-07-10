import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart2,
  Check,
  ChefHat,
  Clock,
  CreditCard,
  Gift,
  Globe,
  MessageSquare,
  Palette,
  QrCode,
  Shield,
  ShoppingCart,
  Smartphone,
  Star,
  Users,
  Zap,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/button";

type TierKey = "FREE" | "STARTER" | "PROFESSIONAL" | "ENTERPRISE";

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
    title: "QR menus that feel premium",
    text: "Guests scan, browse, filter, and order from a polished menu that works beautifully on every phone.",
    tone: "bg-violet-500/12 text-violet-500 border-violet-500/20",
  },
  {
    icon: ShoppingCart,
    title: "Table ordering and checkout",
    text: "Turn menu views into orders with table context, carts, Stripe checkout, and live kitchen-ready tickets.",
    tone: "bg-blue-500/12 text-blue-500 border-blue-500/20",
  },
  {
    icon: ChefHat,
    title: "Kitchen and staff flow",
    text: "Keep service moving with POS views, kitchen display, order status, table zones, and waiter tools.",
    tone: "bg-orange-500/12 text-orange-500 border-orange-500/20",
  },
  {
    icon: BarChart2,
    title: "Analytics that guide action",
    text: "See best sellers, revenue trends, order volume, customer behavior, and menu performance in one place.",
    tone: "bg-cyan-500/12 text-cyan-500 border-cyan-500/20",
  },
  {
    icon: Gift,
    title: "Loyalty and customer accounts",
    text: "Reward repeat guests, grow retention, and give customers a simple profile for points and order history.",
    tone: "bg-amber-500/12 text-amber-500 border-amber-500/20",
  },
  {
    icon: Globe,
    title: "Multi-language menus",
    text: "Serve locals and tourists with translated menus, language switching, and clear guest-facing content.",
    tone: "bg-emerald-500/12 text-emerald-500 border-emerald-500/20",
  },
  {
    icon: Palette,
    title: "Custom branding",
    text: "Match the restaurant identity with colors, dark mode, branded public menus, banners, and polished layouts.",
    tone: "bg-pink-500/12 text-pink-500 border-pink-500/20",
  },
  {
    icon: Shield,
    title: "Roles, security, and control",
    text: "Manage staff access, device enrollment, tenant controls, legal pages, and operational permissions.",
    tone: "bg-indigo-500/12 text-indigo-500 border-indigo-500/20",
  },
] as const;

const advantageItems = [
  {
    icon: Clock,
    label: "Launch a menu in minutes",
    text: "Import items, organize categories, print QR codes, and keep everything editable.",
  },
  {
    icon: CreditCard,
    label: "Reduce ordering friction",
    text: "Guests order and pay from the table without waiting for the next service touch.",
  },
  {
    icon: MessageSquare,
    label: "Know what guests need",
    text: "Collect feedback, call-waiter requests, and customer signals before they become problems.",
  },
  {
    icon: Zap,
    label: "Move faster every shift",
    text: "Live orders, smart dashboards, and role-based tools keep teams aligned.",
  },
] as const;

const comparisonRows: FeatureRow[] = [
  {
    label: "Digital menu builder",
    free: true,
    starter: true,
    professional: true,
    enterprise: true,
  },
  {
    label: "QR code management",
    free: true,
    starter: true,
    professional: true,
    enterprise: true,
  },
  {
    label: "OCR menu import",
    free: true,
    starter: true,
    professional: true,
    enterprise: true,
  },
  {
    label: "Online ordering",
    free: false,
    starter: true,
    professional: true,
    enterprise: true,
  },
  {
    label: "Stripe pay-at-table",
    free: false,
    starter: false,
    professional: true,
    enterprise: true,
  },
  {
    label: "Call waiter button",
    free: false,
    starter: false,
    professional: true,
    enterprise: true,
  },
  {
    label: "Multi-language menu",
    free: false,
    starter: false,
    professional: true,
    enterprise: true,
  },
  {
    label: "Custom branding",
    free: false,
    starter: false,
    professional: true,
    enterprise: true,
  },
  {
    label: "Loyalty program",
    free: false,
    starter: false,
    professional: true,
    enterprise: true,
  },
  {
    label: "Customer accounts",
    free: false,
    starter: false,
    professional: true,
    enterprise: true,
  },
  {
    label: "POS and kitchen display",
    free: false,
    starter: false,
    professional: false,
    enterprise: true,
  },
  {
    label: "Staff seats",
    free: "1",
    starter: "1",
    professional: "5",
    enterprise: "Unlimited",
  },
  {
    label: "Multi-location support",
    free: false,
    starter: false,
    professional: false,
    enterprise: true,
  },
  {
    label: "Priority support",
    free: false,
    starter: false,
    professional: false,
    enterprise: true,
  },
];

const faqItems = [
  {
    question: "Can I use QR Menu without taking online payments?",
    answer:
      "Yes. You can start with the digital menu and QR code workflow, then add ordering, payments, loyalty, POS, or kitchen tools when the restaurant is ready.",
  },
  {
    question: "Do guests need to download an app?",
    answer:
      "No. Guests open the menu from a QR scan in their browser, so the experience is fast and familiar on iPhone and Android.",
  },
  {
    question: "Which plan is best for a growing restaurant?",
    answer:
      "Professional is the best fit for most restaurants because it includes payments, analytics, loyalty, multi-language menus, and staff access.",
  },
  {
    question: "Can I upgrade later?",
    answer:
      "Yes. The tiers are built to let a restaurant start small and unlock more operational tools as the team adopts the platform.",
  },
  {
    question: "Does the platform support staff and kitchen workflows?",
    answer:
      "Yes. Enterprise includes POS, kitchen display, multi-location support, advanced staff control, and priority service features.",
  },
];

function FeatureValue({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
    return <span className="text-xs font-bold text-foreground">{value}</span>;
  }

  return value ? (
    <span className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
      <Check className="h-3.5 w-3.5" />
    </span>
  ) : (
    <span className="text-muted-foreground/40">-</span>
  );
}

function ProductShowcase() {
  return (
    <div className="relative mx-auto grid w-full max-w-5xl gap-5 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
      <div className="relative mx-auto w-full max-w-[310px] rounded-[2.5rem] border-[10px] border-[#181624] bg-[#181624] p-3 shadow-[0_34px_80px_-42px_rgba(20,14,50,0.75)]">
        <div className="mx-auto mb-3 h-5 w-24 rounded-b-2xl bg-black" />
        <div className="overflow-hidden rounded-[1.8rem] bg-white text-[#16131f]">
          <div className="bg-[#f7f6fb] px-4 pb-4 pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-[#6f6984]">
                  Table 12
                </p>
                <h3 className="text-base font-black">The Good Food Co.</h3>
              </div>
              <div className="grid h-10 w-10 place-items-center rounded-full bg-[#6E56F8] text-white">
                <ShoppingCart className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-4 rounded-2xl bg-[#191529] p-4 text-white">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">
                Happy hour
              </p>
              <p className="mt-1 text-lg font-black">
                20% off signature drinks
              </p>
              <p className="mt-2 text-[11px] text-white/65">
                Today, 16:00 - 18:00
              </p>
            </div>
          </div>
          <div className="space-y-3 px-4 py-4">
            {[
              [
                "Truffle pasta",
                "Fresh parmesan, herbs",
                "EUR 15.90",
                "bg-amber-200",
              ],
              [
                "Grilled salmon",
                "Seasonal vegetables",
                "EUR 18.90",
                "bg-orange-200",
              ],
              [
                "Garden spritz",
                "Citrus, mint, tonic",
                "EUR 7.50",
                "bg-emerald-200",
              ],
            ].map(([name, desc, price, color]) => (
              <div
                key={name}
                className="grid grid-cols-[48px_1fr_auto] items-center gap-3"
              >
                <div className={`h-12 w-12 rounded-2xl ${color}`} />
                <div className="min-w-0">
                  <p className="truncate text-xs font-black">{name}</p>
                  <p className="truncate text-[10px] text-[#7a748b]">{desc}</p>
                </div>
                <p className="text-[11px] font-black text-[#6E56F8]">{price}</p>
              </div>
            ))}
          </div>
          <div className="mx-4 mb-4 flex items-center justify-between rounded-2xl bg-[#6E56F8] px-4 py-3 text-xs font-black text-white">
            <span>View cart</span>
            <span>EUR 42.30</span>
          </div>
        </div>
      </div>

      <div className="relative rounded-[1.75rem] border border-border bg-card p-4 shadow-[0_34px_80px_-46px_rgba(20,14,50,0.55)] md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">
              Live dashboard
            </p>
            <h3 className="mt-1 text-2xl font-black tracking-tight text-foreground">
              Today at a glance
            </h3>
          </div>
          <div className="rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-bold text-muted-foreground">
            May 24
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {[
            ["Revenue", "EUR 12.4k", "+18%"],
            ["Orders", "1,246", "+12%"],
            ["Avg order", "EUR 18.25", "+8%"],
            ["Guests", "324", "+9%"],
          ].map(([label, value, trend]) => (
            <div
              key={label}
              className="rounded-2xl border border-border bg-secondary/70 p-3"
            >
              <p className="text-[10px] font-semibold text-muted-foreground">
                {label}
              </p>
              <p className="mt-1 text-lg font-black text-foreground">{value}</p>
              <p className="text-[10px] font-bold text-emerald-500">{trend}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-2xl border border-border bg-background p-4">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-black text-foreground">
                Orders overview
              </p>
              <div className="flex rounded-lg bg-secondary p-1 text-[10px] font-bold text-muted-foreground">
                <span className="rounded-md bg-card px-2 py-1 text-foreground">
                  Week
                </span>
                <span className="px-2 py-1">Month</span>
              </div>
            </div>
            <div className="flex h-36 items-end gap-2">
              {[34, 52, 46, 75, 62, 91, 84, 98, 72, 88].map((height, index) => (
                <div key={index} className="flex-1 rounded-t-lg bg-primary/20">
                  <div
                    className="w-full rounded-t-lg bg-primary"
                    style={{ height: `${height}%` }}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="text-sm font-black text-foreground">Top dishes</p>
            <div className="mt-4 space-y-3">
              {[
                ["01", "Margherita", "342"],
                ["02", "Pasta", "289"],
                ["03", "Salmon", "207"],
                ["04", "Burger", "187"],
              ].map(([rank, name, count]) => (
                <div
                  key={name}
                  className="grid grid-cols-[28px_1fr_auto] items-center gap-2 text-xs"
                >
                  <span className="font-black text-muted-foreground">
                    {rank}
                  </span>
                  <span className="font-bold text-foreground">{name}</span>
                  <span className="font-black text-primary">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const HomePage = () => {
  const { t } = useTranslation();

  const plans: Plan[] = [
    {
      key: "FREE",
      name: "Free",
      price: "EUR 0",
      period: "forever",
      description:
        "Start with a clean digital menu, QR codes, and menu import tools.",
      cta: "Start free",
      href: "/register",
      accent: "border-slate-300/60",
      bullets: [
        "Digital menu editor",
        "QR code management",
        "OCR menu import",
        "1 staff member",
      ],
    },
    {
      key: "STARTER",
      name: "Starter",
      price: "EUR 15",
      period: "per month",
      description:
        "Add ordering and simple reporting for a small restaurant team.",
      cta: "Choose Starter",
      href: "/register",
      accent: "border-blue-500/35",
      bullets: [
        "Everything in Free",
        "Online ordering",
        "Basic analytics",
        "Order status basics",
      ],
    },
    {
      key: "PROFESSIONAL",
      name: "Professional",
      price: "EUR 25",
      period: "per month",
      description:
        "The strongest package for restaurants ready to grow revenue.",
      badge: "Most popular",
      highlight: true,
      cta: "Choose Professional",
      href: "/register",
      accent: "border-primary",
      bullets: [
        "Stripe pay-at-table",
        "Full analytics",
        "Loyalty and customer accounts",
        "Multi-language and branding",
        "Up to 5 staff",
      ],
    },
    {
      key: "ENTERPRISE",
      name: "Enterprise",
      price: "EUR 45",
      period: "per month",
      description:
        "Advanced operations for teams, kitchens, and multi-location brands.",
      cta: "Choose Enterprise",
      href: "/register",
      accent: "border-emerald-500/35",
      bullets: [
        "POS and kitchen display",
        "Multi-location support",
        "Thermal printers",
        "Advanced roles",
        "Priority support",
      ],
    },
  ];

  return (
    <div className="relative left-1/2 min-h-screen w-screen -translate-x-1/2 overflow-x-clip bg-background text-foreground">
      <section className="border-b border-border bg-foreground text-background">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-3 text-center sm:flex-row sm:px-6 lg:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-background/75">
            Built for restaurants that want the menu, orders, payments, and
            service flow in one place.
          </p>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 rounded-full bg-background px-4 py-2 text-xs font-black uppercase tracking-wider text-foreground transition hover:opacity-90"
          >
            Launch your QR menu
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      <section className="relative overflow-hidden border-b border-border bg-background">
        <div
          className="absolute inset-0 -z-0 bg-[linear-gradient(rgba(110,86,248,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(14,11,26,0.05)_1px,transparent_1px)] bg-[size:32px_32px]"
          aria-hidden="true"
        />
        <div className="relative z-10 mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-24 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-primary">
              <Star className="h-3.5 w-3.5 fill-current" />
              {t(
                "landing.heroBadge",
                "Built for restaurants. Loved by customers.",
              )}
            </div>
            <h1 className="text-5xl font-black leading-[0.95] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
              QR Menu
              <span className="block brand-gradient-text">
                restaurant SaaS that sells, serves, and scales.
              </span>
            </h1>
            <p className="mx-auto mt-7 max-w-2xl text-base font-medium leading-8 text-muted-foreground sm:text-lg">
              A complete digital restaurant platform for QR menus, ordering,
              payments, loyalty, analytics, staff workflows, POS, and kitchen
              display.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-14 rounded-2xl px-8">
                <Link to="/register">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-14 rounded-2xl px-8"
              >
                <Link to="/pricing">Compare Plans</Link>
              </Button>
            </div>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-bold text-muted-foreground">
              {["No app download", "Setup in minutes", "Cancel anytime"].map(
                (item) => (
                  <span key={item} className="inline-flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-primary" />
                    {item}
                  </span>
                ),
              )}
            </div>
          </div>

          <div className="mt-14">
            <ProductShowcase />
          </div>
        </div>
      </section>

      <section className="bg-card py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs font-black uppercase tracking-[0.24em] text-muted-foreground">
            Trusted by modern restaurants, cafes, bars, hotels, and food halls
          </p>
          <div className="mt-7 grid grid-cols-2 gap-4 text-center text-sm font-black uppercase tracking-[0.12em] text-muted-foreground/55 sm:grid-cols-3 lg:grid-cols-6">
            {[
              "Urban Grill",
              "Pasta House",
              "Tokyo Sushi",
              "Cafe Deluxe",
              "Burger District",
              "Ocean Breeze",
            ].map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-secondary/40 py-20 md:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-primary">
              Main advantages
            </p>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-foreground md:text-5xl">
              A better guest experience with fewer moving parts for your team.
            </h2>
            <p className="mt-5 text-base leading-8 text-muted-foreground">
              QR Menu replaces scattered tools with one operational layer:
              guests get a fast self-serve experience while staff get live
              context and clean workflows.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {advantageItems.map(({ icon: Icon, label, text }) => (
              <article
                key={label}
                className="rounded-2xl border border-border bg-card p-6 shadow-sm"
              >
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-black text-foreground">{label}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {text}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="bg-background py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-primary">
              Feature suite
            </p>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-foreground md:text-5xl">
              Every feature a serious restaurant SaaS should have.
            </h2>
            <p className="mt-5 text-base leading-8 text-muted-foreground">
              From the first QR scan to repeat visits, the platform covers the
              full customer and staff journey.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featureCards.map(({ icon: Icon, title, text, tone }) => (
              <article
                key={title}
                className="group rounded-2xl border border-border bg-card p-6 transition duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl"
              >
                <div
                  className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl border ${tone}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-black text-foreground">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {text}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#101019] py-20 text-white md:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:px-8 lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-300">
              Operations command center
            </p>
            <h2 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
              One dashboard for menu health, orders, payments, loyalty, and
              staff.
            </h2>
            <p className="mt-5 text-base leading-8 text-white/68">
              Managers can see what is selling, what needs attention, how tables
              are moving, and where revenue is coming from without switching
              systems.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {[
                "Live table status",
                "Order and payment history",
                "Top dishes and demand",
                "Customer retention signals",
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm font-bold text-white/82"
                >
                  <Check className="h-4 w-4 text-emerald-300" />
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ["Live orders", "38", "12 preparing"],
                ["Tables active", "21", "6 need service"],
                ["Payments", "EUR 2.8k", "today"],
              ].map(([label, value, meta]) => (
                <div key={label} className="rounded-2xl bg-white/[0.06] p-5">
                  <p className="text-xs font-bold text-white/45">{label}</p>
                  <p className="mt-2 text-3xl font-black">{value}</p>
                  <p className="mt-1 text-xs font-bold text-violet-200">
                    {meta}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl bg-white/[0.06] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-black">Kitchen queue</p>
                <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-black text-emerald-200">
                  Healthy
                </span>
              </div>
              <div className="mt-5 space-y-3">
                {[
                  ["#1254", "Table 12", "4 items", "Preparing"],
                  ["#1255", "Table 5", "2 items", "Ready"],
                  ["#1256", "Takeaway", "6 items", "New"],
                ].map(([id, table, items, status]) => (
                  <div
                    key={id}
                    className="grid grid-cols-[64px_1fr_auto_auto] items-center gap-3 rounded-xl border border-white/10 bg-black/15 px-4 py-3 text-xs"
                  >
                    <span className="font-black">{id}</span>
                    <span className="text-white/70">{table}</span>
                    <span className="text-white/55">{items}</span>
                    <span className="rounded-lg bg-white/10 px-2 py-1 font-black">
                      {status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="bg-background py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-primary">
              All 4 tiers
            </p>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-foreground md:text-5xl">
              Start free, then grow into the tools your restaurant actually
              needs.
            </h2>
            <p className="mt-5 text-base leading-8 text-muted-foreground">
              Clear plans for simple menus, ordering, revenue growth, and full
              restaurant operations.
            </p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => (
              <article
                key={plan.key}
                className={`relative flex min-h-[440px] flex-col rounded-2xl border bg-card p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl ${plan.accent} ${plan.highlight ? "ring-2 ring-primary/20" : ""}`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white">
                    {plan.badge}
                  </div>
                )}
                <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
                  {plan.key}
                </p>
                <h3 className="mt-4 text-2xl font-black text-foreground">
                  {plan.name}
                </h3>
                <p className="mt-3 min-h-[72px] text-sm leading-6 text-muted-foreground">
                  {plan.description}
                </p>
                <div className="mt-5">
                  <span className="text-4xl font-black tracking-tight text-foreground">
                    {plan.price}
                  </span>
                  <span className="ml-2 text-xs font-bold text-muted-foreground">
                    {plan.period}
                  </span>
                </div>
                <ul className="mt-6 flex-1 space-y-3">
                  {plan.bullets.map((bullet) => (
                    <li
                      key={bullet}
                      className="flex items-start gap-2.5 text-sm font-medium text-muted-foreground"
                    >
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {bullet}
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  variant={plan.highlight ? "default" : "outline"}
                  className="mt-7 w-full"
                >
                  <Link to={plan.href}>{plan.cta}</Link>
                </Button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-secondary/40 py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-primary">
              Plan comparison
            </p>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-foreground md:text-5xl">
              Compare what each tier unlocks.
            </h2>
          </div>
          <div className="mt-10 overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
            <table className="w-full min-w-[820px]">
              <thead>
                <tr className="border-b border-border bg-secondary/70">
                  <th className="w-[34%] px-5 py-4 text-left text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
                    Feature
                  </th>
                  {plans.map((plan) => (
                    <th
                      key={plan.key}
                      className="px-4 py-4 text-center text-xs font-black uppercase tracking-[0.16em] text-foreground"
                    >
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, index) => (
                  <tr
                    key={row.label}
                    className={`border-b border-border/70 ${index % 2 ? "bg-secondary/20" : "bg-card"}`}
                  >
                    <td className="px-5 py-4 text-sm font-bold text-foreground">
                      {row.label}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <FeatureValue value={row.free} />
                    </td>
                    <td className="px-4 py-4 text-center">
                      <FeatureValue value={row.starter} />
                    </td>
                    <td className="px-4 py-4 text-center">
                      <FeatureValue value={row.professional} />
                    </td>
                    <td className="px-4 py-4 text-center">
                      <FeatureValue value={row.enterprise} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="bg-background py-20 md:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-primary">
              FAQ
            </p>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-foreground md:text-5xl">
              Questions before launch?
            </h2>
            <p className="mt-5 text-base leading-8 text-muted-foreground">
              Here are the answers most restaurants need before replacing
              printed menus or adding digital ordering.
            </p>
          </div>
          <div className="space-y-3">
            {faqItems.map((item) => (
              <details
                key={item.question}
                className="group rounded-2xl border border-border bg-card p-5 shadow-sm"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-black text-foreground">
                  {item.question}
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-primary transition group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-4 text-sm leading-7 text-muted-foreground">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-foreground px-4 py-16 text-background sm:px-6 md:py-24 lg:px-8">
        <div className="mx-auto max-w-5xl text-center">
          <div className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-background text-foreground">
            <QrCode className="h-7 w-7" />
          </div>
          <h2 className="text-4xl font-black tracking-tight md:text-6xl">
            Make the first scan feel like your best service moment.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-background/68">
            Launch a stunning QR menu today, then grow into ordering, payments,
            loyalty, POS, and kitchen operations when the restaurant is ready.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              to="/register"
              className="inline-flex h-14 items-center justify-center rounded-2xl bg-background px-8 text-sm font-black uppercase tracking-wider text-foreground transition hover:opacity-90"
            >
              Start Free Trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link
              to="/pricing"
              className="inline-flex h-14 items-center justify-center rounded-2xl border border-background/20 px-8 text-sm font-black uppercase tracking-wider text-background transition hover:bg-background/10"
            >
              View Pricing
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-background py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 px-4 text-center sm:px-6 md:flex-row md:text-left lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-white">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-foreground">
                QR Menu
              </p>
              <p className="text-xs font-medium text-muted-foreground">
                Digital restaurant operations platform
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-5 text-xs font-bold text-muted-foreground">
            <Link to="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link to="/cookies" className="hover:text-foreground">
              Cookies
            </Link>
            <span>© {new Date().getFullYear()} QR Menu</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
