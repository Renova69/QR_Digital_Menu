# Super-Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a centralized Super-Admin dashboard (4th layout in existing frontend) with platform stats, tenant management, tier override, and restaurant suspension.

**Architecture:** New `SuperAdminModule` in NestJS backend at `/api/v1/super-admin`, guarded by JWT + new `SuperAdminGuard`. New `SuperAdminLayout` in frontend with dark sidebar, three views (Overview, Tenants, TenantDetail). Schema adds `SUPER_ADMIN` role, `forceTier` and `isActive` fields. feature.service.ts modified to respect `forceTier` override.

**Tech Stack:** NestJS 11, Prisma 6, Neon DB, React 18, Vite, Tailwind CSS 4, Radix UI, TanStack Query 5, Recharts, i18next, Lucide icons

---

### Task 1: Schema — Add SUPER_ADMIN role, forceTier, isActive

**Files:**
- Modify: `apps/backend/prisma/schema.prisma:292-299` (UserRole enum)
- Modify: `apps/backend/prisma/schema.prisma:32-97` (Restaurant model)

- [ ] **Step 1: Add SUPER_ADMIN to UserRole enum**

Open `apps/backend/prisma/schema.prisma`. Find the enum block at line 292:

```prisma
enum UserRole {
  OWNER
  MANAGER
  WAITER
  KITCHEN
  STAFF
  CUSTOMER
}
```

Replace with:

```prisma
enum UserRole {
  OWNER
  MANAGER
  WAITER
  KITCHEN
  STAFF
  CUSTOMER
  SUPER_ADMIN
}
```

- [ ] **Step 2: Add forceTier and isActive to Restaurant model**

In `apps/backend/prisma/schema.prisma`, find the `Restaurant` model (line 32). Add these two fields after `tierUpdatedAt` (line 83):

```prisma
  forceTier   SubscriptionTier?
  isActive    Boolean            @default(true)
```

Place them between `tierUpdatedAt` and `assistanceRequests`:

```prisma
  tier                      SubscriptionTier    @default(FREE)
  stripeCustomerId          String?
  stripeSubscriptionId      String?
  stripePriceId             String?
  tierUpdatedAt             DateTime?
  forceTier                 SubscriptionTier?
  isActive                  Boolean             @default(true)
  assistanceRequests        AssistanceRequest[]
```

- [ ] **Step 3: Push schema to Neon**

Run: `npx prisma db push`
Expected: "Your database is now in sync with your schema."

- [ ] **Step 4: Commit**

```bash
git add apps/backend/prisma/schema.prisma
git commit -m "feat: add SUPER_ADMIN role, forceTier and isActive to Restaurant"
```

---

### Task 2: FeatureService — respect forceTier override

**Files:**
- Modify: `apps/backend/src/subscription/feature.service.ts:47-48`

- [ ] **Step 1: Add getEffectiveTier method to FeatureService**

Open `apps/backend/src/subscription/feature.service.ts`. Add a new method after `getAllowedStaffRoles` (end of class, before the closing `}`):

```typescript
  getEffectiveTier(tier: string, forceTier?: string | null): string {
    return forceTier ?? tier;
  }
```

- [ ] **Step 2: Update FeatureGuard to use getEffectiveTier**

Open `apps/backend/src/subscription/feature.guard.ts`. Change line 49 from:

```typescript
    const tier = restaurant?.tier ?? 'FREE';
```

To:

```typescript
    const tier = this.featureService.getEffectiveTier(
      restaurant?.tier ?? 'FREE',
      restaurant?.forceTier,
    );
```

Also update the Prisma `select` on the restaurant queries to include `forceTier`. Change the `select` on lines 34-43:

The first query (staff path, line 39-42):
```typescript
    const restaurant = user?.restaurantId
      ? await this.prisma.restaurant.findUnique({
          where: { id: user.restaurantId },
          select: { tier: true, forceTier: true },
        })
      : await this.prisma.restaurant.findFirst({
          where: { ownerId: userId },
          select: { tier: true, forceTier: true },
        });
```

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/subscription/feature.service.ts apps/backend/src/subscription/feature.guard.ts
git commit -m "feat: FeatureService respects forceTier override for tier resolution"
```

---

### Task 3: SuperAdminGuard — create role guard

**Files:**
- Create: `apps/backend/src/super-admin/super-admin.guard.ts`

- [ ] **Step 1: Write failing guard test**

Create `apps/backend/src/super-admin/super-admin.guard.spec.ts`:

```typescript
import { SuperAdminGuard } from './super-admin.guard';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';

