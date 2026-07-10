# Translation Completeness & i18n Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire every hardcoded English string in the frontend through the i18n system and populate EN/BG/RO locale files so language switching works end-to-end.

**Architecture:** Purely additive — add keys to three locale JSON files, replace string literals with `t()` calls. No new components, no routing changes, no API changes. Three phases: customer-facing pages + bugs, dashboard owner UI, global chrome + menu editor.

**Tech Stack:** React 18, react-i18next, Vite, TypeScript. Locale files at `apps/frontend/src/locales/{en,bg,ro}/translation.json`.

---

## File Map

| File                                                          | Change                                                                  |
| ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `apps/frontend/src/locales/en/translation.json`               | Add ~70 new keys across 3 phases                                        |
| `apps/frontend/src/locales/bg/translation.json`               | Same keys in Bulgarian                                                  |
| `apps/frontend/src/locales/ro/translation.json`               | Same keys in Romanian                                                   |
| `apps/frontend/src/index.css`                                 | Add `@media print` rules for QR print fix                               |
| `apps/frontend/src/pages/DashboardPage.tsx`                   | Remove duplicate language picker; move mobile nav labels to render time |
| `apps/frontend/src/pages/CheckoutPage.tsx`                    | Wire 14 loyalty strings; replace `alert()` with inline state            |
| `apps/frontend/src/pages/Dashboard/SummaryView.tsx`           | Wire 7 loyalty stat labels                                              |
| `apps/frontend/src/pages/Dashboard/AssistanceView.tsx`        | Wire `resolvedAt`                                                       |
| `apps/frontend/src/pages/Dashboard/OrdersView.tsx`            | Wire `pluckedAt`                                                        |
| `apps/frontend/src/components/tables/TableView.tsx`           | Wire `printAllQr`                                                       |
| `apps/frontend/src/pages/Dashboard/AnalyticsView.tsx`         | Wire export button and date range labels                                |
| `apps/frontend/src/pages/Dashboard/SettingsView.tsx`          | Wire ~20 loyalty + happy hour field labels                              |
| `apps/frontend/src/components/ui/BrandingEditor.tsx`          | Wire typography, theme, live preview, timezone labels                   |
| `apps/frontend/src/components/branding/ColorSchemeEditor.tsx` | Wire 4 color scheme labels                                              |
| `apps/frontend/src/components/dashboard/MenuCheckWidget.tsx`  | Wire all frontend chrome strings                                        |
| `apps/frontend/src/components/Header.tsx`                     | Wire Dashboard, Logout, Login, Get Started                              |
| `apps/frontend/src/pages/MenuEditorPage.tsx`                  | Wire Storefront Upselling, Trending Engine section                      |

---

## Phase 1 — Customer-facing pages + bugs

---

### Task 1: Add Phase 1 locale keys (all three locale files)

**Files:**

- Modify: `apps/frontend/src/locales/en/translation.json`
- Modify: `apps/frontend/src/locales/bg/translation.json`
- Modify: `apps/frontend/src/locales/ro/translation.json`

- [ ] **Step 1: Add keys to EN locale**

Open `apps/frontend/src/locales/en/translation.json`. Add the following keys:

In `"publicMenu"` object, add after `"addedToCart"`:

```json
"language": "Language",
"logout": "Logout",
"trendingNow": "Trending Now"
```

Replace `"checkout"` object entirely:

```json
"checkout": {
  "title": "Your Order",
  "back": "← Back to Menu",
  "orderSummary": "Order Summary",
  "name": "Name",
  "phone": "Phone Number",
  "phoneOptional": "Optional",
  "specialRequests": "Special Requests",
  "specialPlaceholder": "Allergies, special instructions, etc.",
  "table": "Table",
  "notSpecified": "Not specified",
  "submitting": "Submitting Order...",
  "placeOrder": "Place Order",
  "tableRequired": "Table number is required. Please scan the QR code again.",
  "failedSubmit": "Failed to submit order. Please try again.",
  "loyaltyPoints": "Loyalty Points",
  "pointsAvailable": "You have {{count}} points available (Value: EUR {{value}})",
  "redeemForDiscount": "Redeem points for discount",
  "discountApplied": "Discount applied:",
  "finalTotal": "Final Total:",
  "willEarn": "You will earn {{pts}} pts",
  "happyHourBonus": "⚡ Happy Hour: {{multiplier}}x Points",
  "redeemedFree": "Redeemed Free",
  "redeemForPts": "Redeem for {{pts}} pts",
  "notEnoughPoints": "Not enough points to redeem this item",
  "earnFreeFood": "Want to earn free food?",
  "signInToEarn": "Sign in to earn points on this order.",
  "signIn": "Sign In / Join",
  "free": "FREE"
}
```

Add a top-level `"common"` key (anywhere at root level):

```json
"common": {
  "pleaseLogin": "Please log in to continue"
}
```

- [ ] **Step 2: Add keys to BG locale**

Open `apps/frontend/src/locales/bg/translation.json`. Make the same structural additions with Bulgarian values:

In `"publicMenu"`, add after `"addedToCart"`:

```json
"language": "Език",
"logout": "Изход",
"trendingNow": "Популярно сега"
```

Replace `"checkout"` object entirely:

```json
"checkout": {
  "title": "Вашата поръчка",
  "back": "← Обратно към менюто",
  "orderSummary": "Резюме на поръчката",
  "name": "Име",
  "phone": "Телефон",
  "phoneOptional": "По избор",
  "specialRequests": "Специални изисквания",
  "specialPlaceholder": "Алергии, инструкции и др.",
  "table": "Маса",
  "notSpecified": "Не е посочена",
  "submitting": "Изпращане...",
  "placeOrder": "Поръчай",
  "tableRequired": "Номерът на масата е задължителен. Моля сканирайте QR кода отново.",
  "failedSubmit": "Неуспешна поръчка. Моля опитайте отново.",
  "loyaltyPoints": "Точки за лоялност",
  "pointsAvailable": "Имате {{count}} точки (Стойност: EUR {{value}})",
  "redeemForDiscount": "Използвай точки за отстъпка",
  "discountApplied": "Приложена отстъпка:",
  "finalTotal": "Крайна сума:",
  "willEarn": "Ще спечелите {{pts}} точки",
  "happyHourBonus": "⚡ Happy Hour: {{multiplier}}x точки",
  "redeemedFree": "Осребрено безплатно",
  "redeemForPts": "Осребри за {{pts}} точки",
  "notEnoughPoints": "Недостатъчно точки за осребряване",
  "earnFreeFood": "Искате безплатна храна?",
  "signInToEarn": "Влезте, за да спечелите точки.",
  "signIn": "Вход / Регистрация",
  "free": "БЕЗПЛАТНО"
}
```

Add `"common"`:

```json
"common": {
  "pleaseLogin": "Моля влезте в акаунта си"
}
```

- [ ] **Step 3: Add keys to RO locale**

Open `apps/frontend/src/locales/ro/translation.json`. Make the same structural additions with Romanian values:

In `"publicMenu"`, add after `"addedToCart"`:

```json
"language": "Limbă",
"logout": "Deconectare",
"trendingNow": "În tendințe"
```

Replace `"checkout"` object entirely:

