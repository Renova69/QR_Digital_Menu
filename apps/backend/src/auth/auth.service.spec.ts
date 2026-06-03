import {
  ConflictException,
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
        findUnique: jest.fn(),
      },
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
  });

  // ─── register ────────────────────────────────────────────────────────────────

  describe('register', () => {
    it('throws ConflictException when email already exists', async () => {
      mockUsersService.findByEmail.mockResolvedValue(makeUser());
      await expect(
        service.register({ email: 'user@example.com', password: 'pass' }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates user and returns JWT + user on success', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue(
        makeUser({ password: 'hashed' }),
      );
      mockHash.mockResolvedValue('hashed');

      const result = await service.register({
        email: 'new@example.com',
        password: 'pass123',
      });

      expect(result.token).toBe('test-jwt-token');
      expect(result.user).not.toHaveProperty('password');
      expect(mockUsersService.create).toHaveBeenCalled();
    });
  });

  // ─── pinLogin ────────────────────────────────────────────────────────────────

  describe('pinLogin', () => {
    it('throws UnauthorizedException when no staff candidates found', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      await expect(service.pinLogin('rest1', '1234')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('only considers device roles (WAITER/KITCHEN) — dashboard roles excluded', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      await expect(service.pinLogin('rest1', '1234')).rejects.toThrow(
        UnauthorizedException,
      );
      const where = mockPrisma.user.findMany.mock.calls[0][0].where;
      expect(where.role.in).toEqual(['WAITER', 'KITCHEN']);
      expect(where.role.in).not.toContain('OWNER');
      expect(where.role.in).not.toContain('MANAGER');
      expect(where.role.in).not.toContain('STAFF');
    });

    it('throws HttpException(429) when a candidate is locked', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000);
      mockPrisma.user.findMany.mockResolvedValue([
        makeUser({
          pinHash: 'hash',
          pinAttempts: 5,
          pinLockedUntil: futureDate,
        }),
      ]);
      await expect(service.pinLogin('rest1', '1234')).rejects.toThrow(
        HttpException,
      );
    });

    it('returns JWT and resets attempts on valid PIN', async () => {
      mockCompare.mockResolvedValue(true);
      const staff = makeUser({
        pinHash: 'hashed-pin',
        pinAttempts: 2,
        pinLockedUntil: null,
        role: 'WAITER',
        restaurantId: 'rest1',
      });
      mockPrisma.user.findMany.mockResolvedValue([staff]);

      const result = await service.pinLogin('rest1', '1234');

      expect(result.token).toBe('test-jwt-token');
      expect(mockPrisma.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { pinAttempts: 0, pinLockedUntil: null },
        }),
      );
    });

    it('increments attempts and throws UnauthorizedException on wrong PIN', async () => {
      mockCompare.mockResolvedValue(false);
      mockPrisma.user.findMany.mockResolvedValue([
        makeUser({ pinHash: 'hash', pinAttempts: 0, pinLockedUntil: null }),
      ]);

      await expect(service.pinLogin('rest1', 'wrong')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockPrisma.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ pinAttempts: 1 }),
        }),
      );
    });

    it('locks account and throws HttpException(429) after MAX_ATTEMPTS', async () => {
      mockCompare.mockResolvedValue(false);
      mockPrisma.user.findMany.mockResolvedValue([
        makeUser({ pinHash: 'hash', pinAttempts: 4, pinLockedUntil: null }),
      ]);

      await expect(service.pinLogin('rest1', 'wrong')).rejects.toThrow(
        HttpException,
      );
      expect(mockPrisma.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ pinLockedUntil: expect.any(Date) }),
        }),
      );
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
        data: { password: 'new-hash' },
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
  });
});
