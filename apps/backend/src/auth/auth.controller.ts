import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Res,
  UsePipes,
  ValidationPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { CreateAuthDto } from './dto/create-auth.dto';
import { LocalAuthGuard } from './local-auth.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { GoogleAuthGuard } from './google-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  register(@Body() createAuthDto: CreateAuthDto) {
    return this.authService.register(createAuthDto);
  }

  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Request() req) {
    return this.authService.login(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@Request() req) {
    return req.user;
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateProfile(@Request() req, @Body('name') name: string) {
    return this.authService.updateProfile(req.user.id, name);
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleAuth() {
    // The Google strategy will handle the redirect
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleAuthRedirect(@Request() req, @Res() res: Response) {
    const { token } = await this.authService.login(req.user);
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

    res.redirect(`${frontendUrl}/auth/callback?token=${token}${returnTo}`);
  }

  @Post('magic-link')
  async sendMagicLink(
    @Body('email') email: string,
    @Body('returnTo') returnTo?: string,
  ) {
    return this.authService.sendMagicLink(email, returnTo);
  }

  @Post('otp/send')
  sendOtp(
    @Body('email') email?: string,
    @Body('phone') phone?: string,
  ) {
    return this.authService.sendOtp(email, phone);
  }

  @Post('otp/verify')
  verifyOtp(
    @Body('email') email?: string,
    @Body('code') code?: string,
    @Body('phone') phone?: string,
    @Body('name') name?: string,
  ) {
    return this.authService.verifyOtp(email, code, phone, name);
  }
}
