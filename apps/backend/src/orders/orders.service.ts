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
import {
  Prisma,
  LoyaltyPointTransactionType,
  OrderStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { BulkUpdateOrderStatusDto } from './dto/bulk-update-order-status.dto';
import { EventsGateway } from '../events/events.gateway';
import { OrderQueryDto } from './dto/order-query.dto';
import {
  addDays,
  addEarnedPointBatch,
  ensureLoyaltyAccount,
  expireAccountPoints,
  redeemAccountPoints,
  lockLoyaltyAccountRow,
  MAX_SIGNUP_BONUS,
} from '../loyalty/loyalty-ledger.utils';
import {
  getTierInfo,
  tierConfigFromRestaurant,
} from '../loyalty/loyalty-tiers.utils';
import { FeatureService } from '../subscription/feature.service';
import { FeatureFlag } from '../subscription/feature-flag.enum';
import {
  buildRestaurantDateRange,
  buildRestaurantPresetDateRange,
} from '../common/restaurant-date-range';
import { isLoyaltyAvailable } from '../loyalty/loyalty-availability.util';
import { getEffectiveRewardPointsPrice } from '../loyalty/reward-pricing';
import { PrintStationService } from '../print-station/print-station.service';
import {
  type FulfillmentMode,
  type ServicePointPaymentMethod,
} from '../tables/service-point.constants';
import { PaymentProviderConfigService } from '../payment/payment-provider-config.service';
import { createHash } from 'crypto';

/** Roles that may be attributed as POS staff on an order (#4). */
const POS_STAFF_ROLES = new Set([
  'OWNER',
  'MANAGER',
  'WAITER',
  'KITCHEN',
  'STAFF',
]);

/** Roles permitted to cancel an order (and trigger loyalty reversal). */
const CANCEL_ORDER_ROLES = new Set(['OWNER', 'MANAGER']);

/**
 * Allowed order-status transitions. CANCELED and COMPLETED are terminal —
 * neither can transition anywhere except CANCELED can additionally be
 * reached from COMPLETED (restaurant-initiated post-completion cancel).
 * Nothing transitions OUT of CANCELED: this both prevents un-cancelling
 * (which would let a re-cancel replay loyalty reversal and double-refund
 * redeemed points) and keeps the state machine a strict DAG.
 */
const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  // PaymentCoreService owns PENDING_PAYMENT -> NEW atomically with a
  // successful provider claim. Operational users may only cancel it here.
  [OrderStatus.PENDING_PAYMENT]: [OrderStatus.CANCELED],
  [OrderStatus.NEW]: [
    OrderStatus.IN_PROGRESS,
    OrderStatus.SERVED,
    OrderStatus.COMPLETED,
    OrderStatus.CANCELED,
  ],
  [OrderStatus.IN_PROGRESS]: [
    OrderStatus.SERVED,
    OrderStatus.COMPLETED,
    OrderStatus.CANCELED,
  ],
  [OrderStatus.SERVED]: [OrderStatus.COMPLETED, OrderStatus.CANCELED],
  [OrderStatus.COMPLETED]: [OrderStatus.CANCELED],
  [OrderStatus.CANCELED]: [],
};

const BULK_ORDER_STATUS_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus>> =
  {
    [OrderStatus.NEW]: OrderStatus.IN_PROGRESS,
    [OrderStatus.IN_PROGRESS]: OrderStatus.SERVED,
    [OrderStatus.SERVED]: OrderStatus.COMPLETED,
  };

const BULK_ORDER_STATUS_SELECT = {
  id: true,
  restaurantId: true,
  status: true,
  tableId: true,
  tableSessionId: true,
  updatedAt: true,
} satisfies Prisma.OrderSelect;

const ORDER_CREATE_RESTAURANT_FIELDS = {
  id: true,
  ownerId: true,
  isActive: true,
  tier: true,
  forceTier: true,
  timezone: true,
  happyHourEnable: true,
  happyHourDays: true,
  happyHourStartTime: true,
  happyHourEndTime: true,
  happyHourMultiplier: true,
  isLoyaltyEnabled: true,
  loyaltyExchangeRate: true,
  loyaltyRedeemRate: true,
  loyaltyMaxRedemptionPercent: true,
  loyaltySignupBonus: true,
  loyaltyPointExpiryDays: true,
  loyaltySilverThreshold: true,
  loyaltyGoldThreshold: true,
  loyaltySilverMultiplier: true,
  loyaltyGoldMultiplier: true,
  paymentsEnabled: true,
  stripeOnboarded: true,
  stripeAccountId: true,
  epayEnabled: true,
  epayClientId: true,
  epayMerchantEmail: true,
  epaySecretEncrypted: true,
  boricaEnabled: true,
  boricaMode: true,
  boricaTerminalId: true,
  boricaMerchantId: true,
  boricaPrivateKeyEncrypted: true,
  boricaPublicCert: true,
  myposEnabled: true,
  myposMode: true,
  myposClientNumber: true,
  myposStoreId: true,
  myposKeyIndex: true,
  myposPrivateKeyEncrypted: true,
  myposPublicCert: true,
} satisfies Prisma.RestaurantSelect;

