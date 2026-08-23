import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EpayCheckoutService } from './epay-checkout.service';
import { PaymentProvider } from '@prisma/client';
import { encryptSecret } from '../secret-crypto';

describe('EpayCheckoutService', () => {
  let service: EpayCheckoutService;
  let prisma: any;
  let epay: any;
  let core: any;
  let config: any;

  const restaurantId = 'restaurant-1';
  const rawSecret = 'epay-secret-key-12345';
  const encryptedSecret = encryptSecret(rawSecret, {
    restaurantId,
    purpose: 'epay-secret',
  });

  const mockRestaurant = {
    id: restaurantId,
    paymentsEnabled: true,
    epayClientId: '1234567890',
    epayMerchantEmail: 'merchant@example.com',
    epaySecretEncrypted: encryptedSecret,
    epayMode: 'LIVE',
    platformFeePercent: 0,
  };

  const mockTable = {
    id: 'table-1',
    name: 'Table 1',
    publicToken: 'tbl-token',
  };

  const mockSession = {
    id: 'session-1',
    token: 'session-token-1',
    status: 'OPEN',
    restaurantId,
    restaurant: mockRestaurant,
    table: mockTable,
  };

  beforeEach(() => {
    prisma = {
      tableSession: {
        findFirst: jest.fn().mockResolvedValue(mockSession),
      },
      payment: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'payment-1' }),
        update: jest.fn().mockResolvedValue({ id: 'payment-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(async (callback: any) => callback(prisma)),
    };

    epay = {
      createCheckoutForm: jest.fn().mockReturnValue({
        action: 'https://epay.bg/pay',
        method: 'POST',
        fields: { PAGE: 'credit_paydirect', ENCODED: 'abc', CHECKSUM: 'xyz' },
      }),
      parseNotifications: jest.fn(),
      verifyChecksum: jest.fn(),
      formatNotificationResponses: jest.fn(),
    };

    core = {
      normalizeTipPercent: jest.fn((tip: number) => tip || 0),
      resolveCheckoutCharge: jest.fn().mockResolvedValue({
        tipAmount: 0,
        subtotal: 20,
        total: 20,
        platformFeeAmount: 0,
        checkoutScope: null,
      }),
      createPendingPaymentAfterScopeGuard: jest.fn().mockResolvedValue({
        id: 'payment-1',
        amount: 20,
        tipAmount: 0,
      }),
      mergeProviderPayload: jest.fn((existing: any, patch: any) => ({
        ...(existing || {}),
        ...patch,
      })),
      emitPendingBillPayment: jest.fn(),
      emitBillPaymentCleared: jest.fn(),
      formatPendingPayment: jest.fn((p: any) => p),
      recordProviderEvent: jest.fn().mockResolvedValue(true),
      claimSuccessfulPayment: jest.fn().mockResolvedValue({
        claimed: true,
        sessionPaid: true,
      }),
      emitPaymentClaimEvents: jest.fn(),
    };

    config = {
      isEpayConfigured: jest.fn().mockReturnValue(true),
      getEpayExpirationDate: jest
        .fn()
        .mockReturnValue(new Date(Date.now() + 3600000)),
      createEpayInvoice: jest.fn().mockReturnValue('INV-10001'),
      buildPublicMenuReturnUrl: jest
        .fn()
        .mockImplementation((_, status) => `https://menu.local/${status}`),
    };

    service = new EpayCheckoutService(prisma, epay, core, config);
  });

  describe('createEpayCheckout', () => {
    it('throws NotFoundException when session does not exist or is closed', async () => {
      prisma.tableSession.findFirst.mockResolvedValue(null);

      await expect(
        service.createEpayCheckout('invalid-token', 0),
      ).rejects.toThrow(new NotFoundException('Session not found'));
    });

    it('throws ForbiddenException when payments are disabled for restaurant', async () => {
      prisma.tableSession.findFirst.mockResolvedValue({
        ...mockSession,
        restaurant: { ...mockRestaurant, paymentsEnabled: false },
      });

      await expect(
        service.createEpayCheckout('session-token-1', 0),
      ).rejects.toThrow(
        new ForbiddenException('Payments are not enabled for this restaurant'),
      );
    });

    it('throws BadRequestException when ePay credentials are not configured', async () => {
      config.isEpayConfigured.mockReturnValue(false);

      await expect(
        service.createEpayCheckout('session-token-1', 0),
      ).rejects.toThrow(new BadRequestException('ePay.bg is not configured'));
    });

    it('creates a new checkout form and pending payment on success', async () => {
      const result = await service.createEpayCheckout('session-token-1', 10);

      expect(config.isEpayConfigured).toHaveBeenCalledWith(mockRestaurant);
      expect(core.resolveCheckoutCharge).toHaveBeenCalled();
      expect(core.createPendingPaymentAfterScopeGuard).toHaveBeenCalled();
      expect(epay.createCheckoutForm).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 20,
          invoice: 'INV-10001',
          currency: 'EUR',
        }),
      );
      expect(result).toEqual({
        provider: 'EPAY',
        paymentId: 'payment-1',
        total: 20,
        tipAmount: 0,
        action: 'https://epay.bg/pay',
        method: 'POST',
        fields: expect.any(Object),
      });
    });

    it('reuses existing pending ePay payment when not expired and matching amount', async () => {
      const existingPending = {
        id: 'payment-pending-1',
        provider: 'EPAY',
        status: 'PENDING',
        amount: 20,
        tipAmount: 0,
        providerPayload: {
          checkoutForm: {
            action: 'https://epay.bg/pay',
            method: 'POST',
            fields: { PAGE: 'credit_paydirect' },
          },
          expiresAt: new Date(Date.now() + 600000).toISOString(),
        },
      };
      prisma.payment.findMany.mockResolvedValue([existingPending]);

      const result = await service.createEpayCheckout('session-token-1', 0);

      expect(result.paymentId).toBe('payment-pending-1');
      expect(core.createPendingPaymentAfterScopeGuard).not.toHaveBeenCalled();
    });

    it('cancels expired pending ePay record and creates a fresh invoice', async () => {
      const expiredPending = {
        id: 'payment-expired-1',
        provider: 'EPAY',
        status: 'PENDING',
        amount: 20,
        tipAmount: 0,
        providerPayload: {
          checkoutForm: {
            action: 'https://epay.bg/pay',
            method: 'POST',
            fields: {},
          },
          expiresAt: new Date(Date.now() - 600000).toISOString(), // expired in past
        },
      };
      prisma.payment.findMany.mockResolvedValue([expiredPending]);

      const result = await service.createEpayCheckout('session-token-1', 0);

      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'payment-expired-1', status: 'PENDING' },
        data: { status: 'FAILED', providerStatus: 'EXPIRED' },
      });
      expect(core.emitBillPaymentCleared).toHaveBeenCalledWith(
        'session-1',
        'payment-expired-1',
        'ONLINE_PAYMENT',
      );
      expect(result.paymentId).toBe('payment-1');
    });

    it('throws ConflictException when unexpired pending ePay checkout has mismatched amount', async () => {
      const mismatchedPending = {
        id: 'payment-epay-1',
        provider: 'EPAY',
        status: 'PENDING',
        amount: 50, // different from total 20
        tipAmount: 0,
        providerPayload: {
          checkoutForm: {
            action: 'https://epay.bg/pay',
            method: 'POST',
            fields: {},
          },
          expiresAt: new Date(Date.now() + 600000).toISOString(),
        },
      };
      prisma.payment.findMany.mockResolvedValue([mismatchedPending]);

      await expect(
        service.createEpayCheckout('session-token-1', 0),
      ).rejects.toThrow(
        new ConflictException(
          'Another payment for this bill is already pending. Please wait for it to finish or cancel it before starting a new one.',
        ),
      );
    });

    it('propagates ConflictException when createPendingPaymentAfterScopeGuard detects pending conflict', async () => {
      core.createPendingPaymentAfterScopeGuard.mockRejectedValue(
        new ConflictException('Scope conflict'),
      );

      await expect(
        service.createEpayCheckout('session-token-1', 0),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('handleEpayNotification', () => {
    it('returns ERR when ENCODED or CHECKSUM are missing', async () => {
      expect(await service.handleEpayNotification({})).toBe(
        'ERR=missing ENCODED or CHECKSUM',
      );
      expect(await service.handleEpayNotification({ encoded: 'abc' })).toBe(
        'ERR=missing ENCODED or CHECKSUM',
      );
    });

    it('returns ERR when ENCODED payload cannot be parsed', async () => {
      epay.parseNotifications.mockImplementation(() => {
        throw new Error('Invalid Base64');
      });

      const response = await service.handleEpayNotification({
        encoded: 'bad-encoded',
        checksum: 'sum',
      });
      expect(response).toBe('ERR=invalid ENCODED');
    });

    it('returns NO response when invoices are unknown', async () => {
      epay.parseNotifications.mockReturnValue([
        { invoice: 'INV-99999', status: 'PAID', amount: 20 },
      ]);
      prisma.payment.findMany.mockResolvedValue([]);
      epay.formatNotificationResponses.mockReturnValue(
        'INVOICE=INV-99999:STATUS=NO',
      );

      const response = await service.handleEpayNotification({
        encoded: 'valid-base64',
        checksum: 'sum',
      });

      expect(response).toBe('INVOICE=INV-99999:STATUS=NO');
      expect(epay.formatNotificationResponses).toHaveBeenCalledWith([
        { invoice: 'INV-99999', status: 'NO' },
      ]);
    });

    it('returns ERR when notification contains mixed merchants', async () => {
      epay.parseNotifications.mockReturnValue([
        { invoice: 'INV-1', status: 'PAID' },
        { invoice: 'INV-2', status: 'PAID' },
      ]);
      prisma.payment.findMany.mockResolvedValue([
        {
          providerReference: 'INV-1',
          restaurantId: 'rest-1',
          restaurant: mockRestaurant,
        },
        {
          providerReference: 'INV-2',
          restaurantId: 'rest-2',
          restaurant: mockRestaurant,
        },
      ]);

      const response = await service.handleEpayNotification({
        encoded: 'valid-base64',
        checksum: 'sum',
      });
      expect(response).toBe('ERR=mixed merchant notification');
    });

    it('returns ERR when checksum verification fails', async () => {
      epay.parseNotifications.mockReturnValue([
        { invoice: 'INV-10001', status: 'PAID', amount: 20 },
      ]);
      prisma.payment.findMany.mockResolvedValue([
        {
          id: 'payment-1',
          providerReference: 'INV-10001',
          restaurantId,
          restaurant: mockRestaurant,
        },
      ]);
      epay.verifyChecksum.mockReturnValue(false);

      const response = await service.handleEpayNotification({
        encoded: 'valid-base64',
        checksum: 'invalid-checksum',
      });
      expect(response).toBe('ERR=invalid CHECKSUM');
    });

    it('successfully processes PAID notification and claims payment', async () => {
      const paymentRecord = {
        id: 'payment-1',
        providerReference: 'INV-10001',
        restaurantId,
        restaurant: mockRestaurant,
        providerPayload: {},
      };
      epay.parseNotifications.mockReturnValue([
        {
          invoice: 'INV-10001',
          status: 'PAID',
          amount: 20,
          stan: '123456',
          bcode: 'BC01',
        },
      ]);
      prisma.payment.findMany.mockResolvedValue([paymentRecord]);
      epay.verifyChecksum.mockReturnValue(true);
      epay.formatNotificationResponses.mockReturnValue(
        'INVOICE=INV-10001:STATUS=OK',
      );

      const response = await service.handleEpayNotification({
        encoded: 'valid-base64',
        checksum: 'valid-checksum',
      });

      expect(response).toBe('INVOICE=INV-10001:STATUS=OK');
      expect(core.recordProviderEvent).toHaveBeenCalledWith(
        expect.anything(),
        PaymentProvider.EPAY,
        'INV-10001:PAID:123456:BC01',
        expect.anything(),
      );
      expect(core.claimSuccessfulPayment).toHaveBeenCalledWith(
        expect.anything(),
        paymentRecord,
        expect.objectContaining({
          status: 'SUCCEEDED',
          providerStatus: 'PAID',
        }),
      );
      expect(core.emitPaymentClaimEvents).toHaveBeenCalled();
    });

    it('processes DENIED / EXPIRED notification and transitions payment to FAILED', async () => {
      const paymentRecord = {
        id: 'payment-1',
        providerReference: 'INV-10001',
        restaurantId,
        restaurant: mockRestaurant,
        providerPayload: {},
      };
      epay.parseNotifications.mockReturnValue([
        { invoice: 'INV-10001', status: 'DENIED' },
      ]);
      prisma.payment.findMany.mockResolvedValue([paymentRecord]);
      epay.verifyChecksum.mockReturnValue(true);
      epay.formatNotificationResponses.mockReturnValue(
        'INVOICE=INV-10001:STATUS=OK',
      );

      const response = await service.handleEpayNotification({
        encoded: 'valid-base64',
        checksum: 'valid-checksum',
      });

      expect(response).toBe('INVOICE=INV-10001:STATUS=OK');
      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'payment-1', status: 'PENDING' },
        data: expect.objectContaining({
          status: 'FAILED',
          providerStatus: 'DENIED',
        }),
      });
      expect(core.claimSuccessfulPayment).not.toHaveBeenCalled();
    });

    it('deduplicates duplicate PAID notifications via event record', async () => {
      const paymentRecord = {
        id: 'payment-1',
        providerReference: 'INV-10001',
        restaurantId,
        restaurant: mockRestaurant,
        providerPayload: {},
      };
      epay.parseNotifications.mockReturnValue([
        { invoice: 'INV-10001', status: 'PAID', stan: '123' },
      ]);
      prisma.payment.findMany.mockResolvedValue([paymentRecord]);
      epay.verifyChecksum.mockReturnValue(true);
      core.recordProviderEvent.mockResolvedValue(false); // already recorded!

      await service.handleEpayNotification({
        encoded: 'valid-base64',
        checksum: 'valid-checksum',
      });

      expect(core.claimSuccessfulPayment).not.toHaveBeenCalled();
    });
  });
});
