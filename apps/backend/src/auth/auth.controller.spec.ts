import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LocalAuthGuard } from './local-auth.guard';
import { Response } from 'express';
import { Logger } from '@nestjs/common';

const mockAuthService = {
  login: jest.fn(),
  register: jest.fn(),
  sendOtp: jest.fn(),
  verifyOtp: jest.fn(),
  validateGoogleUser: jest.fn(),
  exitImpersonation: jest.fn(),
};

const mockJwtAuthGuard = {
  canActivate: jest.fn(() => true),
};

const mockLocalAuthGuard = {
  canActivate: jest.fn(() => true),
};

describe('AuthController', () => {
  let controller: AuthController;
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .overrideGuard(LocalAuthGuard)
      .useValue(mockLocalAuthGuard)
      .compile();

    controller = module.get<AuthController>(AuthController);
    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    it('should set cookie and return result on successful login', async () => {
      const mockResult = { token: 'mock-token', user: { id: 1 } };
      mockAuthService.login.mockResolvedValue(mockResult);

      const req = { user: { id: 1 } };
      const res = { cookie: jest.fn() } as unknown as Response;

      const result = await controller.login(req, res);

      expect(service.login).toHaveBeenCalledWith(req.user);
      expect(res.cookie).toHaveBeenCalledWith(
        'token',
        'mock-token',
        expect.any(Object),
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('register', () => {
    it('should return result on successful registration', async () => {
      const mockResult = { success: true, message: 'registered' };
      mockAuthService.register.mockResolvedValue(mockResult);

      const dto = {
        email: 'test@test.com',
        password: 'password',
        name: 'Test',
      };
      const res = { cookie: jest.fn() } as unknown as Response;

      const result = await controller.register(dto, res);

      expect(service.register).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockResult);
    });
  });

  describe('getProfile', () => {
    it('should return the authenticated user', () => {
      const req = { user: { id: 1, name: 'Test User' } };
      const result = controller.getProfile(req);

      expect(result).toEqual(req.user);
    });
  });

  describe('sendOtp', () => {
    it('should call authService.sendOtp with correct parameters', async () => {
      mockAuthService.sendOtp.mockResolvedValue({ success: true });

      const result = await controller.sendOtp(
        'test@test.com',
        '1234567890',
        'rest1',
      );

      expect(service.sendOtp).toHaveBeenCalledWith(
        'test@test.com',
        '1234567890',
        'rest1',
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('verifyOtp', () => {
    it('should call authService.verifyOtp and set cookie', async () => {
      const mockResult = { token: 'mock-token', user: { id: 1 } };
      mockAuthService.verifyOtp.mockResolvedValue(mockResult);

      const res = { cookie: jest.fn() } as unknown as Response;
      const result = await controller.verifyOtp(
        'test@test.com',
        '1234',
        '1234567890',
        'Test',
        'rest1',
        res,
      );

      expect(service.verifyOtp).toHaveBeenCalledWith(
        'test@test.com',
        '1234',
        '1234567890',
        'Test',
        'rest1',
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'token',
        'mock-token',
        expect.any(Object),
      );
      expect(result).toEqual(mockResult);
    });

    it('should verify that when email flow is used, an unverified phone is ignored', async () => {
      // Simulating the fix applied in core: passing phone along with email for verification.
      // The auth.service is responsible for ignoring the unverified phone,
      // but the controller must pass it correctly.
      const mockResult = {
        token: 'mock-token-email-flow',
        user: { id: 2, email: 'test@test.com' },
      };
      mockAuthService.verifyOtp.mockResolvedValue(mockResult);

      const res = { cookie: jest.fn() } as unknown as Response;
      const result = await controller.verifyOtp(
        'test@test.com',
        '1234',
        '1234567890',
        undefined,
        undefined,
        res,
      );

      expect(service.verifyOtp).toHaveBeenCalledWith(
        'test@test.com',
        '1234',
        '1234567890',
        undefined,
        undefined,
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'token',
        'mock-token-email-flow',
        expect.any(Object),
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('cookie clearing and OAuth diagnostics', () => {
    it('clears the token cookie with the same identity on impersonation exit', async () => {
      mockAuthService.exitImpersonation.mockResolvedValue(undefined);
      const req = { user: { id: 'staff-1' } } as any;
      const res = { clearCookie: jest.fn() } as unknown as Response;

      await controller.exitImpersonation(req, res);

      expect(res.clearCookie).toHaveBeenCalledWith(
        'token',
        expect.objectContaining({
          httpOnly: true,
          path: '/',
        }),
      );
    });

    it('logs malformed OAuth state instead of swallowing the parse failure', async () => {
      const warning = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      mockAuthService.validateGoogleUser.mockResolvedValue({ id: 'user-1' });
      mockAuthService.login.mockResolvedValue({
        token: 'mock-token',
        user: { id: 'user-1' },
      });
      const req = { user: {}, query: { state: 'not-json' } };
      const res = {
        cookie: jest.fn(),
        redirect: jest.fn(),
      } as unknown as Response;

      await controller.googleAuthRedirect(req, res);

      expect(warning).toHaveBeenCalledWith(
        expect.stringContaining('Unable to parse validated OAuth state'),
      );
      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:3001/auth/callback',
      );
    });
  });
});
