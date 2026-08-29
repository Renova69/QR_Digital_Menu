import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { PaymentReportingService } from './payment-reporting.service';

type PrismaMock = {
  payment: {
    findMany: jest.Mock;
  };
  paymentReconciliationIssue: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    updateMany: jest.Mock;
  };
  tableSession: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  $transaction: jest.Mock;
};

type CoreMock = {
  verifyRestaurantAccess: jest.Mock;
  mapPayment: jest.Mock;
};

type EventsMock = {
  emitTableStatusChanged: jest.Mock;
};

describe('PaymentReportingService reconciliation queue', () => {
  let prisma: PrismaMock;
  let core: CoreMock;
  let events: EventsMock;
  let service: PaymentReportingService;

  beforeEach(() => {
    prisma = {
      payment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      paymentReconciliationIssue: {
        findMany: jest.fn().mockResolvedValue([{ id: 'issue-1' }]),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      tableSession: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      $transaction: jest.fn((fn: (tx: PrismaMock) => unknown) => fn(prisma)),
    };
    core = {
      verifyRestaurantAccess: jest.fn().mockResolvedValue({ id: 'rest-1' }),
      mapPayment: jest.fn((payment: unknown) => payment),
    };
    events = {
      emitTableStatusChanged: jest.fn(),
    };
    service = new PaymentReportingService(
      prisma as unknown as ConstructorParameters<
        typeof PaymentReportingService
      >[0],
      core as unknown as ConstructorParameters<
        typeof PaymentReportingService
      >[1],
      events as unknown as ConstructorParameters<
        typeof PaymentReportingService
      >[2],
    );
  });

  it('lists only the requested restaurant and status with a bounded query', async () => {
    const result = await service.getPaymentReconciliationIssues(
      'rest-1',
      'owner-1',
    );

    expect(core.verifyRestaurantAccess).toHaveBeenCalledWith(
      'rest-1',
      'owner-1',
    );
    expect(prisma.paymentReconciliationIssue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { restaurantId: 'rest-1', status: 'OPEN' },
        take: 100,
      }),
    );
    expect(result).toEqual([{ id: 'issue-1' }]);
  });

  it('checks tenant access before resolving an issue', async () => {
    prisma.paymentReconciliationIssue.findUnique.mockResolvedValue({
      id: 'issue-1',
      restaurantId: 'rest-2',
      status: 'OPEN',
    });
    core.verifyRestaurantAccess.mockRejectedValue(new ForbiddenException());

    await expect(
      service.resolvePaymentReconciliationIssue(
        'issue-1',
        'rest-1',
        'owner-1',
        'RESOLVED',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.paymentReconciliationIssue.updateMany).not.toHaveBeenCalled();
  });

  it('uses a compare-and-set transition so two owners cannot resolve twice', async () => {
    prisma.paymentReconciliationIssue.findUnique.mockResolvedValue({
      id: 'issue-1',
      restaurantId: 'rest-1',
      status: 'OPEN',
    });
    prisma.paymentReconciliationIssue.updateMany.mockResolvedValue({
      count: 0,
    });

    await expect(
      service.resolvePaymentReconciliationIssue(
        'issue-1',
        'rest-1',
        'owner-1',
        'RESOLVED',
        'Refunded through provider portal',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.paymentReconciliationIssue.updateMany).toHaveBeenCalledWith({
      where: { id: 'issue-1', restaurantId: 'rest-1', status: 'OPEN' },
      data: expect.objectContaining({
        status: 'RESOLVED',
        resolvedById: 'owner-1',
        resolutionNote: 'Refunded through provider portal',
      }),
    });
  });

  it('bounds payment exports to one row beyond the public limit', async () => {
    await service.exportPayments('rest-1', 'owner-1', {});

    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5_001 }),
    );
  });

  it('rejects an oversized export instead of returning a silent partial file', async () => {
    prisma.payment.findMany.mockResolvedValue(
      Array.from({ length: 5_001 }, (_, index) => ({ id: `pay-${index}` })),
    );

    await expect(
      service.exportPayments('rest-1', 'owner-1', {}),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(core.mapPayment).not.toHaveBeenCalled();
  });

  describe('reopenSessionForRecollection', () => {
    const openIssue = {
      id: 'issue-1',
      restaurantId: 'rest-1',
      status: 'OPEN',
      reason: 'REFUND_LEFT_BALANCE',
      tableSessionId: 'sess-1',
    };

    it('throws NotFoundException when the issue does not exist', async () => {
      prisma.paymentReconciliationIssue.findUnique.mockResolvedValue(null);

      await expect(
        service.reopenSessionForRecollection('issue-1', 'rest-1', 'owner-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('checks tenant access before reopening', async () => {
      prisma.paymentReconciliationIssue.findUnique.mockResolvedValue(openIssue);
      core.verifyRestaurantAccess.mockRejectedValue(new ForbiddenException());

      await expect(
        service.reopenSessionForRecollection('issue-1', 'rest-1', 'owner-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects when the issue is already closed', async () => {
      prisma.paymentReconciliationIssue.findUnique.mockResolvedValue({
        ...openIssue,
        status: 'RESOLVED',
      });

      await expect(
        service.reopenSessionForRecollection('issue-1', 'rest-1', 'owner-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects reasons other than REFUND_LEFT_BALANCE', async () => {
      prisma.paymentReconciliationIssue.findUnique.mockResolvedValue({
        ...openIssue,
        reason: 'SESSION_NOT_OPEN',
      });

      await expect(
        service.reopenSessionForRecollection('issue-1', 'rest-1', 'owner-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects an issue with no linked table session', async () => {
      prisma.paymentReconciliationIssue.findUnique.mockResolvedValue({
        ...openIssue,
        tableSessionId: null,
      });

      await expect(
        service.reopenSessionForRecollection('issue-1', 'rest-1', 'owner-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects when the linked table session no longer exists', async () => {
      prisma.paymentReconciliationIssue.findUnique.mockResolvedValue(openIssue);
      prisma.tableSession.findUnique.mockResolvedValue(null);

      await expect(
        service.reopenSessionForRecollection('issue-1', 'rest-1', 'owner-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses to reopen when the table already has a different open session', async () => {
      prisma.paymentReconciliationIssue.findUnique.mockResolvedValue(openIssue);
      prisma.tableSession.findUnique.mockResolvedValue({
        id: 'sess-1',
        tableId: 'table-1',
        restaurantId: 'rest-1',
        status: 'CLOSED_PAID',
      });
      prisma.tableSession.findFirst.mockResolvedValue({ id: 'sess-2' });

      await expect(
        service.reopenSessionForRecollection('issue-1', 'rest-1', 'owner-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.tableSession.update).not.toHaveBeenCalled();
    });

    it('reopens the session, resolves the issue, and emits a table status change', async () => {
      prisma.paymentReconciliationIssue.findUnique.mockResolvedValue(openIssue);
      prisma.tableSession.findUnique.mockResolvedValue({
        id: 'sess-1',
        tableId: 'table-1',
        restaurantId: 'rest-1',
        status: 'CLOSED_PAID',
      });
      prisma.tableSession.findFirst.mockResolvedValue(null);

      await service.reopenSessionForRecollection(
        'issue-1',
        'rest-1',
        'owner-1',
        'Collected cash from guest',
      );

      expect(prisma.tableSession.update).toHaveBeenCalledWith({
        where: { id: 'sess-1', restaurantId: 'rest-1' },
        data: { status: 'OPEN', paidAt: null },
      });
      expect(prisma.paymentReconciliationIssue.updateMany).toHaveBeenCalledWith(
        {
          where: {
            id: 'issue-1',
            restaurantId: 'rest-1',
            status: 'OPEN',
          },
          data: expect.objectContaining({
            status: 'RESOLVED',
            resolvedById: 'owner-1',
            resolutionNote: 'Collected cash from guest',
          }),
        },
      );
      expect(events.emitTableStatusChanged).toHaveBeenCalledWith(
        'rest-1',
        'table-1',
        'sess-1',
      );
    });

    it('does not touch an already-OPEN session but still resolves the issue', async () => {
      prisma.paymentReconciliationIssue.findUnique.mockResolvedValue(openIssue);
      prisma.tableSession.findUnique.mockResolvedValue({
        id: 'sess-1',
        tableId: 'table-1',
        restaurantId: 'rest-1',
        status: 'OPEN',
      });

      await service.reopenSessionForRecollection(
        'issue-1',
        'rest-1',
        'owner-1',
      );

      expect(prisma.tableSession.update).not.toHaveBeenCalled();
      expect(prisma.tableSession.findFirst).not.toHaveBeenCalled();
      expect(events.emitTableStatusChanged).toHaveBeenCalledWith(
        'rest-1',
        'table-1',
        'sess-1',
      );
    });

    it('uses a compare-and-set transition so two owners cannot both resolve it', async () => {
      prisma.paymentReconciliationIssue.findUnique.mockResolvedValue(openIssue);
      prisma.tableSession.findUnique.mockResolvedValue({
        id: 'sess-1',
        tableId: 'table-1',
        restaurantId: 'rest-1',
        status: 'CLOSED_PAID',
      });
      prisma.paymentReconciliationIssue.updateMany.mockResolvedValue({
        count: 0,
      });

      await expect(
        service.reopenSessionForRecollection('issue-1', 'rest-1', 'owner-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(events.emitTableStatusChanged).not.toHaveBeenCalled();
    });
  });
});
