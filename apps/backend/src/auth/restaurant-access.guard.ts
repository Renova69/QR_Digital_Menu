import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { assertRestaurantActive } from '../restaurants/assert-restaurant-active';
import {
  isRestaurantAccessRequirement,
  RESTAURANT_ACCESS_KEY,
  RestaurantAccessRequirement,
  setRestaurantAccess,
} from './restaurant-access.policy';

const RESTAURANT_SELECT = {
  id: true,
  ownerId: true,
  tier: true,
  forceTier: true,
  isActive: true,
  deletedAt: true,
} as const;

interface AccessRequest {
  user?: { id?: string; sub?: string; role?: string; restaurantId?: string };
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
}

@Injectable()
export class RestaurantAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      throw new ForbiddenException('Restaurant access requires HTTP context');
    }
    const request = context.switchToHttp().getRequest<AccessRequest>();
    setRestaurantAccess(request, undefined);
    const requirement =
      this.reflector.getAllAndOverride<RestaurantAccessRequirement>(
        RESTAURANT_ACCESS_KEY,
        [context.getHandler(), context.getClass()],
      );
    if (!isRestaurantAccessRequirement(requirement)) {
      // A wiring error must fail closed, never silently authorize an endpoint.
      throw new InternalServerErrorException(
        'Restaurant access policy is missing or invalid',
      );
    }

    // JwtStrategy already reloads the account and applies subscription demotion.
    // Do NOT replace this with the raw DB role (e.g. demoted MANAGER -> STAFF).
    const userId = request.user?.id ?? request.user?.sub;
    if (!userId) throw new UnauthorizedException();
    const role = request.user?.role?.toUpperCase() ?? '';
    const { policy } = requirement;
    if (policy === 'print-management' && role !== 'OWNER') {
      throw new ForbiddenException(
        'Print station management requires OWNER role',
      );
    }
    if (policy === 'staff-management' && !['OWNER', 'MANAGER'].includes(role)) {
      throw new ForbiddenException('Only owners and managers can manage staff');
    }

    const value = request[requirement.source]?.[requirement.key];
    const ownerFallback =
      policy === 'print-management' &&
      requirement.source === 'query' &&
      value === undefined;
    if (
      !ownerFallback &&
      (typeof value !== 'string' ||
        !value.length ||
        value.length > 200 ||
        value.trim() !== value)
    ) {
      // Guards run before pipes: reject arrays/objects/empty ids before Prisma.
      // Only an omitted print-management query can select the first owned row.
      throw new BadRequestException(
        `${requirement.key} must be a non-empty string`,
      );
    }
    const restaurant = ownerFallback
      ? await this.prisma.restaurant.findFirst({
          where: { ownerId: userId, deletedAt: null },
          orderBy: { createdAt: 'asc' },
          select: RESTAURANT_SELECT,
        })
      : await this.prisma.restaurant.findUnique({
          where: {
            id: await this.resolveRestaurantId(requirement, value as string),
          },
          select: RESTAURANT_SELECT,
        });

    // Preserve status policy: dashboard/printing reject retired restaurants;
    // staff recovery and scan reporting do not acquire a new suspension gate.
    const hidesDeleted =
      policy === 'dashboard' || policy === 'print-management';
    if (!restaurant || (hidesDeleted && restaurant.deletedAt)) {
      if (policy === 'dashboard')
        throw new ForbiddenException('Restaurant not found');
      throw new NotFoundException('Restaurant not found');
    }
    if (policy === 'dashboard' && !restaurant.isActive) {
      throw new ForbiddenException({
        code: 'RESTAURANT_SUSPENDED',
        message: 'This restaurant has been suspended',
      });
    }
    // Menu CRUD already rejects suspension AND soft deletion, with the same
    // localized code. Keep this policy distinct from dashboard's hidden rows.
    if (policy === 'menu-management') assertRestaurantActive(restaurant);
    const isOwner = restaurant.ownerId === userId;
    const isAssigned = request.user?.restaurantId === restaurant.id;
    const allowed =
      isOwner ||
      (isAssigned &&
        (((policy === 'dashboard' || policy === 'menu-management') &&
          role === 'MANAGER') ||
          policy === 'staff-management' ||
          (policy === 'scan-stats' &&
            ['STAFF', 'MANAGER', 'WAITER', 'KITCHEN'].includes(role))));
    // There is intentionally no SUPER_ADMIN bypass. FeatureGuard's tier bypass
    // is not a grant to tenant data or owner-only printer/staff operations.
    if (!allowed) throw new ForbiddenException('Access denied');
    if (policy === 'print-management' && !restaurant.isActive) {
      throw new ForbiddenException({
        code: 'RESTAURANT_SUSPENDED',
        message: 'This restaurant has been suspended',
      });
    }

    setRestaurantAccess(request, {
      restaurantId: restaurant.id,
      userId,
      role,
      tier: restaurant.tier ?? 'FREE',
      forceTier: restaurant.forceTier ?? null,
    });
    return true;
  }

  private async resolveRestaurantId(
    requirement: RestaurantAccessRequirement,
    id: string,
  ): Promise<string> {
    // The resource relationships are authoritative, never a body/query tenant
    // id. Keep the later service/child checks: this is not a transactional lock
    // against ownership or resource changes between authorization and a write.
    switch (requirement.resource) {
      case 'category': {
        const category = await this.prisma.menuCategory.findUnique({
          where: { id },
          select: { restaurantId: true },
        });
        if (!category) throw new NotFoundException('Category not found');
        return category.restaurantId;
      }
      case 'item': {
        const item = await this.prisma.menuItem.findUnique({
          where: { id },
          select: { category: { select: { restaurantId: true } } },
        });
        if (!item) throw new NotFoundException('Menu item not found');
        return item.category.restaurantId;
      }
      case 'option': {
        const option = await this.prisma.menuOption.findUnique({
          where: { id },
          select: {
            menuItem: {
              select: { category: { select: { restaurantId: true } } },
            },
          },
        });
        if (!option) throw new NotFoundException('Menu option not found');
        return option.menuItem.category.restaurantId;
      }
      default:
        // Metadata validation only permits undefined or 'restaurant' here.
        return id;
    }
  }
}
