import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Res,
  Req,
  UsePipes,
  ValidationPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response, Request as ExpressRequest } from 'express';
import { AuthService } from './auth.service';
import { CreateAuthDto } from './dto/create-auth.dto';
import { LocalAuthGuard } from './local-auth.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { GoogleAuthGuard } from './google-auth.guard';
import { PinLoginDto } from './dto/pin-login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { VerifyRegistrationDto } from './dto/verify-registration.dto';

const COOKIE_SAMESITE: 'lax' | 'strict' | 'none' =
  (process.env.COOKIE_SAMESITE as any) ||
  (process.env.NODE_ENV === 'production' ? 'none' : 'lax');

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: COOKIE_SAMESITE,
  path: '/',
  maxAge: 24 * 60 * 60 * 1000, // 1 day
};

function setTokenCookie(res: Response, token: string) {
  res.cookie('token', token, COOKIE_OPTIONS);
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async register(
    @Body() createAuthDto: CreateAuthDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(createAuthDto);
    return result;
  }

  @Post('register/verify')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async verifyRegistration(
    @Body() verifyRegistrationDto: VerifyRegistrationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyRegistration(
      verifyRegistrationDto,
    );
    setTokenCookie(res, result.token);
    return result;
  }

  @UseGuards(LocalAuthGuard)
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(@Request() req: any, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(req.user);
    setTokenCookie(res, result.token);
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@Request() req: any) {
    return req.user;
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateProfile(@Request() req: any, @Body('name') name: string) {
    return this.authService.updateProfile(req.user.id, name);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/password')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  changePassword(
    @Request() req: any,
    @Body(new ValidationPipe({ whitelist: true })) dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      req.user.id,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Patch('onboarding-step')
  updateOnboardingStep(@Request() req: any, @Body('step') step: string) {
    return this.authService.updateOnboardingStep(req.user.id, step);
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleAuth() {
    // The Google strategy will handle the redirect
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleAuthRedirect(@Request() req: any, @Res() res: Response) {
    const user = await this.authService.validateGoogleUser(req.user);
    const { token } = await this.authService.login(user);
    setTokenCookie(res, token);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';

    let returnTo = '';
    if (req.query.state) {
      try {
        const state = JSON.parse(req.query.state as string);
        if (state.returnTo) {
          returnTo = `&returnTo=${encodeURIComponent(state.returnTo)}`;
        }
      } catch (e) {}
    }

    // Token already set via httpOnly cookie above — do NOT leak in URL
    res.redirect(
      `${frontendUrl}/auth/callback${returnTo ? `?${returnTo.slice(1)}` : ''}`,
    );
  }

  @Post('otp/send')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  sendOtp(
    @Body('email') email?: string,
    @Body('phone') phone?: string,
    @Body('restaurantId') restaurantId?: string,
  ) {
    return this.authService.sendOtp(email, phone, restaurantId);
  }

  @Post('otp/verify')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async verifyOtp(
    @Body('email') email: string | undefined,
    @Body('code') code: string | undefined,
    @Body('phone') phone: string | undefined,
    @Body('name') name: string | undefined,
    @Body('restaurantId') restaurantId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyOtp(
      email,
      code,
      phone,
      name,
      restaurantId,
    );
    setTokenCookie(res, result.token);
    return result;
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: COOKIE_SAMESITE,
      path: '/',
    });
    return { success: true };
  }

  @Get('csrf-token')
  getCsrfToken(@Req() req: ExpressRequest) {
    return { csrfToken: (req as any)['csrfToken'] ?? null };
  }

  @Post('pin-login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async pinLogin(
    @Body(new ValidationPipe({ whitelist: true })) dto: PinLoginDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: ExpressRequest,
  ) {
    const result = await this.authService.pinLogin(
      dto.restaurantId,
      dto.pin,
      dto.deviceToken,
      {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    );
    setTokenCookie(res, result.token);
    return { user: result.user };
  }
}
