import { ReservationReminderService } from './reservation-reminder.service';

function build() {
  const findMany = jest.fn();
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const prisma = { reservation: { findMany, updateMany } };
  const notify = jest.fn();
  const notifications = { notify };
  const service = new ReservationReminderService(
    prisma as unknown as ConstructorParameters<
      typeof ReservationReminderService
    >[0],
    notifications as unknown as ConstructorParameters<
      typeof ReservationReminderService
    >[1],
  );
  return { service, findMany, updateMany, notify };
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
  it('claims each due row and dispatches a REMINDER over the guest channels', async () => {
    const { service, findMany, updateMany, notify } = build();
    findMany.mockResolvedValue([dueRow]);

    const count = await service.sweep();

    expect(count).toBe(1);
    // Only confirmed, not-yet-reminded, inside the 24h window are selected.
    const where = findMany.mock.calls[0][0].where;
    expect(where.status).toBe('CONFIRMED');
    expect(where.reminderSentAt).toBeNull();
    expect(where.startsAt.gt).toBeInstanceOf(Date);
    expect(where.startsAt.lte).toBeInstanceOf(Date);
    expect(where.restaurant).toEqual({ isActive: true });
    // Compare-and-swap claim keyed on reminderSentAt still null.
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'res1', reminderSentAt: null },
      }),
    );
    expect(notify).toHaveBeenCalledWith(
      'REMINDER',
      expect.objectContaining({
        referenceCode: 'ABC123',
        notifyByEmail: true,
        notifyBySms: true,
        notificationLocale: 'bg',
      }),
    );
  });

  it('does not dispatch when another worker already claimed the row', async () => {
    const { service, findMany, updateMany, notify } = build();
    findMany.mockResolvedValue([dueRow]);
    updateMany.mockResolvedValueOnce({ count: 0 }); // lost the race

    await service.sweep();

    expect(notify).not.toHaveBeenCalled();
  });

  it('no-ops on an empty window', async () => {
    const { service, findMany, updateMany, notify } = build();
    findMany.mockResolvedValue([]);

    const count = await service.sweep();

    expect(count).toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});
