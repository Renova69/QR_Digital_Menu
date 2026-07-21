import {
  ConflictException,
  ForbiddenException,
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
};

type CoreMock = {
  verifyRestaurantAccess: jest.Mock;
  mapPayment: jest.Mock;
};

describe('PaymentReportingService reconciliation queue', () => {
  let prisma: PrismaMock;
  let core: CoreMock;
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
    };
    core = {
      verifyRestaurantAccess: jest.fn().mockResolvedValue({ id: 'rest-1' }),
      mapPayment: jest.fn((payment: unknown) => payment),
    };
    service = new PaymentReportingService(
      prisma as unknown as ConstructorParameters<
        typeof PaymentReportingService
      >[0],
      core as unknown as ConstructorParameters<
        typeof PaymentReportingService
      >[1],
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
        'owner-1',
        'RESOLVED',
        'Refunded through provider portal',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.paymentReconciliationIssue.updateMany).toHaveBeenCalledWith({
      where: { id: 'issue-1', status: 'OPEN' },
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
});
