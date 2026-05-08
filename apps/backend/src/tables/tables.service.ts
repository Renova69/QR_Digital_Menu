import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTableDto } from './dto/create-table.dto';

@Injectable()
export class TablesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    restaurantId: string,
    createTableDto: CreateTableDto,
    userId: string,
  ) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }
    if (restaurant.ownerId !== userId) {
      throw new ForbiddenException('You do not own this restaurant');
    }
    return this.prisma.restaurantTable.create({
      data: {
        name: createTableDto.name,
        restaurantId,
      },
    });
  }

  async findAll(restaurantId: string) {
    return this.prisma.restaurantTable.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
    });
  }

  async getTablesWithStatus(restaurantId: string) {
    const tables = await this.prisma.restaurantTable.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
    });

    const sessions = await this.prisma.tableSession.findMany({
      where: {
        restaurantId,
        status: { in: ['OPEN', 'PAID'] },
      },
      include: {
        orders: {
          select: { customerName: true, totalPrice: true, status: true },
        },
      },
    });

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
    return this.prisma.restaurantTable.delete({
      where: { id },
    });
  }
}
