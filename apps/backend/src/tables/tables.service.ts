import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import { assertRestaurantActive } from '../restaurants/assert-restaurant-active';
import { FeatureService } from '../subscription/feature.service';
import { FeatureFlag } from '../subscription/feature-flag.enum';
import {
  DEFAULT_FULFILLMENT_MODES,
  DEFAULT_PAYMENT_METHODS,
  FULFILLMENT_MODES,
  PAYMENT_METHODS,
  SERVICE_POINT_TYPES,
  type FulfillmentMode,
  type ServicePointPaymentMethod,
  type ServicePointType,
} from './service-point.constants';
import { PaymentProviderConfigService } from '../payment/payment-provider-config.service';

const PAID_SESSION_AUTO_CLOSE_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class TablesService {
  private readonly logger = new Logger(TablesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly featureService: FeatureService,
    private readonly paymentProviderConfig: PaymentProviderConfigService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async autoClosePaidSessions() {
    const cutoff = new Date(Date.now() - PAID_SESSION_AUTO_CLOSE_MS);

    const expired = await this.prisma.tableSession.findMany({
      where: { status: 'PAID', paidAt: { lt: cutoff } },
      select: { id: true, restaurantId: true, tableId: true },
    });

    if (expired.length === 0) return;

    await this.prisma.tableSession.updateMany({
      where: { id: { in: expired.map((s) => s.id) } },
      data: { status: 'CLOSED_PAID' },
    });

    // Emit per session so dashboard receives the full { tableId, sessionId }
    // payload, consistent with every other caller of emitTableStatusChanged.
    for (const s of expired) {
      this.events.emitTableStatusChanged(s.restaurantId, s.tableId, s.id);
    }

    this.logger.log(
      `Auto-closed ${expired.length} paid session(s) across ${new Set(expired.map((s) => s.restaurantId)).size} restaurant(s)`,
    );
  }

  async create(
    restaurantId: string,
    createTableDto: CreateTableDto,
    userId: string,
  ) {
    const normalizedName = createTableDto.name.trim().replace(/\s+/g, ' ');
    const type = this.normalizeServicePointType(createTableDto.type);
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }
    assertRestaurantActive(restaurant);
    await this.assertOwnerOrManager(restaurant.ownerId, restaurantId, userId);
    if (type !== 'TABLE') {
      this.assertServicePointsEnabled(restaurant);
    }

    const existingTable = await this.prisma.restaurantTable.findFirst({
      where: {
        restaurantId,
        name: { equals: normalizedName, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (existingTable) {
      throw new ConflictException(
        `${type === 'TABLE' ? 'Table' : 'Service point'} "${normalizedName}" already exists`,
      );
    }

    let zoneId = createTableDto.zoneId ?? null;
    if (type !== 'TABLE') {
      zoneId = null;
    } else if (zoneId) {
      // Validate the client-supplied zone belongs to THIS restaurant (#M9).
      // update() already does this; create() previously trusted the id, letting
      // a table link to another tenant's zone and turning a bad/deleted id into
      // an uncaught Prisma FK (P2003) 500.
      const zone = await this.prisma.tableZone.findUnique({
        where: { id: zoneId },
      });
      if (!zone || zone.restaurantId !== restaurantId) {
        throw new NotFoundException('Zone not found');
      }
    } else {
      const defaultZone = await this.prisma.tableZone.findFirst({
        where: { restaurantId },
        orderBy: { displayOrder: 'asc' },
      });
      zoneId = defaultZone?.id ?? null;
    }

    const table = await this.prisma.restaurantTable.create({
      data: {
        name: normalizedName,
        restaurantId,
        zoneId,
        type,
        publicToken: type === 'TABLE' ? null : this.createPublicToken(),
        isActive: createTableDto.isActive ?? true,
        fulfillmentModes: this.normalizeFulfillmentModes(
          type,
          createTableDto.fulfillmentModes,
        ),
        paymentMethods: this.normalizePaymentMethods(
          type,
          createTableDto.paymentMethods,
        ),
      },
    });
    this.events.emitToRestaurant(restaurantId, 'table:created', {
      tableId: table.id,
    });
    this.events.emitZoneChanged(restaurantId);
    return table;
  }

  async bulkCreate(restaurantId: string, count: number, userId: string) {
    if (!Number.isInteger(count) || count < 1 || count > 200) {
      throw new BadRequestException('count must be between 1 and 200');
    }

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    assertRestaurantActive(restaurant);
    await this.assertOwnerOrManager(restaurant.ownerId, restaurantId, userId);

    const defaultZone = await this.prisma.tableZone.findFirst({
      where: { restaurantId },
      orderBy: { displayOrder: 'asc' },
    });

    // Find the highest existing "Table N" number to avoid unique-constraint collisions.
    const existing = await this.prisma.restaurantTable.findMany({
      where: { restaurantId, name: { startsWith: 'Table ' } },
      select: { name: true },
    });
    const maxN = existing.reduce((max, { name }) => {
      const n = parseInt(name.replace('Table ', ''), 10);
      return Number.isFinite(n) ? Math.max(max, n) : max;
    }, 0);

    const tables = await this.prisma.$transaction(
      Array.from({ length: count }, (_, i) =>
        this.prisma.restaurantTable.create({
          data: {
            name: `Table ${maxN + i + 1}`,
            restaurantId,
            zoneId: defaultZone?.id ?? null,
            type: 'TABLE',
            fulfillmentModes: DEFAULT_FULFILLMENT_MODES.TABLE,
            paymentMethods: DEFAULT_PAYMENT_METHODS.TABLE,
          },
        }),
      ),
    );
    this.events.emitToRestaurant(restaurantId, 'table:created', {
      tableIds: tables.map((t) => t.id),
    });
    this.events.emitZoneChanged(restaurantId);
    return tables;
  }

  async update(id: string, dto: UpdateTableDto, userId: string) {
    const table = await this.prisma.restaurantTable.findUnique({
      where: { id },
      include: { restaurant: true },
    });
    if (!table) throw new NotFoundException('Table not found');
    assertRestaurantActive(table.restaurant);
    await this.assertOwnerOrManager(
      table.restaurant.ownerId,
      table.restaurantId,
      userId,
    );
    if (table.type !== 'TABLE') {
      this.assertServicePointsEnabled(table.restaurant);
    }

    if (dto.zoneId !== undefined) {
      if (table.type !== 'TABLE' && dto.zoneId) {
        throw new BadRequestException('Only tables can be assigned to zones');
      }
      if (dto.zoneId !== null) {
        const zone = await this.prisma.tableZone.findUnique({
          where: { id: dto.zoneId },
        });
        if (!zone || zone.restaurantId !== table.restaurantId)
          throw new NotFoundException('Zone not found');
      }
    }

    if (dto.name && dto.name !== table.name) {
      const normalizedName = dto.name.trim().replace(/\s+/g, ' ');
      const existing = await this.prisma.restaurantTable.findFirst({
        where: {
          restaurantId: table.restaurantId,
          name: { equals: normalizedName, mode: 'insensitive' },
          id: { not: id },
        },
      });
      if (existing)
        throw new ConflictException(`Table "${normalizedName}" already exists`);
      dto.name = normalizedName;
    }

    const data = { ...dto };
    if (table.type !== 'TABLE') {
      data.zoneId = null;
    }
    if (dto.fulfillmentModes !== undefined) {
      data.fulfillmentModes = this.normalizeFulfillmentModes(
        table.type as ServicePointType,
        dto.fulfillmentModes,
      );
    }
    if (dto.paymentMethods !== undefined) {
      data.paymentMethods = this.normalizePaymentMethods(
        table.type as ServicePointType,
        dto.paymentMethods,
      );
    }

    const updated = await this.prisma.restaurantTable.update({
      where: { id },
      data,
    });
    this.events.emitToRestaurant(table.restaurantId, 'table:updated', {
      tableId: id,
    });
    if (dto.zoneId !== undefined) {
      this.events.emitZoneChanged(table.restaurantId);
    }
    return updated;
  }

  async findAll(restaurantId: string, user?: any) {
    await this.verifyRestaurantAccess(restaurantId, user);
    return this.prisma.restaurantTable.findMany({
      where: { restaurantId, type: 'TABLE' },
      orderBy: { name: 'asc' },
      include: { zone: { select: { id: true, name: true, zoneKey: true } } },
    });
  }

  async findServicePoints(restaurantId: string, user: any) {
    await this.verifyRestaurantAccess(
      restaurantId,
      user,
      FeatureFlag.SERVICE_POINTS,
    );
    return this.prisma.restaurantTable.findMany({
      where: { restaurantId, type: { not: 'TABLE' } },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      include: { zone: { select: { id: true, name: true, zoneKey: true } } },
    });
  }

  async resolvePublicServicePoint(restaurantId: string, publicToken: string) {
    const servicePoint = await this.prisma.restaurantTable.findFirst({
      where: {
        restaurantId,
        publicToken,
        isActive: true,
        type: { not: 'TABLE' },
      },
      select: {
        id: true,
        name: true,
        type: true,
        publicToken: true,
        fulfillmentModes: true,
        paymentMethods: true,
        restaurant: true,
      },
    });
    if (!servicePoint) throw new NotFoundException('Service point not found');
    if (
      servicePoint.restaurant.isActive === false ||
      servicePoint.restaurant.deletedAt
    ) {
      throw new NotFoundException('Service point not found');
    }
    if (
      !this.featureService.restaurantHasFeature(
        servicePoint.restaurant,
        FeatureFlag.SERVICE_POINTS,
      )
    ) {
      // Public callers should not be able to distinguish a revoked QR from an
      // invalid one after a restaurant downgrades.
      throw new NotFoundException('Service point not found');
    }
    const onlinePaymentsAvailable =
      this.paymentProviderConfig.hasAnyConfiguredProvider(
        servicePoint.restaurant,
      );
    const paymentMethods = onlinePaymentsAvailable
      ? servicePoint.paymentMethods
      : servicePoint.paymentMethods.filter((method) => method !== 'ONLINE');
    const { restaurant: _restaurant, ...publicServicePoint } = servicePoint;
    return { ...publicServicePoint, paymentMethods };
  }

  async rotatePublicToken(id: string, userId: string) {
    const table = await this.prisma.restaurantTable.findUnique({
      where: { id },
      include: { restaurant: true },
    });
    if (!table) throw new NotFoundException('Service point not found');
    assertRestaurantActive(table.restaurant);
    await this.assertOwnerOrManager(
      table.restaurant.ownerId,
      table.restaurantId,
      userId,
    );
    if (table.type === 'TABLE') {
      throw new BadRequestException('Table QR links use the table name');
    }
    this.assertServicePointsEnabled(table.restaurant);
    return this.prisma.restaurantTable.update({
      where: { id },
      data: { publicToken: this.createPublicToken() },
    });
  }

  /** Owner OR an assigned MANAGER may manage this restaurant's tables. Mirrors
   *  the access granted on menu, zones, payments, and dashboard (#19). */
  private async assertOwnerOrManager(
    ownerId: string,
    restaurantId: string,
    userId: string,
  ): Promise<void> {
    if (ownerId === userId) return;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, restaurantId: true },
    });
    if (user?.role === 'MANAGER' && user.restaurantId === restaurantId) return;
    throw new ForbiddenException('You do not own this restaurant');
  }

  private assertServicePointsEnabled(restaurant: {
    tier?: string | null;
    forceTier?: string | null;
  }): void {
    if (
      !this.featureService.restaurantHasFeature(
        restaurant,
        FeatureFlag.SERVICE_POINTS,
      )
    ) {
      throw new ForbiddenException({
        code: 'FEATURE_LOCKED',
        requiredFeatures: [FeatureFlag.SERVICE_POINTS],
        message: 'Service points are not available on this plan',
      });
    }
  }

  private async verifyRestaurantAccess(
    restaurantId: string,
    user: any,
    requiredFeature?: FeatureFlag,
  ): Promise<void> {
    if (!user) throw new ForbiddenException('Access denied');
    if (user.role?.toUpperCase() === 'SUPER_ADMIN') return;

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        ownerId: true,
        tier: true,
        forceTier: true,
        isActive: true,
        deletedAt: true,
      },
    });
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    assertRestaurantActive(restaurant);
    // Staff/Manager: restaurantId is embedded in JWT payload by jwt.strategy,
    // but only after the restaurant row has been checked for suspension/delete.
    const hasAccess =
      user.restaurantId === restaurantId || restaurant.ownerId === user.id;
    if (!hasAccess) throw new ForbiddenException('Access denied');
    if (requiredFeature === FeatureFlag.SERVICE_POINTS) {
      this.assertServicePointsEnabled(restaurant);
    }
  }

  async getTablesWithStatus(restaurantId: string, zoneId?: string, user?: any) {
    await this.verifyRestaurantAccess(restaurantId, user);
    const tableWhere: any = { restaurantId, type: 'TABLE' };
    if (zoneId) {
      tableWhere.zoneId = zoneId;
    }
    const [tables, sessions] = await Promise.all([
      this.prisma.restaurantTable.findMany({
        where: tableWhere,
        orderBy: { name: 'asc' },
        include: { zone: { select: { id: true, name: true, zoneKey: true } } },
      }),
      this.prisma.tableSession.findMany({
        where: {
          restaurantId,
          status: { in: ['OPEN', 'PAID'] },
          // Service-point sessions are isolated per-customer and never map to a
          // physical TABLE row (which is all this view renders). Excluding them
          // avoids loading an unbounded backlog of counter sessions (+ their
          // orders/staff joins) on every dashboard/POS poll.
          isServicePoint: false,
        },
        include: {
          orders: {
            select: {
              customerName: true,
              totalPrice: true,
              status: true,
              source: true,
              staff: { select: { name: true, email: true, role: true } },
            },
          },
        },
      }),
    ]);

    // OPEN wins over PAID when both exist (new customer sat at paid table).
    // Later Map entries overwrite earlier ones, so OPEN must sort last. Use a
    // spec-compliant comparator (both operands considered) rather than relying
    // on the engine's sort stability.
    const sessionByTableId = new Map(
      sessions
        .sort(
          (a, b) =>
            (a.status === 'OPEN' ? 1 : 0) - (b.status === 'OPEN' ? 1 : 0),
        )
        .map((s) => [s.tableId, s]),
    );

    return tables.map((table) => {
      const session = sessionByTableId.get(table.id);
      if (!session) {
        return {
          id: table.id,
          name: table.name,
          zoneId: table.zone?.id ?? null,
          zoneName: table.zone?.name ?? null,
          zoneKey: table.zone?.zoneKey ?? null,
          status: 'empty' as const,
          sessionId: null,
          sessionToken: null,
          orderCount: 0,
          totalAmount: 0,
          customerNames: [],
          sessionStatus: null,
          updatedAt: table.updatedAt.toISOString(),
        };
      }

      const status = session.status === 'PAID' ? 'paid' : 'occupied';

      return {
        id: table.id,
        name: table.name,
        zoneId: table.zone?.id ?? null,
        zoneName: table.zone?.name ?? null,
        zoneKey: table.zone?.zoneKey ?? null,
        status,
        sessionId: session.id,
        sessionToken: session.token,
        orderCount: session.orders.length,
        totalAmount: session.orders.reduce((sum, o) => sum + o.totalPrice, 0),
        customerNames: [
          ...new Set(
            session.orders
              .map((o) => {
                // POS/staff orders: show "Waiter: 444" (role + first name)
                // instead of the hardcoded "Staff" customerName.
                if (o.source === 'POS') {
                  const name = o.staff?.name ?? o.staff?.email ?? null;
                  if (!name) return 'Staff';
                  const first = String(name).split(/[ @]/)[0];
                  const role = o.staff?.role
                    ? o.staff.role.charAt(0).toUpperCase() +
                      o.staff.role.slice(1).toLowerCase()
                    : 'Staff';
                  return `${role}: ${first}`;
                }
                return o.customerName;
              })
              .filter(Boolean),
          ),
        ],
        sessionStatus: session.status,
        updatedAt: session.createdAt.toISOString(),
      };
    });
  }

  async getTableOrders(tableId: string, restaurantId: string, user?: any) {
    await this.verifyRestaurantAccess(restaurantId, user);
    const session = await this.prisma.tableSession.findFirst({
      where: { tableId, restaurantId, status: { in: ['OPEN', 'PAID'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!session) return [];

    const orders = await this.prisma.order.findMany({
      where: { tableSessionId: session.id },
      include: {
        items: {
          include: {
            menuItem: { select: { name: true, price: true } },
          },
        },
        staff: { select: { name: true, email: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return orders.map((order) => ({
      id: order.id,
      customerName: order.customerName,
      totalPrice: order.totalPrice,
      status: order.status,
      specialRequests: order.specialRequests,
      createdAt: order.createdAt,
      source: order.source,
      staffName: order.staff ? (order.staff.name ?? order.staff.email) : null,
      staffRole: order.staff?.role ?? null,
      items: order.items.map((oi: any) => ({
        name: oi.menuItem?.name ?? 'Unknown item',
        quantity: oi.quantity,
        totalPrice: Number(oi.unitPriceWithOptions ?? 0) * oi.quantity,
        options: Array.isArray(oi.selectedOptions)
          ? (oi.selectedOptions as any[])
              .map((option: any) => option?.choiceName)
              .filter(Boolean)
          : [],
      })),
    }));
  }

  async remove(id: string, userId: string) {
    const table = await this.prisma.restaurantTable.findUnique({
      where: { id },
      include: { restaurant: true },
    });
    if (!table) {
      throw new NotFoundException('Table not found');
    }
    assertRestaurantActive(table.restaurant);
    await this.assertOwnerOrManager(
      table.restaurant.ownerId,
      table.restaurantId,
      userId,
    );
    if (table.type !== 'TABLE') {
      this.assertServicePointsEnabled(table.restaurant);
    }
    const activeSession = await this.prisma.tableSession.findFirst({
      where: { tableId: id, status: { in: ['OPEN', 'PAID'] } },
    });
    if (activeSession) {
      throw new ConflictException(
        'Cannot delete a table with an active session',
      );
    }
    // Historical (closed) sessions do NOT block deletion. Payment.tableSessionId
    // and CashPaymentRequest table pointers are SetNull on delete, so removing
    // a table with only closed-out sessions preserves payment history instead
    // of blocking the removal outright.
    const deleted = await this.prisma.restaurantTable.delete({
      where: { id },
    });
    this.events.emitToRestaurant(deleted.restaurantId, 'table:deleted', {
      tableId: id,
    });
    this.events.emitZoneChanged(deleted.restaurantId);
    return deleted;
  }

  private createPublicToken() {
    return randomBytes(18).toString('base64url');
  }

  private normalizeServicePointType(type?: string): ServicePointType {
    const normalized = (type ?? 'TABLE').toUpperCase();
    if (!SERVICE_POINT_TYPES.includes(normalized as ServicePointType)) {
      throw new BadRequestException('Invalid service point type');
    }
    return normalized as ServicePointType;
  }

  private normalizeFulfillmentModes(
    type: ServicePointType,
    modes?: string[],
  ): FulfillmentMode[] {
    if (!modes || modes.length === 0) return DEFAULT_FULFILLMENT_MODES[type];
    const uniqueModes = [...new Set(modes)];
    if (
      uniqueModes.some(
        (mode) => !FULFILLMENT_MODES.includes(mode as FulfillmentMode),
      )
    ) {
      throw new BadRequestException('Invalid fulfillment mode');
    }
    return uniqueModes as FulfillmentMode[];
  }

  private normalizePaymentMethods(
    type: ServicePointType,
    methods?: string[],
  ): ServicePointPaymentMethod[] {
    if (!methods || methods.length === 0) return DEFAULT_PAYMENT_METHODS[type];
    const uniqueMethods = [...new Set(methods)];
    if (
      uniqueMethods.some(
        (method) =>
          !PAYMENT_METHODS.includes(method as ServicePointPaymentMethod),
      )
    ) {
      throw new BadRequestException('Invalid payment method');
    }
    return uniqueMethods as ServicePointPaymentMethod[];
  }
}
