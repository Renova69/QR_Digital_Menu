import { ConflictException } from '@nestjs/common';
import {
  CashPaymentRequestScope,
  CashPaymentRequestStatus,
} from '@prisma/client';
import { PaymentSettlementService } from './payment-settlement.service';

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
      abandonCheckoutOrThrowIfPending: jest.fn().mockResolvedValue(undefined),
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

    return { core, lockOrder, prisma, service, tx };
  }

  it('locks the session before the cash request during confirmation', async () => {
    const { lockOrder, service, tx } = createHarness();

    await expect(
      service.confirmCashPaymentRequest(requestId, 'manager-1'),
    ).resolves.toMatchObject({
      id: requestId,
      status: CashPaymentRequestStatus.PAID,
      paymentId: 'payment-1',
    });

    expect(lockOrder).toEqual(['session', 'cash-request']);
    expect(tx.payment.create).toHaveBeenCalledTimes(1);
    expect(tx.cashPaymentRequest.update).toHaveBeenCalledTimes(1);
  });

  it('rejects a request moved to another session before writing payment state', async () => {
    const { lockOrder, service, tx } = createHarness('session-2');

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
  });
});