```json
"checkout": {
  "title": "Comanda dvs.",
  "back": "← Înapoi la meniu",
  "orderSummary": "Rezumat Comandă",
  "name": "Nume",
  "phone": "Număr Telefon",
  "phoneOptional": "Opțional",
  "specialRequests": "Cereri Speciale",
  "specialPlaceholder": "Alergii, instrucțiuni, etc.",
  "table": "Masa",
  "notSpecified": "Nespecificat",
  "submitting": "Se trimite comanda...",
  "placeOrder": "Plasează Comanda",
  "tableRequired": "Numărul mesei este obligatoriu. Vă rugăm să scanați codul QR.",
  "failedSubmit": "Comanda a eșuat. Vă rugăm să încercați din nou.",
  "loyaltyPoints": "Puncte de loialitate",
  "pointsAvailable": "Aveți {{count}} puncte disponibile (Valoare: EUR {{value}})",
  "redeemForDiscount": "Folosiți puncte pentru reducere",
  "discountApplied": "Reducere aplicată:",
  "finalTotal": "Total final:",
  "willEarn": "Veți câștiga {{pts}} puncte",
  "happyHourBonus": "⚡ Happy Hour: {{multiplier}}x Puncte",
  "redeemedFree": "Răscumpărat gratuit",
  "redeemForPts": "Răscumpără pentru {{pts}} puncte",
  "notEnoughPoints": "Puncte insuficiente pentru această răscumpărare",
  "earnFreeFood": "Vrei mâncare gratuită?",
  "signInToEarn": "Conectați-vă pentru a câștiga puncte.",
  "signIn": "Conectare / Înregistrare",
  "free": "GRATUIT"
}
```

Add `"common"`:

```json
"common": {
  "pleaseLogin": "Vă rugăm să vă conectați"
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/locales/en/translation.json apps/frontend/src/locales/bg/translation.json apps/frontend/src/locales/ro/translation.json
git commit -m "i18n: add Phase 1 locale keys (checkout loyalty, publicMenu, common)"
```

---

### Task 2: Fix duplicate language picker

**Files:**

- Modify: `apps/frontend/src/pages/DashboardPage.tsx`

- [ ] **Step 1: Remove the language picker block from DashboardPage**

In `DashboardPage.tsx`, find the outer `<div className="flex flex-wrap items-center gap-3 md:gap-4">` block (around line 95). It contains two children: the language picker `<div>` and the "View Public Menu" `<a>`. Remove only the language picker child. The result should be:

```tsx
<div className="flex flex-wrap items-center gap-3 md:gap-4">
  {activeRestaurant && (
    <a
      href={`/menu/public/${activeRestaurant.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative bg-foreground text-background px-5 md:px-8 py-3 md:py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all shadow-2xl hover:shadow-[0_20px_40px_-10px_var(--color-primary)] hover:-translate-y-1 flex items-center gap-2 md:gap-3 overflow-hidden"
    >
      <span className="relative z-10">{t("dashboard.viewPublicMenu")}</span>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-4 w-4 relative z-10 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={3}
          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
        />
      </svg>
      <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    </a>
  )}
</div>
```

Also remove the now-unused `handleLanguageChange` function and the `Globe` import if it is no longer referenced anywhere else in the file.

- [ ] **Step 2: Verify**

Run the frontend dev server (`npm run dev` in `apps/frontend`). Open `http://localhost:3001/dashboard`. Confirm only one language picker appears — in the top navigation bar, not on the page itself.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/DashboardPage.tsx
git commit -m "fix: remove duplicate language picker from DashboardPage"
```

---

### Task 3: Fix QR print layout

**Files:**

- Modify: `apps/frontend/src/index.css`

- [ ] **Step 1: Add print CSS to index.css**

Open `apps/frontend/src/index.css`. At the very end of the file, add:

```css
@media print {
  body {
    visibility: hidden;
  }
  .print-container,
  .print-container * {
    visibility: visible;
  }
  .print-container {
    position: fixed;
    left: 0;
    top: 0;
    width: 100%;
    background: white;
  }
}
```

This works because `PrintableQRCodes` already has `className="... print-container"`. The `visibility: hidden` on `body` hides all page chrome, then `visibility: visible` on `.print-container` and its descendants makes only the QR sheet visible.

- [ ] **Step 2: Verify**

In the browser at `http://localhost:3001/dashboard`, go to the Tables & QR tab. Add at least one table if none exist. Click "Print All QR Codes". Open the browser print preview. Confirm: only the QR code cards appear, no site header/sidebar/navigation.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/index.css
git commit -m "fix: print only QR codes using visibility @media print"
```

---

### Task 4: Wire CheckoutPage loyalty strings

**Files:**

- Modify: `apps/frontend/src/pages/CheckoutPage.tsx`

- [ ] **Step 1: Add notEnoughPointsError state**

After the existing `const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);` line, add:

```tsx
const [notEnoughPointsError, setNotEnoughPointsError] = useState(false);
```

- [ ] **Step 2: Replace alert() with state setter**

Find this block (around line 285–292):

```tsx
} else {
  alert("Not enough points to redeem this item.");
}
```

Replace with:

```tsx
} else {
  setNotEnoughPointsError(true);
  setTimeout(() => setNotEnoughPointsError(false), 3000);
}
```

- [ ] **Step 3: Wire the item redeem button label**

Find lines 300–302:

```tsx
{
  redeemedItemIds.includes(item.id)
    ? "Redeemed Free"
    : `Redeem for ${(item as any).rewardPointsPrice * item.quantity} pts`;
}
```

Replace with:

```tsx
{
  redeemedItemIds.includes(item.id)
    ? t("checkout.redeemedFree")
    : t("checkout.redeemForPts", {
        pts: (item as any).rewardPointsPrice * item.quantity,
      });
}
```

- [ ] **Step 4: Add inline error message below redeem button**

After the closing `</button>` tag for the redeem button (around line 303), add:

```tsx
{
  notEnoughPointsError && (
    <p className="text-red-500 text-xs mt-1">{t("checkout.notEnoughPoints")}</p>
  );
}
```

- [ ] **Step 5: Wire "FREE" label**

Find line 308:

```tsx
? "FREE"
```

Replace with:

```tsx
? t('checkout.free')
```

- [ ] **Step 6: Wire the loyalty points section heading and available points**

Find around line 325:

```tsx
<p className="font-bold text-accent">Loyalty Points</p>
<p className="text-sm text-accent/80">
  You have {getAvailableLoyaltyPoints()} points available
  (Value: EUR {getAvailableRewardValue().toFixed(2)}).
</p>
```

Replace with:

```tsx
<p className="font-bold text-accent">{t('checkout.loyaltyPoints')}</p>
<p className="text-sm text-accent/80">
  {t('checkout.pointsAvailable', {
    count: getAvailableLoyaltyPoints(),
    value: getAvailableRewardValue().toFixed(2)
  })}
</p>
```

- [ ] **Step 7: Wire "Redeem points for discount" toggle label**

Find around line 335:

```tsx
<span className="text-sm font-bold text-foreground">
  Redeem points for discount
</span>
```

Replace with:

```tsx
<span className="text-sm font-bold text-foreground">
  {t("checkout.redeemForDiscount")}
