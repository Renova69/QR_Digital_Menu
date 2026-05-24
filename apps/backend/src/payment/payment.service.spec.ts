import { PaymentService } from './payment.service';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FeatureService } from '../subscription/feature.service';

describe('PaymentService', () => {
  let service: PaymentService;
  let mockPrisma: any;
  let mockStripeProvider: any;
  let mockEvents: any;

  beforeEach(() => {
    mockPrisma = {
      tableSession: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn(),
      },
      restaurantTable: {
        findFirst: jest.fn().mockResolvedValue({ id: 'table1', restaurantId: 'rest1' }),
        findUnique: jest.fn().mockResolvedValue({ name: 'T1' }),
      },
      restaurant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'rest1',
          ownerId: 'owner1',
          paymentsEnabled: true,
          stripeOnboarded: true,
          stripeAccountId: 'acct_123',
          platformFeePercent: 0.5,
          tipsEnabled: true,
          tipOptions: [5, 10, 15],
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ restaurantId: 'rest1', role: 'MANAGER' }),
      },
      payment: {
        aggregate: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        groupBy: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn(),
      },
      order: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn((arg: any) => {
        if (typeof arg === 'function') return arg(mockPrisma);
        return Promise.all(arg);
      }),
    };
    mockStripeProvider = {
      createPaymentIntent: jest.fn(),
      createRefund: jest.fn(),
      constructWebhookEvent: jest.fn(),
    };
    mockEvents = {
      emitToRestaurant: jest.fn(),
      emitTableStatusChanged: jest.fn(),
    };

    const mockFeatureService = { hasFeature: jest.fn().mockReturnValue(true) } as unknown as FeatureService;
    service = new PaymentService(mockPrisma, mockStripeProvider, mockEvents, mockFeatureService);
  });

  describe('getOrCreateSession', () => {
    it('returns existing OPEN session when valid token is provided', async () => {
      const existing = { id: 's1', token: 'tok1', status: 'OPEN' };
      mockPrisma.tableSession.findFirst.mockResolvedValue(existing);

      const result = await service.getOrCreateSession('table1', 'rest1', 'tok1');

      expect(result.session).toEqual(existing);
      expect(result.token).toBe('tok1');
      expect(mockPrisma.tableSession.create).not.toHaveBeenCalled();
    });

    it('creates a new session when no token is provided', async () => {
      const created = { id: 's2', token: 'tok2', status: 'OPEN' };
      mockPrisma.tableSession.create.mockResolvedValue(created);

      const result = await service.getOrCreateSession('table1', 'rest1', undefined);

      expect(mockPrisma.tableSession.create).toHaveBeenCalledWith({
        data: { tableId: 'table1', restaurantId: 'rest1' },
      });
      expect(result.token).toBe('tok2');
    });

    it('creates a new session when token does not match an OPEN session', async () => {
      const created = { id: 's3', token: 'tok3', status: 'OPEN' };
      mockPrisma.tableSession.findFirst.mockResolvedValue(null);
      mockPrisma.tableSession.create.mockResolvedValue(created);

      const result = await service.getOrCreateSession('table1', 'rest1', 'stale-token');

      expect(mockPrisma.tableSession.create).toHaveBeenCalled();
      expect(result.token).toBe('tok3');
    });
  });

  describe('getSessionBill', () => {
    it('returns bill info including subtotal and tip options', async () => {
      const session = {
        id: 's1',
        token: 'tok1',
        restaurantId: 'rest1',
        status: 'OPEN',
        restaurant: { tipsEnabled: true, tipOptions: [5, 10, 15] },
      };
      mockPrisma.tableSession.findFirst.mockResolvedValue(session);
      mockPrisma.order.findMany.mockResolvedValue([
        { totalPrice: 15.00, items: [] },
        { totalPrice: 8.50, items: [] },
      ]);

      const result = await service.getSessionBill('tok1');

      expect(result.subtotal).toBeCloseTo(23.5);
      expect(result.tipsEnabled).toBe(true);
      expect(result.tipOptions).toEqual([5, 10, 15]);
    });

    it('throws NotFoundException when session not found', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue(null);
      await expect(service.getSessionBill('bad-token')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createPaymentIntent', () => {
    it('throws ForbiddenException when paymentsEnabled is false', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        restaurant: { paymentsEnabled: false, stripeOnboarded: true, stripeAccountId: 'acct_1', platformFeePercent: 0.5, tipsEnabled: false, tipOptions: [], tier: 'PROFESSIONAL' },
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 20 }]);

      await expect(service.createPaymentIntent('tok1', 0)).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when stripeOnboarded is false', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        restaurant: { paymentsEnabled: true, stripeOnboarded: false, stripeAccountId: null, platformFeePercent: 0.5, tipsEnabled: false, tipOptions: [], tier: 'PROFESSIONAL' },
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 20 }]);

      await expect(service.createPaymentIntent('tok1', 0)).rejects.toThrow(BadRequestException);
    });

    it('calculates totals, creates Payment record, and returns clientSecret', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        restaurant: {
          paymentsEnabled: true,
          stripeOnboarded: true,
          stripeAccountId: 'acct_123',
          platformFeePercent: 0.5,
          tipsEnabled: true,
          tipOptions: [5, 10],
          tier: 'PROFESSIONAL',
        },
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 20.00 }]);
      mockPrisma.payment.create.mockResolvedValue({ id: 'pay1' });
      mockStripeProvider.createPaymentIntent.mockResolvedValue({
        clientSecret: 'cs_test',
        paymentIntentId: 'pi_test',
      });
      mockPrisma.payment.update.mockResolvedValue({});

      const result = await service.createPaymentIntent('tok1', 10); // 10% tip

      // subtotal = 20, tip = 2 (10%), total = 22
      expect(result.total).toBeCloseTo(22);
      expect(result.tipAmount).toBeCloseTo(2);
      expect(mockStripeProvider.createPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: 2200,
          currency: 'eur',
          restaurantStripeAccountId: 'acct_123',
          platformFeeCents: 11,
          idempotencyKey: 'pay1',
        }),
      );
      expect(result.clientSecret).toBe('cs_test');
    });

    it('throws BadRequestException when tipPercent is negative', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1', restaurantId: 'rest1', restaurant: {},
      });
      await expect(service.createPaymentIntent('tok1', -1)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when tipPercent exceeds 100', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1', restaurantId: 'rest1', restaurant: {},
      });
      await expect(service.createPaymentIntent('tok1', 101)).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException with FEATURE_LOCKED when tier does not include Stripe payments', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1', restaurantId: 'rest1',
        restaurant: { paymentsEnabled: true, tier: 'FREE', stripeOnboarded: true, stripeAccountId: 'acct_1', platformFeePercent: 0.5 },
      });
      const lockedFeatureService = { hasFeature: jest.fn().mockReturnValue(false) } as unknown as FeatureService;
      const lockedService = new PaymentService(mockPrisma, mockStripeProvider, mockEvents, lockedFeatureService);

      await expect(lockedService.createPaymentIntent('tok1', 0)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('handleWebhookEvent', () => {
    it('on payment_intent.succeeded: updates Payment + TableSession + emits socket event', async () => {
      mockStripeProvider.constructWebhookEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_test' } },
      });
      const payment = {
        id: 'pay1',
        amount: 45.50,
        tipAmount: 5.00,
        tableSessionId: 's1',
        tableSession: {
          restaurantId: 'rest1',
          tableId: 'table1',
          table: { name: '3' },
        },
      };
      mockPrisma.payment.findFirst.mockResolvedValue(payment);
      mockPrisma.payment.update.mockResolvedValue({});
      mockPrisma.tableSession.update.mockResolvedValue({});
      mockPrisma.restaurantTable.findUnique = jest.fn().mockResolvedValue({ name: '3' });
      mockPrisma.order.findFirst = jest.fn().mockResolvedValue({ customerName: 'Marco' });

      await service.handleWebhookEvent(Buffer.from('{}'), 'sig');

      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay1' },
        data: { status: 'SUCCEEDED', stripePaymentIntentId: 'pi_test' },
      });
      expect(mockPrisma.tableSession.updateMany).toHaveBeenCalledWith({
        where: { id: 's1', status: 'OPEN' },
        data: { status: 'PAID', paidAt: expect.any(Date) },
      });
      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        'rest1',
        'payment:confirmed',
        expect.objectContaining({
          paymentId: 'pay1',
          tableSessionId: 's1',
          amount: expect.any(Number),
          tipAmount: expect.any(Number),
        }),
      );
    });

    it('on payment_intent.payment_failed: updates Payment status to FAILED', async () => {
      mockStripeProvider.constructWebhookEvent.mockReturnValue({
        type: 'payment_intent.payment_failed',
        data: { object: { id: 'pi_test' } },
      });
      mockPrisma.payment.findFirst.mockResolvedValue({ id: 'pay1', tableSessionId: 's1', tableSession: { restaurantId: 'rest1' } });

      await service.handleWebhookEvent(Buffer.from('{}'), 'sig');

      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'pay1', status: 'PENDING' },
        data: { status: 'FAILED' },
      });
      expect(mockPrisma.tableSession.updateMany).not.toHaveBeenCalled();
    });

    it('silently returns when payment record not found for succeeded event', async () => {
      mockStripeProvider.constructWebhookEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_orphan' } },
      });
      mockPrisma.payment.findFirst.mockResolvedValue(null);

      await service.handleWebhookEvent(Buffer.from('{}'), 'sig');

      expect(mockPrisma.payment.update).not.toHaveBeenCalled();
      expect(mockPrisma.tableSession.updateMany).not.toHaveBeenCalled();
      expect(mockEvents.emitToRestaurant).not.toHaveBeenCalled();
    });
  });

  describe('closeSession', () => {
    it('sets session status to CLOSED_NO_PAYMENT', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({ id: 's1', status: 'OPEN', restaurantId: 'rest1' });
      mockPrisma.tableSession.update.mockResolvedValue({});

      await service.closeSession('tok1', 'rest1');

      expect(mockPrisma.tableSession.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { status: 'CLOSED_NO_PAYMENT' },
      });
      expect(mockEvents.emitTableStatusChanged).toHaveBeenCalledWith('rest1', undefined, 's1');
    });

    it('throws NotFoundException when session not found', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue(null);
      await expect(service.closeSession('bad-token', 'rest1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getTableSessions', () => {
    it('returns sessions wrapped with meta', async () => {
      const sessions = [
        { id: 's1', token: 'tok1', status: 'OPEN', tableId: 't1', restaurantId: 'rest1', createdAt: new Date() },
      ];
      mockPrisma.tableSession.findMany.mockResolvedValue(sessions);
      mockPrisma.tableSession.count.mockResolvedValue(1);

      const result = await service.getTableSessions('rest1');

      expect(result.data).toEqual(sessions);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 50 });
    });

    it('respects page and limit params', async () => {
      mockPrisma.tableSession.findMany.mockResolvedValue([]);
      mockPrisma.tableSession.count.mockResolvedValue(10);

      await service.getTableSessions('rest1', 2, 5);

      expect(mockPrisma.tableSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 }),
      );
    });
  });

  describe('getPaymentHistory', () => {
    it('returns paginated payment history with table number and customer name', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([
        {
          id: 'pay1',
          amount: 45.50,
          tipAmount: 5.00,
          platformFeeAmount: 0.23,
          currency: 'eur',
          status: 'SUCCEEDED',
          stripePaymentIntentId: 'pi_1',
          provider: 'STRIPE',
          createdAt: new Date('2026-05-08T14:22:00Z'),
          tableSessionId: 's1',
          tableSession: {
            table: { name: '3' },
            orders: [{ customerName: 'Marco' }],
          },
        },
      ]);
      mockPrisma.payment.count.mockResolvedValue(1);

      const result = await service.getPaymentHistory('rest1', {});

      expect(result.data[0].tableNumber).toBe('3');
      expect(result.data[0].customerName).toBe('Marco');
      expect(result.meta.total).toBe(1);
    });

    it('filters by status when provided', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.payment.count.mockResolvedValue(0);

      await service.getPaymentHistory('rest1', { status: 'FAILED' });

      expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { restaurantId: 'rest1', status: 'FAILED' },
        }),
      );
    });

    it('filters by date range when provided', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.payment.count.mockResolvedValue(0);

      await service.getPaymentHistory('rest1', {
        startDate: '2026-05-01',
        endDate: '2026-05-31',
      });

      const callArgs = mockPrisma.payment.findMany.mock.calls[0][0];
      expect(callArgs.where.createdAt.gte).toBeInstanceOf(Date);
      expect(callArgs.where.createdAt.lte).toBeInstanceOf(Date);
    });

    it('respects pagination with default page 1 limit 20', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.payment.count.mockResolvedValue(0);

      await service.getPaymentHistory('rest1', {});

      expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });
  });

  describe('getPaymentsOverview', () => {
    it('returns account data, metrics, status counts, and method totals', async () => {
      mockPrisma.payment.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 100 } })
        .mockResolvedValueOnce({ _sum: { tipAmount: 12 } })
        .mockResolvedValueOnce({ _sum: { platformFeeAmount: 4 } })
        .mockResolvedValueOnce({ _sum: { amount: 10 } });
      mockPrisma.payment.count
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(1);
      mockPrisma.payment.groupBy
        .mockResolvedValueOnce([{ status: 'SUCCEEDED', _count: 4 }])
        .mockResolvedValueOnce([{ provider: 'STRIPE', _sum: { amount: 100, platformFeeAmount: 4 }, _count: 4 }]);
      mockPrisma.payment.findFirst.mockResolvedValue({ createdAt: new Date('2026-05-24T10:00:00Z'), currency: 'eur' });

      const result = await service.getPaymentsOverview('rest1', 'owner1');

      expect(result.account.stripeAccountId).toBe('acct_123');
      expect(result.metrics.totalCollected).toBe(100);
      expect(result.metrics.averageTransaction).toBe(25);
      expect(result.metrics.netCollected).toBe(96);
      expect(result.methodTotals[0]).toEqual({ method: 'STRIPE', amount: 100, fees: 4, count: 4 });
    });
  });

  describe('getPaymentDetail', () => {
    it('returns a detailed payment with order items and breakdown', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: 'pay1',
        restaurantId: 'rest1',
        amount: 24,
        tipAmount: 4,
        platformFeeAmount: 1,
        currency: 'eur',
        status: 'SUCCEEDED',
        stripePaymentIntentId: 'pi_123',
        provider: 'STRIPE',
        createdAt: new Date('2026-05-24T10:00:00Z'),
        updatedAt: new Date('2026-05-24T10:01:00Z'),
        tableSessionId: 'sess1',
        tableSession: {
          createdAt: new Date('2026-05-24T09:45:00Z'),
          table: { id: 'table1', name: 'Table 3' },
          orders: [
            {
              id: 'order1',
              customerName: 'Maria',
              customerPhone: null,
              totalPrice: 20,
              status: 'SERVED',
              specialRequests: null,
              createdAt: new Date('2026-05-24T09:50:00Z'),
              items: [{ quantity: 2, selectedOptions: [], menuItem: { name: 'Soup', price: 10 } }],
            },
          ],
        },
      });

      const result = await service.getPaymentDetail('pay1', 'owner1');

      expect(result.table?.name).toBe('Table 3');
      expect(result.breakdown.net).toBe(23);
      expect(result.orders[0].items[0]).toEqual({ name: 'Soup', quantity: 2, unitPrice: 10, options: [] });
    });
  });

  describe('refundPayment', () => {
    const succeededPayload = {
      id: 'pay1',
      restaurantId: 'rest1',
      amount: 24,
      tipAmount: 4,
      platformFeeAmount: 1,
      currency: 'eur',
      status: 'SUCCEEDED',
      stripePaymentIntentId: 'pi_123',
      provider: 'STRIPE',
      createdAt: new Date('2026-05-24T10:00:00Z'),
      updatedAt: new Date('2026-05-24T10:01:00Z'),
      tableSessionId: 'sess1',
      tableSession: { table: { name: 'Table 3' } },
    };

    const refundedPayload = {
      ...succeededPayload,
      status: 'REFUNDED',
      updatedAt: new Date('2026-05-24T10:02:00Z'),
      tableSession: { table: { name: 'Table 3' }, orders: [{ customerName: 'Maria' }] },
    };

    it('creates a Stripe refund and marks the payment refunded', async () => {
      mockPrisma.payment.findUnique
        .mockResolvedValueOnce(succeededPayload)   // initial fetch
        .mockResolvedValueOnce(refundedPayload);   // post-update fetch
      mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
      mockStripeProvider.createRefund.mockResolvedValue({ refundId: 're_123', status: 'succeeded' });

      const result = await service.refundPayment('pay1', 'owner1', { reason: 'guest request' });

      expect(mockStripeProvider.createRefund).toHaveBeenCalledWith({
        paymentIntentId: 'pi_123',
        amountCents: 2400,
        reason: 'guest request',
      });
      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'pay1', status: 'SUCCEEDED' }, data: { status: 'REFUNDED' } }),
      );
      expect(result.payment.status).toBe('REFUNDED');
      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        'rest1',
        'payment:refunded',
        expect.objectContaining({ paymentId: 'pay1', refundId: 're_123' }),
      );
    });

    it('throws ConflictException when payment is already refunded (race condition)', async () => {
      mockPrisma.payment.findUnique.mockResolvedValueOnce(succeededPayload);
      mockPrisma.payment.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.refundPayment('pay1', 'owner1', {})).rejects.toThrow(ConflictException);
      expect(mockStripeProvider.createRefund).not.toHaveBeenCalled();
    });

    it('rejects MYPOS refunds with BadRequestException', async () => {
      mockPrisma.payment.findUnique.mockResolvedValueOnce({
        ...succeededPayload,
        provider: 'MYPOS',
        stripePaymentIntentId: null,
      });

      await expect(service.refundPayment('pay1', 'owner1', {})).rejects.toThrow(BadRequestException);
      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
    });

    it('rejects partial refunds', async () => {
      mockPrisma.payment.findUnique.mockResolvedValueOnce({
        ...succeededPayload,
        provider: 'CASH',
      });

      await expect(service.refundPayment('pay1', 'owner1', { amount: 10 })).rejects.toThrow(BadRequestException);
      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('closeSessionWithCard', () => {
    it('throws NotFoundException when session not found', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue(null);
      await expect(service.closeSessionWithCard('bad-tok', 'rest1')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when total amount is zero', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1', tableId: 'table1', restaurantId: 'rest1', orders: [],
      });
      await expect(service.closeSessionWithCard('tok1', 'rest1')).rejects.toThrow(BadRequestException);
    });

    it('creates MYPOS payment, closes session, emits events, returns amount', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1', tableId: 'table1', restaurantId: 'rest1',
        orders: [{ totalPrice: 20 }, { totalPrice: 5 }],
      });
      mockPrisma.payment.create.mockResolvedValue({ id: 'pay1' });

      const result = await service.closeSessionWithCard('tok1', 'rest1');

      expect(result.amount).toBeCloseTo(25);
      expect(mockPrisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amount: 25, status: 'SUCCEEDED', provider: 'MYPOS' }),
        }),
      );
      expect(mockEvents.emitTableStatusChanged).toHaveBeenCalled();
      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        'rest1', 'payment:confirmed', expect.objectContaining({ amount: 25 }),
      );
    });

    it('throws when session is already closed (race condition)', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1', tableId: 'table1', restaurantId: 'rest1',
        orders: [{ totalPrice: 30 }],
      });
      mockPrisma.tableSession.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.closeSessionWithCard('tok1', 'rest1')).rejects.toThrow('Session already closed');
    });
  });

  describe('closeSessionWithCash', () => {
    it('throws NotFoundException when session not found', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue(null);
      await expect(service.closeSessionWithCash('bad-tok', 'rest1')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when total amount is zero', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1', tableId: 'table1', restaurantId: 'rest1', orders: [],
      });
      await expect(service.closeSessionWithCash('tok1', 'rest1')).rejects.toThrow(BadRequestException);
    });

    it('creates CASH payment, closes session, emits events, returns amount', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1', tableId: 'table1', restaurantId: 'rest1',
        orders: [{ totalPrice: 15 }],
      });
      mockPrisma.payment.create.mockResolvedValue({ id: 'pay1' });

      const result = await service.closeSessionWithCash('tok1', 'rest1');

      expect(result.amount).toBeCloseTo(15);
      expect(mockPrisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amount: 15, status: 'SUCCEEDED', provider: 'CASH' }),
        }),
      );
      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        'rest1', 'payment:confirmed', expect.objectContaining({ amount: 15 }),
      );
    });
  });

  describe('forceOpenSession', () => {
    it('throws NotFoundException when table not found for this restaurant', async () => {
      mockPrisma.restaurantTable.findFirst.mockResolvedValue(null);
      await expect(service.forceOpenSession('table-1', 'rest1')).rejects.toThrow(NotFoundException);
    });

    it('closes existing OPEN session and creates new one', async () => {
      mockPrisma.restaurantTable.findFirst.mockResolvedValue({ id: 'table-1', restaurantId: 'rest1' });
      const existingSession = { id: 'old-session', tableId: 'table-1' };
      const newSession = { id: 'new-session', token: 'new-token', tableId: 'table-1' };
      mockPrisma.tableSession.findFirst.mockResolvedValue(existingSession);
      mockPrisma.tableSession.update.mockResolvedValue({});
      mockPrisma.tableSession.create.mockResolvedValue(newSession);

      const result = await service.forceOpenSession('table-1', 'rest1');

      expect(mockPrisma.tableSession.update).toHaveBeenCalledWith({
        where: { id: 'old-session' },
        data: { status: 'CLOSED_NO_PAYMENT' },
      });
      expect(result.token).toBe('new-token');
      expect(mockEvents.emitTableStatusChanged).toHaveBeenCalledTimes(2);
    });

    it('creates new session when no existing OPEN session', async () => {
      mockPrisma.restaurantTable.findFirst.mockResolvedValue({ id: 'table-1', restaurantId: 'rest1' });
      mockPrisma.tableSession.findFirst.mockResolvedValue(null);
      const newSession = { id: 'new-session', token: 'new-token', tableId: 'table-1' };
      mockPrisma.tableSession.create.mockResolvedValue(newSession);

      const result = await service.forceOpenSession('table-1', 'rest1');

      expect(mockPrisma.tableSession.update).not.toHaveBeenCalled();
      expect(result.token).toBe('new-token');
    });
  });
});
