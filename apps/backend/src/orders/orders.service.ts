import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { EventsGateway } from '../events/events.gateway';
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

const LOYALTY_CONFIG = {
  MAX_SIGNUP_BONUS: 75,    // hard cap on signup bonus (= €0.50)
  MAX_ORDER_DISCOUNT: 0.15, // max 15% of order total redeemable
} as const;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async create(createOrderDto: CreateOrderDto) {
    if (!createOrderDto.items || createOrderDto.items.length === 0) {
      throw new BadRequestException('Order must contain at least one item');
    }

    // 1. Fetch all menu items at once (no N+1)
    const menuItemIds = createOrderDto.items.map((i) => i.menuItemId);

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

    // 5. Resolve or create TableSession for pay-at-table
    let sessionToken = createOrderDto.sessionToken;
    let tableSessionId: string | undefined;

    if (sessionToken) {
      const existingSession = await this.prisma.tableSession.findFirst({
        where: { token: sessionToken, status: 'OPEN' },
      });
      if (existingSession) {
        tableSessionId = existingSession.id;
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
      const tz = restaurant.timezone || 'UTC';
      const nowInTz = DateTime.now().setZone(tz);
      const currentMinutes = nowInTz.hour * 60 + nowInTz.minute;

      const [startH, startM] = restaurant.happyHourStartTime
        .split(':')
        .map(Number);
      const [endH, endM] = restaurant.happyHourEndTime.split(':').map(Number);

      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      // Supports overnight ranges e.g. 22:00–02:00
      const inHappyHour =
        startMinutes <= endMinutes
          ? currentMinutes >= startMinutes && currentMinutes <= endMinutes
          : currentMinutes >= startMinutes || currentMinutes <= endMinutes;

      if (inHappyHour) {
        happyHourMultiplier = restaurant.happyHourMultiplier || 1;
      }
    }

    // 6. Pre-calculate totals server-side (never trust client prices)
    let computedTotal = 0;
    let itemsPointsRedeemed = 0;
    const itemsData = [];

    for (const item of createOrderDto.items) {
      const dbItem = itemsMap.get(item.menuItemId);
      let itemPrice = dbItem.price;

      const isRedeemedFree =
        createOrderDto.redeemItemIds?.includes(item.menuItemId) &&
        dbItem.rewardPointsPrice;

      if (isRedeemedFree) {
        itemsPointsRedeemed += dbItem.rewardPointsPrice * item.quantity;
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

      if (createOrderDto.customerId && restaurant.isLoyaltyEnabled) {
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
          tableId: createOrderDto.tableId,
          specialRequests: createOrderDto.specialRequests,
          totalPrice: finalTotal,
          pointsEarned,
          pointsRedeemedForDiscount,
          pointsRedeemedForItems,
          pointsRedeemed: pointsRedeemedForDiscount + pointsRedeemedForItems,
          restaurantId,
          tableSessionId,
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

    if (finalOrder.tableSessionId) {
      this.eventsGateway.emitTableStatusChanged(
        finalOrder.restaurantId,
        finalOrder.tableId,
        finalOrder.tableSessionId,
      );
    }

    return { ...finalOrder, sessionToken };
  }

  async findAll(userId: string) {
    return this.prisma.order.findMany({
      where: { restaurant: { ownerId: userId } },
      include: {
        items: { include: { menuItem: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
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
    if (order.restaurant.ownerId !== userId) {
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

    if (updatedOrder.tableSessionId) {
      this.eventsGateway.emitTableStatusChanged(
        updatedOrder.restaurantId,
        updatedOrder.tableId,
        updatedOrder.tableSessionId,
      );
    }

    return updatedOrder;
  }
}