</span>
```

- [ ] **Step 8: Wire "Discount applied:" line**

Find around line 375:

```tsx
<span>Discount applied:</span>
```

Replace with:

```tsx
<span>{t("checkout.discountApplied")}</span>
```

- [ ] **Step 9: Wire "Final Total:" line**

Find around line 384:

```tsx
<span>Final Total:</span>
```

Replace with:

```tsx
<span>{t("checkout.finalTotal")}</span>
```

- [ ] **Step 10: Wire Happy Hour bonus line**

Find around line 396:

```tsx
⚡ Happy Hour: {hhMultiplier}x Points
```

Replace with:

```tsx
{
  t("checkout.happyHourBonus", { multiplier: hhMultiplier });
}
```

- [ ] **Step 11: Wire "You will earn" line**

Find around line 400–414 the `<p>` that starts with `"You will earn"`. Replace the whole `<p>` with:

```tsx
<p className="text-sm text-muted-foreground text-right font-medium">
  {t("checkout.willEarn", {
    pts: Math.floor(
      (getCheckoutTotal() - getPointsDiscount()) *
        exchangeRate *
        finalMultiplier,
    ),
  })}
  {finalMultiplier > 1 && (
    <span className="ml-1 text-xs text-accent/70">({finalMultiplier}x)</span>
  )}
</p>
```

- [ ] **Step 12: Wire the guest sign-in promo block**

Find around lines 423–435:

```tsx
<p className="font-bold text-foreground">
  Want to earn free food?
</p>
<p className="text-sm text-muted-foreground">
  Sign in to earn points on this order.
</p>
```

And the button:

```tsx
Sign In / Join
```

Replace with:

```tsx
<p className="font-bold text-foreground">
  {t('checkout.earnFreeFood')}
</p>
<p className="text-sm text-muted-foreground">
  {t('checkout.signInToEarn')}
