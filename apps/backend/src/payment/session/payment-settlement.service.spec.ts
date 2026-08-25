import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { FeatureFlag } from '../../subscription/feature-flag.enum';
import {
  CashPaymentRequestScope,
  CashPaymentRequestStatus,
} from '@prisma/client';
import { PaymentSettlementService } from './payment-settlement.service';
import { SplitMode, SplitProvider } from '../dto/settle-partial.dto';

describe('PaymentSettlementService', () => {
  const requestId = 'cash-request-1';
  const sessionId = 'session-1';

  function createHarness(transactionRequestSessionId = sessionId) {
    const lockOrder: string[] = [];
    const existingRequest = {
      id: requestId,
      restaurantId: 'restaurant-1',
      tableSessionId: sessionId,
      status: CashPaymentRequestStatus.PENDING,
      tableSession: { token: 'session-token' },
    };
    const requestInTransaction = {
      ...existingRequest,
      tableSessionId: transactionRequestSessionId,
      tableId: 'table-1',
      scope: CashPaymentRequestScope.FULL_TABLE,
      scopeKey: 'FULL_TABLE',
      orderIds: [],
      requestedAmount: 30,
      currency: 'EUR',
      paymentId: null,
      resolvedById: null,
      resolvedAt: null,
      createdAt: new Date('2026-07-21T12:00:00.000Z'),
      updatedAt: new Date('2026-07-21T12:00:00.000Z'),
      table: { name: '1' },
      tableSession: {
        id: transactionRequestSessionId,
        tableId: 'table-1',
        status: 'OPEN',
      },
    };
    const updatedRequest = {
      ...requestInTransaction,
      status: CashPaymentRequestStatus.PAID,
      paymentId: 'payment-1',
      resolvedById: 'manager-1',
      resolvedAt: new Date('2026-07-21T12:01:00.000Z'),
    };
    const tx = {
      cashPaymentRequest: {
        findUnique: jest.fn().mockResolvedValue(requestInTransaction),
        update: jest.fn().mockResolvedValue(updatedRequest),
      },
      tableSession: {
        findFirst: jest.fn().mockResolvedValue({
          id: sessionId,
          tableId: 'table-1',
          status: 'OPEN',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      payment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'payment-1' }),
      },
      orderItem: { updateMany: jest.fn() },
      paymentAllocation: { createMany: jest.fn() },
    };
    const prisma = {
      cashPaymentRequest: {
        findUnique: jest.fn().mockResolvedValue(existingRequest),
      },
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const core = {
      verifyCashPaymentOperatorAccess: jest.fn().mockResolvedValue(undefined),
      lockOpenSessionForSettlement: jest.fn().mockImplementation(async () => {
        lockOrder.push('session');
      }),
      lockPendingCashPaymentRequest: jest.fn().mockImplementation(async () => {
        lockOrder.push('cash-request');
      }),
      computeSessionBalance: jest
        .fn()
        .mockResolvedValueOnce({ remaining: 30 })
        .mockResolvedValueOnce({ remaining: 10 }),
      emitCashPaymentRequestEvent: jest.fn(),
      emitPaymentConfirmed: jest.fn(),
      formatCashPaymentRequest: jest
        .fn()
        .mockImplementation((request) => request),
    };
    const session = {
      findPendingCheckoutPayments: jest.fn().mockResolvedValue({
        stripe: [],
        nonStripeIds: ['online-payment-1'],
      }),
      cancelStripePaymentIntents: jest.fn().mockResolvedValue([]),
      applyAbandonedPaymentsForLockedSession: jest
        .fn()
        .mockImplementation(async () => {
          lockOrder.push('abandon');
          return ['online-payment-1'];
        }),
      abandonPendingCheckoutPaymentsForLockedSession: jest
        .fn()
        .mockImplementation(async () => {
          lockOrder.push('abandon');
          return ['online-payment-1'];
        }),
      emitAbandonedCheckoutEvents: jest.fn(),
    };
    const events = {
      emitTableStatusChanged: jest.fn(),
      emitToRestaurant: jest.fn(),
      emitToTableSession: jest.fn(),
    };
    const service = new PaymentSettlementService(
      prisma as never,
      events as never,
      {} as never,
      core as never,
      session as never,
    );

    return { core, lockOrder, prisma, service, session, tx };
  }

  it('locks the session before the cash request during confirmation', async () => {
    const { lockOrder, service, session, tx } = createHarness();

    await expect(
      service.confirmCashPaymentRequest(requestId, 'manager-1'),
    ).resolves.toMatchObject({
      id: requestId,
      status: CashPaymentRequestStatus.PAID,
      paymentId: 'payment-1',
    });

    expect(lockOrder).toEqual(['session', 'cash-request', 'abandon']);
    expect(tx.payment.create).toHaveBeenCalledTimes(1);
    expect(tx.cashPaymentRequest.update).toHaveBeenCalledTimes(1);
    expect(session.emitAbandonedCheckoutEvents).toHaveBeenCalledWith(
      sessionId,
      ['online-payment-1'],
    );
  });

  it('rejects a request moved to another session before writing payment state', async () => {
    const { lockOrder, service, session, tx } = createHarness('session-2');

    await expect(
      service.confirmCashPaymentRequest(requestId, 'manager-1'),
    ).rejects.toThrow(
      new ConflictException(
        'Cash payment request changed during confirmation. Please retry.',
      ),
    );

    expect(lockOrder).toEqual(['session', 'cash-request']);
    expect(tx.tableSession.findFirst).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(tx.cashPaymentRequest.update).not.toHaveBeenCalled();
    expect(
      session.abandonPendingCheckoutPaymentsForLockedSession,
    ).not.toHaveBeenCalled();
  });

  it('does not abandon customer checkout when an item split is invalid', async () => {
    const tx = {
      tableSession: {
        findFirst: jest.fn().mockResolvedValue({
          id: sessionId,
          tableId: 'table-1',
          status: 'OPEN',
        }),
      },
      payment: { create: jest.fn() },
    };
    const prisma = {
      tableSession: {
        findFirst: jest.fn().mockResolvedValue({ id: sessionId }),
      },
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const core = {
      verifyPosOperatorAccess: jest.fn().mockResolvedValue(undefined),
      normalizeTipPercent: jest.fn().mockReturnValue(0),
      lockOpenSessionForSettlement: jest.fn().mockResolvedValue(undefined),
      computeSessionBalance: jest.fn().mockResolvedValue({
        remaining: 30,
        hasLoyaltyDiscount: false,
        items: [],
      }),
    };
    const session = {
      findPendingCheckoutPayments: jest.fn().mockResolvedValue({
        stripe: [],
        nonStripeIds: [],
      }),
      cancelStripePaymentIntents: jest.fn().mockResolvedValue([]),
      applyAbandonedPaymentsForLockedSession: jest.fn(),
      abandonPendingCheckoutPaymentsForLockedSession: jest.fn(),
      emitAbandonedCheckoutEvents: jest.fn(),
    };
    const service = new PaymentSettlementService(
      prisma as never,
      {} as never,
      {} as never,
      core as never,
      session as never,
    );

    await expect(
      service.settlePartial('session-token', 'restaurant-1', 'manager-1', {
        restaurantId: 'restaurant-1',
        mode: SplitMode.ITEM,
        provider: SplitProvider.CASH,
      }),
    ).rejects.toThrow(
      new BadRequestException('Select at least one item to split'),
    );

    expect(
      session.abandonPendingCheckoutPaymentsForLockedSession,
    ).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  describe('createCashPaymentRequest', () => {
    it('rejects cash request when session is not found or not OPEN', async () => {
      const prisma = {
        tableSession: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      const service = new PaymentSettlementService(
        prisma as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );

      await expect(
        service.createCashPaymentRequest('invalid-token', 'rest-1'),
      ).rejects.toThrow(new NotFoundException('Session not found'));
    });

    it('rejects cash request when feature ORDERS_CALL_WAITER is locked on restaurant plan', async () => {
      const prisma = {
        tableSession: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'session-1',
            restaurant: { tier: 'FREE', forceTier: null },
          }),
        },
      };
      const featureService = {
        restaurantHasFeature: jest.fn().mockReturnValue(false),
      };
      const service = new PaymentSettlementService(
        prisma as never,
        {} as never,
        featureService as never,
        {} as never,
        {} as never,
      );

      await expect(
        service.createCashPaymentRequest('token-1', 'rest-1'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'FEATURE_LOCKED',
        }),
      });
      expect(featureService.restaurantHasFeature).toHaveBeenCalledWith(
        expect.anything(),
        FeatureFlag.ORDERS_CALL_WAITER,
      );
    });
  });

  describe('listCashPaymentRequests', () => {
    it('rejects unknown status filter string', async () => {
      const core = {
        verifyRestaurantStaffAccess: jest.fn().mockResolvedValue(undefined),
      };
      const service = new PaymentSettlementService(
        {} as never,
        {} as never,
        {} as never,
        core as never,
        {} as never,
      );

      await expect(
        service.listCashPaymentRequests('rest-1', 'user-1', 'INVALID_STATUS'),
      ).rejects.toThrow(
        new BadRequestException('Unknown cash payment request status'),
      );
    });
  });

  describe('cancelCashPaymentRequest', () => {
    it('throws NotFoundException when request does not exist', async () => {
      const prisma = {
        cashPaymentRequest: { findUnique: jest.fn().mockResolvedValue(null) },
      };
      const service = new PaymentSettlementService(
        prisma as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );

      await expect(
        service.cancelCashPaymentRequest('req-999', 'manager-1'),
      ).rejects.toThrow(
        new NotFoundException('Cash payment request not found'),
      );
    });

    it('throws ConflictException when request is already handled', async () => {
      const prisma = {
        cashPaymentRequest: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'req-1',
            restaurantId: 'rest-1',
            status: CashPaymentRequestStatus.PAID,
          }),
        },
      };
      const core = {
        verifyCashPaymentOperatorAccess: jest.fn().mockResolvedValue(undefined),
      };
      const service = new PaymentSettlementService(
        prisma as never,
        {} as never,
        {} as never,
        core as never,
        {} as never,
      );

      await expect(
        service.cancelCashPaymentRequest('req-1', 'manager-1'),
      ).rejects.toThrow(
        new ConflictException('Cash payment request is already handled'),
      );
    });
  });
});
