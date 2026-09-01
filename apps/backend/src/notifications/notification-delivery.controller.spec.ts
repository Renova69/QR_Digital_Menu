import { ForbiddenException } from '@nestjs/common';
import { NotificationDeliveryStatus } from '@prisma/client';
import { NotificationDeliveryController } from './notification-delivery.controller';

describe('NotificationDeliveryController', () => {
  let deliveries: {
    listForRestaurant: jest.Mock;
    retryFailed: jest.Mock;
    getSmsUsage: jest.Mock;
  };
  let controller: NotificationDeliveryController;

  const validStatus = Object.values(NotificationDeliveryStatus)[0];
  const ownerReq = { user: { id: 'u1', role: 'OWNER' } } as any;
  const managerReq = { user: { id: 'u2', role: 'MANAGER' } } as any;
  const waiterReq = { user: { id: 'u3', role: 'WAITER' } } as any;

  beforeEach(() => {
    deliveries = {
      listForRestaurant: jest.fn(),
      retryFailed: jest.fn(),
      getSmsUsage: jest.fn(),
    };
    controller = new NotificationDeliveryController(deliveries as any);
  });

  it('lists deliveries for an owner with a valid status filter', async () => {
    deliveries.listForRestaurant.mockResolvedValue([{ id: 'd1' }]);

    const result = controller.list('r1', ownerReq, validStatus);

    expect(deliveries.listForRestaurant).toHaveBeenCalledWith(
      'r1',
      'u1',
      validStatus,
    );
    await expect(result).resolves.toEqual([{ id: 'd1' }]);
  });

  it('drops an invalid status filter to undefined', async () => {
    deliveries.listForRestaurant.mockResolvedValue([]);

    await controller.list('r1', ownerReq, 'BOGUS_STATUS');

    expect(deliveries.listForRestaurant).toHaveBeenCalledWith(
      'r1',
      'u1',
      undefined,
    );
  });

  it('allows a manager to list deliveries', async () => {
    deliveries.listForRestaurant.mockResolvedValue([]);

    await controller.list('r1', managerReq);

    expect(deliveries.listForRestaurant).toHaveBeenCalledWith(
      'r1',
      'u2',
      undefined,
    );
  });

  it('forbids non-manager roles from listing', () => {
    expect(() => controller.list('r1', waiterReq)).toThrow(ForbiddenException);
    expect(deliveries.listForRestaurant).not.toHaveBeenCalled();
  });

  it('returns the track-only SMS usage summary for a manager', async () => {
    deliveries.getSmsUsage.mockResolvedValue({ usedSegments: 12 });

    const result = controller.smsUsage('r1', managerReq, '2026-08');

    expect(deliveries.getSmsUsage).toHaveBeenCalledWith('r1', 'u2', '2026-08');
    await expect(result).resolves.toEqual({ usedSegments: 12 });
  });

  it('forbids requests without a user', () => {
    expect(() => controller.list('r1', {} as any)).toThrow(ForbiddenException);
  });

  it('retries a failed delivery for an owner', async () => {
    deliveries.retryFailed.mockResolvedValue({ id: 'd1' });

    const result = controller.retry('r1', 'd1', ownerReq);

    expect(deliveries.retryFailed).toHaveBeenCalledWith('r1', 'd1', 'u1');
    await expect(result).resolves.toEqual({ id: 'd1' });
  });

  it('forbids non-manager roles from retrying', () => {
    expect(() => controller.retry('r1', 'd1', waiterReq)).toThrow(
      ForbiddenException,
    );
    expect(deliveries.retryFailed).not.toHaveBeenCalled();
  });
});
