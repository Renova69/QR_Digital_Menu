# Analytics Fix + Translation Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix analytics timezone bugs and real-time freshness, then migrate translation to a platform-managed DeepL key with lazy on-demand public menu translation and a clean owner UI.

**Architecture:** Two independent subsystems. Analytics: backend Luxon date/hour grouping + frontend staleTime=0 + socket-driven cache invalidation. Translation: TranslationService reads key from env, remove per-restaurant key from DTO/UI, MenuService fires pre-warm in background on save, public menu endpoint translates missing content on-demand and writes to DB cache.

**Tech Stack:** NestJS 11 + Prisma 6 (Neon Postgres), Luxon (already in backend), DeepL REST API via axios, React 18 + TanStack Query v5 + i18next + socket.io-client.

---

## File Map

| File | Change |
|------|--------|
| `apps/backend/.env` | Add `DEEPL_API_KEY` placeholder |
| `apps/backend/src/dashboard/dashboard.service.ts` | Fetch restaurant.timezone; Luxon in getRevenueTrend, getPeakHours, getSummary |
| `apps/backend/src/translation/translation.service.ts` | Drop `apiKey` param, read from env |
| `apps/backend/src/restaurants/dto/update-restaurant.dto.ts` | Remove `deeplApiKey` field |
| `apps/backend/src/restaurants/restaurants.service.ts` | Drop `deeplApiKey` guard in `translateAll` |
| `apps/backend/src/menu/menu.service.ts` | Fire-and-forget pre-warm on create/update; add lazy translate to `getPublicMenu` |
| `apps/backend/src/menu/public-menu.controller.ts` | Accept `?lang` query param |
| `apps/frontend/src/hooks/useAnalytics.ts` | `staleTime: 0` |
| `apps/frontend/src/context/OrderContext.tsx` | Invalidate `['analytics']` on socket events |
| `apps/frontend/src/pages/Dashboard/SettingsView.tsx` | Remove API key field/state/guard; add English to AVAILABLE_LANGUAGES |
| `apps/frontend/src/i18n.ts` | `fallbackLng: 'bg'` |
| `apps/frontend/src/components/Header.tsx` | Add language picker (i18next) |
| `apps/frontend/src/locales/en/translation.json` | Audit + fill missing keys |
| `apps/frontend/src/locales/bg/translation.json` | Audit + fill missing keys |
| `apps/frontend/src/locales/ro/translation.json` | Audit + fill missing keys |

---

## PART A — ANALYTICS

---

### Task 1: Backend — timezone-aware analytics in DashboardService

**Files:**
- Modify: `apps/backend/src/dashboard/dashboard.service.ts`

