import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { Prisma, LoyaltyPointTransactionType, OrderStatus } from '@prisma/client';
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
import { PrintStationService } from '../print-station/print-station.service';

/** Roles that may be attributed as POS staff on an order (#4). */
const POS_STAFF_ROLES = new Set([
  'OWNER',
  'MANAGER',
  'WAITER',
  'KITCHEN',
  'STAFF',
]);

const LOYALTY_CONFIG = {
  MAX_SIGNUP_BONUS: 75, // hard cap on signup bonus (= €0.50)
  MAX_ORDER_DISCOUNT: 0.15, // max 15% of order total redeemable
} as const;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsGateway: EventsGateway,
    private readonly featureService: FeatureService,
    private readonly printStationService: PrintStationService,
  ) {}

  async create(
    createOrderDto: CreateOrderDto,
    authenticatedUserId: string | null = null,
  ) {
    // `createOrderDto.source` is the caller's INTENT only — used here to require
    // an authenticated staff identity for POS orders. The source actually
    // recorded on the Order is DERIVED from resolvePosStaff below (#L3); never
    // trust the client to label an order as staff-created.
    if (createOrderDto.source === 'POS' && !authenticatedUserId) {
      throw new UnauthorizedException('Session expired. Please log in again.');
    }

    if (!createOrderDto.items || createOrderDto.items.length === 0) {
      throw new BadRequestException('Order must contain at least one item');
    }

    // 1. Fetch all menu items at once (no N+1). Deduplicate IDs —
    //    same item added twice (e.g. qty 1 + qty 1) sends duplicate menuItemIds.
    const menuItemIds = [
      ...new Set(createOrderDto.items.map((i) => i.menuItemId)),
    ];

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

    if (
      !this.featureService.restaurantHasFeature(
        restaurant,
        FeatureFlag.ORDERS_RECEIVE,
      )
    ) {
      throw new ForbiddenException({
        code: 'FEATURE_LOCKED',
        message: 'Online ordering is not available on this plan',
      });
    }

    // Attribute the order to POS staff ONLY when the authenticated caller is a
    // staff member of THIS restaurant (or its owner). Otherwise — a logged-in
    // customer, or an owner browsing another restaurant — the order is a normal
    // customer order, not POS (#4). Prevents misclassifying customers as staff.
    const resolvedStaffUserId = await this.resolvePosStaff(
      authenticatedUserId,
      restaurant.ownerId,
      restaurantId,
    );
    if (createOrderDto.source === 'POS' && !resolvedStaffUserId) {
      throw new UnauthorizedException(
        'Only active staff assigned to this restaurant can create POS orders.',
      );
    }

    const authenticatedCustomerId = await this.resolveCustomerUserId(
      authenticatedUserId,
      resolvedStaffUserId,
    );

    // Non-staff orders: reject if caller tries to claim a different customer ID.
    // POS staff orders: allow passing a customerId to associate with a loyalty customer.
    if (
      !resolvedStaffUserId &&
      createOrderDto.customerId &&
      createOrderDto.customerId !== authenticatedCustomerId
    ) {
      throw new UnauthorizedException(
        'Customer identity is derived from the authenticated session.',
      );
    }

    const effectiveCustomerId =
      resolvedStaffUserId && createOrderDto.customerId
        ? await this.resolveStaffAssertedCustomerId(createOrderDto.customerId)
        : resolvedStaffUserId
          ? null
          : authenticatedCustomerId;

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
      if (!table)
        throw new NotFoundException('Table not found for this restaurant');

      const tableCuid = table.id;
      resolvedTableCuid = tableCuid;

      const newSession = await this.getOrCreateOpenSession(
        tableCuid,
        restaurantId,
      );
      tableSessionId = newSession.id;
      sessionToken = newSession.token;
    }

    // #2: refuse to grow a session's bill while a payment is in flight. If a
    // PENDING payment exists, the customer is mid-checkout against a fixed total;
    // letting them add a pricey item now and then pay the stale low intent would
    // mark the larger session PAID for a fraction (underpay). They must complete
    // or cancel checkout first (cancelling abandons + voids the intent).
    if (tableSessionId) {
      const pendingPayment = await this.prisma.payment.findFirst({
        where: { tableSessionId, status: 'PENDING' },
        select: { id: true },
      });
      if (pendingPayment) {
        throw new ConflictException(
          'A payment is in progress for this table. Complete or cancel it before ordering more.',
        );
      }
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
    const itemsData: {
      menuItemId: string;
      quantity: number;
      selectedOptions: any[];
      notes?: string;
    }[] = [];

    // Redemption matching strategy:
    // Preferred path — redeemCartIds: exact match by the stable frontend cart
    //   line id. Deterministic even when the same product appears twice with
    //   different options; the backend comps exactly the line the user chose.
    // Fallback path — redeemItemIds (legacy / old clients): count-based
    //   consumption. Prevents unlimited comping but cannot guarantee the right
    //   options line is comped when duplicates exist.
    const redeemCartIdSet = createOrderDto.redeemCartIds
      ? new Set(createOrderDto.redeemCartIds)
      : null;

    // Fallback: count how many redemptions each menuItemId is granted.
    const redeemCounts = new Map<string, number>();
    if (!redeemCartIdSet) {
      for (const id of createOrderDto.redeemItemIds ?? []) {
        redeemCounts.set(id, (redeemCounts.get(id) ?? 0) + 1);
      }
    }
    // Issue 34: Pre-compute cheapest-item comp set for legacy redeemItemIds fallback.
    // Prevents a client from passing a cheap item ID and getting an expensive item comped.
    const compedItemIndices = new Set<number>();
    if (!redeemCartIdSet && redeemCounts.size > 0) {
      const candidatesByMenuId = new Map<
        string,
        Array<{ index: number; price: number }>
      >();
      createOrderDto.items.forEach((ci, idx) => {
        const dbItem = itemsMap.get(ci.menuItemId);
        if (!dbItem?.rewardPointsPrice) return;
        if (!(redeemCounts.get(ci.menuItemId) ?? 0)) return;
        const list = candidatesByMenuId.get(ci.menuItemId) ?? [];
        list.push({ index: idx, price: dbItem.price });
        candidatesByMenuId.set(ci.menuItemId, list);
      });
      for (const [menuItemId, entries] of candidatesByMenuId) {
        const allowed = redeemCounts.get(menuItemId) ?? 0;
        entries.sort((a, b) => a.price - b.price);
        for (let ci = 0; ci < Math.min(allowed, entries.length); ci++) {
          compedItemIndices.add(entries[ci].index);
        }
      }
    }

    for (let itemIdx = 0; itemIdx < createOrderDto.items.length; itemIdx++) {
      const item = createOrderDto.items[itemIdx];
      const dbItem = itemsMap.get(item.menuItemId);
      if (!dbItem) {
        throw new BadRequestException(
          `Menu item not found: ${item.menuItemId}`,
        );
      }
      let itemPrice = dbItem.price;

      let isRedeemedFree: boolean;
      if (redeemCartIdSet) {
        // Exact cartId match — always correct regardless of duplicate menuItemIds.
        isRedeemedFree = !!(
          item.cartId &&
          redeemCartIdSet.has(item.cartId) &&
          dbItem.rewardPointsPrice
        );
      } else {
        // Issue 34: Legacy fallback uses pre-computed cheapest-item set.
        isRedeemedFree = compedItemIndices.has(itemIdx) && !!dbItem.rewardPointsPrice;
      }

      if (isRedeemedFree) {
        itemsPointsRedeemed += (dbItem.rewardPointsPrice ?? 0) * item.quantity;
        itemPrice = 0;
      }

      // Options on redeemed items are also free (item is fully comped)
      let optionsTotal = 0;

      const itemOptions = optionsMap.get(item.menuItemId) || [];
      const selectedOptions = item.selectedOptions ?? [];
      const selectionCountByOption = new Map<string, number>();
      // Server-authoritative option snapshot persisted with the order. The
      // client's submitted priceModifier is never stored — a tampered payload
      // (e.g. priceModifier: -10) would otherwise drive fake line totals on the
      // staff bill and printed receipt even though checkout charged correctly,
      // because tables.service derives item totals from this stored JSON (#24).
      const normalizedSelectedOptions: {
        optionId: string;
        optionName: string;
        choiceName: string;
        priceModifier: number;
      }[] = [];

      if (selectedOptions.length) {
        // Issue 2: track (optionId, choiceName) pairs to reject duplicates in same item
        const seenChoicesForItem = new Set<string>();

        for (const selected of selectedOptions) {
          const option = itemOptions.find(
            (o: { id: string }) => o.id === selected.optionId,
          );
          if (!option) {
            throw new BadRequestException({
              message: 'Invalid option selected',
              optionId: selected.optionId,
            });
          }

          const choices = Array.isArray(option.choices)
            ? (option.choices as {
                name: string;
                priceModifier: number;
              }[])
            : [];
          const choice = choices.find(
            (c: { name: string }) => c.name === selected.choiceName,
          );
          if (!choice) {
            throw new BadRequestException({
              message: 'Invalid choice selected',
              optionId: selected.optionId,
              choiceName: selected.choiceName,
            });
          }

          // Issue 2: reject duplicate (optionId, choiceName) pairs
          const choiceKey = `${selected.optionId}::${selected.choiceName}`;
          if (seenChoicesForItem.has(choiceKey)) {
            throw new BadRequestException('Duplicate choice selection');
          }
          seenChoicesForItem.add(choiceKey);
          selectionCountByOption.set(
            selected.optionId,
            (selectionCountByOption.get(selected.optionId) ?? 0) + 1,
          );

          normalizedSelectedOptions.push({
            optionId: option.id,
            optionName: option.name,
            choiceName: choice.name,
            priceModifier: choice.priceModifier || 0,
          });

          if (!isRedeemedFree) {
            optionsTotal += choice.priceModifier || 0;
          }
        }
      }

      // Issue 2: VARIATION options are required single-select options.
      for (const option of itemOptions) {
        const choices = Array.isArray(option.choices) ? option.choices : [];
        if (option.type !== 'VARIATION' || choices.length === 0) continue;

        const count = selectionCountByOption.get(option.id) ?? 0;
        if (count === 0) {
          throw new BadRequestException(
            `Option "${option.name}" requires one choice`,
          );
        }
        if (count > 1) {
          throw new BadRequestException(
            `Option "${option.name}" allows at most one choice`,
          );
        }
      }

      computedTotal += (itemPrice + optionsTotal) * item.quantity;

      itemsData.push({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        selectedOptions: normalizedSelectedOptions,
        notes: item.notes?.trim() || undefined,
      });
    }

    if (computedTotal < 0) {
      throw new BadRequestException('Invalid total calculation');
    }

    // 7. Main transaction — loyalty + order creation are atomic
    const finalOrder = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        let finalTotal = Math.round(computedTotal * 100) / 100; // #3: cents-precise money, not raw float
        let pointsEarned = 0;
        let pointsRedeemedForDiscount = 0;
        const pointsRedeemedForItems = itemsPointsRedeemed;
        let loyaltyAcc = null;
        let totalPointsRedeemed = 0;
        let purchasePointsEarned = 0;
        let signupBonusPoints = 0;

        if (
          effectiveCustomerId &&
          isLoyaltyAvailable(restaurant, this.featureService)
        ) {
          const earnRate = restaurant.loyaltyExchangeRate || 10;
          const redeemRate = restaurant.loyaltyRedeemRate || 150;

          loyaltyAcc = await tx.loyaltyAccount.findUnique({
            where: {
              userId_restaurantId: {
                userId: effectiveCustomerId,
                restaurantId,
              },
            },
          });

          if (!loyaltyAcc) {
            loyaltyAcc = await tx.loyaltyAccount.create({
              data: {
                userId: effectiveCustomerId,
                restaurantId,
                points: 0,
                lifetimePoints: 0,
              },
            });
          }

          // Issue 15: Lock the row before reading balance to prevent double-spend
          // when two concurrent orders for the same customer both try to redeem.
          await tx.$queryRaw`SELECT id FROM "loyalty_account" WHERE id = ${loyaltyAcc.id} FOR UPDATE`;

          await expireAccountPoints(tx, loyaltyAcc.id);
          loyaltyAcc = await tx.loyaltyAccount.findUniqueOrThrow({
            where: { id: loyaltyAcc.id },
          });

          // Cash discount redemption is server-authoritative: the client only
          // sends intent, while DB prices and the DB loyalty balance decide the cap.
          if (createOrderDto.usePoints) {
            const remainingPoints = Math.max(
              loyaltyAcc.points - pointsRedeemedForItems,
              0,
            );
            const maxDiscount = finalTotal * LOYALTY_CONFIG.MAX_ORDER_DISCOUNT;
            const maxDiscountPoints = Math.floor(maxDiscount * redeemRate);
            const pointsToRedeem = Math.min(remainingPoints, maxDiscountPoints);

            if (pointsToRedeem > 0) {
              const finalDiscount = pointsToRedeem / redeemRate;
              if (finalDiscount > finalTotal) {
                throw new BadRequestException(
                  'Cannot redeem more points than total',
                );
              }

              finalTotal = Math.round((finalTotal - finalDiscount) * 100) / 100; // #3
              pointsRedeemedForDiscount = pointsToRedeem;
            }
          }

          totalPointsRedeemed =
            pointsRedeemedForDiscount + pointsRedeemedForItems;

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
        } else if (pointsRedeemedForItems > 0 || createOrderDto.usePoints) {
          throw new BadRequestException('Loyalty program is not available');
        }

        const order = await tx.order.create({
          data: {
            customerName: createOrderDto.customerName,
            customerPhone: createOrderDto.customerPhone,
            customerId: effectiveCustomerId,
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
            source:
              createOrderDto.source === 'POS' && resolvedStaffUserId
                ? 'POS'
                : 'CUSTOMER',
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

          await redeemAccountPoints(
            tx,
            loyaltyAcc.id,
            totalPointsRedeemed,
            order.id,
          );
          await addEarnedPointBatch(
            tx,
            loyaltyAcc.id,
            purchasePointsEarned,
            'EARN',
            expiresAt,
            order.id,
          );
          await addEarnedPointBatch(
            tx,
            loyaltyAcc.id,
            signupBonusPoints,
            'SIGNUP',
            expiresAt,
            order.id,
          );
        }

        return order;
      },
    );

    this.eventsGateway.emitOrderEventToRestaurant(
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

    void this.printStationService.routeOrderToPrinters(finalOrder.id).catch(
      (err: Error) => this.logger.error(`Print routing failed for order ${finalOrder.id}: ${err.message}`),
    );

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
    const user = await this.prisma.user.findUnique({
      where: { id: staffUserId },
      select: {
        restaurantId: true,
        role: true,
        isActive: true,
        disabledAt: true,
      },
    });
    if (!user || user.isActive === false || user.disabledAt) return null;
    if (staffUserId === restaurantOwnerId && user.role === 'OWNER') {
      return staffUserId;
    }
    if (
      user.restaurantId === restaurantId &&
      user.role &&
      POS_STAFF_ROLES.has(user.role.toUpperCase())
    ) {
      return staffUserId;
    }
    return null;
  }

  private async resolveCustomerUserId(
    authenticatedUserId: string | null,
    resolvedStaffUserId: string | null,
  ): Promise<string | null> {
    if (!authenticatedUserId || resolvedStaffUserId) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: authenticatedUserId },
      select: { id: true, isActive: true, disabledAt: true },
    });
    if (!user || user.isActive === false || user.disabledAt) {
      throw new UnauthorizedException('ACCOUNT_DISABLED');
    }
    return user.id;
  }

  private async resolveStaffAssertedCustomerId(
    customerId: string,
  ): Promise<string> {
    const customer = await this.prisma.user.findUnique({
      where: { id: customerId },
      select: { id: true, role: true, isActive: true, disabledAt: true },
    });
    if (!customer) {
      throw new BadRequestException('Customer not found');
    }
    if (customer.role !== 'CUSTOMER') {
      throw new BadRequestException('Provided customerId does not refer to a customer account');
    }
    if (customer.isActive === false || customer.disabledAt) {
      throw new BadRequestException('Customer account is disabled');
    }
    return customer.id;
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

  /**
   * Idempotent find-or-create for an OPEN table session on the order path.
   * Mirrors the same pattern used by PaymentService.getOrCreateSession.
   *
   * When two concurrent first-orders arrive for the same empty table
   * simultaneously, the DB partial unique index
   * `table_session_one_open_per_table_restaurant_idx` allows only one INSERT
   * to succeed. The loser gets a P2002; rather than surfacing a 500, we
   * re-read the winner's session and attach the order to it (#F1).
   */
  private async getOrCreateOpenSession(
    tableCuid: string,
    restaurantId: string,
  ): Promise<{ id: string; token: string }> {
    try {
      return await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          const existing = await tx.tableSession.findFirst({
            where: { tableId: tableCuid, restaurantId, status: 'OPEN' },
            select: { id: true, token: true },
          });
          if (existing) return existing;
          return tx.tableSession.create({
            data: { tableId: tableCuid, restaurantId },
            select: { id: true, token: true },
          });
        },
      );
    } catch (e) {
      if (!this.isUniqueConstraintError(e)) throw e;
      // Concurrent request already created the OPEN session — re-read it.
      const raced = await this.prisma.tableSession.findFirst({
        where: { tableId: tableCuid, restaurantId, status: 'OPEN' },
        select: { id: true, token: true },
      });
      if (!raced)
        throw new ConflictException(
          'Session could not be established; please retry.',
        );
      return raced;
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return !!(
      error &&
      typeof error === 'object' &&
      (error as { code?: string }).code === 'P2002'
    );
  }

  async updateStatus(
    id: string,
    updateOrderDto: UpdateOrderDto,
    userId: string,
  ) {
    const order = await this.findOne(id, userId);

    // #12: cancelling an order must claw back the loyalty points it earned and
    // refund the points it consumed — otherwise a customer farms points by
    // ordering and cancelling on repeat. Reversal runs in the same transaction
    // as the status flip so the two can't diverge.
    const isCanceling =
      updateOrderDto.status === OrderStatus.CANCELED &&
      order.status !== OrderStatus.CANCELED;

    const updatedOrder = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const updated = await tx.order.update({
          where: { id },
          data: { status: updateOrderDto.status },
        });
        if (isCanceling && order.customerId) {
          await this.reverseLoyaltyForCanceledOrder(tx, order);
        }
        return updated;
      },
    );

    this.eventsGateway.emitToOrder(id, 'orderStatusChanged', updatedOrder);
    this.eventsGateway.emitOrderEventToRestaurant(
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

  /**
   * Reverse the loyalty effects of a cancelled order (#12): zero out the EARN /
   * SIGNUP batches this order created, refund the points it redeemed as a fresh
   * spendable batch, and reconcile the account. Balances are clamped at 0 — if
   * the earned points were already spent we don't drive the account negative,
   * which is safer for ledger integrity than tracking debt (the audit's own
   * recommendation). Ledger stays consistent: account.points == sum of
   * remaining batch points after the adjustment.
   */
  private async reverseLoyaltyForCanceledOrder(
    tx: Prisma.TransactionClient,
    order: {
      id: string;
      customerId: string | null;
      restaurantId: string;
      pointsEarned: number;
      pointsRedeemedForDiscount: number;
      pointsRedeemedForItems: number;
      restaurant?: { loyaltyPointExpiryDays?: number | null } | null;
    },
  ): Promise<void> {
    if (!order.customerId) return;

    const account = await tx.loyaltyAccount.findUnique({
      where: {
        userId_restaurantId: {
          userId: order.customerId,
          restaurantId: order.restaurantId,
        },
      },
    });
    if (!account) return;

    // Claw back this order's earned points — only what's still unspent.
    const earnedBatches = await tx.loyaltyPointLedger.findMany({
      where: {
        loyaltyAccountId: account.id,
        orderId: order.id,
        type: {
          in: [
            LoyaltyPointTransactionType.EARN,
            LoyaltyPointTransactionType.SIGNUP,
          ],
        },
      },
    });
    const clawback = earnedBatches.reduce(
      (sum, b) => sum + b.remainingPoints,
      0,
    );
    const originalEarned = earnedBatches.reduce((sum, b) => sum + b.points, 0);

    if (earnedBatches.length > 0) {
      await tx.loyaltyPointLedger.updateMany({
        where: { id: { in: earnedBatches.map((b) => b.id) } },
        data: { remainingPoints: 0 },
      });
      if (clawback > 0) {
        await tx.loyaltyPointLedger.create({
          data: {
            loyaltyAccountId: account.id,
            orderId: order.id,
            type: LoyaltyPointTransactionType.ADJUSTMENT,
            points: -clawback,
            remainingPoints: 0,
          },
        });
      }
    }

    // Refund the points this order consumed as a fresh spendable batch.
    const refund =
      order.pointsRedeemedForDiscount + order.pointsRedeemedForItems;
    if (refund > 0) {
      const expiryDays = order.restaurant?.loyaltyPointExpiryDays || 90;
      await tx.loyaltyPointLedger.create({
        data: {
          loyaltyAccountId: account.id,
          orderId: order.id,
          type: LoyaltyPointTransactionType.ADJUSTMENT,
          points: refund,
          remainingPoints: refund,
          expiresAt: addDays(new Date(), expiryDays),
        },
      });
    }

    await tx.loyaltyAccount.update({
      where: { id: account.id },
      data: {
        points: Math.max(0, account.points - clawback + refund),
        lifetimePoints: Math.max(0, account.lifetimePoints - originalEarned),
      },
    });
  }
}
