import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  Printer,
  ChevronRight
} from 'lucide-react';

type HelpCategory = 'getting-started' | 'menu' | 'tables' | 'payments' | 'loyalty' | 'staff' | 'legal';

interface FAQItem {
  id: string;
  questionKey: string;
  answerKey: string;
  category: HelpCategory;
  defaultQuestion: string;
  defaultAnswer: string;
}

interface GuideItem {
  id: HelpCategory;
  icon: any;
  titleKey: string;
  defaultTitle: string;
  descKey: string;
  defaultDesc: string;
  stepsKey: string; // prefix for steps
  defaultSteps: string[];
  tipsKey?: string;
  defaultTip?: string;
  warningKey?: string;
  defaultWarning?: string;
}

const HelpView = () => {
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState<HelpCategory>('getting-started');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);

  const categories: { id: HelpCategory; labelKey: string; defaultLabel: string; icon: any }[] = [
    { id: 'getting-started', labelKey: 'help.categories.gettingStarted', defaultLabel: 'Getting Started', icon: BookOpen },
    { id: 'menu',            labelKey: 'help.categories.menu',           defaultLabel: 'Menu Builder',    icon: Utensils },
    { id: 'tables',          labelKey: 'help.categories.tables',         defaultLabel: 'Tables & QR Codes',icon: QrCode },
    { id: 'payments',        labelKey: 'help.categories.payments',       defaultLabel: 'Stripe Payments',  icon: CreditCard },
    { id: 'loyalty',         labelKey: 'help.categories.loyalty',        defaultLabel: 'Loyalty Program',  icon: Award },
    { id: 'staff',           labelKey: 'help.categories.staff',          defaultLabel: 'POS & KDS Systems',icon: Monitor },
    { id: 'legal',           labelKey: 'help.categories.legal',          defaultLabel: 'Privacy & GDPR',   icon: ShieldAlert },
  ];

  const guides: GuideItem[] = [
    {
      id: 'getting-started',
      icon: BookOpen,
      titleKey: 'help.guides.gettingStarted.title',
      defaultTitle: 'Getting Started Walkthrough',
      descKey: 'help.guides.gettingStarted.desc',
      defaultDesc: 'Set up your digital restaurant and launch tableside QR ordering in four quick steps.',
      stepsKey: 'help.guides.gettingStarted.steps',
      defaultSteps: [
        'Complete your restaurant contact information, address, and local timezone in the Settings > General tab.',
        'Create your dining tables in the Tables & QR tab to generate table-specific menu scanning URLs.',
        'Build your menu inside the Menu Editor: define food categories and add items with pricing, photos, and descriptions.',
        'Configure payment integration or loyalty settings, then display printed QR cards at your tables for customers.'
      ],
      tipsKey: 'help.guides.gettingStarted.tip',
      defaultTip: 'Verify your timezone setting! Happy hours and menu category visibility depend on your restaurant timezone.'
    },
    {
      id: 'menu',
      icon: Utensils,
      titleKey: 'help.guides.menu.title',
      defaultTitle: 'Building & Customizing Your Menu',
      descKey: 'help.guides.menu.desc',
      defaultDesc: 'Create an attractive digital catalog with drag-and-drop ordering, options, schedules, and automatic translations.',
      stepsKey: 'help.guides.menu.steps',
      defaultSteps: [
        'Add categories (e.g. Main Dishes, Soft Drinks) and drag items vertically to order them as you like.',
        'Create Item Options for variations (e.g., Rare/Medium/Well-Done steak sizes) or addons (e.g., Extra Cheese).',
        'Use Dayparting schedules to show specific categories only during certain hours (e.g., Breakfast menu from 8 AM to 11 AM).',
        'Add target translation languages in Settings. New items will automatically translate via DeepL to English, Bulgarian, or Romanian.'
      ],
      tipsKey: 'help.guides.menu.tip',
      defaultTip: 'Have existing menu items created before adding target languages? Click "Translate All Now" in settings to translate your entire menu at once.',
      warningKey: 'help.guides.menu.warning',
      defaultWarning: 'Items marked "Out of Stock" are instantly hidden from the public menu but remain editable in your dashboard.'
    },
    {
      id: 'tables',
      icon: QrCode,
      titleKey: 'help.guides.tables.title',
      defaultTitle: 'Table Setup & QR Printing',
      descKey: 'help.guides.tables.desc',
      defaultDesc: 'Add named dining tables, monitor occupied rooms in real-time, and print branded tabletop QR codes.',
      stepsKey: 'help.guides.tables.steps',
      defaultSteps: [
        'Create tables named numerically (e.g. Table 1, Table 2) or custom (e.g. Bar 1, Garden 5).',
        'Download high-resolution individual QR codes or bulk print them directly using our A4 templates.',
        'Choose a print template: Classic (standard cards), Premium (dark brackets, elegant branding), or Minimal (compact, table number only).',
        'Use the Live Table View to track occupancy: color-coded statuses indicate open sessions, unpaid bills, or waiting orders.'
      ],
      tipsKey: 'help.guides.tables.tip',
      defaultTip: 'When printing, set your browser print options to "Portrait" and check the "Print Background Graphics" checkbox so background frames print correctly.',
      warningKey: 'help.guides.tables.warning',
      defaultWarning: 'Do not manually edit the URL structure of the QR codes. They embed table names to link client orders directly to the correct tables.'
    },
    {
      id: 'payments',
      icon: CreditCard,
      titleKey: 'help.guides.payments.title',
      defaultTitle: 'Stripe Connect Tableside Payments',
      descKey: 'help.guides.payments.desc',
      defaultDesc: 'Onboard with Stripe to allow customers to request their bill, tip waiters, and pay directly from their phones.',
      stepsKey: 'help.guides.payments.steps',
      defaultSteps: [
        'Navigate to Settings > Payments and click "Connect with Stripe" to register or link your Stripe account.',
        'Set custom Tip Percentages (e.g. 5%, 10%, 15%) in settings to prompt clients during tableside checkout.',
        'Once connected, customers can request their bill from their browser, choose their tip, and pay securely using card.',
        'Monitor incoming payouts and transaction logs in the Payments tab. Platform fees are auto-deducted per transaction.'
      ],
      tipsKey: 'help.guides.payments.tip',
      defaultTip: 'Customers can calculate how to split the bill directly on the checkout screen (up to 20 people) before submitting cash/card payments.',
      warningKey: 'help.guides.payments.warning',
      defaultWarning: 'Stripe payments require an active HTTPS connection. Stripe Connect settings are only accessible by restaurant owners.'
    },
    {
      id: 'loyalty',
      icon: Award,
      titleKey: 'help.guides.loyalty.title',
      defaultTitle: 'Configuring Loyalty & VIP Tiers',
      descKey: 'help.guides.loyalty.desc',
      defaultDesc: 'Establish a gamified rewards program that awards points per purchase and unlocks custom VIP discount multipliers.',
      stepsKey: 'help.guides.loyalty.steps',
      defaultSteps: [
        'Go to Settings > Loyalty and toggle loyalty rewards active. Define point earning rates (points per € spent) and signup bonuses.',
        'Set up VIP Tier thresholds (Bronze, Silver, Gold). High-tier members automatically gain point multipliers (e.g. Gold: 1.5x points).',
        'Configure timezone-aware Happy Hours to award multipliers (e.g., 2.0x points) on food during off-peak dining periods.',
        'Points are automatically deducted on checkout when customers choose to exchange points for cash discounts or free menu items.'
      ],
      tipsKey: 'help.guides.loyalty.tip',
      defaultTip: 'The system uses accounting-grade FIFO (First-In, First-Out) calculations. Expiring customer points are automatically purged daily.',
      warningKey: 'help.guides.loyalty.warning',
      defaultWarning: 'Earning rate cashback defaults to 6.7%. We show a warning indicator if your configured cashback exceeds 15% to protect profit margins.'
    },
    {
      id: 'staff',
      icon: Monitor,
      titleKey: 'help.guides.staff.title',
      defaultTitle: 'Waiter POS & Kitchen KDS Systems',
      descKey: 'help.guides.staff.desc',
      defaultDesc: 'Equip floor staff with tableside digital order pads and kitchen cooks with real-time ticket display screens.',
      stepsKey: 'help.guides.staff.steps',
      defaultSteps: [
        'Add staff profiles in Settings > Staff. Assign credentials and secure login PINs.',
        'Waiters use the tableside POS at "/staff/pos" to rapidly select tables, browse items, type custom notes, and send tickets.',
        'Kitchen cooks monitor incoming orders in real time on the Dark OLED KDS board at "/staff/kitchen".',
        'Kitchen staff tap cards to advance tickets through Placed, In Kitchen, and Served columns, playing sound alerts on arrival.'
      ],
      tipsKey: 'help.guides.staff.tip',
      defaultTip: 'The Waiter POS cart is fully isolated in-memory. Switching tables resets pending items without interfering with customer browsers.',
      warningKey: 'help.guides.staff.warning',
      defaultWarning: 'KDS screens display elapsed timers. Tickets active for longer than 15 minutes highlight in red to indicate kitchen urgency.'
    },
    {
      id: 'legal',
      icon: ShieldAlert,
      titleKey: 'help.guides.legal.title',
      defaultTitle: 'GDPR Compliance & Customer Privacy',
      descKey: 'help.guides.legal.desc',
      defaultDesc: 'Ensure your business respects privacy regulations, displays consent notifications, and processes data deletion requests.',
      stepsKey: 'help.guides.legal.steps',
      defaultSteps: [
        'Toggle cookie consent banners in settings to notify customers on their public menu browser.',
        'Provide visible links to privacy policy pages. The platform auto-generates localized /privacy and /terms routes.',
        'Under GDPR guidelines, if a customer requests account erasure, navigate to the User Management dashboard.',
        'Use the "Purge Account / Right to Erasure" button to permanently delete customer emails, transaction lists, and point ledgers.'
      ],
      tipsKey: 'help.guides.legal.tip',
      defaultTip: 'Deleted GDPR customer accounts cannot be recovered. Ensure you verify client identity before processing erasure requests.'
    }
  ];

  const faqs: FAQItem[] = [
    {
      id: 'faq-1',
      questionKey: 'help.faqs.q1.question',
      defaultQuestion: 'How do I print QR codes without page margins cutting them off?',
      answerKey: 'help.faqs.q1.answer',
      defaultAnswer: 'When your browser print panel opens, set the layout orientation to "Portrait", set paper size to A4, and make sure "Print Background Graphics" is enabled under the advanced settings. Our Classic, Premium, and Minimal layouts are formatted to fit a 2x2 grid cleanly on standard A4 paper without overflow.',
      category: 'tables'
    },
    {
      id: 'faq-2',
      questionKey: 'help.faqs.q2.question',
      defaultQuestion: 'Why are my translated menu titles showing up blank or in English only?',
      answerKey: 'help.faqs.q2.answer',
      defaultAnswer: 'Translations occur dynamically via DeepL when menu items are saved or when target languages are configured. If you imported items or configured languages after adding items, go to Settings > Localization, check the desired languages, and click "Translate All Now". This runs a complete background batch translation on your existing database records.',
      category: 'menu'
    },
    {
      id: 'faq-3',
      questionKey: 'help.faqs.q3.question',
      defaultQuestion: 'What are the charges for using tableside Stripe card payments?',
      answerKey: 'help.faqs.q3.answer',
      defaultAnswer: 'The platform integrates using Stripe Connect. Standard card processing fees apply per transaction from Stripe. The platform also charges a configurable platform fee (e.g. 1%) which is automatically split and routed during purchase checkouts. You can disconnect your Stripe account at any time from the Payments Settings.',
      category: 'payments'
    },
    {
      id: 'faq-4',
      questionKey: 'help.faqs.q4.question',
      defaultQuestion: 'Can customers sign up for loyalty rewards without creating a password?',
      answerKey: 'help.faqs.q4.answer',
      defaultAnswer: 'Yes! The customer-facing menu uses an Email OTP (One-Time Password) system. Customers simply input their email address, receive a 6-digit verification code in their email, and input it to log in. No passwords or registration forms are required, keeping tableside ordering frictionless.',
      category: 'loyalty'
    },
    {
      id: 'faq-5',
      questionKey: 'help.faqs.q5.question',
      defaultQuestion: 'What is the difference between Waiter POS and Kitchen KDS access permissions?',
      answerKey: 'help.faqs.q5.answer',
      defaultAnswer: 'Waiter POS (/staff/pos) is optimized for floor waiters to place orders at the table. Kitchen KDS (/staff/kitchen) is optimized for cooks to track tickets in the kitchen. Both require a user account created under Settings > Staff. However, settings panels, analytics charts, and payment configurations are strictly restricted to the Owner role and cannot be opened by floor staff.',
      category: 'staff'
    },
    {
      id: 'faq-6',
      questionKey: 'help.faqs.q6.question',
      defaultQuestion: 'How can I back up my restaurant menu or migrate it to another account?',
      answerKey: 'help.faqs.q6.answer',
      defaultAnswer: 'Go to the Import/Export dashboard tab. Choose "Export Menu" to download your full menu in JSON or CSV (Excel/Numbers-compatible) formats, or copy the JSON catalog to your clipboard. You can restore this catalog on another account by uploading the exported JSON file in the "Import Menu" sub-tab.',
      category: 'menu'
    }
  ];

  const activeGuide = guides.find(g => g.id === activeCategory);

  const getLocalizedSteps = (guide: GuideItem) => {
    // Check if there are translations for steps
    const steps: string[] = [];
    for (let i = 0; i < guide.defaultSteps.length; i++) {
      const key = `${guide.stepsKey}.${i}`;
      const stepText = t(key, '');
      if (stepText) {
        steps.push(stepText);
      } else {
        steps.push(guide.defaultSteps[i]);
      }
    }
    return steps;
  };

  // Filter FAQs based on search and selected category
  const filteredFaqs = faqs.filter(faq => {
    const question = t(faq.questionKey, faq.defaultQuestion).toLowerCase();
    const answer = t(faq.answerKey, faq.defaultAnswer).toLowerCase();
    const matchesSearch = question.includes(searchQuery.toLowerCase()) || answer.includes(searchQuery.toLowerCase());
    
    // If searching, show matches from any category. Otherwise, match selected category.
    if (searchQuery) {
      return matchesSearch;
    }
    return faq.category === activeCategory;
  });

  // Filter Guides based on search
  const filteredGuides = guides.filter(guide => {
    if (!searchQuery) return true;
    const title = t(guide.titleKey, guide.defaultTitle).toLowerCase();
    const desc = t(guide.descKey, guide.defaultDesc).toLowerCase();
    return title.includes(searchQuery.toLowerCase()) || desc.includes(searchQuery.toLowerCase());
  });

  const toggleFaq = (id: string) => {
    setExpandedFaq(expandedFaq === id ? null : id);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-6">
        <div>
          <h2 className="text-3xl font-serif font-black text-foreground tracking-tight mb-1 flex items-center gap-3">
            <HelpCircle className="h-8 w-8 text-accent" />
            {t('help.title', 'Help Center')}
          </h2>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t('help.desc', 'Find tutorials, guides, and answers to frequently asked questions.')}
          </p>
        </div>
        
        {/* Local Search input */}
        <div className="relative w-full md:w-80">
          <input
            type="text"
            placeholder={t('help.searchPlaceholder', 'Search help guides and FAQs...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-secondary/30 hover:bg-secondary/40 focus:bg-background border border-border/50 focus:border-accent/40 rounded-xl px-10 py-3 text-sm focus:outline-none transition-all pr-4 text-foreground placeholder:text-muted-foreground/60"
          />
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Categories sidebar navigation */}
        <aside className="lg:col-span-3 space-y-1.5 scrollbar-hide flex lg:flex-col overflow-x-auto pb-2 lg:pb-0 gap-2 lg:gap-0" aria-label="Help Categories">
          {categories.map((cat) => {
            const CatIcon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => {
                  setActiveCategory(cat.id);
                  setSearchQuery('');
                  setExpandedFaq(null);
                }}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all border cursor-pointer shrink-0 ${
                  isActive
                    ? 'bg-accent/10 text-accent border-accent/20'
                    : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground border-transparent'
                }`}
              >
                <CatIcon className="w-4 h-4 shrink-0" />
                <span>{t(cat.labelKey, cat.defaultLabel)}</span>
                {isActive && <ChevronRight className="hidden lg:block ml-auto w-4 h-4" />}
              </button>
            );
          })}
        </aside>

        {/* Content Panel */}
        <main className="lg:col-span-9 space-y-8">
          {/* Guides & Steps Section */}
          {activeGuide && !searchQuery && (
            <div className="glass-panel p-6 sm:p-8 rounded-[2rem] border-white/5 bg-gradient-to-br from-background to-secondary/10 space-y-6 animate-in fade-in duration-300">
              <div className="flex items-center gap-4 border-b border-border/30 pb-4">
                <div className="p-3 bg-accent/10 border border-accent/10 rounded-xl text-accent">
                  <activeGuide.icon className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-serif font-black text-foreground">
                    {t(activeGuide.titleKey, activeGuide.defaultTitle)}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t(activeGuide.descKey, activeGuide.defaultDesc)}
                  </p>
                </div>
              </div>

              {/* Tutorial Steps */}
              <div className="space-y-4">
                <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                  {t('help.tutorialSteps', 'Step-by-step Guide')}
                </h4>
                <ol className="space-y-4">
                  {getLocalizedSteps(activeGuide).map((step, idx) => (
                    <li key={idx} className="flex gap-4 items-start">
                      <div className="w-6 h-6 rounded-full bg-accent/10 border border-accent/25 flex items-center justify-center shrink-0 mt-0.5 text-accent text-xs font-black">
                        {idx + 1}
                      </div>
                      <p className="text-sm text-foreground leading-relaxed pt-0.5">
                        {step}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Callouts (Tips/Warnings) */}
              {(activeGuide.tipsKey || activeGuide.defaultTip) && (
                <div className="p-5 rounded-2xl bg-accent/5 border border-accent/10 flex items-start gap-4 mt-6">
                  <Sparkles className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-accent">
                      {t('help.tipLabel', 'Tip')}
                    </span>
                    <p className="text-sm text-foreground mt-1 leading-relaxed">
                      {t(activeGuide.tipsKey!, activeGuide.defaultTip)}
                    </p>
                  </div>
                </div>
              )}

              {(activeGuide.warningKey || activeGuide.defaultWarning) && (
                <div className="p-5 rounded-2xl bg-orange-500/5 border border-orange-500/10 flex items-start gap-4 mt-4">
                  <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-orange-500">
                      {t('help.warningLabel', 'Important')}
                    </span>
                    <p className="text-sm text-foreground mt-1 leading-relaxed">
                      {t(activeGuide.warningKey!, activeGuide.defaultWarning)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Search results notice */}
          {searchQuery && (
            <div className="text-sm text-muted-foreground pl-1">
              Found {filteredGuides.length} guide categories and {filteredFaqs.length} FAQs matching "{searchQuery}"
            </div>
          )}

          {/* FAQ list */}
          <div className="space-y-4">
            <h3 className="text-lg font-serif font-black text-foreground border-b border-border/30 pb-2">
              {searchQuery 
                ? t('help.faqSearchResults', 'Matching FAQs')
                : t('help.faqTitle', 'Frequently Asked Questions')
              }
            </h3>

            {filteredFaqs.length === 0 ? (
              <div className="glass-panel p-8 text-center text-muted-foreground rounded-2xl border-white/5">
                {t('help.noFaqsFound', 'No FAQs matching your query. Try searching for other keywords.')}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredFaqs.map((faq) => {
                  const isExpanded = expandedFaq === faq.id;
                  return (
                    <div 
                      key={faq.id}
                      className="glass-panel rounded-2xl border-white/5 overflow-hidden transition-all duration-300"
                    >
                      <button
                        onClick={() => toggleFaq(faq.id)}
                        className="w-full flex items-center justify-between p-5 text-left font-semibold text-sm hover:bg-secondary/35 transition-colors cursor-pointer text-foreground"
                      >
                        <span>{t(faq.questionKey, faq.defaultQuestion)}</span>
                        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-300 ${isExpanded ? 'rotate-185' : ''}`} />
                      </button>
                      
                      {isExpanded && (
                        <div className="p-5 pt-0 border-t border-border/20 bg-secondary/10 animate-in slide-in-from-top-2 duration-300">
                          <p className="text-sm text-muted-foreground leading-relaxed mt-4">
                            {t(faq.answerKey, faq.defaultAnswer)}
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
