# Remaining Fixes + Customer Auth Design

## Scope

Nine issues from `06.06.26_remaining_issue_translation_plus_other_fixes.md`, grouped into three areas:

1. **Customer Auth** — Email OTP sign-in, customer profile page wired + translated
2. **UI Bugs** — Cart language sync, options pre-selection, QR print layout, analytics dark mode, menu health false positive
3. **Translation Gaps** — Remaining hardcoded strings across public menu and profile page

---

## Area 1 — Customer Auth (Email OTP + Profile)

### Goal

Replace the non-functional magic link console log with a real 6-digit OTP flow.
Customers sign in from the public menu action bar using email + OTP (or Google).
First-time customers see a welcome card with loyalty benefits.
Returning customers auto-close back to the menu.

### DB Changes

**New model** added to `apps/backend/prisma/schema.prisma`:

```prisma
model VerificationToken {
  id        String    @id @default(cuid())
  email     String
  code      String
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([email])
}
```

**Existing `User` model** — add optional field:

```prisma
phone String?
```

Run `npx prisma db push` (additive, no data loss).

### Backend

**`apps/backend/.env` and `.env.example`** — add:

```
RESEND_API_KEY=re_...
```

If `RESEND_API_KEY` is absent, email sending is skipped; OTP is printed to console and included in response as `devCode`. This is the zero-config dev mode.

**`apps/backend/src/auth/auth.service.ts`** — add two methods:

`sendOtp(email: string, phone?: string)`:

- Delete all unused `VerificationToken` rows for this email
- If a valid (unexpired, unused) token was created within last 60 seconds → throw `429` (rate limit)
- Generate 6-digit code string `Math.floor(100000 + Math.random() * 900000).toString()`
- Hash with `bcrypt.hash(code, 10)`
- Store `VerificationToken { email, code: hash, expiresAt: now+10min }`
- If `process.env.RESEND_API_KEY` set → send email via `fetch` to Resend API (`https://api.resend.com/emails`), `from: 'noreply@yourdomain.com'` (configurable via `RESEND_FROM_EMAIL` env), subject "Your verification code", plain body `Your code: ${code} — expires in 10 minutes.`
- Otherwise → `console.log` code
- Return `{ success: true, ...(isDev ? { devCode: code } : {}) }`

`verifyOtp(email: string, code: string, phone?: string)`:

- Find latest `VerificationToken` where `email` matches, `usedAt` is null, `expiresAt > now`
- If not found → throw `UnauthorizedException('Invalid or expired code')`
- `bcrypt.compare(code, token.code)` → if false → throw same
- Mark token `usedAt = now`
- `findByEmail(email)` → if not found, create User `{ email, role: 'CUSTOMER', password: random hash }`
- Update user `phone` if passed (store on session context, or pass phone as optional field)
- Return `{ token: jwtSign({ email, sub: user.id }), user: { id, email, name, role }, isNew: boolean }`

**`apps/backend/src/auth/auth.controller.ts`** — add two routes:

```
POST /api/auth/otp/send   → body: { email: string, phone?: string }
POST /api/auth/otp/verify → body: { email: string, code: string, phone?: string }
```

No new guards needed — both are public endpoints.

**`apps/backend/src/auth/auth.module.ts`** — no change needed. `PrismaModule` is `@Global()` and already imported — `PrismaService` is injectable in `AuthService` directly.

### Frontend

**`apps/frontend/src/components/auth/CustomerLoginModal.tsx`** — full rewrite:

State machine: `step: 'entry' | 'otp' | 'welcome'`

Step `entry`:

- Title: `t('auth.otp.title')`
- Google button (existing)
- Divider "Or"
- Email `<Input>` (required)
- Phone `<Input>` (optional, placeholder "Phone (optional)")
- "Send Code" button → calls `POST /api/auth/otp/send`, advances to `otp` step
- Dev: if response includes `devCode`, show it in a yellow dev-only banner

Step `otp`:

- Title: `t('auth.otp.enterCode')`
- Subtitle: `t('auth.otp.sentTo', { email })`
- Single `<Input>` for 6-digit code (type="number", maxLength=6)
- "Verify" button → calls `POST /api/auth/otp/verify`, on success → calls `AuthContext.loginWithToken(token, user)`, if `isNew` → step `welcome`, else close modal
- "Resend" link with 60-second countdown (disabled until countdown expires)
- "← Change email" link → back to `entry`

