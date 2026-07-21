import { BoricaCheckoutService } from './borica-checkout.service';

type PrismaMock = {
  payment: {
    findMany: jest.Mock;
    updateMany: jest.Mock;
  };
  paymentReconciliationIssue: {
    upsert: jest.Mock;
  };
  $transaction: jest.Mock;
};

type BoricaMock = {
  queryTransactionStatus: jest.Mock;
};

type CoreMock = {
  mergeProviderPayload: jest.Mock;
  recordProviderEvent: jest.Mock;
  claimSuccessfulPayment: jest.Mock;
  recordCapturedPaymentForReconciliation: jest.Mock;
  emitPaymentClaimEvents: jest.Mock;
  emitBillPaymentCleared: jest.Mock;
};

type ConfigMock = {
  resolveBoricaKeypair: jest.Mock;
};

describe('BoricaCheckoutService reconciliation', () => {
  let prisma: PrismaMock;
  let borica: BoricaMock;
  let core: CoreMock;
  let config: ConfigMock;
  let service: BoricaCheckoutService;

  const payment = {
    id: 'payment-1',
    restaurantId: 'restaurant-1',
    tableSessionId: 'session-1',
    provider: 'BORICA',
    providerReference: '000001',
    providerStatus: 'PENDING',
    status: 'PENDING',
    amount: 20,
    currency: 'eur',
    createdAt: new Date(),
    updatedAt: new Date(),
    restaurant: { id: 'restaurant-1', boricaMode: 'LIVE' },
  };

  const success = {
    verified: true,
    rc: '00',
    action: '0',
    order: '000001',
    terminal: 'V1800001',
    amount: '20.00',
    currency: 'EUR',
    rrn: '123456789012',
    intRef: 'INT001',
  };

  beforeEach(() => {
    prisma = {
      payment: {
        findMany: jest.fn().mockResolvedValue([payment]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      paymentReconciliationIssue: {
        upsert: jest.fn().mockResolvedValue({ id: 'issue-1' }),
      },
      $transaction: jest.fn((callback: (tx: PrismaMock) => unknown) =>
        callback(prisma),
      ),
    };
    borica = {
      queryTransactionStatus: jest.fn().mockResolvedValue(success),
    };
    core = {
      mergeProviderPayload: jest.fn(
        (
          payload: Record<string, unknown> | null,
          patch: Record<string, unknown>,
        ) => ({
          ...(payload ?? {}),
          ...patch,
        }),
      ),
      recordProviderEvent: jest.fn().mockResolvedValue(true),
      claimSuccessfulPayment: jest.fn().mockResolvedValue({
        claimed: true,
        sessionPaid: true,
      }),
      recordCapturedPaymentForReconciliation: jest.fn().mockResolvedValue({
        claimed: true,
        sessionPaid: false,
        needsReconciliation: true,
        reconciliationReason: 'PROVIDER_CONFIRMATION_MISMATCH',
      }),
      emitPaymentClaimEvents: jest.fn().mockResolvedValue(undefined),
      emitBillPaymentCleared: jest.fn(),
    };
    config = {
      resolveBoricaKeypair: jest.fn().mockReturnValue({
        terminal: 'V1800001',
        merchant: 'merchant-1',
        merchantName: 'Restaurant',
        privateKeyPem: 'private-key',
        certPem: 'certificate',
      }),
    };
    service = new BoricaCheckoutService(
      prisma as unknown as ConstructorParameters<
        typeof BoricaCheckoutService
      >[0],
      borica as unknown as ConstructorParameters<
        typeof BoricaCheckoutService
      >[1],
      core as unknown as ConstructorParameters<typeof BoricaCheckoutService>[2],
      config as unknown as ConstructorParameters<
        typeof BoricaCheckoutService
      >[3],
    );
  });

  it('claims a signed successful status and records a dedup event', async () => {
    const summary = await service.reconcileBoricaPayments();

    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          provider: 'BORICA',
          OR: [
            { status: 'PENDING' },
            { status: 'FAILED', providerStatus: 'EXPIRED' },
          ],
        }),
        take: 100,
      }),
    );
    expect(core.recordProviderEvent).toHaveBeenCalledWith(
      prisma,
      'BORICA',
      expect.stringContaining('status:000001:'),
      expect.objectContaining({
        paymentId: 'payment-1',
        restaurantId: 'restaurant-1',
      }),
    );
    expect(core.claimSuccessfulPayment).toHaveBeenCalledWith(
      prisma,
      payment,
      expect.objectContaining({
        status: 'SUCCEEDED',
        providerStatus: 'RECOVERED_VIA_STATUS_CHECK',
      }),
      { allowFailedRecovery: false },
    );
    expect(core.emitPaymentClaimEvents).toHaveBeenCalled();
    expect(summary).toMatchObject({ scanned: 1, recovered: 1, errors: 0 });
  });

  it('recovers only an explicitly expired FAILED payment', async () => {
    const expired = {
      ...payment,
      status: 'FAILED',
      providerStatus: 'EXPIRED',
    };
    prisma.payment.findMany.mockResolvedValue([expired]);

    await service.reconcileBoricaPayments();

    expect(core.claimSuccessfulPayment).toHaveBeenCalledWith(
      prisma,
      expired,
      expect.any(Object),
      { allowFailedRecovery: true },
    );
  });

  it('keeps a signed non-final transaction recoverable instead of failing it', async () => {
    borica.queryTransactionStatus.mockResolvedValue({
      ...success,
      rc: '-17',
      action: '',
    });

    const summary = await service.reconcileBoricaPayments();

    expect(prisma.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'payment-1',
        status: { in: ['PENDING', 'FAILED'] },
      },
      data: { status: 'PENDING', providerStatus: 'STATUS_UNKNOWN' },
    });
    expect(core.claimSuccessfulPayment).not.toHaveBeenCalled();
    expect(summary.pending).toBe(1);
  });

  it('isolates transient provider failures per payment', async () => {
    prisma.payment.findMany.mockResolvedValue([
      payment,
      { ...payment, id: 'payment-2', providerReference: '000002' },
    ]);
    borica.queryTransactionStatus
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        ...success,
        order: '000002',
      });

    const summary = await service.reconcileBoricaPayments();

    expect(summary).toMatchObject({
      scanned: 2,
      recovered: 1,
      errors: 1,
    });
  });

  it('does not apply a duplicate status event twice', async () => {
    core.recordProviderEvent.mockResolvedValue(false);

    const summary = await service.reconcileBoricaPayments();

    expect(core.claimSuccessfulPayment).not.toHaveBeenCalled();
    expect(summary.duplicates).toBe(1);
  });

  it('persists a signed success with mismatched provider fields for manual review', async () => {
    borica.queryTransactionStatus.mockResolvedValue({
      ...success,
      amount: '99.00',
    });

    const summary = await service.reconcileBoricaPayments();

    expect(core.recordCapturedPaymentForReconciliation).toHaveBeenCalledWith(
      prisma,
      payment,
      expect.objectContaining({ status: 'SUCCEEDED' }),
      'PROVIDER_CONFIRMATION_MISMATCH',
      expect.objectContaining({ amountOk: false }),
      { allowFailedRecovery: false },
    );
    expect(summary).toMatchObject({ recovered: 1, manualReview: 1 });
  });

  it('moves a signed final decline out of the recoverable queue', async () => {
    borica.queryTransactionStatus.mockResolvedValue({
      ...success,
      rc: '05',
      action: '1',
    });

    const summary = await service.reconcileBoricaPayments();

    expect(prisma.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'payment-1',
        status: { in: ['PENDING', 'FAILED'] },
      },
      data: expect.objectContaining({
        status: 'FAILED',
        providerStatus: '05',
      }),
    });
    expect(summary.declined).toBe(1);
  });

  it('creates a durable manual-review issue after the reconciliation TTL', async () => {
    prisma.payment.findMany.mockResolvedValue([
      {
        ...payment,
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      },
    ]);

    const summary = await service.reconcileBoricaPayments();

    expect(prisma.paymentReconciliationIssue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { paymentId: 'payment-1' },
        create: expect.objectContaining({
          reason: 'PROVIDER_STATUS_UNKNOWN',
          status: 'OPEN',
        }),
      }),
    );
    expect(borica.queryTransactionStatus).not.toHaveBeenCalled();
    expect(summary.manualReview).toBe(1);
  });
});
