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
import { restaurantManagementWhere } from '../auth/restaurant-management-scope';
import { scopedWrite } from '../common/prisma/scoped-write';

@Injectable()
export class TableZonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
  ) {}

  async findAll(restaurantId: string, user?: any) {
    await this.verifyRestaurantAccess(restaurantId, user);
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
      dto.displayOrder ?? (await this.maxDisplayOrder(restaurantId)) + 1000;

    const zone = await scopedWrite(
      this.prisma.tableZone.create({
        data: {
          name: dto.name.trim(),
          zoneKey: dto.zoneKey ?? null,
          restaurant: {
            connect: { id: restaurantId, ...restaurantManagementWhere(userId) },
          },
          displayOrder,
        },
      }),
    );
    this.events.emitZoneChanged(restaurantId);
    return zone;
  }

  async update(zoneId: string, dto: UpdateZoneDto, userId: string) {
    const zone = await this.findZoneOrThrow(zoneId, userId);
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

    const updated = await scopedWrite(
      this.prisma.tableZone.update({
        where: {
          id: zoneId,
          restaurantId: zone.restaurantId,
          restaurant: restaurantManagementWhere(userId),
        },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.zoneKey !== undefined && { zoneKey: dto.zoneKey }),
          ...(dto.displayOrder !== undefined && {
            displayOrder: dto.displayOrder,
          }),
        },
      }),
    );
    this.events.emitZoneChanged(zone.restaurantId);
    return updated;
  }

  async remove(zoneId: string, userId: string) {
    const zone = await this.findZoneOrThrow(zoneId, userId);
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

    const restaurantWhere = {
      ...restaurantManagementWhere(userId),
      // The fallback zone must still belong to the same tenant at each write.
      tableZones: { some: { id: defaultZone.id } },
    };
    await scopedWrite(
      this.prisma.$transaction([
        this.prisma.restaurantTable.updateMany({
          where: {
            zoneId: zone.id,
            restaurantId: zone.restaurantId,
            restaurant: restaurantWhere,
          },
          data: { zoneId: defaultZone.id },
        }),
        this.prisma.tableZone.delete({
          where: {
            id: zone.id,
            restaurantId: zone.restaurantId,
            restaurant: restaurantWhere,
          },
        }),
      ]),
    );

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

    await scopedWrite(
      this.prisma.$transaction(
        dto.items.map((item) =>
          this.prisma.tableZone.update({
            where: {
              id: item.id,
              restaurantId,
              restaurant: restaurantManagementWhere(userId),
            },
            data: { displayOrder: item.displayOrder },
          }),
        ),
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

  private async findZoneOrThrow(zoneId: string, userId: string) {
    const zone = await this.prisma.tableZone.findUnique({
      where: { id: zoneId, restaurant: restaurantManagementWhere(userId) },
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
      where: { id: restaurantId, ...restaurantManagementWhere(userId) },
    });
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }
    if (restaurant.ownerId !== userId) {
      // Assigned MANAGERs configure their own restaurant's zones — consistent
      // with menu, tables, payments, and dashboard access (#19).
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, restaurantId: true },
      });
      const isManager =
        user?.role === 'MANAGER' && user.restaurantId === restaurantId;
      if (!isManager) {
        throw new ForbiddenException('You do not own this restaurant');
      }
    }
  }

  private async verifyRestaurantAccess(restaurantId: string, user: any) {
    if (!user) throw new ForbiddenException('Access denied');
    if (user.role?.toUpperCase() === 'SUPER_ADMIN') return;
    if (user.restaurantId === restaurantId) return;

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { ownerId: true },
    });
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }
    if (restaurant.ownerId !== user.id) {
      throw new ForbiddenException('Access denied');
    }
  }
}
