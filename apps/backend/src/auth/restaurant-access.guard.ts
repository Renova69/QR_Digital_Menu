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
import { RESERVATION_ACTION_ROLES } from '../reservations/reservation-access.service';
import type { ReservationActionType } from '../reservations/dto/reservation-ops.dto';
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
  body?: Record<string, unknown>;
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
    let actionRoles: readonly string[] = [];
    if (policy === 'reservation-action') {
      const action = request.body?.action;
      if (
        typeof action !== 'string' ||
        !Object.prototype.hasOwnProperty.call(RESERVATION_ACTION_ROLES, action)
      ) {
        throw new BadRequestException('Invalid reservation action');
      }
      actionRoles = RESERVATION_ACTION_ROLES[action as ReservationActionType];
    }
    if (policy === 'print-management' && role !== 'OWNER') {
      throw new ForbiddenException(
        'Print station management requires OWNER role',
      );
    }
    if (
      (policy === 'staff-management' ||
        policy === 'notification-management' ||
        (policy === 'order-update' && request.body?.status === 'CANCELED')) &&
      !['OWNER', 'MANAGER'].includes(role)
    ) {
      throw new ForbiddenException(
        policy === 'staff-management'
          ? 'Only owners and managers can manage staff'
          : 'This operation requires owner or manager role',
      );
    }

    const value = request[requirement.source]?.[requirement.key];
    if (policy === 'service-list' && value === undefined) {
      // An unfiltered list is account-scoped, not one arbitrary owned tenant.
      // The existing service always filters by this user's ownership/assignment.
      // No single-restaurant context is fabricated; FeatureGuard must not pick
      // up an undeclared body/parameter target for this mode.
      return true;
    }
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

    // Match the underlying contracts: restaurant reads/settings/billing hide
    // deleted rows, but only selected features impose a suspension gate.
    // Device recovery, import and audit retain their separate status behavior.
    const hidesDeleted = [
      'dashboard',
      'print-management',
      'restaurant-read',
      'restaurant-management',
      'restaurant-owner',
    ].includes(policy);
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
    // Preserve only the pre-existing admin exceptions, not a global bypass.
    const reservationPolicy = [
      'reservation-read',
      'reservation-management',
      'reservation-operations',
      'reservation-action',
    ].includes(policy);
    const adminAccess =
      role === 'SUPER_ADMIN' &&
      (policy === 'table-read' || policy === 'zone-read' || reservationPolicy);
    if (
      policy === 'menu-management' ||
      policy === 'table-management' ||
      (policy === 'table-read' && !adminAccess)
    )
      assertRestaurantActive(restaurant);
    if (reservationPolicy && !adminAccess && restaurant.isActive === false) {
      throw new ForbiddenException('Restaurant is not active');
    }
    const isOwner = restaurant.ownerId === userId;
    const isAssigned = request.user?.restaurantId === restaurant.id;
    const allowed =
      adminAccess ||
      isOwner ||
      (isAssigned &&
        (([
          'dashboard',
          'menu-management',
          'restaurant-management',
          'device-management',
          'table-management',
          'zone-management',
          'reservation-management',
        ].includes(policy) &&
          role === 'MANAGER') ||
          policy === 'staff-management' ||
          policy === 'notification-management' ||
          // These existing read contracts allow any assigned account, not just
          // editing roles. Do not demote their access to owner/manager-only.
          policy === 'restaurant-read' ||
          policy === 'menu-audit' ||
          policy === 'table-read' ||
          policy === 'zone-read' ||
          policy === 'service-member' ||
          policy === 'service-list' ||
          policy === 'order-update' ||
          (policy === 'reservation-read' &&
            ['MANAGER', 'WAITER', 'STAFF'].includes(role)) ||
          (policy === 'reservation-operations' &&
            ['MANAGER', 'WAITER'].includes(role)) ||
          (policy === 'reservation-action' && actionRoles.includes(role)) ||
          (policy === 'scan-stats' &&
            ['STAFF', 'MANAGER', 'WAITER', 'KITCHEN'].includes(role))));
    // FeatureGuard's tier bypass is not itself a grant to tenant data.
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
      case 'table': {
        const table = await this.prisma.restaurantTable.findUnique({
          where: { id },
          select: { restaurantId: true },
        });
        if (!table) throw new NotFoundException('Table not found');
        return table.restaurantId;
      }
      case 'zone': {
        const zone = await this.prisma.tableZone.findUnique({
          where: { id },
          select: { restaurantId: true },
        });
        if (!zone) throw new NotFoundException('Zone not found');
        return zone.restaurantId;
      }
      case 'assistance': {
        const assistance = await this.prisma.assistanceRequest.findUnique({
          where: { id },
          select: { restaurantId: true },
        });
        if (!assistance)
          throw new NotFoundException('Assistance request not found');
        return assistance.restaurantId;
      }
      case 'order': {
        const order = await this.prisma.order.findUnique({
          where: { id },
          select: { restaurantId: true },
        });
        if (!order) throw new NotFoundException('Order not found');
        return order.restaurantId;
      }
      case 'feedback': {
        const feedback = await this.prisma.feedback.findUnique({
          where: { id },
          select: { restaurantId: true },
        });
        if (!feedback) throw new NotFoundException('Feedback not found');
        return feedback.restaurantId;
      }
      default:
        // Metadata validation only permits undefined or 'restaurant' here.
        return id;
    }
  }
}
