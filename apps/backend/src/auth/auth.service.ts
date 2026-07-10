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
import { randomInt, randomBytes, createHash } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { isPinRole, PIN_LOGIN_ROLES } from '../users/staff-roles';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureService } from '../subscription/feature.service';
import { FeatureFlag } from '../subscription/feature-flag.enum';
import {
  smsProvider,
  smsGatewayConfigured,
  sendViaSmsGateway,
} from '../common/sms/sms-gateway';

const STAFF_DEVICE_LIMIT = 3;

type PinLoginMeta = {
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly featureService: FeatureService,
  ) {}

  private normalizeEmail(email: string) {
    return email.toLowerCase().trim();
  }

  private normalizePhone(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      cleaned = '1' + cleaned;
    }
    return '+' + cleaned;
  }

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    // Generic message for both unknown-email and wrong-password so the
    // endpoint cannot be used to enumerate which emails are registered (#M3).
    const INVALID = 'Invalid email or password.';
    if (!user) {
      throw new UnauthorizedException(INVALID);
    }
    if (user.isActive === false || user.disabledAt) {
      throw new UnauthorizedException('This account has been disabled.');
    }
    if (isPinRole(user.role)) {
      throw new UnauthorizedException(INVALID);
    }
    if (user.password && (await bcrypt.compare(pass, user.password))) {
      const { password, ...result } = user;
      return result;
    }
    throw new UnauthorizedException(INVALID);
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
    const { googleId, email, firstName, lastName, emailVerified } = profile;

    // 1. Find by stable Google ID first (safest — immune to email changes).
    // A prior successful login already bound this Google identity, so the
    // email-verification gate below does not apply to this path.
    if (googleId) {
      const byGoogleId = await this.prisma.user.findUnique({
        where: { googleId },
      });
      if (byGoogleId) {
        if (byGoogleId.isActive === false || byGoogleId.disabledAt) {
          throw new UnauthorizedException('This account has been disabled.');
        }
        return byGoogleId;
      }
    }

    // M-AUTH-2: everything below trusts the Google-supplied email to either
    // link to an existing local account or create a new one. Google may return
    // an unverified email (`email_verified: false`), and passport maps it to
    // `emailVerified`. Refuse to trust an unverified/absent email as an
    // identity — otherwise a Google account holding a false claim to a
    // victim's address could take over that account.
    if (emailVerified !== true) {
      throw new UnauthorizedException(
        'Your Google account email is not verified. Please verify it with Google and try again.',
      );
    }

    // 2. Find by email — link the googleId to this existing account
    const byEmail = await this.usersService.findByEmail(email);
    if (byEmail) {
      if (byEmail.isActive === false || byEmail.disabledAt) {
        throw new UnauthorizedException('This account has been disabled.');
      }
      // Issue 40b: When a Google identity is linked to an existing
      // email+password account, invalidate the stored password so the old
      // credential can no longer be used to access the account. Google becomes
      // the sole auth provider for this account from this point forward.
      // The `password` column is non-nullable (schema constraint), so we replace
      // it with a random bcrypt hash that can never be guessed or reverse-engineered.
      if (googleId && !byEmail.googleId) {
        const invalidatedPassword = await bcrypt.hash(
          randomBytes(32).toString('hex'),
          10,
        );
        await this.prisma.user.update({
          where: { id: byEmail.id },
          data: {
            googleId,
            password: invalidatedPassword,
            passwordChangedAt: new Date(),
          },
        });
      }
      return byEmail;
    }

    // 3. Brand new user — create with a random password (Google is the auth provider)
    const generatedPassword = await bcrypt.hash(
      randomBytes(24).toString('hex'),
      10,
    );
    const newUser = await this.usersService.create({
      email,
      name: `${firstName ?? ''} ${lastName ?? ''}`.trim() || undefined,
      password: generatedPassword,
      role: 'OWNER',
    });

    // Link googleId immediately
    if (googleId) {
      await this.prisma.user.update({
        where: { id: newUser.id },
        data: { googleId },
      });
    }

    return newUser;
  }

  async register(createAuthDto: CreateAuthDto) {
    const { email } = createAuthDto;
    const normalizedEmail = this.normalizeEmail(email);

    const existingUser = await this.usersService.findByEmail(normalizedEmail);

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const issued = await this.issueEmailVerificationCode(
      normalizedEmail,
      'Verify your QR Menu account',
    );

    return {
      success: true,
      requiresVerification: true,
      email: normalizedEmail,
      ...issued,
    };
  }

  async verifyRegistration(createAuthDto: CreateAuthDto & { code: string }) {
    const { email, password, code } = createAuthDto;
    const normalizedEmail = this.normalizeEmail(email);

    const existingUser = await this.usersService.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    await this.consumeEmailVerificationCode(normalizedEmail, code);

    const hashedPassword = await bcrypt.hash(password, 10);

    let user: Awaited<ReturnType<typeof this.usersService.create>>;
    try {
      user = await this.usersService.create({
        email: normalizedEmail,
        password: hashedPassword,
        role: 'OWNER',
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        // Concurrent registration with the same email won the race between
        // our findByEmail check above and this insert.
        throw new ConflictException('User with this email already exists');
      }
      throw err;
    }

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
      this.logger.log(
        `[Twilio] sending OTP → Channel=${channel} ServiceSID=${process.env.TWILIO_VERIFY_SERVICE_SID}`,
      );
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
      this.logger.error('[Twilio] error response:', JSON.stringify(body));
      // Twilio 4xx (e.g. invalid 'To' number) is a client error, not a gateway
      // failure; only 5xx / network should be 502 (#9). Use a generic message
      // rather than leaking Twilio's raw error text to the client.
      if (res.status >= 400 && res.status < 500) {
        throw new HttpException(
          'Could not send a code to that phone number. Please check it is correct.',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      throw new HttpException(
        'SMS service temporarily unavailable. Please try again shortly.',
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

  private async checkCustomersAuthFeature(
    restaurantId?: string,
  ): Promise<void> {
    if (!restaurantId) return;
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { tier: true, forceTier: true, isActive: true },
    });
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }
    if (restaurant.isActive === false) {
      throw new ForbiddenException('This restaurant has been suspended');
    }
    if (
      !this.featureService.restaurantHasFeature(
        restaurant,
        FeatureFlag.CUSTOMERS_AUTH,
      )
    ) {
      throw new ForbiddenException(
        'Customer authentication is not available on this plan',
      );
    }
  }

  private hashDeviceToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async recordPinLoginAudit(data: {
    userId?: string;
    deviceTokenId: string;
    restaurantId: string;
    status: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    await this.prisma.staffPinLoginAudit.create({ data });
  }

  private async recordSuccessfulStaffDeviceLogin(
    user: { id: string },
    restaurantId: string,
    deviceTokenId: string,
    meta: PinLoginMeta,
  ) {
    const bindingKey = {
      userId_deviceTokenId: { userId: user.id, deviceTokenId },
    };
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM "app_user"
        WHERE id = ${user.id}
        FOR UPDATE
      `;

      const existingBinding = await tx.staffDeviceBinding.findUnique({
        where: bindingKey,
        select: { id: true },
      });

      if (!existingBinding) {
        const activeDeviceCount = await tx.staffDeviceBinding.count({
          where: {
            userId: user.id,
            restaurantId,
            deviceToken: {
              usedAt: { not: null },
              revokedAt: null,
            },
          },
        });

        if (activeDeviceCount >= STAFF_DEVICE_LIMIT) {
          await tx.staffPinLoginAudit.create({
            data: {
              userId: user.id,
              deviceTokenId,
              restaurantId,
              status: 'DENIED_DEVICE_LIMIT',
              ...meta,
            },
          });
          return { deniedDeviceLimit: true };
        }
      }

      await tx.deviceEnrollmentToken.update({
        where: { id: deviceTokenId },
        data: { pinAttempts: 0, pinLockedUntil: null },
      });
      if (existingBinding) {
        await tx.staffDeviceBinding.update({
          where: bindingKey,
          data: { lastSeenAt: now },
        });
      } else {
        await tx.staffDeviceBinding.create({
          data: {
            userId: user.id,
            deviceTokenId,
            restaurantId,
            lastSeenAt: now,
          },
        });
      }
      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginDeviceTokenId: deviceTokenId },
      });
      await tx.staffPinLoginAudit.create({
        data: {
          userId: user.id,
          deviceTokenId,
          restaurantId,
          status: 'SUCCESS',
          ...meta,
        },
      });
      return { deniedDeviceLimit: false };
    });

    if (result.deniedDeviceLimit) {
      throw new ForbiddenException({
        code: 'STAFF_DEVICE_LIMIT_REACHED',
        message: `This staff member is already linked to ${STAFF_DEVICE_LIMIT} devices. Ask a manager to revoke an old device before logging in here.`,
      });
    }
  }

  private async issueEmailVerificationCode(
    email: string,
    subject = 'Your verification code',
  ): Promise<{ devCode?: string }> {
    const normalizedEmail = this.normalizeEmail(email);
    const recentToken = await this.prisma.verificationToken.findFirst({
      where: {
        email: normalizedEmail,
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
      where: { email: normalizedEmail, usedAt: null },
    });

    // OTP is an auth factor - use a CSPRNG, not Math.random.
    const code = randomInt(100000, 1000000).toString();
    const hashedCode = await bcrypt.hash(code, 10);

    await this.prisma.verificationToken.create({
      data: {
        email: normalizedEmail,
        code: hashedCode,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const isDev = process.env.NODE_ENV !== 'production';
    try {
      if (!isDev) {
        if (!process.env.RESEND_API_KEY) {
          throw new HttpException(
            'Email delivery not configured.',
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL || 'noreply@yourdomain.com',
            to: [normalizedEmail],
            subject,
            text: `Your verification code: ${code}\n\nExpires in 10 minutes.`,
            html: `<p style="font-family:sans-serif;font-size:16px;">Your verification code:</p><p style="font-family:monospace;font-size:32px;font-weight:bold;letter-spacing:8px;">${code}</p><p style="font-family:sans-serif;color:#666;">Expires in 10 minutes. If you did not request this, ignore this email.</p>`,
          }),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          this.logger.error(
            `Resend send failed (${res.status}) for ${normalizedEmail}: ${detail.slice(0, 300)}`,
          );
          // Resend returns 4xx for a bad/undeliverable recipient — that's a
          // client error (the email is wrong), not a gateway failure. Surface
          // it as 4xx so a typo'd address gets a clear message; reserve 502 for
          // a genuine Resend outage / 5xx / network error (#9).
          if (res.status >= 400 && res.status < 500) {
            throw new HttpException(
              'We could not send a verification code to that email address. Please check it is correct.',
              HttpStatus.UNPROCESSABLE_ENTITY,
            );
          }
          throw new HttpException(
            'Email service temporarily unavailable. Please try again shortly.',
            HttpStatus.BAD_GATEWAY,
          );
        }
      } else {
        this.logger.log(`OTP for ${normalizedEmail}: ${code}`);
      }
    } catch (error) {
      await this.prisma.verificationToken.deleteMany({
        where: { email: normalizedEmail, code: hashedCode, usedAt: null },
      });
      throw error;
    }

    return isDev ? { devCode: code } : {};
  }

  private async consumeEmailVerificationCode(
    email: string,
    code: string,
  ): Promise<void> {
    await this.consumeCodeForIdentifier(this.normalizeEmail(email), code);
  }

  /**
   * Shared OTP verification for both email and phone. The `identifier` is the
   * value stored in VerificationToken.email — a normalized email for the email
   * flow, or the raw E.164 phone for the SIM-gateway phone flow. Enforces
   * single-use, expiry, and attempt-count lockout.
   */
  private async consumeCodeForIdentifier(
    identifier: string,
    code: string,
  ): Promise<void> {
    const tokenRecord = await this.prisma.verificationToken.findFirst({
      where: {
        email: identifier,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!tokenRecord) {
      throw new UnauthorizedException('Invalid or expired code.');
    }

    if (
      (tokenRecord as any).lockedUntil &&
      new Date((tokenRecord as any).lockedUntil) > new Date()
    ) {
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
            ? {
                lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000),
              }
            : {}),
        },
      });
      throw new UnauthorizedException('Invalid or expired code.');
    }

    await this.prisma.verificationToken.update({
      where: { id: tokenRecord.id },
      data: { usedAt: new Date(), attempts: 0 },
    });
  }

  // ── public methods ────────────────────────────────────────────────────
  async sendOtp(
    email?: string,
    phone?: string,
    restaurantId?: string,
  ): Promise<{
    success: boolean;
    devCode?: string;
    channel: 'email' | 'sms' | 'whatsapp';
  }> {
    await this.checkCustomersAuthFeature(restaurantId);
    if (!email && !phone) {
      throw new HttpException(
        'email or phone is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Phone-first flow. Two providers, chosen by SMS_PROVIDER:
    //  - 'twilio'      → Twilio Verify generates AND checks the code.
    //  - 'smsgateway'  → we generate the code, send it through the SIM gateway,
    //                    and verify it against our own DB (like the email flow).
    if (phone && !email) {
      phone = this.normalizePhone(phone);
      const usingGateway = smsProvider() === 'smsgateway';
      if (usingGateway ? !smsGatewayConfigured() : !this.twilioConfigured) {
        throw new HttpException(
          'SMS/WhatsApp verification is not configured. Use email instead.',
          HttpStatus.NOT_IMPLEMENTED,
        );
      }

      // Issue 42: per-phone 60s cooldown via VerificationToken (phone stored as
      // `email` field since there is no separate `identifier` column).
      const recentPhoneToken = await this.prisma.verificationToken.findFirst({
        where: {
          email: phone,
          usedAt: null,
          createdAt: { gte: new Date(Date.now() - 60_000) },
        },
      });
      if (recentPhoneToken) {
        throw new HttpException(
          'Please wait before requesting another code.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      if (usingGateway) {
        // OTP is an auth factor — use a CSPRNG, not Math.random.
        const code = randomInt(100000, 1000000).toString();
        const hashedCode = await bcrypt.hash(code, 10);
        const isDev = process.env.NODE_ENV !== 'production';
        const shouldSend = !isDev || process.env.SMS_FORCE_SEND === 'true';
        if (shouldSend) {
          // Send first; only persist the (hashed) code once the SIM gateway
          // accepts it, so a failed send doesn't lock the user out for 60s.
          const result = await sendViaSmsGateway(
            phone,
            `${code} is your verification code. It expires in 10 minutes.`,
            { ttlSeconds: 10 * 60 },
          );
          if (!result.ok) {
            this.logger.error(
              `SMS gateway OTP send failed (${result.status}): ${result.detail.slice(0, 200)}`,
            );
            const isClientError = result.status >= 400 && result.status < 500;
            throw new HttpException(
              isClientError
                ? 'Could not send a code to that phone number. Please check it is correct.'
                : 'SMS service temporarily unavailable. Please try again shortly.',
              isClientError
                ? HttpStatus.UNPROCESSABLE_ENTITY
                : HttpStatus.BAD_GATEWAY,
            );
          }
        } else {
          this.logger.log(`[dev] SMS OTP: ${code}`);
        }
        await this.prisma.verificationToken.create({
          data: {
            email: phone,
            code: hashedCode,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          },
        });
        return {
          success: true,
          channel: 'sms',
          ...(isDev ? { devCode: code } : {}),
        };
      }

      // Twilio Verify: send first — only record the sentinel if Twilio succeeds.
      // Creating the sentinel before the send would lock the user out for 60s
      // even when the OTP was never delivered.
      await this.sendTwilioOtp(phone);
      await this.prisma.verificationToken.create({
        data: {
          email: phone,
          code: randomBytes(8).toString('hex'),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
      });
      const channel = (process.env.TWILIO_CHANNEL as any) || 'sms';
      return { success: true, channel };
    }

    // Email flow (existing)
    const issued = await this.issueEmailVerificationCode(email!);

    return {
      success: true,
      ...issued,
      channel: 'email',
    };

    // OTP is an auth factor — must use a CSPRNG, not Math.random (#9).
  }

  async pinLogin(
    restaurantId: string,
    pin: string,
    deviceToken: string,
    meta: PinLoginMeta = {},
  ) {
    // Only device/floor roles authenticate by PIN. Dashboard roles
    // (OWNER/MANAGER/STAFF) are excluded so a 4-digit PIN can never mint a JWT
    // for a privileged dashboard account. Source of truth: users/staff-roles.ts.
    const staffRoles: string[] = [...PIN_LOGIN_ROLES];
    const MAX_ATTEMPTS = 5;
    const LOCKOUT_MINUTES = 15;

    // H2.2 — Gate pinLogin on POS tier before device check.
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        tier: true,
        forceTier: true,
        isActive: true,
        sharedDeviceModeEnabled: true,
      },
    });
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }
    if (
      !this.featureService.restaurantHasFeature(restaurant, FeatureFlag.POS)
    ) {
      throw new ForbiddenException('POS is not available on this plan.');
    }
    // M2.2 — Suspended restaurants cannot use the POS.
    if (restaurant.isActive === false) {
      throw new ForbiddenException({
        code: 'RESTAURANT_SUSPENDED',
        message: 'This restaurant has been suspended',
      });
    }
    if (restaurant.sharedDeviceModeEnabled === false) {
      throw new ForbiddenException({
        code: 'SHARED_DEVICE_MODE_DISABLED',
        message:
          'Shared Device Mode is off. Ask a manager to enable it before staff PIN login.',
      });
    }

    // M2.1 — Per-device lockout: attempts tracked on the enrolled token itself so
    // a bad actor on one device cannot lock all devices for the restaurant.
    const deviceTokenHash = this.hashDeviceToken(deviceToken);
    const enrolledDevice = await this.prisma.deviceEnrollmentToken.findFirst({
      where: {
        restaurantId,
        tokenHash: deviceTokenHash,
        usedAt: { not: null },
        revokedAt: null,
      },
      select: {
        id: true,
        pinAttempts: true,
        pinLockedUntil: true,
        sessionVersion: true,
      },
    });

    if (!enrolledDevice) {
      throw new UnauthorizedException(
        'This device is not enrolled for staff PIN login.',
      );
    }

    if (
      enrolledDevice.pinLockedUntil &&
      enrolledDevice.pinLockedUntil > new Date()
    ) {
      const minutes = Math.ceil(
        (enrolledDevice.pinLockedUntil.getTime() - Date.now()) / 60000,
      );
      throw new HttpException(
        {
          message: `Too many attempts. Try again in ${minutes} minute${minutes !== 1 ? 's' : ''}.`,
          attemptsRemaining: 0,
          lockedUntil: enrolledDevice.pinLockedUntil.toISOString(),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const candidates = await this.prisma.user.findMany({
      where: {
        role: { in: staffRoles as any },
        restaurantId,
        pinHash: { not: null },
        isActive: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (candidates.length === 0) {
      // Generic message — do not reveal whether a restaurant has staff (#M3).
      throw new UnauthorizedException('Invalid PIN.');
    }

    // Try matching PIN against any staff user
    for (const user of candidates) {
      const valid = await bcrypt.compare(pin, user.pinHash!);
      if (!valid) continue;

      if (user.disabledAt) {
        // Generic message — a distinct "disabled" error after a correct PIN
        // match would let an attacker confirm a valid PIN via enumeration.
        continue;
      }

      await this.recordSuccessfulStaffDeviceLogin(
        user,
        restaurantId,
        enrolledDevice.id,
        meta,
      );

      const payload = {
        email: user.email,
        sub: user.id,
        deviceTokenId: enrolledDevice.id,
        deviceSessionVersion: enrolledDevice.sessionVersion ?? 0,
      };
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

    // Failed attempt — increment per-device counter atomically.
    const updatedDevice = await this.prisma.deviceEnrollmentToken.update({
      where: { id: enrolledDevice.id },
      data: { pinAttempts: { increment: 1 } },
    });
    const attempts = updatedDevice.pinAttempts;

    let lockedUntil = enrolledDevice.pinLockedUntil;
    if (attempts >= MAX_ATTEMPTS && !lockedUntil) {
      lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
      await this.prisma.deviceEnrollmentToken.update({
        where: { id: enrolledDevice.id },
        data: { pinLockedUntil: lockedUntil },
      });
    }

    await this.recordPinLoginAudit({
      deviceTokenId: enrolledDevice.id,
      restaurantId,
      status: attempts >= MAX_ATTEMPTS ? 'LOCKED' : 'INVALID_PIN',
      ...meta,
    });

    const remaining = MAX_ATTEMPTS - attempts;
    if (remaining > 0) {
      throw new UnauthorizedException({
        message: `Invalid PIN. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
        attemptsRemaining: remaining,
      });
    }
    throw new HttpException(
      {
        message: `Too many attempts. Try again in ${LOCKOUT_MINUTES} minutes.`,
        attemptsRemaining: 0,
        lockedUntil: lockedUntil?.toISOString(),
      },
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

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true, isActive: true, disabledAt: true },
    });

    if (!user) throw new NotFoundException('User not found');
    if (user.isActive === false || user.disabledAt) {
      throw new UnauthorizedException('This account has been disabled.');
    }
    if (
      !user.password ||
      !(await bcrypt.compare(currentPassword, user.password))
    ) {
      throw new UnauthorizedException('Current password is incorrect.');
    }
    if (await bcrypt.compare(newPassword, user.password)) {
      throw new HttpException(
        'New password must be different from the current password.',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: await bcrypt.hash(newPassword, 10),
        passwordChangedAt: new Date(),
      },
    });

    return { success: true };
  }

  async verifyOtp(
    email?: string,
    code?: string,
    phone?: string,
    name?: string,
    restaurantId?: string,
  ): Promise<{ token: string; user: any; isNew: boolean }> {
    await this.checkCustomersAuthFeature(restaurantId);
    if (!code)
      throw new HttpException('code is required', HttpStatus.BAD_REQUEST);

    const cleanName = name?.trim() || undefined;
    let user: any;
    let isNew = false;

    // Phone-first flow — verify against whichever provider issued the code.
    if (phone && !email) {
      if (smsProvider() === 'smsgateway') {
        // We issued the code ourselves; verify it from our DB (throws on
        // invalid/expired/locked). Mirrors the email flow.
        await this.consumeCodeForIdentifier(phone, code);
      } else {
        if (!this.twilioConfigured) {
          throw new HttpException(
            'SMS verification not configured.',
            HttpStatus.NOT_IMPLEMENTED,
          );
        }
        const approved = await this.verifyTwilioOtp(phone, code);
        if (!approved)
          throw new UnauthorizedException('Invalid or expired code.');
      }

      user = await this.usersService.findByPhone(phone);
      isNew = !user;
      if (!user) {
        const placeholderEmail = `phone-${phone.replace(/\D/g, '')}@phone.local`;
        const password = await bcrypt.hash(randomBytes(24).toString('hex'), 10);
        user = await this.usersService.create({
          email: placeholderEmail,
          password,
          role: 'CUSTOMER',
          phone,
          ...(cleanName ? { name: cleanName } : {}),
        });
      } else if (isPinRole(user.role)) {
        throw new UnauthorizedException('Invalid or expired code.');
      } else if (user.isActive === false || user.disabledAt) {
        throw new UnauthorizedException('This account has been disabled.');
      } else if (cleanName && !user.name) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { name: cleanName },
        });
      }
    } else {
      // Email flow
      if (!email)
        throw new HttpException('email is required', HttpStatus.BAD_REQUEST);

      // M-AUTH-1: single source of truth for OTP validation, attempt-count
      // lockout, and single-use consumption. This used to re-implement
      // consumeEmailVerificationCode inline (drift risk), and it queried the
      // raw `email` rather than the normalized form — so a differently-cased
      // address could fail to match its own freshly-issued token. The helper
      // normalizes, matching how issueEmailVerificationCode stores it.
      await this.consumeEmailVerificationCode(email, code);

      user = await this.usersService.findByEmail(email);
      isNew = !user;
      if (!user) {
        const password = await bcrypt.hash(randomBytes(24).toString('hex'), 10);
        user = await this.usersService.create({
          email,
          password,
          role: 'CUSTOMER',
          ...(cleanName ? { name: cleanName } : {}),
        });
      } else if (isPinRole(user.role)) {
        throw new UnauthorizedException('Invalid or expired code.');
      } else if (user.isActive === false || user.disabledAt) {
        throw new UnauthorizedException('This account has been disabled.');
      } else {
        const updates: any = {};
        if (cleanName && !user.name) updates.name = cleanName;
        if (Object.keys(updates).length) {
          user = await this.prisma.user.update({
            where: { id: user.id },
            data: updates,
          });
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

  async exchangeImpersonation(code: string) {
    if (!code || typeof code !== 'string')
      throw new UnauthorizedException('Missing exchange code.');

    const session = await this.prisma.impersonationSession.findUnique({
      where: { exchangeCode: code },
      include: { target: true },
    });

    if (!session || session.usedAt || session.revokedAt)
      throw new UnauthorizedException('Invalid or already-used exchange code.');

    if (new Date() > session.expiresAt)
      throw new UnauthorizedException('Exchange code expired.');

    // Atomic guarded consume: exchangeCode is unique, so only one concurrent
    // caller can match this predicate before it gets nulled out. The loser
    // sees count !== 1 and is rejected, preventing double JWT issuance.
    const consumed = await this.prisma.impersonationSession.updateMany({
      where: {
        exchangeCode: code,
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date(), exchangeCode: null },
    });

    if (consumed.count !== 1) {
      throw new UnauthorizedException('Invalid or already-used exchange code.');
    }

    const user = session.target;
    const payload = {
      email: user.email,
      sub: user.id,
      isImpersonation: true,
      impersonationSessionId: session.id,
    };

    return {
      token: this.jwtService.sign(payload, { expiresIn: '1h' }),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        restaurantId: user.restaurantId,
        isImpersonation: true,
      },
    };
  }

  async exitImpersonation(jwtUser: {
    id: string;
    impersonationSessionId?: string;
  }) {
    if (jwtUser.impersonationSessionId) {
      await this.prisma.impersonationSession.updateMany({
        where: { id: jwtUser.impersonationSessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }
}
