import { AuthErrorCode } from '../common/errors/auth-error-codes';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { FeatureService } from '../subscription/feature.service';

jest.mock('bcryptjs', () => {
  const real = jest.requireActual('bcryptjs');
  return {
    ...real,
    compare: jest.fn(real.compare),
    hash: jest.fn(real.hash),
  };
});

const mockCompare = bcrypt.compare as jest.Mock;
const mockHash = bcrypt.hash as jest.Mock;

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'usr1',
  email: 'user@example.com',
  name: 'Test User',
  role: 'OWNER',
  restaurantId: null,
  password: null,
  phone: null,
  pinHash: null,
  pinAttempts: 0,
  pinLockedUntil: null,
  sessionVersion: 0,
  ...overrides,
});

describe('AuthService', () => {
  let service: AuthService;
  let mockPrisma: any;
  let mockUsersService: any;
  let mockJwt: Partial<JwtService>;
  let mockEvents: any;

  beforeEach(() => {
    const real = jest.requireActual('bcryptjs');
    mockCompare.mockImplementation(real.compare);
    mockHash.mockImplementation(real.hash);

    // Hermetic OTP provider baseline — a developer's local .env
    // (SMS_PROVIDER=smsgateway) must not flip the default Twilio Verify path.
    delete process.env.SMS_PROVIDER;
    delete process.env.SMS_GATEWAY_USERNAME;
    delete process.env.SMS_GATEWAY_PASSWORD;
    delete process.env.SMS_GATEWAY_URL;

    mockPrisma = {
      verificationToken: {
        findFirst: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      user: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(makeUser()),
        updateMany: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      userSession: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      restaurant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'rest1',
          tier: 'ENTERPRISE',
          forceTier: null,
          isActive: true,
          sharedDeviceModeEnabled: true,
        }),
      },
      deviceEnrollmentToken: {
        // Per-device lockout: findFirst returns device with attempt counters
        findFirst: jest.fn().mockResolvedValue({
          id: 'device-token-1',
          pinAttempts: 0,
          pinLockedUntil: null,
          sessionVersion: 0,
        }),
        update: jest.fn().mockResolvedValue({ pinAttempts: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn(),
      },
      staffDeviceBinding: {
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      staffPinLoginAudit: {
        create: jest.fn().mockResolvedValue({}),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'usr1' }]),
      $transaction: jest
        .fn()
        .mockImplementation((fn: (tx: any) => Promise<any>) => fn(mockPrisma)),
    };
    mockUsersService = {
      findByEmail: jest.fn(),
      findByPhone: jest.fn(),
      create: jest.fn(),
    };
    mockJwt = {
      sign: jest.fn().mockReturnValue('test-jwt-token'),
      verify: jest.fn(),
    };
    mockEvents = {
      evictUser: jest.fn().mockResolvedValue(undefined),
      evictSession: jest.fn().mockResolvedValue(undefined),
    };

    service = new AuthService(
      mockUsersService,
      mockJwt as JwtService,
      mockPrisma,
      new FeatureService(),
      // P1-13: a password change must also tear down live sockets, not just
      // invalidate the next HTTP request.
      mockEvents as any,
      // P2-11 detection is fire-and-forget on the auth path; a stub here keeps
      // these tests about authentication rather than about alerting.
      { evaluate: jest.fn().mockResolvedValue([]) } as any,
    );
  });

  // ─── validateUser ────────────────────────────────────────────────────────────

  describe('validateUser', () => {
    it('throws a generic UnauthorizedException when user not found (no enumeration #M3)', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      await expect(service.validateUser('x@x.com', 'pass')).rejects.toThrow(
        UnauthorizedException,
      );
      // Must match the wrong-password message exactly so the two cases are indistinguishable.
      await expect(service.validateUser('x@x.com', 'pass')).rejects.toThrow(
        'Invalid email or password.',
      );
    });

    it('throws UnauthorizedException when password is wrong', async () => {
      mockUsersService.findByEmail.mockResolvedValue(
        makeUser({ password: 'hashed' }),
      );
      mockCompare.mockResolvedValue(false);
      await expect(
        service.validateUser('user@example.com', 'wrong'),
      ).rejects.toThrow(UnauthorizedException);
    });

    // The frontend localises this failure off the code, not the wording. When
    // the code was missing, a wrong password fell through to the generic 401
    // copy and Bulgarian users were told "You are not signed in" while typing
    // their password.
    it('carries INVALID_CREDENTIALS on a wrong password', async () => {
      mockUsersService.findByEmail.mockResolvedValue(
        makeUser({ password: 'hashed' }),
      );
      mockCompare.mockResolvedValue(false);

      const error = await service
        .validateUser('user@example.com', 'wrong')
        .catch((err) => err as UnauthorizedException);

      expect(error.getResponse()).toMatchObject({
        code: AuthErrorCode.INVALID_CREDENTIALS,
        message: 'Invalid email or password.',
      });
    });

    it('carries the same code for an unknown email (no enumeration #M3)', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      const error = await service
        .validateUser('nobody@example.com', 'pass')
        .catch((err) => err as UnauthorizedException);

      expect(error.getResponse()).toEqual({
        code: AuthErrorCode.INVALID_CREDENTIALS,
        message: 'Invalid email or password.',
      });
    });

    it('carries ACCOUNT_DISABLED for a disabled account', async () => {
      mockUsersService.findByEmail.mockResolvedValue(
        makeUser({ password: 'hashed', isActive: false }),
      );

      const error = await service
        .validateUser('user@example.com', 'pass')
        .catch((err) => err as UnauthorizedException);

      expect(error.getResponse()).toMatchObject({
        code: AuthErrorCode.ACCOUNT_DISABLED,
      });
    });

    // The frontend localises this failure off the code, not the wording. When
    // the code was missing, a wrong password fell through to the generic 401
    // copy and Bulgarian users were told "You are not signed in" while typing
    // their password.
    it('carries INVALID_CREDENTIALS on a wrong password', async () => {
      mockUsersService.findByEmail.mockResolvedValue(
        makeUser({ password: 'hashed' }),
      );
      mockCompare.mockResolvedValue(false);

      const error = await service
        .validateUser('user@example.com', 'wrong')
        .catch((err) => err as UnauthorizedException);

      expect(error.getResponse()).toMatchObject({
        code: AuthErrorCode.INVALID_CREDENTIALS,
        message: 'Invalid email or password.',
      });
    });

    it('carries the same code for an unknown email (no enumeration #M3)', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      const error = await service
        .validateUser('nobody@example.com', 'pass')
        .catch((err) => err as UnauthorizedException);

      expect(error.getResponse()).toEqual({
        code: AuthErrorCode.INVALID_CREDENTIALS,
        message: 'Invalid email or password.',
      });
    });

    it('carries ACCOUNT_DISABLED for a disabled account', async () => {
      mockUsersService.findByEmail.mockResolvedValue(
        makeUser({ password: 'hashed', isActive: false }),
      );

      const error = await service
        .validateUser('user@example.com', 'pass')
        .catch((err) => err as UnauthorizedException);

      expect(error.getResponse()).toMatchObject({
        code: AuthErrorCode.ACCOUNT_DISABLED,
      });
    });

    // P1-2: throttling cannot defend credential stuffing on its own here. An
    // anonymous caller is keyed by address, and X-Forwarded-For is
    // caller-controlled on the direct Cloud Run origin, so an attacker
    // rotating the header has an unlimited budget. This counter is scoped to
    // the account and cannot be rotated away.
    describe('per-account lockout (P1-2)', () => {
      it('counts a failed attempt without locking before the threshold', async () => {
        mockUsersService.findByEmail.mockResolvedValue(
          makeUser({ password: 'hashed', failedLoginAttempts: 2 }),
        );
        mockCompare.mockResolvedValue(false);

        await expect(
          service.validateUser('user@example.com', 'wrong'),
        ).rejects.toThrow('Invalid email or password.');

        expect(mockPrisma.user.update).toHaveBeenCalledWith({
          where: { id: 'usr1' },
          data: { failedLoginAttempts: 3 },
        });
      });

      it('locks the account once the threshold is reached', async () => {
        mockUsersService.findByEmail.mockResolvedValue(
          makeUser({ password: 'hashed', failedLoginAttempts: 7 }),
        );
        mockCompare.mockResolvedValue(false);

        await expect(
          service.validateUser('user@example.com', 'wrong'),
        ).rejects.toThrow('Invalid email or password.');

        const data = mockPrisma.user.update.mock.calls.at(-1)![0].data;
        expect(data.failedLoginAttempts).toBe(8);
        expect(data.loginLockedUntil).toBeInstanceOf(Date);
      });

      it('lengthens the window on each further failure past the threshold', async () => {
        mockCompare.mockResolvedValue(false);

        mockUsersService.findByEmail.mockResolvedValue(
          makeUser({ password: 'hashed', failedLoginAttempts: 7 }),
        );
        await service.validateUser('user@example.com', 'wrong').catch(() => {});
        const first = mockPrisma.user.update.mock.calls.at(-1)![0].data
          .loginLockedUntil as Date;

        mockUsersService.findByEmail.mockResolvedValue(
          makeUser({ password: 'hashed', failedLoginAttempts: 9 }),
        );
        await service.validateUser('user@example.com', 'wrong').catch(() => {});
        const later = mockPrisma.user.update.mock.calls.at(-1)![0].data
          .loginLockedUntil as Date;

        expect(later.getTime()).toBeGreaterThan(first.getTime());
      });

      it('hides the lockout from someone who does not know the password', async () => {
        mockUsersService.findByEmail.mockResolvedValue(
          makeUser({
            password: 'hashed',
            failedLoginAttempts: 8,
            loginLockedUntil: new Date(Date.now() + 60_000),
          }),
        );
        mockCompare.mockResolvedValue(false);

        // Identical to a plain wrong password — an attacker gets no signal
        // that they have found a real, active account (#M3).
        await expect(
          service.validateUser('user@example.com', 'wrong'),
        ).rejects.toThrow('Invalid email or password.');
      });

      it('tells someone who does know the password that they are locked out', async () => {
        mockUsersService.findByEmail.mockResolvedValue(
          makeUser({
            password: 'hashed',
            failedLoginAttempts: 8,
            loginLockedUntil: new Date(Date.now() + 60_000),
          }),
        );
        mockCompare.mockResolvedValue(true);

        const error: any = await service
          .validateUser('user@example.com', 'correct')
          .catch((e) => e);

        expect(error).toBeInstanceOf(UnauthorizedException);
        expect(error.getResponse().code).toBe('ACCOUNT_TEMPORARILY_LOCKED');
        expect(error.getResponse().retryInSeconds).toBeGreaterThan(0);
      });

      it('clears the counter on a successful sign-in', async () => {
        mockUsersService.findByEmail.mockResolvedValue(
          makeUser({ password: 'hashed', failedLoginAttempts: 3 }),
        );
        mockCompare.mockResolvedValue(true);

        await expect(
          service.validateUser('user@example.com', 'correct'),
        ).resolves.toBeDefined();

        expect(mockPrisma.user.update).toHaveBeenCalledWith({
          where: { id: 'usr1' },
          data: { failedLoginAttempts: 0, loginLockedUntil: null },
        });
      });

      it('lets a user back in once the window has passed', async () => {
        mockUsersService.findByEmail.mockResolvedValue(
          makeUser({
            password: 'hashed',
            failedLoginAttempts: 8,
            loginLockedUntil: new Date(Date.now() - 1000),
          }),
        );
        mockCompare.mockResolvedValue(true);

        await expect(
          service.validateUser('user@example.com', 'correct'),
        ).resolves.toBeDefined();
      });

      it('does not write on a clean successful sign-in', async () => {
        mockUsersService.findByEmail.mockResolvedValue(
          makeUser({ password: 'hashed', failedLoginAttempts: 0 }),
        );
        mockCompare.mockResolvedValue(true);
        mockPrisma.user.update.mockClear();

        await service.validateUser('user@example.com', 'correct');

        // The happy path is the hot path; it must not cost a write.
        expect(mockPrisma.user.update).not.toHaveBeenCalled();
      });
    });

    it('rejects PIN-only device roles from dashboard password login', async () => {
      mockUsersService.findByEmail.mockResolvedValue(
        makeUser({ password: 'hashed', role: 'WAITER' }),
      );
      mockCompare.mockClear();

      await expect(
        service.validateUser('waiter@example.com', 'correct'),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockCompare).not.toHaveBeenCalled();
    });

    it('returns user without password when credentials are valid', async () => {
      mockUsersService.findByEmail.mockResolvedValue(
        makeUser({ password: 'hashed' }),
      );
      mockCompare.mockResolvedValue(true);
      const result = await service.validateUser('user@example.com', 'correct');
      expect(result).not.toHaveProperty('password');
      expect(result.id).toBe('usr1');
    });
  });

  // ─── login ───────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('returns JWT token and user object', async () => {
      const user = makeUser();
      const result = await service.login(user);
      expect(result.token).toBe('test-jwt-token');
      expect(result.user.id).toBe('usr1');
      expect(result.user.email).toBe('user@example.com');
      expect(mockJwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          email: user.email,
          sub: user.id,
          sessionId: expect.any(String),
          sessionVersion: 0,
        }),
        { expiresIn: 86_400 },
      );
      const persisted = mockPrisma.userSession.create.mock.calls[0][0].data;
      expect(persisted).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          userId: user.id,
          authMethod: 'PASSWORD',
          sessionVersion: 0,
        }),
      );
      expect(persisted.id).toBe(
        (mockJwt.sign as jest.Mock).mock.calls[0][0].sessionId,
      );
      expect(persisted).not.toHaveProperty('token');
    });

    // A dashboard login is a person at a machine they control, so it keeps the
    // module default. Only the shared-device case is shortened.
    it('does not shorten the session for a dashboard login', async () => {
      const user = makeUser();

      await service.login(user);

      const [, options] = (mockJwt.sign as jest.Mock).mock.calls[0];
      expect(options).toEqual({ expiresIn: 86_400 });
    });
  });

  // ─── validateGoogleUser ──────────────────────────────────────────────────────

  describe('validateGoogleUser', () => {
    it('returns existing user when found', async () => {
      const user = makeUser();
      mockUsersService.findByEmail.mockResolvedValue(user);
      const result = await service.validateGoogleUser({
        email: 'user@example.com',
        emailVerified: true,
        firstName: 'Test',
        lastName: 'User',
      });
      expect(result).toBe(user);
      expect(mockUsersService.create).not.toHaveBeenCalled();
    });

    it('creates a new user when not found', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      const newUser = makeUser({ name: 'Google User' });
      mockUsersService.create.mockResolvedValue(newUser);
      mockHash.mockResolvedValue('generated-password');

      const result = await service.validateGoogleUser({
        email: 'new@example.com',
        emailVerified: true,
        firstName: 'Google',
        lastName: 'User',
      });

      expect(mockUsersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@example.com',
          name: 'Google User',
          role: 'OWNER',
        }),
      );
      expect(result).toBe(newUser);
    });

    // Issue 40b — Google-link invalidates stored password
    it('invalidates stored password when Google account is linked to existing email account (Issue 40b)', async () => {
      const existingUser = makeUser({
        password: 'old-bcrypt-hash',
        googleId: null,
      });
      mockUsersService.findByEmail.mockResolvedValue(existingUser);
      mockPrisma.user.findUnique.mockResolvedValue(null); // no existing googleId match
      mockHash.mockResolvedValue('invalidated-hash');

      await service.validateGoogleUser({
        googleId: 'google-id-123',
        email: 'user@example.com',
        emailVerified: true,
        firstName: 'Test',
        lastName: 'User',
      });

      // Must update the user with both googleId AND a new randomized password
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: existingUser.id },
          data: expect.objectContaining({
            googleId: 'google-id-123',
            password: expect.any(String),
            passwordChangedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('does NOT update password when user already has googleId linked', async () => {
      const existingUser = makeUser({
        password: 'existing-hash',
        googleId: 'google-id-123',
      });
      mockPrisma.user.findUnique.mockResolvedValue(existingUser); // found by googleId lookup
      mockUsersService.findByEmail.mockResolvedValue(existingUser);

      await service.validateGoogleUser({
        googleId: 'google-id-123',
        email: 'user@example.com',
        firstName: 'Test',
        lastName: 'User',
      });

      // Should return the user directly without any update (found by googleId)
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    // M-AUTH-2 — unverified Google email must not link/create by email
    it('rejects email-based linking when emailVerified is false', async () => {
      const existingUser = makeUser({ password: 'hash', googleId: null });
      mockPrisma.user.findUnique.mockResolvedValue(null); // no googleId match
      mockUsersService.findByEmail.mockResolvedValue(existingUser);

      await expect(
        service.validateGoogleUser({
          googleId: 'attacker-google-id',
          email: 'victim@example.com',
          emailVerified: false,
          firstName: 'Mal',
          lastName: 'Actor',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockUsersService.findByEmail).not.toHaveBeenCalled();
      expect(mockUsersService.create).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects when emailVerified is missing (absent claim)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.validateGoogleUser({
          googleId: 'g-1',
          email: 'someone@example.com',
          firstName: 'No',
          lastName: 'Flag',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockUsersService.create).not.toHaveBeenCalled();
    });

    it('still logs in a googleId-matched account without a verification flag', async () => {
      const existingUser = makeUser({ googleId: 'g-known' });
      mockPrisma.user.findUnique.mockResolvedValue(existingUser); // step-1 match

      const result = await service.validateGoogleUser({
        googleId: 'g-known',
        email: 'known@example.com',
        // no emailVerified — the stable-ID path must bypass the gate
      });

      expect(result).toBe(existingUser);
    });
  });

  // ─── register ────────────────────────────────────────────────────────────────

  describe('register', () => {
    it('throws ConflictException when email already exists', async () => {
      mockUsersService.findByEmail.mockResolvedValue(makeUser());
      await expect(
        service.register({ email: 'user@example.com', password: 'pass' }),
      ).rejects.toThrow(ConflictException);
    });

    it('issues a verification code without creating a user or JWT', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockHash.mockResolvedValue('hashed-code');

      const result = await service.register({
        email: 'NEW@example.com ',
        password: 'pass12345',
      });

      expect(result).toMatchObject({
        success: true,
        requiresVerification: true,
        email: 'new@example.com',
      });
      expect(mockPrisma.verificationToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'new@example.com',
            code: 'hashed-code',
          }),
        }),
      );
      expect(mockUsersService.create).not.toHaveBeenCalled();
      expect(mockJwt.sign).not.toHaveBeenCalled();
    });

    it('creates the owner and returns JWT only after registration code verification', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockPrisma.verificationToken.findFirst.mockResolvedValue({
        id: 'tok-1',
        email: 'new@example.com',
        code: 'hashed-code',
        attempts: 0,
        lockedUntil: null,
      });
      mockCompare.mockResolvedValue(true);
      mockHash.mockResolvedValue('hashed-password');
      mockUsersService.create.mockResolvedValue(
        makeUser({ email: 'new@example.com', password: 'hashed-password' }),
      );

      const result = await service.verifyRegistration({
        email: 'NEW@example.com ',
        password: 'pass12345',
        code: '123456',
      });

      expect(mockPrisma.verificationToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tok-1' },
          data: expect.objectContaining({
            usedAt: expect.any(Date),
            attempts: 0,
          }),
        }),
      );
      expect(mockUsersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@example.com',
          password: 'hashed-password',
          role: 'OWNER',
        }),
      );
      expect(result.token).toBe('test-jwt-token');
      expect(result.user).not.toHaveProperty('password');
    });
  });

  // ─── pinLogin ────────────────────────────────────────────────────────────────

  describe('pinLogin', () => {
    const deviceToken = 'device-token-12345678901234567890123456789012';

    it('throws UnauthorizedException when device is not enrolled', async () => {
      mockPrisma.deviceEnrollmentToken.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.pinLogin('rest1', '1234', deviceToken),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when no staff candidates found', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      await expect(
        service.pinLogin('rest1', '1234', deviceToken),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('only considers device roles (WAITER/KITCHEN) — dashboard roles excluded', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      await expect(
        service.pinLogin('rest1', '1234', deviceToken),
      ).rejects.toThrow(UnauthorizedException);
      const where = mockPrisma.user.findMany.mock.calls[0][0].where;
      expect(where.role.in).toEqual(['WAITER', 'KITCHEN']);
      expect(where.role.in).not.toContain('OWNER');
      expect(where.role.in).not.toContain('MANAGER');
      expect(where.role.in).not.toContain('STAFF');
      expect(where.isActive).toBe(true);
      expect(mockPrisma.user.findMany.mock.calls[0][0].orderBy).toEqual({
        createdAt: 'asc',
      });
    });

    it('throws HttpException(429) when device is locked (M2.1 per-device lockout)', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000);
      // Lockout is now on the device token, not on the user
      mockPrisma.deviceEnrollmentToken.findFirst.mockResolvedValueOnce({
        id: 'device-token-1',
        pinAttempts: 5,
        pinLockedUntil: futureDate,
        sessionVersion: 0,
      });
      await expect(
        service.pinLogin('rest1', '1234', deviceToken),
      ).rejects.toThrow(HttpException);
    });

    // Device trust is checked at PIN login only -- never mid-session -- so a
    // lapse can never interrupt someone already working a shift.
    it('refuses a PIN login once device trust has expired', async () => {
      const staff = makeUser({ role: 'WAITER', pinHash: 'hash' });
      mockPrisma.deviceEnrollmentToken.findFirst.mockResolvedValue({
        id: 'device-token-1',
        pinAttempts: 0,
        pinLockedUntil: null,
        sessionVersion: 0,
        deviceTrustExpiresAt: new Date(Date.now() - 1000),
      });
      mockPrisma.user.findMany.mockResolvedValue([staff]);
      // The PIN itself is correct. Expired device trust must be the only
      // reason this fails, or the test passes for the wrong reason.
      mockCompare.mockResolvedValue(true);

      await expect(
        service.pinLogin('rest1', '1234', 'device-token'),
      ).rejects.toThrow(/no longer trusted|re-enroll/i);
      expect(mockJwt.sign).not.toHaveBeenCalled();
    });

    // NULL is a deployment-compatibility state, not policy. The migration
    // writes a real expiry for every enrolled device and enrolment sets one
    // from then on, so a row can only be NULL if it was created in the gap
    // between deploy and backfill. Locking a device out over a race with our
    // own rollout would be the wrong failure.
    it('treats an unrecorded trust expiry as still trusted', async () => {
      const staff = makeUser({ role: 'WAITER', pinHash: 'hash' });
      mockPrisma.deviceEnrollmentToken.findFirst.mockResolvedValue({
        id: 'device-token-1',
        pinAttempts: 0,
        pinLockedUntil: null,
        sessionVersion: 0,
        deviceTrustExpiresAt: null,
      });
      mockPrisma.user.findMany.mockResolvedValue([staff]);
      mockCompare.mockResolvedValue(true);

      await expect(
        service.pinLogin('rest1', '1234', 'device-token'),
      ).resolves.toBeDefined();
    });

    // Once pinLockedUntil was set it was never cleared, and the relock guard
    // read `!lockedUntil`. So after the first lockout expired the device could
    // never lock again: pinAttempts climbed past MAX_ATTEMPTS while every wrong
    // PIN was merely rejected, leaving brute force running at the route
    // throttle indefinitely. pinAttempts resets only on a SUCCESSFUL login,
    // which an attacker never reaches.
    const expiredLockDevice = () => ({
      id: 'device-token-1',
      // Past, but non-null -- the exact state that disabled relocking.
      pinLockedUntil: new Date(Date.now() - 60_000),
      pinAttempts: 5,
      sessionVersion: 0,
      deviceTrustExpiresAt: null,
    });

    it('expired lock plus a wrong PIN is attempt one, four remaining', async () => {
      mockPrisma.deviceEnrollmentToken.findFirst.mockResolvedValue(
        expiredLockDevice(),
      );
      mockPrisma.user.findMany.mockResolvedValue([
        makeUser({ role: 'WAITER', pinHash: 'hash' }),
      ]);
      mockCompare.mockResolvedValue(false);
      mockPrisma.deviceEnrollmentToken.update.mockResolvedValue({
        pinAttempts: 1,
      });

      await expect(
        service.pinLogin('rest1', '9999', 'device-token'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ attemptsRemaining: 4 }),
      });

      const reset =
        mockPrisma.deviceEnrollmentToken.updateMany.mock.calls[0][0];
      expect(reset.data).toEqual({ pinAttempts: 0, pinLockedUntil: null });
      expect(mockPrisma.staffPinLoginAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'INVALID_PIN' }),
        }),
      );
    });

    it('relocks on the fifth failure of the fresh window', async () => {
      mockPrisma.deviceEnrollmentToken.findFirst.mockResolvedValue({
        ...expiredLockDevice(),
        pinLockedUntil: null,
        pinAttempts: 4,
      });
      mockPrisma.user.findMany.mockResolvedValue([
        makeUser({ role: 'WAITER', pinHash: 'hash' }),
      ]);
      mockCompare.mockResolvedValue(false);
      mockPrisma.deviceEnrollmentToken.update.mockResolvedValue({
        pinAttempts: 5,
      });

      await expect(
        service.pinLogin('rest1', '9999', 'device-token'),
      ).rejects.toThrow();

      const relock = mockPrisma.deviceEnrollmentToken.update.mock.calls.find(
        (c: any) => c[0].data.pinLockedUntil instanceof Date,
      );
      expect(relock).toBeDefined();
      expect(relock[0].data.pinLockedUntil.getTime()).toBeGreaterThan(
        Date.now(),
      );
      expect(mockPrisma.staffPinLoginAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'LOCKED' }),
        }),
      );
    });

    // An active lock must short-circuit before any work: no hash comparison to
    // time, and no counter mutation an attacker could drive.
    it('does no bcrypt comparison or counter mutation while locked', async () => {
      // This spec's mocks are not cleared between cases, and the assertion here
      // is about what this call does -- not what the file has done so far.
      mockCompare.mockClear();
      mockPrisma.deviceEnrollmentToken.findFirst.mockResolvedValue({
        ...expiredLockDevice(),
        pinLockedUntil: new Date(Date.now() + 60_000),
      });

      await expect(
        service.pinLogin('rest1', '9999', 'device-token'),
      ).rejects.toThrow();

      expect(mockCompare).not.toHaveBeenCalled();
      expect(mockPrisma.deviceEnrollmentToken.update).not.toHaveBeenCalled();
      expect(
        mockPrisma.deviceEnrollmentToken.updateMany,
      ).not.toHaveBeenCalled();
    });

    it('accepts a correct PIN once the lock has expired, with clean counters', async () => {
      mockPrisma.deviceEnrollmentToken.findFirst.mockResolvedValue(
        expiredLockDevice(),
      );
      mockPrisma.user.findMany.mockResolvedValue([
        makeUser({ role: 'WAITER', pinHash: 'hash' }),
      ]);
      mockCompare.mockResolvedValue(true);

      await expect(
        service.pinLogin('rest1', '1234', 'device-token'),
      ).resolves.toBeDefined();

      expect(mockPrisma.deviceEnrollmentToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { pinAttempts: 0, pinLockedUntil: null },
        }),
      );
    });

    // The guarded update returning count=0 means another request changed the
    // row. Re-read it and honour a renewed lock before bcrypt or counters run.
    it('cannot clear a lock another request has since renewed', async () => {
      const observed = expiredLockDevice();
      const renewed = new Date(Date.now() + 60_000);
      mockPrisma.deviceEnrollmentToken.findFirst.mockResolvedValue(observed);
      mockPrisma.deviceEnrollmentToken.updateMany.mockResolvedValue({
        count: 0,
      });
      mockPrisma.deviceEnrollmentToken.findUnique.mockResolvedValue({
        pinLockedUntil: renewed,
      });
      mockCompare.mockClear();

      await expect(
        service.pinLogin('rest1', '9999', 'device-token'),
      ).rejects.toMatchObject({ status: 429 });

      const reset =
        mockPrisma.deviceEnrollmentToken.updateMany.mock.calls[0][0];
      expect(reset.where).toEqual({
        id: 'device-token-1',
        pinLockedUntil: observed.pinLockedUntil,
      });
      expect(mockCompare).not.toHaveBeenCalled();
      expect(mockPrisma.deviceEnrollmentToken.update).not.toHaveBeenCalled();
    });

    it('returns JWT and resets device attempt counter on valid PIN', async () => {
      mockCompare.mockResolvedValue(true);
      const staff = makeUser({
        pinHash: 'hashed-pin',
        role: 'WAITER',
        restaurantId: 'rest1',
      });
      mockPrisma.user.findMany.mockResolvedValue([staff]);

      const result = await service.pinLogin('rest1', '1234', deviceToken);

      expect(result.token).toBe('test-jwt-token');
      // A device-bound PIN session lives on a tablet that stays in the
      // restaurant overnight, unattended and shared. A full day of validity
      // means it is still a working credential all night. 12h covers a
      // trading day and expires at close, rather than mid-service.
      expect((mockJwt.sign as jest.Mock).mock.calls[0][1]).toEqual({
        expiresIn: 43_200,
      });
      expect(mockJwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          email: staff.email,
          sub: staff.id,
          deviceTokenId: 'device-token-1',
          deviceSessionVersion: 0,
        }),
        // Second argument is the shortened device-session TTL, asserted above.
        expect.objectContaining({ expiresIn: 43_200 }),
      );
      // Attempts reset on the device token, not via user.updateMany
      expect(mockPrisma.deviceEnrollmentToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { pinAttempts: 0, pinLockedUntil: null },
        }),
      );
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
      expect(mockPrisma.$queryRaw.mock.calls[0][0].join('')).toContain(
        'FOR UPDATE',
      );
      expect(mockPrisma.$queryRaw.mock.calls[0][1]).toBe(staff.id);
      expect(mockPrisma.$transaction.mock.invocationCallOrder[0]).toBeLessThan(
        mockPrisma.staffDeviceBinding.findUnique.mock.invocationCallOrder[0],
      );
      expect(mockPrisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        mockPrisma.staffDeviceBinding.count.mock.invocationCallOrder[0],
      );
      expect(
        mockPrisma.staffDeviceBinding.count.mock.invocationCallOrder[0],
      ).toBeLessThan(
        mockPrisma.staffDeviceBinding.create.mock.invocationCallOrder[0],
      );
      expect(mockPrisma.staffDeviceBinding.create).toHaveBeenCalledWith({
        data: {
          userId: staff.id,
          deviceTokenId: 'device-token-1',
          restaurantId: 'rest1',
          lastSeenAt: expect.any(Date),
        },
      });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: staff.id },
        data: { lastLoginDeviceTokenId: 'device-token-1' },
      });
      expect(mockPrisma.staffPinLoginAudit.create).toHaveBeenCalledWith({
        data: {
          userId: staff.id,
          deviceTokenId: 'device-token-1',
          restaurantId: 'rest1',
          status: 'SUCCESS',
        },
      });
      expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a new device when the staff member is already bound to the device limit', async () => {
      mockCompare.mockResolvedValue(true);
      const staff = makeUser({
        id: 'staff-1',
        pinHash: 'hashed-pin',
        role: 'WAITER',
        restaurantId: 'rest1',
      });
      mockPrisma.user.findMany.mockResolvedValue([staff]);
      mockPrisma.staffDeviceBinding.count.mockResolvedValue(3);

      await expect(
        service.pinLogin('rest1', '1234', deviceToken),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
      expect(mockPrisma.$transaction.mock.invocationCallOrder[0]).toBeLessThan(
        mockPrisma.staffDeviceBinding.findUnique.mock.invocationCallOrder[0],
      );
      expect(mockPrisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        mockPrisma.staffDeviceBinding.count.mock.invocationCallOrder[0],
      );
      expect(mockPrisma.staffPinLoginAudit.create).toHaveBeenCalledWith({
        data: {
          userId: 'staff-1',
          deviceTokenId: 'device-token-1',
          restaurantId: 'rest1',
          status: 'DENIED_DEVICE_LIMIT',
        },
      });
      expect(mockPrisma.deviceEnrollmentToken.update).not.toHaveBeenCalled();
      expect(mockPrisma.staffDeviceBinding.create).not.toHaveBeenCalled();
      expect(mockJwt.sign).not.toHaveBeenCalled();
    });

    it('returns the generic "Invalid PIN." message for a disabled staff account (#D)', async () => {
      mockCompare.mockResolvedValue(true);
      mockPrisma.user.findMany.mockResolvedValue([
        makeUser({
          pinHash: 'hashed-pin',
          role: 'WAITER',
          restaurantId: 'rest1',
          isActive: false,
          disabledAt: new Date(),
        }),
      ]);

      // A distinct "disabled" error after a correct PIN match would let an
      // attacker confirm a valid PIN — the message must stay generic.
      await expect(
        service.pinLogin('rest1', '1234', deviceToken),
      ).rejects.toThrow('Invalid PIN.');
    });

    it('increments device attempt counter and throws UnauthorizedException on wrong PIN', async () => {
      mockCompare.mockResolvedValue(false);
      mockPrisma.user.findMany.mockResolvedValue([
        makeUser({ pinHash: 'hash' }),
      ]);

      await expect(
        service.pinLogin('rest1', 'wrong', deviceToken),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.deviceEnrollmentToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ pinAttempts: { increment: 1 } }),
        }),
      );
      expect(mockPrisma.staffPinLoginAudit.create).toHaveBeenCalledWith({
        data: {
          deviceTokenId: 'device-token-1',
          restaurantId: 'rest1',
          status: 'INVALID_PIN',
        },
      });
      expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('sets pinLockedUntil on device token and throws HttpException(429) after MAX_ATTEMPTS', async () => {
      mockCompare.mockResolvedValue(false);
      mockPrisma.deviceEnrollmentToken.findFirst.mockResolvedValueOnce({
        id: 'device-token-1',
        pinAttempts: 4,
        pinLockedUntil: null,
        sessionVersion: 0,
      });
      mockPrisma.user.findMany.mockResolvedValue([
        makeUser({ pinHash: 'hash' }),
      ]);
      mockPrisma.deviceEnrollmentToken.update.mockResolvedValueOnce({
        pinAttempts: 5,
      });

      await expect(
        service.pinLogin('rest1', 'wrong', deviceToken),
      ).rejects.toThrow(HttpException);
      expect(mockPrisma.deviceEnrollmentToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ pinLockedUntil: expect.any(Date) }),
        }),
      );
    });

    it('throws ForbiddenException when restaurant lacks POS feature (H2.2)', async () => {
      // ENTERPRISE has POS; FREE does not — use FREE tier to trigger the guard.
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest1',
        tier: 'FREE',
        forceTier: null,
        isActive: true,
      });
      const { ForbiddenException } = await import('@nestjs/common');
      await expect(
        service.pinLogin('rest1', '1234', deviceToken),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.pinLogin('rest1', '1234', deviceToken),
      ).rejects.toThrow('POS is not available on this plan.');
    });

    it('throws ForbiddenException when restaurant is suspended (M2.2)', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest1',
        tier: 'ENTERPRISE',
        forceTier: null,
        isActive: false,
        sharedDeviceModeEnabled: true,
      });
      const { ForbiddenException } = await import('@nestjs/common');
      await expect(
        service.pinLogin('rest1', '1234', deviceToken),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when Shared Device Mode is off', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest1',
        tier: 'ENTERPRISE',
        forceTier: null,
        isActive: true,
        sharedDeviceModeEnabled: false,
      });

      await expect(
        service.pinLogin('rest1', '1234', deviceToken),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.deviceEnrollmentToken.findFirst).not.toHaveBeenCalled();
    });
  });

  // ─── updateProfile ───────────────────────────────────────────────────────────

  describe('updateProfile', () => {
    it('trims name and updates user', async () => {
      const updated = makeUser({ name: 'Alice' });
      mockPrisma.user.update.mockResolvedValue(updated);

      const result = await service.updateProfile('usr1', '  Alice  ');

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'usr1' },
        data: { name: 'Alice' },
      });
      expect(result.id).toBe('usr1');
      expect(result.name).toBe('Alice');
    });
  });

  // ─── sendOtp ─────────────────────────────────────────────────────────────────

  describe('changePassword', () => {
    it('updates password when current password matches', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        makeUser({ password: 'old-hash' }),
      );
      mockCompare.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      mockHash.mockResolvedValue('new-hash');

      const result = await service.changePassword(
        'usr1',
        'old-password',
        'new-password',
      );

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'usr1' },
        data: {
          password: 'new-hash',
          passwordChangedAt: expect.any(Date),
          sessionVersion: { increment: 1 },
        },
      });
      expect(mockPrisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { userId: 'usr1', revokedAt: null },
        data: {
          revokedAt: expect.any(Date),
          revokedReason: 'password_changed',
        },
      });
      expect(result).toEqual({ success: true });
    });

    // P1-13: passwordChangedAt only takes effect on the *next* HTTP request.
    // A socket authenticated before the change keeps its connection and goes
    // on receiving live order and payment events, so changing a password on a
    // compromised account left the attacker's realtime feed intact.
    it('tears down live sockets, not just the next HTTP request', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        makeUser({ password: 'old-hash' }),
      );
      mockCompare.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      mockHash.mockResolvedValue('new-hash');

      await service.changePassword('usr1', 'old-password', 'new-password');

      expect(mockEvents.evictUser).toHaveBeenCalledWith(
        'usr1',
        'password_changed',
      );
    });

    it('does not evict when the password change was rejected', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        makeUser({ password: 'old-hash' }),
      );
      mockCompare.mockResolvedValue(false);

      await service
        .changePassword('usr1', 'wrong-password', 'new-password')
        .catch(() => undefined);

      expect(mockEvents.evictUser).not.toHaveBeenCalled();
    });

    it('rejects when current password is wrong', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        makeUser({ password: 'old-hash' }),
      );
      mockCompare.mockResolvedValueOnce(false);

      await expect(
        service.changePassword('usr1', 'wrong-password', 'new-password'),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('sendOtp', () => {
    it('throws HttpException(400) when neither email nor phone provided', async () => {
      await expect(service.sendOtp(undefined, undefined)).rejects.toThrow(
        HttpException,
      );
    });

    it('throws HttpException(501) when phone provided but Twilio not configured', async () => {
      const saved = {
        sid: process.env.TWILIO_ACCOUNT_SID,
        tok: process.env.TWILIO_AUTH_TOKEN,
        svc: process.env.TWILIO_VERIFY_SERVICE_SID,
      };
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_VERIFY_SERVICE_SID;

      await expect(service.sendOtp(undefined, '+1234567890')).rejects.toThrow(
        HttpException,
      );

      if (saved.sid) process.env.TWILIO_ACCOUNT_SID = saved.sid;
      if (saved.tok) process.env.TWILIO_AUTH_TOKEN = saved.tok;
      if (saved.svc) process.env.TWILIO_VERIFY_SERVICE_SID = saved.svc;
    });

    it('creates a VerificationToken and returns success:true', async () => {
      mockPrisma.verificationToken.findFirst.mockResolvedValue(null);
      mockHash.mockResolvedValue('hashed-code');
      const result = await service.sendOtp('user@example.com');
      expect(mockPrisma.verificationToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'user@example.com' }),
        }),
      );
      expect(result.success).toBe(true);
    });

    it('includes devCode in response when NODE_ENV is not production', async () => {
      delete process.env.RESEND_API_KEY;
      mockPrisma.verificationToken.findFirst.mockResolvedValue(null);
      mockHash.mockResolvedValue('hashed-code');
      const result = await service.sendOtp('user@example.com');
      expect(result.devCode).toBeDefined();
      expect(result.devCode).toMatch(/^\d{6}$/);
    });

    it('throws HttpException(429) when token created within last 60 seconds', async () => {
      mockPrisma.verificationToken.findFirst.mockResolvedValue({
        id: 'tok1',
        createdAt: new Date(),
      });
      await expect(service.sendOtp('user@example.com')).rejects.toThrow(
        HttpException,
      );
    });

    it('calls Resend API and omits devCode in production mode', async () => {
      const prevEnv = process.env.NODE_ENV;
      const prevKey = process.env.RESEND_API_KEY;
      process.env.NODE_ENV = 'production';
      process.env.RESEND_API_KEY = 'test-resend-key';
      global.fetch = jest.fn().mockResolvedValue({ ok: true });
      mockPrisma.verificationToken.findFirst.mockResolvedValue(null);
      mockHash.mockResolvedValue('hashed-code');

      const result = await service.sendOtp('user@example.com');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result.devCode).toBeUndefined();
      expect(result.success).toBe(true);

      process.env.NODE_ENV = prevEnv;
      if (prevKey !== undefined) process.env.RESEND_API_KEY = prevKey;
      else delete process.env.RESEND_API_KEY;
    });

    it('maps a Resend 4xx (bad recipient) to 422, not 502 (#9)', async () => {
      const prevEnv = process.env.NODE_ENV;
      const prevKey = process.env.RESEND_API_KEY;
      process.env.NODE_ENV = 'production';
      process.env.RESEND_API_KEY = 'test-resend-key';
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 422,
        text: async () => 'Invalid `to` field',
      });
      mockPrisma.verificationToken.findFirst.mockResolvedValue(null);
      mockHash.mockResolvedValue('hashed-code');

      let status: number | undefined;
      try {
        await service.sendOtp('bad-recipient@example.com');
      } catch (e) {
        status = (e as HttpException).getStatus();
      }
      expect(status).toBe(422);
      // the just-created token row is rolled back on send failure
      expect(mockPrisma.verificationToken.deleteMany).toHaveBeenCalled();

      process.env.NODE_ENV = prevEnv;
      if (prevKey !== undefined) process.env.RESEND_API_KEY = prevKey;
      else delete process.env.RESEND_API_KEY;
    });

    it('maps a Resend 5xx outage to 502 (#9)', async () => {
      const prevEnv = process.env.NODE_ENV;
      const prevKey = process.env.RESEND_API_KEY;
      process.env.NODE_ENV = 'production';
      process.env.RESEND_API_KEY = 'test-resend-key';
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => '',
      });
      mockPrisma.verificationToken.findFirst.mockResolvedValue(null);
      mockHash.mockResolvedValue('hashed-code');

      let status: number | undefined;
      try {
        await service.sendOtp('user@example.com');
      } catch (e) {
        status = (e as HttpException).getStatus();
      }
      expect(status).toBe(502);

      process.env.NODE_ENV = prevEnv;
      if (prevKey !== undefined) process.env.RESEND_API_KEY = prevKey;
      else delete process.env.RESEND_API_KEY;
    });

    it('throws HttpException(503) in production when RESEND_API_KEY is missing', async () => {
      const prevEnv = process.env.NODE_ENV;
      const prevKey = process.env.RESEND_API_KEY;
      process.env.NODE_ENV = 'production';
      delete process.env.RESEND_API_KEY;
      mockPrisma.verificationToken.findFirst.mockResolvedValue(null);
      mockHash.mockResolvedValue('hashed-code');

      await expect(service.sendOtp('user@example.com')).rejects.toThrow(
        HttpException,
      );

      process.env.NODE_ENV = prevEnv;
      if (prevKey !== undefined) process.env.RESEND_API_KEY = prevKey;
    });

    // Issue 42 — per-phone OTP cooldown
    it('throws HttpException(429) when phone OTP requested within 60s of last request (Issue 42)', async () => {
      jest
        .spyOn(
          service as unknown as { twilioConfigured: boolean },
          'twilioConfigured',
          'get',
        )
        .mockReturnValue(true);
      // Simulate a recent token stored against the phone number
      mockPrisma.verificationToken.findFirst.mockResolvedValue({
        id: 'phone-tok1',
        email: '+15550001234',
        createdAt: new Date(),
      });

      await expect(service.sendOtp(undefined, '+15550001234')).rejects.toThrow(
        HttpException,
      );
      // Should NOT have called Twilio
      expect(mockPrisma.verificationToken.create).not.toHaveBeenCalled();
    });

    it('creates a sentinel VerificationToken for phone cooldown and calls Twilio when no recent token (Issue 42)', async () => {
      jest
        .spyOn(
          service as unknown as { twilioConfigured: boolean },
          'twilioConfigured',
          'get',
        )
        .mockReturnValue(true);
      service['sendTwilioOtp'] = jest.fn().mockResolvedValue(undefined);
      mockPrisma.verificationToken.findFirst.mockResolvedValue(null); // no recent token

      const result = await service.sendOtp(undefined, '+15550005678');

      expect(mockPrisma.verificationToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: '+15550005678' }),
        }),
      );
      expect(result.success).toBe(true);
    });

    it('throws ForbiddenException when customer auth is requested for a suspended restaurant', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest1',
        tier: 'PROFESSIONAL',
        isActive: false,
      });
      await expect(
        service.sendOtp('user@example.com', undefined, 'rest1'),
      ).rejects.toThrow('This restaurant has been suspended');
    });

    it('throws ForbiddenException when customer auth is requested for a tier lacking customers:auth feature', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest1',
        tier: 'FREE',
        isActive: true,
      });
      await expect(
        service.sendOtp('user@example.com', undefined, 'rest1'),
      ).rejects.toThrow(
        'Customer authentication is not available on this plan',
      );
    });

    it('allows sendOtp when restaurant has the customer auth feature and is active', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest1',
        tier: 'PROFESSIONAL',
        isActive: true,
      });
      mockPrisma.verificationToken.findFirst.mockResolvedValue(null);
      mockHash.mockResolvedValue('hashed-code');
      const result = await service.sendOtp(
        'user@example.com',
        undefined,
        'rest1',
      );
      expect(result.success).toBe(true);
    });
  });

  // ─── phone OTP via SIM SMS gateway (SMS_PROVIDER=smsgateway) ─────────────────

  describe('phone OTP via SIM SMS gateway', () => {
    const savedEnv = {
      nodeEnv: process.env.NODE_ENV,
      provider: process.env.SMS_PROVIDER,
      user: process.env.SMS_GATEWAY_USERNAME,
      pass: process.env.SMS_GATEWAY_PASSWORD,
      forceSend: process.env.SMS_FORCE_SEND,
    };

    beforeEach(() => {
      process.env.NODE_ENV = 'test';
      process.env.SMS_PROVIDER = 'smsgateway';
      process.env.SMS_GATEWAY_USERNAME = 'device-user';
      process.env.SMS_GATEWAY_PASSWORD = 'device-pass';
      process.env.SMS_FORCE_SEND = 'true';
    });

    afterEach(() => {
      if (savedEnv.nodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = savedEnv.nodeEnv;
      if (savedEnv.provider === undefined) delete process.env.SMS_PROVIDER;
      else process.env.SMS_PROVIDER = savedEnv.provider;
      if (savedEnv.user === undefined) delete process.env.SMS_GATEWAY_USERNAME;
      else process.env.SMS_GATEWAY_USERNAME = savedEnv.user;
      if (savedEnv.pass === undefined) delete process.env.SMS_GATEWAY_PASSWORD;
      else process.env.SMS_GATEWAY_PASSWORD = savedEnv.pass;
      if (savedEnv.forceSend === undefined) delete process.env.SMS_FORCE_SEND;
      else process.env.SMS_FORCE_SEND = savedEnv.forceSend;
    });

    it('sends a locally-generated code through the gateway and stores its hash', async () => {
      mockPrisma.verificationToken.findFirst.mockResolvedValue(null); // no cooldown
      mockHash.mockResolvedValue('hashed-code');
      const fetchMock = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue({ ok: true, status: 202 } as Response);
      // Earlier email tests leave an unrestored fetch spy; jest.spyOn returns
      // that same mock with its retained call count — clear before asserting.
      fetchMock.mockClear();

      const result = await service.sendOtp(undefined, '+359000000000');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://api.sms-gate.app/3rdparty/v1/message',
      );
      expect(mockPrisma.verificationToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: '+359000000000',
            code: 'hashed-code',
          }),
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({ success: true, channel: 'sms' }),
      );
    });

    it('does not contact the live gateway in dev without SMS_FORCE_SEND', async () => {
      delete process.env.SMS_FORCE_SEND;
      mockPrisma.verificationToken.findFirst.mockResolvedValue(null);
      mockHash.mockResolvedValue('hashed-code');
      const fetchMock = jest.spyOn(global, 'fetch');
      fetchMock.mockClear();

      const result = await service.sendOtp(undefined, '+359000000000');

      expect(fetchMock).not.toHaveBeenCalled();
      expect(mockPrisma.verificationToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: '+359000000000',
            code: 'hashed-code',
          }),
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          channel: 'sms',
          devCode: expect.any(String),
        }),
      );
    });

    it('does not persist a code and surfaces a client error when the gateway rejects the number', async () => {
      mockPrisma.verificationToken.findFirst.mockResolvedValue(null);
      mockHash.mockResolvedValue('hashed-code');
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('bad number'),
      } as Response);

      await expect(service.sendOtp(undefined, '+359000000000')).rejects.toThrow(
        HttpException,
      );
      expect(mockPrisma.verificationToken.create).not.toHaveBeenCalled();
    });

    it('verifies a gateway-issued code against the DB (no Twilio Verify call)', async () => {
      const verifyTwilio = (service['verifyTwilioOtp'] = jest.fn());
      mockPrisma.verificationToken.findFirst.mockResolvedValue({
        id: 'tok-1',
        email: '+359000000000',
        code: 'stored-hash',
        usedAt: null,
        attempts: 0,
        expiresAt: new Date(Date.now() + 60_000),
      });
      mockCompare.mockResolvedValueOnce(true);
      mockUsersService.findByPhone.mockResolvedValue(
        makeUser({ role: 'CUSTOMER', phone: '+359000000000' }),
      );

      const result = await service.verifyOtp(
        undefined,
        '123456',
        '+359000000000',
      );

      expect(verifyTwilio).not.toHaveBeenCalled();
      expect(mockPrisma.verificationToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tok-1' },
          data: expect.objectContaining({ usedAt: expect.any(Date) }),
        }),
      );
      expect(result.token).toBe('test-jwt-token');
    });
  });

  // ─── verifyOtp ───────────────────────────────────────────────────────────────

  describe('verifyOtp', () => {
    it('throws HttpException(400) when code is not provided', async () => {
      await expect(
        service.verifyOtp('user@example.com', undefined),
      ).rejects.toThrow(HttpException);
    });

    it('throws HttpException(400) when email is missing in email flow', async () => {
      await expect(service.verifyOtp(undefined, '123456')).rejects.toThrow(
        HttpException,
      );
    });

    it('throws UnauthorizedException when no valid token record exists', async () => {
      mockPrisma.verificationToken.findFirst.mockResolvedValue(null);
      await expect(
        service.verifyOtp('user@example.com', '123456'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws HttpException(429) when token is locked', async () => {
      mockPrisma.verificationToken.findFirst.mockResolvedValue({
        id: 'tok1',
        code: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
        lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
      });
      await expect(
        service.verifyOtp('user@example.com', '123456'),
      ).rejects.toThrow(HttpException);
    });

    it('increments attempts and throws UnauthorizedException on wrong code', async () => {
      mockCompare.mockResolvedValue(false);
      mockPrisma.verificationToken.findFirst.mockResolvedValue({
        id: 'tok1',
        code: 'hashed-code',
        expiresAt: new Date(Date.now() + 60_000),
        attempts: 0,
      });

      await expect(
        service.verifyOtp('user@example.com', '000000'),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.verificationToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ attempts: 1 }),
        }),
      );
    });

    it('returns JWT + isNew:true for a new user with valid code', async () => {
      const plainCode = '654321';
      const hashedCode = await jest
        .requireActual<typeof bcrypt>('bcryptjs')
        .hash(plainCode, 10);
      mockCompare.mockImplementation(jest.requireActual('bcryptjs').compare);

      mockPrisma.verificationToken.findFirst.mockResolvedValue({
        id: 'tok1',
        code: hashedCode,
        expiresAt: new Date(Date.now() + 60_000),
      });
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue(makeUser());
      mockHash.mockResolvedValue('generated-password');

      const result = await service.verifyOtp('user@example.com', plainCode);

      expect(result.isNew).toBe(true);
      expect(result.token).toBe('test-jwt-token');
    });

    it('returns isNew:false for an existing user', async () => {
      const plainCode = '111222';
      const hashedCode = await jest
        .requireActual<typeof bcrypt>('bcryptjs')
        .hash(plainCode, 10);
      mockCompare.mockImplementation(jest.requireActual('bcryptjs').compare);

      mockPrisma.verificationToken.findFirst.mockResolvedValue({
        id: 'tok2',
        code: hashedCode,
        expiresAt: new Date(Date.now() + 60_000),
      });
      mockUsersService.findByEmail.mockResolvedValue(
        makeUser({ phone: null, name: 'Existing' }),
      );

      const result = await service.verifyOtp('existing@example.com', plainCode);

      expect(result.isNew).toBe(false);
      expect(mockUsersService.create).not.toHaveBeenCalled();
    });

    it('rejects an existing disabled email user', async () => {
      const plainCode = '111222';
      const hashedCode = await jest
        .requireActual<typeof bcrypt>('bcryptjs')
        .hash(plainCode, 10);
      mockCompare.mockImplementation(jest.requireActual('bcryptjs').compare);

      mockPrisma.verificationToken.findFirst.mockResolvedValue({
        id: 'tok-disabled',
        code: hashedCode,
        expiresAt: new Date(Date.now() + 60_000),
      });
      mockUsersService.findByEmail.mockResolvedValue(
        makeUser({ isActive: false, disabledAt: new Date() }),
      );

      await expect(
        service.verifyOtp('disabled@example.com', plainCode),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a PIN-role user (WAITER) in the email OTP flow', async () => {
      const plainCode = '333444';
      const hashedCode = await jest
        .requireActual<typeof bcrypt>('bcryptjs')
        .hash(plainCode, 10);
      mockPrisma.verificationToken.findFirst.mockResolvedValue({
        id: 'tok-pin',
        code: hashedCode,
        expiresAt: new Date(Date.now() + 60_000),
      });
      mockUsersService.findByEmail.mockResolvedValue(
        makeUser({ role: 'WAITER' }),
      );

      await expect(
        service.verifyOtp('waiter@example.com', plainCode),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockUsersService.create).not.toHaveBeenCalled();
    });

    it('rejects a PIN-role user (KITCHEN) in the email OTP flow', async () => {
      const plainCode = '555666';
      const hashedCode = await jest
        .requireActual<typeof bcrypt>('bcryptjs')
        .hash(plainCode, 10);
      mockCompare.mockImplementation(jest.requireActual('bcryptjs').compare);

      mockPrisma.verificationToken.findFirst.mockResolvedValue({
        id: 'tok-kitchen',
        code: hashedCode,
        expiresAt: new Date(Date.now() + 60_000),
      });
      mockUsersService.findByEmail.mockResolvedValue(
        makeUser({ role: 'KITCHEN' }),
      );

      await expect(
        service.verifyOtp('kitchen@example.com', plainCode),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('updates existing user name when provided in email flow, but ignores unverified phone', async () => {
      const plainCode = '999777';
      const hashedCode = await jest
        .requireActual('bcryptjs')
        .hash(plainCode, 1);
      mockCompare.mockImplementation(jest.requireActual('bcryptjs').compare);

      mockPrisma.verificationToken.findFirst.mockResolvedValue({
        id: 'tok-upd',
        code: hashedCode,
        expiresAt: new Date(Date.now() + 60_000),
      });
      mockUsersService.findByEmail.mockResolvedValue(
        makeUser({ phone: null, name: null }),
      );
      mockPrisma.user.update.mockResolvedValue(
        makeUser({ phone: '+1234567890', name: 'Alice' }),
      );

      const result = await service.verifyOtp(
        'user@example.com',
        plainCode,
        '+1234567890',
        'Alice',
      );

      expect(result.isNew).toBe(false);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Alice',
          }),
        }),
      );
      expect(
        mockPrisma.user.update.mock.calls[0][0].data.phone,
      ).toBeUndefined();
    });

    describe('phone flow — PIN-role rejection', () => {
      beforeEach(() => {
        jest
          .spyOn(
            service as unknown as { twilioConfigured: boolean },
            'twilioConfigured',
            'get',
          )
          .mockReturnValue(true);
        service['verifyTwilioOtp'] = jest.fn().mockResolvedValue(true);
      });

      it('rejects a PIN-role user (WAITER) in the phone OTP flow', async () => {
        mockUsersService.findByPhone.mockResolvedValue(
          makeUser({ role: 'WAITER' }),
        );

        await expect(
          service.verifyOtp(undefined, '123456', '+15550001111'),
        ).rejects.toThrow(UnauthorizedException);
        expect(mockUsersService.create).not.toHaveBeenCalled();
      });

      it('rejects a PIN-role user (KITCHEN) in the phone OTP flow', async () => {
        mockUsersService.findByPhone.mockResolvedValue(
          makeUser({ role: 'KITCHEN' }),
        );

        await expect(
          service.verifyOtp(undefined, '123456', '+15550002222'),
        ).rejects.toThrow(UnauthorizedException);
      });
    });
  });

  // ─── identity linking V1 ─────────────────────────────────────────────────────
  //
  // A second identifier may only ever be ADDED to an authenticated account —
  // it must never CREATE one. See
  // docs/superpowers/specs/2026-08-07-customer-identity-linking-design.md.

  describe('identity linking', () => {
    const PLACEHOLDER = 'phone-15550001111@phone.local';

    const phoneFirstCustomer = (overrides: Record<string, unknown> = {}) =>
      makeUser({
        id: 'cust1',
        role: 'CUSTOMER',
        email: PLACEHOLDER,
        phone: '+15550001111',
        isActive: true,
        disabledAt: null,
        ...overrides,
      });

    const validToken = {
      id: 'tok1',
      code: 'hashed-code',
      attempts: 0,
      lockedUntil: null,
    };

    beforeEach(() => {
      mockPrisma.user.findFirst = jest.fn().mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue(phoneFirstCustomer());
      mockPrisma.verificationToken.findFirst.mockResolvedValue(null);
    });

    describe('addIdentity', () => {
      it('issues a code to the new email and mutates nothing yet', async () => {
        const result = await service.addIdentity('cust1', 'real@example.com');

        expect(result.success).toBe(true);
        expect(result.channel).toBe('email');
        expect(mockPrisma.verificationToken.create).toHaveBeenCalled();
        expect(mockPrisma.user.update).not.toHaveBeenCalled();
      });

      it('refuses an email already held elsewhere without sending a code', async () => {
        mockPrisma.user.findFirst.mockResolvedValue(makeUser({ id: 'other' }));

        await expect(
          service.addIdentity('cust1', 'taken@example.com'),
        ).rejects.toThrow('IDENTITY_IN_USE');
        expect(mockPrisma.verificationToken.create).not.toHaveBeenCalled();
      });

      it('requires exactly one identifier', async () => {
        await expect(service.addIdentity('cust1')).rejects.toThrow(
          HttpException,
        );
        await expect(
          service.addIdentity('cust1', 'a@example.com', '+15550009999'),
        ).rejects.toThrow(HttpException);
        expect(mockPrisma.verificationToken.create).not.toHaveBeenCalled();
      });

      it('rejects an unknown user before issuing any code (no send-side probing)', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(null);

        await expect(
          service.addIdentity('ghost', 'real@example.com'),
        ).rejects.toThrow(UnauthorizedException);
        expect(mockPrisma.verificationToken.create).not.toHaveBeenCalled();
      });

      it('rejects a disabled account', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(
          phoneFirstCustomer({ isActive: false, disabledAt: new Date() }),
        );

        await expect(
          service.addIdentity('cust1', 'real@example.com'),
        ).rejects.toThrow(UnauthorizedException);
        expect(mockPrisma.verificationToken.create).not.toHaveBeenCalled();
      });

      it('rejects non-customer roles — staff change email through other flows', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(
          phoneFirstCustomer({ role: 'OWNER' }),
        );

        await expect(
          service.addIdentity('cust1', 'real@example.com'),
        ).rejects.toThrow(ForbiddenException);
        expect(mockPrisma.verificationToken.create).not.toHaveBeenCalled();
      });
    });

    describe('verifyIdentity', () => {
      it('writes the verified email onto the existing row, replacing the placeholder', async () => {
        mockPrisma.verificationToken.findFirst.mockResolvedValue(validToken);
        mockCompare.mockResolvedValue(true);
        mockPrisma.user.update.mockResolvedValue(
          phoneFirstCustomer({ email: 'real@example.com' }),
        );

        const result = await service.verifyIdentity(
          'cust1',
          '123456',
          'real@example.com',
        );

        expect(mockPrisma.user.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'cust1' },
            data: { email: 'real@example.com' },
          }),
        );
        expect(result.user.id).toBe('cust1');
        expect(result.user.email).toBe('real@example.com');
      });

      it('keeps the account id stable so points survive the link', async () => {
        mockPrisma.verificationToken.findFirst.mockResolvedValue(validToken);
        mockCompare.mockResolvedValue(true);
        mockPrisma.user.update.mockResolvedValue(
          phoneFirstCustomer({ email: 'real@example.com' }),
        );

        const linked = await service.verifyIdentity(
          'cust1',
          '123456',
          'real@example.com',
        );

        // Regression: signing in later by the newly linked email must resolve
        // to the same row, not mint a second account.
        mockUsersService.findByEmail.mockResolvedValue(
          phoneFirstCustomer({ email: 'real@example.com' }),
        );
        mockPrisma.verificationToken.findFirst.mockResolvedValue(validToken);
        const signIn = await service.verifyOtp('real@example.com', '123456');

        expect(signIn.isNew).toBe(false);
        expect(signIn.user.id).toBe(linked.user.id);
        expect(mockUsersService.create).not.toHaveBeenCalled();
      });

      it('re-checks the collision inside the transaction and refuses', async () => {
        mockPrisma.verificationToken.findFirst.mockResolvedValue(validToken);
        mockCompare.mockResolvedValue(true);
        mockPrisma.user.findFirst.mockResolvedValue(makeUser({ id: 'other' }));

        await expect(
          service.verifyIdentity('cust1', '123456', 'taken@example.com'),
        ).rejects.toThrow('IDENTITY_IN_USE');
        expect(mockPrisma.user.update).not.toHaveBeenCalled();
      });

      it('rejects an invalid code without touching the user row', async () => {
        mockPrisma.verificationToken.findFirst.mockResolvedValue(validToken);
        mockCompare.mockResolvedValue(false);

        await expect(
          service.verifyIdentity('cust1', '000000', 'real@example.com'),
        ).rejects.toThrow(UnauthorizedException);
        expect(mockPrisma.user.update).not.toHaveBeenCalled();
      });

      it('rejects an expired or absent code', async () => {
        mockPrisma.verificationToken.findFirst.mockResolvedValue(null);

        await expect(
          service.verifyIdentity('cust1', '123456', 'real@example.com'),
        ).rejects.toThrow(UnauthorizedException);
        expect(mockPrisma.user.update).not.toHaveBeenCalled();
      });

      it('adds a phone to an email-first account', async () => {
        // Verify against our own DB rather than Twilio Verify — the outer
        // beforeEach clears SMS_PROVIDER to keep the default path hermetic.
        process.env.SMS_PROVIDER = 'smsgateway';
        mockPrisma.user.findUnique.mockResolvedValue(
          phoneFirstCustomer({ email: 'real@example.com', phone: null }),
        );
        mockPrisma.verificationToken.findFirst.mockResolvedValue(validToken);
        mockCompare.mockResolvedValue(true);
        mockPrisma.user.update.mockResolvedValue(
          phoneFirstCustomer({
            email: 'real@example.com',
            phone: '+15550003333',
          }),
        );

        const result = await service.verifyIdentity(
          'cust1',
          '123456',
          undefined,
          '+15550003333',
        );

        expect(mockPrisma.user.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'cust1' },
            data: { phone: '+15550003333' },
          }),
        );
        expect(result.user.phone).toBe('+15550003333');
      });
    });
  });

  describe('durable session management', () => {
    it('lists only the caller current version and marks the current session', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ sessionVersion: 2 });
      mockPrisma.userSession.findMany.mockResolvedValue([
        {
          id: 'session-current',
          authMethod: 'PASSWORD',
          deviceTokenId: null,
          ipAddress: null,
          userAgent: null,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
        },
      ]);

      const result = await service.listSessions('usr1', 'session-current');

      expect(mockPrisma.userSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'usr1',
            sessionVersion: 2,
            revokedAt: null,
          }),
        }),
      );
      expect(result.sessions[0].current).toBe(true);
      expect(result.nextCursor).toBeNull();
      expect(result.legacyCurrentSession).toBe(false);
    });

    it('revokes one owned session and evicts only its sockets', async () => {
      const result = await service.revokeSession(
        'usr1',
        'session-2',
        'session-1',
      );

      expect(mockPrisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-2', userId: 'usr1', revokedAt: null },
        data: {
          revokedAt: expect.any(Date),
          revokedReason: 'user_revoked',
        },
      });
      expect(mockEvents.evictSession).toHaveBeenCalledWith(
        'session-2',
        'session_revoked',
      );
      expect(result).toEqual({ success: true, current: false });
    });

    it('does not reveal or revoke a session owned by another user', async () => {
      mockPrisma.userSession.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.revokeSession('usr1', 'foreign-session', 'session-1'),
      ).rejects.toThrow('Active session not found.');
      expect(mockEvents.evictSession).not.toHaveBeenCalled();
    });

    it('increments the global version and revokes every durable session', async () => {
      await service.signOutEverywhere('usr1');

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'usr1' },
        data: {
          sessionVersion: { increment: 1 },
          passwordChangedAt: expect.any(Date),
        },
      });
      expect(mockPrisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { userId: 'usr1', revokedAt: null },
        data: {
          revokedAt: expect.any(Date),
          revokedReason: 'user_global_logout',
        },
      });
      expect(mockEvents.evictUser).toHaveBeenCalledWith(
        'usr1',
        'user_global_logout',
      );
    });

    it('revokes the signed cookie session without persisting the JWT', async () => {
      (mockJwt.verify as jest.Mock).mockReturnValue({
        sub: 'usr1',
        sessionId: 'session-1',
      });

      await service.logoutSession('signed.jwt');

      expect(mockPrisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-1', userId: 'usr1', revokedAt: null },
        data: { revokedAt: expect.any(Date), revokedReason: 'logout' },
      });
      expect(mockEvents.evictSession).toHaveBeenCalledWith(
        'session-1',
        'logout',
      );
    });

    it('returns a bounded page and a continuation cursor instead of hiding old sessions', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ sessionVersion: 0 });
      mockPrisma.userSession.findMany.mockResolvedValue(
        Array.from({ length: 51 }, (_, index) => ({ id: `session-${index}` })),
      );
      const page = await service.listSessions('usr1', undefined, 'previous');
      expect(page.sessions).toHaveLength(50);
      expect(page.nextCursor).toBe('session-49');
      expect(page.legacyCurrentSession).toBe(true);
      expect(mockPrisma.userSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'usr1' }),
          cursor: { id: 'previous' },
          skip: 1,
          take: 51,
        }),
      );
    });

    it('does not swallow a database failure during logout', async () => {
      (mockJwt.verify as jest.Mock).mockReturnValue({
        sub: 'usr1',
        sessionId: 'session-1',
      });
      mockPrisma.userSession.updateMany.mockRejectedValueOnce(
        new Error('database unavailable'),
      );
      await expect(service.logoutSession('signed.jwt')).rejects.toThrow(
        'database unavailable',
      );
      expect(mockEvents.evictSession).not.toHaveBeenCalled();
    });

    it('does not trust or persist an invalid logout credential', async () => {
      (mockJwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('invalid signature');
      });
      await expect(service.logoutSession('invalid')).resolves.toBeUndefined();
      expect(mockPrisma.userSession.updateMany).not.toHaveBeenCalled();
    });

    it('retries socket eviction when logout is repeated after revocation', async () => {
      (mockJwt.verify as jest.Mock).mockReturnValue({
        sub: 'usr1',
        sessionId: 'session-1',
      });
      mockPrisma.userSession.updateMany.mockResolvedValueOnce({ count: 0 });
      await service.logoutSession('signed.jwt');
      expect(mockEvents.evictSession).toHaveBeenCalledWith(
        'session-1',
        'logout',
      );
    });

    it('persists the exact signed identity and bounds untrusted display metadata', async () => {
      await service.login(makeUser({ sessionVersion: 4 }), {
        ipAddress: 'x'.repeat(200),
        userAgent: 'y'.repeat(1000),
      });
      const claims = (mockJwt.sign as jest.Mock).mock.calls[0][0];
      expect(mockPrisma.userSession.create).toHaveBeenCalledWith({
        data: {
          id: claims.sessionId,
          userId: 'usr1',
          sessionVersion: 4,
          authMethod: 'PASSWORD',
          deviceTokenId: null,
          ipAddress: 'x'.repeat(128),
          userAgent: 'y'.repeat(512),
          expiresAt: expect.any(Date),
        },
      });
      expect(claims.sessionVersion).toBe(4);
    });

    it('never hands out a login JWT when its durable row could not be created', async () => {
      mockPrisma.userSession.create.mockRejectedValueOnce(
        new Error('database unavailable'),
      );
      await expect(service.login(makeUser())).rejects.toThrow(
        'database unavailable',
      );
    });
  });
});
