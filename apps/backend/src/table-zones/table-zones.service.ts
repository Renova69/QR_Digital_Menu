import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { ReorderZonesDto } from './dto/reorder-zones.dto';

@Injectable()
export class TableZonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
  ) {}

  async findAll(restaurantId: string) {
    return this.prisma.tableZone.findMany({
      where: { restaurantId },
      include: { _count: { select: { tables: true } } },
      orderBy: { displayOrder: 'asc' },
    });
  }

  async create(restaurantId: string, dto: CreateZoneDto, userId: string) {
    await this.verifyRestaurantOwnership(restaurantId, userId);

    const existing = await this.prisma.tableZone.findFirst({
      where: { restaurantId, name: { equals: dto.name, mode: 'insensitive' } },
    });
    if (existing) {
      throw new ConflictException(`Zone "${dto.name}" already exists`);
    }

    const displayOrder =
      dto.displayOrder ??
      ((await this.maxDisplayOrder(restaurantId)) + 1000);

    const zone = await this.prisma.tableZone.create({
      data: { name: dto.name.trim(), restaurantId, displayOrder },
    });
    this.events.emitZoneChanged(restaurantId);
    return zone;
  }

  async update(zoneId: string, dto: UpdateZoneDto, userId: string) {
    const zone = await this.findZoneOrThrow(zoneId);
    await this.verifyRestaurantOwnership(zone.restaurantId, userId);

    if (dto.name && dto.name !== zone.name) {
      const existing = await this.prisma.tableZone.findFirst({
        where: {
          restaurantId: zone.restaurantId,
          name: { equals: dto.name, mode: 'insensitive' },
          id: { not: zoneId },
        },
      });
      if (existing) {
        throw new ConflictException(`Zone "${dto.name}" already exists`);
      }
    }

    const updated = await this.prisma.tableZone.update({
      where: { id: zoneId },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.displayOrder !== undefined && { displayOrder: dto.displayOrder }),
      },
    });
    this.events.emitZoneChanged(zone.restaurantId);
    return updated;
  }

  async remove(zoneId: string, userId: string) {
    const zone = await this.findZoneOrThrow(zoneId);
    await this.verifyRestaurantOwnership(zone.restaurantId, userId);

    const zones = await this.prisma.tableZone.findMany({
      where: { restaurantId: zone.restaurantId },
      orderBy: { displayOrder: 'asc' },
    });

    if (zones.length <= 1) {
      throw new ConflictException('Cannot delete the last zone');
    }

    const defaultZone = zones[0];

    if (zone.id === defaultZone.id) {
      throw new ConflictException(
        'Cannot delete the default zone. Reassign the default zone first by reordering.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.restaurantTable.updateMany({
        where: { zoneId: zone.id },
        data: { zoneId: defaultZone.id },
      }),
      this.prisma.tableZone.delete({ where: { id: zone.id } }),
    ]);

    this.events.emitZoneChanged(zone.restaurantId);
    return { movedToZoneId: defaultZone.id };
  }

  async reorder(restaurantId: string, dto: ReorderZonesDto, userId: string) {
    await this.verifyRestaurantOwnership(restaurantId, userId);

    const existingZones = await this.prisma.tableZone.findMany({
      where: { restaurantId },
      select: { id: true },
    });
    const existingIds = new Set(existingZones.map((z) => z.id));

    const invalidIds = dto.items.filter((i) => !existingIds.has(i.id));
    if (invalidIds.length > 0) {
      throw new NotFoundException(
        `Zones not found: ${invalidIds.map((i) => i.id).join(', ')}`,
      );
    }

    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.tableZone.update({
          where: { id: item.id },
          data: { displayOrder: item.displayOrder },
        }),
      ),
    );

    this.events.emitZoneChanged(restaurantId);
  }

  async getDefaultZone(restaurantId: string) {
    const zone = await this.prisma.tableZone.findFirst({
      where: { restaurantId },
      orderBy: { displayOrder: 'asc' },
    });
    return zone;
  }

  private async maxDisplayOrder(restaurantId: string): Promise<number> {
    const result = await this.prisma.tableZone.aggregate({
      where: { restaurantId },
      _max: { displayOrder: true },
    });
    return result._max.displayOrder ?? 0;
  }

  private async findZoneOrThrow(zoneId: string) {
    const zone = await this.prisma.tableZone.findUnique({
      where: { id: zoneId },
    });
    if (!zone) {
      throw new NotFoundException('Zone not found');
    }
    return zone;
  }

  private async verifyRestaurantOwnership(
    restaurantId: string,
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
  }
}
