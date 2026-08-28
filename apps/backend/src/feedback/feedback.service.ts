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
import { FeedbackListQueryDto } from './dto/feedback-list-query.dto';
import { buildRestaurantDateRange } from '../common/restaurant-date-range';
import { restaurantMemberWhere } from '../auth/restaurant-member-scope';

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

  /**
   * `paymentId` is optional by design. The customer's device frequently cannot
   * name the payment that completed — a hosted-checkout redirect can lose its
   * sessionStorage marker, and waiter-settled cash/terminal payments are never
   * initiated by that device. In those cases the session's latest SUCCEEDED
   * payment IS the payment that just completed, and the server is the
   * authoritative place to resolve it. The table-session token authorizes the
   * lookup either way, so this widens no access.
   */
  async issueVisitInvitation(tableSessionToken: string, paymentId?: string) {
    const findPayment = (
      scope: { id: string } | { status: 'SUCCEEDED' | 'PENDING' },
    ) =>
      this.prisma.payment.findFirst({
        where: { tableSession: { token: tableSessionToken }, ...scope },
        // Only meaningful in the resolve-latest case; a same-session id lookup
        // is already unique.
        orderBy: { updatedAt: 'desc' },
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

    // Prefer a settled payment, but fall back to one still in flight. A
    // hosted-checkout redirect regularly beats the provider webhook, so the
    // session's newest payment can still be PENDING at this point. Returning
    // it lets the caller answer PAYMENT_PENDING and retry; filtering it out
    // produced a 404 the confirmation page treats as unrecoverable, stranding
    // the customer on "couldn't verify" with no review.
    //
    // FAILED / ABANDONED / REFUNDED are deliberately excluded — resurrecting a
    // dead earlier attempt would report "pending" that never resolves.
    const payment = paymentId
      ? await findPayment({ id: paymentId })
      : ((await findPayment({ status: 'SUCCEEDED' })) ??
        (await findPayment({ status: 'PENDING' })));

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
        where: { id: restaurantId, ...restaurantMemberWhere(userId) },
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

  /**
   * Legacy order-bound feedback. The table-session token is the authorization:
   * the order is resolved *through* the session it belongs to, so a scraped or
   * guessed order id is worthless without the credential handed to whoever was
   * actually seated there. Without this the endpoint accepted any order id from
   * anyone -- letting a stranger skew a restaurant's rating and, because
   * Feedback.orderId is unique, permanently lock the real guest out of
   * reviewing their own meal.
   *
   * Authorization runs before the duplicate check on purpose: reversing them
   * would let one restaurant's diner probe "has order X been reviewed?" across
   * every other tenant.
   */
  async create(
    tableSessionToken: string,
    createFeedbackDto: CreateFeedbackDto,
  ) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: createFeedbackDto.orderId,
        tableSession: { token: tableSessionToken },
      },
      select: { id: true, restaurantId: true },
    });
    // Deliberately the same message as a genuinely missing order -- the
    // response must not tell a caller whether the id exists elsewhere.
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (
      createFeedbackDto.restaurantId &&
      createFeedbackDto.restaurantId !== order.restaurantId
    ) {
      throw new BadRequestException('Feedback restaurant does not match order');
    }

    const existing = await this.prisma.feedback.findUnique({
      where: { orderId: createFeedbackDto.orderId },
    });
    if (existing) {
      throw new ConflictException('Feedback already submitted for this order');
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

  // Management feedback: actual owner or an assigned account.
  async findAll(
    restaurantId: string,
    query: FeedbackListQueryDto,
    userId: string,
  ) {
    const restaurant = await this.verifyRestaurantAccess(restaurantId, userId);
    const page = Number.isFinite(query.page) ? (query.page ?? 1) : 1;
    const limit = Number.isFinite(query.limit) ? (query.limit ?? 50) : 50;
    const skip = (page - 1) * limit;
    const createdAt = buildRestaurantDateRange(
      query.startDate,
      query.endDate,
      restaurant.timezone ?? 'UTC',
    );
    const where = {
      restaurantId,
      restaurant: restaurantMemberWhere(userId),
      ...(query.rating ? { rating: query.rating } : {}),
      ...(query.hasComment === true ? { comment: { not: null } } : {}),
      ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
    };

    const [feedbackRows, total] = await Promise.all([
      this.prisma.feedback.findMany({
        where,
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          googleReviewClickedAt: true,
          order: {
            select: {
              customerName: true,
              tableName: true,
              totalPrice: true,
              tableSessionId: true,
            },
          },
          invitation: {
            select: {
              tableSessionId: true,
              payment: {
                select: {
                  provider: true,
                  amount: true,
                  currency: true,
                },
              },
              tableSession: {
                select: {
                  table: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: query.sort === 'OLDEST' ? 'asc' : 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.feedback.count({
        where,
      }),
    ]);
    const data = feedbackRows.map((feedback) => ({
      id: feedback.id,
      source: 'LOCAL' as const,
      rating: feedback.rating,
      comment: feedback.comment,
      createdAt: feedback.createdAt,
      // Invitation tokens represent a table visit, not a verified individual.
      // Only legacy order-bound feedback can safely inherit the entered name.
      authorName: feedback.invitation
        ? null
        : (feedback.order?.customerName ?? null),
      tableName:
        feedback.invitation?.tableSession.table.name ??
        feedback.order?.tableName ??
        null,
      orderTotal: feedback.order?.totalPrice ?? null,
      payment: feedback.invitation?.payment ?? null,
      googleReviewClickedAt: feedback.googleReviewClickedAt,
      // Present when the review can be traced back to a table visit. The
      // dashboard uses it to decide whether the row opens a visit drawer.
      sessionId:
        feedback.invitation?.tableSessionId ??
        feedback.order?.tableSessionId ??
        null,
    }));

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * The visit behind a review (owner-only). A review reaches its table session
   * one of two ways — through the invitation it was issued from, or, for legacy
   * order-bound feedback, through the order itself. Everything the drawer shows
   * is derived from that session, so there is no second source of truth for
   * what the guest actually ordered.
   */
  async getVisit(feedbackId: string, userId: string) {
    const feedback = await this.prisma.feedback.findUnique({
      where: { id: feedbackId, restaurant: restaurantMemberWhere(userId) },
      select: {
        id: true,
        restaurantId: true,
        rating: true,
        comment: true,
        createdAt: true,
        invitation: { select: { tableSessionId: true } },
        order: { select: { tableSessionId: true } },
      },
    });
    if (!feedback) throw new NotFoundException('Feedback not found');

    await this.verifyRestaurantAccess(feedback.restaurantId, userId);

    const sessionId =
      feedback.invitation?.tableSessionId ??
      feedback.order?.tableSessionId ??
      null;
    if (!sessionId) {
      throw new NotFoundException('This review is not linked to a table visit');
    }

    // Keep both the captured tenant and current membership on the detail read.
    const session = await this.prisma.tableSession.findFirst({
      where: {
        id: sessionId,
        restaurantId: feedback.restaurantId,
        restaurant: restaurantMemberWhere(userId),
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        paidAt: true,
        table: { select: { name: true } },
        orders: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            createdAt: true,
            status: true,
            source: true,
            totalPrice: true,
            items: {
              select: {
                id: true,
                quantity: true,
                // Point-in-time snapshot — survives a later rename or delete.
                itemName: true,
                unitPriceWithOptions: true,
                notes: true,
              },
            },
          },
        },
        payments: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            provider: true,
            status: true,
            amount: true,
            tipAmount: true,
            currency: true,
            createdAt: true,
          },
        },
      },
    });
    if (!session) {
      throw new NotFoundException('Table visit not found');
    }

    return {
      feedback: {
        id: feedback.id,
        rating: feedback.rating,
        comment: feedback.comment,
        createdAt: feedback.createdAt,
      },
      session: {
        id: session.id,
        status: session.status,
        tableName: session.table?.name ?? null,
        openedAt: session.createdAt,
        paidAt: session.paidAt,
      },
      orders: session.orders.map((order) => ({
        id: order.id,
        createdAt: order.createdAt,
        status: order.status,
        source: order.source,
        total: order.totalPrice,
        items: order.items.map((item) => ({
          id: item.id,
          name: item.itemName,
          quantity: item.quantity,
          unitPrice: item.unitPriceWithOptions,
          lineTotal: item.quantity * item.unitPriceWithOptions,
          notes: item.notes,
        })),
      })),
      payments: session.payments,
    };
  }

  // Same membership scope for every aggregate as for the management list.
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
      restaurant: restaurantMemberWhere(userId),
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
