import { NotificationChannel } from '@prisma/client';
import { ReservationReminderService } from './reservation-reminder.service';

function build() {
  const findMany = jest.fn();
  const prisma = { reservation: { findMany } };
  const prepare = jest.fn().mockResolvedValue([
    {
      channel: NotificationChannel.EMAIL,
      payload: { to: 'g@example.com', subject: 'Reminder', text: 'Reminder' },
    },
  ]);
  const notifications = { prepare };
  const enqueueMany = jest.fn().mockResolvedValue([]);
  const deliveries = { enqueueMany };
  const service = new ReservationReminderService(
    prisma as unknown as ConstructorParameters<
      typeof ReservationReminderService
    >[0],
    notifications as unknown as ConstructorParameters<
      typeof ReservationReminderService
    >[1],
    deliveries as unknown as ConstructorParameters<
      typeof ReservationReminderService
    >[2],
  );
  return { service, findMany, prepare, enqueueMany };
}

const dueRow = {
  id: 'res1',
  restaurantId: 'rest1',
  guestEmail: 'g@example.com',
  guestPhone: '+359000000000',
  guestName: 'Ivan',
  startsAt: new Date(Date.now() + 12 * 3600 * 1000),
  referenceCode: 'ABC123',
  notifyByEmail: true,
  notifyBySms: true,
  notificationLocale: 'bg',
};

describe('ReservationReminderService.sweep', () => {
  it('durably enqueues each requested REMINDER channel', async () => {
    const { service, findMany, prepare, enqueueMany } = build();
    findMany.mockResolvedValue([dueRow]);

    const count = await service.sweep();

    expect(count).toBe(1);
    const where = findMany.mock.calls[0][0].where;
    expect(where.status).toBe('CONFIRMED');
    expect(where.reminderSentAt).toBeNull();
    expect(where.startsAt.gt).toBeInstanceOf(Date);
    expect(where.startsAt.lte).toBeInstanceOf(Date);
    expect(where.restaurant).toEqual({ isActive: true });
    expect(prepare).toHaveBeenCalledWith(
      'REMINDER',
      expect.objectContaining({
        referenceCode: 'ABC123',
        notifyByEmail: true,
        notifyBySms: true,
        notificationLocale: 'bg',
      }),
    );
    expect(enqueueMany).toHaveBeenCalledWith([
      expect.objectContaining({
        restaurantId: 'rest1',
        sourceType: 'RESERVATION_REMINDER',
        sourceId: 'res1',
        deduplicationKey: 'res1:reservation-reminder',
        channel: NotificationChannel.EMAIL,
      }),
    ]);
  });

  it('continues with later reservations when one enqueue fails', async () => {
    const { service, findMany, enqueueMany } = build();
    findMany.mockResolvedValue([
      dueRow,
      { ...dueRow, id: 'res2', referenceCode: 'DEF456' },
    ]);
    enqueueMany
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce([]);

    await expect(service.sweep()).resolves.toBe(1);
    expect(enqueueMany).toHaveBeenCalledTimes(2);
  });

  it('does not report success when no deliverable channel can be prepared', async () => {
    const { service, findMany, prepare, enqueueMany } = build();
    findMany.mockResolvedValue([dueRow]);
    prepare.mockResolvedValue([]);

    await expect(service.sweep()).resolves.toBe(0);
    expect(enqueueMany).not.toHaveBeenCalled();
  });

  it('continues with later reservations when one prepare step fails', async () => {
    const { service, findMany, prepare, enqueueMany } = build();
    findMany.mockResolvedValue([
      dueRow,
      { ...dueRow, id: 'res2', referenceCode: 'DEF456' },
    ]);
    prepare
      .mockRejectedValueOnce(new Error('restaurant lookup unavailable'))
      .mockResolvedValueOnce([
        {
          channel: NotificationChannel.EMAIL,
          payload: { to: 'g@example.com' },
        },
      ]);

    await expect(service.sweep()).resolves.toBe(1);
    expect(enqueueMany).toHaveBeenCalledTimes(1);
  });

  it('no-ops on an empty window', async () => {
    const { service, findMany, prepare, enqueueMany } = build();
    findMany.mockResolvedValue([]);

    await expect(service.sweep()).resolves.toBe(0);
    expect(prepare).not.toHaveBeenCalled();
    expect(enqueueMany).not.toHaveBeenCalled();
  });
});
