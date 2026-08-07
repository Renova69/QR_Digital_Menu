import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { PrismaService } from '../prisma/prisma.service';
import { createHmac } from 'crypto';

const mockPrisma = {
  feedback: {
    findUnique: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn(),
    update: jest.fn(),
  },
  feedbackInvitation: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  payment: {
    findFirst: jest.fn(),
  },
  order: {
    findUnique: jest.fn(),
  },
  restaurant: {
    findUnique: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

function invitationToken(id: string, expiresAt: Date) {
  const expiresAtSeconds = Math.floor(expiresAt.getTime() / 1000);
  const unsigned = `${id}.${expiresAtSeconds}`;
  const signature = createHmac('sha256', 'test-secret')
    .update(`feedback-invitation.${unsigned}`)
    .digest('base64url');
  return `${unsigned}.${signature}`;
}

describe('FeedbackService', () => {
  let service: FeedbackService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbackService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<FeedbackService>(FeedbackService);
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mockPrisma) => unknown) =>
        callback(mockPrisma),
    );
  });

  describe('payment feedback invitations', () => {
    const servedPayment = {
      id: 'payment-1',
      status: 'SUCCEEDED',
      amount: 24.5,
      currency: 'eur',
      provider: 'STRIPE',
      updatedAt: new Date(),
      tableSessionId: 'session-1',
      restaurantId: 'rest-1',
      tableSession: {
        id: 'session-1',
        token: 'session-token',
        status: 'OPEN',
        orders: [{ id: 'order-1', status: 'SERVED' }],
      },
      allocations: [{ orderItem: { orderId: 'order-1' } }],
      restaurant: {
        id: 'rest-1',
        name: 'Daffi',
        googleReviewUrl: 'https://g.page/r/example/review',
      },
    };

    it('issues a one-time invitation after a successful served payment', async () => {
      const expiresAt = new Date(Date.now() + 60_000);
      mockPrisma.payment.findFirst.mockResolvedValue(servedPayment);
      mockPrisma.feedbackInvitation.upsert.mockResolvedValue({
        id: 'invitation-1',
        usedAt: null,
        presentedAt: null,
        expiresAt,
      });

      const result = await service.issueVisitInvitation(
        'session-token',
        'payment-1',
      );

      expect(result).toEqual(
        expect.objectContaining({
          eligible: true,
          submitted: false,
          invitationToken: expect.any(String),
          payment: expect.objectContaining({
            id: 'payment-1',
            amount: 24.5,
            provider: 'STRIPE',
          }),
          restaurant: servedPayment.restaurant,
        }),
      );
      expect(mockPrisma.feedbackInvitation.upsert).toHaveBeenCalledWith({
        where: { tableSessionId: 'session-1' },
        create: {
          paymentId: 'payment-1',
          tableSessionId: 'session-1',
          restaurantId: 'rest-1',
          expiresAt: expect.any(Date),
        },
        update: {},
        select: {
          id: true,
          usedAt: true,
          presentedAt: true,
          expiresAt: true,
        },
      });
      expect(mockPrisma.feedbackInvitation.updateMany).not.toHaveBeenCalled();
    });

    // A hosted-checkout return can come back without its sessionStorage
    // marker, and waiter-settled cash/terminal payments are never initiated by
    // the customer's device — in both cases the client has no paymentId to
    // send. The session's latest SUCCEEDED payment is the authoritative answer.
    it('resolves the latest succeeded payment when no paymentId is supplied', async () => {
      const expiresAt = new Date(Date.now() + 60_000);
      mockPrisma.payment.findFirst.mockResolvedValue(servedPayment);
      mockPrisma.feedbackInvitation.upsert.mockResolvedValue({
        id: 'invitation-1',
        usedAt: null,
        presentedAt: null,
        expiresAt,
      });

      const result = await service.issueVisitInvitation('session-token');

      expect(mockPrisma.payment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tableSession: { token: 'session-token' },
            status: 'SUCCEEDED',
          },
          orderBy: { updatedAt: 'desc' },
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({ eligible: true, submitted: false }),
      );
    });

    it('still scopes to the given payment when a paymentId is supplied', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(servedPayment);
      mockPrisma.feedbackInvitation.upsert.mockResolvedValue({
        id: 'invitation-1',
        usedAt: null,
        presentedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });

      await service.issueVisitInvitation('session-token', 'payment-1');

      expect(mockPrisma.payment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tableSession: { token: 'session-token' },
            id: 'payment-1',
          },
        }),
      );
    });

    // The session token is the only credential — a caller without one must not
    // be able to resolve someone else's payment by omitting the id.
    it('finds nothing when the session token does not match', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null);

      await expect(
        service.issueVisitInvitation('wrong-token'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('does not invite a guest before the relevant order is served', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        ...servedPayment,
        tableSession: {
          ...servedPayment.tableSession,
          orders: [{ id: 'order-1', status: 'IN_PROGRESS' }],
        },
      });

      const result = await service.issueVisitInvitation(
        'session-token',
        'payment-1',
      );

      expect(result).toEqual(
        expect.objectContaining({
          eligible: false,
          reason: 'ORDERS_NOT_SERVED',
        }),
      );
      expect(mockPrisma.feedbackInvitation.upsert).not.toHaveBeenCalled();
    });

    it('does not rewrite the payment linked to submitted visit feedback', async () => {
      const usedAt = new Date();
      const expiresAt = new Date(Date.now() + 60_000);
      mockPrisma.payment.findFirst.mockResolvedValue(servedPayment);
      mockPrisma.feedbackInvitation.upsert.mockResolvedValue({
        id: 'invitation-1',
        usedAt,
        presentedAt: usedAt,
        expiresAt,
      });

      const result = await service.issueVisitInvitation(
        'session-token',
        'payment-1',
      );

      expect(result).toEqual(
        expect.objectContaining({
          eligible: true,
          submitted: true,
        }),
      );
      expect(mockPrisma.feedbackInvitation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: {} }),
      );
      expect(mockPrisma.feedbackInvitation.updateMany).not.toHaveBeenCalled();
    });

    it('returns the same valid prompt during concurrent retries', async () => {
      const expiresAt = new Date(Date.now() + 60_000);
      mockPrisma.payment.findFirst.mockResolvedValue(servedPayment);
      mockPrisma.feedbackInvitation.upsert.mockResolvedValue({
        id: 'invitation-1',
        usedAt: null,
        presentedAt: null,
        expiresAt,
      });

      const results = await Promise.all([
        service.issueVisitInvitation('session-token', 'payment-1'),
        service.issueVisitInvitation('session-token', 'payment-1'),
      ]);

      expect(results).toEqual([
        expect.objectContaining({
          eligible: true,
          invitationToken: invitationToken('invitation-1', expiresAt),
        }),
        expect.objectContaining({
          eligible: true,
          invitationToken: invitationToken('invitation-1', expiresAt),
        }),
      ]);
    });

    it('records presentation only after the browser acknowledges rendering', async () => {
      const expiresAt = new Date(Date.now() + 60_000);
      mockPrisma.feedbackInvitation.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.markVisitFeedbackPresented(
          invitationToken('invitation-1', expiresAt),
        ),
      ).resolves.toEqual({ acknowledged: true });
      expect(mockPrisma.feedbackInvitation.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'invitation-1',
          presentedAt: null,
          usedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
        data: { presentedAt: expect.any(Date) },
      });
    });

    it('does not reissue a prompt after the browser acknowledged it', async () => {
      const presentedAt = new Date();
      mockPrisma.payment.findFirst.mockResolvedValue(servedPayment);
      mockPrisma.feedbackInvitation.upsert.mockResolvedValue({
        id: 'invitation-1',
        usedAt: null,
        presentedAt,
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(
        service.issueVisitInvitation('session-token', 'payment-1'),
      ).resolves.toEqual(
        expect.objectContaining({
          eligible: false,
          reason: 'ALREADY_PROMPTED',
        }),
      );
    });

    it('records one private feedback response against the invitation', async () => {
      const expiresAt = new Date(Date.now() + 60_000);
      mockPrisma.feedbackInvitation.findUnique.mockResolvedValue({
        id: 'invitation-1',
        restaurantId: 'rest-1',
        usedAt: null,
        expiresAt,
        payment: { status: 'SUCCEEDED' },
      });
      mockPrisma.feedback.create.mockResolvedValue({
        id: 'feedback-1',
        rating: 3,
      });
      mockPrisma.feedbackInvitation.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.createVisitFeedback({
        invitationToken: invitationToken('invitation-1', expiresAt),
        rating: 3,
        comment: 'Good food',
      });

      expect(result).toEqual(expect.objectContaining({ id: 'feedback-1' }));
      expect(mockPrisma.feedback.create).toHaveBeenCalledWith({
        data: {
          rating: 3,
          comment: 'Good food',
          redirectedToGoogle: false,
          invitationId: 'invitation-1',
          restaurantId: 'rest-1',
        },
      });
      expect(mockPrisma.feedbackInvitation.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'invitation-1',
          usedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
        data: { usedAt: expect.any(Date) },
      });
    });

    it('counts a Google redirect only when the guest clicks the link', async () => {
      const expiresAt = new Date(Date.now() + 60_000);
      mockPrisma.feedbackInvitation.findUnique.mockResolvedValue({
        id: 'invitation-1',
        expiresAt,
        feedback: { id: 'feedback-1' },
      });
      mockPrisma.feedback.update.mockResolvedValue({
        id: 'feedback-1',
        redirectedToGoogle: true,
      });

      await service.markGoogleReviewClick(
        invitationToken('invitation-1', expiresAt),
      );

      expect(mockPrisma.feedback.update).toHaveBeenCalledWith({
        where: { id: 'feedback-1' },
        data: {
          redirectedToGoogle: true,
          googleReviewClickedAt: expect.any(Date),
        },
      });
    });

    it('rejects a tampered server-signed invitation token', async () => {
      await expect(
        service.createVisitFeedback({
          invitationToken: 'invitation-1.9999999999.invalid',
          rating: 5,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.feedbackInvitation.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    const dto = {
      orderId: 'order-1',
      restaurantId: 'rest-1',
      rating: 5,
      comment: 'Great!',
    };

    it('creates feedback when no existing entry and order exists', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(null);
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        restaurantId: 'rest-1',
      });
      mockPrisma.feedback.create.mockResolvedValue({ id: 'fb-1', ...dto });

      const result = await service.create(dto);

      expect(result).toHaveProperty('id', 'fb-1');
      expect(mockPrisma.feedback.create).toHaveBeenCalledWith({
        data: {
          rating: dto.rating,
          comment: dto.comment,
          redirectedToGoogle: false,
          orderId: dto.orderId,
          restaurantId: dto.restaurantId,
        },
      });
    });

    it('throws ConflictException when feedback already exists for order', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(mockPrisma.order.findUnique).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when order not found', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(null);
      mockPrisma.order.findUnique.mockResolvedValue(null);

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    });

    it('does not count a claimed Google redirect before an actual click', async () => {
      const dtoWithRedirect = { ...dto, redirectedToGoogle: true };
      mockPrisma.feedback.findUnique.mockResolvedValue(null);
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        restaurantId: 'rest-1',
      });
      mockPrisma.feedback.create.mockResolvedValue({ id: 'fb-2' });

      await service.create(dtoWithRedirect);

      expect(mockPrisma.feedback.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ redirectedToGoogle: false }),
        }),
      );
    });

    it('rejects a restaurantId that does not match the order', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(null);
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        restaurantId: 'rest-1',
      });

      await expect(
        service.create({ ...dto, restaurantId: 'rest-2' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getGoogleReviewUrl', () => {
    it('returns googleReviewUrl and name for existing restaurant', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        googleReviewUrl: 'https://g.co/review/abc',
        name: 'My Restaurant',
      });

      const result = await service.getGoogleReviewUrl('rest-1');

      expect(result.googleReviewUrl).toBe('https://g.co/review/abc');
      expect(result.name).toBe('My Restaurant');
    });

    it('throws NotFoundException when restaurant not found', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(null);

      await expect(service.getGoogleReviewUrl('bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    beforeEach(() => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ownerId: 'owner-1',
      });
      mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: null });
      mockPrisma.feedback.findMany.mockResolvedValue([{ id: 'fb-1' }]);
      mockPrisma.feedback.count.mockResolvedValue(1);
    });

    it('returns paginated data with total and totalPages', async () => {
      const result = await service.findAll(
        'rest-1',
        { page: 1, limit: 10 },
        'owner-1',
      );

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('returns visit context without inventing an author for invitation feedback', async () => {
      const createdAt = new Date('2026-07-30T10:15:00.000Z');
      mockPrisma.feedback.findMany.mockResolvedValue([
        {
          id: 'fb-visit-1',
          rating: 5,
          comment: 'Excellent service',
          createdAt,
          redirectedToGoogle: true,
          googleReviewClickedAt: new Date('2026-07-30T10:16:00.000Z'),
          order: null,
          invitation: {
            payment: {
              provider: 'STRIPE',
              amount: 24.5,
              currency: 'EUR',
            },
            tableSession: {
              table: {
                name: 'Table 4',
              },
            },
          },
        },
      ]);

      const result = await service.findAll(
        'rest-1',
        { page: 1, limit: 10 },
        'owner-1',
      );

      expect(result.data[0]).toEqual({
        id: 'fb-visit-1',
        source: 'LOCAL',
        rating: 5,
        comment: 'Excellent service',
        createdAt,
        authorName: null,
        tableName: 'Table 4',
        orderTotal: null,
        payment: {
          provider: 'STRIPE',
          amount: 24.5,
          currency: 'EUR',
        },
        googleReviewClickedAt: new Date('2026-07-30T10:16:00.000Z'),
      });
    });

    it('applies rating, comment, and restaurant-local date filters', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ownerId: 'owner-1',
        timezone: 'UTC',
      });

      await service.findAll(
        'rest-1',
        {
          page: 2,
          limit: 10,
          rating: 4,
          hasComment: true,
          startDate: '2026-07-01',
          endDate: '2026-07-31',
        },
        'owner-1',
      );

      expect(mockPrisma.feedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            restaurantId: 'rest-1',
            rating: 4,
            comment: { not: null },
            createdAt: {
              gte: new Date('2026-07-01T00:00:00.000Z'),
              lte: new Date('2026-07-31T23:59:59.999Z'),
            },
          },
          skip: 10,
          take: 10,
        }),
      );
    });

    it('sorts the review inbox from oldest to newest when requested', async () => {
      await service.findAll(
        'rest-1',
        { page: 1, limit: 10, sort: 'OLDEST' },
        'owner-1',
      );

      expect(mockPrisma.feedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'asc' },
        }),
      );
    });

    it('shows the entered guest name only for legacy order-bound feedback', async () => {
      const createdAt = new Date('2026-07-29T17:30:00.000Z');
      mockPrisma.feedback.findMany.mockResolvedValue([
        {
          id: 'fb-order-1',
          rating: 4,
          comment: null,
          createdAt,
          googleReviewClickedAt: null,
          order: {
            customerName: 'Maria',
            tableName: 'Garden 2',
            totalPrice: 38.2,
          },
          invitation: null,
        },
      ]);

      const result = await service.findAll(
        'rest-1',
        { page: 1, limit: 10 },
        'owner-1',
      );

      expect(result.data[0]).toEqual(
        expect.objectContaining({
          authorName: 'Maria',
          tableName: 'Garden 2',
          orderTotal: 38.2,
          payment: null,
        }),
      );
    });

    it('uses default page/limit for undefined pagination', async () => {
      const result = await service.findAll('rest-1', {}, 'owner-1');

      expect(result.page).toBe(1);
      expect(result).toHaveProperty('totalPages');
    });

    it('throws ForbiddenException for another restaurant', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ownerId: 'owner-1',
      });
      mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: 'rest-2' });

      await expect(
        service.findAll('rest-1', { page: 1, limit: 10 }, 'staff-2'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getSummary', () => {
    // getSummary now aggregates at the DB layer (aggregate + groupBy + count)
    // instead of pulling all rows into memory (#17). These helpers wire the
    // mock to return DB-shaped results.
    const mockAgg = (total: number, avg: number | null) =>
      mockPrisma.feedback.aggregate.mockResolvedValue({
        _count: { _all: total },
        _avg: { rating: avg },
      });
    const mockGroupBy = (dist: Array<{ rating: number; count: number }>) =>
      mockPrisma.feedback.groupBy.mockResolvedValue(
        dist.map((d) => ({ rating: d.rating, _count: { _all: d.count } })),
      );
    const mockCounts = (googleRedirects: number, positive: number) =>
      mockPrisma.feedback.count.mockImplementation(
        ({ where }: { where: Record<string, unknown> }) => {
          if (where.redirectedToGoogle) return Promise.resolve(googleRedirects);
          if (where.rating) return Promise.resolve(positive);
          return Promise.resolve(0);
        },
      );

    beforeEach(() => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ownerId: 'owner-1',
      });
      mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: null });
    });

    it('returns zero stats when no feedback exists', async () => {
      mockAgg(0, null);
      mockGroupBy([]);
      mockCounts(0, 0);

      const result = await service.getSummary('rest-1', 'owner-1');

      expect(result.totalFeedbacks).toBe(0);
      expect(result.averageRating).toBe(0);
      expect(result.googleRedirects).toBe(0);
      expect(result.positiveRate).toBe(0);
    });

    it('calculates correct average rating', async () => {
      mockAgg(3, 4);
      mockGroupBy([
        { rating: 4, count: 1 },
        { rating: 5, count: 1 },
        { rating: 3, count: 1 },
      ]);
      mockCounts(1, 2);

      const result = await service.getSummary('rest-1', 'owner-1');

      expect(result.totalFeedbacks).toBe(3);
      expect(result.averageRating).toBe(4);
      expect(result.googleRedirects).toBe(1);
    });

    it('calculates positiveRate as % of ratings >= 4', async () => {
      mockAgg(4, 3);
      mockGroupBy([
        { rating: 5, count: 1 },
        { rating: 4, count: 1 },
        { rating: 2, count: 1 },
        { rating: 1, count: 1 },
      ]);
      mockCounts(0, 2);

      const result = await service.getSummary('rest-1', 'owner-1');

      expect(result.positiveRate).toBe(50); // 2 out of 4
    });

    it('populates ratingDistribution for all 5 rating levels', async () => {
      mockAgg(3, 13 / 3);
      mockGroupBy([
        { rating: 5, count: 2 },
        { rating: 3, count: 1 },
      ]);
      mockCounts(0, 2);

      const result = await service.getSummary('rest-1', 'owner-1');

      expect(result.ratingDistribution[5]).toBe(2);
      expect(result.ratingDistribution[3]).toBe(1);
      expect(result.ratingDistribution[1]).toBe(0);
    });
  });

  describe('verifyRestaurantAccess (via getSummary)', () => {
    it('allows access if user is assigned to the restaurant', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ownerId: 'owner-1',
      });
      mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: 'rest-1' });

      mockPrisma.feedback.aggregate.mockResolvedValue({
        _count: { _all: 0 },
        _avg: { rating: null },
      });
      mockPrisma.feedback.groupBy.mockResolvedValue([]);
      mockPrisma.feedback.count.mockResolvedValue(0);

      const result = await service.getSummary('rest-1', 'staff-1');
      expect(result.totalFeedbacks).toBe(0); // indicates it didn't throw ForbiddenException
    });

    it('throws ForbiddenException if user is not owner and not assigned', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ownerId: 'owner-1',
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        restaurantId: 'other-rest',
      });

      await expect(service.getSummary('rest-1', 'staff-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