Step `welcome` (new customers only):

- Checkmark icon
- Title: `t('auth.otp.welcomeTitle')`
- Body: `t('auth.otp.welcomeBody')` — "You'll earn points on every order. Redeem them for free food and discounts."
- "Let's order!" button → close modal

`AuthContext` — add `loginWithToken(token: string, user: User)` method:

```ts
loginWithToken(token: string, user: User) {
  localStorage.setItem('token', token);
  setToken(token);
  setUser(user);
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
}
```

Mirrors the existing `login()` pattern — no extra API call needed since OTP verify already returns both.

**`apps/frontend/src/pages/PublicMenuPage.tsx`** — action bar, logged-in state:

Current:

```jsx
<span>{user.name?.split(" ")[0] || "Me"}</span>
<span>{t("publicMenu.logout")}</span>
```

Change to two separate interactive elements:

```jsx
// Profile chip — navigates to /profile?returnTo=<current url>
<button onClick={() => navigate(`/profile?returnTo=${encodeURIComponent(location.pathname + location.search)}`)}>
  {user.name?.split(" ")[0] || t('publicMenu.myProfile')}
</button>
// Logout — small icon button
<button onClick={logout} aria-label={t('publicMenu.logout')}>
  <LogOut className="w-4 h-4" />
</button>
```

**`apps/frontend/src/pages/CustomerProfilePage.tsx`** — changes:

- Import `useTranslation`, `useSearchParams`, `Link`
- Add "← Back to menu" button when `?returnTo` param present
- Replace all hardcoded English strings with `t('profile.*')` keys (see Translation section below)
- Remove hardcoded tier threshold comparisons for display colors — use `acc.tier` value directly from API (already computed by backend): `'GOLD'`, `'SILVER'`, `'BRONZE'`

**Route** — verify `/profile` route exists in `apps/frontend/src/App.tsx`. Add if missing.

---

## Area 2 — UI Bugs

### 2a Cart Language Sync

**Root cause:** `CartItem.name` is a string snapshot taken at add-time. Language change after adding items leaves old names in cart.

**Fix:**

`apps/frontend/src/components/cart/CartIcon.tsx`:

- Accept new prop `selectedLang: string`
- Pass `selectedLang` down to `CartDrawer`

`apps/frontend/src/components/cart/CartDrawer.tsx`:

- Accept new prop `selectedLang: string`
- Accept existing `categories` prop (already passed)
- Utility function `resolveItemName(cartItem, categories, selectedLang)`:
  ```ts
  function resolveItemName(
    cartItem: CartItem,
    categories: any[],
    lang: string,
  ): string {
    for (const cat of categories) {
      const found = cat.items?.find((i: any) => i.id === cartItem.id);
      if (found) {
        return (
          (lang && found.translations?.[lang]?.name) ||
          found.name ||
          cartItem.name
        );
      }
    }
    return cartItem.name;
  }
  ```
- When rendering each cart item, replace `{item.name}` with `{resolveItemName(item, categories, selectedLang)}`
- Also apply to cart item name in the order summary row and total line

`apps/frontend/src/pages/PublicMenuPage.tsx`:

- Pass `selectedLang={selectedLang}` to `<CartIcon>`

### 2b Options Pre-selection

**Root cause:** `selectedOptions` state initialised as `{}` — no choice pre-selected for VARIATION-type options, allowing the base item to be ordered without any required variant.

**Fix in `apps/frontend/src/components/menu/ItemWithOptions.tsx`:**

Add `useEffect` after `selectedOptions` state declaration:

```ts
useEffect(() => {
  if (!item.options?.length) return;
  setSelectedOptions((prev) => {
    const init: Record<string, any> = { ...prev };
    item.options.forEach((opt: any) => {
      if (
        opt.type === "VARIATION" &&
        opt.choices?.length > 0 &&
        !init[opt.id]
      ) {
        init[opt.id] = {
          optionId: opt.id,
          optionName: opt.name,
          choiceName: opt.choices[0].name,
          priceModifier: opt.choices[0].priceModifier ?? 0,
        };
      }
    });
    return init;
  });
}, [item.id]);
```

