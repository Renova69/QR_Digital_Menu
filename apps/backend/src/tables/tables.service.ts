import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';

const PAID_SESSION_AUTO_CLOSE_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class TablesService {
  private readonly logger = new Logger(TablesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
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
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }
    await this.assertOwnerOrManager(restaurant.ownerId, restaurantId, userId);

    const existingTable = await this.prisma.restaurantTable.findFirst({
      where: {
        restaurantId,
        name: { equals: normalizedName, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (existingTable) {
      throw new ConflictException(`Table "${normalizedName}" already exists`);
    }

    let zoneId = createTableDto.zoneId ?? null;
    if (!zoneId) {
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
    await this.assertOwnerOrManager(
      table.restaurant.ownerId,
      table.restaurantId,
      userId,
    );

    if (dto.zoneId !== undefined) {
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

    const updated = await this.prisma.restaurantTable.update({
      where: { id },
      data: dto,
    });
    this.events.emitToRestaurant(table.restaurantId, 'table:updated', {
      tableId: id,
    });
    if (dto.zoneId !== undefined) {
      this.events.emitZoneChanged(table.restaurantId);
    }
    return updated;
  }

  async findAll(restaurantId: string) {
    return this.prisma.restaurantTable.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
      include: { zone: { select: { id: true, name: true, zoneKey: true } } },
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

  private async verifyRestaurantAccess(
    restaurantId: string,
    user: any,
  ): Promise<void> {
    if (!user) throw new ForbiddenException('Access denied');
    // Staff/Manager: restaurantId is embedded in JWT payload by jwt.strategy
    if (user.restaurantId === restaurantId) return;
    if (user.role?.toUpperCase() === 'SUPER_ADMIN') return;
    // Owner: verify via DB
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { ownerId: true },
    });
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    if (restaurant.ownerId !== user.id)
      throw new ForbiddenException('Access denied');
  }

  async getTablesWithStatus(restaurantId: string, zoneId?: string, user?: any) {
    await this.verifyRestaurantAccess(restaurantId, user);
    const tableWhere: any = { restaurantId };
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

    // OPEN wins over PAID when both exist (new customer sat at paid table)
    const sessionByTableId = new Map(
      sessions
        .sort((a, b) => (a.status === 'OPEN' ? 1 : -1))
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
        totalPrice:
          ((oi.menuItem?.price ?? 0) +
            (Array.isArray(oi.selectedOptions)
              ? (oi.selectedOptions as any[]).reduce(
                  (sum: number, option: any) =>
                    sum + Number(option?.priceModifier ?? 0),
                  0,
                )
              : 0)) *
          oi.quantity,
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
    await this.assertOwnerOrManager(
      table.restaurant.ownerId,
      table.restaurantId,
      userId,
    );
    const deleted = await this.prisma.restaurantTable.delete({
      where: { id },
    });
    this.events.emitToRestaurant(deleted.restaurantId, 'table:deleted', {
      tableId: id,
    });
    this.events.emitZoneChanged(deleted.restaurantId);
    return deleted;
  }
}
