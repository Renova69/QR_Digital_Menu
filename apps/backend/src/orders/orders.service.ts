import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { EventsGateway } from '../events/events.gateway';
import { OrderQueryDto } from './dto/order-query.dto';
import {
  addDays,
  addEarnedPointBatch,
  expireAccountPoints,
  redeemAccountPoints,
} from '../loyalty/loyalty-ledger.utils';
import {
  getTierInfo,
  tierConfigFromRestaurant,
} from '../loyalty/loyalty-tiers.utils';
import { FeatureService } from '../subscription/feature.service';
import { FeatureFlag } from '../subscription/feature-flag.enum';
import { isLoyaltyAvailable } from '../loyalty/loyalty-availability.util';

/** Roles that may be attributed as POS staff on an order (#4). */
const POS_STAFF_ROLES = new Set(['OWNER', 'MANAGER', 'WAITER', 'KITCHEN', 'STAFF']);

const LOYALTY_CONFIG = {
  MAX_SIGNUP_BONUS: 75,    // hard cap on signup bonus (= €0.50)
  MAX_ORDER_DISCOUNT: 0.15, // max 15% of order total redeemable
} as const;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsGateway: EventsGateway,
    private readonly featureService: FeatureService,
  ) {}

  async create(createOrderDto: CreateOrderDto, staffUserId: string | null = null) {
    // `createOrderDto.source` is the caller's INTENT only — used here to require
    // an authenticated staff identity for POS orders. The source actually
    // recorded on the Order is DERIVED from resolvePosStaff below (#L3); never
    // trust the client to label an order as staff-created.
    if (createOrderDto.source === 'POS' && !staffUserId) {
      throw new UnauthorizedException('Session expired. Please log in again.');
    }

    if (!createOrderDto.items || createOrderDto.items.length === 0) {
      throw new BadRequestException('Order must contain at least one item');
    }

    // 1. Fetch all menu items at once (no N+1). Deduplicate IDs —
    //    same item added twice (e.g. qty 1 + qty 1) sends duplicate menuItemIds.
    const menuItemIds = [...new Set(createOrderDto.items.map((i) => i.menuItemId))];

    const dbItems = await this.prisma.menuItem.findMany({
      where: { id: { in: menuItemIds } },
      include: { category: true },
    });

    if (dbItems.length !== menuItemIds.length) {
      throw new NotFoundException('Some menu items not found');
    }

    const itemsMap = new Map(dbItems.map((i) => [i.id, i]));

    // 2. Validate all items belong to the same restaurant
    const restaurantId = dbItems[0].category.restaurantId;

    for (const item of createOrderDto.items) {
      const dbItem = itemsMap.get(item.menuItemId);
      if (!dbItem) {
        throw new NotFoundException(`Menu item ${item.menuItemId} not found`);
      }
      if (dbItem.category.restaurantId !== restaurantId) {
        throw new BadRequestException(
          'All items must belong to the same restaurant',
        );
      }
    }

    // 3. Fetch ALL options in one query (no N+1)
    const allOptions = await this.prisma.menuOption.findMany({
      where: { menuItemId: { in: menuItemIds } },
    });

    const optionsMap = new Map<string, typeof allOptions>();
    for (const opt of allOptions) {
      const existing = optionsMap.get(opt.menuItemId) || [];
      existing.push(opt);
      optionsMap.set(opt.menuItemId, existing);
    }

    // 4. Fetch restaurant (includes timezone + loyalty + tier config)
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    // Check restaurant is active (not suspended)
    if (!restaurant.isActive) {
      throw new ForbiddenException({
        code: 'RESTAURANT_SUSPENDED',
        message: 'This restaurant has been suspended',
      });
    }

    const effectiveTier = this.featureService.getEffectiveTier(String(restaurant.tier), restaurant.forceTier ?? null);
    if (!this.featureService.hasFeature(effectiveTier, FeatureFlag.ORDERS_RECEIVE)) {
      throw new ForbiddenException({ code: 'FEATURE_LOCKED', message: 'Online ordering is not available on this plan' });
    }

    // Attribute the order to POS staff ONLY when the authenticated caller is a
    // staff member of THIS restaurant (or its owner). Otherwise — a logged-in
    // customer, or an owner browsing another restaurant — the order is a normal
    // customer order, not POS (#4). Prevents misclassifying customers as staff.
    const resolvedStaffUserId = await this.resolvePosStaff(staffUserId, restaurant.ownerId, restaurantId);

    // 5. Resolve or create TableSession for pay-at-table.
    // The client sends the table NAME (e.g. "1"). We persist the real table
    // cuid in Order.tableId and keep the name in Order.tableName for display
    // (#M1) — so tableId is a stable identifier consistent with TableSession
    // and the socket layer, not a renameable label.
    let sessionToken = createOrderDto.sessionToken;
    let tableSessionId: string | undefined;
    let resolvedTableCuid: string | null = null;

    if (sessionToken) {
      const existingSession = await this.prisma.tableSession.findFirst({
        where: { token: sessionToken, status: 'OPEN' },
      });
      if (existingSession) {
        tableSessionId = existingSession.id;
        resolvedTableCuid = existingSession.tableId;
      } else {
        sessionToken = undefined;
      }
    }

    if (!tableSessionId && createOrderDto.tableId) {
      // Frontend sends table name (e.g. "1"), not cuid — resolve to real id
      const table = await this.prisma.restaurantTable.findFirst({
        where: { name: createOrderDto.tableId, restaurantId },
      });
      if (!table) throw new NotFoundException('Table not found for this restaurant');

      const tableCuid = table.id;
      resolvedTableCuid = tableCuid;

      const newSession = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.tableSession.findFirst({
          where: {
            tableId: tableCuid,
            restaurantId,
            status: 'OPEN',
          },
        });
        if (existing) return existing;
        return tx.tableSession.create({
          data: { tableId: tableCuid, restaurantId },
        });
      });
      tableSessionId = newSession.id;
      sessionToken = newSession.token;
    }

    // 6. Happy hour — use restaurant's local timezone via luxon so the window
    //    fires at the correct wall-clock time regardless of server timezone.
    let happyHourMultiplier = 1;

    if (
      restaurant.happyHourEnable &&
      restaurant.happyHourStartTime &&
      restaurant.happyHourEndTime
    ) {
      const tz = restaurant.timezone || 'Europe/Sofia';
      const nowInTz = DateTime.now().setZone(tz);
      const currentMinutes = nowInTz.hour * 60 + nowInTz.minute;

      const [startH, startM] = restaurant.happyHourStartTime
        .split(':')
        .map(Number);
      const [endH, endM] = restaurant.happyHourEndTime.split(':').map(Number);

      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      const activeDays: number[] = Array.isArray(restaurant.happyHourDays)
        ? restaurant.happyHourDays
        : [1, 2, 3, 4, 5, 6, 7];

      // Overnight ranges belong to the selected start day, e.g. Friday 22:00-02:00 includes Saturday 01:00.
      const inHappyHour =
        startMinutes <= endMinutes
          ? currentMinutes >= startMinutes && currentMinutes <= endMinutes
          : currentMinutes >= startMinutes || currentMinutes <= endMinutes;
      const effectiveWeekday =
        startMinutes <= endMinutes || currentMinutes >= startMinutes
          ? nowInTz.weekday
          : nowInTz.minus({ days: 1 }).weekday;
      const dayMatches =
        activeDays.length > 0 && activeDays.includes(effectiveWeekday);

      if (dayMatches && inHappyHour) {
        happyHourMultiplier = restaurant.happyHourMultiplier || 1;
      }
    }

    // 6. Pre-calculate totals server-side (never trust client prices)
    let computedTotal = 0;
    let itemsPointsRedeemed = 0;
    const itemsData: { menuItemId: string; quantity: number; selectedOptions: any[] }[] = [];

    // redeemItemIds is a per-cart-line list: it may contain the same menuItemId
    // more than once when multiple lines of the same product are redeemed. Count
    // how many redemptions each menuItemId is granted, then consume them one per
    // matching cart line so we never comp more lines than were actually redeemed
    // (H-6 — previously a duplicated menuItemId comped every matching line).
    const redeemCounts = new Map<string, number>();
    for (const id of createOrderDto.redeemItemIds ?? []) {
      redeemCounts.set(id, (redeemCounts.get(id) ?? 0) + 1);
    }
    const usedCounts = new Map<string, number>();

    for (const item of createOrderDto.items) {
      const dbItem = itemsMap.get(item.menuItemId);
      if (!dbItem) {
        throw new BadRequestException(`Menu item not found: ${item.menuItemId}`);
      }
      let itemPrice = dbItem.price;

      const availableRedemptions = redeemCounts.get(item.menuItemId) ?? 0;
      const usedRedemptions = usedCounts.get(item.menuItemId) ?? 0;
      const isRedeemedFree =
        availableRedemptions > usedRedemptions && !!dbItem.rewardPointsPrice;

      if (isRedeemedFree) {
        usedCounts.set(item.menuItemId, usedRedemptions + 1);
        itemsPointsRedeemed += (dbItem.rewardPointsPrice ?? 0) * item.quantity;
        itemPrice = 0;
      }

      // Options on redeemed items are also free (item is fully comped)
      let optionsTotal = 0;

      if (!isRedeemedFree && item.selectedOptions?.length) {
        const itemOptions = optionsMap.get(item.menuItemId) || [];

        for (const selected of item.selectedOptions) {
          const option = itemOptions.find((o) => o.id === selected.optionId);
          if (!option) {
            throw new BadRequestException({
              message: 'Invalid option selected',
              optionId: selected.optionId,
            });
          }

          const choices = option.choices as {
            name: string;
            priceModifier: number;
          }[];
          const choice = choices.find((c) => c.name === selected.choiceName);
          if (!choice) {
            throw new BadRequestException({
              message: 'Invalid choice selected',
              optionId: selected.optionId,
              choiceName: selected.choiceName,
            });
          }
          optionsTotal += choice.priceModifier || 0;
        }
      }

      computedTotal += (itemPrice + optionsTotal) * item.quantity;

      itemsData.push({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        selectedOptions: item.selectedOptions || [],
      });
    }

    if (computedTotal < 0) {
      throw new BadRequestException('Invalid total calculation');
    }

    // 7. Main transaction — loyalty + order creation are atomic
    const finalOrder = await this.prisma.$transaction(async (tx) => {
      let finalTotal = computedTotal;
      let pointsEarned = 0;
      let pointsRedeemedForDiscount = 0;
      let pointsRedeemedForItems = itemsPointsRedeemed;
      let loyaltyAcc = null;
      let totalPointsRedeemed = 0;
      let purchasePointsEarned = 0;
      let signupBonusPoints = 0;

      if (
        createOrderDto.customerId &&
        isLoyaltyAvailable(restaurant, this.featureService)
      ) {
        const earnRate = restaurant.loyaltyExchangeRate || 10;
        const redeemRate = restaurant.loyaltyRedeemRate || 150;

        loyaltyAcc = await tx.loyaltyAccount.findUnique({
          where: {
            userId_restaurantId: {
              userId: createOrderDto.customerId,
              restaurantId,
            },
          },
        });

        if (!loyaltyAcc) {
          loyaltyAcc = await tx.loyaltyAccount.create({
            data: {
              userId: createOrderDto.customerId,
              restaurantId,
              points: 0,
              lifetimePoints: 0,
            },
          });
        }

        await expireAccountPoints(tx, loyaltyAcc.id);
        loyaltyAcc = await tx.loyaltyAccount.findUniqueOrThrow({
          where: { id: loyaltyAcc.id },
        });

        // Cash discount redemption (capped at MAX_ORDER_DISCOUNT)
        if (createOrderDto.redeemPoints && createOrderDto.redeemPoints > 0) {
          const requestedDiscount = createOrderDto.redeemPoints / redeemRate;
          const maxDiscount = finalTotal * LOYALTY_CONFIG.MAX_ORDER_DISCOUNT;
          const finalDiscount = Math.min(requestedDiscount, maxDiscount);
          const pointsToRedeem = Math.floor(finalDiscount * redeemRate);

          if (pointsToRedeem > 0 && loyaltyAcc.points < pointsToRedeem) {
            throw new BadRequestException('Not enough loyalty points');
          }
          if (finalDiscount > finalTotal) {
            throw new BadRequestException(
              'Cannot redeem more points than total',
            );
          }

          finalTotal -= finalDiscount;
          pointsRedeemedForDiscount = pointsToRedeem;
        }

        totalPointsRedeemed = pointsRedeemedForDiscount + pointsRedeemedForItems;

        if (loyaltyAcc.points < totalPointsRedeemed) {
          throw new BadRequestException(
            'Not enough points for items + discount',
          );
        }

        // Dynamic VIP tier from restaurant config — single source of truth
        const tierConfig = tierConfigFromRestaurant(restaurant);
        const tierInfo = getTierInfo(loyaltyAcc.lifetimePoints, tierConfig);

        // Take the highest multiplier (additive stacking silently discards bonuses)
        const finalMultiplier = Math.max(
          happyHourMultiplier,
          tierInfo.multiplier,
        );

        // Points earned on post-discount total (customer didn't pay the discounted amount)
        const basePoints = finalTotal * earnRate;
        pointsEarned = Math.floor(basePoints * finalMultiplier);
        purchasePointsEarned = pointsEarned;

        // Signup bonus — once per restaurant, checked before lifetimePoints is updated
        if (loyaltyAcc.lifetimePoints === 0) {
          signupBonusPoints = Math.min(
            LOYALTY_CONFIG.MAX_SIGNUP_BONUS,
            restaurant.loyaltySignupBonus || 0,
          );
          pointsEarned += signupBonusPoints;
        }

        await tx.loyaltyAccount.update({
          where: { id: loyaltyAcc.id },
          data: {
            points: { increment: pointsEarned - totalPointsRedeemed },
            lifetimePoints: { increment: pointsEarned },
          },
        });
      } else if (pointsRedeemedForItems > 0 || createOrderDto.redeemPoints) {
        throw new BadRequestException('Loyalty program is not available');
      }

      const order = await tx.order.create({
        data: {
          customerName: createOrderDto.customerName,
          customerPhone: createOrderDto.customerPhone,
          customerId: createOrderDto.customerId,
          tableId: resolvedTableCuid,
          tableName: createOrderDto.tableId ?? null,
          specialRequests: createOrderDto.specialRequests,
          totalPrice: finalTotal,
          pointsEarned,
          pointsRedeemedForDiscount,
          pointsRedeemedForItems,
          pointsRedeemed: pointsRedeemedForDiscount + pointsRedeemedForItems,
          restaurantId,
          tableSessionId,
          source: resolvedStaffUserId ? 'POS' : 'CUSTOMER',
          staffUserId: resolvedStaffUserId ?? undefined,
          items: { create: itemsData },
        },
        include: { items: true },
      });

      if (loyaltyAcc) {
        const expiresAt = addDays(
          new Date(),
          restaurant.loyaltyPointExpiryDays || 90,
        );

        await redeemAccountPoints(tx, loyaltyAcc.id, totalPointsRedeemed, order.id);
        await addEarnedPointBatch(tx, loyaltyAcc.id, purchasePointsEarned, 'EARN', expiresAt, order.id);
        await addEarnedPointBatch(tx, loyaltyAcc.id, signupBonusPoints, 'SIGNUP', expiresAt, order.id);
      }

      return order;
    });

    this.eventsGateway.emitToRestaurant(
      finalOrder.restaurantId,
      'newOrder',
      finalOrder,
    );

    if (finalOrder.tableSessionId && resolvedTableCuid) {
      this.eventsGateway.emitTableStatusChanged(
        finalOrder.restaurantId,
        resolvedTableCuid,
        finalOrder.tableSessionId,
      );
    }

    // Order-scoped token so the customer can track THIS order over the socket
    // without access to the restaurant's live event feed (see EventsGateway).
    const orderTrackToken = this.eventsGateway.signOrderToken(finalOrder.id);

    return { ...finalOrder, sessionToken, orderTrackToken };
  }

  /**
   * Resolve the POS staff attribution for an order. Returns the user id only
   * when the authenticated caller is the restaurant owner or an assigned staff
   * member of that restaurant; otherwise null (treated as a customer order).
   */
  private async resolvePosStaff(
    staffUserId: string | null,
    restaurantOwnerId: string,
    restaurantId: string,
  ): Promise<string | null> {
    if (!staffUserId) return null;
    if (staffUserId === restaurantOwnerId) return staffUserId;
    const user = await this.prisma.user.findUnique({
      where: { id: staffUserId },
      select: { restaurantId: true, role: true },
    });
    if (
      user?.restaurantId === restaurantId &&
      user.role &&
      POS_STAFF_ROLES.has(user.role.toUpperCase())
    ) {
      return staffUserId;
    }
    return null;
  }

  async findAll(userId: string, query: OrderQueryDto) {
    const page = Number.isFinite(query.page) ? (query.page ?? 1) : 1;
    const limit = Number.isFinite(query.limit) ? (query.limit ?? 50) : 50;
    const skip = (page - 1) * limit;

    // Allow both owner and staff to see orders
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { restaurantId: true },
    });

    const baseWhere = user?.restaurantId
      ? { restaurantId: user.restaurantId }
      : { restaurant: { ownerId: userId } };

    const createdAt: { gte?: Date; lte?: Date } = {};
    if (query.startDate) createdAt.gte = new Date(query.startDate);
    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setHours(23, 59, 59, 999);
      createdAt.lte = end;
    }

    const where = {
      ...baseWhere,
      ...(query.statuses?.length ? { status: { in: query.statuses } } : {}),
      ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          items: { include: { menuItem: true } },
          staff: { select: { id: true, name: true, email: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        restaurant: true,
        items: { include: { menuItem: true } },
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { restaurantId: true },
    });

    const hasRestaurantAccess =
      order.restaurant.ownerId === userId ||
      user?.restaurantId === order.restaurantId;

    if (!hasRestaurantAccess) {
      throw new ForbiddenException('Forbidden access');
    }

    return order;
  }

  async updateStatus(id: string, updateOrderDto: UpdateOrderDto, userId: string) {
    await this.findOne(id, userId);

    const updatedOrder = await this.prisma.order.update({
      where: { id },
      data: { status: updateOrderDto.status },
    });

    this.eventsGateway.emitToOrder(id, 'orderStatusChanged', updatedOrder);
    this.eventsGateway.emitToRestaurant(
      updatedOrder.restaurantId,
      'orderStatusChanged',
      updatedOrder,
    );

    if (updatedOrder.tableSessionId && updatedOrder.tableId) {
      this.eventsGateway.emitTableStatusChanged(
        updatedOrder.restaurantId,
        updatedOrder.tableId,
        updatedOrder.tableSessionId,
      );
    }

    return updatedOrder;
  }
}
