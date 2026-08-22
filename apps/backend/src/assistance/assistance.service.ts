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
import { AssistanceQueryDto } from './dto/assistance-query.dto';
import { FeatureService } from '../subscription/feature.service';
import { FeatureFlag } from '../subscription/feature-flag.enum';
import { Prisma } from '@prisma/client';

// Dedupe window for call-waiter requests. Matches the 60s client-side anti-spam
// cooldown so the two gates agree; a request older than this no longer blocks the
// table (prevents permanent lockout when staff are slow to resolve).
const ASSIST_DEDUPE_WINDOW_MS = 60_000;

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
    // P0-2: prefer the QR code's publicToken; a table name is not a secret, so
    // once a table has a token the name no longer reaches it. Without this,
    // anyone could summon a waiter to any table in any restaurant.
    const table = createAssistanceDto.tableToken
      ? await this.prisma.restaurantTable.findFirst({
          where: {
            publicToken: createAssistanceDto.tableToken,
            restaurantId: createAssistanceDto.restaurantId,
            type: 'TABLE',
          },
        })
      : await this.prisma.restaurantTable.findFirst({
          where: {
            name: createAssistanceDto.tableId,
            restaurantId: createAssistanceDto.restaurantId,
            type: 'TABLE',
          },
        });
    if (!table) {
      throw new NotFoundException('Table not found');
    }
    // Identical error to "no such table" — never an oracle for which tables
    // exist or which have been migrated.
    if (!createAssistanceDto.tableToken && table.publicToken) {
      throw new NotFoundException('Table not found');
    }

    // Dedupe (Issue 54, refined): reject only a *recent* unresolved request of the
    // SAME type for this table. Time-scoping the window to the client cooldown means
    // a stale unresolved request can no longer permanently block the table, and an
    // URGENT escalation is allowed even while an earlier STANDARD request is still open.
    const requestType = createAssistanceDto.type ?? 'STANDARD';
    const since = new Date(Date.now() - ASSIST_DEDUPE_WINDOW_MS);
    const duplicate = await this.prisma.assistanceRequest.findFirst({
      where: {
        tableId: createAssistanceDto.tableId,
        restaurantId: createAssistanceDto.restaurantId,
        isResolved: false,
        type: requestType,
        createdAt: { gte: since },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(
        'A recent assistance request of this type already exists for this table',
      );
    }

    const newRequest = await this.prisma.assistanceRequest.create({
      data: {
        tableId: createAssistanceDto.tableId,
        restaurantId: createAssistanceDto.restaurantId,
        type: requestType,
      },
    });

    this.eventsGateway.emitToRestaurant(
      createAssistanceDto.restaurantId,
      'newAssistanceRequest',
      newRequest,
    );
    return newRequest;
  }

  async findAll(userId: string, query: AssistanceQueryDto) {
    const page = Number.isFinite(query.page) ? (query.page ?? 1) : 1;
    const limit = Number.isFinite(query.limit) ? (query.limit ?? 50) : 50;
    const skip = (page - 1) * limit;

    // Allow both owner and staff to see assistance requests
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { restaurantId: true },
    });

    let restaurantWhere: Prisma.AssistanceRequestWhereInput;
    if (query.restaurantId) {
      if (user?.restaurantId && user.restaurantId !== query.restaurantId) {
        throw new ForbiddenException('Forbidden access');
      }
      restaurantWhere = user?.restaurantId
        ? { restaurantId: query.restaurantId }
        : {
            restaurantId: query.restaurantId,
            restaurant: { ownerId: userId },
          };
    } else {
      restaurantWhere = user?.restaurantId
        ? { restaurantId: user.restaurantId }
        : { restaurant: { ownerId: userId } };
    }

    const where = {
      ...restaurantWhere,
      ...(query.isResolved !== undefined
        ? { isResolved: query.isResolved }
        : {}),
    };

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
