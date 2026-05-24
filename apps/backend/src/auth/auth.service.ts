import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { CreateAuthDto } from './dto/create-auth.dto';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new NotFoundException(
        'No account found with this email. Please check or create an account.',
      );
    }
    if (user.isActive === false || user.disabledAt) {
      throw new UnauthorizedException('This account has been disabled.');
    }
    if (user.password && (await bcrypt.compare(pass, user.password))) {
      const { password, ...result } = user;
      return result;
    }
    throw new UnauthorizedException('Incorrect password. Please try again.');
  }

  async login(user: any) {
    const payload = { email: user.email, sub: user.id };
    return {
      token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        restaurantId: user.restaurantId,
        onboardingComplete: user.onboardingComplete ?? false,
      },
    };
  }

  async validateGoogleUser(profile: any) {
    const { email, firstName, lastName } = profile;
    let user = await this.usersService.findByEmail(email);

    if (!user) {
      const generatedPassword = await bcrypt.hash(
        Math.random().toString(36).slice(-8),
        10,
      );
      user = await this.usersService.create({
        email,
        name: `${firstName} ${lastName}`,
        password: generatedPassword,
        role: 'OWNER',
      });
    }

    if (user.isActive === false || user.disabledAt) {
      throw new UnauthorizedException('This account has been disabled.');
    }

    return user;
  }

  async register(createAuthDto: CreateAuthDto) {
    const { email, password } = createAuthDto;

    const existingUser = await this.usersService.findByEmail(email);

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.usersService.create({
      email,
      password: hashedPassword,
      role: 'OWNER',
    });

    const { password: _, ...result } = user;
    const payload = { email: result.email, sub: result.id };
    return {
      token: this.jwtService.sign(payload),
      user: {
        id: result.id,
        email: result.email,
        name: result.name,
        role: result.role,
        restaurantId: result.restaurantId,
        onboardingComplete: (result as any).onboardingComplete ?? false,
      },
    };
  }

  // ── helpers ──────────────────────────────────────────────────────────
  private get twilioConfigured() {
    return !!(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_VERIFY_SERVICE_SID
    );
  }

  private twilioBasicAuth() {
    return Buffer.from(
      `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`,
    ).toString('base64');
  }

  private twilioVerifyUrl(path: string) {
    return `https://verify.twilio.com/v2/Services/${process.env.TWILIO_VERIFY_SERVICE_SID}${path}`;
  }

  private async sendTwilioOtp(phone: string): Promise<void> {
    const channel = process.env.TWILIO_CHANNEL || 'sms'; // 'sms' | 'whatsapp'
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Twilio] sending OTP → Channel=${channel} ServiceSID=${process.env.TWILIO_VERIFY_SERVICE_SID}`);
    }
    const res = await fetch(this.twilioVerifyUrl('/Verifications'), {
      method: 'POST',
      headers: {
        Authorization: `Basic ${this.twilioBasicAuth()}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: phone, Channel: channel }).toString(),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error('[Twilio] error response:', JSON.stringify(body));
      throw new HttpException(
        (body as any).message || 'Failed to send verification code.',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private async verifyTwilioOtp(phone: string, code: string): Promise<boolean> {
    const res = await fetch(this.twilioVerifyUrl('/VerificationCheck'), {
      method: 'POST',
      headers: {
        Authorization: `Basic ${this.twilioBasicAuth()}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: phone, Code: code }).toString(),
    });
    const data: any = await res.json().catch(() => ({}));
    return data.status === 'approved';
  }

  private async checkCustomersAuthFeature(restaurantId?: string): Promise<void> {
    if (!restaurantId) return;
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { tier: true },
    });
    const tier = (restaurant?.tier ?? 'FREE') as string;
    const allowed = ['PROFESSIONAL', 'ENTERPRISE'];
    if (!allowed.includes(tier)) {
      throw new ForbiddenException('Customer authentication is not available on this plan');
    }
  }

  // ── public methods ────────────────────────────────────────────────────
  async sendOtp(
    email?: string,
    phone?: string,
    restaurantId?: string,
  ): Promise<{ success: boolean; devCode?: string; channel: 'email' | 'sms' | 'whatsapp' }> {
    await this.checkCustomersAuthFeature(restaurantId);
    if (!email && !phone) {
      throw new HttpException('email or phone is required', HttpStatus.BAD_REQUEST);
    }

    // Phone-first flow via Twilio
    if (phone && !email) {
      if (!this.twilioConfigured) {
        throw new HttpException(
          'SMS/WhatsApp verification is not configured. Use email instead.',
          HttpStatus.NOT_IMPLEMENTED,
        );
      }
      await this.sendTwilioOtp(phone);
      const channel = (process.env.TWILIO_CHANNEL as any) || 'sms';
      return { success: true, channel };
    }

    // Email flow (existing)
    const recentToken = await this.prisma.verificationToken.findFirst({
      where: {
        email: email!,
        usedAt: null,
        createdAt: { gte: new Date(Date.now() - 60_000) },
      },
    });
    if (recentToken) {
      throw new HttpException(
        'Please wait before requesting another code.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.prisma.verificationToken.deleteMany({
      where: { email: email!, usedAt: null },
    });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedCode = await bcrypt.hash(code, 10);

    await this.prisma.verificationToken.create({
      data: {
        email: email!,
        code: hashedCode,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const isDev = process.env.NODE_ENV !== 'production';

    if (!isDev) {
      if (!process.env.RESEND_API_KEY) {
        throw new HttpException(
          'Email delivery not configured.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL || 'noreply@yourdomain.com',
          to: [email!],
          subject: 'Your verification code',
          text: `Your verification code: ${code}\n\nExpires in 10 minutes.`,
          html: `<p style="font-family:sans-serif;font-size:16px;">Your verification code:</p><p style="font-family:monospace;font-size:32px;font-weight:bold;letter-spacing:8px;">${code}</p><p style="font-family:sans-serif;color:#666;">Expires in 10 minutes. If you did not request this, ignore this email.</p>`,
        }),
      });
    } else {
      if (process.env.NODE_ENV !== 'production') {
        this.logger.log(`OTP for ${email}: ${code}`);
      }
    }

    return { success: true, ...(isDev ? { devCode: code } : {}), channel: 'email' };
  }

  async setPin(userId: string, pin: string) {
    const pinHash = await bcrypt.hash(pin, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { pinHash, pinAttempts: 0, pinLockedUntil: null },
    });
    return { success: true };
  }

  async pinLogin(restaurantId: string, pin: string) {
    const staffRoles: string[] = ['OWNER', 'MANAGER', 'WAITER', 'KITCHEN', 'STAFF'];
    const MAX_ATTEMPTS = 5;
    const LOCKOUT_MINUTES = 15;

    const candidates = await this.prisma.user.findMany({
      where: {
        role: { in: staffRoles as any },
        restaurantId,
        pinHash: { not: null },
      },
    });

    if (candidates.length === 0) {
      throw new UnauthorizedException('No staff members found for this restaurant.');
    }

    // Check global lockout — all staff share the same device, so any lockout blocks everyone
    const lockedUser = candidates.find(
      (u) => u.pinLockedUntil && new Date(u.pinLockedUntil) > new Date(),
    );
    if (lockedUser) {
      const minutes = Math.ceil(
        (new Date(lockedUser.pinLockedUntil!).getTime() - Date.now()) / 60000,
      );
      throw new HttpException(
        `Too many attempts. Try again in ${minutes} minute${minutes !== 1 ? 's' : ''}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Try matching PIN against any staff user
    for (const user of candidates) {
      const valid = await bcrypt.compare(pin, user.pinHash!);
      if (!valid) continue;

      if (user.isActive === false || user.disabledAt) {
        throw new UnauthorizedException('This account has been disabled.');
      }

      // Successful login — reset attempts for all restaurant staff
      await this.prisma.user.updateMany({
        where: { restaurantId, pinHash: { not: null } },
        data: { pinAttempts: 0, pinLockedUntil: null },
      });

      const payload = { email: user.email, sub: user.id };
      return {
        token: this.jwtService.sign(payload),
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          restaurantId: user.restaurantId,
        },
      };
    }

    // Failed attempt — increment counter across all restaurant staff.
    // Shared-device context: PIN attempts are tracked restaurant-wide, not per-user.
    // Max current attempts is the source of truth (candidates are unordered).
    const currentAttempts = Math.max(...candidates.map((u) => u.pinAttempts ?? 0));
    const attempts = currentAttempts + 1;

    await this.prisma.user.updateMany({
      where: { restaurantId, pinHash: { not: null } },
      data: {
        pinAttempts: attempts,
        ...(attempts >= MAX_ATTEMPTS
          ? { pinLockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) }
          : {}),
      },
    });

    const remaining = MAX_ATTEMPTS - attempts;
    if (remaining > 0) {
      throw new UnauthorizedException(
        `Invalid PIN. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
      );
    }
    throw new HttpException(
      `Too many attempts. Try again in ${LOCKOUT_MINUTES} minutes.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  async updateOnboardingStep(userId: string, step: string) {
    const isDone = step === 'done';
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        onboardingStep: isDone ? null : step,
        ...(isDone ? { onboardingComplete: true } : {}),
      },
    });
    return { success: true };
  }

  async updateProfile(userId: string, name: string) {
    const trimmed = name?.trim() || null;
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { name: trimmed },
    });
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  async verifyOtp(
    email?: string,
    code?: string,
    phone?: string,
    name?: string,
    restaurantId?: string,
  ): Promise<{ token: string; user: any; isNew: boolean }> {
    await this.checkCustomersAuthFeature(restaurantId);
    if (!code) throw new HttpException('code is required', HttpStatus.BAD_REQUEST);

    const cleanName = name?.trim() || undefined;
    let user: any;
    let isNew = false;

    // Phone-first flow
    if (phone && !email) {
      if (!this.twilioConfigured) {
        throw new HttpException('SMS verification not configured.', HttpStatus.NOT_IMPLEMENTED);
      }
      const approved = await this.verifyTwilioOtp(phone, code);
      if (!approved) throw new UnauthorizedException('Invalid or expired code.');

      user = await this.usersService.findByPhone(phone);
      isNew = !user;
      if (!user) {
        const placeholderEmail = `phone-${phone.replace(/\D/g, '')}@phone.local`;
        const password = await bcrypt.hash(Math.random().toString(36).slice(-12), 10);
        user = await this.usersService.create({
          email: placeholderEmail,
          password,
          role: 'CUSTOMER' as any,
          phone,
          ...(cleanName ? { name: cleanName } : {}),
        });
      } else if (cleanName && !user.name) {
        user = await this.prisma.user.update({ where: { id: user.id }, data: { name: cleanName } });
      }
    } else {
      // Email flow
      if (!email) throw new HttpException('email is required', HttpStatus.BAD_REQUEST);

      const tokenRecord = await this.prisma.verificationToken.findFirst({
        where: { email, usedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      });
      if (!tokenRecord) throw new UnauthorizedException('Invalid or expired code.');

      if ((tokenRecord as any).lockedUntil && new Date((tokenRecord as any).lockedUntil) > new Date()) {
        throw new HttpException(
          'Too many attempts. Please try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const valid = await bcrypt.compare(code, tokenRecord.code);
      if (!valid) {
        const attempts = ((tokenRecord as any).attempts || 0) + 1;
        const MAX_ATTEMPTS = 5;
        const LOCKOUT_MINUTES = 10;
        await this.prisma.verificationToken.update({
          where: { id: tokenRecord.id },
          data: {
            attempts,
            ...(attempts >= MAX_ATTEMPTS
              ? { lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) }
              : {}),
          },
        });
        throw new UnauthorizedException('Invalid or expired code.');
      }

      await this.prisma.verificationToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: new Date(), attempts: 0 },
      });

      user = await this.usersService.findByEmail(email);
      isNew = !user;
      if (!user) {
        const password = await bcrypt.hash(Math.random().toString(36).slice(-12), 10);
        user = await this.usersService.create({
          email,
          password,
          role: 'CUSTOMER' as any,
          ...(phone ? { phone } : {}),
          ...(cleanName ? { name: cleanName } : {}),
        });
      } else {
        const updates: any = {};
        if (phone && !(user as any).phone) updates.phone = phone;
        if (cleanName && !user.name) updates.name = cleanName;
        if (Object.keys(updates).length) {
          user = await this.prisma.user.update({ where: { id: user.id }, data: updates });
        }
      }
    }

    const payload = { email: user.email, sub: user.id };
    return {
      token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        restaurantId: user.restaurantId,
      },
      isNew,
    };
  }
}
