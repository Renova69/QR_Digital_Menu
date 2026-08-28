import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LocalAuthGuard } from './local-auth.guard';
import { Response, Request as ExpressRequest } from 'express';
import { Logger } from '@nestjs/common';

const mockAuthService = {
  login: jest.fn(),
  register: jest.fn(),
  sendOtp: jest.fn(),
  verifyOtp: jest.fn(),
  validateGoogleUser: jest.fn(),
  exitImpersonation: jest.fn(),
  logoutSession: jest.fn(),
  listSessions: jest.fn(),
  revokeSession: jest.fn(),
  signOutEverywhere: jest.fn(),
  addIdentity: jest.fn(),
  verifyIdentity: jest.fn(),
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
  const request = (user: Record<string, unknown> = {}) =>
    ({
      user,
      ip: '203.0.113.4',
      get: jest.fn().mockReturnValue('Test Browser'),
      cookies: {},
    }) as unknown as ExpressRequest & {
      user: { id: string; sessionId?: string };
    };

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

      const req = request({ id: 1 });
      const res = { cookie: jest.fn() } as unknown as Response;

      const result = await controller.login(req, res);

      expect(service.login).toHaveBeenCalledWith(req.user, {
        ipAddress: '203.0.113.4',
        userAgent: 'Test Browser',
      });
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
    it('returns the public profile without its internal session id', () => {
      const req = {
        user: { id: 1, name: 'Test User', sessionId: 'session-1' },
      };
      const result = controller.getProfile(req);

      expect(result).toEqual({ id: 1, name: 'Test User' });
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
      const req = request();
      const result = await controller.verifyOtp(
        'test@test.com',
        '1234',
        '1234567890',
        'Test',
        'rest1',
        res,
        req,
      );

      expect(service.verifyOtp).toHaveBeenCalledWith(
        'test@test.com',
        '1234',
        '1234567890',
        'Test',
        'rest1',
        {
          ipAddress: '203.0.113.4',
          userAgent: 'Test Browser',
        },
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
      const req = request();
      const result = await controller.verifyOtp(
        'test@test.com',
        '1234',
        '1234567890',
        undefined,
        undefined,
        res,
        req,
      );

      expect(service.verifyOtp).toHaveBeenCalledWith(
        'test@test.com',
        '1234',
        '1234567890',
        undefined,
        undefined,
        {
          ipAddress: '203.0.113.4',
          userAgent: 'Test Browser',
        },
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
      const req = {
        ...request(),
        query: { state: 'not-json' },
      };
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

  describe('identity linking routes', () => {
    const guardNames = (target: object | Function): string[] =>
      (Reflect.getMetadata(GUARDS_METADATA, target) ?? []).map(
        (guard: unknown) =>
          typeof guard === 'function'
            ? guard.name
            : (guard as { constructor?: { name?: string } })?.constructor?.name,
      );

    // Acceptance criterion: an unauthenticated call is rejected before any OTP
    // is sent, so no user enumeration is possible via send-side probing.
    it('requires a JWT on both identity endpoints', () => {
      expect(guardNames(AuthController.prototype.addIdentity)).toContain(
        JwtAuthGuard.name,
      );
      expect(guardNames(AuthController.prototype.verifyIdentity)).toContain(
        JwtAuthGuard.name,
      );
    });

    it('scopes the mutation to the session user, not a body-supplied id', async () => {
      await controller.addIdentity(
        { user: { id: 'cust1' } },
        { email: 'real@example.com' },
      );
      expect(mockAuthService.addIdentity).toHaveBeenCalledWith(
        'cust1',
        'real@example.com',
        undefined,
      );

      await controller.verifyIdentity(
        { user: { id: 'cust1' } },
        { code: '123456', email: 'real@example.com' },
      );
      expect(mockAuthService.verifyIdentity).toHaveBeenCalledWith(
        'cust1',
        '123456',
        'real@example.com',
        undefined,
      );
    });
  });

  describe('session controls', () => {
    it.each(['listSessions', 'revokeSession', 'signOutEverywhere'] as const)(
      'requires authentication for %s',
      (method) => {
        expect(
          Reflect.getMetadata(
            GUARDS_METADATA,
            AuthController.prototype[method],
          ),
        ).toContain(JwtAuthGuard);
      },
    );

    it('passes only the authenticated owner and current session into the inventory query', async () => {
      await controller.listSessions(
        request({ id: 'owner', sessionId: 'current' }),
        { cursor: 'cursor' },
      );
      expect(mockAuthService.listSessions).toHaveBeenCalledWith(
        'owner',
        'current',
        'cursor',
      );
    });

    it.each([false, true])(
      'clears the cookie only when the revoked session is current (%s)',
      async (current) => {
        mockAuthService.revokeSession.mockResolvedValue({
          success: true,
          current,
        });
        const res = { clearCookie: jest.fn() } as unknown as Response;
        await controller.revokeSession(
          request({ id: 'owner', sessionId: 'current' }),
          'selected',
          res,
        );
        expect(mockAuthService.revokeSession).toHaveBeenCalledWith(
          'owner',
          'selected',
          'current',
        );
        expect(res.clearCookie).toHaveBeenCalledTimes(current ? 1 : 0);
      },
    );

    it('clears the current cookie after global revocation succeeds', async () => {
      mockAuthService.signOutEverywhere.mockResolvedValue({ success: true });
      const res = { clearCookie: jest.fn() } as unknown as Response;
      await controller.signOutEverywhere(request({ id: 'owner' }), res);
      expect(mockAuthService.signOutEverywhere).toHaveBeenCalledWith('owner');
      expect(res.clearCookie).toHaveBeenCalledTimes(1);
    });

    it('clears the cookie but reports a failed server-side logout', async () => {
      mockAuthService.logoutSession.mockRejectedValueOnce(
        new Error('database unavailable'),
      );
      const req = request();
      req.cookies.token = 'signed.jwt';
      const res = { clearCookie: jest.fn() } as unknown as Response;
      await expect(controller.logout(req, res)).rejects.toThrow(
        'database unavailable',
      );
      expect(mockAuthService.logoutSession).toHaveBeenCalledWith('signed.jwt');
      expect(res.clearCookie).toHaveBeenCalledTimes(1);
    });
  });
});
