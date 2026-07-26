import { PaymentService } from './payment.service';
import { PaymentProviderConfigService } from './payment-provider-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { PaymentProvider } from '@prisma/client';
import { FeatureFlag } from '../subscription/feature-flag.enum';
import { SplitMode, SplitProvider } from './dto/settle-partial.dto';

type DeepPartial<T> = T extends Function
  ? jest.Mock
  : T extends object
    ? { [P in keyof T]: DeepPartial<T[P]> }
    : T;
import { PaymentCoreService } from './core/payment-core.service';
import { PaymentReportingService } from './reporting/payment-reporting.service';
import { StripeCheckoutService } from './providers/stripe-checkout.service';
import { EpayCheckoutService } from './providers/epay-checkout.service';
import { MyposCheckoutService } from './providers/mypos-checkout.service';
import { BoricaCheckoutService } from './providers/borica-checkout.service';
import { PaymentSessionService } from './session/payment-session.service';
import { PaymentSettlementService } from './session/payment-settlement.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { StripeProvider } from './stripe.provider';
import { EpayProvider } from './epay.provider';
import { MyposProvider } from './mypos.provider';
import { BoricaProvider } from './borica.provider';
import { FeatureService } from '../subscription/feature.service';

describe('PaymentService', () => {
  let service: PaymentService;
  let mockPrisma: DeepPartial<PrismaService>;
  let mockStripeProvider: DeepPartial<StripeProvider>;
  let mockEpayProvider: DeepPartial<EpayProvider>;
  let mockBoricaProvider: DeepPartial<BoricaProvider>;
  let mockMyposProvider: DeepPartial<MyposProvider>;
  let mockEvents: DeepPartial<EventsGateway>;
  let mockFeatureService: FeatureService;

  function buildPaymentService(featureService = mockFeatureService) {
    const _prisma = mockPrisma as unknown as PrismaService;
    const _stripe = mockStripeProvider as unknown as StripeProvider;
    const _epay = mockEpayProvider as unknown as EpayProvider;
    const _borica = mockBoricaProvider as unknown as BoricaProvider;
    const _mypos = mockMyposProvider as unknown as MyposProvider;
    const _events = mockEvents as unknown as EventsGateway;

    const config = new PaymentProviderConfigService(featureService);
    const core = new PaymentCoreService(_prisma, _events, featureService);
    const sessions = new PaymentSessionService(
      _prisma,
      _stripe as unknown as StripeProvider,
      _events,
      core,
      config,
      featureService,
    );
    const settlement = new PaymentSettlementService(
      _prisma,
      _events,
      featureService,
      core,
      sessions,
    );
    const reporting = new PaymentReportingService(_prisma, core);
    const stripeCheckout = new StripeCheckoutService(
      _prisma,
      _stripe as unknown as StripeProvider,
      _events,
      featureService,
      core,
      config,
    );
    const epayCheckout = new EpayCheckoutService(
      _prisma,
      _epay as unknown as EpayProvider,
      core,
      config,
    );
    const myposCheckout = new MyposCheckoutService(
      _prisma,
      _mypos as unknown as MyposProvider,
      core,
      config,
    );
    const boricaCheckout = new BoricaCheckoutService(
      _prisma,
      _borica as unknown as BoricaProvider,
      core,
      config,
    );
    const service = new PaymentService(
      sessions,
      settlement,
      reporting,
      stripeCheckout,
      epayCheckout,
      myposCheckout,
      boricaCheckout,
    );
    return service;
  }

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
        findFirst: jest.fn().mockResolvedValue({
          id: 'table1',
          restaurantId: 'rest1',
          type: 'TABLE',
          isActive: true,
          restaurant: {
            tier: 'PROFESSIONAL',
            forceTier: null,
            isActive: true,
            deletedAt: null,
          },
        }),
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
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn(),
      },
      paymentProviderEvent: {
        create: jest.fn().mockResolvedValue({ id: 'provider-event-1' }),
      },
      paymentReconciliationIssue: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        upsert: jest.fn().mockResolvedValue({ id: 'reconciliation-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      order: {
        // Default empty so the #2 underpay guard in the claim path
        // (sums session order totals) sees subtotal 0 ≤ any paid amount.
        // Individual tests override with explicit totals where relevant.
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      orderItem: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        // Default empty: the #M1 scope pre-check treats an item absent from this
        // read as "not observed settled" and defers to the conditional
        // updateMany guard. Tests exercising the conflict path mock this.
        findMany: jest.fn().mockResolvedValue([]),
      },
      paymentAllocation: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      refundAttempt: {
        create: jest.fn().mockResolvedValue({ id: 'ra1' }),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      cashPaymentRequest: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $queryRaw: jest.fn().mockImplementation((query: any) => {
        const sql =
          query?.strings?.join(' ') ??
          (Array.isArray(query) ? query.join(' ') : '');
        if (sql.includes('FROM "restaurant_table"')) {
          return Promise.resolve([{ id: 'table1', type: 'TABLE' }]);
        }
        if (sql.includes('SELECT *')) {
          return Promise.resolve([]);
        }
        return Promise.resolve([{ id: 's1', status: 'OPEN' }]);
      }),
      $transaction: jest.fn((arg: unknown[]) => {
        if (typeof arg === 'function') return (arg as Function)(mockPrisma);
        return Promise.all(arg);
      }),
    } as unknown as DeepPartial<PrismaService>;
    mockStripeProvider = {
      createPaymentIntent: jest.fn(),
      createRefund: jest.fn(),
      cancelPaymentIntent: jest.fn().mockResolvedValue(undefined),
      constructWebhookEvent: jest.fn(),
      retrievePaymentIntent: jest.fn().mockResolvedValue(null),
      retrieveRefund: jest.fn().mockResolvedValue(null),
    } as unknown as DeepPartial<StripeProvider>;
    mockEpayProvider = {
      createCheckoutForm: jest.fn(),
      parseNotifications: jest.fn(),
      verifyChecksum: jest.fn(),
      formatNotificationResponses: jest.fn((responses) =>
        responses
          .map(
            (response: { invoice: string; status: string }) =>
              `INVOICE=${response.invoice}:STATUS=${response.status}`,
          )
          .join('\n'),
      ),
    } as unknown as DeepPartial<EpayProvider>;
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
      getActionUrl: jest
        .fn()
        .mockReturnValue('https://3dsgate-dev.borica.bg/cgi-bin/cgi_link'),
      // Default: status check unavailable (null = outcome unknown, keep pending)
      queryTransactionStatus: jest.fn().mockResolvedValue(null),
    } as unknown as DeepPartial<BoricaProvider>;
    mockMyposProvider = {
      createCheckoutForm: jest.fn(({ orderId }: { orderId: string }) => ({
        action: 'https://www.mypos.com/vmp/checkout-test',
        method: 'POST' as const,
        fields: {
          IPCmethod: 'IPCPurchase',
          OrderID: orderId,
          Signature: 'signed',
        },
      })),
      verifyNotification: jest.fn().mockReturnValue({
        verified: true,
        method: 'IPCPurchaseNotify',
        orderId: 'MP123',
        amount: '20.00',
        currency: 'EUR',
        storeId: '000000000000010',
        transactionRef: '813705',
        requestStan: '000006',
        requestDateTime: '2015-08-21 10:39:37',
      }),
    } as unknown as DeepPartial<MyposProvider>;
    mockEvents = {
      emitToRestaurant: jest.fn(),
      emitToTableSession: jest.fn(),
      emitTableStatusChanged: jest.fn(),
      dispatchPaidOrder: jest.fn().mockResolvedValue(undefined),
    } as unknown as DeepPartial<EventsGateway>;

    mockFeatureService = {
      hasFeature: jest.fn().mockReturnValue(true),
      getEffectiveTier: jest.fn().mockImplementation((tier: string) => tier),
      restaurantHasFeature: jest.fn(function (
        this: FeatureService,
        r: { tier?: string; forceTier?: string | null },
        f: FeatureFlag,
      ) {
        return this.hasFeature(
          this.getEffectiveTier(r?.tier ?? 'FREE', r?.forceTier ?? null),
          f,
        );
      }),
    } as unknown as FeatureService;
    service = buildPaymentService();
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
        where: {
          token: 'tok1',
          restaurantId: 'rest1',
          tableId: 'table1',
          status: 'OPEN',
          isServicePoint: false,
        },
      });
    });

    it('does not mint service-point sessions after the feature is removed', async () => {
      mockPrisma.restaurantTable.findFirst.mockResolvedValue({
        id: 'room1',
        restaurantId: 'rest1',
        type: 'ROOM',
        isActive: true,
        restaurant: {
          tier: 'FREE',
          forceTier: null,
          isActive: true,
          deletedAt: null,
        },
      });
      (mockFeatureService.restaurantHasFeature as jest.Mock).mockReturnValue(
        false,
      );

      await expect(
        service.getOrCreateSession('room1', 'rest1'),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.tableSession.create).not.toHaveBeenCalled();
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
        data: {
          tableId: 'table1',
          restaurantId: 'rest1',
          isServicePoint: false,
        },
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
        where: {
          tableId: 'table1',
          restaurantId: 'rest1',
          status: 'OPEN',
          isServicePoint: false,
        },
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
        table: { name: '6' },
      };
      mockPrisma.tableSession.findFirst.mockResolvedValue(session);
      mockPrisma.order.findMany.mockResolvedValue([
        { totalPrice: 15.0, items: [] },
        { totalPrice: 8.5, items: [] },
      ]);

      const result = await service.getSessionBill('tok1');

      expect(result.subtotal).toBeCloseTo(23.5);
      expect(result.tableName).toBe('6');
      expect(result.tipsEnabled).toBe(true);
      expect(result.tipOptions).toEqual([5, 10, 15]);
      expect(result.pendingPayment).toBeNull();
    });

    it('returns a pending full-table cash request with the bill', async () => {
      const session = {
        id: 's1',
        token: 'tok1',
        restaurantId: 'rest1',
        tableId: 'table1',
        status: 'OPEN',
        restaurant: { tipsEnabled: false, tipOptions: [] },
        table: { name: '6' },
      };
      mockPrisma.tableSession.findFirst.mockResolvedValue(session);
      mockPrisma.order.findMany.mockResolvedValue([
        { totalPrice: 20, items: [] },
      ]);
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.cashPaymentRequest.findMany.mockResolvedValue([
        {
          id: 'cash-full',
          tableSessionId: 's1',
          scope: 'FULL_TABLE',
          orderIds: [],
          requestedAmount: 20,
          createdAt: new Date('2026-06-21T08:00:00.000Z'),
        },
      ]);

      const result = await service.getSessionBill('tok1');

      expect(result.pendingPayment).toMatchObject({
        id: 'cash-full',
        source: 'CASH_REQUEST',
        provider: PaymentProvider.CASH,
        scope: 'FULL_TABLE',
        amount: 20,
      });
    });

    it('throws NotFoundException when session not found', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue(null);
      await expect(service.getSessionBill('bad-token')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('translates item names to the requested language', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        token: 'tok1',
        restaurantId: 'rest1',
        status: 'OPEN',
        restaurant: { tipsEnabled: false, tipOptions: [] },
        table: { name: '6' },
      });
      mockPrisma.order.findMany.mockResolvedValue([
        {
          id: 'o1',
          source: 'QR',
          totalPrice: 10,
          customerName: null,
          customerPhone: null,
          staff: null,
          items: [
            {
              id: 'oi1',
              quantity: 1,
              paidQuantity: 0,
              unitPrice: 10,
              unitPriceWithOptions: 10,
              selectedOptions: [],
              menuItem: {
                name: 'Кафе',
                price: 10,
                translations: { en: { name: 'Coffee' } },
              },
            },
          ],
        },
      ]);
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.cashPaymentRequest.findMany.mockResolvedValue([]);

      const result = await service.getSessionBill('tok1', 'en');

      expect(result.orders[0].items[0].name).toBe('Coffee');
    });

    it('falls back to the stored item name when no translation exists', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        token: 'tok1',
        restaurantId: 'rest1',
        status: 'OPEN',
        restaurant: { tipsEnabled: false, tipOptions: [] },
        table: { name: '6' },
      });
      mockPrisma.order.findMany.mockResolvedValue([
        {
          id: 'o1',
          source: 'QR',
          totalPrice: 10,
          customerName: null,
          customerPhone: null,
          staff: null,
          items: [
            {
              id: 'oi1',
              quantity: 1,
              paidQuantity: 0,
              unitPrice: 10,
              unitPriceWithOptions: 10,
              selectedOptions: [],
              menuItem: { name: 'Кафе', price: 10, translations: null },
            },
          ],
        },
      ]);
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.cashPaymentRequest.findMany.mockResolvedValue([]);

      const result = await service.getSessionBill('tok1', 'fr');

      expect(result.orders[0].items[0].name).toBe('Кафе');
    });

    it('preserves zero effective prices and exposes the original price for redeemed items', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        token: 'tok1',
        restaurantId: 'rest1',
        status: 'OPEN',
        restaurant: { tipsEnabled: false, tipOptions: [] },
        table: { name: '6' },
      });
      mockPrisma.order.findMany.mockResolvedValue([
        {
          id: 'redeemed-order',
          source: 'CUSTOMER',
          totalPrice: 0,
          pointsRedeemedForDiscount: 843,
          pointsRedeemedForItems: 0,
          customerName: 'Johny',
          customerPhone: null,
          staff: null,
          items: [
            {
              id: 'oi-redeemed',
              quantity: 1,
              paidQuantity: 0,
              unitPrice: 5.62,
              unitPriceWithOptions: 5.62,
              selectedOptions: [],
              menuItem: {
                name: 'Green salad',
                price: 5.62,
                translations: null,
              },
            },
          ],
        },
      ]);
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.cashPaymentRequest.findMany.mockResolvedValue([]);

      const result = await service.getSessionBill('tok1', 'en');

      expect(result.orders[0].items[0]).toMatchObject({
        unitPrice: 0,
        unitPriceWithOptions: 0,
        originalUnitPriceWithOptions: 5.62,
        redeemedWithPoints: true,
      });
    });

    it('uses loyalty discount on the first bill items and partially discounts the boundary item', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        token: 'tok1',
        restaurantId: 'rest1',
        status: 'OPEN',
        restaurant: { tipsEnabled: false, tipOptions: [] },
        table: { name: '6' },
      });
      mockPrisma.order.findMany.mockResolvedValue([
        {
          id: 'partially-redeemed-order',
          source: 'CUSTOMER',
          totalPrice: 8.5,
          pointsRedeemedForDiscount: 1500,
          pointsRedeemedForItems: 0,
          customerName: 'Johny',
          customerPhone: null,
          staff: null,
          items: [
            {
              id: 'oi-first',
              quantity: 1,
              paidQuantity: 0,
              unitPrice: 5,
              unitPriceWithOptions: 5,
              selectedOptions: [],
              menuItem: { name: 'First', price: 5, translations: null },
            },
            {
              id: 'oi-boundary',
              quantity: 1,
              paidQuantity: 0,
              unitPrice: 7,
              unitPriceWithOptions: 7,
              selectedOptions: [],
              menuItem: { name: 'Boundary', price: 7, translations: null },
            },
            {
              id: 'oi-full-price',
              quantity: 1,
              paidQuantity: 0,
              unitPrice: 6.5,
              unitPriceWithOptions: 6.5,
              selectedOptions: [],
              menuItem: {
                name: 'Full price',
                price: 6.5,
                translations: null,
              },
            },
          ],
        },
      ]);
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.cashPaymentRequest.findMany.mockResolvedValue([]);

      const result = await service.getSessionBill('tok1', 'en');

      expect(result.orders[0].items).toMatchObject([
        {
          orderItemId: 'oi-first',
          unitPriceWithOptions: 0,
          originalUnitPriceWithOptions: 5,
          redeemedWithPoints: true,
        },
        {
          orderItemId: 'oi-boundary',
          unitPriceWithOptions: 2,
          originalUnitPriceWithOptions: 7,
          redeemedWithPoints: true,
        },
        {
          orderItemId: 'oi-full-price',
          unitPriceWithOptions: 6.5,
          originalUnitPriceWithOptions: 6.5,
          redeemedWithPoints: false,
        },
      ]);
      const [firstItem, boundaryItem, fullPriceItem] = result.orders[0].items;
      expect(
        firstItem.unitPriceWithOptions * firstItem.quantity +
          boundaryItem.unitPriceWithOptions * boundaryItem.quantity +
          fullPriceItem.unitPriceWithOptions * fullPriceItem.quantity,
      ).toBe(8.5);
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
      mockStripeProvider.createPaymentIntent!.mockResolvedValue({
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
          idempotencyKey: 'stripe:s1:2200:11:eur',
        }),
      );
      expect(mockPrisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            provider: 'STRIPE',
            providerReference: 'stripe:s1:2200:11:eur',
          }),
        }),
      );
      expect(result.clientSecret).toBe('cs_test');
      expect(mockEvents.emitToTableSession).toHaveBeenCalledWith(
        's1',
        'billPayment:pending',
        expect.objectContaining({
          id: 'pay1',
          source: 'ONLINE_PAYMENT',
          provider: 'STRIPE',
          scope: 'FULL_TABLE',
          amount: 22,
        }),
      );
    });

    it('creates a scoped Stripe checkout for unpaid units on selected orders', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        restaurant: {
          paymentsEnabled: true,
          stripeOnboarded: true,
          stripeAccountId: 'acct_123',
          platformFeePercent: 0,
          tipsEnabled: true,
          tipOptions: [10],
          tier: 'PROFESSIONAL',
        },
      });
      const ownedOrder = {
        id: 'order-owned',
        totalPrice: 20,
        pointsRedeemedForDiscount: 0,
        pointsRedeemedForItems: 0,
        items: [
          {
            id: 'oi-soup',
            quantity: 2,
            paidQuantity: 1,
            unitPriceWithOptions: 10,
            selectedOptions: [],
            menuItem: { name: 'Soup', price: 10 },
          },
        ],
      };
      const otherOrder = {
        id: 'order-other',
        totalPrice: 15,
        pointsRedeemedForDiscount: 0,
        pointsRedeemedForItems: 0,
        items: [
          {
            id: 'oi-salad',
            quantity: 1,
            paidQuantity: 0,
            unitPriceWithOptions: 15,
            selectedOptions: [],
            menuItem: { name: 'Salad', price: 15 },
          },
        ],
      };
      mockPrisma.order.findMany
        .mockResolvedValueOnce([ownedOrder, otherOrder])
        .mockResolvedValueOnce([ownedOrder]);
      mockPrisma.payment.findMany.mockResolvedValue([
        { id: 'paid-old', status: 'SUCCEEDED', amount: 10, tipAmount: 0 },
      ]);
      mockPrisma.payment.create.mockResolvedValue({ id: 'pay-owned' });
      mockStripeProvider.createPaymentIntent!.mockResolvedValue({
        clientSecret: 'cs_owned',
        paymentIntentId: 'pi_owned',
      });
      mockPrisma.payment.update.mockResolvedValue({});

      const result = await service.createPaymentIntent('tok1', 10, {
        orderIds: ['order-owned'],
      });

      expect(result.total).toBeCloseTo(11);
      expect(result.tipAmount).toBeCloseTo(1);
      expect(mockStripeProvider.createPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: 1100,
          metadata: expect.objectContaining({
            checkoutScopeKey: expect.any(String),
          }),
        }),
      );
      expect(mockPrisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: 11,
            tipAmount: 1,
            splitMode: 'ITEM',
            providerPayload: expect.objectContaining({
              checkoutScope: expect.objectContaining({
                kind: 'ORDER_ITEMS',
                orderIds: ['order-owned'],
                chargeSubtotal: 10,
                allocations: [
                  {
                    orderItemId: 'oi-soup',
                    quantity: 1,
                    amount: 10,
                    snapshotPaid: 1,
                  },
                ],
              }),
            }),
          }),
        }),
      );
      expect(result.clientSecret).toBe('cs_owned');
    });

    it('blocks a full-table Stripe checkout while a scoped cash request is pending', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        restaurant: {
          paymentsEnabled: true,
          stripeOnboarded: true,
          stripeAccountId: 'acct_123',
          platformFeePercent: 0,
          tipsEnabled: true,
          tipOptions: [],
          tier: 'PROFESSIONAL',
        },
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 30 }]);
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.cashPaymentRequest.findMany.mockResolvedValue([
        {
          id: 'cash-salad',
          status: 'PENDING',
          scope: 'ORDER_ITEMS',
          orderIds: ['order-salad'],
        },
      ]);

      await expect(service.createPaymentIntent('tok1', 0)).rejects.toThrow(
        ConflictException,
      );

      expect(mockPrisma.payment.create).not.toHaveBeenCalled();
      expect(mockStripeProvider.createPaymentIntent).not.toHaveBeenCalled();
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
      mockStripeProvider.createPaymentIntent!.mockRejectedValue(
        new Error('stripe down'),
      );
      mockPrisma.payment.update.mockResolvedValue({});

      await expect(service.createPaymentIntent('tok1', 0)).rejects.toThrow(
        'stripe down',
      );
      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-fail' },
        data: { status: 'FAILED', providerReference: null },
      });
    });

    it('logs identifiers and preserves the provider error when FAILED persistence fails', async () => {
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
      mockStripeProvider.createPaymentIntent!.mockRejectedValue(
        new Error('stripe down'),
      );
      mockPrisma.payment.update.mockRejectedValue(new Error('database down'));
      const loggerError = jest
        .spyOn((service as any).stripeCheckout.logger, 'error')
        .mockImplementation();

      await expect(service.createPaymentIntent('tok1', 0)).rejects.toThrow(
        'stripe down',
      );
      expect(loggerError).toHaveBeenCalledWith(
        expect.stringContaining('payment remains reconcilable'),
        expect.objectContaining({
          paymentId: 'pay-fail',
          tableSessionId: 's1',
          providerError: 'stripe down',
          persistenceError: 'database down',
        }),
      );
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
      // A succeeded payment that covers the bill leaves remaining 0 → reject.
      mockPrisma.payment.findMany.mockResolvedValue([
        { id: 'old', status: 'SUCCEEDED', amount: 20, tipAmount: 0 },
      ]);

      await expect(service.createPaymentIntent('tok1', 0)).rejects.toThrow(
        ConflictException,
      );
      expect(mockStripeProvider.createPaymentIntent).not.toHaveBeenCalled();
    });

    it('blocks an unmatched PENDING intent instead of starting an overlapping checkout (#H1)', async () => {
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

      await expect(service.createPaymentIntent('tok1', 0)).rejects.toThrow(
        ConflictException,
      );
      expect(mockStripeProvider.cancelPaymentIntent).not.toHaveBeenCalled();
      expect(mockStripeProvider.createPaymentIntent).not.toHaveBeenCalled();
      expect(mockPrisma.payment.create).not.toHaveBeenCalled();
    });

    it('does not try to cancel an unmatched pending intent while blocking a new one (#H1)', async () => {
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
      mockStripeProvider.cancelPaymentIntent!.mockRejectedValue(
        new Error('already succeeded'),
      );

      await expect(service.createPaymentIntent('tok1', 0)).rejects.toThrow(
        ConflictException,
      );
      expect(mockStripeProvider.cancelPaymentIntent).not.toHaveBeenCalled();
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
        restaurantHasFeature: jest.fn(function (
          this: FeatureService,
          r: { tier?: string; forceTier?: string | null },
          f: FeatureFlag,
        ) {
          return this.hasFeature(
            this.getEffectiveTier(r?.tier ?? 'FREE', r?.forceTier ?? null),
            f,
          );
        }),
      } as unknown as FeatureService;
      const lockedService = buildPaymentService(lockedFeatureService);

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
      mockEpayProvider.createCheckoutForm!.mockReturnValue({
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
      mockEpayProvider.parseNotifications!.mockReturnValue([notification]);
      mockEpayProvider.verifyChecksum!.mockReturnValue(true);
    });

    it('returns ERR when checksum verification fails', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([epayPayment]);
      mockEpayProvider.verifyChecksum!.mockReturnValue(false);

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

  describe('createCheckout with myPOS', () => {
    const myposRestaurant = {
      paymentsEnabled: true,
      stripeOnboarded: false,
      stripeAccountId: null,
      platformFeePercent: 0,
      tipsEnabled: false,
      tipOptions: [],
      tier: 'PROFESSIONAL',
      myposEnabled: true,
      myposMode: 'DEMO',
      myposClientNumber: null,
      myposStoreId: null,
      myposKeyIndex: null,
      myposPrivateKeyEncrypted: null,
      myposPublicCert: null,
      myposCurrency: 'EUR',
    };

    beforeEach(() => {
      process.env.BACKEND_URL = 'https://api.example.com';
    });

    afterEach(() => {
      delete process.env.BACKEND_URL;
    });

    it('creates a pending MYPOS payment and returns hosted form fields', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        table: { name: '7' },
        restaurant: myposRestaurant,
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 20 }]);
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.payment.create.mockResolvedValue({ id: 'pay-mypos' });

      const result = await service.createCheckout('tok1', 'MYPOS', 0);

      expect(result).toEqual(
        expect.objectContaining({
          provider: PaymentProvider.MYPOS,
          paymentId: 'pay-mypos',
          total: 20,
          action: 'https://www.mypos.com/vmp/checkout-test',
        }),
      );
      expect(mockMyposProvider.createCheckoutForm).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 20,
          currency: 'EUR',
          urlNotify: 'https://api.example.com/api/v1/payments/mypos/notify',
          urlOk: expect.stringContaining('payment=mypos-ok'),
          urlCancel: expect.stringContaining('payment=mypos-cancel'),
        }),
      );
      expect(mockPrisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          provider: PaymentProvider.MYPOS,
          status: 'PENDING',
          providerStatus: 'PENDING',
          providerReference: expect.stringMatching(/^MP/),
          currency: 'eur',
        }),
      });
    });

    it('throws when BACKEND_URL is missing because myPOS needs URL_Notify', async () => {
      delete process.env.BACKEND_URL;
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        table: null,
        restaurant: myposRestaurant,
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 20 }]);
      mockPrisma.payment.findMany.mockResolvedValue([]);

      await expect(service.createCheckout('tok1', 'MYPOS', 0)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.payment.create).not.toHaveBeenCalled();
    });

    it('uses the currency resolved from the restaurant myPOS configuration', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        table: { name: '7' },
        restaurant: { ...myposRestaurant, myposCurrency: 'BGN' },
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 20 }]);
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.payment.create.mockResolvedValue({ id: 'pay-mypos' });

      await service.createCheckout('tok1', 'MYPOS', 0);

      expect(mockMyposProvider.createCheckoutForm).toHaveBeenCalledWith(
        expect.objectContaining({ currency: 'BGN' }),
      );
      expect(mockPrisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ currency: 'bgn' }),
      });
    });
  });

  describe('handleMyposNotification', () => {
    const myposPayment = {
      id: 'pay-mypos',
      restaurantId: 'rest1',
      tableSessionId: 's1',
      amount: 20,
      tipAmount: 0,
      status: 'PENDING',
      currency: 'eur',
      providerReference: 'MP123',
      providerPayload: {},
      restaurant: {
        id: 'rest1',
        myposMode: 'DEMO',
        myposClientNumber: null,
        myposStoreId: null,
        myposKeyIndex: null,
        myposPrivateKeyEncrypted: null,
        myposPublicCert: null,
        myposCurrency: 'EUR',
      },
      tableSession: {
        id: 's1',
        restaurantId: 'rest1',
        tableId: 'table1',
        table: { name: '7' },
      },
    };

    const validBody = {
      IPCmethod: 'IPCPurchaseNotify',
      SID: '000000000000010',
      Amount: '20.00',
      Currency: 'EUR',
      OrderID: 'MP123',
      Signature: 'signed',
    };

    beforeEach(() => {
      mockPrisma.payment.findFirst.mockResolvedValue(myposPayment);
      mockMyposProvider.verifyNotification!.mockReturnValue({
        verified: true,
        method: 'IPCPurchaseNotify',
        orderId: 'MP123',
        amount: '20.00',
        currency: 'EUR',
        storeId: '000000000000010',
        transactionRef: '813705',
        requestStan: '000006',
        requestDateTime: '2015-08-21 10:39:37',
      });
    });

    it('returns ERR and does not mutate state when signature is invalid', async () => {
      mockMyposProvider.verifyNotification!.mockReturnValueOnce({
        verified: false,
        method: 'IPCPurchaseNotify',
        orderId: 'MP123',
        amount: '20.00',
        currency: 'EUR',
        storeId: '000000000000010',
        transactionRef: '',
        requestStan: '',
        requestDateTime: '',
      });

      const result = await service.handleMyposNotification(validBody);

      expect(result).toBe('ERR=invalid Signature');
      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
    });

    it('requires the exact PurchaseNotify IPC method', async () => {
      mockMyposProvider.verifyNotification!.mockReturnValueOnce({
        verified: true,
        method: '',
        orderId: 'MP123',
        amount: '20.00',
        currency: 'EUR',
        storeId: '000000000000010',
        transactionRef: '813705',
        requestStan: '000006',
        requestDateTime: '2015-08-21 10:39:37',
      });

      await expect(service.handleMyposNotification(validBody)).resolves.toBe(
        'ERR=invalid IPCmethod',
      );
      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
    });

    it('marks a verified myPOS notification succeeded and replies OK', async () => {
      mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.tableSession.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.order.findFirst.mockResolvedValue({ customerName: 'Maria' });

      const result = await service.handleMyposNotification(validBody);

      expect(result).toBe('OK');
      expect(mockPrisma.payment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            restaurant: expect.objectContaining({
              select: expect.objectContaining({ id: true }),
            }),
          }),
        }),
      );
      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'pay-mypos', status: { in: ['PENDING', 'ABANDONED'] } },
        data: expect.objectContaining({
          status: 'SUCCEEDED',
          providerStatus: 'PAID',
        }),
      });
      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        'rest1',
        'payment:confirmed',
        expect.objectContaining({
          paymentId: 'pay-mypos',
          tableSessionId: 's1',
          amount: 20,
          tipAmount: 0,
          customerName: 'Maria',
        }),
      );
    });

    it('marks FAILED and does NOT claim a signature-valid but declined notification (#M4)', async () => {
      mockMyposProvider.verifyNotification!.mockReturnValue({
        verified: true,
        method: 'IPCPurchaseNotify',
        orderId: 'MP123',
        amount: '20.00',
        currency: 'EUR',
        storeId: '000000000000010',
        transactionRef: '813705',
        requestStan: '000006',
        requestDateTime: '2015-08-21 10:39:37',
        status: '1', // non-zero = decline/reversal
      });
      mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.handleMyposNotification(validBody);

      // Acknowledge to myPOS (stop retries) but never mark the bill paid.
      expect(result).toBe('OK');
      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'pay-mypos', status: 'PENDING' },
        data: { status: 'FAILED', providerStatus: 'DECLINED' },
      });
      expect(mockPrisma.tableSession.updateMany).not.toHaveBeenCalled();
      expect(mockEvents.emitToRestaurant).not.toHaveBeenCalledWith(
        'rest1',
        'payment:confirmed',
        expect.anything(),
      );
    });
  });

  describe('handleWebhookEvent', () => {
    it('on payment_intent.succeeded: updates Payment + TableSession + emits socket event', async () => {
      mockStripeProvider.constructWebhookEvent!.mockReturnValue({
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

    it('on scoped payment_intent.succeeded: settles selected items and leaves the session open when balance remains', async () => {
      mockStripeProvider.constructWebhookEvent!.mockReturnValue({
        type: 'payment_intent.succeeded',
        id: 'evt_scoped',
        data: { object: { id: 'pi_scoped' } },
      });
      const payment = {
        id: 'pay-scoped',
        amount: 10,
        tipAmount: 0,
        status: 'PENDING',
        tableSessionId: 's1',
        restaurantId: 'rest1',
        providerPayload: {
          checkoutScope: {
            kind: 'ORDER_ITEMS',
            orderIds: ['order-owned'],
            chargeSubtotal: 10,
            allocations: [
              {
                orderItemId: 'oi-soup',
                quantity: 1,
                amount: 10,
                snapshotPaid: 0,
              },
            ],
          },
        },
        tableSession: {
          id: 's1',
          restaurantId: 'rest1',
          tableId: 'table1',
          table: { name: '3' },
        },
      };
      mockPrisma.payment.findFirst.mockResolvedValue(payment);
      mockPrisma.tableSession.findFirst.mockResolvedValue({ id: 's1' });
      mockPrisma.orderItem.findMany.mockResolvedValue([
        { id: 'oi-soup', paidQuantity: 0 },
      ]);
      mockPrisma.order.findMany
        .mockResolvedValueOnce([
          {
            totalPrice: 30,
            pointsRedeemedForDiscount: 0,
            pointsRedeemedForItems: 0,
            items: [
              {
                id: 'oi-soup',
                quantity: 1,
                paidQuantity: 1,
                unitPriceWithOptions: 10,
                selectedOptions: [],
                menuItem: { name: 'Soup', price: 10 },
              },
              {
                id: 'oi-steak',
                quantity: 1,
                paidQuantity: 0,
                unitPriceWithOptions: 20,
                selectedOptions: [],
                menuItem: { name: 'Steak', price: 20 },
              },
            ],
          },
        ])
        .mockResolvedValueOnce([{ id: 'order-owned' }]);
      mockPrisma.order.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.payment.findMany.mockResolvedValue([
        { id: 'pay-scoped', status: 'SUCCEEDED', amount: 10, tipAmount: 0 },
      ]);

      await service.handleWebhookEvent(Buffer.from('{}'), 'sig');

      expect(mockPrisma.orderItem.updateMany).toHaveBeenCalledWith({
        where: { id: 'oi-soup', paidQuantity: 0 },
        data: { paidQuantity: { increment: 1 } },
      });
      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'pay-scoped', status: { in: ['PENDING', 'ABANDONED'] } },
        data: {
          status: 'SUCCEEDED',
          stripePaymentIntentId: 'pi_scoped',
          splitMode: 'ITEM',
        },
      });
      expect(mockPrisma.paymentAllocation.createMany).toHaveBeenCalledWith({
        data: [
          {
            paymentId: 'pay-scoped',
            orderItemId: 'oi-soup',
            quantity: 1,
            amount: 10,
          },
        ],
      });
      expect(mockPrisma.tableSession.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PAID' }),
        }),
      );
      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        'rest1',
        'bill:updated',
        expect.objectContaining({
          tableSessionId: 's1',
          paymentId: 'pay-scoped',
          splitMode: 'ITEM',
          remaining: 20,
          sessionPaid: false,
        }),
      );
      expect(mockEvents.emitToRestaurant).not.toHaveBeenCalledWith(
        'rest1',
        'payment:confirmed',
        expect.anything(),
      );
    });

    it('records a scoped payment for already-settled units as SUCCEEDED-for-refund without double-settling (#M1)', async () => {
      mockStripeProvider.constructWebhookEvent!.mockReturnValue({
        type: 'payment_intent.succeeded',
        id: 'evt_conflict',
        data: { object: { id: 'pi_conflict' } },
      });
      const payment = {
        id: 'pay-conflict',
        amount: 10,
        tipAmount: 0,
        status: 'ABANDONED', // customer abandoned, but the intent still captured
        tableSessionId: 's1',
        restaurantId: 'rest1',
        providerPayload: {
          checkoutScope: {
            kind: 'ORDER_ITEMS',
            orderIds: ['order-owned'],
            chargeSubtotal: 10,
            allocations: [
              {
                orderItemId: 'oi-soup',
                quantity: 1,
                amount: 10,
                snapshotPaid: 0,
              },
            ],
          },
        },
        tableSession: {
          id: 's1',
          restaurantId: 'rest1',
          tableId: 'table1',
          table: { name: '3' },
        },
      };
      mockPrisma.payment.findFirst.mockResolvedValue(payment);
      mockPrisma.tableSession.findFirst.mockResolvedValue({ id: 's1' });
      // The soup was settled out-of-band (paidQuantity moved 0 -> 1) after the
      // scope snapshot was taken.
      mockPrisma.orderItem.findMany.mockResolvedValue([
        { id: 'oi-soup', paidQuantity: 1 },
      ]);
      mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });

      await service.handleWebhookEvent(Buffer.from('{}'), 'sig');

      // Money recorded SUCCEEDED + flagged for refund; NOT thrown (which would
      // roll back the dedup and make Stripe retry forever).
      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'pay-conflict', status: { in: ['PENDING', 'ABANDONED'] } },
        data: expect.objectContaining({
          status: 'SUCCEEDED',
          providerStatus: 'SCOPE_CONFLICT_NEEDS_RECONCILIATION',
        }),
      });
      expect(mockPrisma.paymentReconciliationIssue.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { paymentId: 'pay-conflict' },
          create: expect.objectContaining({
            reason: 'SCOPE_CONFLICT',
            status: 'OPEN',
          }),
        }),
      );
      // No second settlement of the already-paid unit, no allocations, no
      // session flip, no payment:confirmed.
      expect(mockPrisma.orderItem.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.paymentAllocation.createMany).not.toHaveBeenCalled();
      expect(mockPrisma.tableSession.updateMany).not.toHaveBeenCalled();
      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        'rest1',
        'payment:refundRequired',
        expect.objectContaining({
          paymentId: 'pay-conflict',
          reason: 'SCOPE_CONFLICT',
        }),
      );
      expect(mockEvents.emitToRestaurant).not.toHaveBeenCalledWith(
        'rest1',
        'payment:confirmed',
        expect.anything(),
      );
    });

    it('records an underpayment as a partial and leaves the session OPEN (#H4)', async () => {
      mockStripeProvider.constructWebhookEvent!.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_test' } },
      });
      const payment = {
        id: 'pay1',
        amount: 10, // stale low intent
        tipAmount: 0,
        status: 'PENDING',
        tableSessionId: 's1',
        tableSession: {
          restaurantId: 'rest1',
          tableId: 'table1',
          table: { name: '3' },
        },
      };
      mockPrisma.payment.findFirst.mockResolvedValue(payment);
      // Bill grew to 110 after the intent was created (e.g. pricey item added).
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 110 }]);
      mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });

      await service.handleWebhookEvent(Buffer.from('{}'), 'sig');

      // The captured €10 IS recorded (never left PENDING → the session would
      // otherwise be bricked and the money lost on the books)...
      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'SUCCEEDED' }),
        }),
      );
      // ...but the session is NOT flipped to PAID and no payment:confirmed fires.
      expect(mockPrisma.tableSession.updateMany).not.toHaveBeenCalled();
      // Staff are notified via bill:updated (partial), not payment:confirmed.
      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        'rest1',
        'bill:updated',
        expect.objectContaining({ sessionPaid: false }),
      );
      expect(mockEvents.emitToRestaurant).not.toHaveBeenCalledWith(
        'rest1',
        'payment:confirmed',
        expect.anything(),
      );
    });

    it('is idempotent: a double-delivered succeeded event skips socket emission (#H3)', async () => {
      mockStripeProvider.constructWebhookEvent!.mockReturnValue({
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
      mockStripeProvider.constructWebhookEvent!.mockReturnValue({
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
      mockStripeProvider.constructWebhookEvent!.mockReturnValue({
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
      mockStripeProvider.constructWebhookEvent!.mockReturnValue({
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
      mockStripeProvider.constructWebhookEvent!.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_orphan' } },
      });
      mockPrisma.payment.findFirst.mockResolvedValue(null);

      await service.handleWebhookEvent(Buffer.from('{}'), 'sig');

      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.tableSession.updateMany).not.toHaveBeenCalled();
      expect(mockEvents.emitToRestaurant).not.toHaveBeenCalled();
    });

    // Issue 36 regression: req.body must be a raw Buffer so Stripe signature
    // verification (constructEvent) can compare against the original bytes.
    // DO NOT change to @Body() or req.rawBody — that breaks HMAC verification.
    it('passes raw Buffer payload to constructWebhookEvent (Issue 36 regression)', async () => {
      const rawPayload = Buffer.from('{"type":"test"}');
      mockStripeProvider.constructWebhookEvent!.mockReturnValue({
        type: 'unknown.event',
        data: { object: {} },
      });

      await service.handleWebhookEvent(rawPayload, 'sig');

      const [capturedPayload] = mockStripeProvider.constructWebhookEvent!.mock
        .calls[0] as [Buffer, string];
      expect(Buffer.isBuffer(capturedPayload)).toBe(true);
      expect(capturedPayload).toBe(rawPayload);
    });

    // F-PAY-1 (v2): refund.updated / refund.failed resolve a PENDING
    // RefundAttempt. The payment stayed SUCCEEDED with allocations intact, so
    // `succeeded` finalizes (flip -> REFUNDED + reverse from snapshot) and
    // `failed`/`canceled` only mark the attempt — nothing to restore.
    describe('refund.updated (F-PAY-1 reconciliation)', () => {
      const pendingAttempt = {
        id: 'ra-rp',
        paymentId: 'pay-rp',
        status: 'PENDING',
        allocationSnapshot: [{ orderItemId: 'oi-1', quantity: 2, amount: 5 }],
      };
      const paidPayment = {
        id: 'pay-rp',
        restaurantId: 'rest1',
        amount: 24,
        status: 'SUCCEEDED',
        stripePaymentIntentId: 'pi_rp',
        tableSessionId: 's1',
        tableSession: { table: { name: 'Table 3' } },
      };

      it('propagates a provider-refund lookup database failure', async () => {
        mockStripeProvider.constructWebhookEvent!.mockReturnValue({
          id: 'evt_refund_lookup_error',
          type: 'refund.updated',
          data: {
            object: {
              id: 're_lookup_error',
              status: 'succeeded',
              payment_intent: 'pi_rp',
              amount: 2400,
            },
          },
        });
        mockPrisma.refundAttempt.findUnique.mockRejectedValue(
          new Error('database unavailable'),
        );
        const loggerError = jest
          .spyOn((service as any).stripeCheckout.logger, 'error')
          .mockImplementation();

        await expect(
          service.handleWebhookEvent(Buffer.from('{}'), 'sig'),
        ).rejects.toThrow('database unavailable');
        expect(loggerError).toHaveBeenCalledWith(
          'Stripe refund webhook lookup failed',
          expect.objectContaining({
            refundId: 're_lookup_error',
            paymentIntentId: 'pi_rp',
            lookup: 'providerRefundId',
            error: 'database unavailable',
          }),
        );
        expect(mockPrisma.payment.findUnique).not.toHaveBeenCalled();
      });

      it('finalizes the payment to REFUNDED and reverses allocations when the refund succeeded', async () => {
        mockStripeProvider.constructWebhookEvent!.mockReturnValue({
          id: 'evt_refund_ok',
          type: 'refund.updated',
          data: {
            object: {
              id: 're_1',
              status: 'succeeded',
              payment_intent: 'pi_rp',
              amount: 2400,
            },
          },
        });
        mockPrisma.refundAttempt.findUnique.mockResolvedValue(pendingAttempt);
        mockPrisma.payment.findUnique.mockResolvedValue(paidPayment);
        mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });

        await service.handleWebhookEvent(Buffer.from('{}'), 'sig');

        expect(mockPrisma.refundAttempt.findUnique).toHaveBeenCalledWith({
          where: { providerRefundId: 're_1' },
        });
        expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith({
          where: { id: 'pay-rp', status: 'SUCCEEDED' },
          data: { status: 'REFUNDED' },
        });
        expect(mockPrisma.orderItem.updateMany).toHaveBeenCalledWith({
          where: { id: 'oi-1', paidQuantity: { gte: 2 } },
          data: { paidQuantity: { decrement: 2 } },
        });
        expect(mockPrisma.paymentAllocation.deleteMany).toHaveBeenCalledWith({
          where: { paymentId: 'pay-rp' },
        });
        expect(mockPrisma.refundAttempt.updateMany).toHaveBeenCalledWith({
          where: { id: 'ra-rp' },
          data: { status: 'SUCCEEDED', providerRefundId: 're_1' },
        });
        expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
          'rest1',
          'payment:refunded',
          expect.objectContaining({ paymentId: 'pay-rp', refundId: 're_1' }),
        );
      });

      it('aborts finalization when an allocation snapshot cannot be reversed', async () => {
        mockStripeProvider.constructWebhookEvent!.mockReturnValue({
          id: 'evt_refund_allocation_drift',
          type: 'refund.updated',
          data: {
            object: {
              id: 're_allocation_drift',
              status: 'succeeded',
              payment_intent: 'pi_rp',
              amount: 2400,
            },
          },
        });
        mockPrisma.refundAttempt.findUnique.mockResolvedValue(pendingAttempt);
        mockPrisma.payment.findUnique.mockResolvedValue(paidPayment);
        mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.orderItem.updateMany.mockResolvedValue({ count: 0 });

        await expect(
          service.handleWebhookEvent(Buffer.from('{}'), 'sig'),
        ).rejects.toThrow(
          'Refund allocation invariant failed for order item oi-1',
        );

        expect(mockPrisma.paymentAllocation.deleteMany).not.toHaveBeenCalled();
        expect(mockPrisma.refundAttempt.updateMany).not.toHaveBeenCalledWith({
          where: { id: 'ra-rp' },
          data: expect.objectContaining({ status: 'SUCCEEDED' }),
        });
        expect(mockEvents.emitToRestaurant).not.toHaveBeenCalledWith(
          expect.anything(),
          'payment:refunded',
          expect.anything(),
        );
      });

      it('fails closed instead of silently dropping a malformed persisted allocation snapshot', async () => {
        mockStripeProvider.constructWebhookEvent!.mockReturnValue({
          id: 'evt_refund_malformed_snapshot',
          type: 'refund.updated',
          data: {
            object: {
              id: 're_malformed_snapshot',
              status: 'succeeded',
              payment_intent: 'pi_rp',
              amount: 2400,
            },
          },
        });
        mockPrisma.refundAttempt.findUnique.mockResolvedValue({
          ...pendingAttempt,
          allocationSnapshot: [
            { orderItemId: 'oi-1', quantity: -1, amount: 5 },
          ],
        });
        mockPrisma.payment.findUnique.mockResolvedValue(paidPayment);

        await expect(
          service.handleWebhookEvent(Buffer.from('{}'), 'sig'),
        ).rejects.toThrow('Refund allocation snapshot is invalid');

        expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
        expect(mockPrisma.paymentAllocation.deleteMany).not.toHaveBeenCalled();
        expect(mockEvents.emitToRestaurant).not.toHaveBeenCalledWith(
          expect.anything(),
          'payment:refunded',
          expect.anything(),
        );
      });

      it('marks the attempt FAILED and leaves the payment paid when the refund failed', async () => {
        mockStripeProvider.constructWebhookEvent!.mockReturnValue({
          id: 'evt_refund_failed',
          type: 'refund.updated',
          data: {
            object: {
              id: 're_2',
              status: 'failed',
              payment_intent: 'pi_rp',
              amount: 2400,
            },
          },
        });
        mockPrisma.refundAttempt.findUnique.mockResolvedValue(pendingAttempt);
        mockPrisma.payment.findUnique.mockResolvedValue(paidPayment);

        await service.handleWebhookEvent(Buffer.from('{}'), 'sig');

        expect(mockPrisma.refundAttempt.updateMany).toHaveBeenCalledWith({
          where: { id: 'ra-rp', status: 'PENDING' },
          data: { status: 'FAILED', providerRefundId: 're_2' },
        });
        // Payment untouched, no allocation reversal, no refunded event.
        expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
        expect(mockPrisma.orderItem.updateMany).not.toHaveBeenCalled();
        expect(mockEvents.emitToRestaurant).not.toHaveBeenCalledWith(
          expect.anything(),
          'payment:refunded',
          expect.anything(),
        );
      });

      it('handles the dedicated refund.failed event the same as a failed status', async () => {
        mockStripeProvider.constructWebhookEvent!.mockReturnValue({
          id: 'evt_refund_failed_evt',
          type: 'refund.failed',
          data: {
            object: {
              id: 're_9',
              status: null,
              payment_intent: 'pi_rp',
              amount: 2400,
            },
          },
        });
        mockPrisma.refundAttempt.findUnique.mockResolvedValue(pendingAttempt);
        mockPrisma.payment.findUnique.mockResolvedValue(paidPayment);

        await service.handleWebhookEvent(Buffer.from('{}'), 'sig');

        expect(mockPrisma.refundAttempt.updateMany).toHaveBeenCalledWith({
          where: { id: 'ra-rp', status: 'PENDING' },
          data: { status: 'FAILED', providerRefundId: 're_9' },
        });
        expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
      });

      it('correlates by application attempt metadata when the refund id is not yet recorded', async () => {
        mockStripeProvider.constructWebhookEvent!.mockReturnValue({
          id: 'evt_refund_fallback',
          type: 'refund.updated',
          data: {
            object: {
              id: 're_new',
              status: 'succeeded',
              payment_intent: 'pi_rp',
              amount: 2400,
              metadata: { refundAttemptId: 'ra-rp' },
            },
          },
        });
        mockPrisma.refundAttempt.findUnique
          .mockResolvedValueOnce(null) // providerRefundId not recorded yet
          .mockResolvedValueOnce(pendingAttempt); // exact application attempt
        mockPrisma.payment.findUnique.mockResolvedValue(paidPayment);
        mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });

        await service.handleWebhookEvent(Buffer.from('{}'), 'sig');

        expect(mockPrisma.refundAttempt.findUnique).toHaveBeenNthCalledWith(2, {
          where: { id: 'ra-rp' },
        });
        expect(mockPrisma.payment.findFirst).not.toHaveBeenCalled();
        expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith({
          where: { id: 'pay-rp', status: 'SUCCEEDED' },
          data: { status: 'REFUNDED' },
        });
      });

      it('does not attach an unrelated partial refund by PaymentIntent alone', async () => {
        mockStripeProvider.constructWebhookEvent!.mockReturnValue({
          id: 'evt_manual_partial',
          type: 'refund.updated',
          data: {
            object: {
              id: 're_manual',
              status: 'succeeded',
              payment_intent: 'pi_rp',
              amount: 500,
              metadata: {},
            },
          },
        });
        mockPrisma.refundAttempt.findUnique.mockResolvedValue(null);
        // This is the unsafe match the old PaymentIntent fallback would pick.
        mockPrisma.payment.findFirst.mockResolvedValue({
          ...paidPayment,
          refundAttempts: [pendingAttempt],
        });

        await service.handleWebhookEvent(Buffer.from('{}'), 'sig');

        expect(mockPrisma.payment.findFirst).not.toHaveBeenCalled();
        expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
        expect(mockPrisma.orderItem.updateMany).not.toHaveBeenCalled();
        expect(mockPrisma.paymentProviderEvent.create).not.toHaveBeenCalled();
      });

      it('rejects attempt metadata when the Stripe refund amount is not the full payment amount', async () => {
        mockStripeProvider.constructWebhookEvent!.mockReturnValue({
          id: 'evt_wrong_amount',
          type: 'refund.updated',
          data: {
            object: {
              id: 're_wrong_amount',
              status: 'succeeded',
              payment_intent: 'pi_rp',
              amount: 500,
              metadata: { refundAttemptId: 'ra-rp' },
            },
          },
        });
        mockPrisma.refundAttempt.findUnique
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(pendingAttempt);
        mockPrisma.payment.findUnique.mockResolvedValue(paidPayment);

        await service.handleWebhookEvent(Buffer.from('{}'), 'sig');

        expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
        expect(mockPrisma.orderItem.updateMany).not.toHaveBeenCalled();
        expect(mockPrisma.paymentProviderEvent.create).not.toHaveBeenCalled();
      });

      it('is idempotent: does nothing when the attempt is already resolved', async () => {
        mockStripeProvider.constructWebhookEvent!.mockReturnValue({
          id: 'evt_refund_resolved',
          type: 'refund.updated',
          data: {
            object: {
              id: 're_1',
              status: 'succeeded',
              payment_intent: 'pi_rp',
            },
          },
        });
        mockPrisma.refundAttempt.findUnique.mockResolvedValue({
          ...pendingAttempt,
          status: 'SUCCEEDED',
        });
        mockPrisma.payment.findUnique.mockResolvedValue(paidPayment);

        await service.handleWebhookEvent(Buffer.from('{}'), 'sig');

        expect(mockPrisma.paymentProviderEvent.create).not.toHaveBeenCalled();
        expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
        expect(mockPrisma.refundAttempt.updateMany).not.toHaveBeenCalled();
      });

      it('ignores a still-pending refund status', async () => {
        mockStripeProvider.constructWebhookEvent!.mockReturnValue({
          id: 'evt_refund_pending',
          type: 'refund.updated',
          data: {
            object: { id: 're_3', status: 'pending', payment_intent: 'pi_rp' },
          },
        });

        await service.handleWebhookEvent(Buffer.from('{}'), 'sig');

        // Never even correlates — the status filter short-circuits first.
        expect(mockPrisma.refundAttempt.findUnique).not.toHaveBeenCalled();
        expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
      });

      it('is a no-op when no attempt matches the refund', async () => {
        mockStripeProvider.constructWebhookEvent!.mockReturnValue({
          id: 'evt_refund_none',
          type: 'refund.updated',
          data: {
            object: {
              id: 're_4',
              status: 'succeeded',
              payment_intent: 'pi_unknown',
            },
          },
        });
        mockPrisma.refundAttempt.findUnique.mockResolvedValue(null);
        mockPrisma.payment.findFirst.mockResolvedValue(null);

        await service.handleWebhookEvent(Buffer.from('{}'), 'sig');

        expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
      });
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
      mockStripeProvider.retrievePaymentIntent!.mockResolvedValue({
        clientSecret: 'cs_existing',
      });

      const result = await service.createPaymentIntent('tok1', 0);

      expect(result.clientSecret).toBe('cs_existing');
      expect(result.paymentId).toBe('pay-existing');
      expect(mockStripeProvider.createPaymentIntent).not.toHaveBeenCalled();
    });

    it('abandons a matching DB row when Stripe says its intent is missing', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([
        {
          id: 'pay-missing',
          provider: 'STRIPE',
          status: 'PENDING',
          stripePaymentIntentId: 'pi_missing',
          providerReference: 'stripe:sess-1:2000:0:eur',
          amount: 20,
        },
      ]);
      mockStripeProvider.retrievePaymentIntent!.mockResolvedValue(null);
      mockPrisma.payment.create.mockResolvedValue({ id: 'pay-new' });
      mockStripeProvider.createPaymentIntent!.mockResolvedValue({
        clientSecret: 'cs_new',
        paymentIntentId: 'pi_new',
      });
      mockPrisma.payment.update.mockResolvedValue({});

      const result = await service.createPaymentIntent('tok1', 0);

      expect(mockStripeProvider.cancelPaymentIntent).not.toHaveBeenCalled();
      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'pay-missing', status: 'PENDING' },
        data: {
          status: 'ABANDONED',
          providerStatus: 'ABANDONED',
          providerReference: null,
        },
      });
      expect(mockEvents.emitToTableSession).toHaveBeenCalledWith(
        'sess-1',
        'billPayment:cleared',
        {
          id: 'pay-missing',
          tableSessionId: 'sess-1',
          source: 'ONLINE_PAYMENT',
        },
      );
      expect(result).toEqual({
        clientSecret: 'cs_new',
        paymentId: 'pay-new',
        total: 20,
        tipAmount: 0,
      });
    });

    it('does not create a replacement intent when Stripe retrieval fails transiently', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([
        {
          id: 'pay-existing',
          provider: 'STRIPE',
          status: 'PENDING',
          stripePaymentIntentId: 'pi_existing',
          providerReference: 'stripe:sess-1:2000:0:eur',
          amount: 20,
        },
      ]);
      mockStripeProvider.retrievePaymentIntent!.mockRejectedValue(
        new Error('stripe timeout'),
      );

      await expect(service.createPaymentIntent('tok1', 0)).rejects.toThrow(
        'stripe timeout',
      );
      expect(mockStripeProvider.cancelPaymentIntent).not.toHaveBeenCalled();
      expect(mockStripeProvider.createPaymentIntent).not.toHaveBeenCalled();
      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
    });

    it('creates new intent when no PENDING Stripe intent exists', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.payment.create.mockResolvedValue({ id: 'pay-new' });
      mockStripeProvider.createPaymentIntent!.mockResolvedValue({
        clientSecret: 'cs_new',
        paymentIntentId: 'pi_new',
      });
      mockPrisma.payment.update.mockResolvedValue({});

      const result = await service.createPaymentIntent('tok1', 0);

      expect(mockStripeProvider.createPaymentIntent).toHaveBeenCalledTimes(1);
      expect(mockStripeProvider.createPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'stripe:sess-1:2000:0:eur',
        }),
      );
      expect(result.clientSecret).toBe('cs_new');
    });

    it('reuses the existing intent when a concurrent create hits the checkout key unique constraint', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.payment.create.mockRejectedValue({ code: 'P2002' });
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: 'pay-existing',
        provider: 'STRIPE',
        providerReference: 'stripe:sess-1:2000:0:eur',
        status: 'PENDING',
        stripePaymentIntentId: 'pi_existing',
      });
      mockStripeProvider.retrievePaymentIntent!.mockResolvedValue({
        clientSecret: 'cs_existing',
      });

      const result = await service.createPaymentIntent('tok1', 0);

      expect(result).toEqual({
        clientSecret: 'cs_existing',
        paymentId: 'pay-existing',
        total: 20,
        tipAmount: 0,
      });
      expect(mockStripeProvider.createPaymentIntent).not.toHaveBeenCalled();
    });

    it('rejects a concurrent create while the first request is still preparing the intent', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.payment.create.mockRejectedValue({ code: 'P2002' });
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: 'pay-existing',
        provider: 'STRIPE',
        providerReference: 'stripe:sess-1:2000:0:eur',
        status: 'PENDING',
        stripePaymentIntentId: null,
      });

      await expect(service.createPaymentIntent('tok1', 0)).rejects.toThrow(
        ConflictException,
      );
      expect(mockStripeProvider.createPaymentIntent).not.toHaveBeenCalled();
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

    it('blocks close when checkout payment remains pending after abandon', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        status: 'OPEN',
        restaurantId: 'rest1',
      });
      const pendingPayment = {
        id: 'pay-pending',
        provider: 'STRIPE',
        stripePaymentIntentId: 'pi_pending',
      };
      mockPrisma.payment.findMany.mockResolvedValue([pendingPayment]);
      mockPrisma.payment.findFirst.mockResolvedValue(pendingPayment);
      mockStripeProvider.cancelPaymentIntent.mockRejectedValue(
        new Error('Stripe unavailable'),
      );

      await expect(
        service.closeSession('tok1', 'rest1', 'owner1'),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.tableSession.update).not.toHaveBeenCalled();
    });

    it('blocks close when a pending payment appears inside the close transaction', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        status: 'OPEN',
        restaurantId: 'rest1',
      });
      const pendingPayment = {
        id: 'pay-race',
        provider: 'EPAY',
        stripePaymentIntentId: null,
      };
      mockPrisma.payment.findMany.mockResolvedValue([pendingPayment]);
      mockPrisma.payment.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.payment.findFirst.mockResolvedValue(pendingPayment);

      await expect(
        service.closeSession('tok1', 'rest1', 'owner1'),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.tableSession.update).not.toHaveBeenCalled();
      expect(mockEvents.emitTableStatusChanged).not.toHaveBeenCalled();
    });

    it('rejects close when an order is added before the session lock is acquired', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        token: 'tok1',
        tableId: 'table1',
        restaurantId: 'rest1',
        status: 'OPEN',
      });
      mockPrisma.order.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

      await expect(
        service.closeSession('tok1', 'rest1', 'owner1'),
      ).rejects.toThrow(
        'An order was added while the table was being closed. Review the table and retry.',
      );

      expect(mockPrisma.tableSession.update).not.toHaveBeenCalled();
      expect(mockEvents.emitTableStatusChanged).not.toHaveBeenCalled();
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

    it('applies provider and search filters before pagination', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.payment.count.mockResolvedValue(0);

      await service.getPaymentHistory(
        'rest1',
        { provider: 'STRIPE', search: 'Table 3', page: 2, limit: 5 },
        'owner1',
      );

      expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5,
          take: 5,
          where: expect.objectContaining({
            restaurantId: 'rest1',
            provider: 'STRIPE',
            OR: expect.arrayContaining([
              {
                tableSession: {
                  is: {
                    table: {
                      name: { contains: 'Table 3', mode: 'insensitive' },
                    },
                  },
                },
              },
            ]),
          }),
        }),
      );
      expect(mockPrisma.payment.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          provider: 'STRIPE',
          OR: expect.any(Array),
        }),
      });
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
    const sessionOrder = {
      id: 'order1',
      customerName: 'Maria',
      customerPhone: null,
      totalPrice: 20,
      status: 'SERVED',
      specialRequests: null,
      source: 'CUSTOMER',
      staff: null,
      createdAt: new Date('2026-05-24T09:50:00Z'),
      items: [
        {
          itemName: 'Soup snapshot',
          quantity: 2,
          unitPriceWithOptions: 10,
          selectedOptions: [],
        },
      ],
    };

    const paymentDetail = (overrides: Record<string, unknown> = {}) => ({
      id: 'pay1',
      restaurantId: 'rest1',
      amount: 24,
      tipAmount: 4,
      platformFeeAmount: 1,
      currency: 'eur',
      status: 'SUCCEEDED',
      stripePaymentIntentId: 'pi_123',
      provider: 'STRIPE',
      splitMode: null,
      allocations: [],
      createdAt: new Date('2026-05-24T10:00:00Z'),
      updatedAt: new Date('2026-05-24T10:01:00Z'),
      tableSessionId: 'sess1',
      tableSession: {
        createdAt: new Date('2026-05-24T09:45:00Z'),
        table: { id: 'table1', name: 'Table 3' },
        orders: [sessionOrder],
      },
      ...overrides,
    });

    it('returns a detailed payment with order items and breakdown', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(paymentDetail());

      const result = await service.getPaymentDetail('pay1', 'owner1');

      expect(result.table?.name).toBe('Table 3');
      expect(result.breakdown.net).toBe(23);
      expect(result.orders[0].items[0]).toEqual({
        name: 'Soup snapshot',
        quantity: 2,
        unitPrice: 10,
        options: [],
      });
    });

    it('shows only item allocations on an item-split receipt', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(
        paymentDetail({
          splitMode: 'ITEM',
          amount: 6,
          tipAmount: 1,
          allocations: [
            {
              amount: 5,
              quantity: 1,
              orderItem: {
                itemName: 'Allocated soup snapshot',
                selectedOptions: [{ optionName: 'Size', choiceName: 'Small' }],
                order: { ...sessionOrder, items: undefined },
              },
            },
          ],
        }),
      );

      const result = await service.getPaymentDetail('pay1', 'owner1');

      expect(result.itemizationUnavailable).toBe(false);
      expect(result.orders).toHaveLength(1);
      expect(result.orders[0].totalPrice).toBe(5);
      expect(result.orders[0].items).toEqual([
        {
          name: 'Allocated soup snapshot',
          quantity: 1,
          unitPrice: 5,
          options: ['Small'],
        },
      ]);
    });

    it('does not misrepresent an amount split as the full table receipt', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(
        paymentDetail({ splitMode: 'EVEN' }),
      );

      const result = await service.getPaymentDetail('pay1', 'owner1');

      expect(result.orders).toEqual([]);
      expect(result.itemizationUnavailable).toBe(true);
    });

    it('does not show the full table receipt for a remaining-balance payment', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(
        paymentDetail({ amount: 14, tipAmount: 4 }),
      );

      const result = await service.getPaymentDetail('pay1', 'owner1');

      expect(result.orders).toEqual([]);
      expect(result.itemizationUnavailable).toBe(true);
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

    it('creates a Stripe refund and finalizes to REFUNDED on synchronous success', async () => {
      mockPrisma.payment.findUnique
        .mockResolvedValueOnce(succeededPayload) // initial fetch
        .mockResolvedValueOnce(refundedPayload); // post-update fetch
      mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
      mockStripeProvider.createRefund!.mockResolvedValue({
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
        refundAttemptId: 'ra1',
        idempotencyKey: 'refund_pay1',
      });
      // F-PAY-1 (v2): attempt persisted PENDING with the snapshot, THEN Stripe,
      // THEN — on synchronous success only — the payment flips SUCCEEDED ->
      // REFUNDED. It is never moved to REFUND_PENDING.
      expect(mockPrisma.refundAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paymentId: 'pay1',
            idempotencyKey: 'refund_pay1',
            status: 'PENDING',
            allocationSnapshot: [],
          }),
        }),
      );
      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'pay1', status: 'SUCCEEDED' },
        data: { status: 'REFUNDED' },
      });
      expect(mockPrisma.refundAttempt.updateMany).toHaveBeenCalledWith({
        where: { id: 'ra1' },
        data: { status: 'SUCCEEDED', providerRefundId: 're_123' },
      });
      expect(result.payment.status).toBe('REFUNDED');
      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        'rest1',
        'payment:refunded',
        expect.objectContaining({ paymentId: 'pay1', refundId: 're_123' }),
      );
    });

    it('reverses split item allocations only after Stripe confirms success', async () => {
      mockPrisma.payment.findUnique
        .mockResolvedValueOnce({
          ...succeededPayload,
          allocations: [{ orderItemId: 'oi-1', quantity: 2, amount: 5 }],
        })
        .mockResolvedValueOnce(refundedPayload);
      mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.orderItem.updateMany.mockResolvedValue({ count: 1 });
      mockStripeProvider.createRefund!.mockResolvedValue({
        refundId: 're_123',
        status: 'succeeded',
      });

      await service.refundPayment('pay1', 'owner1', {});

      // Snapshot persisted before Stripe.
      expect(mockPrisma.refundAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            allocationSnapshot: [
              { orderItemId: 'oi-1', quantity: 2, amount: 5 },
            ],
          }),
        }),
      );
      // Reversed from the snapshot on confirmed success.
      expect(mockPrisma.orderItem.updateMany).toHaveBeenCalledWith({
        where: { id: 'oi-1', paidQuantity: { gte: 2 } },
        data: { paidQuantity: { decrement: 2 } },
      });
      expect(mockPrisma.paymentAllocation.deleteMany).toHaveBeenCalledWith({
        where: { paymentId: 'pay1' },
      });
    });

    // F-PAY-1 (v2): the crux — an ambiguous Stripe error (timeout/connection/
    // 5xx) must NOT touch the payment or its allocations. The attempt stays
    // PENDING (snapshot already persisted) and the payment stays SUCCEEDED, so
    // the bill is never exposed as unpaid and the webhook/cron can resolve it.
    it('leaves the attempt PENDING and the payment untouched on an ambiguous Stripe error', async () => {
      mockPrisma.payment.findUnique.mockResolvedValueOnce({
        ...succeededPayload,
        allocations: [{ orderItemId: 'oi-1', quantity: 2, amount: 5 }],
      });
      mockStripeProvider.createRefund!.mockRejectedValue(
        Object.assign(new Error('socket hang up'), {
          type: 'StripeConnectionError',
        }),
      );

      await expect(service.refundPayment('pay1', 'owner1', {})).rejects.toThrow(
        'socket hang up',
      );

      // Snapshot persisted, but nothing reversed and nothing marked terminal.
      expect(mockPrisma.refundAttempt.create).toHaveBeenCalled();
      expect(mockPrisma.orderItem.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.paymentAllocation.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.refundAttempt.updateMany).not.toHaveBeenCalled();
    });

    it('marks the attempt FAILED (payment untouched) on a definitive Stripe rejection', async () => {
      mockPrisma.payment.findUnique.mockResolvedValueOnce({
        ...succeededPayload,
        allocations: [{ orderItemId: 'oi-1', quantity: 2, amount: 5 }],
      });
      mockStripeProvider.createRefund!.mockRejectedValue(
        Object.assign(new Error('stripe refund failed'), {
          type: 'StripeInvalidRequestError',
        }),
      );

      await expect(service.refundPayment('pay1', 'owner1', {})).rejects.toThrow(
        'stripe refund failed',
      );

      expect(mockPrisma.refundAttempt.updateMany).toHaveBeenCalledWith({
        where: { id: 'ra1', status: 'PENDING' },
        data: { status: 'FAILED' },
      });
      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.orderItem.updateMany).not.toHaveBeenCalled();
    });

    it('logs identifiers and preserves the provider error when refund FAILED persistence fails', async () => {
      mockPrisma.payment.findUnique.mockResolvedValueOnce({
        ...succeededPayload,
        allocations: [{ orderItemId: 'oi-1', quantity: 2, amount: 5 }],
      });
      mockStripeProvider.createRefund!.mockRejectedValue(
        Object.assign(new Error('stripe refund failed'), {
          type: 'StripeInvalidRequestError',
        }),
      );
      mockPrisma.refundAttempt.updateMany.mockRejectedValueOnce(
        new Error('database unavailable'),
      );
      const loggerError = jest
        .spyOn((service as any).stripeCheckout.logger, 'error')
        .mockImplementation();

      await expect(service.refundPayment('pay1', 'owner1', {})).rejects.toThrow(
        'stripe refund failed',
      );
      expect(loggerError).toHaveBeenCalledWith(
        expect.stringContaining('attempt remains reconcilable'),
        expect.objectContaining({
          paymentId: 'pay1',
          refundAttemptId: 'ra1',
          providerError: 'stripe refund failed',
          persistenceError: 'database unavailable',
        }),
      );
    });

    it('keeps the attempt PENDING when Stripe returns a synchronous pending status', async () => {
      mockPrisma.payment.findUnique
        .mockResolvedValueOnce(succeededPayload)
        .mockResolvedValueOnce(succeededPayload); // payment still SUCCEEDED
      mockStripeProvider.createRefund!.mockResolvedValue({
        refundId: 're_pending',
        status: 'pending',
      });

      const result = await service.refundPayment('pay1', 'owner1', {});

      expect(mockPrisma.refundAttempt.updateMany).toHaveBeenCalledWith({
        where: { id: 'ra1', status: 'PENDING' },
        data: { status: 'PENDING', providerRefundId: 're_pending' },
      });
      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
      expect(result.refund?.status).toBe('pending');
      expect(mockEvents.emitToRestaurant).not.toHaveBeenCalledWith(
        expect.anything(),
        'payment:refunded',
        expect.anything(),
      );
    });

    it('rejects a second refund when one is already in progress', async () => {
      mockPrisma.payment.findUnique.mockResolvedValueOnce({
        ...succeededPayload,
        refundAttempts: [{ id: 'ra1', status: 'PENDING' }],
      });

      await expect(service.refundPayment('pay1', 'owner1', {})).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrisma.refundAttempt.create).not.toHaveBeenCalled();
      expect(mockStripeProvider.createRefund).not.toHaveBeenCalled();
    });

    it('rejects a duplicate refund when the attempt unique key races (P2002)', async () => {
      mockPrisma.payment.findUnique.mockResolvedValueOnce(succeededPayload);
      mockPrisma.refundAttempt.create.mockRejectedValueOnce({ code: 'P2002' });

      await expect(service.refundPayment('pay1', 'owner1', {})).rejects.toThrow(
        ConflictException,
      );
      expect(mockStripeProvider.createRefund).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the payment is already refunded', async () => {
      mockPrisma.payment.findUnique.mockResolvedValueOnce({
        ...succeededPayload,
        status: 'REFUNDED',
      });

      await expect(service.refundPayment('pay1', 'owner1', {})).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrisma.refundAttempt.create).not.toHaveBeenCalled();
      expect(mockStripeProvider.createRefund).not.toHaveBeenCalled();
    });

    it('rejects MYPOS refunds with BadRequestException', async () => {
      mockPrisma.payment.findUnique.mockResolvedValueOnce({
        ...succeededPayload,
        provider: PaymentProvider.MYPOS,
        stripePaymentIntentId: null,
      });

      await expect(service.refundPayment('pay1', 'owner1', {})).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.refundAttempt.create).not.toHaveBeenCalled();
    });

    it('rejects CASH refunds with BadRequestException (#C4)', async () => {
      mockPrisma.payment.findUnique.mockResolvedValueOnce({
        ...succeededPayload,
        provider: PaymentProvider.CASH,
        stripePaymentIntentId: null,
      });

      await expect(service.refundPayment('pay1', 'owner1', {})).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.refundAttempt.create).not.toHaveBeenCalled();
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
      expect(mockPrisma.refundAttempt.create).not.toHaveBeenCalled();
      expect(mockStripeProvider.createRefund).not.toHaveBeenCalled();
    });

    it('rejects partial refunds', async () => {
      mockPrisma.payment.findUnique.mockResolvedValueOnce({
        ...succeededPayload,
        provider: PaymentProvider.CASH,
      });

      await expect(
        service.refundPayment('pay1', 'owner1', { amount: 10 }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.refundAttempt.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when a Stripe payment has no payment intent', async () => {
      mockPrisma.payment.findUnique.mockResolvedValueOnce({
        ...succeededPayload,
        stripePaymentIntentId: null,
      });

      await expect(service.refundPayment('pay1', 'owner1', {})).rejects.toThrow(
        BadRequestException,
      );

      // Rejected before any attempt row or Stripe call.
      expect(mockPrisma.refundAttempt.create).not.toHaveBeenCalled();
      expect(mockStripeProvider.createRefund).not.toHaveBeenCalled();
    });
  });

  // F-PAY-1 (v2): the reconciliation cron resolves PENDING RefundAttempts whose
  // webhook never arrived (delivery failure/misconfigured endpoint) or whose
  // synchronous response was lost (timeout).
  describe('reconcilePendingRefunds (F-PAY-1 cron)', () => {
    function buildStripeCheckout() {
      const _prisma = mockPrisma as unknown as PrismaService;
      const _stripe = mockStripeProvider as unknown as StripeProvider;
      const _events = mockEvents as unknown as EventsGateway;
      const config = new PaymentProviderConfigService(mockFeatureService);
      const core = new PaymentCoreService(_prisma, _events, mockFeatureService);
      return new StripeCheckoutService(
        _prisma,
        _stripe,
        _events,
        mockFeatureService,
        core,
        config,
      );
    }

    const stuckAttempt = {
      id: 'ra-stuck',
      paymentId: 'pay-stuck',
      idempotencyKey: 'refund_pay-stuck',
      providerRefundId: 're_x',
      status: 'PENDING',
      reason: 'guest request',
      allocationSnapshot: [{ orderItemId: 'oi-1', quantity: 2, amount: 5 }],
      payment: {
        id: 'pay-stuck',
        restaurantId: 'rest1',
        amount: 24,
        tableSessionId: 's1',
        stripePaymentIntentId: 'pi_stuck',
      },
    };

    it('confirms REFUNDED via a direct retrieve when the refund id is known', async () => {
      mockPrisma.refundAttempt.findMany.mockResolvedValue([stuckAttempt]);
      mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
      mockStripeProvider.retrieveRefund!.mockResolvedValue({
        refundId: 're_x',
        status: 'succeeded',
      });

      await buildStripeCheckout().reconcilePendingRefunds();

      expect(mockStripeProvider.retrieveRefund).toHaveBeenCalledWith('re_x');
      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'pay-stuck', status: 'SUCCEEDED' },
        data: { status: 'REFUNDED' },
      });
      expect(mockPrisma.orderItem.updateMany).toHaveBeenCalledWith({
        where: { id: 'oi-1', paidQuantity: { gte: 2 } },
        data: { paidQuantity: { decrement: 2 } },
      });
      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        'rest1',
        'payment:refunded',
        expect.objectContaining({ paymentId: 'pay-stuck', refundId: 're_x' }),
      );
    });

    it('recovers a lost refund via idempotent re-create when no id was recorded', async () => {
      mockPrisma.refundAttempt.findMany.mockResolvedValue([
        { ...stuckAttempt, providerRefundId: null },
      ]);
      mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
      mockStripeProvider.createRefund!.mockResolvedValue({
        refundId: 're_recovered',
        status: 'succeeded',
      });

      await buildStripeCheckout().reconcilePendingRefunds();

      // Re-issued with the SAME deterministic key → Stripe returns the same
      // refund it created for the timed-out call (no double refund).
      expect(mockStripeProvider.createRefund).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'refund_pay-stuck',
          reason: 'guest request',
          refundAttemptId: 'ra-stuck',
        }),
      );
      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'pay-stuck', status: 'SUCCEEDED' },
        data: { status: 'REFUNDED' },
      });
    });

    it('marks the attempt FAILED and leaves the payment paid when Stripe shows failed', async () => {
      mockPrisma.refundAttempt.findMany.mockResolvedValue([stuckAttempt]);
      mockStripeProvider.retrieveRefund!.mockResolvedValue({
        refundId: 're_x',
        status: 'failed',
      });

      await buildStripeCheckout().reconcilePendingRefunds();

      expect(mockPrisma.refundAttempt.updateMany).toHaveBeenCalledWith({
        where: { id: 'ra-stuck', status: 'PENDING' },
        data: { status: 'FAILED', providerRefundId: 're_x' },
      });
      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.orderItem.updateMany).not.toHaveBeenCalled();
    });

    it('leaves the attempt alone when Stripe shows the refund is still pending', async () => {
      mockPrisma.refundAttempt.findMany.mockResolvedValue([stuckAttempt]);
      mockStripeProvider.retrieveRefund!.mockResolvedValue({
        refundId: 're_x',
        status: 'pending',
      });

      await buildStripeCheckout().reconcilePendingRefunds();

      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.refundAttempt.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.orderItem.updateMany).not.toHaveBeenCalled();
    });

    it('only queries PENDING attempts past the staleness threshold', async () => {
      mockPrisma.refundAttempt.findMany.mockResolvedValue([]);

      await buildStripeCheckout().reconcilePendingRefunds();

      expect(mockPrisma.refundAttempt.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PENDING',
            provider: 'STRIPE',
            updatedAt: expect.objectContaining({ lt: expect.any(Date) }),
          }),
        }),
      );
    });
  });

  describe('reconcilePendingPayments (stuck-payment cron)', () => {
    function buildStripeCheckout() {
      const _prisma = mockPrisma as unknown as PrismaService;
      const _stripe = mockStripeProvider as unknown as StripeProvider;
      const _events = mockEvents as unknown as EventsGateway;
      const config = new PaymentProviderConfigService(mockFeatureService);
      const core = new PaymentCoreService(_prisma, _events, mockFeatureService);
      return new StripeCheckoutService(
        _prisma,
        _stripe,
        _events,
        mockFeatureService,
        core,
        config,
      );
    }

    const stalePending = {
      id: 'pay-recover',
      restaurantId: 'rest1',
      tableSessionId: 's1',
      stripePaymentIntentId: 'pi_recover',
    };

    it('recovers a succeeded-but-unclaimed intent (lost webhook) by claiming it', async () => {
      mockPrisma.payment.findMany.mockResolvedValueOnce([stalePending]);
      mockStripeProvider.retrievePaymentIntent!.mockResolvedValue({
        clientSecret: null,
        status: 'succeeded',
      });
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: 'pay-recover',
        amount: 20,
        tipAmount: 0,
        status: 'PENDING',
        tableSessionId: 's1',
        restaurantId: 'rest1',
        providerPayload: {},
        tableSession: {
          restaurantId: 'rest1',
          tableId: 't1',
          table: { name: '3' },
        },
      });
      mockPrisma.tableSession.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });

      await buildStripeCheckout().reconcilePendingPayments();

      expect(mockStripeProvider.retrievePaymentIntent).toHaveBeenCalledWith(
        'pi_recover',
      );
      // Claimed → payment flipped SUCCEEDED, session flipped PAID.
      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'SUCCEEDED' }),
        }),
      );
      expect(mockPrisma.tableSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PAID' }),
        }),
      );
    });

    it('marks a canceled intent FAILED', async () => {
      mockPrisma.payment.findMany.mockResolvedValueOnce([stalePending]);
      mockStripeProvider.retrievePaymentIntent!.mockResolvedValue({
        clientSecret: null,
        status: 'canceled',
      });
      mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });

      await buildStripeCheckout().reconcilePendingPayments();

      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'pay-recover', status: 'PENDING' },
        data: { status: 'FAILED', providerStatus: 'canceled' },
      });
    });

    it('abandons an intent that no longer exists at Stripe (nothing captured)', async () => {
      mockPrisma.payment.findMany.mockResolvedValueOnce([stalePending]);
      mockStripeProvider.retrievePaymentIntent!.mockResolvedValue(null);
      mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });

      await buildStripeCheckout().reconcilePendingPayments();

      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'pay-recover', status: 'PENDING' },
        data: { status: 'ABANDONED', providerStatus: 'NOT_FOUND' },
      });
    });

    it('leaves a still-live (processing) intent PENDING — never blind-expires a possible success', async () => {
      mockPrisma.payment.findMany.mockResolvedValueOnce([stalePending]);
      mockStripeProvider.retrievePaymentIntent!.mockResolvedValue({
        clientSecret: 'cs',
        status: 'processing',
      });

      await buildStripeCheckout().reconcilePendingPayments();

      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.tableSession.updateMany).not.toHaveBeenCalled();
    });

    it('leaves the payment PENDING on a transient retrieve error', async () => {
      mockPrisma.payment.findMany.mockResolvedValueOnce([stalePending]);
      mockStripeProvider.retrievePaymentIntent!.mockRejectedValue(
        new Error('network'),
      );

      await buildStripeCheckout().reconcilePendingPayments();

      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('reconcileStuckSession (POS force-resolve)', () => {
    it('verifies POS access, abandons, and returns reconcile counts', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
      });
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ownerId: 'owner1',
        isActive: true,
        deletedAt: null,
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        restaurantId: 'rest1',
        role: 'WAITER',
      });
      mockPrisma.payment.findMany.mockResolvedValue([]);

      const result = await service.reconcileStuckSession('tok', 'waiter1');

      expect(result).toEqual({ recovered: 0, expired: 0, stillPending: 0 });
    });

    it('rejects a caller without POS operator access (KITCHEN)', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
      });
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ownerId: 'owner1',
        isActive: true,
        deletedAt: null,
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        restaurantId: 'rest1',
        role: 'KITCHEN',
      });

      await expect(
        service.reconcileStuckSession('tok', 'kitchen1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when the session token is unknown', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue(null);
      await expect(
        service.reconcileStuckSession('bad', 'owner1'),
      ).rejects.toThrow(NotFoundException);
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
      // #2: bill is summed from a fresh in-transaction order read, not the
      // session snapshot taken before the transaction.
      mockPrisma.order.findMany.mockResolvedValue([
        { totalPrice: 20 },
        { totalPrice: 5 },
      ]);
      mockPrisma.order.findFirst.mockResolvedValue({ customerName: 'Maria' });
      mockPrisma.payment.create.mockResolvedValue({ id: 'pay1' });

      const result = await service.closeSessionWithCard(
        'tok1',
        'rest1',
        'owner1',
      );

      expect(result.amount).toBeCloseTo(25);
      // Bill is computed in-transaction via computeSessionBalance (remaining
      // balance); it reads the session's orders for the current session id.
      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tableSessionId: 's1' } }),
      );
      expect(mockPrisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: 25,
            status: 'SUCCEEDED',
            provider: PaymentProvider.MYPOS,
          }),
        }),
      );
      expect(mockEvents.emitTableStatusChanged).toHaveBeenCalled();
      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        'rest1',
        'payment:confirmed',
        expect.objectContaining({ amount: 25, customerName: 'Maria' }),
      );
    });

    it('blocks POS card close when checkout payment remains pending after abandon', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        tableId: 'table1',
        restaurantId: 'rest1',
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 30 }]);
      const pendingPayment = {
        id: 'pay-pending',
        provider: 'STRIPE',
        stripePaymentIntentId: 'pi_pending',
      };
      mockPrisma.payment.findMany.mockResolvedValue([pendingPayment]);
      mockPrisma.payment.findFirst.mockResolvedValue(pendingPayment);
      mockStripeProvider.cancelPaymentIntent.mockRejectedValue(
        new Error('Stripe unavailable'),
      );

      await expect(
        service.closeSessionWithCard('tok1', 'rest1', 'owner1'),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.payment.create).not.toHaveBeenCalled();
    });

    it('blocks POS card close when a pending payment appears inside the close transaction', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        tableId: 'table1',
        restaurantId: 'rest1',
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 30 }]);
      const pendingPayment = {
        id: 'pay-race',
        provider: 'EPAY',
        stripePaymentIntentId: null,
      };
      mockPrisma.payment.findMany.mockResolvedValue([pendingPayment]);
      mockPrisma.payment.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.payment.findFirst.mockResolvedValue(pendingPayment);

      await expect(
        service.closeSessionWithCard('tok1', 'rest1', 'owner1'),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.payment.create).not.toHaveBeenCalled();
      expect(mockEvents.emitTableStatusChanged).not.toHaveBeenCalled();
    });

    it('throws when session is already closed (race condition)', async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        tableId: 'table1',
        restaurantId: 'rest1',
        orders: [{ totalPrice: 30 }],
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 30 }]);
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
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 15 }]);
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
            provider: PaymentProvider.CASH,
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

  describe('cash payment requests', () => {
    const openSession = {
      id: 's1',
      token: 'tok1',
      tableId: 'table1',
      restaurantId: 'rest1',
      status: 'OPEN',
      restaurant: { tier: 'PROFESSIONAL', forceTier: null },
      table: { name: '6' },
    };
    const billOrders = [
      {
        id: 'order-salad',
        totalPrice: 5,
        pointsRedeemedForDiscount: 0,
        pointsRedeemedForItems: 0,
        items: [
          {
            id: 'oi-salad',
            quantity: 1,
            paidQuantity: 0,
            selectedOptions: [],
            menuItem: { name: 'Salad', price: 5 },
          },
        ],
      },
      {
        id: 'order-main',
        totalPrice: 25,
        pointsRedeemedForDiscount: 0,
        pointsRedeemedForItems: 0,
        items: [
          {
            id: 'oi-main',
            quantity: 1,
            paidQuantity: 0,
            selectedOptions: [],
            menuItem: { name: 'Steak', price: 25 },
          },
        ],
      },
    ];

    beforeEach(() => {
      mockPrisma.tableSession.findFirst.mockResolvedValue(openSession);
      mockPrisma.order.findMany.mockResolvedValue(billOrders);
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.payment.findFirst.mockResolvedValue(null);
    });

    it('creates a deduped full-table cash request with the current remaining amount', async () => {
      mockPrisma.cashPaymentRequest.findFirst.mockResolvedValue(null);
      mockPrisma.cashPaymentRequest.create.mockResolvedValue({
        id: 'cash-req-1',
        restaurantId: 'rest1',
        tableSessionId: 's1',
        tableId: 'table1',
        status: 'PENDING',
        scope: 'FULL_TABLE',
        scopeKey: 'FULL_TABLE',
        orderIds: [],
        requestedAmount: 30,
        currency: 'EUR',
        paymentId: null,
        resolvedById: null,
        resolvedAt: null,
        createdAt: new Date('2026-06-21T07:00:00.000Z'),
        updatedAt: new Date('2026-06-21T07:00:00.000Z'),
        table: { name: '6' },
      });

      const result = await service.createCashPaymentRequest('tok1', 'rest1');

      expect(result.requestedAmount).toBe(30);
      expect(result.scope).toBe('FULL_TABLE');
      expect(mockPrisma.cashPaymentRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            restaurantId: 'rest1',
            tableSessionId: 's1',
            tableId: 'table1',
            scope: 'FULL_TABLE',
            scopeKey: 'FULL_TABLE',
            requestedAmount: 30,
          }),
        }),
      );
      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        'rest1',
        'cashPaymentRequest:created',
        expect.objectContaining({
          id: 'cash-req-1',
          requestedAmount: 30,
          tableName: '6',
        }),
      );
      expect(mockEvents.emitToTableSession).toHaveBeenCalledWith(
        's1',
        'billPayment:pending',
        expect.objectContaining({
          id: 'cash-req-1',
          source: 'CASH_REQUEST',
          provider: PaymentProvider.CASH,
          scope: 'FULL_TABLE',
          amount: 30,
        }),
      );
    });

    it('blocks a full-table cash request while a scoped cash request is pending', async () => {
      mockPrisma.cashPaymentRequest.findFirst.mockResolvedValue(null);
      mockPrisma.cashPaymentRequest.findMany.mockResolvedValue([
        {
          id: 'cash-salad',
          status: 'PENDING',
          scope: 'ORDER_ITEMS',
          orderIds: ['order-salad'],
        },
      ]);

      await expect(
        service.createCashPaymentRequest('tok1', 'rest1'),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.cashPaymentRequest.create).not.toHaveBeenCalled();
      expect(mockEvents.emitToRestaurant).not.toHaveBeenCalled();
    });

    it('allows a scoped cash request when an existing pending request covers different orders', async () => {
      mockPrisma.order.findMany
        .mockResolvedValueOnce(billOrders)
        .mockResolvedValueOnce([billOrders[1]]);
      mockPrisma.cashPaymentRequest.findFirst.mockResolvedValue(null);
      mockPrisma.cashPaymentRequest.findMany.mockResolvedValue([
        {
          id: 'cash-salad',
          status: 'PENDING',
          scope: 'ORDER_ITEMS',
          orderIds: ['order-salad'],
        },
      ]);
      mockPrisma.cashPaymentRequest.create.mockResolvedValue({
        id: 'cash-main',
        restaurantId: 'rest1',
        tableSessionId: 's1',
        tableId: 'table1',
        status: 'PENDING',
        scope: 'ORDER_ITEMS',
        scopeKey: 'main-scope',
        orderIds: ['order-main'],
        requestedAmount: 25,
        currency: 'EUR',
        paymentId: null,
        resolvedById: null,
        resolvedAt: null,
        createdAt: new Date('2026-06-21T07:00:00.000Z'),
        updatedAt: new Date('2026-06-21T07:00:00.000Z'),
        table: { name: '6' },
      });

      const result = await service.createCashPaymentRequest('tok1', 'rest1', {
        orderIds: ['order-main'],
      });

      expect(result.requestedAmount).toBe(25);
      expect(result.scope).toBe('ORDER_ITEMS');
      expect(result.orderIds).toEqual(['order-main']);
      expect(mockPrisma.cashPaymentRequest.create).toHaveBeenCalled();
    });

    it('confirms a full-table cash request by recording a CASH payment and marking the session paid', async () => {
      const existingRequest = {
        id: 'cash-req-1',
        restaurantId: 'rest1',
        tableSessionId: 's1',
        status: 'PENDING',
        tableSession: { token: 'tok1' },
      };
      const requestInTransaction = {
        ...existingRequest,
        tableId: 'table1',
        scope: 'FULL_TABLE',
        scopeKey: 'FULL_TABLE',
        orderIds: [],
        requestedAmount: 30,
        currency: 'EUR',
        paymentId: null,
        resolvedById: null,
        resolvedAt: null,
        createdAt: new Date('2026-06-21T07:00:00.000Z'),
        updatedAt: new Date('2026-06-21T07:00:00.000Z'),
        table: { name: '6' },
        tableSession: openSession,
      };
      const updatedRequest = {
        ...requestInTransaction,
        status: 'PAID',
        paymentId: 'pay-cash-1',
        resolvedById: 'manager1',
        resolvedAt: new Date('2026-06-21T07:05:00.000Z'),
      };
      mockPrisma.cashPaymentRequest.findUnique
        .mockResolvedValueOnce(existingRequest)
        .mockResolvedValueOnce(requestInTransaction);
      mockPrisma.cashPaymentRequest.update.mockResolvedValue(updatedRequest);
      mockPrisma.payment.create.mockResolvedValue({ id: 'pay-cash-1' });
      mockPrisma.payment.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { status: 'SUCCEEDED', amount: 30, tipAmount: 0 },
        ]);
      mockPrisma.order.findFirst.mockResolvedValue({ customerName: 'Maria' });

      const result = await service.confirmCashPaymentRequest(
        'cash-req-1',
        'manager1',
      );

      expect(result.status).toBe('PAID');
      expect(result.paymentId).toBe('pay-cash-1');
      const rawSqlCalls = mockPrisma.$queryRaw.mock.calls.map(([query]) =>
        String(query),
      );
      expect(rawSqlCalls[0]).toContain('"table_session"');
      expect(rawSqlCalls[1]).toContain('"cash_payment_request"');
      expect(mockPrisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: 30,
            tipAmount: 0,
            platformFeeAmount: 0,
            provider: PaymentProvider.CASH,
            status: 'SUCCEEDED',
          }),
        }),
      );
      expect(mockPrisma.tableSession.updateMany).toHaveBeenCalledWith({
        where: { id: 's1', status: 'OPEN' },
        data: expect.objectContaining({ status: 'PAID' }),
      });
      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        'rest1',
        'cashPaymentRequest:updated',
        expect.objectContaining({ id: 'cash-req-1', status: 'PAID' }),
      );
      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        'rest1',
        'payment:confirmed',
        expect.objectContaining({
          paymentId: 'pay-cash-1',
          tableSessionId: 's1',
          amount: 30,
          tipAmount: 0,
          customerName: 'Maria',
        }),
      );
    });

    it('rejects confirmation when the cash request moves to another session before the locked reread', async () => {
      const existingRequest = {
        id: 'cash-req-1',
        restaurantId: 'rest1',
        tableSessionId: 's1',
        status: 'PENDING',
        tableSession: { token: 'tok1' },
      };
      const movedRequest = {
        ...existingRequest,
        tableSessionId: 's2',
        tableId: 'table1',
        scope: 'FULL_TABLE',
        scopeKey: 'FULL_TABLE',
        orderIds: [],
        requestedAmount: 30,
        currency: 'EUR',
        paymentId: null,
        resolvedById: null,
        resolvedAt: null,
        createdAt: new Date('2026-06-21T07:00:00.000Z'),
        updatedAt: new Date('2026-06-21T07:00:00.000Z'),
        table: { name: '6' },
        tableSession: { ...openSession, id: 's2' },
      };
      mockPrisma.cashPaymentRequest.findUnique
        .mockResolvedValueOnce(existingRequest)
        .mockResolvedValueOnce(movedRequest);

      await expect(
        service.confirmCashPaymentRequest('cash-req-1', 'manager1'),
      ).rejects.toThrow(
        'Cash payment request changed during confirmation. Please retry.',
      );

      const rawSqlCalls = mockPrisma.$queryRaw.mock.calls.map(([query]) =>
        String(query),
      );
      expect(rawSqlCalls[0]).toContain('"table_session"');
      expect(rawSqlCalls[1]).toContain('"cash_payment_request"');
      expect(mockPrisma.tableSession.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.payment.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.payment.create).not.toHaveBeenCalled();
      expect(mockPrisma.cashPaymentRequest.update).not.toHaveBeenCalled();
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

      const result = await service.createCheckout(
        'tok1',
        'BORICA',
        0,
        boricaCardholder,
      );

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

      await expect(
        service.createCheckout('tok1', 'BORICA', 0, boricaCardholder),
      ).rejects.toThrow(BadRequestException);
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
      mockBoricaProvider.buildSaleForm!.mockImplementationOnce(() => {
        throw new Error('invalid private key');
      });

      await expect(
        service.createCheckout('tok1', 'BORICA', 0, boricaCardholder),
      ).rejects.toThrow(BadRequestException);
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

      const result = await service.createCheckout(
        'tok1',
        'BORICA',
        0,
        boricaCardholder,
      );

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

      const result = await service.createCheckout(
        'tok1',
        'BORICA',
        0,
        boricaCardholder,
      );

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
        providerPayload: {
          checkoutForm: { action: 'x', method: 'POST', fields: {} },
        },
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

      const result = await service.createCheckout(
        'tok1',
        'BORICA',
        0,
        boricaCardholder,
      );

      expect(result.paymentId).toBe('pay-new');
      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pay-stale', status: 'PENDING' },
        }),
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
        providerPayload: {
          checkoutForm: { action: 'x', method: 'POST', fields: {} },
        },
      };
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        table: null,
        restaurant: boricaRestaurant,
      });
      mockPrisma.order.findMany.mockImplementation(
        (args: { where?: { status?: string } }) =>
          args.where?.status === 'PENDING_PAYMENT'
            ? Promise.resolve([])
            : Promise.resolve([{ totalPrice: 20 }]),
      );
      mockPrisma.payment.findMany.mockResolvedValue([stalePending]);
      mockBoricaProvider.queryTransactionStatus!.mockResolvedValueOnce({
        verified: true,
        rc: '00',
        action: '0',
        order: '000099',
        rrn: '',
        intRef: '',
        approval: '',
        terminal: 'V1800001',
        amount: '20.00',
        currency: 'EUR',
        paresStat: 'Y',
        eci: '05',
      });
      mockPrisma.$transaction.mockImplementation((fn: Function) =>
        fn(mockPrisma),
      );
      mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.tableSession.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.createCheckout('tok1', 'BORICA', 0, boricaCardholder),
      ).rejects.toMatchObject({
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
        providerPayload: {
          checkoutForm: { action: 'x', method: 'POST', fields: {} },
        },
      };
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        table: null,
        restaurant: boricaRestaurant,
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 20 }]);
      mockPrisma.payment.findMany.mockResolvedValue([stalePending]);
      mockBoricaProvider.queryTransactionStatus!.mockResolvedValueOnce({
        verified: true,
        rc: '00',
        action: '0',
        order: '000099',
        rrn: '',
        intRef: '',
        approval: '',
        terminal: 'V1800001',
        amount: '20.00',
        currency: 'EUR',
        paresStat: 'Y',
        eci: '05',
      });
      mockPrisma.$transaction.mockImplementation((fn: Function) =>
        fn(mockPrisma),
      );
      mockPrisma.tableSession.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.createCheckout('tok1', 'BORICA', 0, boricaCardholder),
      ).rejects.toMatchObject({
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
        providerPayload: {
          checkoutForm: { action: 'x', method: 'POST', fields: {} },
        },
      };
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        table: null,
        restaurant: boricaRestaurant,
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 20 }]);
      mockPrisma.payment.findMany.mockResolvedValue([stalePending]);
      mockBoricaProvider.queryTransactionStatus!.mockResolvedValueOnce(null);

      await expect(
        service.createCheckout('tok1', 'BORICA', 0, boricaCardholder),
      ).rejects.toThrow(ServiceUnavailableException);
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
        providerPayload: {
          checkoutForm: { action: 'x', method: 'POST', fields: {} },
        },
      };
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        table: null,
        restaurant: boricaRestaurant,
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 20 }]);
      mockPrisma.payment.findMany.mockResolvedValue([stalePending]);
      mockBoricaProvider.queryTransactionStatus!.mockResolvedValueOnce({
        verified: true,
        rc: '00',
        action: '0',
        order: '000099',
        terminal: 'V1800001',
        amount: '99.99', // mismatched amount — must not recover
        currency: 'EUR',
        rrn: '',
        intRef: '',
        approval: '',
        paresStat: '',
        eci: '',
      });
      await expect(
        service.createCheckout('tok1', 'BORICA', 0, boricaCardholder),
      ).rejects.toThrow(ServiceUnavailableException);
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
        providerPayload: {
          checkoutForm: { action: 'x', method: 'POST', fields: {} },
        },
      };
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 's1',
        restaurantId: 'rest1',
        table: null,
        restaurant: boricaRestaurant,
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 20 }]);
      mockPrisma.payment.findMany.mockResolvedValue([stalePending]);
      mockBoricaProvider.queryTransactionStatus!.mockResolvedValueOnce({
        verified: true,
        rc: '05',
        action: '2',
        order: '000099',
        terminal: 'V1800001',
        amount: '20.00',
        currency: 'EUR',
        rrn: '',
        intRef: '',
        approval: '',
        paresStat: '',
        eci: '',
      });
      mockPrisma.payment.create.mockResolvedValue({ id: 'pay-new' });

      const result = await service.createCheckout(
        'tok1',
        'BORICA',
        0,
        boricaCardholder,
      );

      expect(result.paymentId).toBe('pay-new');
      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pay-stale', status: 'PENDING' },
          data: expect.objectContaining({
            status: 'FAILED',
            providerStatus: 'EXPIRED',
          }),
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
      (mockBoricaProvider.verifyResult as jest.Mock).mockReturnValue({
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
      (mockBoricaProvider.verifyResult as jest.Mock).mockReturnValueOnce({
        verified: false,
      });

      const url = await service.handleBoricaCallback(validBody);

      expect(url).toContain('borica-cancel');
      expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
    });

    it('marks FAILED and redirects cancel when BORICA reports decline (rc != 00) (#4)', async () => {
      (mockBoricaProvider.verifyResult as jest.Mock).mockReturnValueOnce({
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

    it('recovers a verified late capture after a BORICA checkout expired locally', async () => {
      mockPrisma.payment.findFirst.mockResolvedValueOnce({
        ...boricaPayment,
        status: 'FAILED',
        providerStatus: 'EXPIRED',
      });
      mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.tableSession.updateMany.mockResolvedValue({ count: 1 });

      const url = await service.handleBoricaCallback(validBody);

      expect(url).toContain('borica-ok');
      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'pay-borica',
            status: { in: ['PENDING', 'ABANDONED', 'FAILED'] },
          },
          data: expect.objectContaining({ status: 'SUCCEEDED' }),
        }),
      );
    });

    it('records an old BORICA capture for reconciliation after another provider paid the session', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { id: 's1', status: 'PAID' },
      ]);

      const url = await service.handleBoricaCallback(validBody);

      expect(url).toContain('borica-ok');
      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'SUCCEEDED',
            providerStatus: 'SESSION_NOT_OPEN_NEEDS_RECONCILIATION',
          }),
        }),
      );
      expect(mockPrisma.paymentReconciliationIssue.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ reason: 'SESSION_NOT_OPEN' }),
        }),
      );
      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        'rest1',
        'payment:reconciliationRequired',
        expect.objectContaining({ paymentId: 'pay-borica' }),
      );
    });

    it('records a signed success with mismatched AMOUNT for reconciliation (#6)', async () => {
      const url = await service.handleBoricaCallback({
        ...validBody,
        AMOUNT: '99.99', // wrong amount
      });

      expect(url).toContain('borica-ok');
      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'SUCCEEDED',
            providerStatus:
              'PROVIDER_CONFIRMATION_MISMATCH_NEEDS_RECONCILIATION',
          }),
        }),
      );
      expect(mockPrisma.paymentReconciliationIssue.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            reason: 'PROVIDER_CONFIRMATION_MISMATCH',
          }),
        }),
      );
    });

    it('records a signed success with mismatched TERMINAL for reconciliation (#6)', async () => {
      const url = await service.handleBoricaCallback({
        ...validBody,
        TERMINAL: 'WRONGTER',
      });

      expect(url).toContain('borica-ok');
      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'SUCCEEDED',
            providerStatus:
              'PROVIDER_CONFIRMATION_MISMATCH_NEEDS_RECONCILIATION',
          }),
        }),
      );
    });

    it('rejects callback with mismatched ORDER (#6)', async () => {
      // The provider reference lookup cannot attribute this order to a payment.
      mockPrisma.payment.findFirst.mockResolvedValueOnce(null);
      const url = await service.handleBoricaCallback({
        ...validBody,
        ORDER: '999999', // different order ref
      });

      expect(url).toContain('borica-cancel');
    });
  });

  describe('settlePartial (split bill)', () => {
    const openSession = {
      id: 's1',
      tableId: 'table1',
      restaurantId: 'rest1',
      status: 'OPEN',
    };
    // Bill: Beer €5 + Salad €8 + Steak €17 = €30, nothing paid yet.
    const billOrders = [
      {
        totalPrice: 30,
        pointsRedeemedForDiscount: 0,
        pointsRedeemedForItems: 0,
        items: [
          {
            id: 'oi-drink',
            quantity: 1,
            paidQuantity: 0,
            selectedOptions: [],
            menuItem: { name: 'Beer', price: 5 },
          },
          {
            id: 'oi-salad',
            quantity: 1,
            paidQuantity: 0,
            selectedOptions: [],
            menuItem: { name: 'Salad', price: 8 },
          },
          {
            id: 'oi-main',
            quantity: 1,
            paidQuantity: 0,
            selectedOptions: [],
            menuItem: { name: 'Steak', price: 17 },
          },
        ],
      },
    ];

    beforeEach(() => {
      mockPrisma.tableSession.findFirst.mockResolvedValue(openSession);
      mockPrisma.order.findMany.mockResolvedValue(billOrders);
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.payment.create.mockResolvedValue({ id: 'pay1' });
    });

    it('ITEM mode: settles only selected units and leaves the session OPEN with the remaining balance', async () => {
      const result = await service.settlePartial('tok1', 'rest1', 'owner1', {
        restaurantId: 'rest1',
        mode: SplitMode.ITEM,
        provider: SplitProvider.CASH,
        allocations: [{ orderItemId: 'oi-drink', quantity: 1 }],
      });

      expect(result.amount).toBeCloseTo(5);
      expect(result.remaining).toBeCloseTo(25);
      expect(result.sessionPaid).toBe(false);
      expect(mockPrisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: 5,
            status: 'SUCCEEDED',
            provider: PaymentProvider.CASH,
            splitMode: 'ITEM',
          }),
        }),
      );
      expect(mockPrisma.orderItem.updateMany).toHaveBeenCalledWith({
        where: { id: 'oi-drink', paidQuantity: 0 },
        data: { paidQuantity: { increment: 1 } },
      });
      expect(mockPrisma.paymentAllocation.createMany).toHaveBeenCalledWith({
        data: [
          {
            paymentId: 'pay1',
            orderItemId: 'oi-drink',
            quantity: 1,
            amount: 5,
          },
        ],
      });
      // Not fully paid -> invalidate bill views, but no payment:confirmed broadcast.
      expect(mockEvents.emitTableStatusChanged).toHaveBeenCalled();
      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        'rest1',
        'bill:updated',
        expect.objectContaining({
          tableSessionId: 's1',
          paymentId: 'pay1',
          splitMode: 'ITEM',
          remaining: 25,
          sessionPaid: false,
        }),
      );
      expect(mockEvents.emitToRestaurant).not.toHaveBeenCalledWith(
        'rest1',
        'payment:confirmed',
        expect.anything(),
      );
    });

    it('ITEM mode: flips the session to PAID and emits when the last items are settled', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({ customerName: 'Maria' });

      const result = await service.settlePartial('tok1', 'rest1', 'owner1', {
        restaurantId: 'rest1',
        mode: SplitMode.ITEM,
        provider: SplitProvider.MYPOS,
        tipPercent: 10,
        allocations: [
          { orderItemId: 'oi-drink', quantity: 1 },
          { orderItemId: 'oi-salad', quantity: 1 },
          { orderItemId: 'oi-main', quantity: 1 },
        ],
      });

      expect(result.amount).toBeCloseTo(33);
      expect(result.remaining).toBe(0);
      expect(result.sessionPaid).toBe(true);
      expect(mockPrisma.tableSession.updateMany).toHaveBeenCalledWith({
        where: { id: 's1', status: 'OPEN' },
        data: expect.objectContaining({ status: 'PAID' }),
      });
      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        'rest1',
        'payment:confirmed',
        expect.objectContaining({
          tableSessionId: 's1',
          customerName: 'Maria',
          amount: 33,
          tipAmount: 3,
        }),
      );
    });

    it('ITEM mode: adds a tip on the selected subtotal only', async () => {
      const result = await service.settlePartial('tok1', 'rest1', 'owner1', {
        restaurantId: 'rest1',
        mode: SplitMode.ITEM,
        provider: SplitProvider.CASH,
        allocations: [{ orderItemId: 'oi-salad', quantity: 1 }],
        tipPercent: 10,
      });
      // 8 + 10% = 8.80 charged; remaining counts subtotal only (30 − 8 = 22).
      expect(result.amount).toBeCloseTo(8.8);
      expect(result.remaining).toBeCloseTo(22);
      expect(mockPrisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amount: 8.8, tipAmount: 0.8 }),
        }),
      );
    });

    it('ITEM mode: rejects when loyalty discounts are present', async () => {
      mockPrisma.order.findMany.mockResolvedValue([
        { ...billOrders[0], pointsRedeemedForDiscount: 50 },
      ]);
      await expect(
        service.settlePartial('tok1', 'rest1', 'owner1', {
          restaurantId: 'rest1',
          mode: SplitMode.ITEM,
          provider: SplitProvider.CASH,
          allocations: [{ orderItemId: 'oi-drink', quantity: 1 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('ITEM mode: rejects when selected quantity exceeds the unpaid units', async () => {
      await expect(
        service.settlePartial('tok1', 'rest1', 'owner1', {
          restaurantId: 'rest1',
          mode: SplitMode.ITEM,
          provider: SplitProvider.CASH,
          allocations: [{ orderItemId: 'oi-drink', quantity: 3 }],
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('ITEM mode: aborts when a concurrent settlement already took the units (optimistic lock)', async () => {
      mockPrisma.orderItem.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(
        service.settlePartial('tok1', 'rest1', 'owner1', {
          restaurantId: 'rest1',
          mode: SplitMode.ITEM,
          provider: SplitProvider.CASH,
          allocations: [{ orderItemId: 'oi-drink', quantity: 1 }],
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('EVEN mode: charges one share of the remaining balance', async () => {
      const result = await service.settlePartial('tok1', 'rest1', 'owner1', {
        restaurantId: 'rest1',
        mode: SplitMode.EVEN,
        provider: SplitProvider.CASH,
        splitCount: 3,
      });
      expect(result.amount).toBeCloseTo(10);
      expect(result.remaining).toBeCloseTo(20);
      expect(mockPrisma.paymentAllocation.createMany).not.toHaveBeenCalled();
    });

    it('EVEN mode: the last person pays the exact remaining (remaining / peopleLeft)', async () => {
      // €87.87 split 2 ways; person 1 already paid 43.94 → remaining 43.93. The POS
      // decrements peopleLeft to 1 for the last person, so remaining / 1 = 43.93
      // clears the bill exactly (no rounding dust, not 43.93/2 = 21.96).
      mockPrisma.order.findMany.mockResolvedValue([
        {
          totalPrice: 87.87,
          pointsRedeemedForDiscount: 0,
          pointsRedeemedForItems: 0,
          items: [],
        },
      ]);
      mockPrisma.payment.findMany.mockResolvedValue([
        { status: 'SUCCEEDED', amount: 43.94, tipAmount: 0 },
      ]);

      const result = await service.settlePartial('tok1', 'rest1', 'owner1', {
        restaurantId: 'rest1',
        mode: SplitMode.EVEN,
        provider: SplitProvider.CASH,
        splitCount: 1,
      });

      expect(result.amount).toBeCloseTo(43.93);
      expect(result.remaining).toBe(0);
      expect(result.sessionPaid).toBe(true);
    });

    it('CUSTOM mode: charges the given amount and reduces the balance', async () => {
      const result = await service.settlePartial('tok1', 'rest1', 'owner1', {
        restaurantId: 'rest1',
        mode: SplitMode.CUSTOM,
        provider: SplitProvider.CASH,
        amount: 12,
      });
      expect(result.amount).toBeCloseTo(12);
      expect(result.remaining).toBeCloseTo(18);
    });

    it('CUSTOM mode: aborts when the session row is no longer open after locking', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      await expect(
        service.settlePartial('tok1', 'rest1', 'owner1', {
          restaurantId: 'rest1',
          mode: SplitMode.CUSTOM,
          provider: SplitProvider.CASH,
          amount: 12,
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.payment.create).not.toHaveBeenCalled();
    });

    it('blocks partial settlement when checkout payment remains pending after abandon', async () => {
      const pendingPayment = {
        id: 'pay-pending',
        provider: 'STRIPE',
        stripePaymentIntentId: 'pi_pending',
      };
      mockPrisma.payment.findMany.mockResolvedValue([pendingPayment]);
      mockPrisma.payment.findFirst.mockResolvedValue(pendingPayment);
      mockStripeProvider.cancelPaymentIntent.mockRejectedValue(
        new Error('Stripe unavailable'),
      );

      await expect(
        service.settlePartial('tok1', 'rest1', 'owner1', {
          restaurantId: 'rest1',
          mode: SplitMode.CUSTOM,
          provider: SplitProvider.CASH,
          amount: 5,
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.payment.create).not.toHaveBeenCalled();
    });

    it('CUSTOM mode: never collects more than the outstanding balance', async () => {
      const result = await service.settlePartial('tok1', 'rest1', 'owner1', {
        restaurantId: 'rest1',
        mode: SplitMode.CUSTOM,
        provider: SplitProvider.CASH,
        amount: 100,
      });
      expect(result.amount).toBeCloseTo(30);
      expect(result.remaining).toBe(0);
      expect(result.sessionPaid).toBe(true);
    });

    it('rejects when the session is already fully paid', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([
        { status: 'SUCCEEDED', amount: 30, tipAmount: 0 },
      ]);
      await expect(
        service.settlePartial('tok1', 'rest1', 'owner1', {
          restaurantId: 'rest1',
          mode: SplitMode.CUSTOM,
          provider: SplitProvider.CASH,
          amount: 5,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a caller without POS operator access (KITCHEN)', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ownerId: 'someone-else',
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        restaurantId: 'rest1',
        role: 'KITCHEN',
      });
      await expect(
        service.settlePartial('tok1', 'rest1', 'kitchen-user', {
          restaurantId: 'rest1',
          mode: SplitMode.CUSTOM,
          provider: SplitProvider.CASH,
          amount: 5,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('forceOpenSession', () => {
    it('throws NotFoundException when table not found for this restaurant', async () => {
      mockPrisma.restaurantTable.findFirst.mockResolvedValue(null);
      await expect(
        service.forceOpenSession('table-1', 'rest1', 'owner1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects force-open for service points', async () => {
      mockPrisma.restaurantTable.findFirst.mockResolvedValue({
        id: 'room-service',
        restaurantId: 'rest1',
        type: 'ROOM',
      });

      await expect(
        service.forceOpenSession('room-service', 'rest1', 'owner1'),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.tableSession.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.tableSession.create).not.toHaveBeenCalled();
    });

    it('closes existing OPEN session and creates new one', async () => {
      mockPrisma.restaurantTable.findFirst.mockResolvedValue({
        id: 'table-1',
        restaurantId: 'rest1',
        type: 'TABLE',
      });
      const existingSession = {
        id: 'old-session',
        token: 'old-token',
        tableId: 'table-1',
      };
      const newSession = {
        id: 'new-session',
        token: 'new-token',
        tableId: 'table-1',
      };
      mockPrisma.tableSession.findFirst.mockResolvedValue(existingSession);
      mockPrisma.tableSession.update.mockResolvedValue({});
      mockPrisma.tableSession.create.mockResolvedValue(newSession);
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ id: 'table-1', type: 'TABLE' }])
        .mockResolvedValueOnce([existingSession]);

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

    it('blocks force-open when old session still has a pending checkout payment', async () => {
      mockPrisma.restaurantTable.findFirst.mockResolvedValue({
        id: 'table-1',
        restaurantId: 'rest1',
        type: 'TABLE',
      });
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 'old-session',
        token: 'old-token',
        tableId: 'table-1',
      });
      const pendingPayment = {
        id: 'pay-pending',
        provider: 'STRIPE',
        stripePaymentIntentId: 'pi_pending',
      };
      mockPrisma.payment.findMany.mockResolvedValue([pendingPayment]);
      mockPrisma.payment.findFirst.mockResolvedValue(pendingPayment);
      mockStripeProvider.cancelPaymentIntent.mockRejectedValue(
        new Error('Stripe unavailable'),
      );

      await expect(
        service.forceOpenSession('table-1', 'rest1', 'owner1'),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.tableSession.update).not.toHaveBeenCalled();
      expect(mockPrisma.tableSession.create).not.toHaveBeenCalled();
    });

    it('blocks force-open when a pending payment appears inside the close transaction', async () => {
      mockPrisma.restaurantTable.findFirst.mockResolvedValue({
        id: 'table-1',
        restaurantId: 'rest1',
        type: 'TABLE',
      });
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 'old-session',
        token: 'old-token',
        tableId: 'table-1',
      });
      const pendingPayment = {
        id: 'pay-race',
        provider: 'EPAY',
        stripePaymentIntentId: null,
      };
      mockPrisma.payment.findMany.mockResolvedValue([pendingPayment]);
      mockPrisma.payment.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.payment.findFirst.mockResolvedValue(pendingPayment);
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ id: 'table-1', type: 'TABLE' }])
        .mockResolvedValueOnce([
          {
            id: 'old-session',
            token: 'old-token',
            tableId: 'table-1',
          },
        ]);

      await expect(
        service.forceOpenSession('table-1', 'rest1', 'owner1'),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.tableSession.update).not.toHaveBeenCalled();
      expect(mockPrisma.tableSession.create).not.toHaveBeenCalled();
    });

    it('rejects force-open when an order is added before the session lock is acquired', async () => {
      mockPrisma.tableSession.findFirst
        .mockResolvedValueOnce({
          id: 'old-session',
          token: 'old-token',
          tableId: 'table-1',
          restaurantId: 'rest1',
          status: 'OPEN',
        })
        .mockResolvedValueOnce({
          id: 'old-session',
          token: 'old-token',
          tableId: 'table-1',
          restaurantId: 'rest1',
          status: 'OPEN',
        })
        .mockResolvedValueOnce({
          id: 'old-session',
          token: 'old-token',
          tableId: 'table-1',
          restaurantId: 'rest1',
          status: 'OPEN',
        });
      mockPrisma.order.count.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ id: 'table-1', type: 'TABLE' }])
        .mockResolvedValueOnce([
          {
            id: 'old-session',
            token: 'old-token',
            tableId: 'table-1',
            restaurantId: 'rest1',
            status: 'OPEN',
          },
        ]);

      await expect(
        service.forceOpenSession('table-1', 'rest1', 'owner1'),
      ).rejects.toThrow(
        'An order was added while the table was being reopened. Review the table and retry.',
      );

      expect(mockPrisma.tableSession.update).not.toHaveBeenCalled();
      expect(mockPrisma.tableSession.create).not.toHaveBeenCalled();
    });

    it('creates new session when no existing OPEN session', async () => {
      mockPrisma.restaurantTable.findFirst.mockResolvedValue({
        id: 'table-1',
        restaurantId: 'rest1',
        type: 'TABLE',
      });
      mockPrisma.tableSession.findFirst.mockResolvedValue(null);
      const newSession = {
        id: 'new-session',
        token: 'new-token',
        tableId: 'table-1',
      };
      mockPrisma.tableSession.create.mockResolvedValue(newSession);
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ id: 'table-1', type: 'TABLE' }])
        .mockResolvedValueOnce([]);

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
