import { PaymentService } from './payment.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { FeatureService } from '../subscription/feature.service';

describe('PaymentService', () => {
  let service: PaymentService;
  let mockPrisma: any;
  let mockStripeProvider: any;
  let mockEpayProvider: any;
  let mockBoricaProvider: any;
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
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'table1', restaurantId: 'rest1' }),
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
        findUnique: jest
          .fn()
          .mockResolvedValue({ restaurantId: 'rest1', role: 'MANAGER' }),
      },
      payment: {
        aggregate: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn(),
      },
      order: {
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn((arg: any) => {
        if (typeof arg === 'function') return arg(mockPrisma);
        return Promise.all(arg);
      }),
    };
    mockStripeProvider = {
      createPaymentIntent: jest.fn(),
      createRefund: jest.fn(),
      cancelPaymentIntent: jest.fn().mockResolvedValue(undefined),
      constructWebhookEvent: jest.fn(),
      retrievePaymentIntent: jest.fn().mockResolvedValue(null),
    };
    mockEpayProvider = {
      createCheckoutForm: jest.fn(),
      parseNotifications: jest.fn(),
      verifyChecksum: jest.fn(),
      formatNotificationResponses: jest.fn((responses) =>
        responses
          .map((response: any) => `INVOICE=${response.invoice}:STATUS=${response.status}`)
          .join('\n'),
      ),
    };
    mockBoricaProvider = {
      buildSaleForm: jest.fn().mockReturnValue({
        action: 'https://3dsgate-dev.borica.bg/cgi-bin/cgi_link',
        method: 'POST' as const,
        fields: { TERMINAL: 'V1800001', ORDER: '000001', P_SIGN: 'abc123' },
      }),
      verifyResult: jest.fn().mockReturnValue({
        verified: true,
        rc: '00',
        action: '0',
        rrn: '123456789012',
        intRef: 'INT001',
        approval: 'A12345',
      }),
      getActionUrl: jest.fn().mockReturnValue('https://3dsgate-dev.borica.bg/cgi-bin/cgi_link'),
      // Default: status check unavailable (null = outcome unknown, keep pending)
      queryTransactionStatus: jest.fn().mockResolvedValue(null),
    };
    mockEvents = {
      emitToRestaurant: jest.fn(),
      emitTableStatusChanged: jest.fn(),
    };

    const mockFeatureService = {
      hasFeature: jest.fn().mockReturnValue(true),
      getEffectiveTier: jest.fn().mockImplementation((tier: string) => tier),
      restaurantHasFeature: jest.fn(function (this: any, r: any, f: any) {
        return this.hasFeature(
          this.getEffectiveTier(r?.tier ?? 'FREE', r?.forceTier ?? null),
          f,
        );
      }),
    } as unknown as FeatureService;
    service = new PaymentService(
      mockPrisma,
      mockStripeProvider,
      mockEpayProvider,
      mockBoricaProvider,
      mockEvents,
      mockFeatureService,
    );
  });

  describe('getOrCreateSession', () => {
    it('returns existing OPEN session when valid token is provided', async () => {
      const existing = { id: 's1', token: 'tok1', status: 'OPEN' };
      mockPrisma.tableSession.findFirst.mockResolvedValue(existing);

      const result = await service.getOrCreateSession(
        'table1',
        'rest1',
        'tok1',
      );

      expect(result.session).toEqual(existing);
      expect(result.token).toBe('tok1');
      expect(mockPrisma.tableSession.create).not.toHaveBeenCalled();
    });

    it('scopes the token lookup by restaurantId (#H1)', async () => {
      const existing = { id: 's1', token: 'tok1', status: 'OPEN' };
      mockPrisma.tableSession.findFirst.mockResolvedValue(existing);

      await service.getOrCreateSession('table1', 'rest1', 'tok1');

      expect(mockPrisma.tableSession.findFirst).toHaveBeenCalledWith({
        where: { token: 'tok1', restaurantId: 'rest1', status: 'OPEN' },
      });
    });

    it('creates a new session when no token is provided', async () => {
      const created = { id: 's2', token: 'tok2', status: 'OPEN' };
      mockPrisma.tableSession.create.mockResolvedValue(created);

      const result = await service.getOrCreateSession(
        'table1',
        'rest1',
        undefined,
      );

      expect(mockPrisma.tableSession.create).toHaveBeenCalledWith({
        data: { tableId: 'table1', restaurantId: 'rest1' },
      });
      expect(result.token).toBe('tok2');
    });

    it('creates a new session when token does not match an OPEN session', async () => {
      const created = { id: 's3', token: 'tok3', status: 'OPEN' };
      mockPrisma.tableSession.findFirst.mockResolvedValue(null);
      mockPrisma.tableSession.create.mockResolvedValue(created);

      const result = await service.getOrCreateSession(
        'table1',
        'rest1',
        'stale-token',
      );

      expect(mockPrisma.tableSession.create).toHaveBeenCalled();
      expect(result.token).toBe('tok3');
    });

    it('returns the concurrently-created OPEN session when the unique index rejects duplicate create (#M2)', async () => {
      const existing = { id: 's-race', token: 'tok-race', status: 'OPEN' };
      mockPrisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
      mockPrisma.tableSession.findFirst.mockResolvedValueOnce(existing);

      const result = await service.getOrCreateSession(
        'table1',
        'rest1',
        undefined,
      );

      expect(result).toEqual({ session: existing, token: 'tok-race' });
      expect(mockPrisma.tableSession.findFirst).toHaveBeenCalledWith({
        where: { tableId: 'table1', restaurantId: 'rest1', status: 'OPEN' },
      });
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
        { totalPrice: 15.0, items: [] },
        { totalPrice: 8.5, items: [] },
      ]);

      const result = await service.getSessionBill('tok1');

      expect(result.subtotal).toBeCloseTo(23.5);
      expect(result.tipsEnabled).toBe(true);
      expect(result.tipOptions).toEqual([5, 10, 15]);
    });

    it('throws NotFoundException when session not found', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue(null);
      await expect(service.getSessionBill('bad-token')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createPaymentIntent', () => {
    it('throws ForbiddenException when paymentsEnabled is false', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        restaurant: {
          paymentsEnabled: false,
          stripeOnboarded: true,
          stripeAccountId: 'acct_1',
          platformFeePercent: 0.5,
          tipsEnabled: false,
          tipOptions: [],
          tier: 'PROFESSIONAL',
        },
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 20 }]);

      await expect(service.createPaymentIntent('tok1', 0)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws BadRequestException when stripeOnboarded is false', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        restaurant: {
          paymentsEnabled: true,
          stripeOnboarded: false,
          stripeAccountId: null,
          platformFeePercent: 0.5,
          tipsEnabled: false,
          tipOptions: [],
          tier: 'PROFESSIONAL',
        },
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 20 }]);

      await expect(service.createPaymentIntent('tok1', 0)).rejects.toThrow(
        BadRequestException,
      );
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
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 20.0 }]);
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

    it('marks the Payment FAILED and rethrows when Stripe createPaymentIntent fails (#H9)', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        restaurant: {
          paymentsEnabled: true,
          stripeOnboarded: true,
          stripeAccountId: 'acct_123',
          platformFeePercent: 0.5,
          tipsEnabled: true,
          tipOptions: [],
          tier: 'PROFESSIONAL',
        },
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 20 }]);
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.payment.create.mockResolvedValue({ id: 'pay-fail' });
      mockStripeProvider.createPaymentIntent.mockRejectedValue(
        new Error('stripe down'),
      );
      mockPrisma.payment.update.mockResolvedValue({});

      await expect(service.createPaymentIntent('tok1', 0)).rejects.toThrow(
        'stripe down',
      );
      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-fail' },
        data: { status: 'FAILED' },
      });
    });

    it('rejects when the session already has a SUCCEEDED payment (#H1)', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        restaurant: {
          paymentsEnabled: true,
          stripeOnboarded: true,
          stripeAccountId: 'acct_123',
          platformFeePercent: 0.5,
          tipsEnabled: true,
          tipOptions: [],
          tier: 'PROFESSIONAL',
        },
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 20 }]);
      mockPrisma.payment.findMany.mockResolvedValue([
        { id: 'old', status: 'SUCCEEDED' },
      ]);

      await expect(service.createPaymentIntent('tok1', 0)).rejects.toThrow(
        ConflictException,
      );
      expect(mockStripeProvider.createPaymentIntent).not.toHaveBeenCalled();
    });

    it('cancels a stale PENDING intent before creating a new one (#H1)', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        restaurant: {
          paymentsEnabled: true,
          stripeOnboarded: true,
          stripeAccountId: 'acct_123',
          platformFeePercent: 0.5,
          tipsEnabled: true,
          tipOptions: [],
          tier: 'PROFESSIONAL',
        },
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 20 }]);
      mockPrisma.payment.findMany.mockResolvedValue([
        { id: 'stale', status: 'PENDING', stripePaymentIntentId: 'pi_stale' },
      ]);
      mockPrisma.payment.create.mockResolvedValue({ id: 'pay2' });
      mockStripeProvider.createPaymentIntent.mockResolvedValue({
        clientSecret: 'cs',
        paymentIntentId: 'pi_new',
      });
      mockPrisma.payment.update.mockResolvedValue({});

      await service.createPaymentIntent('tok1', 0);

      expect(mockStripeProvider.cancelPaymentIntent).toHaveBeenCalledWith(
        'pi_stale',
      );
      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'stale', status: 'PENDING' },
        data: { status: 'ABANDONED', providerStatus: 'ABANDONED' },
      });
      expect(mockStripeProvider.createPaymentIntent).toHaveBeenCalled();
    });

    it('refuses to create a new intent when cancelling the stale one fails (#H1)', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        restaurant: {
          paymentsEnabled: true,
          stripeOnboarded: true,
          stripeAccountId: 'acct_123',
          platformFeePercent: 0.5,
          tipsEnabled: true,
          tipOptions: [],
          tier: 'PROFESSIONAL',
        },
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 20 }]);
      mockPrisma.payment.findMany.mockResolvedValue([
        { id: 'stale', status: 'PENDING', stripePaymentIntentId: 'pi_stale' },
      ]);
      mockStripeProvider.cancelPaymentIntent.mockRejectedValue(
        new Error('already succeeded'),
      );

      await expect(service.createPaymentIntent('tok1', 0)).rejects.toThrow(
        ConflictException,
      );
      expect(mockStripeProvider.createPaymentIntent).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when tipPercent is negative', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        restaurant: {},
      });
      await expect(service.createPaymentIntent('tok1', -1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when tipPercent exceeds 100', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        restaurant: {},
      });
      await expect(service.createPaymentIntent('tok1', 101)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws ForbiddenException with FEATURE_LOCKED when tier does not include Stripe payments', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        restaurant: {
          paymentsEnabled: true,
          tier: 'FREE',
          stripeOnboarded: true,
          stripeAccountId: 'acct_1',
          platformFeePercent: 0.5,
        },
      });
      const lockedFeatureService = {
        hasFeature: jest.fn().mockReturnValue(false),
        getEffectiveTier: jest.fn().mockImplementation((tier: string) => tier),
        restaurantHasFeature: jest.fn(function (this: any, r: any, f: any) {
          return this.hasFeature(
            this.getEffectiveTier(r?.tier ?? 'FREE', r?.forceTier ?? null),
            f,
          );
        }),
      } as unknown as FeatureService;
      const lockedService = new PaymentService(
        mockPrisma,
        mockStripeProvider,
        mockEpayProvider,
        mockBoricaProvider,
        mockEvents,
        lockedFeatureService,
      );

      await expect(
        lockedService.createPaymentIntent('tok1', 0),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('createCheckout with ePay.bg', () => {
    const epayRestaurant = {
      paymentsEnabled: true,
      stripeOnboarded: false,
      stripeAccountId: null,
      platformFeePercent: 0.5,
      tipsEnabled: true,
      tipOptions: [5, 10],
      tier: 'PROFESSIONAL',
      epayEnabled: true,
      epayMode: 'DEMO',
      epayClientId: '1000000000',
      epayMerchantEmail: 'merchant@example.com',
      epaySecretEncrypted: 'secret-word',
      epayPage: 'credit_paydirect',
    };

    it('creates a pending EPAY payment and returns hosted form fields', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        table: { name: '7' },
        restaurant: epayRestaurant,
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 20 }]);
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.payment.create.mockResolvedValue({ id: 'pay-epay' });
      mockPrisma.payment.update.mockResolvedValue({});
      mockEpayProvider.createCheckoutForm.mockReturnValue({
        action: 'https://demo.epay.bg/',
        method: 'POST',
        fields: {
          PAGE: 'credit_paydirect',
          LANG: 'bg',
          ENCODED: 'encoded',
          CHECKSUM: 'checksum',
          URL_OK: 'http://localhost:3001/menu/public/rest1?payment=epay-ok',
          URL_CANCEL:
            'http://localhost:3001/menu/public/rest1?payment=epay-cancel',
        },
      });

      const result = await service.createCheckout('tok1', 'EPAY', 10);

      expect(result).toEqual(
        expect.objectContaining({
          provider: 'EPAY',
          paymentId: 'pay-epay',
          total: 22,
          tipAmount: 2,
          action: 'https://demo.epay.bg/',
        }),
      );
      expect(mockPrisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          provider: 'EPAY',
          providerStatus: 'PENDING',
          providerReference: expect.any(String),
          amount: 22,
          tipAmount: 2,
        }),
      });
      expect(mockEpayProvider.createCheckoutForm).toHaveBeenCalledWith(
        expect.objectContaining({
          min: '1000000000',
          email: 'merchant@example.com',
          secret: 'secret-word',
          amount: 22,
          currency: 'EUR',
          page: 'credit_paydirect',
        }),
      );
    });
  });

  describe('handleEpayNotification', () => {
    const notification = { invoice: '123456', status: 'PAID' as const };
    const epayPayment = {
      id: 'pay-epay',
      restaurantId: 'rest1',
      tableSessionId: 's1',
      amount: 22,
      tipAmount: 2,
      status: 'PENDING',
      providerReference: '123456',
      providerPayload: {},
      restaurant: { epaySecretEncrypted: 'secret-word' },
      tableSession: {
        id: 's1',
        restaurantId: 'rest1',
        tableId: 'table1',
        table: { name: '7' },
      },
    };

    beforeEach(() => {
      mockEpayProvider.parseNotifications.mockReturnValue([notification]);
      mockEpayProvider.verifyChecksum.mockReturnValue(true);
    });

    it('returns ERR when checksum verification fails', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([epayPayment]);
      mockEpayProvider.verifyChecksum.mockReturnValue(false);

      const result = await service.handleEpayNotification({
        ENCODED: 'encoded',
        CHECKSUM: 'bad',
      });

      expect(result).toBe('ERR=invalid CHECKSUM');
      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
    });

    it('returns STATUS=NO for unknown invoices', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);

      const result = await service.handleEpayNotification({
        ENCODED: 'encoded',
        CHECKSUM: 'checksum',
      });

      expect(result).toBe('INVOICE=123456:STATUS=NO');
    });

    it('marks PAID notifications succeeded and emits once', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([epayPayment]);
      mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.tableSession.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.order.findFirst.mockResolvedValue({ customerName: 'Maria' });

      const result = await service.handleEpayNotification({
        ENCODED: 'encoded',
        CHECKSUM: 'checksum',
      });

      expect(result).toBe('INVOICE=123456:STATUS=OK');
      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'pay-epay', status: { in: ['PENDING', 'ABANDONED'] } },
        data: expect.objectContaining({
          status: 'SUCCEEDED',
          providerStatus: 'PAID',
        }),
      });
      expect(mockPrisma.tableSession.updateMany).toHaveBeenCalledWith({
        where: {
          id: 's1',
          status: 'OPEN',
          payments: {
            some: {
              id: 'pay-epay',
              status: { in: ['PENDING', 'ABANDONED'] },
            },
          },
        },
        data: { status: 'PAID', paidAt: expect.any(Date) },
      });
      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        'rest1',
        'payment:confirmed',
        expect.objectContaining({
          paymentId: 'pay-epay',
          tableSessionId: 's1',
          amount: 22,
          tipAmount: 2,
          customerName: 'Maria',
        }),
      );
    });

    it('treats duplicate PAID notifications as OK without double-emitting', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([
        { ...epayPayment, status: 'SUCCEEDED' },
      ]);

      const result = await service.handleEpayNotification({
        ENCODED: 'encoded',
        CHECKSUM: 'checksum',
      });

      expect(result).toBe('INVOICE=123456:STATUS=OK');
      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.tableSession.updateMany).not.toHaveBeenCalled();
      expect(mockEvents.emitToRestaurant).not.toHaveBeenCalled();
      expect(mockEvents.emitTableStatusChanged).not.toHaveBeenCalled();
    });

    it('ignores a stale PAID notification when the session is already paid by another provider', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([epayPayment]);
      mockPrisma.tableSession.updateMany.mockResolvedValueOnce({ count: 0 });

      const result = await service.handleEpayNotification({
        ENCODED: 'encoded',
        CHECKSUM: 'checksum',
      });

      expect(result).toBe('INVOICE=123456:STATUS=OK');
      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
      expect(mockEvents.emitToRestaurant).not.toHaveBeenCalled();
      expect(mockEvents.emitTableStatusChanged).not.toHaveBeenCalled();
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
        amount: 45.5,
        tipAmount: 5.0,
        status: 'PENDING',
        tableSessionId: 's1',
        tableSession: {
          restaurantId: 'rest1',
          tableId: 'table1',
          table: { name: '3' },
        },
      };
      mockPrisma.payment.findFirst.mockResolvedValue(payment);
      mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.tableSession.update.mockResolvedValue({});
      mockPrisma.restaurantTable.findUnique = jest
        .fn()
        .mockResolvedValue({ name: '3' });
      mockPrisma.order.findFirst = jest
        .fn()
        .mockResolvedValue({ customerName: 'Marco' });

      await service.handleWebhookEvent(Buffer.from('{}'), 'sig');

      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'pay1', status: { in: ['PENDING', 'ABANDONED'] } },
        data: { status: 'SUCCEEDED', stripePaymentIntentId: 'pi_test' },
      });
      expect(mockPrisma.tableSession.updateMany).toHaveBeenCalledWith({
        where: {
          id: 's1',
          status: 'OPEN',
          payments: {
            some: {
              id: 'pay1',
              status: { in: ['PENDING', 'ABANDONED'] },
            },
          },
        },
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

    it('is idempotent: a double-delivered succeeded event skips socket emission (#H3)', async () => {
      mockStripeProvider.constructWebhookEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_test' } },
      });
      const payment = {
        id: 'pay1',
        amount: 45.5,
        tipAmount: 5,
        status: 'SUCCEEDED',
        tableSessionId: 's1',
        tableSession: {
          restaurantId: 'rest1',
          tableId: 'table1',
          table: { name: '3' },
        },
      };
      mockPrisma.payment.findFirst.mockResolvedValue(payment);
      await service.handleWebhookEvent(Buffer.from('{}'), 'sig');

      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.tableSession.updateMany).not.toHaveBeenCalled();
      expect(mockEvents.emitToRestaurant).not.toHaveBeenCalled();
      expect(mockEvents.emitTableStatusChanged).not.toHaveBeenCalled();
    });

    it('falls back to claiming by payment id when intent id not yet stored (#H3)', async () => {
      mockStripeProvider.constructWebhookEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_test', metadata: { paymentId: 'pay1' } } },
      });
      const payment = {
        id: 'pay1',
        amount: 45.5,
        tipAmount: 5,
        status: 'PENDING',
        tableSessionId: 's1',
        tableSession: {
          restaurantId: 'rest1',
          tableId: 'table1',
          table: { name: '3' },
        },
      };
      mockPrisma.payment.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(payment);
      mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.restaurantTable.findUnique = jest
        .fn()
        .mockResolvedValue({ name: '3' });
      mockPrisma.order.findFirst = jest
        .fn()
        .mockResolvedValue({ customerName: 'Marco' });

      await service.handleWebhookEvent(Buffer.from('{}'), 'sig');

      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'pay1', status: { in: ['PENDING', 'ABANDONED'] } },
        data: { status: 'SUCCEEDED', stripePaymentIntentId: 'pi_test' },
      });
      expect(mockPrisma.tableSession.updateMany).toHaveBeenCalled();
      expect(mockEvents.emitToRestaurant).toHaveBeenCalled();
    });

    it('ignores a stale succeeded event when another provider already paid the session', async () => {
      mockStripeProvider.constructWebhookEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_old' } },
      });
      const payment = {
        id: 'pay-old',
        amount: 45.5,
        tipAmount: 5,
        status: 'PENDING',
        tableSessionId: 's1',
        tableSession: {
          restaurantId: 'rest1',
          tableId: 'table1',
          table: { name: '3' },
        },
      };
      mockPrisma.payment.findFirst.mockResolvedValue(payment);
      mockPrisma.tableSession.updateMany.mockResolvedValueOnce({ count: 0 });

      await service.handleWebhookEvent(Buffer.from('{}'), 'sig');

      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
      expect(mockEvents.emitToRestaurant).not.toHaveBeenCalled();
      expect(mockEvents.emitTableStatusChanged).not.toHaveBeenCalled();
    });

    it('on payment_intent.payment_failed: updates Payment status to FAILED', async () => {
      mockStripeProvider.constructWebhookEvent.mockReturnValue({
        type: 'payment_intent.payment_failed',
        data: { object: { id: 'pi_test' } },
      });
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: 'pay1',
        tableSessionId: 's1',
        tableSession: { restaurantId: 'rest1' },
      });

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

      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.tableSession.updateMany).not.toHaveBeenCalled();
      expect(mockEvents.emitToRestaurant).not.toHaveBeenCalled();
    });
  });

  describe('createPaymentIntent — idempotency (Issue 35)', () => {
    const makeSession = () => ({
      id: 'sess-1',
      restaurantId: 'rest1',
      status: 'OPEN',
      restaurant: {
        paymentsEnabled: true,
        stripeOnboarded: true,
        stripeAccountId: 'acct_123',
        platformFeePercent: 0,
        tipsEnabled: false,
        tipOptions: [],
        tier: 'PROFESSIONAL',
        forceTier: null,
      },
    });

    beforeEach(() => {
      mockPrisma.tableSession.findFirst.mockResolvedValue(makeSession());
      mockPrisma.order.findMany.mockResolvedValue([
        { totalPrice: 20, tipAmount: 0, platformFeeAmount: 0 },
      ]);
    });

    it('returns existing PENDING Stripe intent when amount matches (no new Stripe call)', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([
        {
          id: 'pay-existing',
          provider: 'STRIPE',
          status: 'PENDING',
          stripePaymentIntentId: 'pi_existing',
          amount: 20,
        },
      ]);
      mockStripeProvider.retrievePaymentIntent.mockResolvedValue({
        clientSecret: 'cs_existing',
      });

      const result = await service.createPaymentIntent('tok1', 0);

      expect(result.clientSecret).toBe('cs_existing');
      expect(result.paymentId).toBe('pay-existing');
      expect(mockStripeProvider.createPaymentIntent).not.toHaveBeenCalled();
    });

    it('creates new intent when no PENDING Stripe intent exists', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.payment.create.mockResolvedValue({ id: 'pay-new' });
      mockStripeProvider.createPaymentIntent.mockResolvedValue({
        clientSecret: 'cs_new',
        paymentIntentId: 'pi_new',
      });
      mockPrisma.payment.update.mockResolvedValue({});

      const result = await service.createPaymentIntent('tok1', 0);

      expect(mockStripeProvider.createPaymentIntent).toHaveBeenCalledTimes(1);
      expect(result.clientSecret).toBe('cs_new');
    });
  });

  describe('closeSession', () => {
    it('sets session status to CLOSED_NO_PAYMENT', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        status: 'OPEN',
        restaurantId: 'rest1',
      });
      mockPrisma.tableSession.update.mockResolvedValue({});

      await service.closeSession('tok1', 'rest1', 'owner1');

      expect(mockPrisma.tableSession.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { status: 'CLOSED_NO_PAYMENT' },
      });
      expect(mockEvents.emitTableStatusChanged).toHaveBeenCalledWith(
        'rest1',
        undefined,
        's1',
      );
    });

    it('throws NotFoundException when session not found', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue(null);
      await expect(
        service.closeSession('bad-token', 'rest1', 'owner1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('denies a caller not associated with the restaurant (#3)', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ownerId: 'someone-else',
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        restaurantId: 'other-rest',
        role: 'WAITER',
      });

      await expect(
        service.closeSession('tok1', 'rest1', 'intruder'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.tableSession.update).not.toHaveBeenCalled();
    });

    it('denies KITCHEN and STAFF roles even when assigned to the restaurant', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ownerId: 'someone-else',
      });
      for (const role of ['KITCHEN', 'STAFF']) {
        mockPrisma.user.findUnique.mockResolvedValue({
          restaurantId: 'rest1',
          role,
        });
        await expect(
          service.closeSession('tok1', 'rest1', 'u-' + role),
        ).rejects.toThrow(ForbiddenException);
      }
      expect(mockPrisma.tableSession.update).not.toHaveBeenCalled();
    });

    it('allows a WAITER assigned to the restaurant', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ownerId: 'someone-else',
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        restaurantId: 'rest1',
        role: 'WAITER',
      });
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        status: 'OPEN',
        restaurantId: 'rest1',
      });
      mockPrisma.tableSession.update.mockResolvedValue({});

      await service.closeSession('tok1', 'rest1', 'waiter-1');

      expect(mockPrisma.tableSession.update).toHaveBeenCalled();
    });
  });

  describe('getTableSessions', () => {
    it('returns sessions wrapped with meta', async () => {
      const sessions = [
        {
          id: 's1',
          token: 'tok1',
          status: 'OPEN',
          tableId: 't1',
          restaurantId: 'rest1',
          createdAt: new Date(),
        },
      ];
      mockPrisma.tableSession.findMany.mockResolvedValue(sessions);
      mockPrisma.tableSession.count.mockResolvedValue(1);

      const result = await service.getTableSessions(
        'rest1',
        undefined,
        undefined,
        'owner1',
      );

      expect(result.data).toEqual(sessions);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 50 });
    });

    it('respects page and limit params', async () => {
      mockPrisma.tableSession.findMany.mockResolvedValue([]);
      mockPrisma.tableSession.count.mockResolvedValue(10);

      await service.getTableSessions('rest1', 2, 5, 'owner1');

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
          amount: 45.5,
          tipAmount: 5.0,
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

      const result = await service.getPaymentHistory('rest1', {}, 'owner1');

      expect(result.data[0].tableNumber).toBe('3');
      expect(result.data[0].customerName).toBe('Marco');
      expect(result.meta.total).toBe(1);
    });

    it('filters by status when provided', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.payment.count.mockResolvedValue(0);

      await service.getPaymentHistory('rest1', { status: 'FAILED' }, 'owner1');

      expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { restaurantId: 'rest1', status: 'FAILED' },
        }),
      );
    });

    it('filters by date range when provided', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.payment.count.mockResolvedValue(0);

      await service.getPaymentHistory(
        'rest1',
        {
          startDate: '2026-05-01',
          endDate: '2026-05-31',
        },
        'owner1',
      );

      const callArgs = mockPrisma.payment.findMany.mock.calls[0][0];
      expect(callArgs.where.createdAt.gte).toBeInstanceOf(Date);
      expect(callArgs.where.createdAt.lte).toBeInstanceOf(Date);
    });

    it('respects pagination with default page 1 limit 20', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.payment.count.mockResolvedValue(0);

      await service.getPaymentHistory('rest1', {}, 'owner1');

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
        .mockResolvedValueOnce([
          {
            provider: 'STRIPE',
            _sum: { amount: 100, platformFeeAmount: 4 },
            _count: 4,
          },
        ]);
      mockPrisma.payment.findFirst.mockResolvedValue({
        createdAt: new Date('2026-05-24T10:00:00Z'),
        currency: 'eur',
      });

      const result = await service.getPaymentsOverview('rest1', 'owner1');

      expect(result.account.stripeAccountId).toBe('acct_123');
      expect(result.metrics.totalCollected).toBe(100);
      expect(result.metrics.averageTransaction).toBe(25);
      expect(result.metrics.netCollected).toBe(96);
      expect(result.methodTotals[0]).toEqual({
        method: 'STRIPE',
        amount: 100,
        fees: 4,
        count: 4,
      });
      expect(mockPrisma.payment.groupBy).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: { restaurantId: 'rest1', status: { not: 'ABANDONED' } },
        }),
      );
      expect(mockPrisma.payment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { restaurantId: 'rest1', status: { not: 'ABANDONED' } },
        }),
      );
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
              items: [
                {
                  quantity: 2,
                  selectedOptions: [],
                  menuItem: { name: 'Soup', price: 10 },
                },
              ],
            },
          ],
        },
      });

      const result = await service.getPaymentDetail('pay1', 'owner1');

      expect(result.table?.name).toBe('Table 3');
      expect(result.breakdown.net).toBe(23);
      expect(result.orders[0].items[0]).toEqual({
        name: 'Soup',
        quantity: 2,
        unitPrice: 10,
        options: [],
      });
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
      tableSession: {
        table: { name: 'Table 3' },
        orders: [{ customerName: 'Maria' }],
      },
    };

    it('creates a Stripe refund and marks the payment refunded', async () => {
      mockPrisma.payment.findUnique
        .mockResolvedValueOnce(succeededPayload) // initial fetch
        .mockResolvedValueOnce(refundedPayload); // post-update fetch
      mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
      mockStripeProvider.createRefund.mockResolvedValue({
        refundId: 're_123',
        status: 'succeeded',
      });

      const result = await service.refundPayment('pay1', 'owner1', {
        reason: 'guest request',
      });

      expect(mockStripeProvider.createRefund).toHaveBeenCalledWith({
        paymentIntentId: 'pi_123',
        amountCents: 2400,
        reason: 'guest request',
      });
      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pay1', status: 'SUCCEEDED' },
          data: { status: 'REFUNDED' },
        }),
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

      await expect(service.refundPayment('pay1', 'owner1', {})).rejects.toThrow(
        ConflictException,
      );
      expect(mockStripeProvider.createRefund).not.toHaveBeenCalled();
    });

    it('rejects MYPOS refunds with BadRequestException', async () => {
      mockPrisma.payment.findUnique.mockResolvedValueOnce({
        ...succeededPayload,
        provider: 'MYPOS',
        stripePaymentIntentId: null,
      });

      await expect(service.refundPayment('pay1', 'owner1', {})).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
    });

    it('rejects CASH refunds with BadRequestException (#C4)', async () => {
      mockPrisma.payment.findUnique.mockResolvedValueOnce({
        ...succeededPayload,
        provider: 'CASH',
        stripePaymentIntentId: null,
      });

      await expect(service.refundPayment('pay1', 'owner1', {})).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
      expect(mockStripeProvider.createRefund).not.toHaveBeenCalled();
    });

    it('rejects EPAY refunds with BadRequestException', async () => {
      mockPrisma.payment.findUnique.mockResolvedValueOnce({
        ...succeededPayload,
        provider: 'EPAY',
        stripePaymentIntentId: null,
      });

      await expect(service.refundPayment('pay1', 'owner1', {})).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
      expect(mockStripeProvider.createRefund).not.toHaveBeenCalled();
    });

    it('rejects partial refunds', async () => {
      mockPrisma.payment.findUnique.mockResolvedValueOnce({
        ...succeededPayload,
        provider: 'CASH',
      });

      await expect(
        service.refundPayment('pay1', 'owner1', { amount: 10 }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
    });

    it('rolls back to SUCCEEDED when a Stripe payment has no payment intent after refund claim (#M1)', async () => {
      mockPrisma.payment.findUnique.mockResolvedValueOnce({
        ...succeededPayload,
        stripePaymentIntentId: null,
      });
      mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.refundPayment('pay1', 'owner1', {})).rejects.toThrow(
        BadRequestException,
      );

      expect(mockPrisma.payment.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 'pay1', status: 'SUCCEEDED' },
        data: { status: 'REFUNDED' },
      });
      expect(mockPrisma.payment.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: 'pay1', status: 'REFUNDED' },
        data: { status: 'SUCCEEDED' },
      });
    });

    it('rolls back to SUCCEEDED when Stripe refund creation fails (#M1)', async () => {
      mockPrisma.payment.findUnique.mockResolvedValueOnce(succeededPayload);
      mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
      mockStripeProvider.createRefund.mockRejectedValue(
        new Error('stripe refund failed'),
      );

      await expect(service.refundPayment('pay1', 'owner1', {})).rejects.toThrow(
        'stripe refund failed',
      );

      expect(mockPrisma.payment.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 'pay1', status: 'SUCCEEDED' },
        data: { status: 'REFUNDED' },
      });
      expect(mockPrisma.payment.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: 'pay1', status: 'REFUNDED' },
        data: { status: 'SUCCEEDED' },
      });
    });
  });

  describe('closeSessionWithCard', () => {
    it('throws NotFoundException when session not found', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue(null);
      await expect(
        service.closeSessionWithCard('bad-tok', 'rest1', 'owner1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when total amount is zero', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        tableId: 'table1',
        restaurantId: 'rest1',
        orders: [],
      });
      await expect(
        service.closeSessionWithCard('tok1', 'rest1', 'owner1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates MYPOS payment, closes session, emits events, returns amount', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        tableId: 'table1',
        restaurantId: 'rest1',
        orders: [{ totalPrice: 20 }, { totalPrice: 5 }],
      });
      mockPrisma.payment.create.mockResolvedValue({ id: 'pay1' });

      const result = await service.closeSessionWithCard(
        'tok1',
        'rest1',
        'owner1',
      );

      expect(result.amount).toBeCloseTo(25);
      expect(mockPrisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: 25,
            status: 'SUCCEEDED',
            provider: 'MYPOS',
          }),
        }),
      );
      expect(mockEvents.emitTableStatusChanged).toHaveBeenCalled();
      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        'rest1',
        'payment:confirmed',
        expect.objectContaining({ amount: 25 }),
      );
    });

    it('throws when session is already closed (race condition)', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        tableId: 'table1',
        restaurantId: 'rest1',
        orders: [{ totalPrice: 30 }],
      });
      mockPrisma.tableSession.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.closeSessionWithCard('tok1', 'rest1', 'owner1'),
      ).rejects.toThrow('Session already closed');
    });
  });

  describe('closeSessionWithCash', () => {
    it('throws NotFoundException when session not found', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue(null);
      await expect(
        service.closeSessionWithCash('bad-tok', 'rest1', 'owner1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when total amount is zero', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        tableId: 'table1',
        restaurantId: 'rest1',
        orders: [],
      });
      await expect(
        service.closeSessionWithCash('tok1', 'rest1', 'owner1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates CASH payment, closes session, emits events, returns amount', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        tableId: 'table1',
        restaurantId: 'rest1',
        orders: [{ totalPrice: 15 }],
      });
      mockPrisma.payment.create.mockResolvedValue({ id: 'pay1' });

      const result = await service.closeSessionWithCash(
        'tok1',
        'rest1',
        'owner1',
      );

      expect(result.amount).toBeCloseTo(15);
      expect(mockPrisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: 15,
            status: 'SUCCEEDED',
            provider: 'CASH',
          }),
        }),
      );
      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        'rest1',
        'payment:confirmed',
        expect.objectContaining({ amount: 15 }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // BORICA checkout
  // ---------------------------------------------------------------------------
  describe('createCheckout with BORICA', () => {
    const boricaRestaurant = {
      paymentsEnabled: true,
      stripeOnboarded: false,
      stripeAccountId: null,
      platformFeePercent: 0,
      tipsEnabled: false,
      tipOptions: [],
      tier: 'PROFESSIONAL',
      boricaEnabled: true,
      boricaMode: 'DEMO',
      boricaTerminalId: null,
      boricaMerchantId: null,
      boricaMerchantName: 'Test',
      boricaPrivateKeyEncrypted: null,
      boricaPublicCert: null,
      boricaCurrency: 'EUR',
    };
    const boricaCardholder = {
      cardholderName: 'Maria Petrova',
      email: 'maria@example.com',
      phone: '+359893999888',
      billingAddress: '1 Vitosha Blvd',
    };

    beforeEach(() => {
      process.env.BORICA_TEST_TID = 'V1800001';
      process.env.BORICA_TEST_MID = '1600000001';
      process.env.BORICA_TEST_PRIVATE_KEY = 'test-pem';
      process.env.BORICA_TEST_CERT = 'test-cert';
      process.env.BACKEND_URL = 'https://api.example.com';
    });

    afterEach(() => {
      delete process.env.BORICA_TEST_TID;
      delete process.env.BORICA_TEST_MID;
      delete process.env.BORICA_TEST_PRIVATE_KEY;
      delete process.env.BORICA_TEST_CERT;
      delete process.env.BACKEND_URL;
    });

    it('creates a pending BORICA payment and returns hosted form fields', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        table: { name: '5' },
        restaurant: boricaRestaurant,
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 20 }]);
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.payment.create.mockResolvedValue({ id: 'pay-borica' });

      const result = await service.createCheckout('tok1', 'BORICA', 0, boricaCardholder);

      expect(result).toEqual(
        expect.objectContaining({
          provider: 'BORICA',
          paymentId: 'pay-borica',
          total: 20,
          action: 'https://3dsgate-dev.borica.bg/cgi-bin/cgi_link',
        }),
      );
      expect(mockBoricaProvider.buildSaleForm).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: 'EUR',
          amount: 20,
          backref: 'https://api.example.com/api/v1/payments/borica/callback',
          email: 'maria@example.com',
          cardholder: boricaCardholder,
        }),
      );
      expect(mockPrisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          provider: 'BORICA',
          status: 'PENDING',
          currency: 'eur',
          amount: 20,
        }),
      });
    });

    it('always sends currency EUR regardless of boricaCurrency setting (#9)', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        table: null,
        restaurant: { ...boricaRestaurant, boricaCurrency: 'BGN' },
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 10 }]);
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.payment.create.mockResolvedValue({ id: 'pay-bgn' });

      await service.createCheckout('tok1', 'BORICA', 0, boricaCardholder);

      expect(mockBoricaProvider.buildSaleForm).toHaveBeenCalledWith(
        expect.objectContaining({ currency: 'EUR' }),
      );
    });

    it('throws BadRequestException when BACKEND_URL is missing (#10)', async () => {
      delete process.env.BACKEND_URL;
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        table: null,
        restaurant: boricaRestaurant,
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 10 }]);
      mockPrisma.payment.findMany.mockResolvedValue([]);

      await expect(service.createCheckout('tok1', 'BORICA', 0, boricaCardholder)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.payment.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException and creates no row when buildSaleForm throws (#8)', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        table: null,
        restaurant: boricaRestaurant,
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 10 }]);
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockBoricaProvider.buildSaleForm.mockImplementationOnce(() => {
        throw new Error('invalid private key');
      });

      await expect(service.createCheckout('tok1', 'BORICA', 0, boricaCardholder)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.payment.create).not.toHaveBeenCalled();
    });

    it('retries on P2002 ORDER collision and succeeds on second attempt (#5)', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        table: null,
        restaurant: boricaRestaurant,
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 10 }]);
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.payment.create
        .mockRejectedValueOnce({ code: 'P2002' })
        .mockResolvedValueOnce({ id: 'pay-retry' });

      const result = await service.createCheckout('tok1', 'BORICA', 0, boricaCardholder);

      expect(result.paymentId).toBe('pay-retry');
      expect(mockPrisma.payment.create).toHaveBeenCalledTimes(2);
    });

    it('reuses fresh pending BORICA payment with same amount within TTL (#7)', async () => {
      const freshPending = {
        id: 'pay-pending',
        provider: 'BORICA',
        status: 'PENDING',
        amount: 20,
        tipAmount: 0,
        createdAt: new Date(Date.now() - 5 * 60 * 1000), // 5 min ago
        providerPayload: {
          checkoutForm: {
            action: 'https://3dsgate-dev.borica.bg/cgi-bin/cgi_link',
            method: 'POST',
            fields: { ORDER: '000001' },
          },
        },
      };
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        table: null,
        restaurant: boricaRestaurant,
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 20 }]);
      mockPrisma.payment.findMany.mockResolvedValue([freshPending]);

      const result = await service.createCheckout('tok1', 'BORICA', 0, boricaCardholder);

      expect(result.paymentId).toBe('pay-pending');
      expect(mockPrisma.payment.create).not.toHaveBeenCalled();
    });

    it('expires stale pending BORICA and creates a fresh checkout (#7)', async () => {
      const stalePending = {
        id: 'pay-stale',
        provider: 'BORICA',
        status: 'PENDING',
        amount: 20,
        tipAmount: 0,
        createdAt: new Date(Date.now() - 20 * 60 * 1000), // 20 min ago = stale
        providerPayload: { checkoutForm: { action: 'x', method: 'POST', fields: {} } },
      };
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        table: null,
        restaurant: boricaRestaurant,
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 20 }]);
      mockPrisma.payment.findMany.mockResolvedValue([stalePending]);
      mockPrisma.payment.create.mockResolvedValue({ id: 'pay-new' });

      const result = await service.createCheckout('tok1', 'BORICA', 0, boricaCardholder);

      expect(result.paymentId).toBe('pay-new');
      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'pay-stale', status: 'PENDING' } }),
      );
    });

    it('TRTYPE=90: recovers stale BORICA payment when BORICA confirms success (#2)', async () => {
      const stalePending = {
        id: 'pay-stale',
        provider: 'BORICA',
        status: 'PENDING',
        amount: 20,
        tipAmount: 0,
        tableSessionId: 's1',
        providerReference: '000099',
        createdAt: new Date(Date.now() - 20 * 60 * 1000),
        providerPayload: { checkoutForm: { action: 'x', method: 'POST', fields: {} } },
      };
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        table: null,
        restaurant: boricaRestaurant,
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 20 }]);
      mockPrisma.payment.findMany.mockResolvedValue([stalePending]);
      mockBoricaProvider.queryTransactionStatus.mockResolvedValueOnce({
        verified: true, rc: '00', action: '0',
        order: '000099', rrn: '', intRef: '', approval: '',
        terminal: 'V1800001', amount: '20.00', currency: 'EUR',
        paresStat: 'Y', eci: '05',
      });
      mockPrisma.$transaction.mockImplementation((fn: any) => fn(mockPrisma));
      mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.tableSession.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.createCheckout('tok1', 'BORICA', 0, boricaCardholder)).rejects.toMatchObject({
        message: 'ALREADY_PAID',
      });
      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pay-stale', status: { in: ['PENDING', 'ABANDONED'] } },
          data: expect.objectContaining({ status: 'SUCCEEDED' }),
        }),
      );
      expect(mockPrisma.tableSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 's1',
            status: 'OPEN',
            payments: {
              some: {
                id: 'pay-stale',
                status: { in: ['PENDING', 'ABANDONED'] },
              },
            },
          },
          data: expect.objectContaining({ status: 'PAID' }),
        }),
      );
    });

    it('TRTYPE=90: does not complete a stale BORICA payment after another provider paid the session', async () => {
      const stalePending = {
        id: 'pay-stale',
        provider: 'BORICA',
        status: 'PENDING',
        amount: 20,
        tipAmount: 0,
        tableSessionId: 's1',
        providerReference: '000099',
        createdAt: new Date(Date.now() - 20 * 60 * 1000),
        providerPayload: { checkoutForm: { action: 'x', method: 'POST', fields: {} } },
      };
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        table: null,
        restaurant: boricaRestaurant,
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 20 }]);
      mockPrisma.payment.findMany.mockResolvedValue([stalePending]);
      mockBoricaProvider.queryTransactionStatus.mockResolvedValueOnce({
        verified: true, rc: '00', action: '0',
        order: '000099', rrn: '', intRef: '', approval: '',
        terminal: 'V1800001', amount: '20.00', currency: 'EUR',
        paresStat: 'Y', eci: '05',
      });
      mockPrisma.$transaction.mockImplementation((fn: any) => fn(mockPrisma));
      mockPrisma.tableSession.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.createCheckout('tok1', 'BORICA', 0, boricaCardholder)).rejects.toMatchObject({
        message: 'ALREADY_PAID',
      });

      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'SUCCEEDED' }),
        }),
      );
      expect(mockEvents.emitToRestaurant).not.toHaveBeenCalled();
      expect(mockEvents.emitTableStatusChanged).not.toHaveBeenCalled();
    });

    it('TRTYPE=90: marks STATUS_UNKNOWN when status check returns null — blocks new checkout', async () => {
      const stalePending = {
        id: 'pay-stale',
        provider: 'BORICA',
        status: 'PENDING',
        amount: 20,
        tipAmount: 0,
        tableSessionId: 's1',
        providerReference: '000099',
        createdAt: new Date(Date.now() - 20 * 60 * 1000),
        providerPayload: { checkoutForm: { action: 'x', method: 'POST', fields: {} } },
      };
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1', restaurantId: 'rest1', table: null, restaurant: boricaRestaurant,
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 20 }]);
      mockPrisma.payment.findMany.mockResolvedValue([stalePending]);
      mockBoricaProvider.queryTransactionStatus.mockResolvedValueOnce(null);

      await expect(service.createCheckout('tok1', 'BORICA', 0, boricaCardholder)).rejects.toThrow(ServiceUnavailableException);
      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pay-stale', status: 'PENDING' },
          data: expect.objectContaining({ providerStatus: 'STATUS_UNKNOWN' }),
        }),
      );
      expect(mockPrisma.payment.create).not.toHaveBeenCalled();
    });

    it('TRTYPE=90: marks STATUS_UNKNOWN when reconciliation mismatches', async () => {
      const stalePending = {
        id: 'pay-stale',
        provider: 'BORICA',
        status: 'PENDING',
        amount: 20,
        tipAmount: 0,
        tableSessionId: 's1',
        providerReference: '000099',
        createdAt: new Date(Date.now() - 20 * 60 * 1000),
        providerPayload: { checkoutForm: { action: 'x', method: 'POST', fields: {} } },
      };
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1', restaurantId: 'rest1', table: null, restaurant: boricaRestaurant,
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 20 }]);
      mockPrisma.payment.findMany.mockResolvedValue([stalePending]);
      mockBoricaProvider.queryTransactionStatus.mockResolvedValueOnce({
        verified: true, rc: '00', action: '0',
        order: '000099', terminal: 'V1800001',
        amount: '99.99', // mismatched amount — must not recover
        currency: 'EUR',
        rrn: '', intRef: '', approval: '', paresStat: '', eci: '',
      });
      await expect(service.createCheckout('tok1', 'BORICA', 0, boricaCardholder)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pay-stale', status: 'PENDING' },
          data: expect.objectContaining({ providerStatus: 'STATUS_UNKNOWN' }),
        }),
      );
      expect(mockPrisma.payment.create).not.toHaveBeenCalled();
    });

    it('TRTYPE=90: expires stale BORICA payment when BORICA returns a verified final decline', async () => {
      const stalePending = {
        id: 'pay-stale',
        provider: 'BORICA',
        status: 'PENDING',
        amount: 20,
        tipAmount: 0,
        tableSessionId: 's1',
        providerReference: '000099',
        createdAt: new Date(Date.now() - 20 * 60 * 1000),
        providerPayload: { checkoutForm: { action: 'x', method: 'POST', fields: {} } },
      };
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1', restaurantId: 'rest1', table: null, restaurant: boricaRestaurant,
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 20 }]);
      mockPrisma.payment.findMany.mockResolvedValue([stalePending]);
      mockBoricaProvider.queryTransactionStatus.mockResolvedValueOnce({
        verified: true, rc: '05', action: '2',
        order: '000099', terminal: 'V1800001',
        amount: '20.00', currency: 'EUR',
        rrn: '', intRef: '', approval: '', paresStat: '', eci: '',
      });
      mockPrisma.payment.create.mockResolvedValue({ id: 'pay-new' });

      const result = await service.createCheckout('tok1', 'BORICA', 0, boricaCardholder);

      expect(result.paymentId).toBe('pay-new');
      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pay-stale', status: 'PENDING' },
          data: expect.objectContaining({ status: 'FAILED', providerStatus: 'EXPIRED' }),
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // BORICA callback
  // ---------------------------------------------------------------------------
  describe('handleBoricaCallback', () => {
    const boricaPayment = {
      id: 'pay-borica',
      restaurantId: 'rest1',
      tableSessionId: 's1',
      amount: 20,
      tipAmount: 0,
      status: 'PENDING',
      currency: 'eur',
      providerReference: '000001',
      providerPayload: {},
      restaurant: {
        boricaMode: 'DEMO',
        boricaTerminalId: null,
        boricaMerchantId: null,
        boricaMerchantName: 'Test',
        boricaPrivateKeyEncrypted: null,
        boricaPublicCert: null,
      },
      tableSession: {
        id: 's1',
        restaurantId: 'rest1',
        table: { name: '5' },
      },
    };

    const validBody = {
      ORDER: '000001',
      AMOUNT: '20.00',
      CURRENCY: 'EUR',
      TERMINAL: 'V1800001',
      TRTYPE: '1',
      ACTION: '0',
      RC: '00',
    };

    beforeEach(() => {
      process.env.BORICA_TEST_TID = 'V1800001';
      process.env.BORICA_TEST_CERT = 'test-cert';
      mockPrisma.payment.findFirst.mockResolvedValue(boricaPayment);
      mockBoricaProvider.verifyResult.mockReturnValue({
        verified: true,
        rc: '00',
        action: '0',
        rrn: '123456789012',
        intRef: 'INT001',
        approval: 'A12345',
      });
    });

    afterEach(() => {
      delete process.env.BORICA_TEST_TID;
      delete process.env.BORICA_TEST_CERT;
    });

    it('does NOT mark FAILED when signature is invalid (#4)', async () => {
      mockBoricaProvider.verifyResult.mockReturnValueOnce({ verified: false });

      const url = await service.handleBoricaCallback(validBody);

      expect(url).toContain('borica-cancel');
      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
    });

    it('marks FAILED and redirects cancel when BORICA reports decline (rc != 00) (#4)', async () => {
      mockBoricaProvider.verifyResult.mockReturnValueOnce({
        verified: true,
        rc: '17',
        action: '0',
      });

      const url = await service.handleBoricaCallback(validBody);

      expect(url).toContain('borica-cancel');
      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pay-borica', status: 'PENDING' },
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    });

    it('marks SUCCEEDED and redirects ok on valid verified callback (#4, #6)', async () => {
      mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.tableSession.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.order.findFirst.mockResolvedValue({ customerName: 'Ana' });

      const url = await service.handleBoricaCallback(validBody);

      expect(url).toContain('borica-ok');
      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pay-borica', status: { in: ['PENDING', 'ABANDONED'] } },
          data: expect.objectContaining({ status: 'SUCCEEDED' }),
        }),
      );
      expect(mockPrisma.tableSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 's1',
            status: 'OPEN',
            payments: {
              some: {
                id: 'pay-borica',
                status: { in: ['PENDING', 'ABANDONED'] },
              },
            },
          },
          data: expect.objectContaining({ status: 'PAID' }),
        }),
      );
    });

    it('does not complete an old BORICA callback after another provider paid the session', async () => {
      mockPrisma.tableSession.updateMany.mockResolvedValueOnce({ count: 0 });

      const url = await service.handleBoricaCallback(validBody);

      expect(url).toContain('borica-cancel');
      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'SUCCEEDED' }),
        }),
      );
      expect(mockEvents.emitToRestaurant).not.toHaveBeenCalled();
      expect(mockEvents.emitTableStatusChanged).not.toHaveBeenCalled();
    });

    it('rejects callback with mismatched AMOUNT (#6)', async () => {
      const url = await service.handleBoricaCallback({
        ...validBody,
        AMOUNT: '99.99', // wrong amount
      });

      expect(url).toContain('borica-cancel');
      // Must NOT mark SUCCEEDED
      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCEEDED' }) }),
      );
    });

    it('rejects callback with mismatched TERMINAL (#6)', async () => {
      const url = await service.handleBoricaCallback({
        ...validBody,
        TERMINAL: 'WRONGTER',
      });

      expect(url).toContain('borica-cancel');
      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCEEDED' }) }),
      );
    });

    it('rejects callback with mismatched ORDER (#6)', async () => {
      const url = await service.handleBoricaCallback({
        ...validBody,
        ORDER: '999999', // different order ref
      });

      // Lookup returns null since providerReference doesn't match
      mockPrisma.payment.findFirst.mockResolvedValue(null);

      expect(url).toContain('borica-cancel');
    });
  });

  describe('forceOpenSession', () => {
    it('throws NotFoundException when table not found for this restaurant', async () => {
      mockPrisma.restaurantTable.findFirst.mockResolvedValue(null);
      await expect(
        service.forceOpenSession('table-1', 'rest1', 'owner1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('closes existing OPEN session and creates new one', async () => {
      mockPrisma.restaurantTable.findFirst.mockResolvedValue({
        id: 'table-1',
        restaurantId: 'rest1',
      });
      const existingSession = { id: 'old-session', tableId: 'table-1' };
      const newSession = {
        id: 'new-session',
        token: 'new-token',
        tableId: 'table-1',
      };
      mockPrisma.tableSession.findFirst.mockResolvedValue(existingSession);
      mockPrisma.tableSession.update.mockResolvedValue({});
      mockPrisma.tableSession.create.mockResolvedValue(newSession);

      const result = await service.forceOpenSession(
        'table-1',
        'rest1',
        'owner1',
      );

      expect(mockPrisma.tableSession.update).toHaveBeenCalledWith({
        where: { id: 'old-session' },
        data: { status: 'CLOSED_NO_PAYMENT' },
      });
      expect(result.token).toBe('new-token');
      expect(mockEvents.emitTableStatusChanged).toHaveBeenCalledTimes(2);
    });

    it('creates new session when no existing OPEN session', async () => {
      mockPrisma.restaurantTable.findFirst.mockResolvedValue({
        id: 'table-1',
        restaurantId: 'rest1',
      });
      mockPrisma.tableSession.findFirst.mockResolvedValue(null);
      const newSession = {
        id: 'new-session',
        token: 'new-token',
        tableId: 'table-1',
      };
      mockPrisma.tableSession.create.mockResolvedValue(newSession);

      const result = await service.forceOpenSession(
        'table-1',
        'rest1',
        'owner1',
      );

      expect(mockPrisma.tableSession.update).not.toHaveBeenCalled();
      expect(result.token).toBe('new-token');
    });
  });
});
