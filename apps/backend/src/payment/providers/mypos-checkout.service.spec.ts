import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MyposCheckoutService } from './mypos-checkout.service';
import { PaymentProvider } from '@prisma/client';
import { encryptSecret } from '../secret-crypto';

describe('MyposCheckoutService', () => {
  let service: MyposCheckoutService;
  let prisma: any;
  let mypos: any;
  let core: any;
  let config: any;

  const restaurantId = 'restaurant-1';
  const rawKey =
    '-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----';
  const encryptedKey = encryptSecret(rawKey, {
    restaurantId,
    purpose: 'mypos-private-key',
  });

  const mockRestaurant = {
    id: restaurantId,
    paymentsEnabled: true,
    myposClientNumber: '12345',
    myposStoreId: '000000000000001',
    myposKeyIndex: 1,
    myposPrivateKeyEncrypted: encryptedKey,
    myposPublicCert: 'public-cert-pem',
    myposCurrency: 'EUR',
    myposMode: 'DEMO',
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
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'payment-1' }),
        update: jest.fn().mockResolvedValue({ id: 'payment-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(async (callback: any) => callback(prisma)),
    };

    mypos = {
      createCheckoutForm: jest.fn().mockReturnValue({
        action: 'https://www.mypos.eu/vmp/checkout',
        method: 'POST',
        fields: { IPCmethod: 'IPCPurchase', IPCVersion: '1.4' },
      }),
      verifyNotification: jest.fn(),
      formatResponse: jest.fn().mockReturnValue('OK'),
    };

    core = {
      normalizeTipPercent: jest.fn((tip: number) => tip || 0),
      resolveCheckoutCharge: jest.fn().mockResolvedValue({
        tipAmount: 0,
        subtotal: 30,
        total: 30,
        platformFeeAmount: 0,
        checkoutScope: null,
      }),
      createPendingPaymentAfterScopeGuard: jest.fn().mockResolvedValue({
        id: 'payment-1',
        amount: 30,
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
      isMyposConfigured: jest.fn().mockReturnValue(true),
      createEpayInvoice: jest.fn().mockReturnValue('10001'),
      resolveMyposConfig: jest.fn().mockReturnValue({
        currency: 'EUR',
        clientNumber: '12345',
        storeId: '000000000000001',
        keyIndex: 1,
        privateKeyPem: rawKey,
        publicCertPem: 'public-cert-pem',
      }),
      buildPublicMenuReturnUrl: jest
        .fn()
        .mockImplementation((_, status) => `https://menu.local/${status}`),
    };

    service = new MyposCheckoutService(prisma, mypos, core, config);
  });

  describe('createMyposCheckout', () => {
    it('throws NotFoundException when session is missing', async () => {
      prisma.tableSession.findFirst.mockResolvedValue(null);

      await expect(
        service.createMyposCheckout('invalid-token', 0),
      ).rejects.toThrow(new NotFoundException('Session not found'));
    });

    it('throws ForbiddenException when paymentsEnabled is false', async () => {
      prisma.tableSession.findFirst.mockResolvedValue({
        ...mockSession,
        restaurant: { ...mockRestaurant, paymentsEnabled: false },
      });

      await expect(
        service.createMyposCheckout('session-token-1', 0),
      ).rejects.toThrow(
        new ForbiddenException('Payments are not enabled for this restaurant'),
      );
    });

    it('throws BadRequestException when myPOS is not configured', async () => {
      config.isMyposConfigured.mockReturnValue(false);

      await expect(
        service.createMyposCheckout('session-token-1', 0),
      ).rejects.toThrow(new BadRequestException('myPOS is not configured'));
    });

    it('creates myPOS checkout form and returns form fields', async () => {
      const result = await service.createMyposCheckout('session-token-1', 0);

      expect(config.isMyposConfigured).toHaveBeenCalledWith(mockRestaurant);
      expect(config.resolveMyposConfig).toHaveBeenCalledWith(mockRestaurant);
      expect(mypos.createCheckoutForm).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 30,
          currency: 'EUR',
          keyIndex: 1,
        }),
      );
      expect(result).toEqual({
        provider: 'MYPOS',
        paymentId: 'payment-1',
        total: 30,
        tipAmount: 0,
        action: 'https://www.mypos.eu/vmp/checkout',
        method: 'POST',
        fields: expect.any(Object),
      });
    });

    it('reuses existing pending myPOS payment when within 15min TTL and matching amount', async () => {
      const existingPending = {
        id: 'payment-mypos-1',
        provider: 'MYPOS',
        status: 'PENDING',
        amount: 30,
        tipAmount: 0,
        createdAt: new Date(),
        providerPayload: {
          checkoutForm: {
            action: 'https://www.mypos.eu/vmp/checkout',
            method: 'POST',
            fields: { IPCmethod: 'IPCPurchase' },
          },
        },
      };
      prisma.payment.findMany.mockResolvedValue([existingPending]);

      const result = await service.createMyposCheckout('session-token-1', 0);

      expect(result.paymentId).toBe('payment-mypos-1');
      expect(core.createPendingPaymentAfterScopeGuard).not.toHaveBeenCalled();
    });

    it('expires stale pending myPOS payment when age exceeds 15 minutes', async () => {
      const stalePending = {
        id: 'payment-stale-1',
        provider: 'MYPOS',
        status: 'PENDING',
        amount: 30,
        tipAmount: 0,
        createdAt: new Date(Date.now() - 20 * 60 * 1000), // 20 mins ago
        providerPayload: {
          checkoutForm: {
            action: 'https://www.mypos.eu/vmp/checkout',
            method: 'POST',
            fields: {},
          },
        },
      };
      prisma.payment.findMany.mockResolvedValue([stalePending]);

      const result = await service.createMyposCheckout('session-token-1', 0);

      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'payment-stale-1', status: 'PENDING' },
        data: { status: 'FAILED', providerStatus: 'EXPIRED' },
      });
      expect(core.emitBillPaymentCleared).toHaveBeenCalledWith(
        'session-1',
        'payment-stale-1',
        'ONLINE_PAYMENT',
      );
      expect(result.paymentId).toBe('payment-1');
    });
  });

  describe('handleMyposNotification', () => {
    it('returns error when required OrderID parameter is missing', async () => {
      const result = await service.handleMyposNotification({});
      expect(result).toBe('ERR=missing OrderID');
    });

    it('returns error when payment record is not found', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);

      const result = await service.handleMyposNotification({
        IPCmethod: 'IPCPurchaseNotify',
        OrderID: 'order-nonexistent',
      });
      expect(result).toBe('ERR=unknown OrderID');
    });

    it('returns error when signature verification fails', async () => {
      const paymentRecord = {
        id: 'payment-1',
        providerReference: 'ORD-1',
        restaurantId,
        restaurant: mockRestaurant,
      };
      prisma.payment.findFirst.mockResolvedValue(paymentRecord);
      mypos.verifyNotification.mockReturnValue({ verified: false });

      const result = await service.handleMyposNotification({
        IPCmethod: 'IPCPurchaseNotify',
        OrderID: 'ORD-1',
        Amount: '30.00',
        Currency: 'EUR',
      });
      expect(result).toBe('ERR=invalid Signature');
    });

    it('successfully processes IPCPurchaseNotify with status 0 and claims payment', async () => {
      const paymentRecord = {
        id: 'payment-1',
        providerReference: 'ORD-1',
        restaurantId,
        status: 'PENDING',
        amount: 30,
        currency: 'eur',
        restaurant: mockRestaurant,
        tableSession: { id: 'session-1' },
      };
      prisma.payment.findFirst.mockResolvedValue(paymentRecord);
      mypos.verifyNotification.mockReturnValue({
        verified: true,
        method: 'IPCPurchaseNotify',
        orderId: 'ORD-1',
        storeId: '000000000000001',
        amount: '30.00',
        currency: 'EUR',
        status: '0',
        transactionRef: 'TRN-100',
      });
      mypos.formatResponse.mockReturnValue('OK');

      const result = await service.handleMyposNotification({
        IPCmethod: 'IPCPurchaseNotify',
        OrderID: 'ORD-1',
        IPC_Trnref: 'TRN-100',
        Amount: '30.00',
        Currency: 'EUR',
        Status: '0',
      });

      expect(result).toBe('OK');
      expect(core.recordProviderEvent).toHaveBeenCalledWith(
        expect.anything(),
        PaymentProvider.MYPOS,
        expect.stringContaining('ORD-1'),
        expect.anything(),
      );
      expect(core.claimSuccessfulPayment).toHaveBeenCalled();
      expect(core.emitPaymentClaimEvents).toHaveBeenCalled();
    });

    it('handles payment amount mismatch by returning ERR=reconciliation', async () => {
      const paymentRecord = {
        id: 'payment-1',
        providerReference: 'ORD-1',
        restaurantId,
        status: 'PENDING',
        amount: 30, // expects 30 EUR
        currency: 'eur',
        restaurant: mockRestaurant,
        tableSession: { id: 'session-1' },
      };
      prisma.payment.findFirst.mockResolvedValue(paymentRecord);
      mypos.verifyNotification.mockReturnValue({
        verified: true,
        method: 'IPCPurchaseNotify',
        orderId: 'ORD-1',
        storeId: '000000000000001',
        amount: '15.00', // only 15 EUR!
        currency: 'EUR',
        status: '0',
      });

      const result = await service.handleMyposNotification({
        IPCmethod: 'IPCPurchaseNotify',
        OrderID: 'ORD-1',
        Amount: '15.00',
        Currency: 'EUR',
        Status: '0',
      });

      expect(result).toBe('ERR=reconciliation');
    });

    it('handles payment failure (status != 0) and marks payment FAILED', async () => {
      const paymentRecord = {
        id: 'payment-1',
        providerReference: 'ORD-1',
        restaurantId,
        status: 'PENDING',
        amount: 30,
        currency: 'eur',
        restaurant: mockRestaurant,
        tableSession: { id: 'session-1' },
      };
      prisma.payment.findFirst.mockResolvedValue(paymentRecord);
      mypos.verifyNotification.mockReturnValue({
        verified: true,
        method: 'IPCPurchaseNotify',
        orderId: 'ORD-1',
        storeId: '000000000000001',
        amount: '30.00',
        currency: 'EUR',
        status: '2', // declined status
        transactionRef: 'TRN-100',
      });

      const result = await service.handleMyposNotification({
        IPCmethod: 'IPCPurchaseNotify',
        OrderID: 'ORD-1',
        Amount: '30.00',
        Currency: 'EUR',
        Status: '2',
      });

      expect(result).toBe('OK');
      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'payment-1', status: 'PENDING' },
        data: expect.objectContaining({
          status: 'FAILED',
          providerStatus: 'DECLINED',
        }),
      });
      expect(core.claimSuccessfulPayment).not.toHaveBeenCalled();
    });
  });
});
