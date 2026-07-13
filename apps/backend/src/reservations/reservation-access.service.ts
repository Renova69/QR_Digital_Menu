import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureService } from '../subscription/feature.service';
import { FeatureFlag } from '../subscription/feature-flag.enum';

export type ActorRole =
  'OWNER' | 'MANAGER' | 'WAITER' | 'STAFF' | 'SUPER_ADMIN';

/**
 * Shared reservation access-control primitives. Extracted so every reservation
 * sub-service (settings, blackout, analytics, and the core booking lifecycle in
 * `ReservationsService`) enforces the exact same actor-resolution, role, and
 * entitlement rules instead of re-implementing them per file.
 *
 * Exported as plain functions (in addition to the `@Injectable` wrapper below)
 * so callers that cannot take on a new constructor dependency — namely
 * `ReservationsService`, whose constructor shape is pinned by existing unit
 * and e2e tests that construct it positionally — can still reuse the same
 * logic via `this.prisma` / `this.features` without any behavior drift.
 */
export async function resolveReservationActor(
  prisma: PrismaService,
  restaurantId: string,
  userId: string,
): Promise<ActorRole> {
  const [restaurant, user] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { ownerId: true, isActive: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { restaurantId: true, role: true },
    }),
  ]);
  if (!restaurant) throw new NotFoundException('Restaurant not found');
  if (user?.role === 'SUPER_ADMIN') return 'SUPER_ADMIN';
  if (restaurant.isActive === false) {
    throw new ForbiddenException('Restaurant is not active');
  }
  if (restaurant.ownerId === userId) return 'OWNER';
  // KITCHEN never touches reservations (no guest PII).
  if (
    user?.restaurantId === restaurantId &&
    (user.role === 'MANAGER' || user.role === 'WAITER' || user.role === 'STAFF')
  ) {
    return user.role;
  }
  throw new ForbiddenException(
    'You do not have permission to access reservations for this restaurant',
  );
}

export function assertReservationRole(
  role: ActorRole,
  allowed: ActorRole[],
): void {
  if (role === 'OWNER' || role === 'SUPER_ADMIN') return;
  if (!allowed.includes(role)) {
    throw new ForbiddenException(
      'Your role cannot perform this reservation action',
    );
  }
}

export async function requireReservationEntitlement(
  prisma: PrismaService,
  features: FeatureService,
  restaurantId: string,
) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      tier: true,
      forceTier: true,
      dashboardLanguage: true,
      isActive: true,
    },
  });
  if (!restaurant) {
    throw new NotFoundException('Restaurant not found');
  }
  if (restaurant.isActive === false) {
    throw new ForbiddenException('Restaurant is not active');
  }
  if (!features.restaurantHasFeature(restaurant, FeatureFlag.RESERVATIONS)) {
    throw new ForbiddenException({
      code: 'FEATURE_LOCKED',
      message: 'Reservations require a Professional plan or above',
    });
  }
  return restaurant;
}

@Injectable()
export class ReservationAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly features: FeatureService,
  ) {}

  resolveActor(restaurantId: string, userId: string): Promise<ActorRole> {
    return resolveReservationActor(this.prisma, restaurantId, userId);
  }

  assertRole(role: ActorRole, allowed: ActorRole[]): void {
    assertReservationRole(role, allowed);
  }

  requireEntitlement(restaurantId: string) {
    return requireReservationEntitlement(
      this.prisma,
      this.features,
      restaurantId,
    );
  }
}
