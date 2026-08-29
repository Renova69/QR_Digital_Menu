import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { PrismaService } from '../prisma/prisma.service';
import { STEP_UP_MAX_AGE_SECONDS, StepUpAuthGuard } from './step-up-auth.guard';

describe('StepUpAuthGuard', () => {
  const prisma = {
    userSession: { findFirst: jest.fn() },
  };
  const guard = new StepUpAuthGuard(prisma as unknown as PrismaService);

  const context = (user?: Record<string, unknown>) =>
    new ExecutionContextHost([{ user }]) as unknown as Parameters<
      StepUpAuthGuard['canActivate']
    >[0];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-08-29T08:00:00Z'));
  });

  afterEach(() => jest.useRealTimers());

  it('accepts a current strong-auth durable session at the freshness boundary', async () => {
    prisma.userSession.findFirst.mockResolvedValue({ id: 'session-1' });

    await expect(
      guard.canActivate(context({ id: 'user-1', sessionId: 'session-1' })),
    ).resolves.toBe(true);

    expect(prisma.userSession.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'session-1',
        userId: 'user-1',
        authMethod: { in: ['PASSWORD', 'GOOGLE', 'OTP'] },
        createdAt: {
          gte: new Date(Date.now() - STEP_UP_MAX_AGE_SECONDS * 1000),
        },
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
  });

  it('rejects an old, PIN, revoked or expired session through one scoped lookup', async () => {
    prisma.userSession.findFirst.mockResolvedValue(null);

    await expect(
      guard.canActivate(context({ id: 'user-1', sessionId: 'session-1' })),
    ).rejects.toMatchObject({
      response: {
        code: 'STEP_UP_REQUIRED',
        maxAgeSeconds: STEP_UP_MAX_AGE_SECONDS,
      },
    });
  });

  it.each([
    undefined,
    { id: 'user-1' },
    { sessionId: 'session-1' },
    { id: 'user-1', sessionId: 'session-1', isImpersonation: true },
  ])(
    'fails before the database for an ineligible request: %j',
    async (user) => {
      await expect(guard.canActivate(context(user))).rejects.toMatchObject({
        response: { code: 'STEP_UP_REQUIRED' },
      });
      expect(prisma.userSession.findFirst).not.toHaveBeenCalled();
    },
  );
});