</p>
```

And:

```tsx
{
  t("checkout.signIn");
}
```

- [ ] **Step 13: Verify**

Navigate to public menu, add items to cart, proceed to checkout. Switch language to BG. Confirm all loyalty strings show in Bulgarian.

- [ ] **Step 14: Commit**

```bash
git add apps/frontend/src/pages/CheckoutPage.tsx
git commit -m "i18n: wire checkout loyalty strings and replace alert() with inline error"
```

---

## Phase 2 — Dashboard owner UI

---

### Task 5: Add Phase 2 locale keys (all three locale files)

**Files:**

- Modify: `apps/frontend/src/locales/en/translation.json`
- Modify: `apps/frontend/src/locales/bg/translation.json`
- Modify: `apps/frontend/src/locales/ro/translation.json`

- [ ] **Step 1: Add keys to EN locale**

Add the following to `apps/frontend/src/locales/en/translation.json`:

In `"summary"` object (add it as a new top-level key):

```json
"summary": {
  "statusSnapshot": "Status Snapshot",
  "loyaltyProgramPerformance": "Loyalty Program Performance",
  "totalVipMembers": "Total VIP Members",
  "pointsRedeemed": "Points Redeemed",
  "freebiesIssued": "Freebies & Discounts Issued",
  "pointsOutstandingLiability": "Points Outstanding Liability",
  "unspentCustomerPoints": "Unspent Customer Points"
}
```

In `"orders"` object, add after `"noOrders"`:

```json
"pluckedAt": "Placed {{time}}"
```

In `"assistance"` object, add after `"showMore"`:

```json
"resolvedAt": "Resolved {{time}}"
```

In `"tables"` object, add after `"loadingTables"`:

```json
"printAllQr": "Print All QR Codes"
```

In `"analytics"` object, add after `"days30"`:

```json
"export": "Export",
"categoryBreakdown": "Category Breakdown",
"topTables": "Top Tables by Revenue",
"dateFrom": "From",
"dateTo": "To"
```

Add top-level `"menuCheck"`:

```json
"menuCheck": {
  "title": "Menu Health",
  "subtitle": "AI-powered audit to optimize your menu",
  "rescan": "Rescan",
  "fix": "Fix",
  "perfectScore": "Perfect Score!",
  "perfectScoreDesc": "Your menu is fully optimized and ready to convert customers.",
  "critical": "{{count}} Critical",
  "warnings": "{{count}} Warnings",
  "suggestions": "{{count}} Suggestions",
  "itemIssue": "Item Issue",
  "categoryIssue": "Category Issue",
  "fieldLabel": "Field: {{field}}"
}
```

Add top-level `"loyaltySettings"`:

```json
"loyaltySettings": {
  "sectionTitle": "Loyalty & Rewards Program",
  "enableLoyalty": "Enable Loyalty Program",
  "enableLoyaltyDesc": "Allow customers to earn and spend points on orders.",
  "signupBonus": "Sign-up Bonus Points",
  "signupBonusDesc": "Awarded on first order. Capped at 75 pts server-side.",
  "earnRate": "Earn Rate (pts per €1)",
  "earnRateDesc": "Points earned per €1 spent. e.g. 10 pts/€ on a €10 order = 100 pts.",
  "redeemRate": "Redeem Rate (pts to earn €1)",
  "redeemRateDesc": "Points needed for €1 discount. Higher = less generous for customers.",
  "cashbackInfo": "Effective cashback rate: {{pct}}%",
  "cashbackWarning": "⚠ High — check earn rate is pts/€, not €/pt",
  "expiryDays": "Point Expiry (days)",
  "expiryDaysDesc": "Default 90 days. Keeps liability manageable.",
  "reminderDays": "Expiry Reminder Lead Time (days)",
  "reminderDaysDesc": "Default 15 days before expiry. Triggers daily reminder job.",
  "vipTiers": "VIP Tiers",
  "vipTiersDesc": "Based on lifetime points spent. Higher tiers earn points faster.",
  "silverThreshold": "🥈 Silver threshold (pts)",
  "goldThreshold": "🥇 Gold threshold (pts)",
  "silverMultiplier": "🥈 Silver multiplier",
  "goldMultiplier": "🥇 Gold multiplier",
  "silverMustBeLower": "Silver threshold must be lower than Gold threshold.",
  "happyHour": "Happy Hour (Gamification)",
  "happyHourDesc": "Fires at the restaurant's local time (set timezone above).",
  "happyHourStart": "Start Time",
  "happyHourEnd": "End Time",
  "happyHourEndDesc": "End before start = overnight range (e.g. 22:00–02:00).",
  "happyHourMultiplier": "Points Multiplier"
}
```

Add to `"branding"` object:

```json
"typography": "Typography",
"headingFont": "Heading Font",
"bodyFont": "Body Font",
"colorScheme": "Color Scheme",
"menuBackground": "Menu Background",
"textColor": "Text Color",
"cardBackground": "Card Background",
"buttonAccent": "Button / Accent",
"defaultTheme": "Default Customer Theme",
"defaultThemeDesc": "Customers see this mode when they first scan the QR code. They can still toggle it.",
"livePreview": "Live Preview",
"restaurantTimezone": "Restaurant Timezone",
"restaurantTimezoneDesc": "Used for automated menu scheduling."
```

- [ ] **Step 2: Add keys to BG locale**

Apply all the same keys to `apps/frontend/src/locales/bg/translation.json` with Bulgarian translations:

`"summary"`:

```json
"summary": {
  "statusSnapshot": "Моментна снимка",
  "loyaltyProgramPerformance": "Ефективност на програмата за лоялност",
  "totalVipMembers": "Общо VIP членове",
  "pointsRedeemed": "Осребрени точки",
  "freebiesIssued": "Издадени безплатни продукти и отстъпки",
  "pointsOutstandingLiability": "Задължения по точки",
  "unspentCustomerPoints": "Неизползвани точки на клиенти"
}
```

`"orders"` addition:

```json
"pluckedAt": "Направена в {{time}}"
```

`"assistance"` addition:

```json
"resolvedAt": "Приключено в {{time}}"
```

`"tables"` addition:

```json
"printAllQr": "Отпечатай всички QR кодове"
```

`"analytics"` additions:

```json
"export": "Експорт",
"categoryBreakdown": "Разбивка по категории",
"topTables": "Топ маси по приход",
"dateFrom": "От",
"dateTo": "До"
```

`"menuCheck"`:

```json
"menuCheck": {
  "title": "Здраве на менюто",
  "subtitle": "AI одит за оптимизация на менюто",
  "rescan": "Преодит",
  "fix": "Поправи",
  "perfectScore": "Перфектен резултат!",
  "perfectScoreDesc": "Менюто ви е напълно оптимизирано и готово за клиенти.",
  "critical": "{{count}} Критични",
  "warnings": "{{count}} Предупреждения",
  "suggestions": "{{count}} Предложения",
  "itemIssue": "Проблем с артикул",
  "categoryIssue": "Проблем с категория",
  "fieldLabel": "Поле: {{field}}"
}
```

`"loyaltySettings"`:

```json
"loyaltySettings": {
  "sectionTitle": "Програма за лоялност и награди",
  "enableLoyalty": "Активиране на програмата за лоялност",
  "enableLoyaltyDesc": "Позволете на клиентите да спечелят и изразходват точки.",
  "signupBonus": "Бонус точки при регистрация",
  "signupBonusDesc": "Присъжда се при първа поръчка. Максимум 75 т.",
  "earnRate": "Курс на спечелване (т. за €1)",
  "earnRateDesc": "Точки за €1 изразходвани. напр. 10 т/€ на €10 = 100 т.",
  "redeemRate": "Курс на осребряване (т. за €1 отстъпка)",
  "redeemRateDesc": "Точки за €1 отстъпка. По-висок = по-малко изгоден за клиенти.",
  "cashbackInfo": "Ефективен кешбек: {{pct}}%",
  "cashbackWarning": "⚠ Висок — проверете курса",
  "expiryDays": "Срок на валидност на точките (дни)",
  "expiryDaysDesc": "По подразбиране 90 дни.",
  "reminderDays": "Напомняне преди изтичане (дни)",
  "reminderDaysDesc": "По подразбиране 15 дни преди изтичане.",
  "vipTiers": "VIP нива",
  "vipTiersDesc": "Базирани на изразходвани точки за целия период.",
  "silverThreshold": "🥈 Праг Сребро (т.)",
  "goldThreshold": "🥇 Праг Злато (т.)",
  "silverMultiplier": "🥈 Множител Сребро",
  "goldMultiplier": "🥇 Множител Злато",
  "silverMustBeLower": "Прагът за Сребро трябва да е по-нисък от Злато.",
  "happyHour": "Happy Hour (Геймификация)",
  "happyHourDesc": "Задейства се в местното часово на ресторанта.",
  "happyHourStart": "Начален час",
  "happyHourEnd": "Краен час",
  "happyHourEndDesc": "Край преди начало = нощен диапазон (напр. 22:00–02:00).",
  "happyHourMultiplier": "Множител на точките"
}
```

`"branding"` additions:

```json
"typography": "Типография",
"headingFont": "Заглавен шрифт",
"bodyFont": "Основен шрифт",
"colorScheme": "Цветова схема",
"menuBackground": "Фон на менюто",
"textColor": "Цвят на текста",
"cardBackground": "Фон на карти",
"buttonAccent": "Бутон / Акцент",
"defaultTheme": "Тема по подразбиране за клиенти",
"defaultThemeDesc": "Клиентите виждат този режим при първото сканиране. Могат да го сменят.",
"livePreview": "Преглед на живо",
"restaurantTimezone": "Часова зона на ресторанта",
"restaurantTimezoneDesc": "Използва се за автоматично планиране на менюто."
```

- [ ] **Step 3: Add keys to RO locale**

Apply all keys to `apps/frontend/src/locales/ro/translation.json` with Romanian translations:

`"summary"`:

```json
"summary": {
  "statusSnapshot": "Instantaneu Status",
  "loyaltyProgramPerformance": "Performanța programului de loialitate",
  "totalVipMembers": "Total Membri VIP",
  "pointsRedeemed": "Puncte Răscumpărate",
  "freebiesIssued": "Produse Gratuite și Reduceri Emise",
  "pointsOutstandingLiability": "Obligații Puncte",
  "unspentCustomerPoints": "Puncte Necheltuuite ale Clienților"
}
```

`"orders"` addition:

```json
"pluckedAt": "Plasată la {{time}}"
```

`"assistance"` addition:

```json
"resolvedAt": "Rezolvat la {{time}}"
```

`"tables"` addition:

```json
"printAllQr": "Tipărește toate codurile QR"
```

`"analytics"` additions:

```json
"export": "Export",
"categoryBreakdown": "Defalcare pe Categorii",
"topTables": "Top Mese după Venit",
"dateFrom": "De la",
"dateTo": "Până la"
```

`"menuCheck"`:

```json
"menuCheck": {
  "title": "Sănătatea Meniului",
  "subtitle": "Audit AI pentru optimizarea meniului",
  "rescan": "Reaudit",
  "fix": "Remediați",
  "perfectScore": "Scor Perfect!",
  "perfectScoreDesc": "Meniul dvs. este complet optimizat și gata pentru clienți.",
  "critical": "{{count}} Critice",
  "warnings": "{{count}} Avertismente",
  "suggestions": "{{count}} Sugestii",
  "itemIssue": "Problemă articol",
  "categoryIssue": "Problemă categorie",
  "fieldLabel": "Câmp: {{field}}"
}
```

`"loyaltySettings"`:

```json
"loyaltySettings": {
  "sectionTitle": "Program de Loialitate și Recompense",
  "enableLoyalty": "Activare Program de Loialitate",
  "enableLoyaltyDesc": "Permiteți clienților să câștige și să cheltuiască puncte.",
  "signupBonus": "Puncte Bonus la Înregistrare",
  "signupBonusDesc": "Acordat la prima comandă. Maxim 75 puncte.",
  "earnRate": "Rată Câștig (pts per €1)",
  "earnRateDesc": "Puncte câștigate per €1 cheltuiți.",
  "redeemRate": "Rată Răscumpărare (pts per €1 reducere)",
  "redeemRateDesc": "Puncte necesare pentru €1 reducere.",
  "cashbackInfo": "Rată cashback efectivă: {{pct}}%",
  "cashbackWarning": "⚠ Ridicat — verificați rata",
  "expiryDays": "Expirare Puncte (zile)",
  "expiryDaysDesc": "Implicit 90 de zile.",
  "reminderDays": "Timp Avertizare Expirare (zile)",
  "reminderDaysDesc": "Implicit 15 zile înainte de expirare.",
  "vipTiers": "Niveluri VIP",
  "vipTiersDesc": "Bazat pe punctele cheltuite pe viață.",
  "silverThreshold": "🥈 Prag Argint (pts)",
  "goldThreshold": "🥇 Prag Aur (pts)",
  "silverMultiplier": "🥈 Multiplicator Argint",
  "goldMultiplier": "🥇 Multiplicator Aur",
  "silverMustBeLower": "Pragul Argint trebuie să fie mai mic decât Aur.",
  "happyHour": "Happy Hour (Gamification)",
  "happyHourDesc": "Se declanșează la ora locală a restaurantului.",
  "happyHourStart": "Ora de Început",
  "happyHourEnd": "Ora de Sfârșit",
  "happyHourEndDesc": "Sfârșit înainte de început = interval nocturn.",
  "happyHourMultiplier": "Multiplicator Puncte"
}
```

`"branding"` additions:

```json
"typography": "Tipografie",
"headingFont": "Font Titlu",
"bodyFont": "Font Corp",
"colorScheme": "Schemă Culori",
"menuBackground": "Fundal Meniu",
"textColor": "Culoare Text",
"cardBackground": "Fundal Card",
"buttonAccent": "Buton / Accent",
"defaultTheme": "Tema Implicită pentru Clienți",
"defaultThemeDesc": "Clienții văd acest mod la prima scanare. Îl pot schimba.",
"livePreview": "Previzualizare Live",
"restaurantTimezone": "Fus Orar Restaurant",
"restaurantTimezoneDesc": "Utilizat pentru programarea automată a meniului."
```

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/locales/en/translation.json apps/frontend/src/locales/bg/translation.json apps/frontend/src/locales/ro/translation.json
git commit -m "i18n: add Phase 2 locale keys (summary, orders, analytics, menuCheck, loyaltySettings, branding)"
```