Effect fires when `item.id` changes (new item opened). Only sets options that are not already chosen (respects user edits). Only targets `VARIATION` type — ADD_ON options remain unselected by default (optional extras).

### 2c QR Print Layout

**Root cause:** `grid-cols-2` stacks cards side-by-side; 2nd card in a row spills across page breaks or off the page edge when printing multiple QR codes.

**Fix in `apps/frontend/src/components/tables/PrintableQRCodes.tsx`:**

- Change container class from `grid grid-cols-2 gap-8 p-8` to `grid grid-cols-1 gap-0 p-0`
- Each card: remove fixed `h-[130mm]`, add `break-inside: avoid`, `page-break-inside: avoid`, set `min-h-[140mm] max-h-[148mm] w-full` so 2 cards fit per A4 page
- Add scoped `<style>` block inside the component:
  ```css
  @page {
    size: A4 portrait;
    margin: 12mm;
  }
  body {
    margin: 0;
  }
  ```
- The QR card itself: centered content, full-width border, 12mm padding

### 2d Analytics Dark Mode

**Root cause:** Recharts renders SVG `<text>` elements with no explicit fill, inheriting browser default (black) instead of theme foreground. In dark mode the dark background + black text = invisible.

**Fix in `apps/frontend/src/pages/Dashboard/AnalyticsView.tsx`:**

All `XAxis` and `YAxis` components — add:

```jsx
tick={{ fill: 'hsl(var(--color-muted-foreground))' }}
axisLine={{ stroke: 'hsl(var(--color-border))' }}
tickLine={false}
```

All `Tooltip` components — replace default with a custom component:

```tsx
const ChartTooltip = ({ active, payload, label, formatter }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-panel px-4 py-3 rounded-xl border border-border text-sm">
      {label && <p className="font-bold text-foreground mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-muted-foreground">
          {formatter ? formatter(p.value) : p.value}
        </p>
      ))}
    </div>
  );
};
```

Use `<Tooltip content={<ChartTooltip formatter={formatCurrency} />}` on revenue/category charts, `<Tooltip content={<ChartTooltip />}` on others.

### 2e Menu Health — Remove Category Image Check

**Fix in `apps/backend/src/menu/menu.service.ts`:**

Delete lines 859–868 (the block that pushes `'Category has no banner image. Adding one improves visual appeal.'`). No frontend change — the audit endpoint simply stops returning those `info`-level issues.

---

## Area 3 — Translation Gaps

All keys added to all three locale files: `en/translation.json`, `bg/translation.json`, `ro/translation.json`.

### New keys — `auth.otp.*`

```json
"auth": {
  "otp": {
    "title": "Sign In or Join",
    "subtitle": "Earn points on every order",
    "sendCode": "Send Code",
    "sending": "Sending…",
    "enterCode": "Enter your code",
    "sentTo": "We sent a 6-digit code to {{email}}",
    "verify": "Verify",
    "verifying": "Verifying…",
    "resend": "Resend code",
    "resendIn": "Resend in {{seconds}}s",
    "changeEmail": "← Change email",
    "welcomeTitle": "Welcome!",
    "welcomeBody": "You'll earn points on every order. Redeem them for free food and discounts.",
    "letsOrder": "Let's order!",
    "invalidCode": "Invalid or expired code. Try again.",
    "tooManyRequests": "Wait a moment before requesting another code.",
    "devCodeBanner": "DEV — code: {{code}}",
    "continueWithGoogle": "Continue with Google",
    "orDivider": "Or",
    "emailPlaceholder": "Email address",
    "phonePlaceholder": "Phone (optional)"
  }
}
```

### New keys — `publicMenu.*` (missing from all locales)

```json
"signIn": "Sign In",
"myProfile": "My Profile",
"calling": "Calling…",
"scanQrForAssistance": "Scan your table QR to call for assistance",
"selectLanguage": "Select language"
```

### New keys — `publicMenu.pairing.*` (ItemWithOptions hardcoded strings)

