import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  HelpCircle,
  ChevronDown,
  BookOpen,
  Utensils,
  QrCode,
  CreditCard,
  Award,
  Monitor,
  ShieldAlert,
  Sparkles,
  AlertTriangle,
  ChevronRight,
  Settings,
  Users,
  Star,
  ShoppingBag,
  Info,
  Coffee,
  Pizza,
  Beer,
  Wine,
  IceCream,
  MapPin,
  Phone,
  Mail,
  FileText,
  Image,
  Layout,
  Globe,
  Tag,
  Ticket,
  Zap,
  Clock,
  Calendar,
  MessageSquare,
  Lightbulb,
  GraduationCap,
  Video,
  Book,
  Bookmark,
  Compass,
  LifeBuoy,
  Wrench,
  PlayCircle,
  FileQuestion,
} from "lucide-react";

const ICON_MAP: Record<string, any> = {
  BookOpen,
  Utensils,
  QrCode,
  CreditCard,
  Award,
  Monitor,
  ShieldAlert,
  Settings,
  Users,
  Star,
  ShoppingBag,
  Info,
  HelpCircle,
  Coffee,
  Pizza,
  Beer,
  Wine,
  IceCream,
  MapPin,
  Phone,
  Mail,
  FileText,
  Image,
  Layout,
  Globe,
  Tag,
  Ticket,
  Zap,
  Clock,
  Calendar,
  MessageSquare,
  Lightbulb,
  GraduationCap,
  Video,
  Book,
  Bookmark,
  Compass,
  LifeBuoy,
  Wrench,
  PlayCircle,
  FileQuestion,
};
import { getHelpContent, type HelpContentItem } from "../../lib/api";

type HelpCategory =
  | "getting-started"
  | "menu"
  | "tables"
  | "payments"
  | "loyalty"
  | "staff"
  | "legal";

const CATEGORY_META: {
  id: HelpCategory;
  labelKey: string;
  defaultLabel: string;
  icon: any;
}[] = [
  {
    id: "getting-started",
    labelKey: "help.categories.gettingStarted",
    defaultLabel: "Getting Started",
    icon: BookOpen,
  },
  {
    id: "menu",
    labelKey: "help.categories.menu",
    defaultLabel: "Menu Builder",
    icon: Utensils,
  },
  {
    id: "tables",
    labelKey: "help.categories.tables",
    defaultLabel: "Tables & QR Codes",
    icon: QrCode,
  },
  {
    id: "payments",
    labelKey: "help.categories.payments",
    defaultLabel: "Stripe Payments",
    icon: CreditCard,
  },
  {
    id: "loyalty",
    labelKey: "help.categories.loyalty",
    defaultLabel: "Loyalty Program",
    icon: Award,
  },
  {
    id: "staff",
    labelKey: "help.categories.staff",
    defaultLabel: "POS & KDS Systems",
    icon: Monitor,
  },
  {
    id: "legal",
    labelKey: "help.categories.legal",
    defaultLabel: "Privacy & GDPR",
    icon: ShieldAlert,
  },
];

function groupBy<T>(items: T[], key: keyof T): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = String(item[key]);
    const group = map.get(k) || [];
    group.push(item);
    map.set(k, group);
  }
  return map;
}

function getGuideField(
  catItems: HelpContentItem[],
  field: string,
): string | null {
  const match = catItems.find((i) => i.itemKey === field);
  return match?.body || match?.title || null;
}

function getGuideSteps(catItems: HelpContentItem[]): string[] {
  const steps: string[] = [];
  for (let i = 0; i < 10; i++) {
    const match = catItems.find((item) => item.itemKey === `guide-step-${i}`);
    if (match) steps.push(match.body || match.title);
    else break;
  }
  return steps;
}