---

### Task 6: Wire SummaryView

**Files:**

- Modify: `apps/frontend/src/pages/Dashboard/SummaryView.tsx`

- [ ] **Step 1: Wire Status Snapshot label**

Find line 52:

```tsx
Status Snapshot
```

Replace with:

```tsx
{
  t("summary.statusSnapshot");
}
```

- [ ] **Step 2: Wire Loyalty Program Performance heading**

Find line 115:

```tsx
Loyalty Program Performance
```

Replace with:

```tsx
{
  t("summary.loyaltyProgramPerformance");
}
```

- [ ] **Step 3: Wire Total VIP Members label**

Find:

```tsx
Total VIP Members
```

Replace with:

```tsx
{
  t("summary.totalVipMembers");
}
```

- [ ] **Step 4: Wire Points Redeemed label**

Find:

```tsx
Points Redeemed
```

Replace with:

```tsx
{
  t("summary.pointsRedeemed");
}
```

- [ ] **Step 5: Wire Freebies & Discounts Issued label**

Find:

```tsx
Freebies & Discounts Issued
```

Replace with:

```tsx
{
  t("summary.freebiesIssued");
}
```

- [ ] **Step 6: Wire Points Outstanding Liability label**

Find:

```tsx
Points Outstanding Liability
```

Replace with:

```tsx
{
  t("summary.pointsOutstandingLiability");
}
```

- [ ] **Step 7: Wire Unspent Customer Points label**

Find:

```tsx
Unspent Customer Points
```

Replace with:

```tsx
{
  t("summary.unspentCustomerPoints");
}
```

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/pages/Dashboard/SummaryView.tsx
git commit -m "i18n: wire SummaryView loyalty stat labels"
```

---

### Task 7: Wire AssistanceView and OrdersView timestamps

**Files:**

- Modify: `apps/frontend/src/pages/Dashboard/AssistanceView.tsx`
- Modify: `apps/frontend/src/pages/Dashboard/OrdersView.tsx`

- [ ] **Step 1: Wire AssistanceView resolved timestamp**

In `AssistanceView.tsx`, find line 93:

```tsx
<p className="font-serif font-black text-foreground uppercase tracking-tight">
  Resolved {new Date(request.updatedAt).toLocaleTimeString()}
</p>
```

Replace with:

```tsx
<p className="font-serif font-black text-foreground uppercase tracking-tight">
  {t("assistance.resolvedAt", {
    time: new Date(request.updatedAt).toLocaleTimeString(),
  })}
</p>
```

- [ ] **Step 2: Wire OrdersView plucked timestamp**

In `OrdersView.tsx`, find line 70:

```tsx
<span className="text-[11px] text-muted-foreground font-bold uppercase tracking-[0.1em] opacity-60">
  Plucked {new Date(order.createdAt).toLocaleTimeString()}
</span>
```

Replace with:

```tsx
<span className="text-[11px] text-muted-foreground font-bold uppercase tracking-[0.1em] opacity-60">
  {t("orders.pluckedAt", {
    time: new Date(order.createdAt).toLocaleTimeString(),
  })}
</span>
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/Dashboard/AssistanceView.tsx apps/frontend/src/pages/Dashboard/OrdersView.tsx
git commit -m "i18n: wire resolvedAt and pluckedAt timestamps"
```

---

### Task 8: Wire TableView and AnalyticsView

**Files:**

- Modify: `apps/frontend/src/components/tables/TableView.tsx`
- Modify: `apps/frontend/src/pages/Dashboard/AnalyticsView.tsx`

- [ ] **Step 1: Wire Print All QR Codes button**

In `TableView.tsx`, find line 123:

```tsx
Print All QR Codes
```

Replace with:

```tsx
{
  t("tables.printAllQr");
}
```

- [ ] **Step 2: Wire AnalyticsView Export button**

In `AnalyticsView.tsx`, find line 114:

```tsx
Export;
```

Replace with:

```tsx
{
  t("analytics.export");
}
```

- [ ] **Step 3: Wire date range labels**

In `AnalyticsView.tsx`, find the date input block around line 116–128. The "TO" separator text between the two date inputs:

```tsx
<span className="text-muted-foreground text-[10px] font-black">TO</span>
```

Replace with:

```tsx
<span className="text-muted-foreground text-[10px] font-black">
  {t("analytics.dateTo").toUpperCase()}
</span>
```

Note: `analytics.categoryBreakdown` and `analytics.topTables` are already called via `t()` with fallbacks in the code — adding those keys to the locale files in Task 5 is sufficient for those two strings.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/tables/TableView.tsx apps/frontend/src/pages/Dashboard/AnalyticsView.tsx
git commit -m "i18n: wire TableView print button and AnalyticsView export/date labels"
```

---

### Task 9: Wire SettingsView loyalty and happy hour fields

**Files:**

- Modify: `apps/frontend/src/pages/Dashboard/SettingsView.tsx`

- [ ] **Step 1: Wire section title and enable toggle**

Find:

```tsx
<h3 className="text-lg font-medium text-foreground mb-4">
  Loyalty & Rewards Program
</h3>
```

Replace with:

```tsx
<h3 className="text-lg font-medium text-foreground mb-4">
  {t("loyaltySettings.sectionTitle")}
</h3>
```

Find:

```tsx
<p className="font-bold text-accent">Enable Loyalty Program</p>
<p className="text-xs text-muted-foreground mt-1">
  Allow customers to earn and spend points on orders.
</p>
```

Replace with:

```tsx
<p className="font-bold text-accent">{t('loyaltySettings.enableLoyalty')}</p>
<p className="text-xs text-muted-foreground mt-1">
  {t('loyaltySettings.enableLoyaltyDesc')}
</p>
```

- [ ] **Step 2: Wire points economy fields**

Find and replace the three field labels in the points economy grid:

```tsx
<label className="block text-sm font-medium text-foreground/80 mb-1">
  Sign-up Bonus Points
</label>
...
<p className="text-[10px] text-muted-foreground mt-1">
  Awarded on first order. Capped at 75 pts server-side.
</p>
```

→

```tsx
<label className="block text-sm font-medium text-foreground/80 mb-1">
  {t('loyaltySettings.signupBonus')}
</label>
...
<p className="text-[10px] text-muted-foreground mt-1">
  {t('loyaltySettings.signupBonusDesc')}
</p>
```

```tsx
<label className="block text-sm font-medium text-foreground/80 mb-1">
  Earn Rate (pts per €1)
</label>
...
<p className="text-[10px] text-muted-foreground mt-1">
  Points earned per €1 spent. e.g. 10 pts/€ on a €10 order = 100 pts.
</p>
```

→

```tsx
<label className="block text-sm font-medium text-foreground/80 mb-1">
  {t('loyaltySettings.earnRate')}
</label>
...
<p className="text-[10px] text-muted-foreground mt-1">
  {t('loyaltySettings.earnRateDesc')}
</p>
```

```tsx
<label className="block text-sm font-medium text-foreground/80 mb-1">
  Redeem Rate (pts to earn €1)
</label>
...
<p className="text-[10px] text-muted-foreground mt-1">
  Points needed for €1 discount. Higher = less generous for customers.
</p>
```

→

```tsx
<label className="block text-sm font-medium text-foreground/80 mb-1">
  {t('loyaltySettings.redeemRate')}
</label>
...
<p className="text-[10px] text-muted-foreground mt-1">
  {t('loyaltySettings.redeemRateDesc')}
</p>
```

- [ ] **Step 3: Wire cashback preview**

Find:

```tsx
Effective cashback rate:{" "}
```

Replace with:

```tsx
{
  t("loyaltySettings.cashbackInfo", {
    pct: ((loyaltyExchangeRate / loyaltyRedeemRate) * 100).toFixed(1),
  });
}
```

Note: Remove the separate `<span>` that renders the percentage — it's now embedded in the key via `{{pct}}`.

For the warning span, find:

```tsx
<span className="ml-2 text-yellow-500">
  ⚠ High — check earn rate is pts/€, not €/pt
</span>
```

Replace with:

```tsx
<span className="ml-2 text-yellow-500">
  {t("loyaltySettings.cashbackWarning")}
</span>
```

- [ ] **Step 4: Wire expiry fields**

```tsx
Point Expiry (days)  →  {t('loyaltySettings.expiryDays')}
Default 90 days. Keeps liability manageable.  →  {t('loyaltySettings.expiryDaysDesc')}
Expiry Reminder Lead Time (days)  →  {t('loyaltySettings.reminderDays')}
Default 15 days before expiry. Triggers daily reminder job.  →  {t('loyaltySettings.reminderDaysDesc')}
```

- [ ] **Step 5: Wire VIP tier fields**

```tsx
VIP Tiers  →  {t('loyaltySettings.vipTiers')}
Based on lifetime points spent. Higher tiers earn points faster.  →  {t('loyaltySettings.vipTiersDesc')}
🥈 Silver threshold (pts)  →  {t('loyaltySettings.silverThreshold')}
🥇 Gold threshold (pts)  →  {t('loyaltySettings.goldThreshold')}
🥈 Silver multiplier  →  {t('loyaltySettings.silverMultiplier')}
🥇 Gold multiplier  →  {t('loyaltySettings.goldMultiplier')}
Silver threshold must be lower than Gold threshold.  →  {t('loyaltySettings.silverMustBeLower')}
```

- [ ] **Step 6: Wire Happy Hour fields**

```tsx
Happy Hour (Gamification)  →  {t('loyaltySettings.happyHour')}
Fires at the restaurant's local time (set timezone above).  →  {t('loyaltySettings.happyHourDesc')}
Start Time  →  {t('loyaltySettings.happyHourStart')}
End Time  →  {t('loyaltySettings.happyHourEnd')}
End before start = overnight range (e.g. 22:00–02:00).  →  {t('loyaltySettings.happyHourEndDesc')}
Points Multiplier  →  {t('loyaltySettings.happyHourMultiplier')}
```

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/pages/Dashboard/SettingsView.tsx
git commit -m "i18n: wire SettingsView loyalty and happy hour field labels"
```

---

### Task 10: Wire BrandingEditor and ColorSchemeEditor

**Files:**

- Modify: `apps/frontend/src/components/ui/BrandingEditor.tsx`
- Modify: `apps/frontend/src/components/branding/ColorSchemeEditor.tsx`

- [ ] **Step 1: Wire BrandingEditor typography section**

In `BrandingEditor.tsx`, find:

```tsx
<h4 className="text-sm font-bold mb-4">Typography</h4>
```

Replace with:

```tsx
<h4 className="text-sm font-bold mb-4">{t("branding.typography")}</h4>
```

The `FontPicker` receives `label` as a string prop. Replace:

```tsx
<FontPicker
  label="Heading Font"
  value={fontHeading}
  onChange={setFontHeading}
/>
<FontPicker
  label="Body Font"
  value={fontBody}
  onChange={setFontBody}
/>
```

With:

```tsx
<FontPicker
  label={t('branding.headingFont')}
  value={fontHeading}
  onChange={setFontHeading}
/>
<FontPicker
  label={t('branding.bodyFont')}
  value={fontBody}
  onChange={setFontBody}
/>
```

- [ ] **Step 2: Wire Color Scheme heading**

Find:

```tsx
<h4 className="text-sm font-bold mb-4">Color Scheme</h4>
```

Replace with:

```tsx
<h4 className="text-sm font-bold mb-4">{t("branding.colorScheme")}</h4>
```

- [ ] **Step 3: Wire Default Customer Theme section**

Find:

```tsx
<label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
  Default Customer Theme
</label>
<p className="text-[10px] font-medium text-muted-foreground/60 italic mb-4">
  Customers see this mode when they first scan the QR code. They can still toggle it.
</p>
```

Replace with:

```tsx
<label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
  {t('branding.defaultTheme')}
</label>
<p className="text-[10px] font-medium text-muted-foreground/60 italic mb-4">
  {t('branding.defaultThemeDesc')}
</p>
```

- [ ] **Step 4: Wire Restaurant Timezone section**

Find:

```tsx
<label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
  Restaurant Timezone
</label>
<p className="text-[10px] font-medium text-muted-foreground/60 italic mb-4">
  Used for automated menu scheduling.
