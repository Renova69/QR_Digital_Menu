import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { CreateVisitFeedbackDto } from './dto/create-visit-feedback.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { buildRestaurantDateRange } from '../common/restaurant-date-range';

const FEEDBACK_WINDOW_MS = 48 * 60 * 60 * 1000;
const EXPERIENCE_COMPLETE_STATUSES = new Set([
  'SERVED',
  'COMPLETED',
  'CANCELED',
]);
const INVITATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const TOKEN_SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function getInvitationSigningSecret(): string {
  if (process.env.NODE_ENV === 'test') return 'test-secret';
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new InternalServerErrorException(
      'JWT_SECRET must be set before issuing feedback invitations',
    );
  }
  return secret;
}

function signInvitationToken(id: string, expiresAt: Date): string {
  const expiresAtSeconds = Math.floor(expiresAt.getTime() / 1000);
  const unsigned = `${id}.${expiresAtSeconds}`;
  const signature = createHmac('sha256', getInvitationSigningSecret())
    .update(`feedback-invitation.${unsigned}`)
    .digest('base64url');
  return `${unsigned}.${signature}`;
}

function readInvitationId(token: string): string | null {
  const [id, expiresAtRaw, signature, ...extra] = token.split('.');
  if (
    extra.length > 0 ||
    !INVITATION_ID_PATTERN.test(id ?? '') ||
    !/^\d{1,12}$/.test(expiresAtRaw ?? '') ||
    !TOKEN_SIGNATURE_PATTERN.test(signature ?? '')
  ) {
    return null;
  }

  const expiresAtSeconds = Number(expiresAtRaw);
  if (
    !Number.isSafeInteger(expiresAtSeconds) ||
    expiresAtSeconds * 1000 <= Date.now()
  ) {
    return null;
  }

  const unsigned = `${id}.${expiresAtRaw}`;
  const expected = createHmac('sha256', getInvitationSigningSecret())
    .update(`feedback-invitation.${unsigned}`)
    .digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }
  return id;
}

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(private readonly prisma: PrismaService) {}

  async issueVisitInvitation(tableSessionToken: string, paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        id: paymentId,
        tableSession: { token: tableSessionToken },
      },
      include: {
        tableSession: {
          include: {
            orders: {
              select: { id: true, status: true },
            },
          },
        },
        allocations: {
          include: {
            orderItem: {
              select: { orderId: true },
            },
          },
        },
        restaurant: {
          select: {
            id: true,
            name: true,
            googleReviewUrl: true,
          },
        },
      },
    });

    if (!payment || !payment.tableSessionId || !payment.tableSession) {
      throw new NotFoundException('Payment confirmation not found');
    }

    const paymentDetails = {
      id: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      provider: payment.provider,
    };
    const baseResponse = {
      submitted: false,
      payment: paymentDetails,
      restaurant: payment.restaurant,
    };

    if (payment.status !== 'SUCCEEDED') {
      return {
        ...baseResponse,
        eligible: false,
        reason: 'PAYMENT_PENDING',
      };
    }

    if (Date.now() - payment.updatedAt.getTime() > FEEDBACK_WINDOW_MS) {
      return {
        ...baseResponse,
        eligible: false,
        reason: 'PAYMENT_EXPIRED',
      };
    }

    const allocatedOrderIds = new Set(
      payment.allocations.map((allocation) => allocation.orderItem.orderId),
    );
    const relevantOrders =
      allocatedOrderIds.size > 0
        ? payment.tableSession.orders.filter((order) =>
            allocatedOrderIds.has(order.id),
          )
        : payment.tableSession.orders;
    const hasExperiencedOrder = relevantOrders.some((order) =>
      ['SERVED', 'COMPLETED'].includes(order.status),
    );
    const allRelevantOrdersComplete =
      relevantOrders.length > 0 &&
      relevantOrders.every((order) =>
        EXPERIENCE_COMPLETE_STATUSES.has(order.status),
      );

    if (!hasExperiencedOrder || !allRelevantOrdersComplete) {
      return {
        ...baseResponse,
        eligible: false,
        reason: 'ORDERS_NOT_SERVED',
      };
    }

    const expiresAt = new Date(Date.now() + FEEDBACK_WINDOW_MS);
    // The table session is the server-owned visit boundary. The no-op update
    // preserves the first eligible payment as an audit fact, while concurrent
    // retries all receive the same signed credential for the same invitation.
    const invitation = await this.prisma.feedbackInvitation.upsert({
      where: {
        tableSessionId: payment.tableSessionId,
      },
      create: {
        paymentId: payment.id,
        tableSessionId: payment.tableSessionId,
        restaurantId: payment.restaurantId,
        expiresAt,
      },
      update: {},
      select: {
        id: true,
        usedAt: true,
        presentedAt: true,
        expiresAt: true,
      },
    });
    const invitationToken = signInvitationToken(
      invitation.id,
      invitation.expiresAt,
    );

    if (invitation.usedAt) {
      return {
        ...baseResponse,
        eligible: true,
        submitted: true,
        invitationToken,
      };
    }

    if (invitation.presentedAt) {
      return {
        ...baseResponse,
        eligible: false,
        reason: 'ALREADY_PROMPTED',
      };
    }

    return {
      ...baseResponse,
      eligible: true,
      invitationToken,
    };
  }

  async markVisitFeedbackPresented(invitationToken: string) {
    const invitationId = readInvitationId(invitationToken);
    if (!invitationId) {
      throw new NotFoundException('Feedback invitation expired or not found');
    }

    const now = new Date();
    const presented = await this.prisma.feedbackInvitation.updateMany({
      where: {
        id: invitationId,
        presentedAt: null,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { presentedAt: now },
    });
    return { acknowledged: presented.count > 0 };
  }

  async createVisitFeedback(dto: CreateVisitFeedbackDto) {
    const now = new Date();
    const invitationId = readInvitationId(dto.invitationToken);
    if (!invitationId) {
      throw new NotFoundException('Feedback invitation expired or not found');
    }
    const invitation = await this.prisma.feedbackInvitation.findUnique({
      where: { id: invitationId },
      include: {
        payment: {
          select: { status: true },
        },
      },
    });

    if (!invitation || invitation.expiresAt <= now) {
      throw new NotFoundException('Feedback invitation expired or not found');
    }
    if (invitation.usedAt) {
      throw new ConflictException('Feedback already submitted for this visit');
    }
    if (invitation.payment.status !== 'SUCCEEDED') {
      throw new BadRequestException(
        'Payment is no longer eligible for feedback',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.feedbackInvitation.updateMany({
        where: {
          id: invitation.id,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });
      if (claimed.count === 0) {
        throw new ConflictException(
          'Feedback already submitted for this visit',
        );
      }

      return tx.feedback.create({
        data: {
          rating: dto.rating,
          comment: dto.comment?.trim() || undefined,
          redirectedToGoogle: false,
          invitationId: invitation.id,
          restaurantId: invitation.restaurantId,
        },
      });
    });
  }

  async markGoogleReviewClick(invitationToken: string) {
    const invitationId = readInvitationId(invitationToken);
    if (!invitationId) {
      throw new NotFoundException('Submitted feedback invitation not found');
    }
    const invitation = await this.prisma.feedbackInvitation.findUnique({
      where: { id: invitationId },
      include: {
        feedback: {
          select: { id: true },
        },
      },
    });

    if (
      !invitation ||
      invitation.expiresAt <= new Date() ||
      !invitation.feedback
    ) {
      throw new NotFoundException('Submitted feedback invitation not found');
    }

    return this.prisma.feedback.update({
      where: { id: invitation.feedback.id },
      data: {
        redirectedToGoogle: true,
        googleReviewClickedAt: new Date(),
      },
    });
  }

  private async verifyRestaurantAccess(restaurantId: string, userId: string) {
    const [restaurant, user] = await Promise.all([
      this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { ownerId: true, timezone: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { restaurantId: true },
      }),
    ]);

    if (!restaurant) throw new NotFoundException('Restaurant not found');
    if (restaurant.ownerId === userId || user?.restaurantId === restaurantId) {
      return restaurant;
    }
    throw new ForbiddenException('Forbidden access');
  }

  async create(createFeedbackDto: CreateFeedbackDto) {
    // Check if feedback already exists for this order
    const existing = await this.prisma.feedback.findUnique({
      where: { orderId: createFeedbackDto.orderId },
    });
    if (existing) {
      throw new ConflictException('Feedback already submitted for this order');
    }

    // Verify the order exists
    const order = await this.prisma.order.findUnique({
      where: { id: createFeedbackDto.orderId },
      select: { id: true, restaurantId: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (
      createFeedbackDto.restaurantId &&
      createFeedbackDto.restaurantId !== order.restaurantId
    ) {
      throw new BadRequestException('Feedback restaurant does not match order');
    }

    return this.prisma.feedback.create({
      data: {
        rating: createFeedbackDto.rating,
        comment: createFeedbackDto.comment,
        // A Google click is recorded only by the dedicated click endpoint.
        // Never trust a submission-time claim or infer a redirect from rating.
        redirectedToGoogle: false,
        orderId: createFeedbackDto.orderId,
        restaurantId: order.restaurantId,
      },
    });
  }

  // Get the Google Review URL for the restaurant (public)
  async getGoogleReviewUrl(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { googleReviewUrl: true, name: true },
    });
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }
    return {
      googleReviewUrl: restaurant.googleReviewUrl,
      name: restaurant.name,
    };
  }

  // Get all feedback for a restaurant (owner-only)
  async findAll(
    restaurantId: string,
    pagination: PaginationDto,
    userId: string,
  ) {
    await this.verifyRestaurantAccess(restaurantId, userId);
    const page = Number.isFinite(pagination.page) ? (pagination.page ?? 1) : 1;
    const limit = Number.isFinite(pagination.limit)
      ? (pagination.limit ?? 50)
      : 50;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.feedback.findMany({
        where: { restaurantId },
        include: {
          order: {
            select: {
              customerName: true,
              tableId: true,
              totalPrice: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.feedback.count({
        where: { restaurantId },
      }),
    ]);

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  // Get feedback summary stats (owner-only)
  async getSummary(
    restaurantId: string,
    userId: string,
    range: { startDate?: string; endDate?: string } = {},
  ) {
    const restaurant = await this.verifyRestaurantAccess(restaurantId, userId);
    const createdAt = buildRestaurantDateRange(
      range.startDate,
      range.endDate,
      restaurant.timezone ?? 'UTC',
    );
    const where = {
      restaurantId,
      ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
    };

    // DB-level aggregation — never pull every feedback row into Node memory.
    // The previous findMany + in-memory reduce loaded the whole table and would
    // spike memory / block the event loop for high-volume restaurants (#17).
    const [agg, byRating, googleRedirects, positiveCount] = await Promise.all([
      this.prisma.feedback.aggregate({
        where,
        _count: { _all: true },
        _avg: { rating: true },
      }),
      this.prisma.feedback.groupBy({
        by: ['rating'],
        where,
        _count: { _all: true },
      }),
      this.prisma.feedback.count({
        where: { ...where, redirectedToGoogle: true },
      }),
      this.prisma.feedback.count({
        where: { ...where, rating: { gte: 4 } },
      }),
    ]);

    const totalFeedbacks = agg._count._all;
    if (totalFeedbacks === 0) {
      return {
        totalFeedbacks: 0,
        averageRating: 0,
        ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        googleRedirects: 0,
        positiveRate: 0,
      };
    }

    const ratingDistribution: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    for (const row of byRating) {
      if (row.rating >= 1 && row.rating <= 5) {
        ratingDistribution[row.rating] = row._count._all;
      }
    }

    return {
      totalFeedbacks,
      averageRating: Math.round((agg._avg.rating ?? 0) * 10) / 10,
      ratingDistribution,
      googleRedirects,
      positiveRate: Math.round((positiveCount / totalFeedbacks) * 100),
    };
  }
}
