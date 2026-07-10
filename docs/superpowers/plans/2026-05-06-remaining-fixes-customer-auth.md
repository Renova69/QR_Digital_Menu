# Remaining Fixes + Customer Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken magic-link with a real email OTP sign-in flow, add customer profile access from the public menu, and fix 8 UI/translation bugs (cart language sync, options pre-selection, QR print layout, analytics dark mode, translation gaps, menu health false positive).

**Architecture:** Backend adds two auth endpoints (`POST /auth/otp/send`, `POST /auth/otp/verify`) with bcrypt-hashed 6-digit codes in a new `VerificationToken` table. Email delivery via Resend API when `RESEND_API_KEY` env var is set; otherwise logs the code to console and includes it in the API response (dev mode). Frontend upgrades `CustomerLoginModal` to a 3-step state machine, adds profile navigation from the action bar, and wires `t()` calls for ~40 hardcoded strings across 5 components.

**Tech Stack:** NestJS 11, Prisma 6, Neon Postgres, bcryptjs, Resend REST API (no SDK — use native `fetch`), React 18, react-i18next, Recharts, Tailwind v4.

---

## File Map

| File                                                       | Change                                                                           |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `apps/backend/prisma/schema.prisma`                        | Add `VerificationToken` model; add `phone String?` to `User`                     |
| `apps/backend/.env` + `.env.example`                       | Add `RESEND_API_KEY`, `RESEND_FROM_EMAIL`                                        |
| `apps/backend/src/auth/auth.service.ts`                    | Inject `PrismaService`; add `sendOtp` + `verifyOtp`                              |
| `apps/backend/src/auth/auth.service.spec.ts`               | New — OTP unit tests                                                             |
| `apps/backend/src/auth/auth.controller.ts`                 | Add `POST /otp/send`, `POST /otp/verify`                                         |
| `apps/backend/src/menu/menu.service.ts`                    | Delete category-image audit rule (lines 859–868)                                 |
| `apps/frontend/src/context/AuthContext.tsx`                | Add `loginWithToken(token, user)` method                                         |
| `apps/frontend/src/components/auth/CustomerLoginModal.tsx` | Full rewrite — 3-step OTP flow                                                   |
| `apps/frontend/src/pages/PublicMenuPage.tsx`               | Action bar: profile chip + logout icon; pass `selectedLang` to CartIcon          |
| `apps/frontend/src/pages/CustomerProfilePage.tsx`          | Full `t()` wiring + `returnTo` back button                                       |
| `apps/frontend/src/components/cart/CartIcon.tsx`           | Add + forward `selectedLang` prop                                                |
| `apps/frontend/src/components/cart/CartDrawer.tsx`         | `resolveItemName` util + upsell/footer string translations                       |
| `apps/frontend/src/components/menu/ItemWithOptions.tsx`    | VARIATION pre-selection `useEffect` + pairing string translations                |
| `apps/frontend/src/components/tables/PrintableQRCodes.tsx` | Single-column layout + `@page` A4 rules                                          |
| `apps/frontend/src/pages/Dashboard/AnalyticsView.tsx`      | Fix axis `tick.fill` for dark mode                                               |
| `apps/frontend/src/locales/en/translation.json`            | Add `auth.otp.*`, `publicMenu.signIn/myProfile/pairing/drinkUpsell`, `profile.*` |
| `apps/frontend/src/locales/bg/translation.json`            | Same keys in Bulgarian                                                           |
| `apps/frontend/src/locales/ro/translation.json`            | Same keys in Romanian                                                            |

---

### Task 1: DB Schema + Env Vars

**Files:**

- Modify: `apps/backend/prisma/schema.prisma`
- Modify: `apps/backend/.env`
- Modify: `apps/backend/.env.example`

Context: `User` model is at line 10 of `schema.prisma`. It currently has no `phone` field. `VerificationToken` is a new model. `PrismaModule` is `@Global()` so no module changes are needed — `PrismaService` becomes injectable in `AuthService` automatically after this step.

- [ ] **Step 1: Add `phone` field to `User` model in schema.prisma**

In `apps/backend/prisma/schema.prisma`, add `phone String?` after `name String?` (line 14):

```prisma
model User {
  id              String           @id @default(cuid())
  email           String           @unique
  password        String
  name            String?
  phone           String?
  role            UserRole         @default(STAFF)
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  orders          Order[]
  loyaltyAccounts LoyaltyAccount[]
  restaurants     Restaurant[]

  @@map("app_user")
}
```

- [ ] **Step 2: Add `VerificationToken` model to schema.prisma**

Append this model at the end of `schema.prisma` (after all existing models):

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

- [ ] **Step 3: Add env vars**

In `apps/backend/.env`, add:

```
RESEND_API_KEY=re_your_key_here
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

In `apps/backend/.env.example`, add the same lines (with placeholder values):

```
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

- [ ] **Step 4: Push schema to Neon**

Run from `apps/backend/`:

```bash
npx prisma db push
```

Expected output includes:

```
Your database is now in sync with your Prisma schema.
```

- [ ] **Step 5: Commit**

```bash
git add apps/backend/prisma/schema.prisma apps/backend/.env.example
git commit -m "feat: add VerificationToken model and User.phone field"
```

---

### Task 2: AuthService OTP Methods + Tests

**Files:**

- Modify: `apps/backend/src/auth/auth.service.ts`
- Create: `apps/backend/src/auth/auth.service.spec.ts`

Context: `auth.service.ts` currently has constructor `(usersService, jwtService)`. It imports from `@nestjs/common`, `bcryptjs`, `@nestjs/jwt`, `../users/users.service`, `@prisma/client`. `PrismaService` is available for injection because `PrismaModule` is `@Global()` and already imported in `auth.module.ts`. `UsersService.create` accepts `Prisma.UserCreateInput` and `findByEmail` returns `User | null`. The `UserRole` enum is from `@prisma/client`.

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/src/auth/auth.service.spec.ts`:

```typescript
import { AuthService } from "./auth.service";
import { JwtService } from "@nestjs/jwt";
import { HttpException, UnauthorizedException } from "@nestjs/common";