</p>
```

Replace with:

```tsx
<label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
  {t('branding.restaurantTimezone')}
</label>
<p className="text-[10px] font-medium text-muted-foreground/60 italic mb-4">
  {t('branding.restaurantTimezoneDesc')}
</p>
```

- [ ] **Step 5: Wire Live Preview heading**

Find:

```tsx
Live Preview
```

(inside the `<h4>` in the right column)

Replace with:

```tsx
{
  t("branding.livePreview");
}
```

- [ ] **Step 6: Wire ColorSchemeEditor labels**

In `apps/frontend/src/components/branding/ColorSchemeEditor.tsx`, the component currently receives no `t` — add `useTranslation`:

At the top of the component function add:

```tsx
const { t } = useTranslation();
```

And add `import { useTranslation } from 'react-i18next';` to the imports.

Replace the four hardcoded labels:

```tsx
Menu Background  →  {t('branding.menuBackground')}
Text Color       →  {t('branding.textColor')}
Card Background  →  {t('branding.cardBackground')}
Button / Accent  →  {t('branding.buttonAccent')}
```

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/components/ui/BrandingEditor.tsx apps/frontend/src/components/branding/ColorSchemeEditor.tsx
git commit -m "i18n: wire BrandingEditor and ColorSchemeEditor labels"
```

---

### Task 11: Wire MenuCheckWidget

**Files:**

- Modify: `apps/frontend/src/components/dashboard/MenuCheckWidget.tsx`

- [ ] **Step 1: Wire title, subtitle, rescan**

Find:

```tsx
<h3 className="text-xl font-serif font-black text-foreground tracking-tight">Menu Health</h3>
<p className="text-sm text-muted-foreground mt-1">AI-powered audit to optimize your menu</p>
```

Replace with:

```tsx
<h3 className="text-xl font-serif font-black text-foreground tracking-tight">{t('menuCheck.title')}</h3>
<p className="text-sm text-muted-foreground mt-1">{t('menuCheck.subtitle')}</p>
```

Find:

```tsx
Rescan;
```

Replace with:

```tsx
{
  t("menuCheck.rescan");
}
```

- [ ] **Step 2: Wire perfect score state**

Find:

```tsx
<h4 className="text-lg font-bold text-green-600 dark:text-green-400 mb-1">Perfect Score!</h4>
<p className="text-sm text-green-700/70 dark:text-green-300/70">Your menu is fully optimized and ready to convert customers.</p>
```

Replace with:

```tsx
<h4 className="text-lg font-bold text-green-600 dark:text-green-400 mb-1">{t('menuCheck.perfectScore')}</h4>
<p className="text-sm text-green-700/70 dark:text-green-300/70">{t('menuCheck.perfectScoreDesc')}</p>
```

- [ ] **Step 3: Wire severity badge counts**

Find:

```tsx
{
  errors.length;
}
Critical;
```

Replace with:

```tsx
{
  t("menuCheck.critical", { count: errors.length });
}
```

Find:

```tsx
{
  warnings.length;
}
Warnings;
```

Replace with:

```tsx
{
  t("menuCheck.warnings", { count: warnings.length });
}
```

Find:

```tsx
{
  infos.length;
}
Suggestions;
```

Replace with:

```tsx
{
  t("menuCheck.suggestions", { count: infos.length });
}
```

- [ ] **Step 4: Wire item/category issue label and fix button**

Find line 135:

```tsx
{issue.itemId ? 'Item Issue' : 'Category Issue'} &middot; Field: {issue.field}
```

Replace with:

```tsx
{issue.itemId ? t('menuCheck.itemIssue') : t('menuCheck.categoryIssue')} &middot; {t('menuCheck.fieldLabel', { field: issue.field })}
```

Find:

```tsx
Fix;
```

(inside the fix button, line 147)
Replace with:

```tsx
{
  t("menuCheck.fix");
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/dashboard/MenuCheckWidget.tsx
git commit -m "i18n: wire MenuCheckWidget chrome strings"
```

---

## Phase 3 — Global chrome + Menu Editor

---

### Task 12: Add Phase 3 locale keys (all three locale files)

**Files:**

- Modify: `apps/frontend/src/locales/en/translation.json`
- Modify: `apps/frontend/src/locales/bg/translation.json`
- Modify: `apps/frontend/src/locales/ro/translation.json`

- [ ] **Step 1: Add keys to EN locale**

Add a top-level `"nav"` key:

```json
"nav": {
  "dashboard": "Dashboard",
  "logout": "Logout",
  "login": "Login",
  "getStarted": "Get Started"
}
```

In `"dashboard"` → `"tabs"`, add:

```json
"home": "Home",
"requests": "Requests",
"stats": "Stats"
```

Add to `"menuAdmin"` (already exists):

```json
"storefrontUpselling": "Storefront Upselling",
"trendingEngine": "Trending Engine",
"trendingModeAuto": "Auto (Algorithm)",
"trendingModeManual": "Manual (Hand-picked)",
"trendingModeOff": "Off",
"trendingDescAuto": "Automatically analyzes sales to trend popular items.",
"trendingDescManual": "Click the stars on items to feature them on your menu."
```

- [ ] **Step 2: Add keys to BG locale**

Add `"nav"`:

```json
"nav": {
  "dashboard": "Табло",
  "logout": "Изход",
  "login": "Вход",
  "getStarted": "Започни"
}
```

In `"dashboard"` → `"tabs"`, add:

```json
"home": "Начало",
"requests": "Повиквания",
"stats": "Статистики"
```

Add to `"menuAdmin"`:

```json
"storefrontUpselling": "Витрина за допълнителни продажби",
"trendingEngine": "Двигател за тенденции",
"trendingModeAuto": "Авто (Алгоритъм)",
"trendingModeManual": "Ръчно (Избрани)",
"trendingModeOff": "Изкл.",
"trendingDescAuto": "Автоматично анализира продажбите за популярни артикули.",
"trendingDescManual": "Кликнете върху звездите на артикулите, за да ги изпъкнете."
```

- [ ] **Step 3: Add keys to RO locale**

Add `"nav"`:

```json
"nav": {
  "dashboard": "Panou",
  "logout": "Deconectare",
  "login": "Autentificare",
  "getStarted": "Începeți"
}
```

In `"dashboard"` → `"tabs"`, add:

```json
"home": "Acasă",
"requests": "Solicitări",
"stats": "Statistici"
```

Add to `"menuAdmin"`:

