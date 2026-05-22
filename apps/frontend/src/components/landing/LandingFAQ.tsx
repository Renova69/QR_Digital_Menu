import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { HelpCircle, ChevronDown } from 'lucide-react';

interface FAQItem {
  id: string;
  questionKey: string;
  answerKey: string;
  defaultQuestion: string;
  defaultAnswer: string;
}

const faqItems: FAQItem[] = [
  {
    id: 'faq-what',
    questionKey: 'landing.faq.q1.question',
    defaultQuestion: 'What is QR Menu and how does it work?',
    answerKey: 'landing.faq.q1.answer',
    defaultAnswer: 'QR Menu turns every table into a digital ordering station. Customers scan a QR code, browse your full menu on their phone, place orders instantly, and pay by card — all from their browser. No app download, no account sign-up, no friction. Orders appear immediately in your dashboard, on the Kitchen Display, and in the Waiter POS.'
  },
  {
    id: 'faq-hardware',
    questionKey: 'landing.faq.q2.question',
    defaultQuestion: 'Do I need special hardware or printers?',
    answerKey: 'landing.faq.q2.answer',
    defaultAnswer: 'No special hardware required. QR Menu is fully cloud-based — you only need a standard printer (any inkjet or laser) to print QR code cards on A4 paper. We provide three print templates (Classic, Premium, Minimal) formatted for clean 2×2 grid layouts. Tablets for Waiter POS and Kitchen Display are optional. Best part: your QR codes never change — update your menu, prices, or items anytime without reprinting.'
  },
  {
    id: 'faq-pricing',
    questionKey: 'landing.faq.q3.question',
    defaultQuestion: 'How much does it cost? Are there hidden fees?',
    answerKey: 'landing.faq.q3.answer',
    defaultAnswer: 'Plans start at €29/month (Starter), €79/month (Pro), and €199/month (Enterprise). There are no per-order commissions and no hidden platform fees. Stripe card processing fees (1.4% + €0.25 per EU transaction) are standard and go directly to Stripe, not us. All plans are billed monthly with no lock-in contracts — cancel anytime from the Billing portal.'
  },
  {
    id: 'faq-setup',
    questionKey: 'landing.faq.q4.question',
    defaultQuestion: 'How quickly can I go live?',
    answerKey: 'landing.faq.q4.answer',
    defaultAnswer: 'Most restaurants go live the same day. The setup takes under 30 minutes: create your restaurant profile, add your tables, build your menu (or import from an existing file), and print QR codes. No technical skills, no coding, no integration work needed. If you have an existing digital menu, our team can convert it for free.'
  },
  {
    id: 'faq-payments',
    questionKey: 'landing.faq.q5.question',
    defaultQuestion: 'How do tableside payments and tipping work?',
    answerKey: 'landing.faq.q5.answer',
    defaultAnswer: 'Customers tap "Request Bill" on their phone to see an itemized bill, select a tip percentage (you set the options — e.g., 5%, 10%, 15%), and pay securely by card via Stripe Connect. The payment processes in seconds and your dashboard updates instantly. Customers can also split the bill between up to 20 people. Waiters can close tables with card payments through the POS as well.'
  },
  {
    id: 'faq-languages',
    questionKey: 'landing.faq.q6.question',
    defaultQuestion: 'Which languages does the menu support?',
    answerKey: 'landing.faq.q6.answer',
    defaultAnswer: 'Your menu auto-translates to English, Bulgarian, and Romanian via DeepL — the industry-leading neural machine translation engine. Add target languages in Settings, and new menu items translate automatically. Use "Translate All Now" to batch-translate your entire existing menu. Customers see the menu in their browser language without changing any settings.'
  },
  {
    id: 'faq-gdpr',
    questionKey: 'landing.faq.q7.question',
    defaultQuestion: 'What about customer data privacy and GDPR?',
    answerKey: 'landing.faq.q7.answer',
    defaultAnswer: 'QR Menu is fully GDPR-compliant. We provide cookie consent banners for your public menu page, auto-generate /privacy and /terms routes, and include a one-click "Right to Erasure" button that permanently deletes customer emails, transaction history, and loyalty point ledgers. Customers log in with email OTP (one-time passcodes) — no passwords are ever stored. Deleted accounts cannot be recovered, ensuring complete data removal.'
  },
  {
    id: 'faq-trial',
    questionKey: 'landing.faq.q8.question',
    defaultQuestion: 'Can I try it before subscribing?',
    answerKey: 'landing.faq.q8.answer',
    defaultAnswer: 'Absolutely. Start with our free plan — it has no time limit and no credit card required. Build your digital menu, generate QR codes, and manage tables at no cost. When you are ready for advanced features like Stripe payments, loyalty programs, analytics, POS, and Kitchen Display, upgrade to a paid plan. You can upgrade or downgrade anytime.'
  }
];

const LandingFAQ = () => {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const answerRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    answerRefs.current.forEach((el, id) => {
      if (id === expandedId) {
        el.style.maxHeight = el.scrollHeight + 'px';
        el.style.opacity = '1';
      } else {
        el.style.maxHeight = '0px';
        el.style.opacity = '0';
      }
    });
  }, [expandedId]);

  const toggleFaq = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <section className="relative py-24 md:py-32 border-t border-border bg-secondary/30">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-16 md:mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-[10px] font-black uppercase tracking-[0.15em] mb-4 border border-accent/20">
            <HelpCircle className="w-3.5 h-3.5" />
            {t('landing.faq.badge', 'Got Questions?')}
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-6xl font-serif font-black text-foreground tracking-tight mb-4">
            {t('landing.faq.title', 'Frequently Asked Questions')}
          </h2>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-medium">
            {t('landing.faq.subtitle', 'Everything you need to know before getting started.')}
          </p>
        </div>

        {/* FAQ accordion */}
        <div className="space-y-3">
          {faqItems.map((faq) => {
            const isExpanded = expandedId === faq.id;
            return (
              <div
                key={faq.id}
                className="group glass-panel rounded-2xl border border-border/50 hover:border-accent/20 overflow-hidden transition-all duration-300 ease-out motion-safe:hover:shadow-[0_10px_30px_-10px_var(--color-accent)/0.1]"
              >
                <button
                  onClick={() => toggleFaq(faq.id)}
                  className="w-full flex items-center justify-between gap-4 p-5 md:p-6 text-left font-semibold text-sm md:text-base text-foreground cursor-pointer"
                  aria-expanded={isExpanded}
                >
                  <span className="leading-snug pr-4">{t(faq.questionKey, faq.defaultQuestion)}</span>
                  <ChevronDown
                    className={`w-5 h-5 shrink-0 transition-all duration-300 ease-out ${
                      isExpanded ? 'rotate-180 text-accent' : 'text-muted-foreground'
                    }`}
                  />
                </button>

                <div
                  ref={(el) => {
                    if (el) answerRefs.current.set(faq.id, el);
                  }}
                  className="overflow-hidden transition-all duration-300 ease-out"
                  style={{ maxHeight: '0px', opacity: '0' }}
                >
                  <div className="px-5 md:px-6 pb-5 md:pb-6">
                    <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                      {t(faq.answerKey, faq.defaultAnswer)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default LandingFAQ;