```json
"pairing": {
  "title": "Perfect Pairing",
  "completeYour": "Complete Your {{name}}",
  "chefDescription": "Exquisite additions selected by our chef to elevate your experience.",
  "noThanks": "No thanks, continue",
  "addToOrder": "Add to order"
}
```

### New keys — `publicMenu.drinkUpsell.*` (CartDrawer hardcoded strings)

```json
"drinkUpsell": {
  "title": "Add a Drink?",
  "question": "Wait, would you like a drink with that?",
  "subtitle": "Complete your meal perfectly.",
  "add": "Add"
}
```

### New keys — `profile.*` (CustomerProfilePage hardcoded strings)

```json
"profile": {
  "title": "My Profile",
  "welcome": "Welcome back, {{name}}!",
  "subtitle": "View your order history and loyalty points.",
  "signOut": "Sign Out",
  "backToMenu": "← Back to menu",
  "vipTiersTitle": "Your VIP Tiers & Points",
  "currentBalance": "Current Balance",
  "multiplier": "Multiplier",
  "firstReward": "First EUR 1 reward",
  "ptsToGo": "{{count}} pts to go",
  "readyToRedeem": "Ready to redeem",
  "rewardProgress": "{{pct}}% of the way to your first EUR 1 reward.",
  "expiringSoonTitle": "EUR {{value}} in rewards expires soon",
  "expiringSoonBody": "{{count}} points expire{{date}}. Come back before they disappear.",
  "expiringSoonOn": " on {{date}}",
  "lifetime": "Lifetime: {{pts}} pts",
  "ptsToTier": "{{count}} pts to {{tier}}",
  "maxTier": "Max Tier Reached",
  "pastOrders": "Past Orders",
  "loading": "Loading history…",
  "noOrders": "No orders yet",
  "noOrdersHint": "When you order from participating restaurants, they'll appear here.",
  "at": "at",
  "noItems": "No items",
  "pleaseLogin": "Please sign in to view your profile.",
  "loginButton": "Sign In"
}
```

---

## Files Changed Summary

| File                                                       | Change                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| `apps/backend/prisma/schema.prisma`                        | Add `VerificationToken` model, `User.phone?`                    |
| `apps/backend/src/auth/auth.service.ts`                    | Add `sendOtp`, `verifyOtp` methods; inject `PrismaService`      |
| `apps/backend/src/auth/auth.controller.ts`                 | Add `POST /otp/send`, `POST /otp/verify`                        |
| `apps/backend/src/auth/auth.module.ts`                     | No change (PrismaModule already @Global)                        |
| `apps/backend/.env` + `.env.example`                       | Add `RESEND_API_KEY`, `RESEND_FROM_EMAIL`                       |
| `apps/backend/src/menu/menu.service.ts`                    | Delete category image audit rule                                |
| `apps/frontend/src/context/AuthContext.tsx`                | Add `loginWithToken` method                                     |
| `apps/frontend/src/components/auth/CustomerLoginModal.tsx` | Full rewrite — OTP 3-step flow                                  |
| `apps/frontend/src/pages/PublicMenuPage.tsx`               | Pass `selectedLang` to CartIcon; update logged-in action bar    |
| `apps/frontend/src/pages/CustomerProfilePage.tsx`          | Full translation + back button + `returnTo` nav                 |
| `apps/frontend/src/pages/App.tsx`                          | Verify `/profile` route                                         |
| `apps/frontend/src/components/cart/CartIcon.tsx`           | Accept + forward `selectedLang` prop                            |
| `apps/frontend/src/components/cart/CartDrawer.tsx`         | `resolveItemName` util + upsell string translations             |
| `apps/frontend/src/components/menu/ItemWithOptions.tsx`    | Pre-select first VARIATION choice + pairing string translations |
| `apps/frontend/src/components/tables/PrintableQRCodes.tsx` | Grid → single column, A4 page rules                             |
| `apps/frontend/src/pages/Dashboard/AnalyticsView.tsx`      | Dark mode chart fixes                                           |
| `apps/frontend/src/locales/en/translation.json`            | Add `auth.otp`, `publicMenu.*`, `profile.*` keys                |
| `apps/frontend/src/locales/bg/translation.json`            | Same keys in Bulgarian                                          |
| `apps/frontend/src/locales/ro/translation.json`            | Same keys in Romanian                                           |
