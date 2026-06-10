import {
  Injectable,
  NotFoundException,
  Logger,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAssistanceDto } from './dto/create-assistance.dto';
import { UpdateAssistanceDto } from './dto/update-assistance.dto';
import { EventsGateway } from '../events/events.gateway';
import { PaginationDto } from '../common/dto/pagination.dto';
import { FeatureService } from '../subscription/feature.service';
import { FeatureFlag } from '../subscription/feature-flag.enum';

@Injectable()
export class AssistanceService {
  private readonly logger = new Logger(AssistanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsGateway: EventsGateway,
    private readonly featureService: FeatureService,
  ) {}

  private async verifyRequestAccess(id: string, userId: string) {
    const request = await this.prisma.assistanceRequest.findUnique({
      where: { id },
      include: {
        restaurant: { select: { ownerId: true } },
      },
    });

    if (!request) {
      throw new NotFoundException(
        `Assistance request with ID "${id}" not found`,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { restaurantId: true },
    });

    const hasAccess =
      request.restaurant.ownerId === userId ||
      user?.restaurantId === request.restaurantId;

    if (!hasAccess) {
      throw new ForbiddenException('Forbidden access');
    }

    return request;
  }

  async create(createAssistanceDto: CreateAssistanceDto) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: createAssistanceDto.restaurantId },
      select: { tier: true, forceTier: true },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    if (
      !this.featureService.restaurantHasFeature(
        restaurant,
        FeatureFlag.ORDERS_CALL_WAITER,
      )
    ) {
      throw new ForbiddenException({
        code: 'FEATURE_LOCKED',
        message: 'Call waiter is not available on this plan',
      });
    }

    // Issue 4: validate table exists for this restaurant.
    const table = await this.prisma.restaurantTable.findFirst({
      where: {
        name: createAssistanceDto.tableId,
        restaurantId: createAssistanceDto.restaurantId,
      },
    });
    if (!table) {
      throw new NotFoundException('Table not found');
    }

    // Issue 54: prevent duplicate pending requests per table (at most 1 unresolved).
    const pendingCount = await this.prisma.assistanceRequest.count({
      where: {
        tableId: createAssistanceDto.tableId,
        restaurantId: createAssistanceDto.restaurantId,
        isResolved: false,
      },
    });
    if (pendingCount >= 1) {
      throw new ConflictException(
        'A pending assistance request already exists for this table',
      );
    }

    const newRequest = await this.prisma.assistanceRequest.create({
      data: {
        tableId: createAssistanceDto.tableId,
        restaurantId: createAssistanceDto.restaurantId,
        type: createAssistanceDto.type ?? 'STANDARD',
      },
    });

    this.eventsGateway.emitToRestaurant(
      createAssistanceDto.restaurantId,
      'newAssistanceRequest',
      newRequest,
    );
    return newRequest;
  }

  async findAll(userId: string, pagination: PaginationDto) {
    const page = Number.isFinite(pagination.page) ? (pagination.page ?? 1) : 1;
    const limit = Number.isFinite(pagination.limit)
      ? (pagination.limit ?? 50)
      : 50;
    const skip = (page - 1) * limit;

    // Allow both owner and staff to see assistance requests
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { restaurantId: true },
    });

    const where = user?.restaurantId
      ? { restaurantId: user.restaurantId }
      : { restaurant: { ownerId: userId } };

    const [data, total] = await Promise.all([
      this.prisma.assistanceRequest.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.assistanceRequest.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, userId: string) {
    return this.verifyRequestAccess(id, userId);
  }

  async update(
    id: string,
    updateAssistanceDto: UpdateAssistanceDto,
    userId: string,
  ) {
    const request = await this.verifyRequestAccess(id, userId);
    const updatedRequest = await this.prisma.assistanceRequest.update({
      where: { id },
      data: {
        isResolved: updateAssistanceDto.isResolved,
      },
    });

    this.eventsGateway.emitToRestaurant(
      request.restaurantId,
      'assistanceStatusChanged',
      updatedRequest,
    );
    return updatedRequest;
  }

  async remove(id: string, userId: string) {
    await this.verifyRequestAccess(id, userId);
    return this.prisma.assistanceRequest.delete({
      where: { id },
    });
  }
}
