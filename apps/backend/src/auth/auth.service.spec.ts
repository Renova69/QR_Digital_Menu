import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { HttpException, UnauthorizedException } from '@nestjs/common';

describe('AuthService OTP', () => {
  let service: AuthService;
  let mockPrisma: any;
  let mockUsersService: any;
  let mockJwt: Partial<JwtService>;

  beforeEach(() => {
    mockPrisma = {
      verificationToken: {
        findFirst: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      user: { update: jest.fn().mockResolvedValue({}) },
    };
    mockUsersService = {
      findByEmail: jest.fn(),
      create: jest.fn(),
    };
    mockJwt = { sign: jest.fn().mockReturnValue('test-jwt-token') };

    service = new AuthService(
      mockUsersService as any,
      mockJwt as JwtService,
      mockPrisma,
    );
  });

  describe('sendOtp', () => {
    it('creates a VerificationToken and returns success:true', async () => {
      mockPrisma.verificationToken.findFirst.mockResolvedValue(null);

      const result = await service.sendOtp('user@example.com');

      expect(mockPrisma.verificationToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'user@example.com' }),
        }),
      );
      expect(result.success).toBe(true);
    });

    it('includes devCode in response when RESEND_API_KEY is not set', async () => {
      delete process.env.RESEND_API_KEY;
      mockPrisma.verificationToken.findFirst.mockResolvedValue(null);

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
  });

  describe('verifyOtp', () => {
    it('throws UnauthorizedException when no valid token exists', async () => {
      mockPrisma.verificationToken.findFirst.mockResolvedValue(null);

      await expect(
        service.verifyOtp('user@example.com', '123456'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns JWT + isNew:true for a new user with valid code', async () => {
      const bcrypt = require('bcryptjs');
      const plainCode = '654321';
      const hashedCode = await bcrypt.hash(plainCode, 10);

      mockPrisma.verificationToken.findFirst.mockResolvedValue({
        id: 'tok1',
        code: hashedCode,
        expiresAt: new Date(Date.now() + 60_000),
      });
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue({
        id: 'usr1',
        email: 'user@example.com',
        name: null,
        role: 'CUSTOMER',
      });

      const result = await service.verifyOtp('user@example.com', plainCode);

      expect(result.isNew).toBe(true);
      expect(result.token).toBe('test-jwt-token');
      expect(result.user.email).toBe('user@example.com');
    });

    it('returns isNew:false for an existing user', async () => {
      const bcrypt = require('bcryptjs');
      const plainCode = '111222';
      const hashedCode = await bcrypt.hash(plainCode, 10);

      mockPrisma.verificationToken.findFirst.mockResolvedValue({
        id: 'tok2',
        code: hashedCode,
        expiresAt: new Date(Date.now() + 60_000),
      });
      mockUsersService.findByEmail.mockResolvedValue({
        id: 'usr2',
        email: 'existing@example.com',
        name: 'Existing User',
        role: 'CUSTOMER',
        phone: null,
      });

      const result = await service.verifyOtp('existing@example.com', plainCode);

      expect(result.isNew).toBe(false);
      expect(mockUsersService.create).not.toHaveBeenCalled();
    });
  });
});