Context: `getAnalytics` dispatches several sub-methods. None of them know the restaurant timezone. `getRevenueTrend` groups by UTC date (wrong for non-UTC restaurants). `getPeakHours` uses `.getHours()` (UTC). `getSummary` sets "today" using server UTC midnight. Luxon is already installed (`luxon` is in the backend's node_modules, used in `menu.service.ts` and `orders.service.ts`).

- [ ] **Step 1: Add Luxon import at the top of the file**

Open `apps/backend/src/dashboard/dashboard.service.ts`. Add at line 3 (after the existing imports):

```typescript
import { DateTime } from 'luxon';
```

- [ ] **Step 2: Update `getAnalytics` to fetch restaurant timezone and pass it to sub-methods**

Replace the existing `getAnalytics` method (lines 57–159) with:

```typescript
async getAnalytics(
  restaurantId: string,
  period: number,
  startDateStr?: string,
  endDateStr?: string,
) {
  const restaurant = await this.prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { timezone: true },
  });
  const tz = restaurant?.timezone || 'UTC';

  let now = new Date();
  let periodStart = new Date(now);

  if (startDateStr && endDateStr) {
    periodStart = new Date(startDateStr);
    periodStart.setHours(0, 0, 0, 0);

    now = new Date(endDateStr);
    now.setHours(23, 59, 59, 999);
  } else {
    periodStart.setDate(periodStart.getDate() - period);
    periodStart.setHours(0, 0, 0, 0);
  }

  const timeDeltaMs = now.getTime() - periodStart.getTime();
  const prevPeriodStart = new Date(periodStart.getTime() - timeDeltaMs);
  const prevPeriodEnd = new Date(periodStart.getTime() - 1);

  const [
    revenueTrend,
    topItems,
    peakHours,
    currentPeriodStats,
    previousPeriodStats,
    ordersByStatus,
    categoryBreakdown,
    ordersByTable,
  ] = await Promise.all([
    this.getRevenueTrend(restaurantId, periodStart, now, tz),
    this.getTopItems(restaurantId, periodStart, now),
    this.getPeakHours(restaurantId, periodStart, now, tz),
    this.getPeriodStats(restaurantId, periodStart, now),
    this.getPeriodStats(restaurantId, prevPeriodStart, prevPeriodEnd),
    this.getOrdersByStatus(restaurantId, periodStart, now),
    this.getCategoryBreakdown(restaurantId, periodStart, now),
    this.getOrdersByTable(restaurantId, periodStart, now),
  ]);

  const revenueChange =
    previousPeriodStats.totalRevenue > 0
      ? ((currentPeriodStats.totalRevenue - previousPeriodStats.totalRevenue) /
          previousPeriodStats.totalRevenue) *
        100
      : currentPeriodStats.totalRevenue > 0
        ? 100
        : 0;

  const ordersChange =
    previousPeriodStats.totalOrders > 0
      ? ((currentPeriodStats.totalOrders - previousPeriodStats.totalOrders) /
          previousPeriodStats.totalOrders) *
        100
      : currentPeriodStats.totalOrders > 0
        ? 100
        : 0;

  const servedOrders =
    ordersByStatus.find((s) => s.status === 'SERVED')?.count || 0;
  const servedRate =
    currentPeriodStats.totalOrders > 0
      ? (servedOrders / currentPeriodStats.totalOrders) * 100
      : 0;

  return {
    period,
    revenueTrend,
    topItems,
    peakHours,
    categoryBreakdown,
    ordersByTable,
    totalRevenue: currentPeriodStats.totalRevenue,
    totalOrders: currentPeriodStats.totalOrders,
    avgOrderValue: currentPeriodStats.avgOrderValue,
    servedRate: Math.round(servedRate * 10) / 10,
    ordersByStatus,
    comparison: {
      revenueChange:
        previousPeriodStats.totalRevenue > 0
          ? Math.round(revenueChange * 10) / 10
          : currentPeriodStats.totalRevenue > 0
            ? 100
            : 0,
      ordersChange:
        previousPeriodStats.totalOrders > 0
          ? Math.round(ordersChange * 10) / 10
          : currentPeriodStats.totalOrders > 0
            ? 100
            : 0,
    },
  };
}
```

- [ ] **Step 3: Update `getRevenueTrend` signature and body to use Luxon**

Replace the existing `getRevenueTrend` private method with:

```typescript
private async getRevenueTrend(
  restaurantId: string,
  start: Date,
  end: Date,
  tz: string,
) {
  const orders = await this.prisma.order.findMany({
    where: {
      restaurantId,
      status: { not: OrderStatus.CANCELED },
      createdAt: { gte: start, lte: end },
    },
    select: {
      totalPrice: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const grouped: Record<
    string,
    { date: string; revenue: number; orders: number }
  > = {};

  let current = DateTime.fromJSDate(start, { zone: tz });
  const endDt = DateTime.fromJSDate(end, { zone: tz });
  while (current <= endDt) {
    const dateKey = current.toISODate()!;
    grouped[dateKey] = { date: dateKey, revenue: 0, orders: 0 };
    current = current.plus({ days: 1 });
  }

  for (const order of orders) {
    const dateKey = DateTime.fromJSDate(order.createdAt, { zone: tz }).toISODate()!;
    if (grouped[dateKey]) {
      grouped[dateKey].revenue += order.totalPrice;
      grouped[dateKey].orders += 1;
    }
  }

  return Object.values(grouped).map((d) => ({
    ...d,
    revenue: Math.round(d.revenue * 100) / 100,
  }));
}
```

- [ ] **Step 4: Update `getPeakHours` signature and body to use Luxon**

Replace the existing `getPeakHours` private method with:

```typescript
private async getPeakHours(
  restaurantId: string,
  start: Date,
  end: Date,
  tz: string,
) {
  const orders = await this.prisma.order.findMany({
    where: {
      restaurantId,
      status: { not: OrderStatus.CANCELED },
      createdAt: { gte: start, lte: end },
    },
    select: { createdAt: true },
  });

  const hours: { hour: number; label: string; orders: number }[] = [];
  for (let h = 0; h < 24; h++) {
    hours.push({
      hour: h,
      label: `${h.toString().padStart(2, '0')}:00`,
      orders: 0,
    });
  }

  for (const order of orders) {
    const hour = DateTime.fromJSDate(order.createdAt, { zone: tz }).hour;
    hours[hour].orders += 1;
  }

  return hours;
}
```

- [ ] **Step 5: Update `getSummary` to use Luxon for restaurant-timezone "today"**

Replace the existing `getSummary` method with:

```typescript
async getSummary(restaurantId: string) {
  const restaurant = await this.prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { timezone: true },
  });
  const tz = restaurant?.timezone || 'UTC';
  const today = DateTime.now().setZone(tz).startOf('day').toJSDate();

  const ordersToday = await this.prisma.order.count({
    where: {
      restaurantId,
      createdAt: { gte: today },
    },
  });

  const totalRevenueResult = await this.prisma.order.aggregate({
    _sum: { totalPrice: true },
    where: {
      restaurantId,
      status: OrderStatus.SERVED,
    },
  });

  const openAssistanceRequests = await this.prisma.assistanceRequest.count({
    where: {
      restaurantId,
      isResolved: false,
    },
  });

  const recentOrders = await this.prisma.order.findMany({
    where: { restaurantId },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  return {
    ordersToday,
    totalRevenue: totalRevenueResult._sum.totalPrice || 0,
    openAssistanceRequests,
    recentOrders,
  };
}
```

- [ ] **Step 6: Verify the file compiles**

Run in `apps/backend`:
```bash
npx tsc --noEmit
```
Expected: no errors (or only pre-existing unrelated errors).

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/dashboard/dashboard.service.ts
git commit -m "fix(analytics): timezone-aware date and hour grouping using Luxon"
```

---

### Task 2: Frontend — staleTime=0 in useAnalytics

**Files:**
- Modify: `apps/frontend/src/hooks/useAnalytics.ts`

Context: `staleTime: 5 * 60 * 1000` means TanStack Query considers the cached data fresh for 5 minutes and never re-fetches during that window even if the component re-mounts. Setting to 0 means the cache is always stale; data is fetched immediately on mount. The `refetchInterval: 30000` safety-net polling stays.

- [ ] **Step 1: Change staleTime to 0**

In `apps/frontend/src/hooks/useAnalytics.ts`, replace:
```typescript
    staleTime: 5 * 60 * 1000, // 5 minutes — analytics don't need real-time updates
```
with:
```typescript
    staleTime: 0,
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/hooks/useAnalytics.ts
git commit -m "fix(analytics): set staleTime=0 so analytics refetch on every mount"
```

---

### Task 3: Frontend — analytics cache invalidation on order socket events

**Files:**
- Modify: `apps/frontend/src/context/OrderContext.tsx`

Context: `OrderContext` already listens to `newOrder` and `orderStatusChanged` socket events and refreshes its local orders list. We need to also invalidate the TanStack Query analytics cache so analytics refetch immediately when a new order arrives — without waiting for the 30s poll.

- [ ] **Step 1: Add useQueryClient import**

In `apps/frontend/src/context/OrderContext.tsx`, change the first import line from:
```typescript
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
```
to:
```typescript
import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
```

Add after the existing imports (after the `useSocket` import):
```typescript
import { useQueryClient } from '@tanstack/react-query';
```

- [ ] **Step 2: Obtain queryClient inside the provider and invalidate on order events**

Inside `OrderProvider`, after the existing state declarations, add:
```typescript
const queryClient = useQueryClient();
```

Then update the `handleNewOrder` and `handleOrderStatusChanged` handlers inside the `useEffect` to also invalidate analytics:

Replace:
```typescript
    const handleNewOrder = () => {
      // Small chime for new UI event
      const audio = new Audio('/notification.mp3');
      audio.play().catch(() => {}); // Catch autoplay restrictions
      
      // We can either append to state or just refresh fully
      refreshOrders();
    };

    const handleOrderStatusChanged = () => {
       // Refresh or perfectly mutate state
       refreshOrders();
    };
```

with:

```typescript
    const handleNewOrder = () => {
      const audio = new Audio('/notification.mp3');
      audio.play().catch(() => {});
      refreshOrders();
      void queryClient.invalidateQueries({ queryKey: ['analytics'] });
    };

    const handleOrderStatusChanged = () => {
      refreshOrders();
      void queryClient.invalidateQueries({ queryKey: ['analytics'] });
    };
```

- [ ] **Step 3: Verify the component renders without error**

Start the dev servers (`npm run dev` from repo root) and open the dashboard. Place a test order via the public menu. Confirm the analytics view updates within a second of the order arriving.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/context/OrderContext.tsx
git commit -m "fix(analytics): invalidate analytics cache on incoming order socket events"
```

---

## PART B — TRANSLATION

---

### Task 4: Backend — TranslationService reads DeepL key from env

**Files:**
- Modify: `apps/backend/src/translation/translation.service.ts`
- Modify: `apps/backend/.env`

Context: All three public methods currently accept `apiKey: string` as a param. Every call site passes `restaurant.deeplApiKey`. After this task, the service reads `process.env.DEEPL_API_KEY` internally; callers pass no key. If the env var is missing, methods log a warning and return the original texts unchanged (graceful no-op).

- [ ] **Step 1: Add DEEPL_API_KEY to .env**

Open `apps/backend/.env` and add at the end:
```
DEEPL_API_KEY=your-deepl-key-here
```

Replace `your-deepl-key-here` with the actual DeepL API key. Free-tier keys end in `:fx`; the service detects this automatically.

- [ ] **Step 2: Rewrite translation.service.ts**

Replace the entire content of `apps/backend/src/translation/translation.service.ts` with:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);

  private get apiKey(): string | undefined {
    return process.env.DEEPL_API_KEY;
  }

  private get baseUrl(): string {
    return this.apiKey?.endsWith(':fx')
      ? 'https://api-free.deepl.com'
      : 'https://api.deepl.com';
  }

  async translateTexts(
    texts: string[],
    targetLanguage: string,
  ): Promise<string[]> {
    if (!texts || texts.length === 0) return texts;

    const key = this.apiKey;
    if (!key) {
      this.logger.warn('DEEPL_API_KEY not set — returning original texts');
      return texts;
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/v2/translate`,
        {
          text: texts,
          target_lang: targetLanguage.toUpperCase(),
        },
        {
          headers: {
            Authorization: `DeepL-Auth-Key ${key}`,
            'Content-Type': 'application/json',
          },
        },
      );

      return response.data?.translations?.map((t: any) => t.text) || texts;
    } catch (error: any) {
      this.logger.error(
        `Failed to translate texts to ${targetLanguage}: ${error.message}`,
      );
      return texts;
    }
  }

  async translateText(text: string, targetLanguage: string): Promise<string> {
    const results = await this.translateTexts([text], targetLanguage);
    return results[0] || text;
  }

  async translateObject(
    obj: Record<string, string | null | undefined>,
    targetLanguages: string[],
  ): Promise<Record<string, Record<string, string>>> {
    const translations: Record<string, Record<string, string>> = {};

    if (!targetLanguages || targetLanguages.length === 0) {
      return translations;
    }

    if (!this.apiKey) {
      this.logger.warn('DEEPL_API_KEY not set — skipping translateObject');
      return translations;
    }

    const entriesToTranslate = Object.entries(obj).filter(
      ([_, value]) => value && value.trim() !== '',
    );
    if (entriesToTranslate.length === 0) return translations;

    const keys = entriesToTranslate.map(([key]) => key);
    const texts = entriesToTranslate.map(([_, value]) => value as string);

    for (const lang of targetLanguages) {
      translations[lang] = {};
      const translatedTexts = await this.translateTexts(texts, lang);

      for (let i = 0; i < keys.length; i++) {
        translations[lang][keys[i]] = translatedTexts[i] || texts[i];
      }
    }

    return translations;
  }
}
```

- [ ] **Step 3: Verify no TypeScript errors**

```bash
cd apps/backend && npx tsc --noEmit
```

Expected: errors only about call-sites that still pass `apiKey` as third argument — those are fixed in Tasks 5–7.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/translation/translation.service.ts apps/backend/.env
git commit -m "feat(translation): platform-managed DeepL key, remove apiKey param from TranslationService"
```

---

### Task 5: Backend — remove deeplApiKey from UpdateRestaurantDto

**Files:**
- Modify: `apps/backend/src/restaurants/dto/update-restaurant.dto.ts`

Context: Removing this field from the DTO prevents any frontend from accidentally writing `deeplApiKey` to the DB. The column stays in the schema (CLAUDE.md requirement) but nothing writes to it.

- [ ] **Step 1: Remove the deeplApiKey field from the DTO**

In `apps/backend/src/restaurants/dto/update-restaurant.dto.ts`, remove these four lines:

```typescript
  @IsString()
  @IsOptional()
  deeplApiKey?: string;
```

- [ ] **Step 2: Verify compile**

```bash
cd apps/backend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/restaurants/dto/update-restaurant.dto.ts
git commit -m "fix(translation): remove deeplApiKey from UpdateRestaurantDto — col kept but not written"
```

---

### Task 6: Backend — RestaurantsService.translateAll uses platform key

**Files:**
- Modify: `apps/backend/src/restaurants/restaurants.service.ts`

Context: `translateAll` currently guards on `restaurant.deeplApiKey` and passes it to every `translationService.*` call. After Task 4, `TranslationService` reads from env and accepts no key arg. We replace the guard with an env check and remove the third argument from all translation calls.

- [ ] **Step 1: Replace deeplApiKey guard with env check**

In `apps/backend/src/restaurants/restaurants.service.ts`, replace the `translateAll` method opening:

```typescript
  async translateAll(id: string, userId: string) {
    const restaurant = await this.findOne(id, userId);

    if (
      !restaurant.deeplApiKey ||
      !restaurant.targetLanguages ||
      restaurant.targetLanguages.length === 0
    ) {
      return {
        success: false,
        message: 'Missing API key or target languages.',
      };
    }
```

with:

```typescript
  async translateAll(id: string, userId: string) {
    const restaurant = await this.findOne(id, userId);

    if (!process.env.DEEPL_API_KEY) {
      return {
        success: false,
        message: 'Translation service not configured on this server.',
      };
    }

    if (!restaurant.targetLanguages || restaurant.targetLanguages.length === 0) {
      return {
        success: false,
        message: 'No target languages configured.',
      };
    }
```

- [ ] **Step 2: Remove deeplApiKey from all translateObject call sites in translateAll**

There are three `translateObject` calls in `translateAll`. Each currently has `restaurant.deeplApiKey` as the third argument. Remove that third argument from all three.

Change all occurrences of:
```typescript
        restaurant.targetLanguages,
        restaurant.deeplApiKey,
```
to:
```typescript
        restaurant.targetLanguages,
```

There are three such occurrences (categories loop, items loop, options loop). Use find-and-replace carefully — only within `translateAll`.

- [ ] **Step 3: Verify compile**

```bash
cd apps/backend && npx tsc --noEmit
```

Expected: zero errors in this file.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/restaurants/restaurants.service.ts
git commit -m "fix(translation): translateAll uses platform DEEPL_API_KEY, removes deeplApiKey param"
```

---

### Task 7: Backend — MenuService fire-and-forget pre-warm on create/update

**Files:**
- Modify: `apps/backend/src/menu/menu.service.ts`

Context: Currently `createCategory`, `updateCategory`, `createItem`, `updateItem` check `restaurant.googleTranslateApiKey` (wrong — legacy), and `createMenuOption`, `updateMenuOption` check `restaurant.deeplApiKey`. All block the HTTP response while translating. After this task they use the platform env key and fire-and-forget (non-blocking). `TranslationService` methods no longer accept a key arg (Task 4).

- [ ] **Step 1: Fix createCategory — fire-and-forget with platform key**

In `apps/backend/src/menu/menu.service.ts`, replace the `createCategory` method body with:

```typescript
  async createCategory(
    restaurantId: string,
    createCategoryDto: CreateCategoryDto,
    userId: string,
  ) {
    const restaurant = await this.checkRestaurantOwnership(restaurantId, userId);

    const count = await this.prisma.menuCategory.count({ where: { restaurantId } });
    const data: Prisma.MenuCategoryUncheckedCreateInput = {
      ...createCategoryDto,
      restaurantId,
      order: count,
    };
    const category = await this.prisma.menuCategory.create({ data });

    if (process.env.DEEPL_API_KEY && restaurant.targetLanguages.length > 0) {
      void (async () => {
        try {
          const newTranslations = await this.translationService.translateObject(
            { name: createCategoryDto.name },
            restaurant.targetLanguages,
          );
          if (Object.keys(newTranslations).length > 0) {
            await this.prisma.menuCategory.update({
              where: { id: category.id },
              data: { translations: newTranslations },
            });
          }
        } catch (e: any) {
          this.logger.error(`Pre-warm failed for category ${category.id}: ${e.message}`);
        }
      })();
    }

    return category;
  }
```

- [ ] **Step 2: Fix updateCategory — fire-and-forget with platform key**

Replace the `updateCategory` method body with:

```typescript
  async updateCategory(
    categoryId: string,
    updateCategoryDto: UpdateCategoryDto,
    userId: string,
  ) {
    const category = await this.prisma.menuCategory.findUnique({
      where: { id: categoryId },
      select: { restaurantId: true, translations: true, name: true },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID "${categoryId}" not found`);
    }
    const restaurant = await this.checkRestaurantOwnership(category.restaurantId, userId);

    const updated = await this.prisma.menuCategory.update({
      where: { id: categoryId },
      data: updateCategoryDto,
    });

    if (
      updateCategoryDto.name &&
      updateCategoryDto.name !== category.name &&
      process.env.DEEPL_API_KEY &&
      restaurant.targetLanguages.length > 0
    ) {
      void (async () => {
        try {
          const existing: any =
            category.translations && typeof category.translations === 'object'
              ? category.translations
              : {};
          const newTranslations = await this.translationService.translateObject(
            { name: updateCategoryDto.name! },
            restaurant.targetLanguages,
          );
          await this.prisma.menuCategory.update({
            where: { id: categoryId },
            data: { translations: { ...existing, ...newTranslations } },
          });
        } catch (e: any) {
          this.logger.error(`Pre-warm failed for category ${categoryId}: ${e.message}`);
        }
      })();
    }

    return updated;
  }
```

- [ ] **Step 3: Fix createItem — fire-and-forget with platform key**

Replace the `createItem` method body with:

```typescript
  async createItem(
    categoryId: string,
    createItemDto: CreateItemDto,
    userId: string,
  ) {
    const category = await this.prisma.menuCategory.findUnique({
      where: { id: categoryId },
      select: { restaurantId: true },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID "${categoryId}" not found`);
    }
    const restaurant = await this.checkRestaurantOwnership(category.restaurantId, userId);

    const count = await this.prisma.menuItem.count({ where: { categoryId } });
    const data: Prisma.MenuItemUncheckedCreateInput = {
      ...createItemDto,
      categoryId,
      order: count,
    };
    const item = await this.prisma.menuItem.create({ data });

    if (process.env.DEEPL_API_KEY && restaurant.targetLanguages.length > 0) {
      void (async () => {
        try {
          const textToTranslate: Record<string, string> = { name: createItemDto.name };
          if (createItemDto.description) textToTranslate.description = createItemDto.description;
          (createItemDto.allergens || []).forEach((a: string) => {
            textToTranslate[`allergen_${a}`] = a;
          });
          (createItemDto.dietaryTags || []).forEach((t: string) => {
            textToTranslate[`tag_${t}`] = t;
          });

          const newTranslations = await this.translationService.translateObject(
            textToTranslate,
            restaurant.targetLanguages,
          );

          for (const lang of Object.keys(newTranslations)) {
            const langData = newTranslations[lang];
            const translatedAllergens: string[] = [];
            const translatedTags: string[] = [];
            for (const key of Object.keys(langData)) {
              if (key.startsWith('allergen_')) { translatedAllergens.push(langData[key]); delete langData[key]; }
              else if (key.startsWith('tag_')) { translatedTags.push(langData[key]); delete langData[key]; }
            }
            if (translatedAllergens.length) (langData as any).allergens = translatedAllergens;
            if (translatedTags.length) (langData as any).dietaryTags = translatedTags;
          }

          if (Object.keys(newTranslations).length > 0) {
            await this.prisma.menuItem.update({
              where: { id: item.id },
              data: { translations: newTranslations },
            });
          }
        } catch (e: any) {
          this.logger.error(`Pre-warm failed for item ${item.id}: ${e.message}`);
        }
      })();
    }

    return item;
  }
```

- [ ] **Step 4: Fix updateItem — fire-and-forget with platform key**

Replace the `updateItem` method body with:

```typescript
  async updateItem(
    itemId: string,
    updateItemDto: UpdateItemDto,
    userId: string,
  ) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id: itemId },
      select: {
        category: { select: { restaurantId: true } },
        name: true,
        description: true,
        translations: true,
        allergens: true,
        dietaryTags: true,
      },
    });

    if (!item) {
      throw new NotFoundException(`Menu item with ID "${itemId}" not found`);
    }
    const restaurant = await this.checkRestaurantOwnership(item.category.restaurantId, userId);

    const updated = await this.prisma.menuItem.update({
      where: { id: itemId },
      data: updateItemDto,
    });

    const nameChanged = updateItemDto.name && updateItemDto.name !== item.name;
    const descriptionChanged =
      updateItemDto.description !== undefined && updateItemDto.description !== item.description;

    if (
      (nameChanged || descriptionChanged) &&
      process.env.DEEPL_API_KEY &&
      restaurant.targetLanguages.length > 0
    ) {
      void (async () => {
        try {
          const existing: any =
            item.translations && typeof item.translations === 'object' ? item.translations : {};

          const textToTranslate: Record<string, string> = {
            name: updateItemDto.name || item.name,
          };
          const desc = updateItemDto.description !== undefined ? updateItemDto.description : item.description;
          if (desc) textToTranslate.description = desc;

          const newTranslations = await this.translationService.translateObject(
            textToTranslate,
            restaurant.targetLanguages,
          );
          await this.prisma.menuItem.update({
            where: { id: itemId },
            data: { translations: { ...existing, ...newTranslations } },
          });
        } catch (e: any) {
          this.logger.error(`Pre-warm failed for item ${itemId}: ${e.message}`);
        }
      })();
    }

    return updated;
  }
```

- [ ] **Step 5: Fix createMenuOption — fire-and-forget with platform key**

Replace the `createMenuOption` method body with:

```typescript
  async createMenuOption(
    itemId: string,
    createMenuOptionDto: CreateMenuOptionDto,
    userId: string,
  ) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id: itemId },
      select: { category: { select: { restaurantId: true } } },
    });

    if (!item) {
      throw new NotFoundException(`Menu item with ID "${itemId}" not found`);
    }
    const restaurant = await this.checkRestaurantOwnership(item.category.restaurantId, userId);

    const choices = JSON.parse(createMenuOptionDto.choices);
    const data: Prisma.MenuOptionUncheckedCreateInput = {
      ...createMenuOptionDto,
      choices,
      menuItemId: itemId,
    };
    const option = await this.prisma.menuOption.create({ data });

    if (process.env.DEEPL_API_KEY && restaurant.targetLanguages.length > 0) {
      void (async () => {
        try {
          const textToTranslate: Record<string, string> = { name: createMenuOptionDto.name };
          choices.forEach((c: any) => {
            if (c.name) textToTranslate[`choice_${c.name}`] = c.name;
          });

          const newTranslations = await this.translationService.translateObject(
            textToTranslate,
            restaurant.targetLanguages,
          );

          const parsedTranslations: any = {};
          for (const lang of Object.keys(newTranslations)) {
            parsedTranslations[lang] = { name: newTranslations[lang].name, choices: {} };
            for (const key of Object.keys(newTranslations[lang])) {
              if (key.startsWith('choice_')) {
                parsedTranslations[lang].choices[key.replace('choice_', '')] = newTranslations[lang][key];
              }
            }
          }

          if (Object.keys(parsedTranslations).length > 0) {
            await this.prisma.menuOption.update({
              where: { id: option.id },
              data: { translations: parsedTranslations } as any,
            });
          }
        } catch (e: any) {
          this.logger.error(`Pre-warm failed for option ${option.id}: ${e.message}`);
        }
      })();
    }

    return option;
  }
```

- [ ] **Step 6: Fix updateMenuOption — fire-and-forget with platform key**

Replace the `updateMenuOption` method body with:

```typescript
  async updateMenuOption(
    optionId: string,
    updateMenuOptionDto: UpdateMenuOptionDto,
    userId: string,
  ) {
    const option = await this.prisma.menuOption.findUnique({
      where: { id: optionId },
      select: {
        translations: true,
        menuItem: { select: { category: { select: { restaurantId: true } } } },
      },
    });

    if (!option) {
      throw new NotFoundException(`Menu option with ID "${optionId}" not found`);
    }
    const restaurant = await this.checkRestaurantOwnership(
      option.menuItem.category.restaurantId,
      userId,
    );

    const choices = updateMenuOptionDto.choices
      ? JSON.parse(updateMenuOptionDto.choices)
      : undefined;

    const data: Prisma.MenuOptionUncheckedUpdateInput = {
      ...updateMenuOptionDto,
      choices,
    };
    const updated = await this.prisma.menuOption.update({ where: { id: optionId }, data });

    if (process.env.DEEPL_API_KEY && restaurant.targetLanguages.length > 0) {
      void (async () => {
        try {
          const existingTrans: any =
            option.translations && typeof option.translations === 'object'
              ? option.translations
              : {};
          const textToTranslate: Record<string, string> = {};
          if (updateMenuOptionDto.name) textToTranslate.name = updateMenuOptionDto.name;
          if (choices) {
            choices.forEach((c: any) => {
              if (c.name) textToTranslate[`choice_${c.name}`] = c.name;
            });
          }
          if (Object.keys(textToTranslate).length === 0) return;

          const newTranslations = await this.translationService.translateObject(
            textToTranslate,
            restaurant.targetLanguages,
          );

          for (const lang of Object.keys(newTranslations)) {
            if (!existingTrans[lang]) existingTrans[lang] = { choices: {} };
            if (!existingTrans[lang].choices) existingTrans[lang].choices = {};
            if (newTranslations[lang].name) existingTrans[lang].name = newTranslations[lang].name;
            for (const key of Object.keys(newTranslations[lang])) {
              if (key.startsWith('choice_')) {
                existingTrans[lang].choices[key.replace('choice_', '')] = newTranslations[lang][key];
              }
            }
          }

          await this.prisma.menuOption.update({
            where: { id: optionId },
            data: { translations: existingTrans } as any,
          });
        } catch (e: any) {
          this.logger.error(`Pre-warm failed for option ${optionId}: ${e.message}`);
        }
      })();
    }

    return updated;
  }
```

- [ ] **Step 7: Verify compile**

```bash
cd apps/backend && npx tsc --noEmit
```

Expected: zero errors in menu.service.ts (public menu method still uses old signature — fixed in Task 8).

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/menu/menu.service.ts
git commit -m "fix(translation): fire-and-forget pre-warm on create/update using platform DEEPL key"
```

---

### Task 8: Backend — lazy translation in getPublicMenu + controller lang param

**Files:**
- Modify: `apps/backend/src/menu/menu.service.ts` (getPublicMenu method only)
- Modify: `apps/backend/src/menu/public-menu.controller.ts`

Context: When a customer visits `GET /api/menu/public/:restaurantId?lang=ro`, the service fetches the menu as normal, then for each entity (category, item, option) checks if a translation exists in `translations[lang]`. If yes, overlays it instantly (zero cost). If no, calls DeepL, writes to DB, then overlays. Subsequent visitors for the same language pay zero DeepL cost. 300ms delay between each entity avoids rate limiting.

- [ ] **Step 1: Update public-menu.controller.ts to accept ?lang query param**

Replace the entire content of `apps/backend/src/menu/public-menu.controller.ts` with:

```typescript
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { MenuService } from './menu.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('menu')
export class PublicMenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  getAllMenuData() {
    return {
      message: "Use /public/:restaurantId to get a specific restaurant's menu",
    };
  }

  @Get('public/:restaurantId')
  getPublicMenu(
    @Param('restaurantId') restaurantId: string,
    @Query('lang') lang?: string,
  ) {
    return this.menuService.getPublicMenu(restaurantId, lang);
  }

  @Get('public/:restaurantId/trending')
  getTrendingItems(@Param('restaurantId') restaurantId: string) {
    return this.menuService.getTrendingItems(restaurantId);
  }

  @Get('test')
  testRoute() {
    return { message: 'PublicMenuController is working!' };
  }
}
```

- [ ] **Step 2: Update getPublicMenu signature in menu.service.ts**

Find the `getPublicMenu` method in `apps/backend/src/menu/menu.service.ts`. Change its signature from:

```typescript
  async getPublicMenu(restaurantId: string) {
```

to:

```typescript
  async getPublicMenu(restaurantId: string, lang?: string) {
```

- [ ] **Step 3: Add lazy translation logic at the end of getPublicMenu, before the return**

In `getPublicMenu`, find the existing return statement:

```typescript
    return { restaurant, categories: filteredCategories };
```

Replace it with:

```typescript
    if (lang && process.env.DEEPL_API_KEY) {
      for (const category of filteredCategories) {
        const catTrans: any =
          category.translations && typeof category.translations === 'object'
            ? { ...(category.translations as any) }
            : {};

        if (!catTrans[lang]?.name) {
          try {
            const translated = await this.translationService.translateObject(
              { name: category.name },
              [lang],
            );
            if (translated[lang]) {
              const merged = { ...catTrans, ...translated };
              await this.prisma.menuCategory.update({
                where: { id: category.id },
                data: { translations: merged },
              });
              catTrans[lang] = translated[lang];
            }
          } catch { /* keep original */ }
          await new Promise((r) => setTimeout(r, 300));
        }

        if (catTrans[lang]?.name) {
          (category as any).name = catTrans[lang].name;
        }

        for (const item of (category as any).items ?? []) {
          const itemTrans: any =
            item.translations && typeof item.translations === 'object'
              ? { ...(item.translations as any) }
              : {};

          if (!itemTrans[lang]?.name) {
            try {
              const textToTranslate: Record<string, string> = { name: item.name };
              if (item.description) textToTranslate.description = item.description;
              (item.allergens || []).forEach((a: string) => {
                textToTranslate[`allergen_${a}`] = a;
              });
              (item.dietaryTags || []).forEach((t: string) => {
                textToTranslate[`tag_${t}`] = t;
              });

              const translated = await this.translationService.translateObject(
                textToTranslate,
                [lang],
              );

              if (translated[lang]) {
                const langData = translated[lang];
                const translatedAllergens: string[] = [];
                const translatedTags: string[] = [];
                for (const key of Object.keys(langData)) {
                  if (key.startsWith('allergen_')) {
                    translatedAllergens.push(langData[key]);
                    delete langData[key];
                  } else if (key.startsWith('tag_')) {
                    translatedTags.push(langData[key]);
                    delete langData[key];
                  }
                }
                if (translatedAllergens.length) (langData as any).allergens = translatedAllergens;
                if (translatedTags.length) (langData as any).dietaryTags = translatedTags;

                const merged = { ...itemTrans, ...translated };
                await this.prisma.menuItem.update({
                  where: { id: item.id },
                  data: { translations: merged },
                });
                itemTrans[lang] = langData;
              }
            } catch { /* keep original */ }
            await new Promise((r) => setTimeout(r, 300));
          }

          if (itemTrans[lang]?.name) item.name = itemTrans[lang].name;
          if (itemTrans[lang]?.description) item.description = itemTrans[lang].description;
          if (itemTrans[lang]?.allergens) item.allergens = itemTrans[lang].allergens;
          if (itemTrans[lang]?.dietaryTags) item.dietaryTags = itemTrans[lang].dietaryTags;

          for (const option of item.options ?? []) {
            const optTrans: any =
              option.translations && typeof option.translations === 'object'
                ? { ...(option.translations as any) }
                : {};

            if (!optTrans[lang]?.name) {
              try {
                const textToTranslate: Record<string, string> = { name: option.name };
                const choices = (option.choices as any[]) || [];
                choices.forEach((c: any) => {
                  if (c.name) textToTranslate[`choice_${c.name}`] = c.name;
                });

                const translated = await this.translationService.translateObject(
                  textToTranslate,
                  [lang],
                );

                if (translated[lang]) {
                  if (!optTrans[lang]) optTrans[lang] = { choices: {} };
                  if (!optTrans[lang].choices) optTrans[lang].choices = {};

                  const langData = translated[lang];
                  if (langData.name) optTrans[lang].name = langData.name;
                  for (const key of Object.keys(langData)) {
                    if (key.startsWith('choice_')) {
                      optTrans[lang].choices[key.replace('choice_', '')] = langData[key];
                    }
                  }

                  await this.prisma.menuOption.update({
                    where: { id: option.id },
                    data: { translations: optTrans } as any,
                  });
                }
              } catch { /* keep original */ }
              await new Promise((r) => setTimeout(r, 300));
            }

            if (optTrans[lang]?.name) option.name = optTrans[lang].name;
            if (optTrans[lang]?.choices) {
              const choices = (option.choices as any[]) || [];
              option.choices = choices.map((c: any) => ({
                ...c,
                name: optTrans[lang].choices[c.name] || c.name,
              }));
            }
          }
        }
      }
    }

    return { restaurant, categories: filteredCategories };
```

- [ ] **Step 4: Verify compile**

```bash
cd apps/backend && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 5: Manual test**

Start backend, visit:
```
GET http://localhost:3000/api/menu/public/<restaurantId>?lang=en
```
Confirm response contains English names for categories, items, options (or original if no key set). Second call returns same data without DeepL API hit (DB cached).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/menu/menu.service.ts apps/backend/src/menu/public-menu.controller.ts
git commit -m "feat(translation): lazy on-demand public menu translation with DB caching"
```

---

### Task 9: Frontend — SettingsView cleanup

**Files:**
- Modify: `apps/frontend/src/pages/Dashboard/SettingsView.tsx`

Context: Remove `deeplApiKey` state variable, the password input for it, the `handleForceTranslate` guard (`if (!deeplApiKey)`), the `deeplApiKey` in `handleSave` payload, and the `updateRestaurant` call inside `handleForceTranslate`. Add English to `AVAILABLE_LANGUAGES`. Add "Translation powered by DeepL" info text. Enable translate button when `targetLanguages.length > 0` (no key required).

- [ ] **Step 1: Remove deeplApiKey state and its initialization**

Remove:
```typescript
  const [deeplApiKey, setDeeplApiKey] = useState("");
```

Remove from the `useEffect` that populates from `activeRestaurant`:
```typescript
      setDeeplApiKey(activeRestaurant.deeplApiKey || "");
```

- [ ] **Step 2: Remove deeplApiKey from handleSave**

In `handleSave`, remove `deeplApiKey,` from the `updateRestaurant` call payload object.

- [ ] **Step 3: Simplify handleForceTranslate**

Replace the existing `handleForceTranslate`:
```typescript
  const handleForceTranslate = async () => {
    if (!activeRestaurant) return;
    if (!deeplApiKey) {
      setStatus({ loading: false, error: t("settings.apiKeyRequired"), success: "" });
      return;
    }

    setTranslating(true);
    setStatus({ loading: false, error: "", success: "" });

    try {
      await updateRestaurant(activeRestaurant.id, { deeplApiKey, targetLanguages });
      const res = await triggerTranslation(activeRestaurant.id);
      if (res.success) {
        setStatus({ loading: false, error: "", success: res.message });
      } else {
        setStatus({ loading: false, error: res.message, success: "" });
      }
    } catch (err: any) {
      setStatus({
        loading: false,
        error: err.response?.data?.message || t("settings.failedInitiate"),
        success: "",
      });
    } finally {
      setTranslating(false);
    }
  };
```

with:

```typescript
  const handleForceTranslate = async () => {
    if (!activeRestaurant) return;

    setTranslating(true);
    setStatus({ loading: false, error: "", success: "" });

    try {
      const res = await triggerTranslation(activeRestaurant.id);
      if (res.success) {
        setStatus({ loading: false, error: "", success: res.message });
      } else {
        setStatus({ loading: false, error: res.message, success: "" });
      }
    } catch (err: any) {
      setStatus({
        loading: false,
        error: err.response?.data?.message || t("settings.failedInitiate"),
        success: "",
      });
    } finally {
      setTranslating(false);
    }
  };
```

- [ ] **Step 4: Add English to AVAILABLE_LANGUAGES**

Replace:
```typescript
const AVAILABLE_LANGUAGES = [
  { code: "bg", name: "Bulgarian" },
```
with:
```typescript
const AVAILABLE_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "bg", name: "Bulgarian" },
```

- [ ] **Step 5: Remove DeepL API Key input field from JSX**

Find and remove the entire `<div>` block containing the DeepL API key label + password input:

```tsx
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  {t("settings.deeplApiKey", "DeepL API Key")}
                </label>
                <input
                  type="password"
                  value={deeplApiKey}
                  onChange={(e) => setDeeplApiKey(e.target.value)}
                  placeholder="DeepL-Auth-Key..."
                  className={inputCls}
                />
              </div>
```

- [ ] **Step 6: Update the Translate All Now button — enable when targetLanguages selected**

Change the `disabled` condition on the button from:
```tsx
                disabled={translating || !deeplApiKey}
```
to:
```tsx
                disabled={translating || targetLanguages.length === 0}
```

- [ ] **Step 7: Add "Translation powered by DeepL" info text below the translate button panel**

After the closing `</div>` of the yellow translate panel, add:
```tsx
            <p className="text-xs text-muted-foreground mt-2">
              {t("settings.translationPoweredBy")}
            </p>
```

- [ ] **Step 8: Verify the component renders without TypeScript errors**

```bash
cd apps/frontend && npx tsc --noEmit
```

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/pages/Dashboard/SettingsView.tsx
git commit -m "fix(translation): remove API key UI from SettingsView, enable translate button by language selection"
```

---

### Task 10: Frontend — i18n fallbackLng + Header language picker

**Files:**
- Modify: `apps/frontend/src/i18n.ts`
- Modify: `apps/frontend/src/components/Header.tsx`

Context: Change default fallback language to BG (Bulgarian is the primary market). Add a language dropdown to the Header so owners can switch both the dashboard UI language and the language context for menu content display. The `i18next-browser-languagedetector` plugin automatically persists language to localStorage under key `i18nextLng`, so `i18n.changeLanguage()` is all that's needed.

- [ ] **Step 1: Change fallbackLng to 'bg' in i18n.ts**

In `apps/frontend/src/i18n.ts`, replace:
```typescript
    fallbackLng: 'en',
```
with:
```typescript
    fallbackLng: 'bg',
```

- [ ] **Step 2: Add language picker to Header.tsx**

Replace the entire content of `apps/frontend/src/components/Header.tsx` with:

```typescript
import React, { useContext } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { ThemeToggle } from './ui/ThemeToggle';

const DASHBOARD_LANGUAGES = [
  { code: 'bg', label: 'БГ' },
  { code: 'en', label: 'EN' },
  { code: 'ro', label: 'RO' },
];

const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { i18n } = useTranslation();

  if (location.pathname.startsWith('/menu/public')) {
    return null;
  }

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 pt-4 px-4 sm:px-6 pointer-events-none">
      <header className="max-w-5xl mx-auto glass-panel rounded-2xl pointer-events-auto border-white/5 shadow-2xl">
        <nav className="px-5 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-foreground font-serif font-black text-xl tracking-tight hover:text-accent transition-colors duration-200 uppercase">
            QR SaaS
          </Link>

          <div className="flex items-center gap-4 sm:gap-6">
            <select
              value={i18n.language?.split('-')[0] || 'bg'}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
              className="text-xs font-bold uppercase tracking-widest bg-transparent text-muted-foreground hover:text-foreground cursor-pointer border-none outline-none"
              aria-label="Dashboard language"
            >
              {DASHBOARD_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>

            <ThemeToggle />

            {user ? (
              <>
                <Link
                  to="/dashboard"
                  className="text-muted-foreground hover:text-foreground text-xs font-bold uppercase tracking-widest transition-colors duration-200"
                >
                  Dashboard
                </Link>
                <button
                  onClick={handleLogout}
                  className="text-foreground text-xs font-bold uppercase tracking-widest hover:text-red-500 transition-colors cursor-pointer"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-muted-foreground hover:text-foreground text-xs font-bold uppercase tracking-widest transition-colors duration-200"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="bg-accent text-accent-foreground text-[10px] font-black uppercase tracking-widest px-5 py-2.5 rounded-xl transition-all shadow-lg hover:shadow-accent/20 hover:-translate-y-0.5"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>
    </div>
  );
};

export default Header;
```

- [ ] **Step 3: Verify no TypeScript errors**

```bash
cd apps/frontend && npx tsc --noEmit
```

- [ ] **Step 4: Manual test**

Open dashboard, change the language selector from BG to EN. Confirm all dashboard labels switch instantly. Reload page — confirm language persists (LanguageDetector reads from localStorage).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/i18n.ts apps/frontend/src/components/Header.tsx
git commit -m "feat(i18n): fallbackLng=bg, add language picker to dashboard header"
```

---

### Task 11: Locale JSON audit — add missing translation keys

**Files:**
- Modify: `apps/frontend/src/locales/en/translation.json`
- Modify: `apps/frontend/src/locales/bg/translation.json`
- Modify: `apps/frontend/src/locales/ro/translation.json`

Context: Several i18n keys are used in components but missing from the JSON files:
- `settings.failedSave` — used in `SettingsView` catch block (`handleSave`)
- `settings.failedInitiate` — used in `SettingsView` catch block (`handleForceTranslate`)
- `settings.timezone` — label hardcoded as "Timezone" in `SettingsView`
- `settings.timezoneDesc` — description hardcoded in `SettingsView`
- `settings.translationPoweredBy` — new string added in Task 9

Also remove obsolete keys no longer referenced by any component:
- `settings.deeplApiKey` — removed in Task 9 (the input field is gone)
- `settings.apiKeyRequired` — the guard is gone; key is unused

For BG/RO files: `settings.googleApiKey` is a leftover from the Google Translate era — remove it too.

- [ ] **Step 1: Update apps/frontend/src/locales/en/translation.json settings section**

In the `"settings"` object, make these changes:

Add the five new/missing keys:
```json
    "failedSave": "Failed to save settings. Please try again.",
    "failedInitiate": "Failed to initiate translation. Please try again.",
    "timezone": "Timezone",
    "timezoneDesc": "Used for analytics and Happy Hour calculations. Must match the restaurant's local clock.",
    "translationPoweredBy": "Translation powered by DeepL"
```

Remove these two obsolete keys:
- `"deeplApiKey"` (line with `"DeepL API Key"`)
- `"apiKeyRequired"` (line with `"DeepL API Key is required."`)

The resulting `settings` object in EN should be:
```json
  "settings": {
    "title": "Settings",
    "desc": "Manage your restaurant's contact information and integrate auto-translation services.",
    "locationContact": "Location & Contact",
    "address": "Address",
    "contactInfo": "Contact Info (Phone / Email)",
    "localization": "Localization & Auto-Translation",
    "localizationDesc": "Enable auto-translation for your digital menu. Menu items will be translated via DeepL when you trigger translation.",
    "targetLanguages": "Target Languages",
    "processExisting": "Process Existing Menu",
    "processExistingDesc": "Click this button to push all existing menu categories and items through DeepL.",
    "translateAllNow": "Translate All Now",
    "saveSettings": "Save Settings",
    "saving": "Saving...",
    "updatedSuccess": "Settings updated successfully!",
    "translating": "Translating...",
    "failedSave": "Failed to save settings. Please try again.",
    "failedInitiate": "Failed to initiate translation. Please try again.",
    "timezone": "Timezone",
    "timezoneDesc": "Used for analytics and Happy Hour calculations. Must match the restaurant's local clock.",
    "translationPoweredBy": "Translation powered by DeepL"
  }
```

- [ ] **Step 2: Update apps/frontend/src/locales/bg/translation.json settings section**

Remove: `"googleApiKey"`, `"apiKeyRequired"` keys.

Add the five missing keys (translated to Bulgarian):
```json
    "failedSave": "Неуспешно запазване на настройките. Моля, опитайте отново.",
    "failedInitiate": "Неуспешно стартиране на превода. Моля, опитайте отново.",
    "timezone": "Часова зона",
    "timezoneDesc": "Използва се за анализи и изчисления на Happy Hour. Трябва да съответства на местния часовник на ресторанта.",
    "translationPoweredBy": "Преводът е осъществен от DeepL"
```

Update `"localizationDesc"` to remove the Google API key reference:
```json
    "localizationDesc": "Активирайте автоматичния превод за вашето цифрово меню. Артикулите ще бъдат превеждани чрез DeepL.",
```

- [ ] **Step 3: Update apps/frontend/src/locales/ro/translation.json settings section**

Remove: `"googleApiKey"`, `"apiKeyRequired"` keys.

Add the five missing keys (translated to Romanian):
```json
    "failedSave": "Salvarea setărilor a eșuat. Vă rugăm să încercați din nou.",
    "failedInitiate": "Inițierea traducerii a eșuat. Vă rugăm să încercați din nou.",
    "timezone": "Fus orar",
    "timezoneDesc": "Utilizat pentru analize și calcule Happy Hour. Trebuie să corespundă cu ora locală a restaurantului.",
    "translationPoweredBy": "Traducere realizată de DeepL"
```

Update `"localizationDesc"`:
```json
    "localizationDesc": "Activați traducerea automată pentru meniul digital. Articolele vor fi traduse prin DeepL.",
```

- [ ] **Step 4: Update SettingsView to use t() for Timezone label and description**

In `apps/frontend/src/pages/Dashboard/SettingsView.tsx`, find the hardcoded timezone section:

```tsx
            <h3 className="text-lg font-medium text-foreground mb-1">Timezone</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Used for Happy Hour calculations. Must match the restaurant's local clock.
            </p>
```

Replace with:

```tsx
            <h3 className="text-lg font-medium text-foreground mb-1">{t("settings.timezone")}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t("settings.timezoneDesc")}
            </p>
```

- [ ] **Step 5: Verify no TypeScript errors**

```bash
cd apps/frontend && npx tsc --noEmit
```

- [ ] **Step 6: Visual verification**

Switch dashboard language to BG, open Settings. Confirm Timezone label and description show in Bulgarian. Switch to RO — confirm Romanian.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/locales/en/translation.json apps/frontend/src/locales/bg/translation.json apps/frontend/src/locales/ro/translation.json apps/frontend/src/pages/Dashboard/SettingsView.tsx
git commit -m "fix(i18n): audit locale JSON files — add missing keys, remove obsolete API key strings"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| `staleTime: 0` | Task 2 |
| Analytics cache invalidation on socket | Task 3 |
| `getRevenueTrend` Luxon timezone | Task 1 |
| `getPeakHours` Luxon hour | Task 1 |
| `getSummary` Luxon today | Task 1 |
| TranslationService env key, drop apiKey param | Task 4 |
| `deeplApiKey` not written via DTO | Task 5 |
| `translateAll` uses env key | Task 6 |
| Post-save pre-warm fire-and-forget | Task 7 |
| Public menu `?lang` param | Task 8 |
| Lazy translate + DB cache public menu | Task 8 |
| Remove API key field from SettingsView | Task 9 |
| Enable translate btn by language selection | Task 9 |
| English added to AVAILABLE_LANGUAGES | Task 9 |
| "Translation powered by DeepL" text | Task 9 |
| `fallbackLng: 'bg'` | Task 10 |
| Language picker in header | Task 10 |
| i18n JSON missing key audit | Task 11 |
| Timezone label in i18n | Task 11 |

All spec requirements covered.

**Type consistency check:** `TranslationService.translateObject` and `translateTexts` drop `apiKey` in Task 4. All callers (Tasks 6, 7, 8) pass no key arg. No mismatches.

**No placeholders:** All steps contain complete code.
