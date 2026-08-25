import { AuthErrorCode } from '../common/errors/auth-error-codes';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { LocalStrategy } from './local.strategy';

describe('LocalStrategy', () => {
  let authService: { validateUser: jest.Mock };
  let strategy: LocalStrategy;

  beforeEach(() => {
    authService = { validateUser: jest.fn() };
    strategy = new LocalStrategy(authService as any);
  });

  it('returns the user on successful validation', async () => {
    authService.validateUser.mockResolvedValue({ id: 'u1', email: 'a@b.c' });

    const result = await strategy.validate('a@b.c', 'pass');

    expect(authService.validateUser).toHaveBeenCalledWith('a@b.c', 'pass');
    expect(result).toEqual({ id: 'u1', email: 'a@b.c' });
  });

  it('rethrows UnauthorizedException unchanged', async () => {
    const original = new UnauthorizedException('Disabled');
    authService.validateUser.mockRejectedValue(original);

    await expect(strategy.validate('a@b.c', 'pass')).rejects.toBe(original);
  });

  it('rethrows NotFoundException unchanged', async () => {
    const original = new NotFoundException('No user');
    authService.validateUser.mockRejectedValue(original);

    await expect(strategy.validate('a@b.c', 'pass')).rejects.toBe(original);
  });

  it('wraps unexpected errors in an UnauthorizedException carrying INVALID_CREDENTIALS', async () => {
    authService.validateUser.mockRejectedValue(new Error('db down'));

    const error = await strategy
      .validate('a@b.c', 'pass')
      .catch((err) => err as UnauthorizedException);

    expect(error).toBeInstanceOf(UnauthorizedException);
    // The frontend localises this failure off the code, and the wording must
    // match validateUser's own rejection so a db outage is indistinguishable
    // from a wrong password.
    expect(error.getResponse()).toEqual({
      code: AuthErrorCode.INVALID_CREDENTIALS,
      message: 'Invalid email or password.',
    });
  });
});