function mockContext(role?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user: role ? { role } : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('SuperAdminGuard', () => {
  let guard: SuperAdminGuard;

  beforeEach(() => {
    guard = new SuperAdminGuard();
  });

  it('should allow SUPER_ADMIN user', () => {
    const ctx = mockContext('SUPER_ADMIN');
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should reject OWNER user', () => {
    const ctx = mockContext('OWNER');
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should reject unauthenticated user (no user)', () => {
    const ctx = mockContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/super-admin/super-admin.guard.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create SuperAdminGuard**

Create `apps/backend/src/super-admin/super-admin.guard.ts`:

```typescript
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (request.user?.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException({
        code: 'SUPER_ADMIN_REQUIRED',
        message: 'Only super admins can access this resource',
      });
    }
    return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/super-admin/super-admin.guard.spec.ts`
Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/super-admin/super-admin.guard.ts apps/backend/src/super-admin/super-admin.guard.spec.ts
git commit -m "feat: add SuperAdminGuard for platform admin endpoints"
```

---

### Task 4: DTOs — create update-tenant DTO

**Files:**
- Create: `apps/backend/src/super-admin/dto/update-tenant.dto.ts`

- [ ] **Step 1: Create DTO file**

Create `apps/backend/src/super-admin/dto/update-tenant.dto.ts`:

```typescript
import { IsIn, IsOptional, IsBoolean } from 'class-validator';
import { SubscriptionTier } from '@prisma/client';

const TIERS: SubscriptionTier[] = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];

export class UpdateTenantTierDto {
  @IsOptional()
  @IsIn(TIERS, { message: 'forceTier must be a valid SubscriptionTier' })
  forceTier?: SubscriptionTier | null;
}

export class UpdateTenantStatusDto {
  @IsBoolean()
  isActive: boolean;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/super-admin/dto/update-tenant.dto.ts
git commit -m "feat: add super-admin DTOs for tier and status updates"
```

---

### Task 5: SuperAdminService — stats and tenant queries

**Files:**
- Create: `apps/backend/src/super-admin/super-admin.service.ts`

- [ ] **Step 1: Write failing service test**

Create `apps/backend/src/super-admin/super-admin.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { SuperAdminService } from './super-admin.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SuperAdminService', () => {
  let service: SuperAdminService;
  let prisma: PrismaService;

  const mockPrisma = {
    restaurant: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      count: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuperAdminService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SuperAdminService>(SuperAdminService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('getStats', () => {
    it('should return platform stats', async () => {
      mockPrisma.restaurant.count.mockResolvedValue(10);
      mockPrisma.user.count.mockResolvedValue(50);
      mockPrisma.$queryRaw.mockResolvedValue([
        { tier: 'FREE', count: '5' },
        { tier: 'STARTER', count: '3' },
        { tier: 'PROFESSIONAL', count: '1' },
        { tier: 'ENTERPRISE', count: '1' },
      ]);

      const result = await service.getStats();

      expect(result.totalRestaurants).toBe(10);
      expect(result.totalUsers).toBe(50);
      expect(result.activeSubscriptions).toBeDefined();
      expect(result.suspendedCount).toBeDefined();
      expect(result.byTier.FREE).toBe(5);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/super-admin/super-admin.service.spec.ts`
Expected: FAIL — service not defined

- [ ] **Step 3: Create SuperAdminService**

Create `apps/backend/src/super-admin/super-admin.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

const TIER_ORDER: Record<string, number> = {
  FREE: 0,
  STARTER: 1,
  PROFESSIONAL: 2,
  ENTERPRISE: 3,
};

@Injectable()
export class SuperAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const [totalRestaurants, totalUsers, activeSubscriptions, suspendedCount, byTierRaw] =
      await Promise.all([
        this.prisma.restaurant.count(),
        this.prisma.user.count(),
        this.prisma.restaurant.count({
          where: { stripeSubscriptionId: { not: null } },
        }),
        this.prisma.restaurant.count({
          where: { isActive: false },
        }),
        this.prisma.$queryRaw<
          Array<{ tier: string; count: bigint }>
        >(Prisma.sql`SELECT tier, COUNT(*)::int FROM restaurant GROUP BY tier`),
      ]);

    const byTier: Record<string, number> = { FREE: 0, STARTER: 0, PROFESSIONAL: 0, ENTERPRISE: 0 };
    for (const row of byTierRaw) {
      byTier[row.tier] = Number(row.count);
    }

    return {
      totalRestaurants,
      totalUsers,
      byTier,
      activeSubscriptions,
      suspendedCount,
    };
  }

  async getTenants(params: {
    page?: number;
    limit?: number;
    search?: string;
    tier?: string;
    status?: string;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.RestaurantWhereInput = {};

    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { owner: { email: { contains: params.search, mode: 'insensitive' } } },
      ];
    }

    if (params.tier) {
      where.tier = params.tier as any;
    }

    if (params.status === 'suspended') {
      where.isActive = false;
    } else if (params.status === 'active') {
      where.isActive = true;
    }

    const [data, total] = await Promise.all([
      this.prisma.restaurant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          tier: true,
          forceTier: true,
          isActive: true,
          stripeOnboarded: true,
          paymentsEnabled: true,
          createdAt: true,
          owner: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.restaurant.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit },
    };
  }

  async getTenantById(id: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      include: {
        owner: {
          select: { id: true, email: true, name: true },
        },
        _count: {
          select: { orders: true },
        },
      },
    });

    if (!restaurant) {
      throw new NotFoundException({ code: 'TENANT_NOT_FOUND', message: 'Restaurant not found' });
    }

    // Get payment summary
    const paymentStats = await this.prisma.payment.aggregate({
      where: { restaurantId: id },
      _sum: { amount: true },
      _count: true,
    });

    return {
      ...restaurant,
      orderCount: restaurant._count.orders,
      paymentSummary: {
        totalAmount: paymentStats._sum.amount ?? 0,
        totalPayments: paymentStats._count,
      },
    };
  }

  async updateTier(id: string, forceTier: string | null) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id } });
    if (!restaurant) {
      throw new NotFoundException({ code: 'TENANT_NOT_FOUND', message: 'Restaurant not found' });
    }

    return this.prisma.restaurant.update({
      where: { id },
      data: { forceTier },
      select: {
        id: true,
        name: true,
        tier: true,
        forceTier: true,
      },
    });
  }

  async updateStatus(id: string, isActive: boolean) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id } });
    if (!restaurant) {
      throw new NotFoundException({ code: 'TENANT_NOT_FOUND', message: 'Restaurant not found' });
    }

    return this.prisma.restaurant.update({
      where: { id },
      data: { isActive },
      select: {
        id: true,
        name: true,
        isActive: true,
      },
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/super-admin/super-admin.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/super-admin/super-admin.service.ts apps/backend/src/super-admin/super-admin.service.spec.ts
git commit -m "feat: add SuperAdminService with stats and tenant management"
```

---

### Task 6: SuperAdminController — wire API endpoints

**Files:**
- Create: `apps/backend/src/super-admin/super-admin.controller.ts`

- [ ] **Step 1: Create SuperAdminController**

Create `apps/backend/src/super-admin/super-admin.controller.ts`:

```typescript
import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminGuard } from './super-admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateTenantTierDto, UpdateTenantStatusDto } from './dto/update-tenant.dto';

@Controller('super-admin')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class SuperAdminController {
  constructor(private readonly service: SuperAdminService) {}

  @Get('stats')
  getStats() {
    return this.service.getStats();
  }

  @Get('tenants')
  getTenants(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('tier') tier?: string,
    @Query('status') status?: string,
  ) {
    return this.service.getTenants({ page, limit, search, tier, status });
  }

  @Get('tenants/:id')
  getTenant(@Param('id') id: string) {
    return this.service.getTenantById(id);
  }

  @Patch('tenants/:id/tier')
  updateTier(
    @Param('id') id: string,
    @Body() dto: UpdateTenantTierDto,
  ) {
    return this.service.updateTier(id, dto.forceTier ?? null);
  }

  @Patch('tenants/:id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTenantStatusDto,
  ) {
    return this.service.updateStatus(id, dto.isActive);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/super-admin/super-admin.controller.ts
git commit -m "feat: add SuperAdminController with 5 endpoints"
```

---

### Task 7: SuperAdminModule — register module

**Files:**
- Create: `apps/backend/src/super-admin/super-admin.module.ts`
- Modify: `apps/backend/src/app.module.ts:23`

- [ ] **Step 1: Create SuperAdminModule**

Create `apps/backend/src/super-admin/super-admin.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SuperAdminController],
  providers: [SuperAdminService],
})
export class SuperAdminModule {}
```

- [ ] **Step 2: Register in AppModule**

Open `apps/backend/src/app.module.ts`. Add the import:

After line 23 (`import { SubscriptionModule } from './subscription/subscription.module';`):

```typescript
import { SuperAdminModule } from './super-admin/super-admin.module';
```

Add `SuperAdminModule` to the `imports` array. After `SubscriptionModule` (line 38):

```typescript
    SubscriptionModule,
    SuperAdminModule,
    AuthModule,
```

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/super-admin/super-admin.module.ts apps/backend/src/app.module.ts
git commit -m "feat: register SuperAdminModule in app module"
```

---

### Task 8: Suspend enforcement — isActive checks

**Files:**
- Modify: `apps/backend/src/subscription/feature.guard.ts`
- Modify: `apps/backend/src/auth/jwt.strategy.ts`
- Modify: `apps/backend/src/menu/public-menu.controller.ts`
- Modify: `apps/backend/src/orders/orders.service.ts`

- [ ] **Step 1: Add isActive check in FeatureGuard**

Open `apps/backend/src/subscription/feature.guard.ts`. IN the `canActivate` method, after fetching the restaurant and before resolving features, add:

After the restaurant fetch (after the `const tier =` line), add:

```typescript
    if (restaurant?.forceTier !== undefined && restaurant?.isActive === false) {
      throw new ForbiddenException({
        code: 'RESTAURANT_SUSPENDED',
        message: 'This restaurant has been suspended',
      });
    }
```

Update the query selects to also include `isActive`. The staff path query should select `{ tier: true, forceTier: true, isActive: true }` and the owner path query should select `{ tier: true, forceTier: true, isActive: true }`.

Full updated guards:

```typescript
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureService } from './feature.service';
import { REQUIRE_FEATURE_KEY } from './require-feature.decorator';
import { FeatureFlag } from './feature-flag.enum';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureService: FeatureService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeatures = this.reflector.getAllAndOverride<FeatureFlag[]>(REQUIRE_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredFeatures || requiredFeatures.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id ?? request.user?.sub;

    if (!userId) {
      throw new ForbiddenException({ code: 'AUTH_REQUIRED' });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { restaurantId: true, role: true },
    });

    // SUPER_ADMIN bypasses all tier and suspension checks
    if (user?.role === 'SUPER_ADMIN') {
      return true;
    }

    const restaurant = user?.restaurantId
      ? await this.prisma.restaurant.findUnique({
          where: { id: user.restaurantId },
          select: { tier: true, forceTier: true, isActive: true },
        })
      : await this.prisma.restaurant.findFirst({
          where: { ownerId: userId },
          select: { tier: true, forceTier: true, isActive: true },
        });

    if (restaurant?.isActive === false) {
      throw new ForbiddenException({
        code: 'RESTAURANT_SUSPENDED',
        message: 'This restaurant has been suspended',
      });
    }

    const tier = this.featureService.getEffectiveTier(
      restaurant?.tier ?? 'FREE',
      restaurant?.forceTier,
    );

    const missing = requiredFeatures.filter((f) => !this.featureService.hasFeature(tier, f));
    if (missing.length > 0) {
      throw new ForbiddenException({
        code: 'FEATURE_LOCKED',
        requiredFeatures: missing,
        message: `Your plan (${tier}) does not include: ${missing.join(', ')}`,
      });
    }

    return true;
  }
}
```

- [ ] **Step 2: Add isActive check to public menu routes (via MenuCrudService)**

First, open `apps/backend/src/menu/menu-crud.service.ts`. Add `ForbiddenException` to imports if not already present, then add the `checkRestaurantActive` method:

```typescript
import { ForbiddenException, Injectable } from '@nestjs/common';

// Inside MenuCrudService class, add:
async checkRestaurantActive(restaurantId: string): Promise<void> {
  const restaurant = await this.prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { isActive: true },
  });
  if (restaurant && !restaurant.isActive) {
    throw new ForbiddenException({
      code: 'RESTAURANT_SUSPENDED',
      message: 'This restaurant has been suspended',
    });
  }
}
```

Then open `apps/backend/src/menu/public-menu.controller.ts`. The controller already has `this.crud` (MenuCrudService injected). No new imports or constructor changes needed — just add `await this.crud.checkRestaurantActive(restaurantId)` as first line in each `@Get` method:

```typescript
@Get('public/:restaurantId')
@Throttle({ default: { limit: 60, ttl: 60000 } })
async getPublicMenu(
  @Param('restaurantId') restaurantId: string,
  @Query('lang') lang?: string,
) {
  await this.crud.checkRestaurantActive(restaurantId);
  return this.crud.getPublicMenu(restaurantId, lang);
}
```

Same pattern for `getPublicMenuMeta`, `getCategoryItems`, and `getTrendingItems` — add `await this.crud.checkRestaurantActive(restaurantId)` as the first line in each.

- [ ] **Step 3: Add isActive check to order creation**

Open `apps/backend/src/orders/orders.service.ts`. In the `create` method, after resolving the restaurant, add:

```typescript
// After fetching restaurant/table, before creating order
const restaurant = await this.prisma.restaurant.findUnique({
  where: { id: restaurantId },
  select: { isActive: true, paymentsEnabled: true },
});

if (!restaurant?.isActive) {
  throw new ForbiddenException({
    code: 'RESTAURANT_SUSPENDED',
    message: 'This restaurant has been suspended',
  });
}
```

- [ ] **Step 4: Add SUPER_ADMIN bypass in JwtStrategy (allow suspended restaurant access)**

Open `apps/backend/src/auth/jwt.strategy.ts`. The strategy already returns the full user object including `role`. No change needed — the SuperAdminGuard checks the role. The isActive check in FeatureGuard already skips SUPER_ADMIN users.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/subscription/feature.guard.ts apps/backend/src/menu/public-menu.controller.ts apps/backend/src/orders/orders.service.ts
git commit -m "feat: enforce restaurant suspension on menu, orders, and feature access"
```

---

### Task 9: Frontend — API client additions

**Files:**
- Modify: `apps/frontend/src/lib/api.ts`
- Modify: `apps/frontend/src/types/index.ts`

- [ ] **Step 1: Add types**

Open `apps/frontend/src/types/index.ts`. Append:

```typescript
// Super Admin
export interface SuperAdminStats {
  totalRestaurants: number;
  totalUsers: number;
  byTier: Record<string, number>;
  activeSubscriptions: number;
  suspendedCount: number;
}

export interface TenantSummary {
  id: string;
  name: string;
  tier: string;
  forceTier: string | null;
  isActive: boolean;
  stripeOnboarded: boolean;
  paymentsEnabled: boolean;
  createdAt: string;
  owner: {
    id: string;
    email: string;
    name: string | null;
  };
}

export interface TenantDetail extends TenantSummary {
  address: string | null;
  country: string;
  timezone: string;
  stripeAccountId: string | null;
  stripeSubscriptionId: string | null;
  orderCount: number;
  paymentSummary: {
    totalAmount: number;
    totalPayments: number;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
  };
}
```

- [ ] **Step 2: Add API functions**

Open `apps/frontend/src/lib/api.ts`. After the subscription section (after line 394), append:

```typescript
// Super Admin
export const getSuperAdminStats = () =>
  api.get('/super-admin/stats').then((r) => r.data as import('../types').SuperAdminStats);

export const getSuperAdminTenants = (
  params?: { page?: number; limit?: number; search?: string; tier?: string; status?: string },
) =>
  api
    .get('/super-admin/tenants', { params })
    .then((r) => r.data as import('../types').PaginatedResponse<import('../types').TenantSummary>);

export const getSuperAdminTenant = (id: string) =>
  api.get(`/super-admin/tenants/${id}`).then((r) => r.data as import('../types').TenantDetail);

export const updateTenantTier = (id: string, forceTier: string | null) =>
  api.patch(`/super-admin/tenants/${id}/tier`, { forceTier }).then((r) => r.data);

export const updateTenantStatus = (id: string, isActive: boolean) =>
  api.patch(`/super-admin/tenants/${id}/status`, { isActive }).then((r) => r.data);
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/lib/api.ts apps/frontend/src/types/index.ts
git commit -m "feat: add super-admin API client functions and types"
```

---

### Task 10: SuperAdminRoute — frontend guard

**Files:**
- Create: `apps/frontend/src/components/SuperAdminRoute.tsx`

- [ ] **Step 1: Create SuperAdminRoute**

Create `apps/frontend/src/components/SuperAdminRoute.tsx`:

```tsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function SuperAdminRoute({ children }: { children: JSX.Element }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user.role !== "SUPER_ADMIN") {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/components/SuperAdminRoute.tsx
git commit -m "feat: add SuperAdminRoute guard component"
```

---

### Task 11: SuperAdminLayout — dark sidebar layout

**Files:**
- Create: `apps/frontend/src/pages/super-admin/SuperAdminLayout.tsx`

- [ ] **Step 1: Create SuperAdminLayout**

Create `apps/frontend/src/pages/super-admin/SuperAdminLayout.tsx`:

```tsx
import { Outlet, NavLink } from "react-router-dom";
import { LayoutDashboard, Building2 } from "lucide-react";

const NAV_ITEMS = [
  { to: "/super-admin", icon: LayoutDashboard, label: "Overview", end: true },
  { to: "/super-admin/tenants", icon: Building2, label: "Tenants" },
];

export default function SuperAdminLayout() {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-950 text-white flex flex-col shrink-0">
        <div className="p-6 border-b border-white/10">
          <h1 className="text-lg font-bold tracking-tight">QR Menu Admin</h1>
          <p className="text-xs text-gray-400 mt-0.5">Platform Control</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-accent text-white"
                    : "text-gray-300 hover:bg-white/10 hover:text-white"
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <p className="text-xs text-gray-500">Super Admin Access</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 bg-background overflow-auto">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/pages/super-admin/SuperAdminLayout.tsx
git commit -m "feat: add SuperAdminLayout with dark sidebar"
```

---

### Task 12: Frontend routing — App.tsx + LoginPage

**Files:**
- Modify: `apps/frontend/src/App.tsx`
- Modify: `apps/frontend/src/pages/LoginPage.tsx`

- [ ] **Step 1: Update LoginPage role redirect**

Open `apps/frontend/src/pages/LoginPage.tsx`. Replace the `useEffect` at line 10-13:

```tsx
  useEffect(() => {
    if (user) {
      if (user.role === 'SUPER_ADMIN') {
        navigate('/super-admin');
      } else {
        navigate('/dashboard');
      }
    }
  }, [user, navigate]);
```

- [ ] **Step 2: Add super-admin routes to App.tsx**

Open `apps/frontend/src/App.tsx`. Add lazy imports after the existing ones (after line 34):

```tsx
const SuperAdminLayout = lazy(() => import("./pages/super-admin/SuperAdminLayout"));
const OverviewPage = lazy(() => import("./pages/super-admin/OverviewPage"));
const TenantsPage = lazy(() => import("./pages/super-admin/TenantsPage"));
const TenantDetailPage = lazy(() => import("./pages/super-admin/TenantDetailPage"));
```

Add import for SuperAdminRoute (after line 18):

```tsx
import SuperAdminRoute from "./components/SuperAdminRoute";
```

Add the super-admin route group. After the PosLayout route group (after line 147) and before the public layout section:

```tsx
            {/* Super Admin — dark sidebar, platform-wide access */}
            <Route
              element={
                <SocketProvider>
                  <RestaurantProvider>
                    <NotificationProvider>
                      <SuperAdminLayout />
                    </NotificationProvider>
                  </RestaurantProvider>
                </SocketProvider>
              }
            >
              <Route
                path="/super-admin"
                element={
                  <SuperAdminRoute>
                    <OverviewPage />
                  </SuperAdminRoute>
                }
              />
              <Route
                path="/super-admin/tenants"
                element={
                  <SuperAdminRoute>
                    <TenantsPage />
                  </SuperAdminRoute>
                }
              />
              <Route
                path="/super-admin/tenants/:id"
                element={
                  <SuperAdminRoute>
                    <TenantDetailPage />
                  </SuperAdminRoute>
                }
              />
            </Route>
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/App.tsx apps/frontend/src/pages/LoginPage.tsx
git commit -m "feat: wire super-admin routes and login redirect"
```

---

### Task 13: OverviewPage — platform stats

**Files:**
- Create: `apps/frontend/src/pages/super-admin/OverviewPage.tsx`

- [ ] **Step 1: Create OverviewPage**

Create `apps/frontend/src/pages/super-admin/OverviewPage.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { getSuperAdminStats } from "../../lib/api";
import { Building2, Users, CreditCard, AlertTriangle } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

const TIER_COLORS: Record<string, string> = {
  FREE: "hsl(var(--color-muted-foreground))",
  STARTER: "hsl(var(--color-green-500))",
  PROFESSIONAL: "hsl(var(--color-accent))",
  ENTERPRISE: "hsl(var(--color-violet-500))",
};

export default function OverviewPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["super-admin", "stats"],
    queryFn: getSuperAdminStats,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Overview</h2>
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl glass-panel animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load platform stats.</p>
      </div>
    );
  }

  const cards = [
    { label: "Total Restaurants", value: data.totalRestaurants, icon: Building2 },
    { label: "Total Users", value: data.totalUsers, icon: Users },
    { label: "Active Subscriptions", value: data.activeSubscriptions, icon: CreditCard },
    { label: "Suspended", value: data.suspendedCount, icon: AlertTriangle },
  ];

  const chartData = Object.entries(data.byTier)
    .filter(([, count]) => count > 0)
    .map(([tier, count]) => ({ name: tier, value: count }));

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">Overview</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="glass-panel rounded-xl p-4 flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {chartData.length > 0 && (
        <div className="glass-panel rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Restaurants by Tier</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ name, value }) => `${name}: ${value}`}
              >
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={TIER_COLORS[entry.name] ?? "#888"} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/pages/super-admin/OverviewPage.tsx
git commit -m "feat: add OverviewPage with platform stats and tier chart"
```

---

### Task 14: TenantsPage — searchable tenant table

**Files:**
- Create: `apps/frontend/src/pages/super-admin/TenantsPage.tsx`

- [ ] **Step 1: Create TenantsPage**

Create `apps/frontend/src/pages/super-admin/TenantsPage.tsx`:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getSuperAdminTenants } from "../../lib/api";
import { Search } from "lucide-react";

const PAGE_SIZE = 20;

export default function TenantsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["super-admin", "tenants", page, search, tierFilter, statusFilter],
    queryFn: () =>
      getSuperAdminTenants({
        page,
        limit: PAGE_SIZE,
        ...(search && { search }),
        ...(tierFilter && { tier: tierFilter }),
        ...(statusFilter && { status: statusFilter }),
      }),
  });

  const totalPages = data ? Math.ceil(data.meta.total / PAGE_SIZE) : 0;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Tenants</h2>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm"
          />
        </div>

        <select
          value={tierFilter}
          onChange={(e) => { setTierFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
        >
          <option value="">All Tiers</option>
          <option value="FREE">FREE</option>
          <option value="STARTER">STARTER</option>
          <option value="PROFESSIONAL">PROFESSIONAL</option>
          <option value="ENTERPRISE">ENTERPRISE</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 rounded-lg glass-panel animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-muted-foreground text-center py-8">Failed to load tenants.</p>
      ) : (
        <>
          <div className="glass-panel rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Owner</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Tier</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Override</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Stripe</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {(data?.data ?? []).map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => navigate(`/super-admin/tenants/${t.id}`)}
                    className="border-b border-border/50 hover:bg-accent/5 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-sm font-medium">{t.name}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{t.owner.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        t.tier === 'ENTERPRISE' ? 'bg-violet-500/10 text-violet-500' :
                        t.tier === 'PROFESSIONAL' ? 'bg-accent/10 text-accent' :
                        t.tier === 'STARTER' ? 'bg-green-500/10 text-green-500' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {t.tier}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {t.forceTier ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-500">
                          {t.forceTier}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs ${t.stripeOnboarded ? 'text-green-500' : 'text-muted-foreground'}`}>
                        {t.stripeOnboarded ? 'Connected' : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        t.isActive ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                      }`}>
                        {t.isActive ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg text-sm border border-border disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg text-sm border border-border disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/pages/super-admin/TenantsPage.tsx
git commit -m "feat: add TenantsPage with search, filters, and pagination"
```

---

### Task 15: TenantDetailPage — tier override + suspend

**Files:**
- Create: `apps/frontend/src/pages/super-admin/TenantDetailPage.tsx`

- [ ] **Step 1: Create TenantDetailPage**

Create `apps/frontend/src/pages/super-admin/TenantDetailPage.tsx`:

```tsx
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSuperAdminTenant, updateTenantTier, updateTenantStatus } from "../../lib/api";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft } from "lucide-react";

const TIERS = ["FREE", "STARTER", "PROFESSIONAL", "ENTERPRISE"] as const;

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tierDialogOpen, setTierDialogOpen] = useState(false);
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string>("");

  const { data: tenant, isLoading, isError } = useQuery({
    queryKey: ["super-admin", "tenant", id],
    queryFn: () => getSuperAdminTenant(id!),
    enabled: !!id,
  });

  const tierMutation = useMutation({
    mutationFn: (forceTier: string | null) => updateTenantTier(id!, forceTier),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tenant", id] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tenants"] });
      setTierDialogOpen(false);
    },
  });

  const statusMutation = useMutation({
    mutationFn: (isActive: boolean) => updateTenantStatus(id!, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tenant", id] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tenants"] });
      setSuspendDialogOpen(false);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-32 rounded bg-muted animate-pulse" />
        <div className="h-48 rounded-xl glass-panel animate-pulse" />
      </div>
    );
  }

  if (isError || !tenant) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Tenant not found.</p>
        <button
          onClick={() => navigate("/super-admin/tenants")}
          className="mt-4 text-accent text-sm hover:underline"
        >
          Back to Tenants
        </button>
      </div>
    );
  }

  const effectiveTier = tenant.forceTier ?? tenant.tier;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => navigate("/super-admin/tenants")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Tenants
      </button>

      <h2 className="text-2xl font-bold">{tenant.name}</h2>

      {/* Info card */}
      <div className="glass-panel rounded-xl p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Owner</p>
          <p className="text-sm font-medium">{tenant.owner.email}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Stripe Tier</p>
          <p className="text-sm font-medium">{tenant.tier}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Effective Tier</p>
          <p className="text-sm font-medium">
            {effectiveTier}
            {tenant.forceTier && (
              <span className="ml-1 text-xs text-amber-500">(overridden)</span>
            )}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Stripe</p>
          <p className={`text-sm font-medium ${tenant.stripeOnboarded ? 'text-green-500' : 'text-muted-foreground'}`}>
            {tenant.stripeOnboarded ? 'Connected' : 'Not Connected'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Status</p>
          <p className={`text-sm font-medium ${tenant.isActive ? 'text-green-500' : 'text-red-500'}`}>
            {tenant.isActive ? 'Active' : 'Suspended'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total Orders</p>
          <p className="text-sm font-medium">{tenant.orderCount}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Payments Processed</p>
          <p className="text-sm font-medium">{tenant.paymentSummary.totalPayments}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Payment Volume</p>
          <p className="text-sm font-medium">&euro;{tenant.paymentSummary.totalAmount.toFixed(2)}</p>
        </div>
      </div>

      {/* Tier Management */}
      <div className="glass-panel rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4">Tier Management</h3>
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Current Stripe Tier</p>
            <span className="inline-flex px-2 py-0.5 rounded text-sm font-medium bg-accent/10 text-accent">
              {tenant.tier}
            </span>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Force Override</p>
            {tenant.forceTier ? (
              <span className="inline-flex px-2 py-0.5 rounded text-sm font-medium bg-amber-500/10 text-amber-500">
                {tenant.forceTier}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">None</span>
            )}
          </div>

          <Dialog.Root open={tierDialogOpen} onOpenChange={setTierDialogOpen}>
            <Dialog.Trigger asChild>
              <button className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium">
                {tenant.forceTier ? 'Change Override' : 'Override Tier'}
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 bg-black/50" />
              <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background rounded-xl p-6 shadow-xl w-[400px] max-w-[90vw]">
                <Dialog.Title className="text-lg font-semibold mb-2">Override Tier</Dialog.Title>
                <Dialog.Description className="text-sm text-muted-foreground mb-4">
                  This overrides the Stripe-driven tier. The restaurant will get features of the selected tier regardless of their Stripe subscription.
                </Dialog.Description>
                <select
                  value={selectedTier}
                  onChange={(e) => setSelectedTier(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm mb-4"
                >
                  <option value="">Select tier...</option>
                  {TIERS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <div className="flex justify-end gap-3">
                  <Dialog.Close asChild>
                    <button className="px-4 py-2 rounded-lg text-sm border border-border">
                      Cancel
                    </button>
                  </Dialog.Close>
                  <button
                    onClick={() => selectedTier && tierMutation.mutate(selectedTier)}
                    disabled={!selectedTier || tierMutation.isPending}
                    className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium disabled:opacity-50"
                  >
                    {tierMutation.isPending ? 'Applying...' : 'Apply'}
                  </button>
                </div>
                {tenant.forceTier && (
                  <button
                    onClick={() => tierMutation.mutate(null)}
                    disabled={tierMutation.isPending}
                    className="mt-3 w-full px-4 py-2 rounded-lg text-sm border border-border text-muted-foreground hover:text-foreground"
                  >
                    Clear Override (restore Stripe-driven tier)
                  </button>
                )}
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="glass-panel rounded-xl p-6 border border-red-500/20">
        <h3 className="text-lg font-semibold text-red-500 mb-4">Danger Zone</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {tenant.isActive
            ? "Suspending will freeze all access — public menu, ordering, and dashboard will be disabled."
            : "This restaurant is currently suspended. Reactivate to restore access."}
        </p>

        <Dialog.Root open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
          <Dialog.Trigger asChild>
            <button
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                tenant.isActive
                  ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                  : 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
              }`}
            >
              {tenant.isActive ? 'Suspend Restaurant' : 'Reactivate Restaurant'}
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/50" />
            <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background rounded-xl p-6 shadow-xl w-[400px] max-w-[90vw]">
              <Dialog.Title className="text-lg font-semibold mb-2">
                {tenant.isActive ? 'Suspend Restaurant?' : 'Reactivate Restaurant?'}
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground mb-4">
                {tenant.isActive
                  ? 'All menu access, ordering, and dashboard will be frozen. This action is reversible.'
                  : 'The restaurant will regain full access. Owners and staff will be able to log in again.'}
              </Dialog.Description>
              <div className="flex justify-end gap-3">
                <Dialog.Close asChild>
                  <button className="px-4 py-2 rounded-lg text-sm border border-border">
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  onClick={() => statusMutation.mutate(!tenant.isActive)}
                  disabled={statusMutation.isPending}
                  className={`px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 ${
                    tenant.isActive ? 'bg-red-500' : 'bg-green-500'
                  }`}
                >
                  {statusMutation.isPending
                    ? 'Processing...'
                    : tenant.isActive
                      ? 'Yes, Suspend'
                      : 'Yes, Reactivate'}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/pages/super-admin/TenantDetailPage.tsx
git commit -m "feat: add TenantDetailPage with tier override and suspend controls"
```

---

### Task 16: i18n — add EN translation keys

**Files:**
- Modify: `apps/frontend/src/locales/en/translation.json`

- [ ] **Step 1: Read current translation.json to find insertion point**

Read `apps/frontend/src/locales/en/translation.json` and add `superAdmin` namespace at the end of the JSON object (before the final `}`):

```json
  "superAdmin": {
    "title": "Super Admin",
    "overview": "Overview",
    "tenants": "Tenants",
    "totalRestaurants": "Total Restaurants",
    "totalUsers": "Total Users",
    "activeSubscriptions": "Active Subscriptions",
    "suspended": "Suspended",
    "searchPlaceholder": "Search by name or email...",
    "tier": "Tier",
    "forceTier": "Forced Tier",
    "overrideTier": "Override Tier",
    "clearOverride": "Clear Override",
    "suspend": "Suspend Restaurant",
    "reactivate": "Reactivate Restaurant",
    "confirmSuspend": "All access will be frozen. Continue?",
    "confirmReactivate": "Reactivate this restaurant?",
    "noTenants": "No restaurants found",
    "byTier": "Restaurants by Tier",
    "stripeStatus": "Stripe Status",
    "onboarded": "Connected",
    "notOnboarded": "Not Connected",
    "loadError": "Failed to load data.",
    "tenantNotFound": "Tenant not found.",
    "backToTenants": "Back to Tenants",
    "changeOverride": "Change Override",
    "effectiveTier": "Effective Tier",
    "stripeTier": "Stripe Tier",
    "paymentsProcessed": "Payments Processed",
    "paymentVolume": "Payment Volume"
  }
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/locales/en/translation.json
git commit -m "feat: add superAdmin i18n keys (EN)"
```

---

### Task 17: Backend e2e smoke test

**Files:**
- Create: `apps/backend/test/super-admin.e2e-spec.ts`

- [ ] **Step 1: Create e2e test**

Create `apps/backend/test/super-admin.e2e-spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('SuperAdmin (e2e)', () => {
  let app: INestApplication;
  let jwtToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/super-admin/stats (GET) without auth → 401', () => {
    return request(app.getHttpServer())
      .get('/api/v1/super-admin/stats')
      .expect(401);
  });

  it('/api/v1/super-admin/tenants (GET) without auth → 401', () => {
    return request(app.getHttpServer())
      .get('/api/v1/super-admin/tenants')
      .expect(401);
  });
});
```

- [ ] **Step 2: Run e2e**

Run: `npm run test:e2e -- super-admin.e2e-spec`
Expected: 2 tests PASS (401 unauthorized)

- [ ] **Step 3: Commit**

```bash
git add apps/backend/test/super-admin.e2e-spec.ts
git commit -m "test: add super-admin e2e auth smoke tests"
```

---

### Task 18: Build verification

**Files:** (none — verification only)

- [ ] **Step 1: Build backend**

Run: `cd apps/backend && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Build frontend**

Run: `cd apps/frontend && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Run all tests**

Run: `cd apps/backend && npx jest --passWithNoTests`
Expected: All existing + new tests pass

---

## Self-Review Notes

- Spec coverage: All 4 phases covered. Schema (Task 1), guard/feature resolution (Tasks 2-3), DTOs (Task 4), service (Task 5), controller (Task 6), module registration (Task 7), suspend enforcement (Task 8), API client (Task 9), route guard (Task 10), layout (Task 11), routing (Task 12), all 3 views (Tasks 13-15), i18n (Task 16), e2e (Task 17), build verification (Task 18)
- No TBD/TODO/placeholders — every step has complete code
- Type consistency verified: `forceTier: string | null` throughout backend and frontend, `isActive: boolean`, `TenantDetail` includes `PaymentSummary`
- Filenames scoped by feature: all under `apps/backend/src/super-admin/` and `apps/frontend/src/pages/super-admin/`
- Modifications only to files that need changes (app.module.ts, App.tsx, LoginPage.tsx, feature.guard.ts, feature.service.ts, public-menu.controller.ts, orders.service.ts, api.ts, types/index.ts, translation.json)