type LockedOrderSession = {
  id: string;
  token: string;
  tableId: string;
  isServicePoint: boolean;
  tableName: string | null;
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsGateway: EventsGateway,
    private readonly featureService: FeatureService,
    private readonly printStationService: PrintStationService,
    private readonly paymentProviderConfig: PaymentProviderConfigService,
  ) {}

  async create(
    createOrderDto: CreateOrderDto,
    authenticatedUserId: string | null = null,
    idempotencyKey: string | null = null,
  ) {
    // POS intent is accepted only with a verified restaurant staff identity;
    // every other request is persisted as customer checkout.
    if (createOrderDto.source === 'POS' && !authenticatedUserId) {
      throw new UnauthorizedException('Session expired. Please log in again.');
    }

    if (!createOrderDto.items || createOrderDto.items.length === 0) {
      throw new BadRequestException('Order must contain at least one item');
    }

    const posSubmission = createOrderDto.posSubmission;
    if (posSubmission && createOrderDto.source !== 'POS') {
      throw new BadRequestException(
        'POS submission metadata is only valid for POS orders.',
      );
    }
    if (posSubmission && createOrderDto.servicePointToken) {
      throw new BadRequestException(
        'Offline POS submission metadata is only valid for physical tables.',
      );
    }

    let posPayloadHash: string | null = null;
    let posRestaurant: any = null;
    let posStaffUserId: string | null = null;
    if (posSubmission) {
      posPayloadHash = this.hashOrderIntent(createOrderDto);
      posRestaurant = await this.prisma.restaurant.findUnique({
        where: { id: posSubmission.restaurantId },
        select: ORDER_CREATE_RESTAURANT_FIELDS,
      });
      if (!posRestaurant) {
        throw new NotFoundException('Restaurant not found');
      }

      posStaffUserId = await this.resolvePosStaff(
        authenticatedUserId,
        posRestaurant.ownerId,
        posRestaurant.id,
      );
      if (!posStaffUserId) {
        throw new UnauthorizedException(
          'Only active staff assigned to this restaurant can create POS orders.',
        );
      }

      const replay = await this.findOrderByClientId(
        posSubmission.restaurantId,
        posSubmission.clientOrderId,
      );
      if (replay) {
        return this.buildOrderCreateResponse(replay, posPayloadHash);
      }
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
      if (posSubmission) {
        const foundItemIds = new Set(dbItems.map((item) => item.id));
        throw new ConflictException({
          code: 'MENU_CHANGED',
          reason: 'ITEM_REMOVED',
          message:
            'One or more menu items were removed after this POS order was queued.',
          menuItemIds: menuItemIds.filter((id) => !foundItemIds.has(id)),
        });
      }
      throw new NotFoundException('Some menu items not found');
    }

    const itemsMap = new Map(dbItems.map((i) => [i.id, i]));

    // 2. Validate all items belong to the same restaurant
    const restaurantId = dbItems[0].category.restaurantId;

    if (posSubmission && posSubmission.restaurantId !== restaurantId) {
      throw new BadRequestException(
        'POS submission restaurant does not match the ordered items.',
      );
    }

    // Establish the tenant-scoped idempotency identity before any stateful
    // checkout work. POS supplies its durable offline clientOrderId; public
    // checkout supplies the Idempotency-Key header through the controller.
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
    const submissionKey = posSubmission?.clientOrderId ?? idempotencyKey;
    const submissionPayloadHash =
      posPayloadHash ??
      (submissionKey ? this.hashOrderIntent(createOrderDto) : null);
    if (!posSubmission && submissionKey && submissionPayloadHash) {
      const replay = await this.findOrderByClientId(
        restaurantId,
        submissionKey,
      );
      if (replay) {
        return this.buildOrderCreateResponse(replay, submissionPayloadHash);
      }
    }

    const changedItemPrices: Array<{
      menuItemId: string;
      itemName: string;
      expectedUnitPrice: number;
      currentUnitPrice: number;
    }> = [];

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
      // Item-availability enforcement: the public menu already hides
      // out-of-stock items, but a cached client tab or a direct API call can
      // still submit one — reject server-side rather than accepting an order
      // the kitchen can't fulfill.
      if (dbItem.isOutOfStock) {
        if (posSubmission) {
          throw new ConflictException({
            code: 'MENU_CHANGED',
            reason: 'ITEM_OUT_OF_STOCK',
            message: `"${dbItem.name}" became unavailable after this POS order was queued.`,
            menuItemId: dbItem.id,
            itemName: dbItem.name,
          });
        }
        throw new ConflictException(
          `"${dbItem.name}" is currently out of stock`,
        );
      }
      if (posSubmission) {
        if (item.expectedUnitPrice === undefined) {
          throw new BadRequestException({
            code: 'POS_PRICE_SNAPSHOT_REQUIRED',
            message:
              'Every queued POS item must include its expected unit price.',
            menuItemId: item.menuItemId,
          });
        }
        if (
          Math.round(item.expectedUnitPrice * 100) !==
          Math.round(dbItem.price * 100)
        ) {
          changedItemPrices.push({
            menuItemId: item.menuItemId,
            itemName: dbItem.name,
            expectedUnitPrice: item.expectedUnitPrice,
            currentUnitPrice: dbItem.price,
          });
        }
      }
    }

    if (changedItemPrices.length > 0) {
      throw new ConflictException({
        code: 'PRICE_CHANGED',
        message: 'One or more prices changed after this POS order was queued.',
        currentQuote: changedItemPrices,
      });
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
    const restaurant =
      posRestaurant ??
      (await this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: ORDER_CREATE_RESTAURANT_FIELDS,
      }));

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

    if (
      createOrderDto.servicePointToken &&
      !this.featureService.restaurantHasFeature(
        restaurant,
        FeatureFlag.SERVICE_POINTS,
      )
    ) {
      throw new ForbiddenException({
        code: 'FEATURE_LOCKED',
        requiredFeatures: [FeatureFlag.SERVICE_POINTS],
        message: 'Service-point ordering is not available on this plan',
      });
    }

    // Staff identity alone does not make a public checkout a POS order. POS
    // attribution requires both explicit POS intent and verified restaurant
    // staff; every other authenticated caller remains the order's customer.
    const resolvedStaffUserId =
      createOrderDto.source === 'POS'
        ? (posStaffUserId ??
          (await this.resolvePosStaff(
            authenticatedUserId,
            restaurant.ownerId,
            restaurantId,
          )))
        : null;
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
    let tableNameSnapshot: string | null = createOrderDto.tableId ?? null;
    let servicePointType: string | null = null;
    let servicePointLabel: string | null = null;
    let fulfillmentType: FulfillmentMode | null = null;
    let paymentPreference: ServicePointPaymentMethod | null = null;

    const servicePoint = createOrderDto.servicePointToken
      ? await this.prisma.restaurantTable.findFirst({
          where: {
            publicToken: createOrderDto.servicePointToken,
            restaurantId,
            isActive: true,
            type: { not: 'TABLE' },
          },
        })
      : null;

    if (createOrderDto.servicePointToken && !servicePoint) {
      throw new NotFoundException('Service point not found');
    }

    if (servicePoint) {
      tableNameSnapshot = servicePoint.name;
      servicePointType = servicePoint.type;
      servicePointLabel = servicePoint.name;
      fulfillmentType = this.resolveServicePointChoice<FulfillmentMode>(
        servicePoint.fulfillmentModes as FulfillmentMode[],
        createOrderDto.fulfillmentType,
        'fulfillment type',
      );
      paymentPreference =
        this.resolveServicePointChoice<ServicePointPaymentMethod>(
          servicePoint.paymentMethods as ServicePointPaymentMethod[],
          createOrderDto.paymentPreference,
          'payment preference',
        );
    }

    if (posSubmission) {
      const table = await this.prisma.restaurantTable.findFirst({
        where: {
          id: posSubmission.tableId,
          restaurantId,
          type: 'TABLE',
          isActive: true,
        },
      });
      if (!table) {
        throw new ConflictException({
          code: 'TABLE_SESSION_CHANGED',
          message: 'The selected table is no longer available.',
        });
      }

      resolvedTableCuid = table.id;
      tableNameSnapshot = table.name;
      servicePointType = 'TABLE';
      servicePointLabel = table.name;
      sessionToken = undefined;
    }

    // #M8: check the RESOLVED payment preference, not the raw DTO. A service
    // point with a single allowed method ['ONLINE'] auto-selects ONLINE when
    // the client omits the field, which the earlier raw-DTO check missed.
    // Availability is verified against an ACTUALLY configured provider
    // (Stripe onboarded / ePay / BORICA / myPOS creds), not just the
    // paymentsEnabled toggle — a plan/provider gap must reject an ONLINE order.
    const effectivePaymentPreference = servicePoint
      ? paymentPreference
      : (createOrderDto.paymentPreference ?? null);
    const onlinePaymentsAvailable =
      this.paymentProviderConfig.hasAnyConfiguredProvider(restaurant);
    if (effectivePaymentPreference === 'ONLINE' && !onlinePaymentsAvailable) {
      throw new BadRequestException(
        'Online payment is not available for this restaurant.',
      );
    }

    if (!posSubmission && sessionToken) {
      const existingSession = await this.prisma.tableSession.findFirst({
        where: {
          token: sessionToken,
          status: 'OPEN',
          restaurantId,
          isServicePoint: !!servicePoint,
        },
        include: { table: { select: { name: true } } },
      });
      if (
        existingSession &&
        (!servicePoint || existingSession.tableId === servicePoint.id)
      ) {
        tableSessionId = existingSession.id;
        resolvedTableCuid = existingSession.tableId;
        // Re-derive the display name from the session's real table rather than
        // trusting the client-sent tableId string (#M7). A 2nd+ order on an
        // already-open session otherwise persists whatever tableName the client
        // sent — spoofable, and stale if the table was renamed mid-session —
        // onto the kitchen ticket. Service points already set the name above.
        if (!servicePoint && existingSession.table?.name) {
          tableNameSnapshot = existingSession.table.name;
          servicePointLabel = existingSession.table.name;
        }
      } else {
        sessionToken = undefined;
      }
    }

    if (!posSubmission && !tableSessionId && servicePoint) {
      resolvedTableCuid = servicePoint.id;
    } else if (!posSubmission && !tableSessionId && createOrderDto.tableId) {
      // Frontend sends table name (e.g. "1"), not cuid — resolve to real id
      const table = await this.prisma.restaurantTable.findFirst({
        where: {
          name: createOrderDto.tableId,
          restaurantId,
          type: 'TABLE',
          isActive: true,
        },
      });
      if (!table)
        throw new NotFoundException('Table not found for this restaurant');

      const tableCuid = table.id;
      resolvedTableCuid = tableCuid;
      tableNameSnapshot = table.name;
      servicePointType = 'TABLE';
      servicePointLabel = table.name;
    }

    if (!resolvedTableCuid) {
      throw new BadRequestException(
        'A table or service point is required to place an order.',
      );
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
      itemName: string;
      categoryIdSnapshot: string;
      categoryName: string;
      categoryTranslations?: Prisma.InputJsonValue;
      quantity: number;
      unitPrice: number;
      unitPriceWithOptions: number;
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
        if (!dbItem) return;
        const rewardPointsPrice = getEffectiveRewardPointsPrice(
          dbItem,
          restaurant.loyaltyRedeemRate || 150,
        );
        if (!rewardPointsPrice) return;
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
      const rewardPointsPrice = getEffectiveRewardPointsPrice(
        dbItem,
        restaurant.loyaltyRedeemRate || 150,
      );

      let isRedeemedFree: boolean;
      if (redeemCartIdSet) {
        // Exact cartId match — always correct regardless of duplicate menuItemIds.
        isRedeemedFree = !!(
          item.cartId &&
          redeemCartIdSet.has(item.cartId) &&
          rewardPointsPrice
        );
      } else {
        // Issue 34: Legacy fallback uses pre-computed cheapest-item set.
        isRedeemedFree = compedItemIndices.has(itemIdx) && !!rewardPointsPrice;
      }

      if (isRedeemedFree) {
        itemsPointsRedeemed += (rewardPointsPrice ?? 0) * item.quantity;
        itemPrice = 0;
      }

      // A reward covers the base menu item; paid modifiers remain chargeable.
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
            if (posSubmission) {
              throw new ConflictException({
                code: 'MENU_CHANGED',
                reason: 'OPTION_REMOVED',
                message:
                  'A menu option was removed after this POS order was queued.',
                menuItemId: item.menuItemId,
                optionId: selected.optionId,
              });
            }
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
            if (posSubmission) {
              throw new ConflictException({
                code: 'MENU_CHANGED',
                reason: 'CHOICE_REMOVED',
                message:
                  'An option choice was removed after this POS order was queued.',
                menuItemId: item.menuItemId,
                optionId: selected.optionId,
                choiceName: selected.choiceName,
              });
            }
            throw new BadRequestException({
              message: 'Invalid choice selected',
              optionId: selected.optionId,
              choiceName: selected.choiceName,
            });
          }

          if (
            posSubmission &&
            Math.round(selected.priceModifier * 100) !==
              Math.round((choice.priceModifier || 0) * 100)
          ) {
            throw new ConflictException({
              code: 'PRICE_CHANGED',
              message:
                'An option price changed after this POS order was queued.',
              currentQuote: [
                {
                  menuItemId: item.menuItemId,
                  itemName: dbItem.name,
                  optionId: option.id,
                  optionName: option.name,
                  choiceName: choice.name,
                  expectedPriceModifier: selected.priceModifier,
                  currentPriceModifier: choice.priceModifier || 0,
                },
              ],
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

          optionsTotal += choice.priceModifier || 0;
        }
      }

      // Issue 2: VARIATION options are required single-select options.
      for (const option of itemOptions) {
        const choices = Array.isArray(option.choices) ? option.choices : [];
        if (option.type !== 'VARIATION' || choices.length === 0) continue;

        const count = selectionCountByOption.get(option.id) ?? 0;
        if (count === 0) {
          if (posSubmission) {
            throw new ConflictException({
              code: 'MENU_CHANGED',
              reason: 'OPTION_SELECTION_REQUIRED',
              message:
                'A required option changed after this POS order was queued.',
              menuItemId: item.menuItemId,
              optionId: option.id,
              optionName: option.name,
            });
          }
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

      const unitPrice = Math.round(itemPrice * 100) / 100;
      const unitPriceWithOptions =
        Math.round((itemPrice + optionsTotal) * 100) / 100;

      computedTotal += unitPriceWithOptions * item.quantity;

      itemsData.push({
        menuItemId: item.menuItemId,
        itemName: dbItem.name,
        categoryIdSnapshot: dbItem.category.id,
        categoryName: dbItem.category.name,
        categoryTranslations:
          dbItem.category.translations === null
            ? undefined
            : dbItem.category.translations,
        quantity: item.quantity,
        unitPrice,
        unitPriceWithOptions,
        selectedOptions: normalizedSelectedOptions,
        notes: item.notes?.trim() || undefined,
      });
    }

    if (computedTotal < 0) {
      throw new BadRequestException('Invalid total calculation');
    }

    // 7. Main transaction — loyalty + order creation are atomic
    let finalOrder: Prisma.OrderGetPayload<{ include: { items: true } }>;
    try {
      finalOrder = await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          if (posSubmission) {
            const lockedTables = await tx.$queryRaw<
              Array<{ id: string; name: string }>
            >(
              Prisma.sql`
              SELECT "id", "name"
              FROM "restaurant_table"
              WHERE "id" = ${posSubmission.tableId}
                AND "restaurantId" = ${restaurantId}
                AND "type" = 'TABLE'
                AND "isActive" = true
              FOR UPDATE
            `,
            );
            if (lockedTables.length === 0) {
              throw new ConflictException({
                code: 'TABLE_SESSION_CHANGED',
                message: 'The selected table is no longer available.',
              });
            }
            resolvedTableCuid = lockedTables[0].id;
            tableNameSnapshot = lockedTables[0].name;
            servicePointLabel = lockedTables[0].name;

            const openSession = await this.lockOpenPhysicalOrderSessionForTable(
              tx,
              restaurantId,
              posSubmission.tableId,
            );

            if (posSubmission.expectedTableSessionId === null) {
              if (openSession) {
                throw new ConflictException({
                  code: 'TABLE_SESSION_CHANGED',
                  message:
                    'This table was opened after the order was queued. Review it before attaching the order.',
                  currentTableSessionId: openSession.id,
                });
              }
              const createdSession = await tx.tableSession.create({
                data: {
                  tableId: posSubmission.tableId,
                  restaurantId,
                  isServicePoint: false,
                },
                select: { id: true, token: true },
              });
              tableSessionId = createdSession.id;
              sessionToken = createdSession.token;
            } else {
              if (
                !openSession ||
                openSession.id !== posSubmission.expectedTableSessionId
              ) {
                throw new ConflictException({
                  code: 'TABLE_SESSION_CHANGED',
                  message:
                    'The table session changed after the order was queued. Review it before syncing.',
                  expectedTableSessionId: posSubmission.expectedTableSessionId,
                  currentTableSessionId: openSession?.id ?? null,
                });
              }
              tableSessionId = openSession.id;
              sessionToken = openSession.token;
            }
          } else if (servicePoint) {
            let lockedSession: LockedOrderSession | null = null;
            if (tableSessionId) {
              lockedSession = await this.lockOpenOrderSession(
                tx,
                restaurantId,
                tableSessionId,
              );
              if (
                lockedSession.tableId !== servicePoint.id ||
                !lockedSession.isServicePoint
              ) {
                throw new ConflictException({
                  code: 'TABLE_SESSION_CHANGED',
                  message:
                    'The service-point session changed before the order could be placed. Please refresh and try again.',
                });
              }
            }

            if (!lockedSession) {
              const createdSession = await tx.tableSession.create({
                data: {
                  tableId: servicePoint.id,
                  restaurantId,
                  isServicePoint: true,
                },
                select: { id: true, token: true },
              });
              tableSessionId = createdSession.id;
              sessionToken = createdSession.token;
            } else {
              tableSessionId = lockedSession.id;
              sessionToken = lockedSession.token;
            }
            resolvedTableCuid = servicePoint.id;
          } else {
            if (!resolvedTableCuid) {
              throw new BadRequestException(
                'A table is required to place an order.',
              );
            }

            const lockedTables = await tx.$queryRaw<
              Array<{ id: string; name: string }>
            >(Prisma.sql`
              SELECT "id", "name"
              FROM "restaurant_table"
              WHERE "id" = ${resolvedTableCuid}
                AND "restaurantId" = ${restaurantId}
                AND "type" = 'TABLE'
                AND "isActive" = true
              FOR UPDATE
            `);
            if (lockedTables.length === 0) {
              throw new NotFoundException(
                'Table not found for this restaurant',
              );
            }

            let openSession: { id: string; token: string };
            if (tableSessionId) {
              const lockedSession = await this.lockOpenOrderSession(
                tx,
                restaurantId,
                tableSessionId,
              );
              if (
                lockedSession.tableId !== resolvedTableCuid ||
                lockedSession.isServicePoint
              ) {
                throw new ConflictException({
                  code: 'TABLE_SESSION_CHANGED',
                  message:
                    'The table session changed before the order could be placed. Please refresh and try again.',
                });
              }
              openSession = lockedSession;
            } else {
              openSession =
                (await this.lockOpenPhysicalOrderSessionForTable(
                  tx,
                  restaurantId,
                  resolvedTableCuid,
                )) ??
                (await tx.tableSession.create({
                  data: {
                    tableId: resolvedTableCuid,
                    restaurantId,
                    isServicePoint: false,
                  },
                  select: { id: true, token: true },
                }));
            }
            tableSessionId = openSession.id;
            sessionToken = openSession.token;
            tableNameSnapshot = lockedTables[0].name;
            servicePointLabel = lockedTables[0].name;
          }

          if (!tableSessionId) {
            throw new ConflictException({
              code: 'TABLE_SESSION_CHANGED',
              message:
                'The table session changed before the order could be placed. Please refresh and try again.',
            });
          }
          await this.assertNoPendingPaymentForOrder(
            tx,
            tableSessionId,
            !!posSubmission,
          );

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

            // M-ORDER-1: use PostgreSQL's native conflict handler. Prisma's
            // nominal upsert with an empty update can still race and throw P2002
            // inside an interactive transaction.
            loyaltyAcc = await ensureLoyaltyAccount(
              tx,
              effectiveCustomerId,
              restaurantId,
            );

            // Issue 15: Lock the row before reading balance to prevent double-spend
            // when two concurrent orders for the same customer both try to redeem.
            await lockLoyaltyAccountRow(tx, loyaltyAcc.id);

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
              const maxRedemptionPercent =
                restaurant.loyaltyMaxRedemptionPercent ?? 15;
              const maxDiscount = finalTotal * (maxRedemptionPercent / 100);
              const maxDiscountPoints = Math.floor(maxDiscount * redeemRate);
              const requestedPoints =
                createOrderDto.redeemPoints ?? Number.POSITIVE_INFINITY;
              const pointsToRedeem = Math.min(
                remainingPoints,
                maxDiscountPoints,
                requestedPoints,
              );

              if (pointsToRedeem > 0) {
                const finalDiscount = pointsToRedeem / redeemRate;
                if (finalDiscount > finalTotal) {
                  throw new BadRequestException(
                    'Cannot redeem more points than total',
                  );
                }

                finalTotal =
                  Math.round((finalTotal - finalDiscount) * 100) / 100; // #3
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
                MAX_SIGNUP_BONUS,
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
              clientOrderId: submissionKey ?? undefined,
              clientPayloadHash: submissionPayloadHash ?? undefined,
              expectedTableSessionId:
                posSubmission?.expectedTableSessionId ?? undefined,
              customerName: createOrderDto.customerName,
              customerPhone: createOrderDto.customerPhone,
              customerId: effectiveCustomerId,
              tableId: resolvedTableCuid,
              tableName: tableNameSnapshot,
              servicePointType,
              servicePointLabel,
              fulfillmentType,
              paymentPreference,
              status:
                effectivePaymentPreference === 'ONLINE' && finalTotal > 0
                  ? OrderStatus.PENDING_PAYMENT
                  : OrderStatus.NEW,
              specialRequests: createOrderDto.specialRequests,
              totalPrice: finalTotal,
              pointsEarned,
              pointsRedeemedForDiscount,
              pointsRedeemedForItems,
              pointsRedeemed:
                pointsRedeemedForDiscount + pointsRedeemedForItems,
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

          if (order.status !== OrderStatus.PENDING_PAYMENT) {
            await this.printStationService.createPrintJobsForOrder(
              order.id,
              tx,
            );
          }

          return order;
        },
      );
    } catch (error) {
      if (submissionKey && submissionPayloadHash) {
        const replay = await this.findOrderByClientId(
          restaurantId,
          submissionKey,
        );
        if (replay) {
          return this.buildOrderCreateResponse(replay, submissionPayloadHash);
        }
      }
      throw error;
    }

    const isAwaitingPayment = finalOrder.status === OrderStatus.PENDING_PAYMENT;

    try {
      this.eventsGateway.emitOrderEventToRestaurant(
        finalOrder.restaurantId,
        'newOrder',
        finalOrder,
      );

      if (finalOrder.tableSessionId && resolvedTableCuid) {
        const billUpdatedPayload = {
          tableSessionId: finalOrder.tableSessionId,
          tableId: resolvedTableCuid,
          orderId: finalOrder.id,
          sessionPaid: false,
        };
        this.eventsGateway.emitToRestaurant(
          finalOrder.restaurantId,
          'bill:updated',
          billUpdatedPayload,
        );
        this.eventsGateway.emitToTableSession(
          finalOrder.tableSessionId,
          'bill:updated',
          billUpdatedPayload,
        );
        this.eventsGateway.emitTableStatusChanged(
          finalOrder.restaurantId,
          resolvedTableCuid,
          finalOrder.tableSessionId,
        );
      }
    } catch (error) {
      this.logger.error(
        `Post-commit realtime notification failed for order ${finalOrder.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    if (!isAwaitingPayment) {
      void this.printStationService
        .routeOrderToPrinters(finalOrder.id)
        .catch((err: Error) =>
          this.logger.error(
            `Print routing failed for order ${finalOrder.id}: ${err.message}`,
          ),
        );
    }

    // Order-scoped token so the customer can track THIS order over the socket
    // without access to the restaurant's live event feed (see EventsGateway).
    const orderTrackToken = this.eventsGateway.signOrderToken(finalOrder.id);

    return { ...finalOrder, sessionToken, orderTrackToken };
  }

  private hashOrderIntent(createOrderDto: CreateOrderDto): string {
    const semanticIntent = {
      customerName: createOrderDto.customerName,
      customerPhone: createOrderDto.customerPhone ?? null,
      customerId: createOrderDto.customerId ?? null,
      specialRequests: createOrderDto.specialRequests ?? null,
      usePoints: createOrderDto.usePoints ?? false,
      redeemPoints: createOrderDto.redeemPoints ?? null,
      redeemItemIds: createOrderDto.redeemItemIds ?? [],
      redeemCartIds: createOrderDto.redeemCartIds ?? [],
      tableId: createOrderDto.tableId ?? null,
      servicePointToken: createOrderDto.servicePointToken ?? null,
      fulfillmentType: createOrderDto.fulfillmentType ?? null,
      paymentPreference: createOrderDto.paymentPreference ?? null,
      sessionToken: createOrderDto.sessionToken ?? null,
      source: createOrderDto.source ?? 'CUSTOMER',
      posSubmission: createOrderDto.posSubmission,
      items: createOrderDto.items.map((item) => ({
        menuItemId: item.menuItemId,
        cartId: item.cartId ?? null,
        quantity: item.quantity,
        expectedUnitPrice:
          item.expectedUnitPrice === undefined
            ? null
            : Math.round(item.expectedUnitPrice * 100),
        notes: item.notes?.trim() || null,
        selectedOptions: (item.selectedOptions ?? []).map((option) => ({
          optionId: option.optionId,
          choiceName: option.choiceName,
          priceModifier: Math.round(option.priceModifier * 100),
        })),
      })),
    };

    return createHash('sha256')
      .update(JSON.stringify(semanticIntent))
      .digest('hex');
  }

  private findOrderByClientId(restaurantId: string, clientOrderId: string) {
    return this.prisma.order.findUnique({
      where: {
        restaurantId_clientOrderId: { restaurantId, clientOrderId },
      },
      include: {
        items: true,
        tableSession: { select: { token: true } },
      },
    });
  }

  private buildOrderCreateResponse(order: any, payloadHash: string) {
    if (order.clientPayloadHash !== payloadHash) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_MISMATCH',
        message:
          'This client order ID was already used for a different submission.',
      });
    }

    const { tableSession, ...persistedOrder } = order;
    return {
      ...persistedOrder,
      sessionToken: tableSession?.token,
      orderTrackToken: this.eventsGateway.signOrderToken(order.id),
    };
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
      throw new BadRequestException(
        'Provided customerId does not refer to a customer account',
      );
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

    let baseWhere: Prisma.OrderWhereInput;
    if (query.restaurantId) {
      if (user?.restaurantId && user.restaurantId !== query.restaurantId) {
        throw new ForbiddenException('Forbidden access');
      }
      baseWhere = user?.restaurantId
        ? { restaurantId: query.restaurantId }
        : {
            restaurantId: query.restaurantId,
            restaurant: { ownerId: userId },
          };
    } else {
      baseWhere = user?.restaurantId
        ? { restaurantId: user.restaurantId }
        : { restaurant: { ownerId: userId } };
    }

    const filterRestaurantId = query.restaurantId ?? user?.restaurantId;
    const restaurant = filterRestaurantId
      ? await this.prisma.restaurant.findUnique({
          where: { id: filterRestaurantId },
          select: { timezone: true },
        })
      : null;
    const timezone = restaurant?.timezone ?? 'UTC';
    const createdAt =
      query.startDate || query.endDate
        ? buildRestaurantDateRange(query.startDate, query.endDate, timezone)
        : query.period
          ? buildRestaurantPresetDateRange(query.period, timezone)
          : {};

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
        restaurant: {
          select: { ownerId: true, loyaltyPointExpiryDays: true },
        },
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

  private async lockOpenOrderSession(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    sessionId: string,
  ): Promise<LockedOrderSession> {
    const rows = await tx.$queryRaw<LockedOrderSession[]>(
      Prisma.sql`
        SELECT
          ts."id",
          ts."token",
          ts."tableId",
          ts."isServicePoint",
          rt."name" AS "tableName"
        FROM "table_session" ts
        LEFT JOIN "restaurant_table" rt ON rt."id" = ts."tableId"
        WHERE ts."id" = ${sessionId}
          AND ts."restaurantId" = ${restaurantId}
          AND ts."status" = 'OPEN'::"TableSessionStatus"
        FOR UPDATE OF ts
      `,
    );
    const session = rows[0];
    if (!session) {
      throw new ConflictException({
        code: 'TABLE_SESSION_CHANGED',
        message:
          'The table session changed before the order could be placed. Please refresh and try again.',
      });
    }
    return session;
  }

  private async lockOpenPhysicalOrderSessionForTable(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    tableId: string,
  ): Promise<LockedOrderSession | null> {
    const rows = await tx.$queryRaw<LockedOrderSession[]>(
      Prisma.sql`
        SELECT
          ts."id",
          ts."token",
          ts."tableId",
          ts."isServicePoint",
          rt."name" AS "tableName"
        FROM "table_session" ts
        LEFT JOIN "restaurant_table" rt ON rt."id" = ts."tableId"
        WHERE ts."tableId" = ${tableId}
          AND ts."restaurantId" = ${restaurantId}
          AND ts."status" = 'OPEN'::"TableSessionStatus"
          AND ts."isServicePoint" = false
        FOR UPDATE OF ts
      `,
    );
    return rows[0] ?? null;
  }

  private async assertNoPendingPaymentForOrder(
    tx: Prisma.TransactionClient,
    tableSessionId: string,
    posOrder: boolean,
  ): Promise<void> {
    const pendingPayment = await tx.payment.findFirst({
      where: { tableSessionId, status: 'PENDING' },
      select: { id: true },
    });
    if (!pendingPayment) return;

    if (posOrder) {
      throw new ConflictException({
        code: 'PAYMENT_IN_PROGRESS',
        message:
          'A payment is in progress for this table. Sync will retry after it finishes.',
      });
    }

    throw new ConflictException(
      'A payment is in progress for this table. Complete or cancel it before ordering more.',
    );
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
    isServicePoint = false,
  ): Promise<{ id: string; token: string }> {
    if (isServicePoint) {
      return this.prisma.tableSession.create({
        data: { tableId: tableCuid, restaurantId, isServicePoint: true },
        select: { id: true, token: true },
      });
    }

    try {
      return await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          const existing = await tx.tableSession.findFirst({
            where: {
              tableId: tableCuid,
              restaurantId,
              status: 'OPEN',
              isServicePoint: false,
            },
            select: { id: true, token: true },
          });
          if (existing) return existing;
          return tx.tableSession.create({
            data: {
              tableId: tableCuid,
              restaurantId,
              isServicePoint: false,
            },
            select: { id: true, token: true },
          });
        },
      );
    } catch (e) {
      if (!this.isUniqueConstraintError(e)) throw e;
      // Concurrent request already created the OPEN session — re-read it.
      const raced = await this.prisma.tableSession.findFirst({
        where: {
          tableId: tableCuid,
          restaurantId,
          status: 'OPEN',
          isServicePoint: false,
        },
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

  private resolveServicePointChoice<T extends string>(
    allowed: T[],
    requested: T | undefined,
    label: string,
  ): T {
    if (!allowed.length) {
      throw new BadRequestException(`No ${label} is enabled`);
    }
    if (!requested) {
      if (allowed.length === 1) return allowed[0];
      throw new BadRequestException(`Select a ${label}`);
    }
    if (!allowed.includes(requested)) {
      throw new BadRequestException(`Invalid ${label}`);
    }
    return requested;
  }

  async updateStatus(
    id: string,
    updateOrderDto: UpdateOrderDto,
    userId: string,
  ) {
    const order = await this.findOne(id, userId);

    const targetStatus = updateOrderDto.status;
    const allowed = ORDER_STATUS_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(targetStatus)) {
      throw new BadRequestException(
        `Cannot transition order from ${order.status} to ${targetStatus}.`,
      );
    }

    if (targetStatus === OrderStatus.CANCELED) {
      const actor = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      if (!actor || !CANCEL_ORDER_ROLES.has(actor.role)) {
        throw new ForbiddenException(
          'Only an owner or manager can cancel an order.',
        );
      }
    }

    // #12: cancelling an order must claw back the loyalty points it earned and
    // refund the points it consumed — otherwise a customer farms points by
    // ordering and cancelling on repeat. Reversal runs in the same transaction
    // as the status flip so the two can't diverge. The transition allowlist
    // above makes CANCELED terminal, so an order can only ever be cancelled
    // once *sequentially* — but two concurrent requests can both read
    // `order.status` as non-CANCELED before either writes, both compute
    // isCanceling=true, and (without a compare-and-swap guard) both run the
    // reversal, double-crediting the redeemed-points refund. Claim the
    // transition atomically first, same pattern as exchangeImpersonation's
    // consume-once updateMany and the Stripe refund's SUCCEEDED->REFUNDED
    // claim; only the request that wins the CAS reverses loyalty.
    const isCanceling =
      updateOrderDto.status === OrderStatus.CANCELED &&
      order.status !== OrderStatus.CANCELED;

    const updatedOrder = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const claim = await tx.order.updateMany({
          where: { id, status: order.status },
          data: { status: updateOrderDto.status },
        });
        if (claim.count !== 1) {
          throw new ConflictException(
            'Order status changed concurrently; please retry.',
          );
        }
        const updated = await tx.order.findUniqueOrThrow({ where: { id } });
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

  async bulkUpdateStatus(dto: BulkUpdateOrderStatusDto, userId: string) {
    if (BULK_ORDER_STATUS_TRANSITIONS[dto.fromStatus] !== dto.status) {
      throw new BadRequestException(
        `Cannot bulk transition orders from ${dto.fromStatus} to ${dto.status}.`,
      );
    }

    const [actor, restaurant] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { restaurantId: true },
      }),
      this.prisma.restaurant.findUnique({
        where: { id: dto.restaurantId },
        select: { id: true, ownerId: true },
      }),
    ]);
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }
    if (
      restaurant.ownerId !== userId &&
      actor?.restaurantId !== dto.restaurantId
    ) {
      throw new ForbiddenException('Forbidden access');
    }

    const existing = await this.prisma.order.findMany({
      where: {
        id: { in: dto.orderIds },
        restaurantId: dto.restaurantId,
      },
      select: BULK_ORDER_STATUS_SELECT,
    });
    if (existing.length !== dto.orderIds.length) {
      throw new NotFoundException('One or more orders were not found');
    }

    const eligibleIds = existing
      .filter((order) => order.status === dto.fromStatus)
      .map((order) => order.id);
    const changed =
      eligibleIds.length > 0
        ? await this.prisma.order.updateManyAndReturn({
            where: {
              id: { in: eligibleIds },
              restaurantId: dto.restaurantId,
              status: dto.fromStatus,
            },
            data: { status: dto.status },
            select: BULK_ORDER_STATUS_SELECT,
          })
        : [];

    // Re-read once so a concurrent status change is reported accurately instead
    // of reverting the initiating dashboard to a stale captured status.
    const authoritative = await this.prisma.order.findMany({
      where: {
        id: { in: dto.orderIds },
        restaurantId: dto.restaurantId,
      },
      select: BULK_ORDER_STATUS_SELECT,
    });
    const updated = authoritative.filter(
      (order) => order.status === dto.status,
    );
    const failed = authoritative
      .filter((order) => order.status !== dto.status)
      .map((order) => ({
        id: order.id,
        reason: 'STATUS_CHANGED' as const,
        currentStatus: order.status,
        updatedAt: order.updatedAt,
      }));

    const changedIds = new Set(changed.map((order) => order.id));
    const authoritativeChanges = authoritative.filter((order) =>
      changedIds.has(order.id),
    );

    if (authoritativeChanges.length > 0) {
      this.eventsGateway.emitOrderEventToRestaurant(
        dto.restaurantId,
        'orderStatusesChanged',
        authoritativeChanges,
      );
    }
    for (const order of authoritativeChanges) {
      this.eventsGateway.emitToOrder(order.id, 'orderStatusChanged', order);
    }

    const changedTables = new Map<
      string,
      (typeof authoritativeChanges)[number] & {
        tableId: string;
        tableSessionId: string;
      }
    >();
    for (const order of authoritativeChanges) {
      if (!order.tableId || !order.tableSessionId) continue;
      changedTables.set(`${order.tableId}:${order.tableSessionId}`, {
        ...order,
        tableId: order.tableId,
        tableSessionId: order.tableSessionId,
      });
    }
    for (const order of changedTables.values()) {
      this.eventsGateway.emitTableStatusChanged(
        dto.restaurantId,
        order.tableId,
        order.tableSessionId,
      );
    }

    return { updated, failed };
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

    // Lock the account row so this reversal serializes against any concurrent
    // earn/redeem/expiry on the same account (F-ORDER-4/M-ORDER-3) — without
    // this, a concurrent transaction could read a pre-lock balance and
    // overwrite this reversal's effect.
    await lockLoyaltyAccountRow(tx, account.id);

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

    // Single guarded update computed from the current (locked) DB row rather
    // than the possibly-stale `account` values read before the lock (F-ORDER-4).
    await tx.$executeRaw`
      UPDATE "loyalty_account"
      SET points = GREATEST(0, points - ${clawback} + ${refund}),
          "lifetimePoints" = GREATEST(0, "lifetimePoints" - ${originalEarned})
      WHERE id = ${account.id}
    `;
  }
}