```json
"storefrontUpselling": "Vânzări Suplimentare Vitrină",
"trendingEngine": "Motor de Tendințe",
"trendingModeAuto": "Auto (Algoritm)",
"trendingModeManual": "Manual (Selectat)",
"trendingModeOff": "Oprit",
"trendingDescAuto": "Analizează automat vânzările pentru articole populare.",
"trendingDescManual": "Faceți clic pe stele pentru a evidenția articolele."
```

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/locales/en/translation.json apps/frontend/src/locales/bg/translation.json apps/frontend/src/locales/ro/translation.json
git commit -m "i18n: add Phase 3 locale keys (nav, dashboard tabs, menuAdmin trending)"
```

---

### Task 13: Wire Header.tsx

**Files:**

- Modify: `apps/frontend/src/components/Header.tsx`

- [ ] **Step 1: Add `t` to the existing `useTranslation` call**

`Header.tsx` already imports `useTranslation` and destructures `i18n`. Add `t` to the destructure:

Find:

```tsx
const { i18n } = useTranslation();
```

Replace with:

```tsx
const { i18n, t } = useTranslation();
```

- [ ] **Step 2: Wire Dashboard link**

Find:

```tsx
Dashboard;
```

(inside the `<Link to="/dashboard">`)
Replace with:

```tsx
{
  t("nav.dashboard");
}
```

- [ ] **Step 3: Wire Logout button**

Find:

```tsx
Logout;
```

(inside the logout `<button>`)
Replace with:

```tsx
{
  t("nav.logout");
}
```

- [ ] **Step 4: Wire Login link**

Find:

```tsx
Login;
```

(inside the `<Link to="/login">`)
Replace with:

```tsx
{
  t("nav.login");
}
```

- [ ] **Step 5: Wire Get Started link**

Find:

```tsx
Get Started
```

(inside the `<Link to="/register">`)
Replace with:

```tsx
{
  t("nav.getStarted");
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/Header.tsx
git commit -m "i18n: wire Header nav labels (Dashboard, Logout, Login, Get Started)"
```

---

### Task 14: Wire DashboardPage mobile nav labels

**Files:**

- Modify: `apps/frontend/src/pages/DashboardPage.tsx`

- [ ] **Step 1: Replace static BOTTOM_NAV_TABS array with render-time labels**

The current `BOTTOM_NAV_TABS` is a static `const` outside the component with hardcoded `short` strings. `t()` cannot be called outside a component.

Remove the `short` property from the static array and move labels to the render:

Replace the static array:

```tsx
const BOTTOM_NAV_TABS: { id: TabId; Icon: LucideIcon; short: string }[] = [
  { id: "summary", Icon: LayoutDashboard, short: "Home" },
  { id: "orders", Icon: ShoppingBag, short: "Orders" },
  { id: "assistance", Icon: Bell, short: "Requests" },
  { id: "tables", Icon: Table2, short: "Tables" },
  { id: "settings", Icon: Settings, short: "Settings" },
];
```

With:

```tsx
const BOTTOM_NAV_TABS: { id: TabId; Icon: LucideIcon; labelKey: string }[] = [
  { id: "summary", Icon: LayoutDashboard, labelKey: "dashboard.tabs.home" },
  { id: "orders", Icon: ShoppingBag, labelKey: "dashboard.tabs.orders" },
  { id: "assistance", Icon: Bell, labelKey: "dashboard.tabs.requests" },
  { id: "tables", Icon: Table2, labelKey: "dashboard.tabs.tables" },
  { id: "settings", Icon: Settings, labelKey: "dashboard.tabs.settings" },
];
```

- [ ] **Step 2: Update the render to use labelKey**

In the mobile bottom nav `map`, find:

```tsx
{BOTTOM_NAV_TABS.map(({ id, Icon, short }) => {
```

Replace with:

```tsx
{BOTTOM_NAV_TABS.map(({ id, Icon, labelKey }) => {
```

Find:

```tsx
<span className="text-[9px] font-bold uppercase tracking-wide leading-none">
  {short}
</span>
```

Replace with:

```tsx
<span className="text-[9px] font-bold uppercase tracking-wide leading-none">
  {t(labelKey)}
</span>
```

- [ ] **Step 3: Wire the Analytics shortcut label**

Find the Analytics shortcut button (after the main BOTTOM_NAV_TABS map):

```tsx
<span className="text-[9px] font-bold uppercase tracking-wide leading-none">
  Stats
</span>
```

Replace with:

```tsx
<span className="text-[9px] font-bold uppercase tracking-wide leading-none">
  {t("dashboard.tabs.stats")}
</span>
```

- [ ] **Step 4: Wire mobile Menu Editor link**

Find the mobile "Menu Editor" hardcoded link (around line 180):

```tsx
Menu Editor
```

Replace with:

```tsx
{
  t("dashboard.tabs.menuEditor");
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/DashboardPage.tsx
git commit -m "i18n: wire DashboardPage mobile nav labels and Menu Editor link"
```

---

### Task 15: Wire MenuEditorPage trending section

**Files:**

- Modify: `apps/frontend/src/pages/MenuEditorPage.tsx`

- [ ] **Step 1: Confirm useTranslation is imported**

Check the imports at the top of `MenuEditorPage.tsx`. If `useTranslation` is not yet imported, add:

```tsx
import { useTranslation } from "react-i18next";
```

And add inside the component:

```tsx
const { t } = useTranslation();
```

- [ ] **Step 2: Wire Storefront Upselling heading**

Find:

```tsx
<h2 className="text-sm font-black uppercase tracking-widest text-zinc-400">
  Storefront Upselling
</h2>
```

Replace with:

```tsx
<h2 className="text-sm font-black uppercase tracking-widest text-zinc-400">
  {t("menuAdmin.storefrontUpselling")}
</h2>
```

- [ ] **Step 3: Wire Trending Engine label**

Find:

```tsx
<label className="block text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-2">
  Trending Engine
</label>
```

Replace with:

```tsx
<label className="block text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-2">
  {t("menuAdmin.trendingEngine")}
</label>
```

- [ ] **Step 4: Wire mode option labels**

Find:

```tsx
<option value="AUTO">🤖 Auto (Algorithm)</option>
<option value="MANUAL">⭐ Manual (Hand-picked)</option>
<option value="OFF">🚫 Off</option>
```

Replace with:

```tsx
<option value="AUTO">🤖 {t('menuAdmin.trendingModeAuto')}</option>
<option value="MANUAL">⭐ {t('menuAdmin.trendingModeManual')}</option>
<option value="OFF">🚫 {t('menuAdmin.trendingModeOff')}</option>
```

- [ ] **Step 5: Wire dynamic description text**

Find:

```tsx
{
  activeRestaurant?.trendingMode === "MANUAL"
    ? "Click the stars on items to feature them on your menu."
    : "Automatically analyzes sales to trend popular items.";
}
```

Replace with:

```tsx
{
  activeRestaurant?.trendingMode === "MANUAL"
    ? t("menuAdmin.trendingDescManual")
    : t("menuAdmin.trendingDescAuto");
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/MenuEditorPage.tsx
git commit -m "i18n: wire MenuEditorPage Storefront Upselling and Trending Engine section"
```

---

## Final verification

- [ ] Start dev server: `npm run dev` from repo root
- [ ] Open `http://localhost:3001/dashboard`, switch language picker in the header to BG — verify all dashboard tab labels, summary loyalty stats, assistance timestamps, orders timestamps, print button, analytics export, settings loyalty fields, branding labels switch to Bulgarian
- [ ] Switch to RO — same verification
- [ ] Open public menu, switch language — verify Trending Now, Language label, Logout button translate
- [ ] Add items to cart, proceed to checkout — verify all loyalty strings translate when language is BG/RO
- [ ] In Tables & QR tab, click Print All QR Codes — verify print preview shows only QR code cards
- [ ] Confirm language picker appears only once (Header only, not on DashboardPage)
- [ ] Switch back to EN — verify all English strings are intact
