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
