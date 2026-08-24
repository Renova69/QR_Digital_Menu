jest.mock('@sentry/nestjs', () => ({ captureException: jest.fn() }));

import * as Sentry from '@sentry/nestjs';
import { PinSecurityService } from './pin-security.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';

const mockPrisma: any = {
  staffPinLoginAudit: { findMany: jest.fn(), count: jest.fn() },
  securityAlert: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
  },
  restaurant: { findUnique: jest.fn() },
};
const mockPush = {
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
};

const failures = (n: number, deviceTokenId = 'dev-1', status = 'INVALID_PIN') =>
  Array.from({ length: n }, () => ({ status, deviceTokenId }));

describe('PinSecurityService', () => {
  let service: PinSecurityService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.staffPinLoginAudit.findMany.mockResolvedValue([]);
    mockPrisma.staffPinLoginAudit.count.mockResolvedValue(0);
    mockPrisma.securityAlert.findFirst.mockResolvedValue(null);
    mockPrisma.securityAlert.create.mockResolvedValue({ id: 'a1' });
    mockPrisma.restaurant.findUnique.mockResolvedValue({
      ownerId: 'owner-1',
      name: 'Cafe Nova',
    });
    service = new PinSecurityService(
      mockPrisma as unknown as PrismaService,
      mockPush as unknown as PushService,
    );
  });

  it('raises nothing on an ordinary failed attempt', async () => {
    mockPrisma.staffPinLoginAudit.findMany.mockResolvedValue(failures(1));

    expect(await service.evaluate('rest-1', 'dev-1')).toEqual([]);
    expect(mockPrisma.securityAlert.create).not.toHaveBeenCalled();
  });

  // The strong signal: the same volume of failures, concentrated in a pattern
  // that does not happen by accident.
  it('alerts when two distinct devices lock in the window', async () => {
    mockPrisma.staffPinLoginAudit.findMany.mockResolvedValue([
      { status: 'LOCKED', deviceTokenId: 'dev-1' },
      { status: 'LOCKED', deviceTokenId: 'dev-2' },
    ]);

    expect(await service.evaluate('rest-1', 'dev-1')).toContain(
      'MULTI_DEVICE_LOCKOUT',
    );
    expect(mockPush.sendPushNotification).toHaveBeenCalled();
  });

  // One device locking repeatedly is a person who forgot their PIN, not an
  // attack across the estate.
  it('does not treat one device locking twice as a multi-device spike', async () => {
    mockPrisma.staffPinLoginAudit.findMany.mockResolvedValue([
      { status: 'LOCKED', deviceTokenId: 'dev-1' },
      { status: 'LOCKED', deviceTokenId: 'dev-1' },
    ]);

    expect(await service.evaluate('rest-1', 'dev-1')).not.toContain(
      'MULTI_DEVICE_LOCKOUT',
    );
  });

  it('alerts on 20 failures in the short window', async () => {
    mockPrisma.staffPinLoginAudit.findMany.mockResolvedValue(failures(20));

    expect(await service.evaluate('rest-1', 'dev-1')).toContain('PIN_SPIKE');
  });

  // Set well above a plausible shift change. Nineteen must stay silent, or the
  // alert becomes noise and the real one gets ignored.
  it('stays silent at 19 failures', async () => {
    mockPrisma.staffPinLoginAudit.findMany.mockResolvedValue(failures(19));

    expect(await service.evaluate('rest-1', 'dev-1')).not.toContain(
      'PIN_SPIKE',
    );
  });

  // Per-device lockout caps an attacker at five tries, so a patient one never
  // trips a 15-minute window and never even locks.
  it('alerts on a slow burn concentrated on one device', async () => {
    mockPrisma.staffPinLoginAudit.count
      .mockResolvedValueOnce(15) // 7-day, this device
      .mockResolvedValueOnce(15); // 24-hour, restaurant

    expect(await service.evaluate('rest-1', 'dev-1')).toContain(
      'DEVICE_SLOW_BURN',
    );
  });

  // Dashboard-only: a full trading day of failures across every device is
  // noisier than the 15-minute thresholds.
  it('records the restaurant aggregate without pushing', async () => {
    mockPrisma.staffPinLoginAudit.count
      .mockResolvedValueOnce(0) // device slow burn
      .mockResolvedValueOnce(20); // restaurant 24h

    const raised = await service.evaluate('rest-1', 'dev-1');

    expect(raised).toContain('RESTAURANT_AGGREGATE');
    expect(mockPush.sendPushNotification).not.toHaveBeenCalled();
  });

  // Dedupe lives in the database, not memory: three Cloud Run instances would
  // each alert separately for the same incident otherwise.
  it('suppresses a duplicate inside the dedupe window', async () => {
    mockPrisma.staffPinLoginAudit.findMany.mockResolvedValue(failures(20));
    mockPrisma.securityAlert.findFirst.mockResolvedValue({ id: 'existing' });

    expect(await service.evaluate('rest-1', 'dev-1')).toEqual([]);
    expect(mockPrisma.securityAlert.create).not.toHaveBeenCalled();
  });

  // One noisy tablet must not suppress an alert about a different one.
  it('dedupes device signals per device', async () => {
    mockPrisma.staffPinLoginAudit.count
      .mockResolvedValueOnce(15)
      .mockResolvedValueOnce(0);

    await service.evaluate('rest-1', 'dev-7');

    expect(mockPrisma.securityAlert.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          kind: 'DEVICE_SLOW_BURN',
          deviceTokenId: 'dev-7',
        }),
      }),
    );
  });

  // Detection is advisory. It runs on the auth path and must never be able to
  // turn a wrong PIN into a 500, or delay a legitimate login.
  it('never throws when the database fails', async () => {
    mockPrisma.staffPinLoginAudit.findMany.mockRejectedValue(
      new Error('connection pool timeout'),
    );

    await expect(service.evaluate('rest-1', 'dev-1')).resolves.toEqual([]);
  });

  // Not propagating is not the same as discarding. Nothing else reports a
  // swallowed detection failure, so without this PIN monitoring could be dead
  // for weeks while every login looked perfectly healthy.
  it('reports a swallowed failure to Sentry rather than losing it', async () => {
    mockPrisma.staffPinLoginAudit.findMany.mockRejectedValue(
      new Error('connection pool timeout'),
    );

    await service.evaluate('rest-1', 'dev-1');

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: { subsystem: 'pin-security', phase: 'evaluate' },
      }),
    );
  });

  // A push channel that has quietly stopped working must be visible, or alerts
  // stop reaching anyone while the dashboard still looks healthy.
  it('reports a failed push to Sentry', async () => {
    mockPrisma.staffPinLoginAudit.findMany.mockResolvedValue([
      { status: 'LOCKED', deviceTokenId: 'dev-1' },
      { status: 'LOCKED', deviceTokenId: 'dev-2' },
    ]);
    mockPush.sendPushNotification.mockRejectedValue(new Error('no subscription'));

    await service.evaluate('rest-1', 'dev-1');
    await new Promise((r) => setImmediate(r));

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: { subsystem: 'pin-security', phase: 'notify' },
      }),
    );
  });

  it('records the alert even when the push fails', async () => {
    mockPrisma.staffPinLoginAudit.findMany.mockResolvedValue([
      { status: 'LOCKED', deviceTokenId: 'dev-1' },
      { status: 'LOCKED', deviceTokenId: 'dev-2' },
    ]);
    mockPush.sendPushNotification.mockRejectedValue(
      new Error('no subscription'),
    );

    expect(await service.evaluate('rest-1', 'dev-1')).toContain(
      'MULTI_DEVICE_LOCKOUT',
    );
    expect(mockPrisma.securityAlert.create).toHaveBeenCalled();
  });

  // The blocking control stays per-device lockout. Nothing here may introduce a
  // restaurant-wide one, which an attacker could trigger deliberately to take
  // every till offline mid-service.
  it('never blocks: it only records and notifies', async () => {
    mockPrisma.staffPinLoginAudit.findMany.mockResolvedValue(failures(50));
    mockPrisma.staffPinLoginAudit.count.mockResolvedValue(50);

    await expect(service.evaluate('rest-1', 'dev-1')).resolves.toEqual(
      expect.any(Array),
    );
  });
});
