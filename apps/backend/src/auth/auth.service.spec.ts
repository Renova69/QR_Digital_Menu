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
  ...overrides,
});

describe('AuthService', () => {
  let service: AuthService;
  let mockPrisma: any;
  let mockUsersService: any;
  let mockJwt: Partial<JwtService>;

  beforeEach(() => {
    const real = jest.requireActual('bcryptjs');
    mockCompare.mockImplementation(real.compare);
    mockHash.mockImplementation(real.hash);

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
        }),
        update: jest.fn().mockResolvedValue({}),
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
    mockJwt = { sign: jest.fn().mockReturnValue('test-jwt-token') };

    service = new AuthService(
      mockUsersService,
      mockJwt as JwtService,
      mockPrisma,
      new FeatureService(),
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
      expect(mockJwt.sign).toHaveBeenCalledWith({
        email: user.email,
        sub: user.id,
      });
    });
  });

  // ─── validateGoogleUser ──────────────────────────────────────────────────────

  describe('validateGoogleUser', () => {
    it('returns existing user when found', async () => {
      const user = makeUser();
      mockUsersService.findByEmail.mockResolvedValue(user);
      const result = await service.validateGoogleUser({
        email: 'user@example.com',
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
      const existingUser = makeUser({ password: 'old-bcrypt-hash', googleId: null });
      mockUsersService.findByEmail.mockResolvedValue(existingUser);
      mockPrisma.user.findUnique.mockResolvedValue(null); // no existing googleId match
      mockHash.mockResolvedValue('invalidated-hash');

      await service.validateGoogleUser({
        googleId: 'google-id-123',
        email: 'user@example.com',
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
      const existingUser = makeUser({ password: 'existing-hash', googleId: 'google-id-123' });
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
      mockPrisma.deviceEnrollmentToken.findFirst.mockResolvedValue(null);
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
      mockPrisma.deviceEnrollmentToken.findFirst.mockResolvedValue({
        id: 'device-token-1',
        pinAttempts: 5,
        pinLockedUntil: futureDate,
      });
      await expect(
        service.pinLogin('rest1', '1234', deviceToken),
      ).rejects.toThrow(HttpException);
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
      expect(mockJwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          email: staff.email,
          sub: staff.id,
          deviceTokenId: 'device-token-1',
        }),
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
      expect(
        mockPrisma.$transaction.mock.invocationCallOrder[0],
      ).toBeLessThan(
        mockPrisma.staffDeviceBinding.findUnique.mock.invocationCallOrder[0],
      );
      expect(
        mockPrisma.$queryRaw.mock.invocationCallOrder[0],
      ).toBeLessThan(
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
      expect(
        mockPrisma.$transaction.mock.invocationCallOrder[0],
      ).toBeLessThan(
        mockPrisma.staffDeviceBinding.findUnique.mock.invocationCallOrder[0],
      );
      expect(
        mockPrisma.$queryRaw.mock.invocationCallOrder[0],
      ).toBeLessThan(
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
          data: expect.objectContaining({ pinAttempts: 1 }),
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
      mockPrisma.deviceEnrollmentToken.findFirst.mockResolvedValue({
        id: 'device-token-1',
        pinAttempts: 4,
        pinLockedUntil: null,
      });
      mockPrisma.user.findMany.mockResolvedValue([
        makeUser({ pinHash: 'hash' }),
      ]);

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
        data: { password: 'new-hash', passwordChangedAt: expect.any(Date) },
      });
      expect(result).toEqual({ success: true });
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
      global.fetch = jest.fn().mockResolvedValue({ ok: true }) as any;
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
      }) as any;
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
      }) as any;
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
      jest.spyOn(service as any, 'twilioConfigured', 'get').mockReturnValue(true);
      // Simulate a recent token stored against the phone number
      mockPrisma.verificationToken.findFirst.mockResolvedValue({
        id: 'phone-tok1',
        email: '+15550001234',
        createdAt: new Date(),
      });

      await expect(
        service.sendOtp(undefined, '+15550001234'),
      ).rejects.toThrow(HttpException);
      // Should NOT have called Twilio
      expect(mockPrisma.verificationToken.create).not.toHaveBeenCalled();
    });

    it('creates a sentinel VerificationToken for phone cooldown and calls Twilio when no recent token (Issue 42)', async () => {
      jest.spyOn(service as any, 'twilioConfigured', 'get').mockReturnValue(true);
      jest.spyOn(service as any, 'sendTwilioOtp').mockResolvedValue(undefined);
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
      mockCompare.mockImplementation(jest.requireActual('bcryptjs').compare);

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

    it('updates existing user phone and name when provided in email flow', async () => {
      const plainCode = '999777';
      const hashedCode = await jest
        .requireActual<typeof bcrypt>('bcryptjs')
        .hash(plainCode, 10);
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
            phone: '+1234567890',
            name: 'Alice',
          }),
        }),
      );
    });

    describe('phone flow — PIN-role rejection', () => {
      beforeEach(() => {
        jest.spyOn(service as any, 'twilioConfigured', 'get').mockReturnValue(true);
        jest.spyOn(service as any, 'verifyTwilioOtp').mockResolvedValue(true);
      });

      it('rejects a PIN-role user (WAITER) in the phone OTP flow', async () => {
        mockUsersService.findByPhone.mockResolvedValue(makeUser({ role: 'WAITER' }));

        await expect(
          service.verifyOtp(undefined, '123456', '+15550001111'),
        ).rejects.toThrow(UnauthorizedException);
        expect(mockUsersService.create).not.toHaveBeenCalled();
      });

      it('rejects a PIN-role user (KITCHEN) in the phone OTP flow', async () => {
        mockUsersService.findByPhone.mockResolvedValue(makeUser({ role: 'KITCHEN' }));

        await expect(
          service.verifyOtp(undefined, '123456', '+15550002222'),
        ).rejects.toThrow(UnauthorizedException);
      });
    });
  });
});