describe("AuthService OTP", () => {
  let service: AuthService;
  let mockPrisma: any;
  let mockUsersService: any;
  let mockJwt: Partial<JwtService>;

  beforeEach(() => {
    mockPrisma = {
      verificationToken: {
        findFirst: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      user: { update: jest.fn().mockResolvedValue({}) },
    };
    mockUsersService = {
      findByEmail: jest.fn(),
      create: jest.fn(),
    };
    mockJwt = { sign: jest.fn().mockReturnValue("test-jwt-token") };

    service = new AuthService(
      mockUsersService as any,
      mockJwt as JwtService,
      mockPrisma,
    );
  });

  describe("sendOtp", () => {
    it("creates a VerificationToken and returns success:true", async () => {
      mockPrisma.verificationToken.findFirst.mockResolvedValue(null);

      const result = await service.sendOtp("user@example.com");

      expect(mockPrisma.verificationToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: "user@example.com" }),
        }),
      );
      expect(result.success).toBe(true);
    });

    it("includes devCode in response when RESEND_API_KEY is not set", async () => {
      delete process.env.RESEND_API_KEY;
      mockPrisma.verificationToken.findFirst.mockResolvedValue(null);

      const result = await service.sendOtp("user@example.com");

      expect(result.devCode).toBeDefined();
      expect(result.devCode).toMatch(/^\d{6}$/);
    });

    it("throws HttpException(429) when token created within last 60 seconds", async () => {
      mockPrisma.verificationToken.findFirst.mockResolvedValue({
        id: "tok1",
        createdAt: new Date(),
      });

      await expect(service.sendOtp("user@example.com")).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe("verifyOtp", () => {
    it("throws UnauthorizedException when no valid token exists", async () => {
      mockPrisma.verificationToken.findFirst.mockResolvedValue(null);

      await expect(
        service.verifyOtp("user@example.com", "123456"),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("returns JWT + isNew:true for a new user with valid code", async () => {
      const bcrypt = require("bcryptjs");
      const plainCode = "654321";
      const hashedCode = await bcrypt.hash(plainCode, 10);

      mockPrisma.verificationToken.findFirst.mockResolvedValue({
        id: "tok1",
        code: hashedCode,
        expiresAt: new Date(Date.now() + 60_000),
      });
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue({
        id: "usr1",
        email: "user@example.com",
        name: null,
        role: "CUSTOMER",
      });

      const result = await service.verifyOtp("user@example.com", plainCode);

      expect(result.isNew).toBe(true);
      expect(result.token).toBe("test-jwt-token");
      expect(result.user.email).toBe("user@example.com");
    });

    it("returns isNew:false for an existing user", async () => {
      const bcrypt = require("bcryptjs");
      const plainCode = "111222";
      const hashedCode = await bcrypt.hash(plainCode, 10);

      mockPrisma.verificationToken.findFirst.mockResolvedValue({
        id: "tok2",
        code: hashedCode,
        expiresAt: new Date(Date.now() + 60_000),
      });
      mockUsersService.findByEmail.mockResolvedValue({
        id: "usr2",
        email: "existing@example.com",
        name: "Existing User",
        role: "CUSTOMER",
        phone: null,
      });

      const result = await service.verifyOtp("existing@example.com", plainCode);

      expect(result.isNew).toBe(false);
      expect(mockUsersService.create).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/backend && npx jest auth.service.spec.ts --no-coverage
```

Expected: FAIL — `AuthService` constructor does not accept 3 arguments yet.

- [ ] **Step 3: Add `sendOtp` and `verifyOtp` to `auth.service.ts`**

Replace the full `apps/backend/src/auth/auth.service.ts` with:

```typescript
import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { CreateAuthDto } from "./dto/create-auth.dto";
import * as bcrypt from "bcryptjs";
import { JwtService } from "@nestjs/jwt";
import { UsersService } from "../users/users.service";
import { PrismaService } from "../prisma/prisma.service";
import { UserRole } from "@prisma/client";

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new NotFoundException(
        "No account found with this email. Please check or create an account.",
      );
    }
    if (user.password && (await bcrypt.compare(pass, user.password))) {
      const { password, ...result } = user;
      return result;
    }
    throw new UnauthorizedException("Incorrect password. Please try again.");
  }

  async login(user: any) {
    const payload = { email: user.email, sub: user.id };
    return {
      token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async validateGoogleUser(profile: any) {
    const { email, firstName, lastName } = profile;
    let user = await this.usersService.findByEmail(email);

    if (!user) {
      const generatedPassword = await bcrypt.hash(
        Math.random().toString(36).slice(-8),
        10,
      );
      user = await this.usersService.create({
        email,
        name: `${firstName} ${lastName}`,
        password: generatedPassword,
        role: "OWNER",
      });
    }

    return user;
  }

  async register(createAuthDto: CreateAuthDto) {
    const { email, password } = createAuthDto;

    const existingUser = await this.usersService.findByEmail(email);

    if (existingUser) {
      throw new ConflictException("User with this email already exists");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.usersService.create({
      email,
      password: hashedPassword,
      role: "OWNER",
    });

    const { password: _, ...result } = user;
    const payload = { email: result.email, sub: result.id };
    return {
      token: this.jwtService.sign(payload),
      user: {
        id: result.id,
        email: result.email,
        name: result.name,
        role: result.role,
      },
    };
  }

  async sendMagicLink(email: string, returnTo?: string) {
    let user = await this.usersService.findByEmail(email);

    if (!user) {
      const generatedPassword = await bcrypt.hash(
        Math.random().toString(36).slice(-8),
        10,
      );
      user = await this.usersService.create({
        email,
        password: generatedPassword,
        role: "CUSTOMER" as any,
      });
    }

    const payload = { email: user.email, sub: user.id };
    const token = this.jwtService.sign(payload, { expiresIn: "15m" });

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3001";
    let link = `${frontendUrl}/auth/callback?token=${token}`;
    if (returnTo) {
      link += `&returnTo=${encodeURIComponent(returnTo)}`;
    }

    console.log(`\n\n🔗 MAGIC LINK FOR ${email}:`);
    console.log(`${link}\n\n`);

    return { success: true, message: "Magic link generated in console", link };
  }

  async sendOtp(
    email: string,
    phone?: string,
  ): Promise<{ success: boolean; devCode?: string }> {
    // Rate limit: reject if a token was created for this email in the last 60 seconds
    const recentToken = await this.prisma.verificationToken.findFirst({
      where: {
        email,
        usedAt: null,
        createdAt: { gte: new Date(Date.now() - 60_000) },
      },
    });
    if (recentToken) {
      throw new HttpException(
        "Please wait before requesting another code.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Clean up all old unused tokens for this email
    await this.prisma.verificationToken.deleteMany({
      where: { email, usedAt: null },
    });

    // Generate and hash code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedCode = await bcrypt.hash(code, 10);

    await this.prisma.verificationToken.create({
      data: {
        email,
        code: hashedCode,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const isDev = !process.env.RESEND_API_KEY;

    if (!isDev) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL || "noreply@yourdomain.com",
          to: [email],
          subject: "Your verification code",
          text: `Your verification code: ${code}\n\nExpires in 10 minutes.`,
          html: `<p style="font-family:sans-serif;font-size:16px;">Your verification code:</p><p style="font-family:monospace;font-size:32px;font-weight:bold;letter-spacing:8px;">${code}</p><p style="font-family:sans-serif;color:#666;">Expires in 10 minutes. If you did not request this, ignore this email.</p>`,
        }),
      });
    } else {
      console.log(`\n\n🔑 OTP FOR ${email}: ${code}\n\n`);
    }

    return { success: true, ...(isDev ? { devCode: code } : {}) };
  }

  async verifyOtp(
    email: string,
    code: string,
    phone?: string,
  ): Promise<{ token: string; user: any; isNew: boolean }> {
    const tokenRecord = await this.prisma.verificationToken.findFirst({
      where: {
        email,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!tokenRecord) {
      throw new UnauthorizedException("Invalid or expired code.");
    }

    const valid = await bcrypt.compare(code, tokenRecord.code);
    if (!valid) {
      throw new UnauthorizedException("Invalid or expired code.");
    }

    await this.prisma.verificationToken.update({
      where: { id: tokenRecord.id },
      data: { usedAt: new Date() },
    });

    let user = await this.usersService.findByEmail(email);
    const isNew = !user;

    if (!user) {
      const password = await bcrypt.hash(
        Math.random().toString(36).slice(-12),
        10,
      );
      user = await this.usersService.create({
        email,
        password,
        role: "CUSTOMER" as any,
        ...(phone ? { phone } : {}),
      });
    } else if (phone && !(user as any).phone) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { phone },
      });
    }

    const payload = { email: user.email, sub: user.id };
    return {
      token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      isNew,
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/backend && npx jest auth.service.spec.ts --no-coverage
```

Expected output:

```
PASS src/auth/auth.service.spec.ts
  AuthService OTP
    sendOtp
      ✓ creates a VerificationToken and returns success:true
      ✓ includes devCode in response when RESEND_API_KEY is not set
      ✓ throws HttpException(429) when token created within last 60 seconds
    verifyOtp
      ✓ throws UnauthorizedException when no valid token exists
      ✓ returns JWT + isNew:true for a new user with valid code
      ✓ returns isNew:false for an existing user

Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
```

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/auth/auth.service.ts apps/backend/src/auth/auth.service.spec.ts
git commit -m "feat: add email OTP send/verify to AuthService"
```

---

### Task 3: AuthController OTP Routes

**Files:**

- Modify: `apps/backend/src/auth/auth.controller.ts`

Context: `auth.controller.ts` is at `apps/backend/src/auth/auth.controller.ts`. It currently has `register`, `login`, `getProfile`, `googleAuth`, `googleAuthRedirect`, `sendMagicLink`. Add two new public POST endpoints below `sendMagicLink`. No guards needed — both are public (unauthenticated) endpoints.

- [ ] **Step 1: Add OTP routes to the controller**

Open `apps/backend/src/auth/auth.controller.ts` and add these two methods at the end of the class, after the existing `sendMagicLink` method:

```typescript
@Post('otp/send')
sendOtp(
  @Body('email') email: string,
  @Body('phone') phone?: string,
) {
  return this.authService.sendOtp(email, phone);
}

@Post('otp/verify')
verifyOtp(
  @Body('email') email: string,
  @Body('code') code: string,
  @Body('phone') phone?: string,
) {
  return this.authService.verifyOtp(email, code, phone);
}
```

No new imports needed — `Post`, `Body` are already imported at the top of the file.

- [ ] **Step 2: Verify the backend starts**

```bash
cd apps/backend && npm run start:dev
```

Expected: NestJS boots with no errors. You should see the two new routes registered if you visit `http://localhost:3000/api-docs`.

- [ ] **Step 3: Smoke-test the endpoints**

```bash
curl -s -X POST http://localhost:3000/api/auth/otp/send \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}' | cat
```

Expected (dev mode, no RESEND_API_KEY set):

```json
{ "success": true, "devCode": "XXXXXX" }
```

The 6-digit code is also printed in the NestJS console.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/auth/auth.controller.ts
git commit -m "feat: expose POST /auth/otp/send and /auth/otp/verify endpoints"
```

---

### Task 4: Locale Files — Add All New Keys (EN + BG + RO)

**Files:**

- Modify: `apps/frontend/src/locales/en/translation.json`
- Modify: `apps/frontend/src/locales/bg/translation.json`
- Modify: `apps/frontend/src/locales/ro/translation.json`

Context: All three files are flat JSON with top-level section keys (`nav`, `dashboard`, `publicMenu`, `cart`, etc.). There is currently no `auth` section and no `profile` section. The `publicMenu` section exists but is missing `signIn`, `myProfile`, `calling`, `scanQrForAssistance`, `selectLanguage`, `pairing`, and `drinkUpsell`. Add all new keys in the order shown. BG and RO get translated values.

- [ ] **Step 1: Add new keys to EN translation.json**

In `apps/frontend/src/locales/en/translation.json`:

1. In the `"publicMenu"` object, add these keys after `"trendingNow"`:

```json
"signIn": "Sign In",
"myProfile": "My Profile",
"calling": "Calling…",
"scanQrForAssistance": "Scan your table QR to call for assistance",
"selectLanguage": "Select language",
"pairing": {
  "title": "Perfect Pairing",
  "completeYour": "Complete Your {{name}}",
  "chefDescription": "Exquisite additions selected by our chef to elevate your experience.",
  "noThanks": "No thanks, continue",
  "addToOrder": "Add to order"
},
"drinkUpsell": {
  "title": "Add a Drink?",
  "question": "Wait, would you like a drink with that?",
  "subtitle": "Complete your meal perfectly.",
  "add": "Add",
  "noThanks": "No Thanks",
  "proceedCheckout": "Proceed to Checkout"
}
```

2. Add a new top-level `"auth"` section (after `"common"` or at the end):

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

3. Add a new top-level `"profile"` section:

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

- [ ] **Step 2: Add same keys to BG translation.json**

In `apps/frontend/src/locales/bg/translation.json`:

1. In the `"publicMenu"` object, add after `"trendingNow"`:

```json
"signIn": "Вход",
"myProfile": "Моят профил",
"calling": "Повикване…",
"scanQrForAssistance": "Сканирайте QR кода на масата за помощ",
"selectLanguage": "Избери език",
"pairing": {
  "title": "Перфектно съчетание",
  "completeYour": "Допълни своята {{name}}",
  "chefDescription": "Изискани допълнения, избрани от нашия готвач, за да издигнат вашето изживяване.",
  "noThanks": "Не, благодаря",
  "addToOrder": "Добави към поръчката"
},
"drinkUpsell": {
  "title": "Добави напитка?",
  "question": "Искате ли напитка към вашата поръчка?",
  "subtitle": "Допълнете перфектно вашето хранене.",
  "add": "Добави",
  "noThanks": "Не, благодаря",
  "proceedCheckout": "Продължи към плащане"
}
```

2. Add new top-level `"auth"` section:

```json
"auth": {
  "otp": {
    "title": "Вход или Регистрация",
    "subtitle": "Печелете точки за всяка поръчка",
    "sendCode": "Изпрати код",
    "sending": "Изпращане…",
    "enterCode": "Въведете кода",
    "sentTo": "Изпратихме 6-цифрен код на {{email}}",
    "verify": "Потвърди",
    "verifying": "Потвърждаване…",
    "resend": "Изпрати отново",
    "resendIn": "Изпрати отново след {{seconds}}с",
    "changeEmail": "← Промени имейл",
    "welcomeTitle": "Добре дошли!",
    "welcomeBody": "Ще печелите точки за всяка поръчка. Използвайте ги за безплатна храна и отстъпки.",
    "letsOrder": "Нека поръчаме!",
    "invalidCode": "Невалиден или изтекъл код. Опитайте отново.",
    "tooManyRequests": "Изчакайте малко преди да поискате нов код.",
    "devCodeBanner": "DEV — код: {{code}}",
    "continueWithGoogle": "Продължи с Google",
    "orDivider": "Или",
    "emailPlaceholder": "Имейл адрес",
    "phonePlaceholder": "Телефон (по желание)"
  }
}
```

3. Add new top-level `"profile"` section:

```json
"profile": {
  "title": "Моят профил",
  "welcome": "Добре дошли отново, {{name}}!",
  "subtitle": "Вижте историята на поръчките и лоялните точки.",
  "signOut": "Изход",
  "backToMenu": "← Обратно към менюто",
  "vipTiersTitle": "Вашите VIP нива и точки",
  "currentBalance": "Текущ баланс",
  "multiplier": "Множител",
  "firstReward": "Първа награда €1",
  "ptsToGo": "{{count}} точки остават",
  "readyToRedeem": "Готов за използване",
  "rewardProgress": "{{pct}}% от пътя до първата награда €1.",
  "expiringSoonTitle": "{{value}} EUR в награди изтичат скоро",
  "expiringSoonBody": "{{count}} точки изтичат{{date}}. Върнете се преди да изчезнат.",
  "expiringSoonOn": " на {{date}}",
  "lifetime": "Общо: {{pts}} точки",
  "ptsToTier": "{{count}} точки до {{tier}}",
  "maxTier": "Максимално ниво",
  "pastOrders": "Минали поръчки",
  "loading": "Зареждане на историята…",
  "noOrders": "Все още няма поръчки",
  "noOrdersHint": "Когато поръчате от участващи ресторанти, те ще се появят тук.",
  "at": "в",
  "noItems": "Няма артикули",
  "pleaseLogin": "Влезте, за да видите профила си.",
  "loginButton": "Вход"
}
```

- [ ] **Step 3: Add same keys to RO translation.json**

In `apps/frontend/src/locales/ro/translation.json`:

1. In the `"publicMenu"` object, add after `"trendingNow"`:

```json
"signIn": "Autentificare",
"myProfile": "Profilul meu",
"calling": "Se sună…",
"scanQrForAssistance": "Scanați QR-ul mesei pentru asistență",
"selectLanguage": "Selectați limba",
"pairing": {
  "title": "Combinație perfectă",
  "completeYour": "Completați-vă {{name}}",
  "chefDescription": "Adăugiri rafinate selectate de bucătarul nostru pentru a vă ridica experiența.",
  "noThanks": "Nu, mulțumesc",
  "addToOrder": "Adaugă la comandă"
},
"drinkUpsell": {
  "title": "Adăugați o băutură?",
  "question": "Doriți o băutură cu comanda dumneavoastră?",
  "subtitle": "Completați-vă perfect masa.",
  "add": "Adaugă",
  "noThanks": "Nu, mulțumesc",
  "proceedCheckout": "Continuați la casă"
}
```

2. Add new top-level `"auth"` section:

```json
"auth": {
  "otp": {
    "title": "Conectare sau Înregistrare",
    "subtitle": "Câștigați puncte pentru fiecare comandă",
    "sendCode": "Trimite Cod",
    "sending": "Se trimite…",
    "enterCode": "Introduceți codul",
    "sentTo": "Am trimis un cod de 6 cifre la {{email}}",
    "verify": "Verifică",
    "verifying": "Se verifică…",
    "resend": "Retrimite codul",
    "resendIn": "Retrimite în {{seconds}}s",
    "changeEmail": "← Schimbă emailul",
    "welcomeTitle": "Bine ați venit!",
    "welcomeBody": "Veți câștiga puncte pentru fiecare comandă. Folosiți-le pentru mâncare gratuită și reduceri.",
    "letsOrder": "Să comandăm!",
    "invalidCode": "Cod invalid sau expirat. Încercați din nou.",
    "tooManyRequests": "Așteptați puțin înainte de a solicita alt cod.",
    "devCodeBanner": "DEV — cod: {{code}}",
    "continueWithGoogle": "Continuă cu Google",
    "orDivider": "Sau",
    "emailPlaceholder": "Adresă de email",
    "phonePlaceholder": "Telefon (opțional)"
  }
}
```

3. Add new top-level `"profile"` section:

```json
"profile": {
  "title": "Profilul meu",
  "welcome": "Bine ați revenit, {{name}}!",
  "subtitle": "Vizualizați istoricul comenzilor și punctele de loialitate.",
  "signOut": "Deconectare",
  "backToMenu": "← Înapoi la meniu",
  "vipTiersTitle": "Nivelurile VIP și punctele",
  "currentBalance": "Soldul curent",
  "multiplier": "Multiplicator",
  "firstReward": "Prima recompensă EUR 1",
  "ptsToGo": "{{count}} puncte rămase",
  "readyToRedeem": "Gata de utilizare",
  "rewardProgress": "{{pct}}% din drumul spre prima recompensă EUR 1.",
  "expiringSoonTitle": "EUR {{value}} în recompense expiră curând",
  "expiringSoonBody": "{{count}} puncte expiră{{date}}. Reveniți înainte să dispară.",
  "expiringSoonOn": " pe {{date}}",
  "lifetime": "Total: {{pts}} puncte",
  "ptsToTier": "{{count}} puncte până la {{tier}}",
  "maxTier": "Nivel maxim atins",
  "pastOrders": "Comenzi anterioare",
  "loading": "Se încarcă istoricul…",
  "noOrders": "Nicio comandă încă",
  "noOrdersHint": "Când comandați de la restaurante participante, vor apărea aici.",
  "at": "la",
  "noItems": "Niciun articol",
  "pleaseLogin": "Conectați-vă pentru a vedea profilul.",
  "loginButton": "Autentificare"
}
```

- [ ] **Step 4: Validate JSON is parseable**

```bash
node -e "require('./apps/frontend/src/locales/en/translation.json'); console.log('EN OK')"
node -e "require('./apps/frontend/src/locales/bg/translation.json'); console.log('BG OK')"
node -e "require('./apps/frontend/src/locales/ro/translation.json'); console.log('RO OK')"
```

Expected: `EN OK`, `BG OK`, `RO OK`. Fix any JSON syntax errors before committing.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/locales/
git commit -m "feat: add auth.otp, publicMenu, and profile translation keys (EN/BG/RO)"
```

---

### Task 5: AuthContext — Add `loginWithToken`

**Files:**

- Modify: `apps/frontend/src/context/AuthContext.tsx`

Context: `AuthContext.tsx` is at `apps/frontend/src/context/AuthContext.tsx`. The `AuthContextType` interface has `login`, `register`, `logout`. The `login` method stores the JWT in localStorage, sets `token` state, sets `user` state, and sets the axios header. `loginWithToken` must do the same thing without an API call (we already have the data from the OTP verify response).

- [ ] **Step 1: Add `loginWithToken` to the interface**

In `apps/frontend/src/context/AuthContext.tsx`, change the `AuthContextType` interface by adding the new method:

```typescript
interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<any>;
  register: (email: string, password: string, name?: string) => Promise<any>;
  logout: () => void;
  loginWithToken: (token: string, user: User) => void;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
}
```

- [ ] **Step 2: Implement `loginWithToken` inside `AuthProvider`**

In `apps/frontend/src/context/AuthContext.tsx`, add the `loginWithToken` function inside the `AuthProvider` component body, after the `register` function:

```typescript
const loginWithToken = (token: string, user: User) => {
  localStorage.setItem("token", token);
  setToken(token);
  setUser(user);
  api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
};
```

- [ ] **Step 3: Expose it in the context value**

In the same file, find the `return` statement that wraps children in `AuthContext.Provider`. Add `loginWithToken` to the value object:

```typescript
return (
  <AuthContext.Provider
    value={{
      user,
      token,
      login,
      register,
      logout,
      loginWithToken,
      isLoading,
      isError,
      errorMessage,
    }}
  >
    {children}
  </AuthContext.Provider>
);
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd apps/frontend && npx tsc --noEmit
```

Expected: no errors related to `loginWithToken`.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/context/AuthContext.tsx
git commit -m "feat: add loginWithToken to AuthContext for OTP sign-in"
```

---

### Task 6: CustomerLoginModal — 3-Step OTP Rewrite

**Files:**

- Modify: `apps/frontend/src/components/auth/CustomerLoginModal.tsx`

Context: Full replacement of the existing magic-link modal. The existing file uses a single-step form that calls `POST /auth/magic-link`. Replace entirely with a 3-step state machine: `entry` (email + phone + Google), `otp` (code input + resend countdown), `welcome` (new user only). Requires `loginWithToken` from `AuthContext` (Task 5) and locale keys (Task 4).

- [ ] **Step 1: Replace the entire file**

Replace `apps/frontend/src/components/auth/CustomerLoginModal.tsx` with:

```typescript
import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import api from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useTranslation } from "react-i18next";

interface CustomerLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  returnTo: string;
}

type Step = "entry" | "otp" | "welcome";

export const CustomerLoginModal: React.FC<CustomerLoginModalProps> = ({
  isOpen,
  onClose,
  returnTo,
}) => {
  const { loginWithToken } = useAuth();
  const { t } = useTranslation();

  const [step, setStep] = useState<Step>("entry");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [devCode, setDevCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setStep("entry");
      setEmail("");
      setPhone("");
      setCode("");
      setError("");
      setDevCode("");
      setCountdown(0);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startCountdown = () => {
    setCountdown(60);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      const res = await api.post("/auth/otp/send", {
        email,
        phone: phone || undefined,
      });
      if (res.data.devCode) setDevCode(res.data.devCode);
      setStep("otp");
      startCountdown();
    } catch (err: any) {
      setError(
        err.response?.data?.message || t("auth.otp.tooManyRequests"),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      const res = await api.post("/auth/otp/verify", {
        email,
        code,
        phone: phone || undefined,
      });
      loginWithToken(res.data.token, res.data.user);
      if (res.data.isNew) {
        setStep("welcome");
      } else {
        onClose();
      }
    } catch (err: any) {
      setError(
        err.response?.data?.message || t("auth.otp.invalidCode"),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setIsLoading(true);
    setError("");
    try {
      const res = await api.post("/auth/otp/send", { email });
      if (res.data.devCode) setDevCode(res.data.devCode);
      startCountdown();
    } catch (err: any) {
      setError(
        err.response?.data?.message || t("auth.otp.tooManyRequests"),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleAuth = () => {
    const apiUrl =
      (import.meta as any).env.VITE_API_URL || "http://localhost:3000/api";
    const baseUrl = apiUrl.replace("/api", "");
    window.location.href = `${baseUrl}/api/auth/google?returnTo=${encodeURIComponent(returnTo)}`;
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-background w-full max-w-sm p-6 rounded-2xl shadow-xl relative animate-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          <svg
            width="24"
            height="24"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {step === "entry" && (
          <>
            <h2 className="text-2xl font-bold mb-1 text-center">
              {t("auth.otp.title")}
            </h2>
            <p className="text-sm text-muted-foreground text-center mb-6">
              {t("auth.otp.subtitle")}
            </p>
            <div className="space-y-6">
              <Button
                type="button"
                onClick={handleGoogleAuth}
                variant="outline"
                className="w-full flex items-center justify-center gap-3 h-12 rounded-xl"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                {t("auth.otp.continueWithGoogle")}
              </Button>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    {t("auth.otp.orDivider")}
                  </span>
                </div>
              </div>
              <form onSubmit={handleSendCode} className="space-y-3">
                <Input
                  type="email"
                  placeholder={t("auth.otp.emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 rounded-xl"
                />
                <Input
                  type="tel"
                  placeholder={t("auth.otp.phonePlaceholder")}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-12 rounded-xl"
                />
                {error && (
                  <p className="text-sm text-destructive text-center">
                    {error}
                  </p>
                )}
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 rounded-xl"
                >
                  {isLoading ? t("auth.otp.sending") : t("auth.otp.sendCode")}
                </Button>
              </form>
            </div>
          </>
        )}

        {step === "otp" && (
          <>
            <h2 className="text-2xl font-bold mb-1 text-center">
              {t("auth.otp.enterCode")}
            </h2>
            <p className="text-sm text-muted-foreground text-center mb-4">
              {t("auth.otp.sentTo", { email })}
            </p>
            {devCode && (
              <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-center">
                <p className="text-xs font-mono font-bold text-yellow-600 dark:text-yellow-400">
                  {t("auth.otp.devCodeBanner", { code: devCode })}
                </p>
              </div>
            )}
            <form onSubmit={handleVerify} className="space-y-4">
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                required
                className="h-14 rounded-xl text-center text-2xl font-black tracking-[0.5em]"
                autoFocus
              />
              {error && (
                <p className="text-sm text-destructive text-center">{error}</p>
              )}
              <Button
                type="submit"
                disabled={isLoading || code.length !== 6}
                className="w-full h-12 rounded-xl"
              >
                {isLoading ? t("auth.otp.verifying") : t("auth.otp.verify")}
              </Button>
              <div className="flex justify-between items-center text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setStep("entry");
                    setCode("");
                    setError("");
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {t("auth.otp.changeEmail")}
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={countdown > 0}
                  className="text-accent hover:opacity-70 disabled:opacity-40"
                >
                  {countdown > 0
                    ? t("auth.otp.resendIn", { seconds: countdown })
                    : t("auth.otp.resend")}
                </button>
              </div>
            </form>
          </>
        )}

        {step === "welcome" && (
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-accent"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-2">
              {t("auth.otp.welcomeTitle")}
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              {t("auth.otp.welcomeBody")}
            </p>
            <Button onClick={onClose} className="w-full h-12 rounded-xl">
              {t("auth.otp.letsOrder")}
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Smoke test manually**

Start the dev server (`npm run dev` from root). Open the public menu page. Click "Sign In" in the action bar. Verify:

- Step 1 shows Google button + email + phone fields
- Submit email → advances to step 2 with 6-digit code input
- In dev mode, the yellow banner shows the code
- Enter code → closes modal (returning user) or shows welcome step (new user)
- Resend button shows 60-second countdown

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/auth/CustomerLoginModal.tsx
git commit -m "feat: replace magic link with 3-step email OTP modal"
```

---

### Task 7: PublicMenuPage — Profile Nav + Pass `selectedLang` to CartIcon

**Files:**

- Modify: `apps/frontend/src/pages/PublicMenuPage.tsx`

Context: `PublicMenuPage.tsx` currently imports `{ useParams, useLocation }` from react-router-dom (line 2) — `useNavigate` is NOT imported yet. Lucide imports are `{ Bell, Globe }` (line 9) — `LogOut` is NOT imported yet. The action bar logged-in section is around lines 546–566. `<CartIcon>` is called around line 569 with `categories` and `restaurantId` props — `selectedLang` is NOT passed yet. `selectedLang` state already exists at line 32.

- [ ] **Step 1: Add `useNavigate` to react-router-dom import**

Change line 2 from:

```typescript
import { useParams, useLocation } from "react-router-dom";
```

to:

```typescript
import { useParams, useLocation, useNavigate } from "react-router-dom";
```

- [ ] **Step 2: Add `LogOut` to lucide-react import**

Change line 9 from:

```typescript
import { Bell, Globe } from "lucide-react";
```

to:

```typescript
import { Bell, Globe, LogOut } from "lucide-react";
```

- [ ] **Step 3: Add `navigate` constant inside component**

After `const location = useLocation();` (line 18), add:

```typescript
const navigate = useNavigate();
```

- [ ] **Step 4: Replace the logged-in action bar section**

Find this block (around lines 546–566):

```jsx
{user ? (
  <button
    onClick={() => logout()}
    aria-label={t("publicMenu.logout", "Sign out")}
    className="flex flex-col items-center justify-center px-3 md:px-4 min-h-[48px] hover:opacity-70 transition-opacity flex-shrink-0"
  >
    <span className="text-xs font-black uppercase text-accent truncate max-w-[64px] md:max-w-[80px]">
      {user.name?.split(" ")[0] || "Me"}
    </span>
    <span className="text-[10px] font-medium text-muted-foreground uppercase">
      {t("publicMenu.logout", "Logout")}
    </span>
  </button>
) : (
```

Replace with:

```jsx
{user ? (
  <div className="flex items-center gap-0.5 flex-shrink-0">
    <button
      onClick={() =>
        navigate(
          `/profile?returnTo=${encodeURIComponent(
            location.pathname + location.search,
          )}`,
        )
      }
      className="flex flex-col items-center justify-center px-2 md:px-3 min-h-[48px] hover:opacity-70 transition-opacity"
    >
      <span className="text-xs font-black uppercase text-accent truncate max-w-[56px] md:max-w-[72px]">
        {user.name?.split(" ")[0] || t("publicMenu.myProfile")}
      </span>
      <span className="text-[10px] font-medium text-muted-foreground uppercase">
        {t("publicMenu.myProfile")}
      </span>
    </button>
    <button
      onClick={() => logout()}
      aria-label={t("publicMenu.logout")}
      className="p-2 hover:opacity-70 transition-opacity"
    >
      <LogOut className="w-4 h-4 text-muted-foreground" />
    </button>
  </div>
) : (
```

- [ ] **Step 5: Pass `selectedLang` to CartIcon**

Find the `<CartIcon>` JSX (around line 569):

```jsx
<CartIcon categories={menuData?.categories} restaurantId={restaurantId} />
```

Change to:

```jsx
<CartIcon
  categories={menuData?.categories}
  restaurantId={restaurantId}
  selectedLang={selectedLang}
/>
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd apps/frontend && npx tsc --noEmit
```

Expected: error about `selectedLang` prop not existing on `CartIcon` — this is expected and will be fixed in Task 9.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/pages/PublicMenuPage.tsx
git commit -m "feat: add profile nav to public menu action bar, forward selectedLang to CartIcon"
```

---

### Task 8: CustomerProfilePage — Translation + Back Button

**Files:**

- Modify: `apps/frontend/src/pages/CustomerProfilePage.tsx`

Context: The full file was read. It has ~20 hardcoded English strings and hardcoded tier-threshold comparisons for colors (uses `acc.lifetimePoints >= 2000`). The spec says to use `acc.tier` directly. The file currently imports `useAuth`, `api`, `useNavigate`, `Button`. Add `useTranslation` and `useSearchParams` imports. `useSearchParams` is from `react-router-dom`.

- [ ] **Step 1: Replace the entire file**

Replace `apps/frontend/src/pages/CustomerProfilePage.tsx` with:

```typescript
import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../lib/api";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { useTranslation } from "react-i18next";

export const CustomerProfilePage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const returnTo = searchParams.get("returnTo");

  const [history, setHistory] = useState<any[]>([]);
  const [loyaltyAccounts, setLoyaltyAccounts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      setIsLoading(true);
      Promise.all([
        api.get("/loyalty/orders/history"),
        api.get("/loyalty/accounts"),
      ])
        .then(([historyRes, accountsRes]) => {
          setHistory(historyRes.data || []);
          setLoyaltyAccounts(accountsRes.data || []);
        })
        .catch((err) => {
          console.error("Failed to load profile data:", err);
          setHistory([]);
          setLoyaltyAccounts([]);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [user]);

  if (!user) {
    return (
      <div className="pt-32 text-center">
        <p>{t("profile.pleaseLogin")}</p>
        <Button onClick={() => navigate("/login")} className="mt-4">
          {t("profile.loginButton")}
        </Button>
      </div>
    );
  }

  return (
    <div className="pt-28 pb-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto min-h-screen">
      <div className="flex justify-between items-center mb-10">
        <div>
          {returnTo && (
            <button
              onClick={() => navigate(returnTo)}
              className="text-sm text-muted-foreground hover:text-foreground mb-2 flex items-center gap-1 transition-colors"
            >
              {t("profile.backToMenu")}
            </button>
          )}
          <h1 className="text-4xl font-serif font-black text-foreground tracking-tighter">
            {t("profile.title")}
          </h1>
        </div>
        <Button variant="outline" onClick={logout}>
          {t("profile.signOut")}
        </Button>
      </div>

      <div className="glass-panel p-8 rounded-[2rem] border-white/5 mb-8">
        <h2 className="text-2xl font-bold mb-2">
          {t("profile.welcome", {
            name: user.name || user.email.split("@")[0],
          })}
        </h2>
        <p className="text-muted-foreground">{t("profile.subtitle")}</p>
      </div>

      {loyaltyAccounts.length > 0 && (
        <div className="glass-panel p-8 rounded-[2rem] border-white/5 mb-8">
          <h2 className="text-xl font-bold mb-6">{t("profile.vipTiersTitle")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {loyaltyAccounts.map((acc: any) => {
              const tier: string = acc.tier ?? "Bronze";
              const tierLower = tier.toLowerCase();
              const multiplier = `${acc.tierMultiplier ?? 1.0}x`;
              const nextTierName: string = acc.nextTierName ?? "Silver";
              const pointsToNext: number = acc.pointsToNextTier ?? 0;
              const progressStr = `${Math.min(100, acc.tierProgressPercent ?? 0)}%`;
              const borderColor =
                tierLower === "gold"
                  ? "border-yellow-500"
                  : tierLower === "silver"
                    ? "border-slate-400"
                    : "border-orange-700";
              const bgColor =
                tierLower === "gold"
                  ? "bg-yellow-500/10"
                  : tierLower === "silver"
                    ? "bg-slate-400/10"
                    : "bg-orange-700/10";
              const textColor =
                tierLower === "gold"
                  ? "text-yellow-500"
                  : tierLower === "silver"
                    ? "text-slate-300"
                    : "text-orange-600";
              const rewardValue: number =
                typeof acc.rewardValue === "number"
                  ? acc.rewardValue
                  : acc.points / (acc.restaurant?.loyaltyRedeemRate || 150);
              const rewardProgress: number = acc.firstRewardProgressPercent ?? 0;
              const pointsToFirstReward: number = acc.pointsToFirstReward ?? 0;
              const expiringSoonPoints = acc.expiringSoonPoints || 0;
              const expiringSoonValue = acc.expiringSoonValue || 0;
              const nextExpirationAt = acc.nextExpirationAt
                ? new Date(acc.nextExpirationAt)
                : null;

              return (
                <div
                  key={acc.id}
                  className={`p-6 border ${borderColor} ${bgColor} rounded-2xl`}
                >
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-black text-lg text-foreground">
                      {acc.restaurant.name}
                    </h3>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold bg-background ${textColor} border ${borderColor}`}
                    >
                      {tier}
                    </span>
                  </div>

                  <div className="flex justify-between items-end mb-4">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                        {t("profile.currentBalance")}
                      </p>
                      <p className={`text-3xl font-black ${textColor}`}>
                        {acc.points} pts
                      </p>
                      <p className="text-sm font-bold text-muted-foreground mt-1">
                        Value: EUR {rewardValue.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                        {t("profile.multiplier")}
                      </p>
                      <p className={`text-xl font-bold ${textColor}`}>
                        {multiplier}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-white/10">
                    <div className="flex justify-between text-xs text-muted-foreground mb-2">
                      <span>{t("profile.firstReward")}</span>
                      {pointsToFirstReward > 0 ? (
                        <span>
                          {t("profile.ptsToGo", {
                            count: pointsToFirstReward,
                          })}
                        </span>
                      ) : (
                        <span>{t("profile.readyToRedeem")}</span>
                      )}
                    </div>
                    <div className="w-full bg-black/40 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${textColor.replace("text-", "bg-")}`}
                        style={{ width: `${rewardProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {t("profile.rewardProgress", { pct: rewardProgress })}
                    </p>
                  </div>

                  {expiringSoonPoints > 0 && (
                    <div className="mt-4 rounded-xl border border-yellow-500/25 bg-yellow-500/10 p-3">
                      <p className="text-xs font-bold text-yellow-600 dark:text-yellow-400">
                        {t("profile.expiringSoonTitle", {
                          value: expiringSoonValue.toFixed(2),
                        })}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t("profile.expiringSoonBody", {
                          count: expiringSoonPoints,
                          date: nextExpirationAt
                            ? t("profile.expiringSoonOn", {
                                date: nextExpirationAt.toLocaleDateString(),
                              })
                            : "",
                        })}
                      </p>
                    </div>
                  )}

                  <div className="mt-4 pt-4 border-t border-white/10">
                    <div className="flex justify-between text-xs text-muted-foreground mb-2">
                      <span>
                        {t("profile.lifetime", { pts: acc.lifetimePoints })}
                      </span>
                      {pointsToNext > 0 ? (
                        <span>
                          {t("profile.ptsToTier", {
                            count: pointsToNext,
                            tier: nextTierName,
                          })}
                        </span>
                      ) : (
                        <span>{t("profile.maxTier")}</span>
                      )}
                    </div>
                    <div className="w-full bg-black/40 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${textColor.replace("text-", "bg-")}`}
                        style={{ width: progressStr }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="glass-panel p-8 rounded-[2rem] border-white/5">
        <h2 className="text-xl font-bold mb-6">{t("profile.pastOrders")}</h2>
        {isLoading ? (
          <p className="text-muted-foreground">{t("profile.loading")}</p>
        ) : history.length === 0 ? (
          <div className="text-center py-10 opacity-60">
            <p className="font-bold mb-2">{t("profile.noOrders")}</p>
            <p className="text-sm">{t("profile.noOrdersHint")}</p>
          </div>
        ) : (
          <ul className="space-y-6">
            {history.map((order) => (
              <li
                key={order.id}
                className="p-6 bg-accent/5 border border-accent/10 rounded-2xl flex flex-col sm:flex-row justify-between sm:items-center gap-4"
              >
                <div>
                  <h3 className="font-black text-lg">{order.restaurant.name}</h3>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mt-1">
                    {new Date(order.createdAt).toLocaleDateString()}{" "}
                    {t("profile.at")}{" "}
                    {new Date(order.createdAt).toLocaleTimeString()}
                  </p>
                  <p className="text-sm mt-3 font-medium">
                    {order.items
                      ?.map(
                        (i: any) =>
                          `${i.quantity}x ${i.menuItem?.name || t("profile.noItems")}`,
                      )
                      .join(", ") || t("profile.noItems")}
                  </p>
                </div>
                <div className="text-left sm:text-right shrink-0">
                  <p className="font-bold text-2xl">
                    €{order.totalPrice.toFixed(2)}
                  </p>
                  <div className="mt-2 inline-flex items-center gap-2 bg-green-500/10 text-green-600 px-3 py-1 rounded-full text-xs font-bold">
                    <span>+{order.pointsEarned} Pts</span>
                    {order.pointsRedeemed > 0 && (
                      <span className="text-red-500 ml-1">
                        (-{order.pointsRedeemed} Pts)
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default CustomerProfilePage;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/CustomerProfilePage.tsx
git commit -m "feat: translate CustomerProfilePage and add returnTo back button"
```

---

### Task 9: Cart Language Sync + Upsell String Translations

**Files:**

- Modify: `apps/frontend/src/components/cart/CartIcon.tsx`
- Modify: `apps/frontend/src/components/cart/CartDrawer.tsx`

Context: `CartIcon.tsx` currently has `CartIconProps { categories?: Category[]; restaurantId?: string }`. `CartDrawer.tsx` renders `{item.name}` directly (line 189) — this is the snapshot name from add-time. `CartDrawer` also has 6 hardcoded strings: "Add a Drink?" (header, line 85), "Wait, would you like a drink with that?" (line 116), "Complete your meal perfectly." (line 118), "Add" button (line 150), "Proceed to Checkout" (line 248 — inside the upsell footer, different from the normal checkout button which already uses `t()`), "No Thanks" (line 252).

- [ ] **Step 1: Add `selectedLang` prop to CartIcon**

Replace `apps/frontend/src/components/cart/CartIcon.tsx` with:

```typescript
import { useState } from "react";
import { useCart } from "../../context/CartContext";
import { ShoppingCart } from "lucide-react";
import CartDrawer from "./CartDrawer";
import { Category } from "../../types";

interface CartIconProps {
  categories?: Category[];
  restaurantId?: string;
  selectedLang?: string;
}

const CartIcon = ({ categories, restaurantId, selectedLang }: CartIconProps) => {
  const { getItemCount } = useCart();
  const [isVisible, setIsVisible] = useState(false);

  const hasItems = getItemCount() > 0;

  const toggleCart = () => {
    setIsVisible(!isVisible);
  };

  return (
    <>
      <button
        onClick={toggleCart}
        className="relative p-3 rounded-2xl transition-all duration-300 hover:bg-black/5 dark:hover:bg-white/5 group active:scale-95"
        aria-label="Open Cart"
      >
        <ShoppingCart
          size={22}
          className="text-foreground group-hover:scale-110 transition-transform"
        />
        {hasItems && (
          <span className="absolute -top-1 -right-1 bg-accent text-accent-foreground text-[10px] font-black rounded-full h-5 w-5 flex items-center justify-center shadow-lg border-2 border-zinc-950 dark:border-white">
            {getItemCount()}
          </span>
        )}
      </button>
      <CartDrawer
        isOpen={isVisible}
        onClose={() => setIsVisible(false)}
        categories={categories}
        restaurantId={restaurantId}
        selectedLang={selectedLang}
      />
    </>
  );
};

export default CartIcon;
```

- [ ] **Step 2: Add `resolveItemName` + `selectedLang` prop + translation fixes to CartDrawer**

Replace `apps/frontend/src/components/cart/CartDrawer.tsx` with:

```typescript
import { createPortal } from "react-dom";
import { useCart } from "../../context/CartContext";
import { Button } from "../ui/button";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Category } from "../../types";

function resolveItemName(
  cartItem: { id: string; name: string },
  categories: Category[],
  lang: string,
): string {
  for (const cat of categories) {
    const found = (cat.items as any[])?.find((i: any) => i.id === cartItem.id);
    if (found) {
      return (
        (lang && (found.translations as any)?.[lang]?.name) ||
        found.name ||
        cartItem.name
      );
    }
  }
  return cartItem.name;
}

const CartDrawer = ({
  isOpen,
  onClose,
  categories,
  restaurantId,
  selectedLang,
}: {
  isOpen: boolean;
  onClose: () => void;
  categories?: Category[];
  restaurantId?: string;
  selectedLang?: string;
}) => {
  const { items, getTotal, clearCart, removeItem, addItem } = useCart();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [showDrinkUpsell, setShowDrinkUpsell] = useState(false);

  if (!isOpen && showDrinkUpsell) {
    setShowDrinkUpsell(false);
  }

  if (!isOpen) return null;

  const handleCheckout = () => {
    if (categories && categories.length > 0) {
      const hasDrinks = items.some((cartItem) => {
        const cat = categories.find((c: Category) =>
          c.items?.some((i: any) => i.id === cartItem.id),
        );
        return cat?.isDrinkCategory;
      });

      const drinkCategory = categories.find((c: Category) => c.isDrinkCategory);

      if (!hasDrinks && drinkCategory && drinkCategory.items?.length > 0) {
        setShowDrinkUpsell(true);
        return;
      }
    }
    finishCheckout();
  };

  const finishCheckout = () => {
    setShowDrinkUpsell(false);
    onClose();
    navigate("/checkout", { state: { restaurantId } });
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] transition-opacity"
      onClick={onClose}
    >
      <div
        className={[
          "fixed bottom-0 left-0 right-0 flex flex-col",
          "h-[88vh] rounded-t-[2.5rem]",
          "md:top-0 md:right-0 md:bottom-auto md:left-auto",
          "md:h-full md:w-full md:max-w-sm md:rounded-l-[2.5rem] md:rounded-tr-none",
          "glass-panel bg-zinc-950/97 shadow-2xl z-[10000]",
          "border border-white/10",
          "cart-panel-enter",
        ].join(" ")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="md:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        <div className="flex justify-between items-center px-6 py-5 md:p-8 border-b border-white/5 flex-shrink-0">
          <h2 className="text-2xl md:text-3xl font-serif font-black text-zinc-100 tracking-tighter">
            {showDrinkUpsell
              ? t("publicMenu.drinkUpsell.title")
              : t("cart.yourOrder")}
          </h2>
          <button
            onClick={onClose}
            className="p-2.5 bg-white/5 hover:bg-white/10 rounded-full text-zinc-400 transition-all hover:text-zinc-100"
            aria-label="Close cart"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-grow overflow-y-auto p-5 md:p-6 hide-scrollbar">
          {showDrinkUpsell ? (
            <div className="space-y-5">
              <div className="text-center p-5 bg-accent/10 border border-accent/20 rounded-2xl mb-6">
                <span className="text-4xl block mb-3">🥤</span>
                <h3 className="text-lg font-bold text-white leading-tight mb-2">
                  {t("publicMenu.drinkUpsell.question")}
                </h3>
                <p className="text-sm text-zinc-400">
                  {t("publicMenu.drinkUpsell.subtitle")}
                </p>
              </div>
              <ul className="space-y-3">
                {categories
                  ?.find((c) => c.isDrinkCategory)
                  ?.items?.slice(0, 4)
                  .map((drink: any) => (
                    <li
                      key={`upsell-${drink.id}`}
                      className="flex justify-between items-center p-4 bg-white/5 rounded-[1.5rem] border border-white/5"
                    >
                      <div className="font-bold text-zinc-100 text-[15px]">
                        {resolveItemName(
                          { id: drink.id, name: drink.name },
                          categories || [],
                          selectedLang || "",
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-accent">
                          €{drink.price.toFixed(2)}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            addItem({
                              id: drink.id,
                              name: drink.name,
                              price: drink.price,
                              quantity: 1,
                              selectedOptions: [],
                              cartId: `${drink.id}-${Date.now()}`,
                            });
                          }}
                          className="h-9 min-w-[60px] rounded-full border-accent text-accent px-4 py-0"
                        >
                          {t("publicMenu.drinkUpsell.add")}
                        </Button>
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center text-zinc-500 font-medium flex flex-col items-center justify-center h-full opacity-40">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="64"
                height="64"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mb-6"
              >
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
              <span className="text-sm font-bold uppercase tracking-widest">
                {t("cart.empty")}
              </span>
            </div>
          ) : (
            <ul className="space-y-5">
              {items.map((item) => (
                <li key={item.cartId} className="flex gap-3">
                  <div className="w-11 h-11 bg-white/5 rounded-2xl flex items-center justify-center text-accent font-serif font-black text-base shrink-0 border border-white/5">
                    {item.quantity}×
                  </div>
                  <div className="flex-grow min-w-0">
                    <p className="font-bold text-zinc-100 text-base leading-tight tracking-tight">
                      {resolveItemName(
                        item,
                        categories || [],
                        selectedLang || "",
                      )}
                    </p>
                    {item.selectedOptions && item.selectedOptions.length > 0 && (
                      <ul className="text-xs text-muted-foreground mt-1.5 space-y-1">
                        {item.selectedOptions.map((opt: any, idx: number) => (
                          <li
                            key={`${item.cartId}-opt-${idx}`}
                            className="flex items-center gap-1.5"
                          >
                            <span className="w-1 h-1 rounded-full bg-accent/50 block flex-shrink-0" />
                            {opt.choiceName}{" "}
                            <span className="text-accent/70 font-semibold">
                              (+€{(opt.priceModifier || 0).toFixed(2)})
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="text-right flex flex-col justify-between shrink-0">
                    <p className="font-bold text-base text-zinc-100">
                      €{(item.price * item.quantity).toFixed(2)}
                    </p>
                    <button
                      onClick={() => removeItem(item.cartId)}
                      className="text-xs font-semibold text-red-500 hover:text-red-400 transition-colors mt-2"
                    >
                      {t("cart.remove")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div
            className="px-5 pt-5 pb-5 md:p-8 border-t border-white/5 bg-white/5 flex-shrink-0 rounded-t-none rounded-b-none md:rounded-bl-[2.5rem]"
            style={{
              paddingBottom:
                "max(1.25rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))",
            }}
          >
            <div className="flex justify-between items-baseline mb-6">
              <span className="text-zinc-400 font-bold uppercase tracking-widest text-[10px]">
                {t("cart.total")}
              </span>
              <span className="text-3xl font-serif font-black text-accent tracking-tighter">
                €{getTotal().toFixed(2)}
              </span>
            </div>
            {showDrinkUpsell ? (
              <div className="space-y-3">
                <button
                  onClick={finishCheckout}
                  className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-black uppercase tracking-widest py-4 px-6 rounded-2xl shadow-2xl shadow-accent/20 transition-all active:scale-95 text-xs"
                >
                  {t("cart.proceedCheckout")}
                </button>
                <button
                  onClick={finishCheckout}
                  className="w-full bg-transparent border border-white/10 hover:bg-white/5 text-zinc-300 font-bold py-3 px-6 rounded-2xl transition-all text-[11px] uppercase tracking-widest"
                >
                  {t("publicMenu.drinkUpsell.noThanks")}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={handleCheckout}
                  className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-black uppercase tracking-widest py-4 px-6 rounded-2xl shadow-2xl shadow-accent/20 transition-all active:scale-95 text-[11px]"
                >
                  {t("cart.proceedCheckout")}
                </button>
                <button
                  onClick={clearCart}
                  className="w-full bg-transparent hover:bg-white/5 text-zinc-500 hover:text-zinc-300 font-bold py-3 px-6 rounded-2xl transition-all text-[10px] uppercase tracking-widest"
                >
                  {t("cart.clearCart")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default CartDrawer;
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/frontend && npx tsc --noEmit
```

Expected: no errors (the `selectedLang` prop warning from Task 7 should now be gone too).

- [ ] **Step 4: Manual smoke test**

Start dev server. Add items to cart in EN, switch language to BG, open cart. Verify: item names show Bulgarian translations (e.g., "Салата с авокадо и цитрусови плодове" → "Avocado Citrus Salad" in EN, or vice versa). Verify drink upsell strings are translated when it appears.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/cart/CartIcon.tsx apps/frontend/src/components/cart/CartDrawer.tsx
git commit -m "fix: cart items resolve translated name on language switch; translate upsell strings"
```

---

### Task 10: ItemWithOptions — VARIATION Pre-selection + Pairing Translations

**Files:**

- Modify: `apps/frontend/src/components/menu/ItemWithOptions.tsx`

Context: `ItemWithOptions.tsx` already imports `useTranslation` (line 5) and uses `{ t, i18n }` (line 33). `selectedOptions` state is at line 15: `const [selectedOptions, setSelectedOptions] = useState<Record<string, OptionChoice>>({})`. The VARIATION pre-selection `useEffect` must be added after the state declarations (after the cleanup effect at line 47). The 5 hardcoded strings are at lines 299, 303, 307, 314, 348.

- [ ] **Step 1: Add VARIATION pre-selection `useEffect`**

In `apps/frontend/src/components/menu/ItemWithOptions.tsx`, add this `useEffect` after the existing cleanup effect (which ends at line 49):

```typescript
// Pre-select first choice for each VARIATION option when item changes
useEffect(() => {
  if (!item.options?.length) return;
  setSelectedOptions((prev) => {
    const init: Record<string, any> = { ...prev };
    (item.options as any[]).forEach((opt: any) => {
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

- [ ] **Step 2: Replace the 5 hardcoded pairing strings**

In `apps/frontend/src/components/menu/ItemWithOptions.tsx`:

Line 299 — change:

```jsx
<span className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-foreground">
  Perfect Pairing
</span>
```

to:

```jsx
<span className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-foreground">
  {t("publicMenu.pairing.title")}
</span>
```

Lines 302–304 — change:

```jsx
<h3 className="text-4xl sm:text-5xl font-serif font-black text-white tracking-tighter leading-[0.95] mb-6">
  Complete Your <br className="hidden sm:block" /> {item.name}
</h3>
```

to:

```jsx
<h3 className="text-4xl sm:text-5xl font-serif font-black text-white tracking-tighter leading-[0.95] mb-6">
  {t("publicMenu.pairing.completeYour", { name: item.name })}
</h3>
```

Line 307 — change:

```jsx
Exquisite additions selected by our chef to elevate your experience.
```

to:

```jsx
{
  t("publicMenu.pairing.chefDescription");
}
```

Line 314 — change:

```jsx
No thanks, continue
```

to:

```jsx
{
  t("publicMenu.pairing.noThanks");
}
```

Line 348 — change:

```jsx
Add to order
```

to:

```jsx
{
  t("publicMenu.pairing.addToOrder");
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual smoke test**

Open the public menu. Open an item that has VARIATION-type options (e.g., Fine de Claire Oysters with Half Dozen / Full Dozen). Verify:

- The modal opens with the first option (Half Dozen) pre-selected
- The base item without any option is no longer orderable
- The "Perfect Pairing" modal text renders in the current language

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/menu/ItemWithOptions.tsx
git commit -m "fix: pre-select first VARIATION option; translate pairing modal strings"
```

---

### Task 11: PrintableQRCodes — Single-Column A4 Layout

**Files:**

- Modify: `apps/frontend/src/components/tables/PrintableQRCodes.tsx`

Context: Current layout uses `grid grid-cols-2 gap-8 p-8` (line 24) causing QR cards to be side-by-side. When there are more than 2 tables or when a card falls at a page boundary, cards are cut or overflow. Fix: single-column layout with A4 page rules so each card is full-width and fits 2 per printed A4 page.

- [ ] **Step 1: Replace the component**

Replace `apps/frontend/src/components/tables/PrintableQRCodes.tsx` with:

```typescript
import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface PrintableQRCodesProps {
  restaurant: any;
  tables: any[];
}

const PrintableQRCodes: React.FC<PrintableQRCodesProps> = ({ restaurant, tables }) => {
  if (!tables || tables.length === 0) return null;

  const getQrCodeUrl = (tableName: string) => {
    return `${window.location.origin}/menu/public/${restaurant.id}?table=${encodeURIComponent(tableName)}`;
  };

  const logoUrl = restaurant.logoUrl?.startsWith('http')
    ? restaurant.logoUrl
    : restaurant.logoUrl
        ? `${(import.meta as any).env.VITE_API_URL || 'http://localhost:3000/api'}`.replace('/api', '') + `/${restaurant.logoUrl}`
        : null;

  return (
    <div className="hidden print:block absolute inset-0 bg-white z-[99999] print-container">
      <style>{`
        @page { size: A4 portrait; margin: 12mm; }
        body { margin: 0; }
      `}</style>
      <div className="grid grid-cols-1" style={{ width: '100%' }}>
        {tables.map((table) => (
          <div
            key={table.id}
            className="flex flex-col items-center justify-center p-8 border-4 border-dashed border-gray-300 rounded-3xl"
            style={{
              breakInside: 'avoid',
              pageBreakInside: 'avoid',
              minHeight: '140mm',
              maxHeight: '148mm',
              width: '100%',
              marginBottom: '4mm',
            }}
          >
            {logoUrl && (
              <img
                src={logoUrl}
                alt="Restaurant Logo"
                className="h-16 object-contain mb-6"
              />
            )}

            <h2
              className="text-2xl font-serif font-black mb-2 text-center"
              style={{ color: restaurant.accentColor || '#000' }}
            >
              {restaurant.name}
            </h2>

            <p className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-8 text-center">
              Scan to view menu &amp; order
            </p>

            <div className="p-4 bg-white rounded-3xl shadow-lg border border-gray-100 mb-8">
              <QRCodeSVG
                value={getQrCodeUrl(table.name)}
                size={200}
                fgColor={restaurant.accentColor || '#000000'}
                bgColor="#ffffff"
                level="H"
                imageSettings={
                  logoUrl
                    ? {
                        src: logoUrl,
                        height: 44,
                        width: 44,
                        excavate: true,
                      }
                    : undefined
                }
              />
            </div>

            <div className="w-full text-center py-4 bg-gray-50 rounded-2xl">
              <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-1">
                Table
              </p>
              <p className="text-4xl font-black">{table.name}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PrintableQRCodes;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual print test**

Open the dashboard → Tables tab. Click "Print All QR Codes". Use browser print preview (Ctrl+P). Verify: cards appear one per column, no cards cut between pages, each card fits within an A4 page.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/tables/PrintableQRCodes.tsx
git commit -m "fix: QR print layout — single column, A4 page rules, no cross-page card cuts"
```

---

### Task 12: AnalyticsView — Fix Axis Labels in Dark Mode

**Files:**

- Modify: `apps/frontend/src/pages/Dashboard/AnalyticsView.tsx`

Context: Recharts renders `<XAxis>` and `<YAxis>` as SVG `<text>` elements. The current code sets `tick={{ fill: 'currentColor' }}` on axes with `className="text-muted-foreground"`. In dark mode, SVG `currentColor` does not reliably inherit the CSS `color` property from parent elements — the text renders black, invisible against a dark background. Fix: replace `fill: 'currentColor'` with the explicit HSL CSS variable `hsl(var(--color-muted-foreground))` on all axis ticks.

There are 5 axes with this issue. The `CustomTooltip` already uses `glass-panel` and Tailwind text classes, so it works correctly in dark mode and needs no change.

- [ ] **Step 1: Replace `fill: 'currentColor'` with explicit HSL on all axes**

In `apps/frontend/src/pages/Dashboard/AnalyticsView.tsx`, make these 5 changes:

**AreaChart (Revenue Trend) — XAxis around line 196:**
Change `tick={{ fontSize: 10, fontWeight: 900, fill: 'currentColor' }}` to:

```jsx
tick={{ fontSize: 10, fontWeight: 900, fill: 'hsl(var(--color-muted-foreground))' }}
```

Also remove `className="text-muted-foreground"` from the same XAxis (it is redundant after this fix).

**AreaChart (Revenue Trend) — YAxis around line 205:**
Change `tick={{ fontSize: 10, fontWeight: 900, fill: 'currentColor' }}` to:

```jsx
tick={{ fontSize: 10, fontWeight: 900, fill: 'hsl(var(--color-muted-foreground))' }}
```

Remove `className="text-muted-foreground"` from the same YAxis.

**BarChart (Popular Selections) — YAxis around line 245:**
Change `tick={{ fontSize: 10, fontWeight: 800, fill: 'currentColor' }}` to:

```jsx
tick={{ fontSize: 10, fontWeight: 800, fill: 'hsl(var(--color-foreground))' }}
```

(Item names use `foreground`, not muted — they are primary content.)
Remove `className="text-foreground"`.

**BarChart (Peak Hours) — XAxis around line 268:**
Change `tick={{ fontSize: 9, fontWeight: 800, fill: 'currentColor' }}` to:

```jsx
tick={{ fontSize: 9, fontWeight: 800, fill: 'hsl(var(--color-muted-foreground))' }}
```

Remove `className="text-muted-foreground"`.

**BarChart (Top Tables) — XAxis and YAxis around lines 329–330:**
Change both `tick={{ fontSize: 10, fontWeight: 800, fill: 'currentColor' }}` to:

```jsx
tick={{ fontSize: 10, fontWeight: 800, fill: 'hsl(var(--color-muted-foreground))' }}
```

Remove `className="text-muted-foreground"` from both.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual dark mode test**

Open the dashboard. Switch to dark mode (ThemeToggle). Go to Analytics tab. Verify: all axis labels (dates, item names, hour labels, table names, revenue values) are now visible — they should appear in the muted foreground color.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/pages/Dashboard/AnalyticsView.tsx
git commit -m "fix: analytics chart axis labels visible in dark mode"
```

---

### Task 13: MenuService — Remove Category Image Audit Rule

**Files:**

- Modify: `apps/backend/src/menu/menu.service.ts`

Context: The audit function at `apps/backend/src/menu/menu.service.ts` around lines 859–868 adds an `info`-level issue "Category has no banner image. Adding one improves visual appeal." for every category that lacks an `imageUrl`. There is no UI in the menu editor to add category images, so this rule fires for all categories and is misleading. Delete the 10-line block.

- [ ] **Step 1: Delete the category image audit rule**

In `apps/backend/src/menu/menu.service.ts`, find and delete this entire block (approximately lines 859–868):

```typescript
// Rule: Category has no image
if (!(category as any).imageUrl) {
  issues.push({
    type: "info",
    message: "Category has no banner image. Adding one improves visual appeal.",
    categoryId: category.id,
    field: "imageUrl",
  });
}
```

Leave the surrounding code (empty-category check before it, missing-translations check after it) intact.

- [ ] **Step 2: Run backend tests**

```bash
cd apps/backend && npm test
```

Expected: all tests pass (or the same number as before — no new failures).

- [ ] **Step 3: Manual smoke test**

Start the backend (`npm run start:dev` in `apps/backend`). Open the dashboard → Menu Editor → Menu Health widget. Verify: "Category has no banner image" no longer appears in the audit results. "Category is empty" and "Item has no image" issues still appear correctly.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/menu/menu.service.ts
git commit -m "fix: remove spurious category image audit rule (no UI to add category images)"
```