const HelpView = () => {
  const { t, i18n } = useTranslation();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const contentLocale = i18n.resolvedLanguage?.split(/[-_]/)[0] ?? "en";

  const { data: items = [] } = useQuery({
    queryKey: ["help-content", "dashboard", contentLocale],
    queryFn: () => getHelpContent("dashboard", contentLocale),
  });

  const activeItems = items.filter((i) => i.active);

  // Build an ordered list of category keys from the backend response
  // (which is already sorted by sortOrder ASC)
  const orderedCategoryKeys: string[] = [];
  for (const item of activeItems) {
    if (!orderedCategoryKeys.includes(item.categoryKey)) {
      orderedCategoryKeys.push(item.categoryKey);
    }
  }

  const categoriesByKey = groupBy(activeItems, "categoryKey");

  // Build display categories in the order from the database
  const DISPLAY_CATEGORIES = orderedCategoryKeys.map((k) => {
    const hardcoded = CATEGORY_META.find((c) => c.id === k);
    const metaItem = activeItems.find(
      (i) => i.categoryKey === k && i.itemKey === "category-meta",
    );
    const titleItem = activeItems.find(
      (i) => i.categoryKey === k && i.itemKey === "guide-title",
    );
    const iconName = metaItem?.title;
    const resolvedIcon =
      iconName && ICON_MAP[iconName]
        ? ICON_MAP[iconName]
        : hardcoded?.icon || BookOpen;

    return {
      id: k as (typeof CATEGORY_META)[0]["id"],
      labelKey: hardcoded ? hardcoded.labelKey : `help.categories.${k}`,
      defaultLabel:
        metaItem?.body ||
        (hardcoded
          ? hardcoded.defaultLabel
          : titleItem?.title ||
            k.charAt(0).toUpperCase() + k.slice(1).replace(/-/g, " ")),
      icon: resolvedIcon,
    };
  });

  // Default to first category with content
  const resolvedCategory =
    activeCategory && categoriesByKey.has(activeCategory)
      ? activeCategory
      : orderedCategoryKeys[0] || "getting-started";

  const activeMeta = DISPLAY_CATEGORIES.find((c) => c.id === resolvedCategory);

  // Build guide data for the active category
  const catItems = categoriesByKey.get(resolvedCategory) || [];
  const guideTitle = getGuideField(catItems, "guide-title");
  const guideDesc = getGuideField(catItems, "guide-desc");
  const guideSteps = getGuideSteps(catItems);
  const guideTip = getGuideField(catItems, "guide-tip");
  const guideWarning = getGuideField(catItems, "guide-warning");

  // FAQ items are those whose itemKey starts with 'faq-'
  const faqItems = catItems.filter((i) => i.itemKey.startsWith("faq-"));

  // Search filtering
  const searchLower = searchQuery.toLowerCase();
  const filteredFaqs = searchQuery
    ? activeItems
        .filter((i) => i.itemKey.startsWith("faq-"))
        .filter(
          (i) =>
            i.title.toLowerCase().includes(searchLower) ||
            i.body.toLowerCase().includes(searchLower),
        )
    : faqItems;

  const filteredCategoryKeys = searchQuery
    ? Array.from(
        new Set(
          activeItems
            .filter(
              (i) =>
                i.title.toLowerCase().includes(searchLower) ||
                i.body.toLowerCase().includes(searchLower),
            )
            .map((i) => i.categoryKey),
        ),
      )
    : [];

  const toggleFaq = (faqId: string) => {
    setExpandedFaq(expandedFaq === faqId ? null : faqId);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-6">
        <div>
          <h2 className="text-3xl font-display font-black text-foreground tracking-tight mb-1 flex items-center gap-3">
            <HelpCircle className="h-8 w-8 text-primary" />
            {t("help.title", "Help Center")}
          </h2>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t(
              "help.desc",
              "Find tutorials, guides, and answers to frequently asked questions.",
            )}
          </p>
        </div>

        <div className="relative w-full md:w-80">
          <input
            type="text"
            placeholder={t(
              "help.searchPlaceholder",
              "Search help guides and FAQs...",
            )}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-secondary/30 hover:bg-secondary/40 focus:bg-background border border-border/50 focus:border-primary/40 rounded-xl px-10 py-3 text-sm focus:outline-none transition-all pr-4 text-foreground placeholder:text-muted-foreground/60"
          />
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Categories sidebar navigation */}
        <aside
          className="lg:col-span-3 space-y-1.5 scrollbar-hide flex lg:flex-col overflow-x-auto pb-2 lg:pb-0 gap-2 lg:gap-0"
          aria-label={t("help.categoriesLabel", "Help categories")}
        >
          {DISPLAY_CATEGORIES.map((cat) => {
            const CatIcon = cat.icon;
            const isActive = resolvedCategory === cat.id;
            const hasContent = categoriesByKey.has(cat.id);
            const matchesSearch =
              !searchQuery || filteredCategoryKeys.includes(cat.id);
            if (!hasContent || !matchesSearch) return null;
            return (
              <button
                key={cat.id}
                onClick={() => {
                  setActiveCategory(cat.id);
                  setSearchQuery("");
                  setExpandedFaq(null);
                }}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all border cursor-pointer shrink-0 ${
                  isActive
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground border-transparent"
                }`}
              >
                <CatIcon className="w-4 h-4 shrink-0" />
                <span>{t(cat.labelKey, cat.defaultLabel)}</span>
                {isActive && (
                  <ChevronRight className="hidden lg:block ml-auto w-4 h-4" />
                )}
              </button>
            );
          })}
        </aside>

        {/* Content Panel */}
        <main className="lg:col-span-9 space-y-8">
          {/* Guides & Steps Section */}
          {activeMeta && guideTitle && !searchQuery && (
            <div className="glass-panel p-6 sm:p-8 rounded-[2rem] border-white/5 bg-gradient-to-br from-background to-secondary/10 space-y-6 animate-in fade-in duration-300">
              <div className="flex items-center gap-4 border-b border-border/30 pb-4">
                <div className="p-3 bg-primary/10 border border-primary/10 rounded-xl text-primary">
                  <activeMeta.icon className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-display font-black text-foreground">
                    {guideTitle}
                  </h3>
                  {guideDesc && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {guideDesc}
                    </p>
                  )}
                </div>
              </div>

              {/* Tutorial Steps */}
              {guideSteps.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                    {t("help.tutorialSteps", "Step-by-step Guide")}
                  </h4>
                  <ol className="space-y-4">
                    {guideSteps.map((step, idx) => (
                      <li key={idx} className="flex gap-4 items-start">
                        <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/25 flex items-center justify-center shrink-0 mt-0.5 text-primary text-xs font-black">
                          {idx + 1}
                        </div>
                        <p className="text-sm text-foreground leading-relaxed pt-0.5">
                          {step}
                        </p>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Callouts */}
              {guideTip && (
                <div className="p-5 rounded-2xl bg-primary/5 border border-primary/10 flex items-start gap-4 mt-6">
                  <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-primary">
                      {t("help.tipLabel", "Tip")}
                    </span>
                    <p className="text-sm text-foreground mt-1 leading-relaxed">
                      {guideTip}
                    </p>
                  </div>
                </div>
              )}

              {guideWarning && (
                <div className="p-5 rounded-2xl bg-orange-500/5 border border-orange-500/10 flex items-start gap-4 mt-4">
                  <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-orange-500">
                      {t("help.warningLabel", "Important")}
                    </span>
                    <p className="text-sm text-foreground mt-1 leading-relaxed">
                      {guideWarning}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Search results notice */}
          {searchQuery && (
            <div className="text-sm text-muted-foreground pl-1">
              {t(
                "help.searchResultsCount",
                '{{count}} FAQs matching "{{query}}"',
                { count: filteredFaqs.length, query: searchQuery },
              )}
            </div>
          )}

          {/* FAQ list */}
          <div className="space-y-4">
            <h3 className="text-lg font-display font-black text-foreground border-b border-border/30 pb-2">
              {searchQuery
                ? t("help.faqSearchResults", "Matching FAQs")
                : t("help.faqTitle", "Frequently Asked Questions")}
            </h3>

            {filteredFaqs.length === 0 ? (
              <div className="glass-panel p-8 text-center text-muted-foreground rounded-2xl border-white/5">
                {t(
                  "help.noFaqsFound",
                  "No FAQs matching your query. Try searching for other keywords.",
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredFaqs.map((faq) => {
                  const faqId = `${faq.categoryKey}:${faq.itemKey}`;
                  const panelId = `faq-${faqId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
                  const isExpanded = expandedFaq === faqId;
                  return (
                    <div
                      key={faqId}
                      className="glass-panel rounded-2xl border-white/5 overflow-hidden transition-all duration-300"
                    >
                      <button
                        type="button"
                        onClick={() => toggleFaq(faqId)}
                        aria-expanded={isExpanded}
                        aria-controls={panelId}
                        className="w-full flex items-center justify-between p-5 text-left font-semibold text-sm hover:bg-secondary/35 transition-colors cursor-pointer text-foreground"
                      >
                        <span>{faq.title}</span>
                        <ChevronDown
                          className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-300 ${
                            isExpanded ? "rotate-185" : ""
                          }`}
                        />
                      </button>

                      {isExpanded && (
                        <div
                          id={panelId}
                          className="p-5 pt-0 border-t border-border/20 bg-secondary/10 animate-in slide-in-from-top-2 duration-300"
                        >
                          <p className="text-sm text-muted-foreground leading-relaxed mt-4">
                            {faq.body}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default HelpView;
