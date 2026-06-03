import { ApiKeyGuard } from './api-key.guard';
import { ExecutionContext } from '@nestjs/common';
import { createHash } from 'crypto';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

const mockPrisma = {
  restaurant: { findFirst: jest.fn() },
};

const makeContext = (
  opts: { authHeader?: string; restaurantId?: string } = {},
): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { authorization: opts.authHeader },
        params: { id: opts.restaurantId },
      }),
    }),
  }) as any as ExecutionContext;

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;

  beforeEach(() => {
    guard = new ApiKeyGuard(mockPrisma as any);
    jest.clearAllMocks();
  });

  it('returns false when authorization header is missing', async () => {
    expect(
      await guard.canActivate(makeContext({ restaurantId: 'rest-1' })),
    ).toBe(false);
  });

  it('returns false when authorization does not start with Bearer', async () => {
    expect(
      await guard.canActivate(
        makeContext({ authHeader: 'Basic xyz', restaurantId: 'rest-1' }),
      ),
    ).toBe(false);
  });

  it('returns false when token is empty after trimming', async () => {
    expect(
      await guard.canActivate(
        makeContext({ authHeader: 'Bearer   ', restaurantId: 'rest-1' }),
      ),
    ).toBe(false);
  });

  it('returns false when restaurantId param is missing', async () => {
    expect(
      await guard.canActivate(makeContext({ authHeader: 'Bearer valid-key' })),
    ).toBe(false);
  });

  it('returns false when no restaurant matches the key', async () => {
    mockPrisma.restaurant.findFirst.mockResolvedValue(null);
    expect(
      await guard.canActivate(
        makeContext({ authHeader: 'Bearer wrong-key', restaurantId: 'rest-1' }),
      ),
    ).toBe(false);
  });

  it('returns true when restaurant is found with the provided key', async () => {
    mockPrisma.restaurant.findFirst.mockResolvedValue({ id: 'rest-1' });
    expect(
      await guard.canActivate(
        makeContext({ authHeader: 'Bearer valid-key', restaurantId: 'rest-1' }),
      ),
    ).toBe(true);
    expect(mockPrisma.restaurant.findFirst).toHaveBeenCalledWith({
      where: { id: 'rest-1', importApiKeyHash: sha256('valid-key') },
      select: { id: true },
    });
  });
});
