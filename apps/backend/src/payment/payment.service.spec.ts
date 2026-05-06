import { PaymentService } from './payment.service';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';

describe('PaymentService', () => {
  let service: PaymentService;
  let mockPrisma: any;
  let mockStripeProvider: any;
  let mockEvents: any;

  beforeEach(() => {
    mockPrisma = {
      tableSession: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      payment: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      order: {
        findMany: jest.fn(),
      },
      restaurant: {
        findUnique: jest.fn(),
      },
    };
    mockStripeProvider = {
      createPaymentIntent: jest.fn(),
      constructWebhookEvent: jest.fn(),
    };
    mockEvents = {
      emitToRestaurant: jest.fn(),
    };

    service = new PaymentService(mockPrisma, mockStripeProvider, mockEvents);
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
        { totalPrice: 15.00 },
        { totalPrice: 8.50 },
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
        restaurant: { paymentsEnabled: false, stripeOnboarded: true, stripeAccountId: 'acct_1', platformFeePercent: 0.5, tipsEnabled: false, tipOptions: [] },
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 20 }]);

      await expect(service.createPaymentIntent('tok1', 0)).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when stripeOnboarded is false', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        restaurant: { paymentsEnabled: true, stripeOnboarded: false, stripeAccountId: null, platformFeePercent: 0.5, tipsEnabled: false, tipOptions: [] },
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
        }),
      );
      expect(result.clientSecret).toBe('cs_test');
    });
  });

  describe('handleWebhookEvent', () => {
    it('on payment_intent.succeeded: updates Payment + TableSession + emits socket event', async () => {
      mockStripeProvider.constructWebhookEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_test' } },
      });
      const payment = { id: 'pay1', tableSessionId: 's1', tableSession: { restaurantId: 'rest1' } };
      mockPrisma.payment.findFirst.mockResolvedValue(payment);
      mockPrisma.payment.update.mockResolvedValue({});
      mockPrisma.tableSession.update.mockResolvedValue({});

      await service.handleWebhookEvent(Buffer.from('{}'), 'sig');

      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay1' },
        data: { status: 'SUCCEEDED', stripePaymentIntentId: 'pi_test' },
      });
      expect(mockPrisma.tableSession.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { status: 'PAID', paidAt: expect.any(Date) },
      });
      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        'rest1',
        'payment:confirmed',
        expect.any(Object),
      );
    });

    it('on payment_intent.payment_failed: updates Payment status to FAILED', async () => {
      mockStripeProvider.constructWebhookEvent.mockReturnValue({
        type: 'payment_intent.payment_failed',
        data: { object: { id: 'pi_test' } },
      });
      mockPrisma.payment.findFirst.mockResolvedValue({ id: 'pay1', tableSessionId: 's1', tableSession: { restaurantId: 'rest1' } });
      mockPrisma.payment.update.mockResolvedValue({});

      await service.handleWebhookEvent(Buffer.from('{}'), 'sig');

      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay1' },
        data: { status: 'FAILED' },
      });
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
    });
  });
});
