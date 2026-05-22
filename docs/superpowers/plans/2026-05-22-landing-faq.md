# Landing Page FAQ + Dashboard Help Relocation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pre-sale FAQ accordion section to the public landing page and move the Help tab out of the dashboard primary nav into the sidebar footer.

**Architecture:** New `LandingFAQ` component in `components/landing/` using the same glass-panel/accordion pattern as the existing FAQ portion of `HelpView` but styled to match `HomePage`'s marketing aesthetic. Dashboard change is a two-line edit to `desktopNavItems` + a new `<Link>` in the sidebar footer.

**Tech Stack:** React 18, TypeScript, Tailwind v4, react-i18next, lucide-react (HelpCircle, ChevronDown icons)

---

### Task 1: Create LandingFAQ component

**Files:**
- Create: `apps/frontend/src/components/landing/LandingFAQ.tsx`

- [ ] **Step 1: Create the components/landing directory**

```bash
mkdir -p "apps/frontend/src/components/landing"
```

- [ ] **Step 2: Write the LandingFAQ component**

```tsx
import { useState } from 'react';
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
                className="group glass-panel rounded-2xl border-white/5 overflow-hidden transition-all duration-300 hover:shadow-[0_10px_30px_-10px_var(--color-accent)/0.1]"
              >
                <button
                  onClick={() => toggleFaq(faq.id)}
                  className="w-full flex items-center justify-between gap-4 p-5 md:p-6 text-left font-semibold text-sm md:text-base text-foreground cursor-pointer"
                  aria-expanded={isExpanded}
                >
                  <span className="leading-snug">{t(faq.questionKey, faq.defaultQuestion)}</span>
                  <ChevronDown
                    className={`w-5 h-5 text-muted-foreground shrink-0 transition-transform duration-300 ${
                      isExpanded ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {isExpanded && (
                  <div className="px-5 md:px-6 pb-5 md:pb-6 animate-in fade-in slide-in-from-top-2 duration-300">
                    <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                      {t(faq.answerKey, faq.defaultAnswer)}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default LandingFAQ;
```

**Note:** Use `rotating-chevron` and `animate-in` as Tailwind classes. The project already uses them in HelpView.tsx and other components.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/landing/LandingFAQ.tsx
git commit -m "feat: add LandingFAQ component with 8 pre-sale FAQ items"
```

---

### Task 2: Insert LandingFAQ into HomePage

**Files:**
- Modify: `apps/frontend/src/pages/HomePage.tsx`

- [ ] **Step 1: Add import**

Import LandingFAQ after the existing imports (after line 8):

```tsx
import LandingFAQ from '../components/landing/LandingFAQ';
```

The file currently has:
```tsx
import { useTranslation } from 'react-i18next';
```

Add below it:
```tsx
import LandingFAQ from '../components/landing/LandingFAQ';
```

- [ ] **Step 2: Insert LandingFAQ between Bottom CTA and Footer**

Replace the section break between bottom CTA and footer (around lines 347-349):

Old:
```tsx
      {/* ──────────────── FOOTER ──────────────── */}
      <footer className="relative border-t border-border py-12 px-4 sm:px-6 lg:px-8">
```

New:
```tsx
      {/* ──────────────── FAQ ──────────────── */}
      <LandingFAQ />

      {/* ──────────────── FOOTER ──────────────── */}
      <footer className="relative border-t border-border py-12 px-4 sm:px-6 lg:px-8">
```

- [ ] **Step 3: Verify the file compiles**

```bash
cd apps/frontend && npx tsc --noEmit --pretty src/pages/HomePage.tsx
```

Expected: no errors. (May show unrelated project-level errors; that's OK — we're checking just this file compiles clean.)

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/pages/HomePage.tsx
git commit -m "feat: add LandingFAQ section to home page between CTA and footer"
```

---

### Task 3: Move Help link to dashboard sidebar footer

**Files:**
- Modify: `apps/frontend/src/pages/DashboardPage.tsx`

- [ ] **Step 1: Remove 'help' from desktopNavItems array**

In `desktopNavItems` (lines 104-114), remove the `help` entry:

Old:
```tsx
  { id: 'help'       as TabId, Icon: HelpCircle,       label: t('dashboard.tabs.help'),        show: true },
```

Simply delete this line. The other items stay unchanged.

- [ ] **Step 2: Remove unused `HelpCircle` import if no longer needed in dashboard tabs**

Check: `HelpCircle` is imported on line 3 for desktop nav. After removing the help tab, `HelpCircle` is no longer used in `desktopNavItems`. But we'll reuse it for the sidebar footer link. Verify the import line stays:

```tsx
import { type LucideIcon, LayoutDashboard, ShoppingBag, Bell, Table2, Settings, BarChart2, CreditCard, ChefHat, Monitor, Upload, Utensils, HelpCircle } from 'lucide-react';
```

`HelpCircle` stays — we use it in the new sidebar link below.

- [ ] **Step 3: Add Help link in the sidebar footer**

In the desktop sidebar footer section (after the Kitchen/KDS links, before the closing `</div>` of the external-tools divider), add a Help Center link. Locate this block (around lines 196-222):

Old:
```tsx
              {/* Divider + external tool links (always visible, regardless of plan) */}
              <div className="mt-4 pt-4 border-t border-border/50 space-y-0.5">
                <Link
                  to="/dashboard/menu"
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent transition-all duration-150"
                >
                  <Utensils className="w-4 h-4 shrink-0" />
                  <span className="truncate">{t('dashboard.tabs.menuEditor')}</span>
                </Link>
                {canPos && (
                  <Link
                    to="/staff/pos"
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent transition-all duration-150"
                  >
                    <Monitor className="w-4 h-4 shrink-0" />
                    <span className="truncate">{t('dashboard.tabs.pos')}</span>
                  </Link>
                )}
                {canKds && (
                  <Link
                    to="/staff/kitchen"
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent transition-all duration-150"
                  >
                    <ChefHat className="w-4 h-4 shrink-0" />
                    <span className="truncate">{t('dashboard.tabs.kitchen')}</span>
                  </Link>
                )}
              </div>
```

Add the Help link after the canKds block:

```tsx
              {/* Divider + external tool links (always visible, regardless of plan) */}
              <div className="mt-4 pt-4 border-t border-border/50 space-y-0.5">
                <Link
                  to="/dashboard/menu"
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent transition-all duration-150"
                >
                  <Utensils className="w-4 h-4 shrink-0" />
                  <span className="truncate">{t('dashboard.tabs.menuEditor')}</span>
                </Link>
                {canPos && (
                  <Link
                    to="/staff/pos"
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent transition-all duration-150"
                  >
                    <Monitor className="w-4 h-4 shrink-0" />
                    <span className="truncate">{t('dashboard.tabs.pos')}</span>
                  </Link>
                )}
                {canKds && (
                  <Link
                    to="/staff/kitchen"
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent transition-all duration-150"
                  >
                    <ChefHat className="w-4 h-4 shrink-0" />
                    <span className="truncate">{t('dashboard.tabs.kitchen')}</span>
                  </Link>
                )}
                <Link
                  to="/dashboard?tab=help"
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent transition-all duration-150"
                >
                  <HelpCircle className="w-4 h-4 shrink-0" />
                  <span className="truncate">{t('dashboard.tabs.help')}</span>
                </Link>
              </div>
```

- [ ] **Step 4: Verify the file compiles**

```bash
cd apps/frontend && npx tsc --noEmit --pretty src/pages/DashboardPage.tsx
```

Expected: no errors from this file.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/DashboardPage.tsx
git commit -m "refactor: move Help link from dashboard tabs to sidebar footer"
```

---

### Task 4: Add i18n keys — English

**Files:**
- Modify: `apps/frontend/src/locales/en/translation.json`

- [ ] **Step 1: Add `faq` section inside `landing`**

The `landing` section ends at line 674 with `}`. Insert a `faq` block after the `tiers` closing brace and before the `landing` closing brace.

Replace the closing of `landing.tiers` and `landing`:

Old (lines 673-674):
```json
    }
  },
```

New:
```json
    },
    "faq": {
      "badge": "Got Questions?",
      "title": "Frequently Asked Questions",
      "subtitle": "Everything you need to know before getting started.",
      "q1": {
        "question": "What is QR Menu and how does it work?",
        "answer": "QR Menu turns every table into a digital ordering station. Customers scan a QR code, browse your full menu on their phone, place orders instantly, and pay by card — all from their browser. No app download, no account sign-up, no friction. Orders appear immediately in your dashboard, on the Kitchen Display, and in the Waiter POS."
      },
      "q2": {
        "question": "Do I need special hardware or printers?",
        "answer": "No special hardware required. QR Menu is fully cloud-based — you only need a standard printer (any inkjet or laser) to print QR code cards on A4 paper. We provide three print templates (Classic, Premium, Minimal) formatted for clean 2×2 grid layouts. Tablets for Waiter POS and Kitchen Display are optional. Best part: your QR codes never change — update your menu, prices, or items anytime without reprinting."
      },
      "q3": {
        "question": "How much does it cost? Are there hidden fees?",
        "answer": "Plans start at €29/month (Starter), €79/month (Pro), and €199/month (Enterprise). There are no per-order commissions and no hidden platform fees. Stripe card processing fees (1.4% + €0.25 per EU transaction) are standard and go directly to Stripe, not us. All plans are billed monthly with no lock-in contracts — cancel anytime from the Billing portal."
      },
      "q4": {
        "question": "How quickly can I go live?",
        "answer": "Most restaurants go live the same day. The setup takes under 30 minutes: create your restaurant profile, add your tables, build your menu (or import from an existing file), and print QR codes. No technical skills, no coding, no integration work needed. If you have an existing digital menu, our team can convert it for free."
      },
      "q5": {
        "question": "How do tableside payments and tipping work?",
        "answer": "Customers tap \"Request Bill\" on their phone to see an itemized bill, select a tip percentage (you set the options — e.g., 5%, 10%, 15%), and pay securely by card via Stripe Connect. The payment processes in seconds and your dashboard updates instantly. Customers can also split the bill between up to 20 people. Waiters can close tables with card payments through the POS as well."
      },
      "q6": {
        "question": "Which languages does the menu support?",
        "answer": "Your menu auto-translates to English, Bulgarian, and Romanian via DeepL — the industry-leading neural machine translation engine. Add target languages in Settings, and new menu items translate automatically. Use \"Translate All Now\" to batch-translate your entire existing menu. Customers see the menu in their browser language without changing any settings."
      },
      "q7": {
        "question": "What about customer data privacy and GDPR?",
        "answer": "QR Menu is fully GDPR-compliant. We provide cookie consent banners for your public menu page, auto-generate /privacy and /terms routes, and include a one-click \"Right to Erasure\" button that permanently deletes customer emails, transaction history, and loyalty point ledgers. Customers log in with email OTP (one-time passcodes) — no passwords are ever stored. Deleted accounts cannot be recovered, ensuring complete data removal."
      },
      "q8": {
        "question": "Can I try it before subscribing?",
        "answer": "Absolutely. Start with our free plan — it has no time limit and no credit card required. Build your digital menu, generate QR codes, and manage tables at no cost. When you are ready for advanced features like Stripe payments, loyalty programs, analytics, POS, and Kitchen Display, upgrade to a paid plan. You can upgrade or downgrade anytime."
      }
    }
  },
```

**Precision check:** The `landing` object currently ends with `"tiers": { ... }` followed by `}` then `,`. We insert `"faq": { ... }` between the `tiers` closing `}` and the `landing` closing `}`. The exact text to locate is the two closing braces at lines 673-674:

```json
    }
  },
```

Replace those two lines with the `"faq"` block shown above followed by `}` and `},` — effectively inserting `faq` as a sibling of `tiers` inside `landing`.

- [ ] **Step 2: Validate JSON**

```bash
cd apps/frontend && node -e "JSON.parse(require('fs').readFileSync('src/locales/en/translation.json','utf8')); console.log('Valid JSON')"
```

Expected: `Valid JSON`

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/locales/en/translation.json
git commit -m "feat: add landing FAQ i18n keys (English)"
```

---

### Task 5: Add i18n keys — Bulgarian

**Files:**
- Modify: `apps/frontend/src/locales/bg/translation.json`

- [ ] **Step 1: Add the same `faq` block inside `landing` in the Bulgarian locale**

Use the same insertion pattern as Task 4. Insert `"faq"` as a sibling of `"tiers"` inside `"landing"`. Translate all user-facing strings to Bulgarian:

```json
    },
    "faq": {
      "badge": "Имате въпроси?",
      "title": "Често задавани въпроси",
      "subtitle": "Всичко, което трябва да знаете преди да започнете.",
      "q1": {
        "question": "Какво е QR Menu и как работи?",
        "answer": "QR Menu превръща всяка маса в дигитална станция за поръчки. Клиентите сканират QR код, разглеждат пълното меню на телефона си, правят поръчки и плащат с карта — всичко от браузъра им. Без изтегляне на приложение, без регистрация, без затруднения. Поръчките се появяват веднага във вашето табло, на кухненския дисплей и в ПОС системата."
      },
      "q2": {
        "question": "Трябва ли ми специален хардуер или принтери?",
        "answer": "Не е необходим специален хардуер. QR Menu е изцяло облачно базиран — нужен ви е само стандартен принтер (мастиленоструен или лазерен), за да отпечатате QR кодове на хартия А4. Предлагаме три шаблона за печат (Classic, Premium, Minimal), форматирани за чисто разпределение 2×2. Таблетите за ПОС и кухненски дисплей са по избор. Най-доброто: QR кодовете никога не се променят — обновявайте менюто, цените или артикулите без препечатване."
      },
      "q3": {
        "question": "Колко струва? Има ли скрити такси?",
        "answer": "Плановете започват от €29/месец (Starter), €79/месец (Pro) и €199/месец (Enterprise). Няма комисионни на поръчка и няма скрити платформени такси. Таксите за обработка на карти през Stripe (1.4% + €0.25 на ЕС транзакция) са стандартни и отиват директно към Stripe, не към нас. Всички планове са месечни без дългосрочни договори — прекратете по всяко време."
      },
      "q4": {
        "question": "Колко бързо мога да започна?",
        "answer": "Повечето ресторанти стартират в същия ден. Настройката отнема под 30 минути: създайте профил на ресторанта, добавете масите, създайте менюто (или го импортирайте от съществуващ файл) и отпечатайте QR кодовете. Без технически умения, без програмиране, без интеграции. Ако имате съществуващо дигитално меню, нашият екип може да го конвертира безплатно."
      },
      "q5": {
        "question": "Как работят плащанията на маса и бакшишите?",
        "answer": "Клиентите натискат „Заяви сметка" на телефона си, виждат детайлна сметка, избират процент бакшиш (вие задавате опциите — напр. 5%, 10%, 15%) и плащат сигурно с карта чрез Stripe Connect. Плащането се обработва за секунди и таблото ви се обновява веднага. Клиентите могат също да разделят сметката между до 20 души. Сервитьорите също могат да приключат маси с картово плащане през ПОС."
      },
      "q6": {
        "question": "Какви езици поддържа менюто?",
        "answer": "Менюто ви се превежда автоматично на английски, български и румънски чрез DeepL — водещия двигател за невронен машинен превод. Добавете целеви езици в Настройки и новите артикули се превеждат автоматично. Използвайте „Преведи всичко сега", за да преведете цялото си съществуващо меню наведнъж. Клиентите виждат менюто на езика на браузъра си без да променят настройки."
      },
      "q7": {
        "question": "Какво относно защитата на личните данни и GDPR?",
        "answer": "QR Menu е напълно съвместим с GDPR. Предлагаме банери за съгласие за бисквитки на публичната страница на менюто, автоматично генерираме /privacy и /terms страници и включваме бутон „Право на изтриване" с едно кликване, който трайно изтрива клиентски имейли, история на транзакции и точки от програмата за лоялност. Клиентите влизат с имейл OTP (еднократни кодове) — пароли никога не се съхраняват. Изтритите акаунти не могат да бъдат възстановени."
      },
      "q8": {
        "question": "Мога ли да го изпробвам преди да се абонирам?",
        "answer": "Абсолютно. Започнете с безплатния ни план — той няма времево ограничение и не изисква кредитна карта. Създайте дигиталното си меню, генерирайте QR кодове и управлявайте масите безплатно. Когато сте готови за разширени функции като Stripe плащания, програма за лоялност, анализи, ПОС и кухненски дисплей, надградете до платен план. Можете да надграждате или понижавате по всяко време."
      }
    }
  },
```

- [ ] **Step 2: Validate JSON**

```bash
cd apps/frontend && node -e "JSON.parse(require('fs').readFileSync('src/locales/bg/translation.json','utf8')); console.log('Valid JSON')"
```

Expected: `Valid JSON`

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/locales/bg/translation.json
git commit -m "feat: add landing FAQ i18n keys (Bulgarian)"
```

---

### Task 6: Add i18n keys — Romanian

**Files:**
- Modify: `apps/frontend/src/locales/ro/translation.json`

- [ ] **Step 1: Add the same `faq` block inside `landing` in the Romanian locale**

Same insertion pattern. Translate to Romanian:

```json
    },
    "faq": {
      "badge": "Aveți întrebări?",
      "title": "Întrebări frecvente",
      "subtitle": "Tot ce trebuie să știți înainte de a începe.",
      "q1": {
        "question": "Ce este QR Menu și cum funcționează?",
        "answer": "QR Menu transformă fiecare masă într-o stație digitală de comandă. Clienții scanează un cod QR, navighează prin meniul complet pe telefon, plasează comenzi instantaneu și plătesc cu cardul — totul din browser. Fără descărcare de aplicație, fără înregistrare, fără fricțiuni. Comenzile apar imediat în panoul dvs., pe afișajul de bucătărie și în sistemul POS."
      },
      "q2": {
        "question": "Am nevoie de hardware sau imprimante speciale?",
        "answer": "Nu este necesar hardware special. QR Menu este complet bazat pe cloud — aveți nevoie doar de o imprimantă standard (inkjet sau laser) pentru a imprima cartonașe QR pe hârtie A4. Oferim trei șabloane de imprimare (Classic, Premium, Minimal) formatate pentru o distribuție curată 2×2. Tabletele pentru POS și afișajul de bucătărie sunt opționale. Cel mai bun lucru: codurile QR nu se schimbă niciodată — actualizați meniul, prețurile sau articolele fără a reimprima."
      },
      "q3": {
        "question": "Cât costă? Există taxe ascunse?",
        "answer": "Planurile încep de la 29€/lună (Starter), 79€/lună (Pro) și 199€/lună (Enterprise). Nu există comisioane pe comandă și nici taxe de platformă ascunse. Taxele de procesare a cardurilor Stripe (1,4% + 0,25€ per tranzacție UE) sunt standard și ajung direct la Stripe, nu la noi. Toate planurile sunt facturate lunar, fără contracte pe termen lung — anulați oricând din portalul de Facturare."
      },
      "q4": {
        "question": "Cât de repede pot deveni operațional?",
        "answer": "Majoritatea restaurantelor devin operaționale în aceeași zi. Configurarea durează sub 30 de minute: creați profilul restaurantului, adăugați mesele, construiți meniul (sau importați dintr-un fișier existent) și imprimați codurile QR. Fără abilități tehnice, fără programare, fără integrări. Dacă aveți deja un meniu digital, echipa noastră îl poate converti gratuit."
      },
      "q5": {
        "question": "Cum funcționează plățile la masă și bacșișul?",
        "answer": "Clienții apasă „Solicită nota" pe telefon, văd nota detaliată, selectează un procent de bacșiș (dvs. setați opțiunile — de ex. 5%, 10%, 15%) și plătesc sigur cu cardul prin Stripe Connect. Plata se procesează în secunde și panoul dvs. se actualizează instantaneu. Clienții pot împărți nota între până la 20 de persoane. Chelnerii pot închide mesele cu plată cu cardul și prin POS."
      },
      "q6": {
        "question": "Ce limbi suportă meniul?",
        "answer": "Meniul dvs. se traduce automat în engleză, bulgară și română prin DeepL — motorul de traducere neurală de top din industrie. Adăugați limbile țintă în Setări, iar articolele noi se traduc automat. Folosiți „Tradu tot acum" pentru a traduce întregul meniu existent dintr-o dată. Clienții văd meniul în limba browserului lor fără a schimba setări."
      },
      "q7": {
        "question": "Ce se întâmplă cu confidențialitatea datelor clienților și GDPR?",
        "answer": "QR Menu este complet conform cu GDPR. Oferim bannere de consimțământ pentru cookie-uri pe pagina publică a meniului, generăm automat paginile /privacy și /terms și includem un buton „Dreptul la ștergere" cu un singur clic care șterge definitiv e-mailurile clienților, istoricul tranzacțiilor și punctele de loialitate. Clienții se autentifică cu OTP prin e-mail (coduri unice) — parolele nu sunt niciodată stocate. Conturile șterse nu pot fi recuperate."
      },
      "q8": {
        "question": "Pot să-l încerc înainte de a mă abona?",
        "answer": "Absolut. Începeți cu planul nostru gratuit — nu are limită de timp și nu necesită card de credit. Construiți meniul digital, generați coduri QR și gestionați mesele gratuit. Când sunteți pregătit pentru funcții avansate precum plăți Stripe, program de loialitate, analize, POS și afișaj de bucătărie, faceți upgrade la un plan plătit. Puteți face upgrade sau downgrade oricând."
      }
    }
  },
```

- [ ] **Step 2: Validate JSON**

```bash
cd apps/frontend && node -e "JSON.parse(require('fs').readFileSync('src/locales/ro/translation.json','utf8')); console.log('Valid JSON')"
```

Expected: `Valid JSON`

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/locales/ro/translation.json
git commit -m "feat: add landing FAQ i18n keys (Romanian)"
```

---

### Task 7: Visual polish with ui-ux-pro-max

**Files:**
- May touch: `apps/frontend/src/components/landing/LandingFAQ.tsx`

- [ ] **Step 1: Run the dev server**

```bash
cd apps/frontend && npm run dev
```

Open `http://localhost:3001` and scroll to the FAQ section (below pricing CTA, above footer).

- [ ] **Step 2: Invoke ui-ux-pro-max skill**

Run: `/ui-ux-pro-max`
- Audit the FAQ accordion: animations, hover states, focus rings, color contrast
- Verify spacing/rhythm consistency with surrounding sections (Feature Showcase, Pricing, Bottom CTA)
- Check typography hierarchy (section badge, title, subtitle, question, answer)
- Test dark mode appearance
- Verify mobile responsiveness (320px, 768px, 1024px)

- [ ] **Step 3: Apply any polish changes recommended by ui-ux-pro-max**

- [ ] **Step 4: Final build verification**

```bash
cd apps/frontend && npx tsc --noEmit
npm run build
```

Expected: clean build, no errors.

- [ ] **Step 5: Commit any polish changes**

```bash
git add apps/frontend/src/components/landing/LandingFAQ.tsx
git commit -m "style: ui-ux-pro-max polish on LandingFAQ component"
```

---

### Task 8: Final verification

- [ ] **Step 1: Verify full build**

```bash
cd apps/frontend && npm run build
```

Expected: clean build.

- [ ] **Step 2: Verify dashboard**

Run dev server, log in, confirm:
- Help tab no longer appears in the desktop sidebar nav
- Help Center link appears in the sidebar footer (below Menu Editor / POS / KDS)
- Clicking the link navigates to `?tab=help` and shows the full HelpView

- [ ] **Step 3: Verify landing page**

Open `http://localhost:3001`, scroll to FAQ section:
- FAQ section appears between bottom CTA and footer
- All 8 questions display correctly
- Accordion expand/collapse works smoothly
- Content matches the language set in the browser
