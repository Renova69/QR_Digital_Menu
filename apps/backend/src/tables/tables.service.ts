import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { CreateTableDto } from './dto/create-table.dto';

@Injectable()
export class TablesService {
  private readonly logger = new Logger(TablesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
  ) {}

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
    if (restaurant.ownerId !== userId) {
      throw new ForbiddenException('You do not own this restaurant');
    }

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

    const table = await this.prisma.restaurantTable.create({
      data: {
        name: normalizedName,
        restaurantId,
      },
    });
    this.events.emitToRestaurant(restaurantId, 'table:created', { tableId: table.id });
    return table;
  }

  async bulkCreate(restaurantId: string, count: number, userId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    if (restaurant.ownerId !== userId) throw new ForbiddenException('You do not own this restaurant');

    const tables = await this.prisma.$transaction(
      Array.from({ length: count }, (_, i) =>
        this.prisma.restaurantTable.create({
          data: { name: `Table ${i + 1}`, restaurantId },
        }),
      ),
    );
    return tables;
  }

  async findAll(restaurantId: string) {
    return this.prisma.restaurantTable.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
    });
  }

  async getTablesWithStatus(restaurantId: string) {
    const [tables, sessions] = await Promise.all([
      this.prisma.restaurantTable.findMany({
        where: { restaurantId },
        orderBy: { name: 'asc' },
      }),
      this.prisma.tableSession.findMany({
        where: {
          restaurantId,
          status: { in: ['OPEN', 'PAID'] },
        },
        include: {
          orders: {
            select: { customerName: true, totalPrice: true, status: true },
          },
        },
      }),
    ]);

    const sessionByTableId = new Map(
      sessions.map((s) => [s.tableId, s]),
    );

    return tables.map((table) => {
      const session = sessionByTableId.get(table.id);
      if (!session) {
        return {
          id: table.id,
          name: table.name,
          status: 'empty' as const,
          sessionId: null,
          orderCount: 0,
          totalAmount: 0,
          customerNames: [],
          sessionStatus: null,
          updatedAt: table.updatedAt.toISOString(),
        };
      }

      const status =
        session.status === 'PAID' ? 'paid' :
        session.orders.length === 0 ? 'waiting' :
        'occupied';

      return {
        id: table.id,
        name: table.name,
        status,
        sessionId: session.id,
        orderCount: session.orders.length,
        totalAmount: session.orders.reduce((sum, o) => sum + o.totalPrice, 0),
        customerNames: [...new Set(session.orders.map((o) => o.customerName).filter(Boolean))],
        sessionStatus: session.status,
        updatedAt: session.createdAt.toISOString(),
      };
    });
  }

  async getTableOrders(tableId: string, restaurantId: string) {
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
      items: order.items.map((oi) => ({
        name: oi.menuItem?.name ?? 'Unknown item',
        quantity: oi.quantity,
        totalPrice: ((oi.menuItem?.price ?? 0) + (Array.isArray(oi.selectedOptions)
          ? (oi.selectedOptions as any[]).reduce((sum: number, option: any) => sum + Number(option?.priceModifier ?? 0), 0)
          : 0)) * oi.quantity,
        options: Array.isArray(oi.selectedOptions)
          ? (oi.selectedOptions as any[]).map((option: any) => option?.choiceName).filter(Boolean)
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
    if (table.restaurant.ownerId !== userId) {
      throw new ForbiddenException('You do not own this restaurant');
    }
    const deleted = await this.prisma.restaurantTable.delete({
      where: { id },
    });
    this.events.emitToRestaurant(deleted.restaurantId, 'table:deleted', { tableId: id });
    return deleted;
  }
}
