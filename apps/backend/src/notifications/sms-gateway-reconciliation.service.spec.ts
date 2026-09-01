import { SmsDeliveryStatus, SmsProvider } from '@prisma/client';
import {
  getSmsGatewayMessageStatus,
  smsGatewayConfigured,
} from '../common/sms/sms-gateway';
import { SmsGatewayReconciliationService } from './sms-gateway-reconciliation.service';

jest.mock('../common/sms/sms-gateway', () => ({
  getSmsGatewayMessageStatus: jest.fn(),
  smsGatewayConfigured: jest.fn(),
}));

const getStatusMock = jest.mocked(getSmsGatewayMessageStatus);
const configuredMock = jest.mocked(smsGatewayConfigured);

describe('SmsGatewayReconciliationService', () => {
  function build(
    claimed: Array<{ id: string; providerMessageId: string }> = [],
  ) {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue(claimed),
    };
    const receipts = {
      apply: jest.fn().mockResolvedValue(true),
    };
    return {
      prisma,
      receipts,
      service: new SmsGatewayReconciliationService(
        prisma as never,
        receipts as never,
      ),
    };
  }

  beforeEach(() => {
    configuredMock.mockReturnValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('does nothing when SMS Gateway credentials are unavailable', async () => {
    const { service, prisma } = build();
    configuredMock.mockReturnValue(false);
    await expect(service.reconcileAccepted()).resolves.toBe(0);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('claims a bounded cluster-safe batch with a five-minute retry watermark', async () => {
    const { service, prisma } = build();
    const now = new Date('2030-01-01T12:00:00Z');

    await service.reconcileAccepted(now);

    const query = prisma.$queryRaw.mock.calls[0][0] as {
      strings: readonly string[];
      values: unknown[];
    };
    const sql = query.strings.join('?');
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain('LIMIT');
    expect(sql).toContain('"smsLastReconciledAt"');
    expect(query.values).toEqual(
      expect.arrayContaining([
        new Date('2030-01-01T11:55:00Z'),
        new Date('2029-12-31T12:00:00Z'),
        25,
      ]),
    );
  });

  it('turns a delivered provider snapshot into an idempotent aggregate receipt', async () => {
    const { service, receipts } = build([
      { id: 'delivery-1', providerMessageId: 'message-1' },
    ]);
    getStatusMock.mockResolvedValue({
      ok: true,
      status: 200,
      detail: '',
      message: {
        id: 'message-1',
        state: 'Delivered',
        states: { Delivered: '2030-01-01T12:01:00Z' },
      },
    });
    const now = new Date('2030-01-01T12:02:00Z');

    await expect(service.reconcileAccepted(now)).resolves.toBe(1);

    expect(receipts.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: SmsProvider.SMS_GATEWAY,
        providerMessageId: 'message-1',
        providerStatus: 'Delivered',
        status: SmsDeliveryStatus.DELIVERED,
        eventAt: new Date('2030-01-01T12:01:00Z'),
        receivedAt: now,
        aggregateSnapshot: true,
        providerEventId: expect.stringMatching(/^poll:/),
      }),
    );
  });

  it.each([
    ['Failed', 'SMSGATEWAY_FAILED'],
    ['Cancelled', 'SMSGATEWAY_CANCELLED'],
  ] as const)('maps %s to a failed delivery', async (state, failureCode) => {
    const { service, receipts } = build([
      { id: 'delivery-1', providerMessageId: 'message-1' },
    ]);
    getStatusMock.mockResolvedValue({
      ok: true,
      status: 200,
      detail: '',
      message: { id: 'message-1', state, states: {} },
    });

    await service.reconcileAccepted(new Date('2030-01-01T12:00:00Z'));

    expect(receipts.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        status: SmsDeliveryStatus.FAILED,
        failureCode,
      }),
    );
  });

  it.each(['Pending', 'Processed', 'Cancelling'] as const)(
    'keeps %s non-terminal',
    async (state) => {
      const { service, receipts } = build([
        { id: 'delivery-1', providerMessageId: 'message-1' },
      ]);
      getStatusMock.mockResolvedValue({
        ok: true,
        status: 200,
        detail: '',
        message: { id: 'message-1', state, states: {} },
      });

      await service.reconcileAccepted(new Date('2030-01-01T12:00:00Z'));

      expect(receipts.apply).toHaveBeenCalledWith(
        expect.objectContaining({ status: SmsDeliveryStatus.ACCEPTED }),
      );
    },
  );

  it('leaves a not-yet-visible provider message eligible for a later retry', async () => {
    const { service, receipts } = build([
      { id: 'delivery-1', providerMessageId: 'message-1' },
    ]);
    getStatusMock.mockResolvedValue({
      ok: false,
      status: 404,
      detail: 'SMS gateway status request failed with HTTP 404',
    });

    await expect(
      service.reconcileAccepted(new Date('2030-01-01T12:00:00Z')),
    ).resolves.toBe(0);
    expect(receipts.apply).not.toHaveBeenCalled();
  });

  it('stops the batch on an upstream failure so SentryCron observes it', async () => {
    const { service, receipts } = build([
      { id: 'delivery-1', providerMessageId: 'message-1' },
      { id: 'delivery-2', providerMessageId: 'message-2' },
    ]);
    getStatusMock.mockResolvedValue({
      ok: false,
      status: 401,
      detail: 'SMS gateway status request failed with HTTP 401',
    });

    await expect(
      service.reconcileAccepted(new Date('2030-01-01T12:00:00Z')),
    ).rejects.toThrow('SMS gateway status request failed with HTTP 401');
    expect(getStatusMock).toHaveBeenCalledTimes(1);
    expect(receipts.apply).not.toHaveBeenCalled();
  });
});
