import { Link } from "react-router-dom";
import { useState } from "react";
import {
  ArrowRight,
  BarChart2,
  Building2,
  Check,
  ChefHat,
  Clock,
  CreditCard,
  Gift,
  Languages,
  LayoutDashboard,
  MessageSquare,
  Moon,
  Palette,
  Printer,
  QrCode,
  ReceiptText,
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
  CalendarDays,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/button";
import SocialBar from "../components/menu/SocialBar";
import { TopBar } from "../components/menu/TopBar";
import { CategoryPills } from "../components/menu/CategoryPills";
import { ItemWithOptions } from "../components/menu/ItemWithOptions";
import Footer from "../components/menu/Footer";
import { CartProvider } from "../context/CartContext";
import type { Item, Category } from "../types";

/* ═══════════════════════════════════════════════════════════
   DATA
   ═══════════════════════════════════════════════════════════ */

type TierKey = "FREE" | "STARTER" | "PROFESSIONAL" | "ENTERPRISE";

type Plan = {
  key: TierKey;
  name: string;
  fit: string;
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
  labelKey: string;
  free: boolean | string;
  starter: boolean | string;
  professional: boolean | string;
  enterprise: boolean | string;
};

const featureCards = [
  {
    icon: QrCode,
    titleKey: "landing.featureSuite.qrMenus.title",
    textKey: "landing.featureSuite.qrMenus.text",
    tone: "from-violet-500 to-purple-600",
    toneBg: "bg-violet-500/10 text-violet-500",
  },
  {
    icon: ShoppingCart,
    titleKey: "landing.featureSuite.onlineOrdering.title",
    textKey: "landing.featureSuite.onlineOrdering.text",
    tone: "from-blue-500 to-indigo-600",
    toneBg: "bg-blue-500/10 text-blue-500",
  },
  {
    icon: CreditCard,
    titleKey: "landing.featureSuite.stripePayments.title",
    textKey: "landing.featureSuite.stripePayments.text",
    tone: "from-emerald-500 to-teal-600",
    toneBg: "bg-emerald-500/10 text-emerald-500",
  },
  {
    icon: ReceiptText,
    titleKey: "landing.featureSuite.paymentProviders.title",
    textKey: "landing.featureSuite.paymentProviders.text",
    tone: "from-green-500 to-emerald-600",
    toneBg: "bg-green-500/10 text-green-500",
  },
  {
    icon: ChefHat,
    titleKey: "landing.featureSuite.kitchenDisplay.title",
    textKey: "landing.featureSuite.kitchenDisplay.text",
    tone: "from-orange-500 to-red-500",
    toneBg: "bg-orange-500/10 text-orange-500",
  },
  {
    icon: MonitorSmartphone,
    titleKey: "landing.featureSuite.waiterPos.title",
    textKey: "landing.featureSuite.waiterPos.text",
    tone: "from-pink-500 to-rose-600",
    toneBg: "bg-pink-500/10 text-pink-500",
  },
  {
    icon: LayoutDashboard,
    titleKey: "landing.featureSuite.liveTable.title",
    textKey: "landing.featureSuite.liveTable.text",
    tone: "from-cyan-500 to-blue-500",
    toneBg: "bg-cyan-500/10 text-cyan-500",
  },
  {
    icon: Building2,
    titleKey: "landing.featureSuite.tableZones.title",
    textKey: "landing.featureSuite.tableZones.text",
    tone: "from-slate-500 to-zinc-600",
    toneBg: "bg-slate-500/10 text-slate-500",
  },
  {
    icon: Gift,
    titleKey: "landing.featureSuite.loyaltyVip.title",
    textKey: "landing.featureSuite.loyaltyVip.text",
    tone: "from-amber-500 to-yellow-600",
    toneBg: "bg-amber-500/10 text-amber-500",
  },
  {
    icon: BarChart2,
    titleKey: "landing.featureSuite.analytics.title",
    textKey: "landing.featureSuite.analytics.text",
    tone: "from-indigo-500 to-violet-600",
    toneBg: "bg-indigo-500/10 text-indigo-500",
  },
  {
    icon: Languages,
    titleKey: "landing.featureSuite.multiLanguage.title",
    textKey: "landing.featureSuite.multiLanguage.text",
    tone: "from-teal-500 to-emerald-600",
    toneBg: "bg-teal-500/10 text-teal-500",
  },
  {
    icon: Palette,
    titleKey: "landing.featureSuite.branding.title",
    textKey: "landing.featureSuite.branding.text",
    tone: "from-fuchsia-500 to-pink-600",
    toneBg: "bg-fuchsia-500/10 text-fuchsia-500",
  },
  {
    icon: Users,
    titleKey: "landing.featureSuite.staffManagement.title",
    textKey: "landing.featureSuite.staffManagement.text",
    tone: "from-sky-500 to-blue-600",
    toneBg: "bg-sky-500/10 text-sky-500",
  },
  {
    icon: Upload,
    titleKey: "landing.featureSuite.menuImportExport.title",
    textKey: "landing.featureSuite.menuImportExport.text",
    tone: "from-lime-500 to-green-600",
    toneBg: "bg-lime-500/10 text-lime-500",
  },
  {
    icon: Printer,
    titleKey: "landing.featureSuite.printersTemplates.title",
    textKey: "landing.featureSuite.printersTemplates.text",
    tone: "from-stone-500 to-neutral-700",
    toneBg: "bg-stone-500/10 text-stone-500",
  },
  {
    icon: UserCheck,
    titleKey: "landing.featureSuite.customerAccounts.title",
    textKey: "landing.featureSuite.customerAccounts.text",
    tone: "from-rose-500 to-red-600",
    toneBg: "bg-rose-500/10 text-rose-500",
  },
  {
    icon: TrendingUp,
    titleKey: "landing.featureSuite.smartUpselling.title",
    textKey: "landing.featureSuite.smartUpselling.text",
    tone: "from-yellow-500 to-orange-500",
    toneBg: "bg-yellow-500/10 text-yellow-500",
  },
  {
    icon: MessageSquare,
    titleKey: "landing.featureSuite.feedbackReviews.title",
    textKey: "landing.featureSuite.feedbackReviews.text",
    tone: "from-purple-500 to-indigo-600",
    toneBg: "bg-purple-500/10 text-purple-500",
  },
  {
    icon: Shield,
    titleKey: "landing.featureSuite.security.title",
    textKey: "landing.featureSuite.security.text",
    tone: "from-slate-500 to-gray-700",
    toneBg: "bg-slate-500/10 text-slate-500",
  },
  {
    icon: CalendarDays,
    titleKey: "landing.featureSuite.reservations.title",
    textKey: "landing.featureSuite.reservations.text",
    tone: "from-blue-400 to-cyan-500",
    toneBg: "bg-blue-400/10 text-blue-500",
  },
];

const advantageItems = [
  {
    icon: Clock,
    labelKey: "landing.advantages.items.launchMenu.label",
    textKey: "landing.advantages.items.launchMenu.text",
  },
  {
    icon: CreditCard,
    labelKey: "landing.advantages.items.reduceFriction.label",
    textKey: "landing.advantages.items.reduceFriction.text",
  },
  {
    icon: MessageSquare,
    labelKey: "landing.advantages.items.knowGuests.label",
    textKey: "landing.advantages.items.knowGuests.text",
  },
  {
    icon: Zap,
    labelKey: "landing.advantages.items.moveFaster.label",
    textKey: "landing.advantages.items.moveFaster.text",
  },
] as const;

const comparisonRows: FeatureRow[] = [
  {
    labelKey: "landing.comparisonTable.rows.digitalMenuBuilder",
    free: true,
    starter: true,
    professional: true,
    enterprise: true,
  },
  {
    labelKey: "landing.comparisonTable.rows.qrCodeManagement",
    free: true,
    starter: true,
    professional: true,
    enterprise: true,
  },
  {
    labelKey: "landing.comparisonTable.rows.menuImport",
    free: true,
    starter: true,
    professional: true,
    enterprise: true,
  },
  {
    labelKey: "landing.comparisonTable.rows.menuExport",
    free: true,
    starter: true,
    professional: true,
    enterprise: true,
  },
  {
    labelKey: "landing.comparisonTable.rows.onlineOrdering",
    free: false,
    starter: true,
    professional: true,
    enterprise: true,
  },
  {
    labelKey: "landing.comparisonTable.rows.callWaiter",
    free: false,
    starter: true,
    professional: true,
    enterprise: true,
  },
  {
    labelKey: "landing.comparisonTable.rows.basicAnalytics",
    free: true,
    starter: true,
    professional: true,
    enterprise: true,
  },
  {
    labelKey: "landing.comparisonTable.rows.advancedAnalytics",
    free: false,
    starter: false,
    professional: true,
    enterprise: true,
  },
  {
    labelKey: "landing.comparisonTable.rows.paymentProviders",
    free: false,
    starter: false,
    professional: true,
    enterprise: true,
  },
  {
    labelKey: "landing.comparisonTable.rows.multiLanguageMenus",
    free: false,
    starter: true,
    professional: true,
    enterprise: true,
  },
  {
    labelKey: "landing.comparisonTable.rows.customBranding",
    free: false,
    starter: false,
    professional: true,
    enterprise: true,
  },
  {
    labelKey: "landing.comparisonTable.rows.loyaltyProgram",
    free: false,
    starter: false,
    professional: true,
    enterprise: true,
  },
  {
    labelKey: "landing.comparisonTable.rows.customerAccounts",
    free: false,
    starter: false,
    professional: true,
    enterprise: true,
  },
  {
    labelKey: "landing.comparisonTable.rows.smartUpselling",
    free: false,
    starter: false,
    professional: true,
    enterprise: true,
  },
  {
    labelKey: "landing.comparisonTable.rows.dayparting",
    free: false,
    starter: false,
    professional: true,
    enterprise: true,
  },
  {
    labelKey: "landing.comparisonTable.rows.reservations",
    free: false,
    starter: false,
    professional: true,
    enterprise: true,
  },
  {
    labelKey: "landing.comparisonTable.rows.pos",
    free: false,
    starter: false,
    professional: false,
    enterprise: true,
  },
  {
    labelKey: "landing.comparisonTable.rows.kds",
    free: false,
    starter: false,
    professional: false,
    enterprise: true,
  },
  {
    labelKey: "landing.comparisonTable.rows.advancedRoles",
    free: false,
    starter: false,
    professional: false,
    enterprise: true,
  },
  {
    labelKey: "landing.comparisonTable.rows.multiLocation",
    free: false,
    starter: false,
    professional: false,
    enterprise: true,
  },
  {
    labelKey: "landing.comparisonTable.rows.thermalPrinters",
    free: false,
    starter: false,
    professional: false,
    enterprise: true,
  },
  {
    labelKey: "landing.comparisonTable.rows.menuTemplates",
    free: false,
    starter: false,
    professional: false,
    enterprise: true,
  },
  {
    labelKey: "landing.comparisonTable.rows.staffSeats",
    free: "0",
    starter: "1",
    professional: "5",
    enterprise: "∞",
  },
];

const faqItems = [
  {
    questionKey: "landing.homeFaq.items.q1.question",
    answerKey: "landing.homeFaq.items.q1.answer",
  },
  {
    questionKey: "landing.homeFaq.items.q2.question",
    answerKey: "landing.homeFaq.items.q2.answer",
  },
  {
    questionKey: "landing.homeFaq.items.q3.question",
    answerKey: "landing.homeFaq.items.q3.answer",
  },
  {
    questionKey: "landing.homeFaq.items.q4.question",
    answerKey: "landing.homeFaq.items.q4.answer",
  },
  {
    questionKey: "landing.homeFaq.items.q5.question",
    answerKey: "landing.homeFaq.items.q5.answer",
  },
  {
    questionKey: "landing.homeFaq.items.q6.question",
    answerKey: "landing.homeFaq.items.q6.answer",
  },
  {
    questionKey: "landing.homeFaq.items.q7.question",
    answerKey: "landing.homeFaq.items.q7.answer",
  },
  {
    questionKey: "landing.homeFaq.items.q8.question",
    answerKey: "landing.homeFaq.items.q8.answer",
  },
];

const heroPills = [
  {
    icon: Smartphone,
    line1Key: "landing.heroPills.noApp.line1",
    line2Key: "landing.heroPills.noApp.line2",
  },
  {
    icon: QrCode,
    line1Key: "landing.heroPills.qrScan.line1",
    line2Key: "landing.heroPills.qrScan.line2",
  },
  {
    icon: Zap,
    line1Key: "landing.heroPills.realTime.line1",
    line2Key: "landing.heroPills.realTime.line2",
  },
  {
    icon: Moon,
    line1Key: "landing.heroPills.theme.line1",
    line2Key: "landing.heroPills.theme.line2",
  },
] as const;

const credibilityCards = [
  {
    valueKey: "landing.credibility.cards.bgMarket.value",
    labelKey: "landing.credibility.cards.bgMarket.label",
  },
  {
    valueKey: "landing.credibility.cards.pilotReady.value",
    labelKey: "landing.credibility.cards.pilotReady.label",
  },
  {
    valueKey: "landing.credibility.cards.setup.value",
    labelKey: "landing.credibility.cards.setup.label",
  },
  {
    valueKey: "landing.credibility.cards.noLockIn.value",
    labelKey: "landing.credibility.cards.noLockIn.label",
  },
] as const;

const footerGroups = [
  {
    titleKey: "landing.footer.product.title",
    links: [
      { labelKey: "landing.footer.product.features", to: "#features" },
      { labelKey: "landing.footer.product.pricing", to: "/pricing" },
      { labelKey: "landing.footer.product.dashboard", to: "/dashboard" },
      { labelKey: "landing.footer.product.help", to: "/help" },
    ],
  },
  {
    titleKey: "landing.footer.company.title",
    links: [
      { labelKey: "landing.footer.company.about", to: "#credibility" },
      { labelKey: "landing.footer.company.contact", to: "/contact" },
      { labelKey: "landing.footer.company.security", to: "/privacy" },
    ],
  },
] as const;

function FeatureValue({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
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

function createMockCategories(t: (key: string) => string): Category[] {
  return [
    {
      id: "cat-all",
      name: t("landing.phone.categories.all"),
      restaurantId: "demo",
      items: [],
      availabilityType: "ALWAYS" as const,
      daysOfWeek: [],
      isDrinkCategory: false,
    },
    {
      id: "cat-popular",
      name: t("landing.phone.categories.popular"),
      restaurantId: "demo",
      items: [],
      availabilityType: "ALWAYS" as const,
      daysOfWeek: [],
      isDrinkCategory: false,
    },
    {
      id: "cat-salads",
      name: t("landing.phone.categories.salads"),
      restaurantId: "demo",
      items: [],
      availabilityType: "ALWAYS" as const,
      daysOfWeek: [],
      isDrinkCategory: false,
    },
    {
      id: "cat-grill",
      name: t("landing.phone.categories.grill"),
      restaurantId: "demo",
      items: [],
      availabilityType: "ALWAYS" as const,
      daysOfWeek: [],
      isDrinkCategory: false,
    },
    {
      id: "cat-desserts",
      name: t("landing.phone.categories.desserts"),
      restaurantId: "demo",
      items: [],
      availabilityType: "ALWAYS" as const,
      daysOfWeek: [],
      isDrinkCategory: false,
    },
    {
      id: "cat-drinks",
      name: t("landing.phone.categories.drinks"),
      restaurantId: "demo",
      items: [],
      availabilityType: "ALWAYS" as const,
      daysOfWeek: [],
      isDrinkCategory: true,
    },
  ];
}

function createMockItems(t: (key: string) => string): Item[] {
  return [
    {
      id: "item-1",
      name: t("landing.phone.items.shopska.name"),
      description: t("landing.phone.items.shopska.description"),
      price: 9.9,
      currency: "BGN",
      categoryId: "cat-salads",
      dietaryTags: [t("landing.phone.tags.vegetarian")],
      allergens: [t("landing.phone.allergens.milk")],
    },
    {
      id: "item-2",
      name: t("landing.phone.items.kyufte.name"),
      description: t("landing.phone.items.kyufte.description"),
      price: 15.9,
      currency: "BGN",
      categoryId: "cat-grill",
      allergens: [t("landing.phone.allergens.gluten")],
    },
    {
      id: "item-3",
      name: t("landing.phone.items.trout.name"),
      description: t("landing.phone.items.trout.description"),
      price: 21.9,
      currency: "BGN",
      categoryId: "cat-popular",
      allergens: [t("landing.phone.allergens.fish")],
    },
    {
      id: "item-4",
      name: t("landing.phone.items.banitsa.name"),
      description: t("landing.phone.items.banitsa.description"),
      price: 7.9,
      currency: "BGN",
      categoryId: "cat-popular",
      allergens: [
        t("landing.phone.allergens.gluten"),
        t("landing.phone.allergens.milk"),
      ],
    },
    {
      id: "item-5",
      name: t("landing.phone.items.lemonade.name"),
      description: t("landing.phone.items.lemonade.description"),
      price: 5.9,
      currency: "BGN",
      categoryId: "cat-drinks",
      dietaryTags: [t("landing.phone.tags.vegan")],
    },
  ];
}

const MOCK_BRAND_VARS = {
  "--gradient-brand": "linear-gradient(135deg, #6E56F8, #8B6FFF)",
  "--brand-contrast": "#ffffff",
  "--color-accent": "#6E56F8",
  "--color-primary": "#6E56F8",
  "--brand": "#6E56F8",
  "--brand-2": "#6E56F8",
  "--color-primary-foreground": "#ffffff",
  "--color-accent-foreground": "#ffffff",
} as React.CSSProperties;

function PhoneMockup() {
  const { t } = useTranslation();
  const restaurantName = t("landing.phone.restaurantName");
  const categories = createMockCategories(t);
  const items = createMockItems(t);

  return (
    <div className="flex justify-center self-start pt-2">
      <div
        className="relative w-[320px] rounded-[48px] p-3"
        style={{
          background: "linear-gradient(160deg, #1F1D2A 0%, #0E0C16 100%)",
          boxShadow:
            "0 30px 80px -20px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.04) inset, 0 0 0 2px #2a2740",
        }}
      >
        <div className="absolute left-1/2 top-[18px] z-20 h-[30px] w-[110px] -translate-x-1/2 rounded-[20px] bg-black" />
        <CartProvider>
          <div
            className="h-[636px] overflow-y-auto hide-scrollbar rounded-[38px] bg-background text-foreground"
            style={MOCK_BRAND_VARS}
          >
            <div className="flex items-center justify-between px-5 pb-2 pt-4 text-[12px] font-semibold text-foreground">
              <span>9:41</span>
              <span className="inline-flex items-center gap-[4px]">
                <svg width="12" height="9" viewBox="0 0 18 12">
                  <path
                    d="M1 9h2v3H1zM5 6h2v6H5zM9 3h2v9H9zM13 0h2v12h-2z"
                    fill="currentColor"
                  />
                </svg>
                <svg
                  width="12"
                  height="9"
                  viewBox="0 0 18 12"
                  fill="currentColor"
                >
                  <path d="M9 2C5.5 2 2.5 3.5 0 5.5L9 12l9-6.5C15.5 3.5 12.5 2 9 2z" />
                </svg>
                <svg width="20" height="11" viewBox="0 0 26 12" fill="none">
                  <rect
                    x="1"
                    y="1"
                    width="22"
                    height="10"
                    rx="2"
                    stroke="currentColor"
                  />
                  <rect
                    x="3"
                    y="3"
                    width="17"
                    height="6"
                    rx="1"
                    fill="currentColor"
                  />
                  <rect
                    x="24"
                    y="4"
                    width="2"
                    height="4"
                    rx="1"
                    fill="currentColor"
                  />
                </svg>
              </span>
            </div>

            <SocialBar
              restaurantName={restaurantName}
              instagramUrl="#"
              facebookUrl="#"
            />

            <TopBar
              tableNumber="12"
              targetLanguages={["bg"]}
              selectedLang="bg"
              onLanguageChange={() => {}}
              onFilterClick={() => {}}
              searchQuery=""
              onSearchChange={() => {}}
              restaurantId="demo"
              defaultTheme="light"
            />

            <CategoryPills
              categories={categories}
              activeCategory="cat-popular"
              selectedLang="bg"
              onSelect={() => {}}
            />

            <div className="px-3 space-y-2.5 pb-4">
              {items.map((item) => (
                <ItemWithOptions
                  key={item.id}
                  item={item}
                  ordersEnabled={true}
                />
              ))}
            </div>

            <Footer restaurantName={restaurantName} />
          </div>
        </CartProvider>
      </div>
    </div>
  );
}

function DashboardPreview() {
  const { t } = useTranslation();
  const kpis = [
    {
      label: t("landing.dashboardMock.kpis.orders"),
      value: "1 246",
      trend: "+18.6%",
    },
    {
      label: t("landing.dashboardMock.kpis.revenue"),
      value: "24 860 лв.",
      trend: "+22.1%",
    },
    {
      label: t("landing.dashboardMock.kpis.tables"),
      value: "21",
      trend: t("landing.dashboardMock.kpis.tablesMeta"),
    },
    {
      label: t("landing.dashboardMock.kpis.service"),
      value: "6",
      trend: t("landing.dashboardMock.kpis.serviceMeta"),
    },
  ];
  const topDishes = [
    {
      rank: 1,
      name: t("landing.dashboardMock.dishes.shopska"),
      count: 342,
      bg: "radial-gradient(circle, #8CCB7A, #3E8E41)",
    },
    {
      rank: 2,
      name: t("landing.dashboardMock.dishes.kyufte"),
      count: 289,
      bg: "radial-gradient(circle, #D9A45E, #8B4513)",
    },
    {
      rank: 3,
      name: t("landing.dashboardMock.dishes.trout"),
      count: 207,
      bg: "radial-gradient(circle, #F08054, #C44E2A)",
    },
    {
      rank: 4,
      name: t("landing.dashboardMock.dishes.banitsa"),
      count: 187,
      bg: "radial-gradient(circle, #F4DB95, #C9A04E)",
    },
  ];
  const channels = [
    {
      color: "#6E56F8",
      label: t("landing.dashboardMock.channels.qr"),
      pct: "46%",
    },
    {
      color: "#A78BFA",
      label: t("landing.dashboardMock.channels.staff"),
      pct: "28%",
    },
    {
      color: "#34D399",
      label: t("landing.dashboardMock.channels.pos"),
      pct: "19%",
    },
    {
      color: "#FBBF24",
      label: t("landing.dashboardMock.channels.takeaway"),
      pct: "7%",
    },
  ];
  const liveOrders = [
    {
      id: "#1254",
      table: t("landing.dashboardMock.table", { number: 12 }),
      items: t("landing.dashboardMock.items", { count: 2 }),
      price: "24.90 лв.",
      status: t("landing.dashboardMock.status.preparing"),
      statusColor: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    },
    {
      id: "#1255",
      table: t("landing.dashboardMock.table", { number: 5 }),
      items: t("landing.dashboardMock.items", { count: 3 }),
      price: "33.60 лв.",
      status: t("landing.dashboardMock.status.preparing"),
      statusColor: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    },
    {
      id: "#1256",
      table: t("landing.dashboardMock.table", { number: 8 }),
      items: t("landing.dashboardMock.items", { count: 1 }),
      price: "18.20 лв.",
      status: t("landing.dashboardMock.status.ready"),
      statusColor: "bg-emerald-500/15 text-emerald-600",
    },
    {
      id: "#1257",
      table: t("landing.dashboardMock.table", { number: 3 }),
      items: t("landing.dashboardMock.items", { count: 4 }),
      price: "52.00 лв.",
      status: t("landing.dashboardMock.status.new"),
      statusColor: "bg-primary/15 text-primary",
    },
  ];

  return (
    <div className="relative w-full self-start pt-2">
      <div className="rounded-[22px] border border-border bg-card p-4 shadow-lg sm:p-[22px]">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-bold text-foreground">
              {t("landing.dashboardMock.title")}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {t("landing.dashboardMock.subtitle")}
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs text-muted-foreground">
            {t("landing.dashboardMock.range")}
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path
                d="M2 4l3 3 3-3"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-xl border border-border bg-secondary p-3"
            >
              <div className="mb-1 text-[11px] text-muted-foreground">
                {kpi.label}
              </div>
              <div className="flex flex-wrap items-baseline gap-1.5 text-[17px] font-bold text-foreground">
                {kpi.value}
                <span className="text-[10px] font-semibold text-emerald-500">
                  {kpi.trend}
                </span>
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {t("landing.dashboardMock.kpis.period")}
              </div>
            </div>
          ))}
        </div>

        <div className="mb-3.5 grid gap-3.5 lg:grid-cols-[1.35fr_0.9fr]">
          <div className="rounded-[14px] border border-border bg-secondary p-3.5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-[13px] font-bold text-foreground">
                {t("landing.dashboardMock.ordersOverview")}
              </span>
              <div className="inline-flex gap-0.5 text-[11px] text-muted-foreground">
                <span className="rounded-md px-2 py-1">
                  {t("landing.dashboardMock.filters.day")}
                </span>
                <span className="rounded-md px-2 py-1">
                  {t("landing.dashboardMock.filters.week")}
                </span>
                <span className="rounded-md bg-primary/10 px-2 py-1 font-semibold text-primary">
                  {t("landing.dashboardMock.filters.month")}
                </span>
              </div>
            </div>
            <svg
              className="h-[130px] w-full"
              viewBox="0 0 360 130"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="heroLineGrad" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#8B6FFF" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#8B6FFF" stopOpacity="0" />
                </linearGradient>
              </defs>
              <g
                stroke="currentColor"
                className="text-border"
                strokeDasharray="2,3"
                fill="none"
              >
                <line x1="0" y1="20" x2="360" y2="20" />
                <line x1="0" y1="55" x2="360" y2="55" />
                <line x1="0" y1="90" x2="360" y2="90" />
              </g>
              <path
                d="M30,90 L75,75 L120,80 L165,55 L210,65 L255,40 L300,45 L345,25"
                fill="none"
                stroke="#8B6FFF"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M30,90 L75,75 L120,80 L165,55 L210,65 L255,40 L300,45 L345,25 L345,120 L30,120 Z"
                fill="url(#heroLineGrad)"
              />
              <g fill="#8B6FFF">
                {[30, 75, 120, 165, 210, 255, 300, 345].map((cx, idx) => (
                  <circle
                    key={cx}
                    cx={cx}
                    cy={[90, 75, 80, 55, 65, 40, 45, 25][idx]}
                    r="3"
                  />
                ))}
              </g>
              <g className="fill-muted-foreground text-[8px]">
                <text x="18" y="128" fill="currentColor">
                  {t("landing.dashboardMock.chart.day1")}
                </text>
                <text x="92" y="128" fill="currentColor">
                  {t("landing.dashboardMock.chart.day2")}
                </text>
                <text x="168" y="128" fill="currentColor">
                  {t("landing.dashboardMock.chart.day3")}
                </text>
                <text x="250" y="128" fill="currentColor">
                  {t("landing.dashboardMock.chart.day4")}
                </text>
              </g>
            </svg>
          </div>

          <div className="rounded-[14px] border border-border bg-secondary p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-bold text-foreground">
                {t("landing.dashboardMock.topDishes")}
              </span>
              <span className="text-[11px] font-semibold text-primary">
                {t("landing.dashboardMock.viewAll")}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              {topDishes.map((dish) => (
                <div
                  key={dish.name}
                  className="grid grid-cols-[18px_22px_1fr_auto] items-center gap-2 text-[11px]"
                >
                  <span className="font-semibold text-muted-foreground">
                    {dish.rank}
                  </span>
                  <div
                    className="h-[22px] w-[22px] rounded-md"
                    style={{ background: dish.bg }}
                  />
                  <span className="truncate font-medium text-foreground">
                    {dish.name}
                  </span>
                  <span className="font-semibold text-muted-foreground">
                    {dish.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-3.5 lg:grid-cols-[1fr_1.2fr]">
          <div className="rounded-[14px] border border-border bg-secondary p-3.5">
            <div className="mb-2.5 text-xs font-bold text-foreground">
              {t("landing.dashboardMock.salesByChannel")}
            </div>
            <div className="grid grid-cols-[94px_1fr] items-center gap-2.5">
              <div className="relative">
                <svg viewBox="0 0 100 100" className="h-[94px] w-[94px]">
                  <circle
                    r="40"
                    cx="50"
                    cy="50"
                    fill="none"
                    stroke="#6E56F8"
                    strokeWidth="14"
                    strokeDasharray="116 251"
                    transform="rotate(-90 50 50)"
                  />
                  <circle
                    r="40"
                    cx="50"
                    cy="50"
                    fill="none"
                    stroke="#A78BFA"
                    strokeWidth="14"
                    strokeDasharray="70 251"
                    strokeDashoffset="-116"
                    transform="rotate(-90 50 50)"
                  />
                  <circle
                    r="40"
                    cx="50"
                    cy="50"
                    fill="none"
                    stroke="#34D399"
                    strokeWidth="14"
                    strokeDasharray="48 251"
                    strokeDashoffset="-186"
                    transform="rotate(-90 50 50)"
                  />
                  <circle
                    r="40"
                    cx="50"
                    cy="50"
                    fill="none"
                    stroke="#FBBF24"
                    strokeWidth="14"
                    strokeDasharray="17 251"
                    strokeDashoffset="-234"
                    transform="rotate(-90 50 50)"
                  />
                </svg>
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                  <div className="text-[12px] font-bold text-foreground">
                    24.8k
                  </div>
                  <div className="text-[9px] text-muted-foreground">
                    {t("landing.dashboardMock.total")}
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-1 text-[10px]">
                {channels.map((item) => (
                  <div
                    key={item.label}
                    className="grid grid-cols-[10px_1fr_auto] items-center gap-1.5 text-muted-foreground"
                  >
                    <span
                      className="h-2 w-2 rounded-sm"
                      style={{ background: item.color }}
                    />
                    <span>{item.label}</span>
                    <span className="font-semibold text-foreground">
                      {item.pct}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-[14px] border border-border bg-secondary p-3.5">
            <div className="mb-2.5 flex items-center justify-between text-xs font-bold text-foreground">
              <span>{t("landing.dashboardMock.liveOrders")}</span>
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-600">
                {t("landing.dashboardMock.sync")}
              </span>
            </div>
            <div className="space-y-1.5 text-[10.5px]">
              {liveOrders.map((order) => (
                <div
                  key={order.id}
                  className="grid grid-cols-[48px_1fr_auto] items-center gap-2 rounded-lg bg-background/55 px-2 py-1.5"
                >
                  <span className="font-semibold text-foreground">
                    {order.id}
                  </span>
                  <span className="truncate text-muted-foreground">
                    {order.table} · {order.items} · {order.price}
                  </span>
                  <span
                    className={
                      "rounded-[5px] px-1.5 py-0.5 text-[9px] font-semibold " +
                      order.statusColor
                    }
                  >
                    {order.status}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 text-right text-[11px] font-semibold text-primary">
              {t("landing.dashboardMock.viewAllOrders")}
            </div>
          </div>
        </div>
      </div>

      <div
        className="absolute -bottom-10 -right-2 hidden w-[150px] -rotate-3 rounded-[14px] p-3.5 text-white shadow-[0_20px_40px_-10px_rgba(110,86,248,.5)] sm:block"
        style={{
          background: "linear-gradient(160deg, #6E56F8 0%, #4A39B8 100%)",
        }}
      >
        <div className="mb-2.5 text-[11px] font-semibold leading-tight">
          {t("landing.dashboardMock.qrCard.line1")}
          <br />
          {t("landing.dashboardMock.qrCard.line2")}
        </div>
        <div className="rounded-lg bg-white p-1.5">
          <svg viewBox="0 0 100 100" width="100%" height="100%">
            <rect x="0" y="0" width="100" height="100" fill="#fff" />
            <g fill="#0E0B1A">
              <rect x="6" y="6" width="22" height="22" />
              <rect x="10" y="10" width="14" height="14" fill="#fff" />
              <rect x="13" y="13" width="8" height="8" />
              <rect x="72" y="6" width="22" height="22" />
              <rect x="76" y="10" width="14" height="14" fill="#fff" />
              <rect x="79" y="13" width="8" height="8" />
              <rect x="6" y="72" width="22" height="22" />
              <rect x="10" y="76" width="14" height="14" fill="#fff" />
              <rect x="13" y="79" width="8" height="8" />
              {[
                34, 42, 50, 58, 66, 38, 46, 54, 62, 74, 86, 34, 50, 58, 66, 78,
                90,
              ].map((x, i) => (
                <rect
                  key={String(x) + "-" + i}
                  x={x}
                  y={i < 5 ? 34 : i < 11 ? 58 : 82}
                  width="4"
                  height="4"
                />
              ))}
            </g>
          </svg>
        </div>
        <div className="mt-2 text-xs font-bold">
          {t("landing.dashboardMock.qrCard.table")}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════════════════════════ */

const HomePage = () => {
  const { t } = useTranslation();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const plans: Plan[] = [
    {
      key: "FREE",
      name: t("landing.pricingSection.plans.free.name"),
      fit: t("landing.pricingSection.plans.free.fit"),
      price: "€0",
      period: t("landing.pricingSection.plans.free.period"),
      description: t("landing.pricingSection.plans.free.description"),
      cta: t("landing.pricingSection.plans.free.cta"),
      href: "/register",
      accent: "border-border",
      bullets: [
        t("landing.pricingSection.plans.free.b1"),
        t("landing.pricingSection.plans.free.b2"),
        t("landing.pricingSection.plans.free.b3"),
        t("landing.pricingSection.plans.free.b4"),
        t("landing.pricingSection.plans.free.b5"),
        t("landing.pricingSection.plans.free.b6"),
      ],
    },
    {
      key: "STARTER",
      name: t("landing.pricingSection.plans.starter.name"),
      fit: t("landing.pricingSection.plans.starter.fit"),
      price: "€15",
      period: t("landing.pricingSection.plans.starter.period"),
      description: t("landing.pricingSection.plans.starter.description"),
      cta: t("landing.pricingSection.plans.starter.cta"),
      href: "/register",
      accent: "border-blue-500/35",
      bullets: [
        t("landing.pricingSection.plans.starter.b1"),
        t("landing.pricingSection.plans.starter.b2"),
        t("landing.pricingSection.plans.starter.b3"),
        t("landing.pricingSection.plans.starter.b4"),
        t("landing.pricingSection.plans.starter.b5"),
        t("landing.pricingSection.plans.starter.b6"),
      ],
    },
    {
      key: "PROFESSIONAL",
      name: t("landing.pricingSection.plans.professional.name"),
      fit: t("landing.pricingSection.plans.professional.fit"),
      price: "€25",
      period: t("landing.pricingSection.plans.professional.period"),
      description: t("landing.pricingSection.plans.professional.description"),
      badge: t("landing.pricingSection.plans.professional.badge"),
      highlight: true,
      cta: t("landing.pricingSection.plans.professional.cta"),
      href: "/register",
      accent: "border-primary",
      bullets: [
        t("landing.pricingSection.plans.professional.b1"),
        t("landing.pricingSection.plans.professional.b2"),
        t("landing.pricingSection.plans.professional.b3"),
        t("landing.pricingSection.plans.professional.b4"),
        t("landing.pricingSection.plans.professional.b5"),
        t("landing.pricingSection.plans.professional.b6"),
        t("landing.pricingSection.plans.professional.b7"),
        t("landing.pricingSection.plans.professional.b8"),
        t("landing.pricingSection.plans.professional.b9"),
        t("landing.pricingSection.plans.professional.b10"),
      ],
    },
    {
      key: "ENTERPRISE",
      name: t("landing.pricingSection.plans.enterprise.name"),
      fit: t("landing.pricingSection.plans.enterprise.fit"),
      price: "€45",
      period: t("landing.pricingSection.plans.enterprise.period"),
      description: t("landing.pricingSection.plans.enterprise.description"),
      cta: t("landing.pricingSection.plans.enterprise.cta"),
      href: "/register",
      accent: "border-emerald-500/35",
      bullets: [
        t("landing.pricingSection.plans.enterprise.b1"),
        t("landing.pricingSection.plans.enterprise.b2"),
        t("landing.pricingSection.plans.enterprise.b3"),
        t("landing.pricingSection.plans.enterprise.b4"),
        t("landing.pricingSection.plans.enterprise.b5"),
        t("landing.pricingSection.plans.enterprise.b6"),
        t("landing.pricingSection.plans.enterprise.b7"),
        t("landing.pricingSection.plans.enterprise.b8"),
        t("landing.pricingSection.plans.enterprise.b9"),
        t("landing.pricingSection.plans.enterprise.b10"),
      ],
    },
  ];

  return (
    <div className="min-h-screen overflow-x-clip bg-background text-foreground">
      {/* ══════════════════ 1. ANNOUNCEMENT BAR ══════════════════ */}
      <section className="border-b border-border bg-primary text-primary-foreground pt-[4.5rem]">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-3 text-center sm:flex-row sm:px-6 lg:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-foreground/90">
            {t("landing.announcementBar.text")}
          </p>
          <Link
            to="/register"
            className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary-foreground px-4 py-2 text-xs font-black uppercase tracking-wider text-primary transition hover:opacity-90"
          >
            {t("landing.announcementBar.cta")}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      {/* ══════════════════ 2. HERO ══════════════════ */}
      <section className="relative overflow-hidden border-b border-border bg-background dark:bg-[radial-gradient(ellipse_1100px_600px_at_75%_30%,rgba(110,86,248,0.18),transparent_70%),radial-gradient(ellipse_800px_500px_at_20%_80%,rgba(110,86,248,0.12),transparent_70%),var(--color-background)]">
        <div
          className="absolute inset-0 -z-0 bg-[radial-gradient(rgba(110,86,248,0.12)_1px,transparent_1px)] bg-[size:24px_24px]"
          aria-hidden="true"
        />
        <div className="relative z-10 mx-auto max-w-[1480px] px-5 py-12 sm:px-10 md:px-[60px] md:pb-20 md:pt-16">
          <div className="grid items-center gap-10 xl:grid-cols-[minmax(380px,0.9fr)_minmax(720px,1.1fr)]">
            <div className="flex max-w-2xl flex-col items-start">
              <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-[13px] font-medium text-foreground shadow-sm">
                <ChefHat className="h-4 w-4 text-primary" />
                {t("landing.heroBadge")}
              </span>
              <h1 className="mb-6 text-[clamp(40px,5vw,64px)] font-extrabold leading-[1.04] tracking-tight text-foreground">
                <span className="text-primary">
                  {t("landing.heroWordAccent")}
                </span>
                <br />
                {t("landing.heroLine1")}
                <br />
                {t("landing.heroLine2")}
              </h1>
              <p className="mb-7 max-w-xl text-lg leading-[1.65] text-muted-foreground">
                {t("landing.heroSubtext")}
              </p>

              <div className="mb-8 grid w-full max-w-[560px] grid-cols-2 gap-2.5 sm:grid-cols-4">
                {heroPills.map(({ icon: Icon, line1Key, line2Key }) => (
                  <div
                    key={line1Key}
                    className="flex min-h-[74px] items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-3 text-[12.5px] font-medium leading-tight text-foreground shadow-sm"
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
                    <span>
                      {t(line1Key)}
                      <br />
                      {t(line2Key)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mb-5 flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="h-[52px] cursor-pointer rounded-[14px] px-[26px] text-base"
                >
                  <Link to="/register">
                    {t("landing.startFreeTrial")}
                    <ArrowRight className="ml-2 h-[18px] w-[18px]" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-[52px] cursor-pointer rounded-[14px] px-[26px] text-base"
                >
                  <Link to="/pricing">
                    <ReceiptText className="mr-2 h-4 w-4" />
                    {t("landing.viewPricing")}
                  </Link>
                </Button>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-muted-foreground">
                {[
                  "landing.heroTrustLine.noCreditCard",
                  "landing.heroTrustLine.setupInMinutes",
                  "landing.heroTrustLine.cancelAnytime",
                ].map((key) => (
                  <span key={key} className="inline-flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-primary" />
                    {t(key)}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[860px]">
              <div className="hidden pl-[220px] lg:block">
                <DashboardPreview />
              </div>
              <div className="relative z-10 flex justify-center lg:absolute lg:left-0 lg:top-8">
                <PhoneMockup />
              </div>
              <div className="mt-8 lg:hidden">
                <DashboardPreview />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════ 3. BG MARKET READINESS ══════════════════ */}
      <section
        id="credibility"
        className="border-y border-border bg-muted py-14 md:py-20"
      >
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:px-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-primary">
              {t("landing.credibility.badge")}
            </p>
            <h2 className="mt-4 text-3xl font-black tracking-tight text-foreground md:text-5xl">
              {t("landing.credibility.title")}
            </h2>
            <p className="mt-5 text-base leading-8 text-muted-foreground">
              {t("landing.credibility.subtitle")}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {credibilityCards.map((item) => (
              <div
                key={item.valueKey}
                className="rounded-2xl border border-border bg-card p-5 shadow-sm"
              >
                <p className="text-2xl font-black text-foreground">
                  {t(item.valueKey)}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t(item.labelKey)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════ 4. MAIN ADVANTAGES ══════════════════ */}
      <section className="border-y border-border bg-muted py-20 md:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-primary">
              {t("landing.advantages.badge")}
            </p>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-foreground md:text-5xl">
              {t("landing.advantages.title")}
            </h2>
            <p className="mt-5 text-base leading-8 text-muted-foreground">
              {t("landing.advantages.subtitle")}
            </p>
            <div className="mt-8">
              <Button
                asChild
                size="lg"
                className="h-12 cursor-pointer rounded-2xl px-6"
              >
                <Link to="/register">
                  {t("landing.getStarted")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {advantageItems.map(({ icon: Icon, labelKey, textKey }) => (
              <article
                key={labelKey}
                className="group cursor-pointer rounded-2xl border border-border bg-card p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl"
              >
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-black text-foreground">
                  {t(labelKey)}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t(textKey)}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════ 5. FULL FEATURE SUITE (16 features) ══════════════════ */}
      <section id="features" className="bg-background py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-primary">
              {t("landing.featuresBadge")}
            </p>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-foreground md:text-5xl">
              {t("landing.featuresTitle")}
            </h2>
            <p className="mt-5 text-base leading-8 text-muted-foreground">
              {t("landing.featuresSubtitle")}
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featureCards.map(({ icon: Icon, titleKey, textKey, toneBg }) => (
              <article
                key={titleKey}
                className="group cursor-pointer rounded-2xl border border-border bg-card p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-primary/30 hover:bg-muted/40 hover:shadow-xl"
              >
                <div
                  className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-transparent ${toneBg}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-black text-foreground">
                  {t(titleKey)}
                </h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {t(textKey)}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════ 6. NEW CLIENT PROCESS ══════════════════ */}
      <section className="border-y border-border bg-background py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-primary">
                {t("landing.onboarding.badge")}
              </p>
              <h2 className="mt-4 text-4xl font-black tracking-tight text-foreground md:text-5xl">
                {t("landing.onboarding.title")}
              </h2>
              <p className="mt-5 text-base leading-8 text-muted-foreground">
                {t("landing.onboarding.subtitle")}
              </p>
              <div className="mt-8 rounded-2xl border border-border bg-muted p-5">
                <p className="text-sm font-black text-foreground">
                  {t("landing.onboarding.noteTitle")}
                </p>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  {t("landing.onboarding.noteBody")}
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2, 3, 4].map((step) => (
                <article
                  key={step}
                  className="rounded-2xl border border-border bg-card p-6 shadow-sm"
                >
                  <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-sm font-black text-primary">
                    {step}
                  </div>
                  <h3 className="text-lg font-black text-foreground">
                    {t("landing.onboarding.steps." + step + ".title")}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {t("landing.onboarding.steps." + step + ".text")}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════ 7. OPERATIONS COMMAND CENTER ══════════════════ */}
      <section className="bg-foreground py-20 text-background md:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:px-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-primary">
              {t("landing.opsCenter.badge")}
            </p>
            <h2 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
              {t("landing.opsCenter.title")}
            </h2>
            <p className="mt-5 text-base leading-8 text-background/70">
              {t("landing.opsCenter.body")}
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {[
                "landing.opsCenter.checklist.tableStatus",
                "landing.opsCenter.checklist.orderHistory",
                "landing.opsCenter.checklist.topDishes",
                "landing.opsCenter.checklist.retention",
                "landing.opsCenter.checklist.kitchenQueue",
                "landing.opsCenter.checklist.staffAttribution",
              ].map((key) => (
                <div
                  key={key}
                  className="flex items-center gap-3 rounded-2xl border border-background/10 bg-background/[0.06] p-4 text-sm font-bold text-background/80"
                >
                  <Check className="h-4 w-4 shrink-0 text-emerald-500 dark:text-emerald-400" />
                  {t(key)}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[1.75rem] border border-background/10 bg-background/[0.06] p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                [
                  "landing.opsCenter.stats.liveOrders",
                  "38",
                  "12 " + t("landing.opsCenter.stats.preparing"),
                ],
                [
                  "landing.opsCenter.stats.tablesActive",
                  "21",
                  "6 " + t("landing.opsCenter.stats.needService"),
                ],
                [
                  "landing.opsCenter.stats.payments",
                  "2.8k лв.",
                  t("landing.opsCenter.stats.today"),
                ],
              ].map(([labelKey, value, meta]) => (
                <div
                  key={labelKey}
                  className="rounded-2xl bg-background/[0.07] p-5"
                >
                  <p className="text-xs font-bold text-background/45">
                    {t(labelKey)}
                  </p>
                  <p className="mt-2 text-3xl font-black">{value}</p>
                  <p className="mt-1 text-xs font-bold text-primary">{meta}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl bg-background/[0.07] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-black">
                  {t("landing.opsCenter.kitchen.title")}
                </p>
                <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-black text-emerald-600 dark:text-emerald-400">
                  {t("landing.opsCenter.kitchen.status")}
                </span>
              </div>
              <div className="mt-5 space-y-3">
                {[
                  [
                    "#1254",
                    t("landing.dashboardMock.table", { number: 12 }),
                    "4 " + t("landing.opsCenter.kitchen.items"),
                    t("landing.opsCenter.kitchen.preparing"),
                  ],
                  [
                    "#1255",
                    t("landing.dashboardMock.table", { number: 5 }),
                    "2 " + t("landing.opsCenter.kitchen.items"),
                    t("landing.opsCenter.kitchen.ready"),
                  ],
                  [
                    "#1256",
                    t("landing.opsCenter.kitchen.takeaway"),
                    "6 " + t("landing.opsCenter.kitchen.items"),
                    t("landing.opsCenter.kitchen.new"),
                  ],
                ].map(([id, table, items, status]) => (
                  <div
                    key={id}
                    className="grid grid-cols-[64px_1fr_auto_auto] items-center gap-3 rounded-xl border border-background/10 bg-background/[0.05] px-4 py-3 text-xs"
                  >
                    <span className="font-black">{id}</span>
                    <span className="text-background/70">{table}</span>
                    <span className="text-background/55">{items}</span>
                    <span className="rounded-lg bg-background/10 px-2 py-1 font-black">
                      {status}
                    </span>
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
            <p className="text-xs font-black uppercase tracking-[0.22em] text-primary">
              {t("landing.pricingSection.badge")}
            </p>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-foreground md:text-5xl">
              {t("landing.pricingSection.title")}
            </h2>
            <p className="mt-5 text-base leading-8 text-muted-foreground">
              {t("landing.pricingSection.subtitle")}
            </p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => (
              <article
                key={plan.key}
                className={`relative flex min-h-[440px] cursor-pointer flex-col rounded-2xl border bg-card p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl ${plan.accent} ${plan.highlight ? "ring-2 ring-primary/40" : ""}`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white">
                    {plan.badge}
                  </div>
                )}
                <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
                  {plan.key}
                </p>
                <p className="mt-3 rounded-xl border border-border bg-secondary/70 px-3 py-2 text-xs font-bold leading-5 text-foreground">
                  {plan.fit}
                </p>
                <h3 className="mt-4 text-2xl font-black text-foreground">
                  {plan.name}
                </h3>
                <p className="mt-3 min-h-[56px] text-sm leading-6 text-muted-foreground">
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
                  className="mt-7 w-full cursor-pointer"
                >
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
            <p className="text-xs font-black uppercase tracking-[0.22em] text-primary">
              {t("landing.comparisonTable.badge")}
            </p>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-foreground md:text-5xl">
              {t("landing.comparisonTable.title")}
            </h2>
          </div>
          <div className="mt-10 overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
            <table className="w-full min-w-[820px]">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-muted">
                  <th className="w-[34%] px-5 py-4 text-left text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
                    {t("landing.comparisonTable.featureHeader")}
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
                    key={row.labelKey}
                    className={`border-b border-border/70 ${index % 2 ? "bg-secondary/20" : "bg-card"}`}
                  >
                    <td className="px-5 py-4 text-sm font-bold text-foreground">
                      {t(row.labelKey)}
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

      {/* ══════════════════ 9. FAQ ══════════════════ */}
      <section className="bg-background py-20 md:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-primary">
              {t("landing.faq.badge")}
            </p>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-foreground md:text-5xl">
              {t("landing.faq.title")}
            </h2>
            <p className="mt-5 text-base leading-8 text-muted-foreground">
              {t("landing.faq.subtitle")}
            </p>
          </div>
          <div className="space-y-3">
            {faqItems.map((item, idx) => (
              <div
                key={item.questionKey}
                className="rounded-2xl border border-border bg-card shadow-sm transition-all duration-300"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="flex w-full cursor-pointer items-center justify-between gap-4 p-5 text-left text-base font-black text-foreground"
                >
                  {t(item.questionKey)}
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-primary transition-transform duration-300 ${openFaq === idx ? "rotate-45" : ""}`}
                  >
                    <Plus className="h-4 w-4" />
                  </span>
                </button>
                <div
                  className={`grid transition-[grid-template-rows,opacity] duration-300 ${openFaq === idx ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                >
                  <div className="overflow-hidden">
                    <p className="px-5 pb-5 text-sm leading-7 text-muted-foreground">
                      {t(item.answerKey)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════ 10. FINAL CTA ══════════════════ */}
      <section className="relative overflow-hidden bg-foreground px-4 py-16 text-background sm:px-6 md:py-24 lg:px-8">
        <div className="relative z-10 mx-auto max-w-5xl text-center">
          <div className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-background text-foreground">
            <QrCode className="h-7 w-7" />
          </div>
          <h2 className="text-4xl font-black tracking-tight md:text-6xl">
            {t("landing.bottomCtaTitle")}
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-background/68">
            {t("landing.bottomCtaSubtitle")}
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              to="/register"
              className="inline-flex h-14 cursor-pointer items-center justify-center rounded-2xl bg-background px-8 text-sm font-black uppercase tracking-wider text-foreground transition hover:opacity-90"
            >
              {t("landing.startFreeTrial")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link
              to="/pricing"
              className="inline-flex h-14 cursor-pointer items-center justify-center rounded-2xl border border-background/20 px-8 text-sm font-black uppercase tracking-wider text-background transition hover:bg-background/10"
            >
              {t("landing.viewPricing")}
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
                <p className="text-sm font-black uppercase tracking-[0.18em] text-foreground">
                  QR Menu
                </p>
              </div>
              <p className="mt-4 max-w-xs text-sm leading-6 text-muted-foreground">
                {t("landing.footer.description")}
              </p>
            </div>

            {footerGroups.map((group) => (
              <div key={group.titleKey}>
                <h5 className="mb-4 text-xs font-black uppercase tracking-[0.18em] text-foreground">
                  {t(group.titleKey)}
                </h5>
                <div className="space-y-3">
                  {group.links.map((item) => (
                    <Link
                      key={item.labelKey}
                      to={item.to}
                      className="block text-sm text-muted-foreground transition-colors hover:text-primary"
                    >
                      {t(item.labelKey)}
                    </Link>
                  ))}
                </div>
              </div>
            ))}

            <div>
              <h5 className="mb-4 text-xs font-black uppercase tracking-[0.18em] text-foreground">
                {t("landing.footer.legal.title")}
              </h5>
              <div className="space-y-3">
                {[
                  { labelKey: "landing.footer.legal.privacy", to: "/privacy" },
                  { labelKey: "landing.footer.legal.terms", to: "/terms" },
                  { labelKey: "landing.footer.legal.cookies", to: "/cookies" },
                  { labelKey: "landing.footer.legal.gdpr", to: "/privacy" },
                ].map((item) => (
                  <Link
                    key={item.labelKey}
                    to={item.to}
                    className="block text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    {t(item.labelKey)}
                  </Link>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-8 md:flex-row">
            <span className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} QR Menu
            </span>
            <span className="text-xs text-muted-foreground">
              {t("landing.footerRights")}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
