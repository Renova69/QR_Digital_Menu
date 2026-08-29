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
import { withoutRequestBudget } from '../common/http/request-budget';
import * as bcrypt from 'bcryptjs';
import { randomInt, randomBytes, createHash, randomUUID } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { isPinRole, PIN_LOGIN_ROLES } from '../users/staff-roles';
import { buildPhonePlaceholderEmail } from './phone-placeholder';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { PinSecurityService } from './pin-security.service';
import { FeatureService } from '../subscription/feature.service';
import { FeatureFlag } from '../subscription/feature-flag.enum';
import {
  smsProvider,
  smsGatewayConfigured,
  sendViaSmsGateway,
} from '../common/sms/sms-gateway';
import { AuthErrorCode } from '../common/errors/auth-error-codes';
import { fetchWithDependencyPool } from '../common/http/dependency-http';
import { isPinLoginAllowed } from './pin-login-hours';

const STAFF_DEVICE_LIMIT = 3;

// P1-3: these three calls sit on the interactive login path and had no
// deadline at all, so undici's 300s default applied — a hung Twilio or Resend
// would hold a Cloud Run request slot for five minutes while the user stared
// at a spinner, and with 80 slots per instance and only three instances, a
// provider outage was a straightforward path to exhausting the whole service.
// Ten seconds is far longer than either provider's normal response and short
// enough to fail visibly.
const AUTH_PROVIDER_TIMEOUT_MS = 10_000;

// P1-2: password-login lockout. Deliberately more generous than the PIN
// lockout (5 attempts / 15 min) on the first strike — a password is long
// enough that a handful of typos is ordinary, whereas a 4-digit PIN has a
// 10,000-candidate keyspace and needs a tighter leash. The doubling below is
// what makes a sustained attack pointless.
// A device-bound PIN session runs on a tablet that stays in the restaurant
// overnight, is shared between staff, and is unlocked by four digits. The
// module default of one day means a token minted at opening is still valid at
// opening the next morning -- so the tablet is a working credential all night,
// which is exactly when nobody is watching it.
//
// 12h, not 8h: a trading day is roughly 11:00-23:00, and an 8h session would
// expire in the middle of dinner service. 12h covers the day and dies at close,
// which is the window that actually matters.
//
// Deliberately not applied to dashboard logins: those are a person on a machine
// they control, and shortening them only trains people to re-authenticate.
const DASHBOARD_SESSION_TTL_SECONDS = 24 * 60 * 60;
const STAFF_DEVICE_SESSION_TTL_SECONDS = 12 * 60 * 60;
const IMPERSONATION_SESSION_TTL_SECONDS = 60 * 60;

// How long a device stays trusted to accept a 4-digit PIN after enrolment.
// Separate from the enrolment link's own short TTL, and from the session TTL
// above -- this is the trust that lets a PIN be sufficient at all.
//
// Checked at PIN login only. A lapse must never interrupt a shift already in
// progress, so it is never enforced mid-session.
export const DEVICE_TRUST_DAYS = 180;

const LOGIN_ATTEMPT_LIMIT = 8;
const LOGIN_LOCKOUT_BASE_MS = 5 * 60 * 1000;
const LOGIN_LOCKOUT_MAX_MS = 60 * 60 * 1000;

export type AuthSessionMetadata = {
  ipAddress?: string;
  userAgent?: string;
};

type AuthMethod = 'PASSWORD' | 'GOOGLE' | 'OTP' | 'PIN' | 'IMPERSONATION';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly featureService: FeatureService,
    private readonly events: EventsGateway,
    private readonly pinSecurity: PinSecurityService,
  ) {}

  private normalizeEmail(email: string) {
    return email.toLowerCase().trim();
  }

  /**
   * Mint a JWT and persist its independently revocable server-side identity.
   * Only bounded descriptive metadata is stored; the raw JWT and every
   * credential used to obtain it remain outside the database.
   */
  private async issueSessionToken(
    user: { id: string; email: string; sessionVersion?: number | null },
    authMethod: AuthMethod,
    meta: AuthSessionMetadata = {},
    extraClaims: Record<string, unknown> = {},
    ttlSeconds = DASHBOARD_SESSION_TTL_SECONDS,
  ): Promise<string> {
    const sessionId = randomUUID();
    const sessionVersion = user.sessionVersion ?? 0;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const token = this.jwtService.sign(
      {
        ...extraClaims,
        email: user.email,
        sub: user.id,
        sessionId,
        sessionVersion,
      },
      { expiresIn: ttlSeconds },
    );

    await this.prisma.userSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        sessionVersion,
        authMethod,
        deviceTokenId:
          typeof extraClaims.deviceTokenId === 'string'
            ? extraClaims.deviceTokenId
            : null,
        ipAddress: meta.ipAddress?.slice(0, 128) || null,
        userAgent: meta.userAgent?.slice(0, 512) || null,
        expiresAt,
      },
    });

    return token;
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
    const INVALID = {
      code: AuthErrorCode.INVALID_CREDENTIALS,
      message: 'Invalid email or password.',
    };
    if (!user) {
      throw new UnauthorizedException(INVALID);
    }
    if (user.isActive === false || user.disabledAt) {
      throw new UnauthorizedException({
        code: AuthErrorCode.ACCOUNT_DISABLED,
        message: 'This account has been disabled.',
      });
    }
    if (isPinRole(user.role)) {
      throw new UnauthorizedException(INVALID);
    }

    // P1-2: per-account lockout, mirroring the PIN lockout. Throttling cannot
    // carry this alone — an anonymous caller is keyed by address, and
    // X-Forwarded-For is caller-controlled on the direct Cloud Run origin, so
    // an attacker rotating the header has an unlimited budget. A counter
    // scoped to the account cannot be rotated away.
    const lockedUntil = user.loginLockedUntil;
    const isLocked = !!lockedUntil && lockedUntil.getTime() > Date.now();
    const passwordMatches =
      !!user.password && (await bcrypt.compare(pass, user.password));

    if (isLocked) {
      // Only disclose the lockout to someone who proved they know the
      // password. To anyone else this is indistinguishable from a wrong
      // password, so the endpoint still cannot be used to discover which
      // addresses are registered (#M3) — an attacker gets no signal that they
      // have found a real account. A legitimate user who mistyped a few times
      // gets a message they can act on as soon as they type it correctly.
      if (passwordMatches) {
        const retryInSeconds = Math.max(
          1,
          Math.ceil((lockedUntil.getTime() - Date.now()) / 1000),
        );
        throw new UnauthorizedException({
          code: AuthErrorCode.ACCOUNT_TEMPORARILY_LOCKED,
          message:
            'Too many failed sign-in attempts. Please try again shortly.',
          retryInSeconds,
        });
      }
      throw new UnauthorizedException(INVALID);
    }

    if (passwordMatches) {
      if (user.failedLoginAttempts > 0 || user.loginLockedUntil) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: 0, loginLockedUntil: null },
        });
      }
      const { password, ...result } = user;
      return result;
    }

    await this.registerFailedLogin(user.id, user.failedLoginAttempts ?? 0);
    throw new UnauthorizedException(INVALID);
  }

  /**
   * Count a failed password attempt and lock the account once the threshold is
   * reached. The lock window grows with each subsequent lockout so a
   * persistent attacker faces rapidly diminishing returns, while a user who
   * simply mistyped waits only the base window.
   */
  private async registerFailedLogin(
    userId: string,
    previousAttempts: number,
  ): Promise<void> {
    const attempts = previousAttempts + 1;
    if (attempts < LOGIN_ATTEMPT_LIMIT) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { failedLoginAttempts: attempts },
      });
      return;
    }

    // Every further failure past the threshold doubles the window, capped so a
    // locked-out owner is never shut out for an unreasonable stretch.
    const overshoot = attempts - LOGIN_ATTEMPT_LIMIT;
    const windowMs = Math.min(
      LOGIN_LOCKOUT_BASE_MS * 2 ** overshoot,
      LOGIN_LOCKOUT_MAX_MS,
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: attempts,
        loginLockedUntil: new Date(Date.now() + windowMs),
      },
    });
  }

  async login(
    user: any,
    meta: AuthSessionMetadata = {},
    authMethod: Extract<AuthMethod, 'PASSWORD' | 'GOOGLE'> = 'PASSWORD',
  ) {
    return {
      token: await this.issueSessionToken(user, authMethod, meta),
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
          throw new UnauthorizedException({
            code: AuthErrorCode.ACCOUNT_DISABLED,
            message: 'This account has been disabled.',
          });
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
      throw new UnauthorizedException({
        code: AuthErrorCode.GOOGLE_EMAIL_NOT_VERIFIED,
        message:
          'Your Google account email is not verified. Please verify it with Google and try again.',
      });
    }

    // 2. Find by email — link the googleId to this existing account
    const byEmail = await this.usersService.findByEmail(email);
    if (byEmail) {
      if (byEmail.isActive === false || byEmail.disabledAt) {
        throw new UnauthorizedException({
          code: AuthErrorCode.ACCOUNT_DISABLED,
          message: 'This account has been disabled.',
        });
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
        const passwordChangedAt = new Date();
        const linkedUser = await this.prisma.$transaction(async (tx) => {
          const updated = await tx.user.update({
            where: { id: byEmail.id },
            data: {
              googleId,
              password: invalidatedPassword,
              passwordChangedAt,
              sessionVersion: { increment: 1 },
            },
          });
          await tx.userSession.updateMany({
            where: { userId: byEmail.id, revokedAt: null },
            data: {
              revokedAt: passwordChangedAt,
              revokedReason: 'google_identity_linked',
            },
          });
          return updated;
        });
        await this.events.evictUser(byEmail.id, 'google_identity_linked');
        return linkedUser;
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
      throw new ConflictException({
        code: AuthErrorCode.EMAIL_ALREADY_EXISTS,
        message: 'User with this email already exists',
      });
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

  async verifyRegistration(
    createAuthDto: CreateAuthDto & { code: string },
    meta: AuthSessionMetadata = {},
  ) {
    const { email, password, code } = createAuthDto;
    const normalizedEmail = this.normalizeEmail(email);

    const existingUser = await this.usersService.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new ConflictException({
        code: AuthErrorCode.EMAIL_ALREADY_EXISTS,
        message: 'User with this email already exists',
      });
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
        throw new ConflictException({
          code: AuthErrorCode.EMAIL_ALREADY_EXISTS,
          message: 'User with this email already exists',
        });
      }
      throw err;
    }

    const { password: _, ...result } = user;
    return {
      token: await this.issueSessionToken(result, 'PASSWORD', meta),
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
    const res = await fetchWithDependencyPool(
      'twilio',
      this.twilioVerifyUrl('/Verifications'),
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${this.twilioBasicAuth()}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: phone, Channel: channel }).toString(),
        signal: AbortSignal.timeout(AUTH_PROVIDER_TIMEOUT_MS),
      },
    );
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
    const res = await fetchWithDependencyPool(
      'twilio',
      this.twilioVerifyUrl('/VerificationCheck'),
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${this.twilioBasicAuth()}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: phone, Code: code }).toString(),
        signal: AbortSignal.timeout(AUTH_PROVIDER_TIMEOUT_MS),
      },
    );
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

  private throwActivePinDeviceLock(lockedUntil: Date): never {
    const minutes = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000);
    throw new HttpException(
      {
        code: AuthErrorCode.PIN_DEVICE_LOCKED,
        message: `Too many attempts. Try again in ${minutes} minute${minutes !== 1 ? 's' : ''}.`,
        attemptsRemaining: 0,
        lockedUntil: lockedUntil.toISOString(),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
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
    meta: AuthSessionMetadata,
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
        code: AuthErrorCode.STAFF_DEVICE_LIMIT_REACHED,
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
        const res = await fetchWithDependencyPool(
          'resend',
          'https://api.resend.com/emails',
          {
            method: 'POST',
            signal: AbortSignal.timeout(AUTH_PROVIDER_TIMEOUT_MS),
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
          },
        );
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
      throw new UnauthorizedException({
        code: AuthErrorCode.INVALID_OR_EXPIRED_CODE,
        message: 'Invalid or expired code.',
      });
    }

    if (
      (tokenRecord as any).lockedUntil &&
      new Date((tokenRecord as any).lockedUntil) > new Date()
    ) {
      throw new HttpException(
        {
          code: AuthErrorCode.CODE_ATTEMPTS_EXCEEDED,
          message: 'Too many attempts. Please try again later.',
        },
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
      throw new UnauthorizedException({
        code: AuthErrorCode.INVALID_OR_EXPIRED_CODE,
        message: 'Invalid or expired code.',
      });
    }

    await this.prisma.verificationToken.update({
      where: { id: tokenRecord.id },
      data: { usedAt: new Date(), attempts: 0 },
    });
  }

  /**
   * Phone OTP issuance, shared by customer login and identity linking. Two
   * providers, chosen by SMS_PROVIDER:
   *  - 'twilio'      → Twilio Verify generates AND checks the code.
   *  - 'smsgateway'  → we generate the code, send it through the SIM gateway,
   *                    and verify it against our own DB (like the email flow).
   */
  private async issuePhoneVerificationCode(phone: string): Promise<{
    devCode?: string;
    channel: 'sms' | 'whatsapp';
  }> {
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
    return { channel: (process.env.TWILIO_CHANNEL as any) || 'sms' };
  }

  /** Counterpart to issuePhoneVerificationCode — verifies against whichever provider issued. */
  private async consumePhoneVerificationCode(
    phone: string,
    code: string,
  ): Promise<void> {
    if (smsProvider() === 'smsgateway') {
      // We issued the code ourselves; verify it from our DB (throws on
      // invalid/expired/locked). Mirrors the email flow.
      await this.consumeCodeForIdentifier(phone, code);
      return;
    }
    if (!this.twilioConfigured) {
      throw new HttpException(
        {
          code: AuthErrorCode.SMS_NOT_CONFIGURED,
          message: 'SMS verification not configured.',
        },
        HttpStatus.NOT_IMPLEMENTED,
      );
    }
    const approved = await this.verifyTwilioOtp(phone, code);
    if (!approved) {
      throw new UnauthorizedException({
        code: AuthErrorCode.INVALID_OR_EXPIRED_CODE,
        message: 'Invalid or expired code.',
      });
    }
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

    // Phone-first flow — delivery and provider choice live in the shared helper.
    if (phone && !email) {
      const issued = await this.issuePhoneVerificationCode(
        this.normalizePhone(phone),
      );
      return { success: true, ...issued };
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
    meta: AuthSessionMetadata = {},
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
        timezone: true,
        pinLoginStartTime: true,
        pinLoginEndTime: true,
      },
    });
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }
    if (
      !this.featureService.restaurantHasFeature(restaurant, FeatureFlag.POS)
    ) {
      throw new ForbiddenException({
        code: AuthErrorCode.POS_NOT_IN_PLAN,
        message: 'POS is not available on this plan.',
      });
    }
    // M2.2 — Suspended restaurants cannot use the POS.
    if (restaurant.isActive === false) {
      throw new ForbiddenException({
        code: AuthErrorCode.RESTAURANT_SUSPENDED,
        message: 'This restaurant has been suspended',
      });
    }
    if (restaurant.sharedDeviceModeEnabled === false) {
      throw new ForbiddenException({
        code: AuthErrorCode.SHARED_DEVICE_MODE_DISABLED,
        message:
          'Shared Device Mode is off. Ask a manager to enable it before staff PIN login.',
      });
    }
    if (
      !isPinLoginAllowed({
        timezone: restaurant.timezone,
        startTime: restaurant.pinLoginStartTime,
        endTime: restaurant.pinLoginEndTime,
      })
    ) {
      throw new ForbiddenException({
        code: AuthErrorCode.PIN_LOGIN_OUTSIDE_HOURS,
        message: 'Staff PIN login is closed at this time.',
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
        deviceTrustExpiresAt: true,
      },
    });

    if (!enrolledDevice) {
      throw new UnauthorizedException({
        code: AuthErrorCode.DEVICE_NOT_ENROLLED,
        message: 'This device is not enrolled for staff PIN login.',
      });
    }

    // Device trust lapses on its own so a tablet cannot stay a credential
    // indefinitely across staff turnover. NULL means trusted indefinitely --
    // which is what every device enrolled before this shipped already was, so
    // nothing is un-trusted retroactively.
    //
    // Enforced here rather than in the session guard on purpose: expiring a
    // live session would drop a waiter mid-order, whereas refusing the next
    // login costs one re-enrolment the owner can do between covers.
    // NULL is a deployment-compatibility state, not policy: the migration writes
    // a real expiry for every enrolled device, and enrolment sets one from that
    // point on. A row can only be NULL if it was created between the deploy and
    // the backfill, so it is treated as still trusted rather than locking out a
    // device over a race with our own rollout.
    if (
      enrolledDevice.deviceTrustExpiresAt &&
      enrolledDevice.deviceTrustExpiresAt <= new Date()
    ) {
      throw new UnauthorizedException({
        code: AuthErrorCode.DEVICE_TRUST_EXPIRED,
        message:
          'This device is no longer trusted for PIN login. Ask an owner or manager to re-enroll it.',
      });
    }

    // Tracks whether a spent lock was retired on this request, so the relock
    // guard below judges the window that starts now rather than the stale value
    // this request read.
    let lockCleared = false;
    if (enrolledDevice.pinLockedUntil) {
      if (enrolledDevice.pinLockedUntil > new Date()) {
        this.throwActivePinDeviceLock(enrolledDevice.pinLockedUntil);
      }

      // The lock has expired, so retire it here rather than leaving a stale
      // non-null value behind. The relock guard below tests `!lockedUntil`, so
      // a spent lock that is never cleared permanently disables relocking:
      // pinAttempts climbs past MAX_ATTEMPTS while every wrong PIN is merely
      // rejected, and brute force continues at the route throttle forever.
      // pinAttempts resets only on a successful login, which an attacker never
      // reaches.
      //
      // Guarded on the value we read, so two concurrent requests cannot both
      // clear it and lose a real attempt between them.
      const cleared = await this.prisma.deviceEnrollmentToken.updateMany({
        where: {
          id: enrolledDevice.id,
          pinLockedUntil: enrolledDevice.pinLockedUntil,
        },
        data: { pinAttempts: 0, pinLockedUntil: null },
      });

      if (cleared.count === 0) {
        // Another request changed the row after our read. Re-read before doing
        // bcrypt work: blindly setting lockCleared here would let this request
        // continue through a lock another request has just renewed.
        const current = await this.prisma.deviceEnrollmentToken.findUnique({
          where: { id: enrolledDevice.id },
          select: { pinLockedUntil: true },
        });
        if (!current) {
          throw new UnauthorizedException({
            code: AuthErrorCode.DEVICE_NOT_ENROLLED,
            message: 'This device is not enrolled for staff PIN login.',
          });
        }
        if (current.pinLockedUntil && current.pinLockedUntil > new Date()) {
          this.throwActivePinDeviceLock(current.pinLockedUntil);
        }
        if (current.pinLockedUntil) {
          // A second expired value is unusual but can be handled safely with the
          // same compare-and-clear. If it races again, reject this request rather
          // than guessing which lock state is authoritative.
          const retried = await this.prisma.deviceEnrollmentToken.updateMany({
            where: {
              id: enrolledDevice.id,
              pinLockedUntil: current.pinLockedUntil,
            },
            data: { pinAttempts: 0, pinLockedUntil: null },
          });
          if (retried.count === 0) {
            throw new HttpException(
              {
                code: AuthErrorCode.DEVICE_LOCK_STATE_CHANGED,
                message: 'Device lock state changed. Try again.',
                attemptsRemaining: 0,
              },
              HttpStatus.TOO_MANY_REQUESTS,
            );
          }
        }
      }
      lockCleared = true;
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
      throw new UnauthorizedException({
        code: AuthErrorCode.INVALID_PIN,
        message: 'Invalid PIN.',
        attemptsRemaining: null,
      });
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

      const extraClaims = {
        deviceTokenId: enrolledDevice.id,
        deviceSessionVersion: enrolledDevice.sessionVersion ?? 0,
      };
      return {
        token: await this.issueSessionToken(
          user,
          'PIN',
          meta,
          extraClaims,
          STAFF_DEVICE_SESSION_TTL_SECONDS,
        ),
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

    // After a reset the stored value is null, so the window that matters is the
    // fresh one. Reading enrolledDevice here would see the spent lock and
    // suppress relocking forever -- the defect this guard is being fixed for.
    let lockedUntil: Date | null = lockCleared
      ? null
      : enrolledDevice.pinLockedUntil;
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

    // Detection runs after the audit row exists, and is deliberately not
    // awaited: it is advisory, and must never delay a login, change what the
    // caller sees, or turn a wrong PIN into a 500. It also never blocks --
    // per-device lockout above remains the only blocking control, because a
    // restaurant-wide one could be triggered on purpose to take every till
    // offline mid-service.
    void withoutRequestBudget(() =>
      this.pinSecurity.evaluate(restaurantId, enrolledDevice.id),
    );

    const remaining = MAX_ATTEMPTS - attempts;
    if (remaining > 0) {
      throw new UnauthorizedException({
        code: AuthErrorCode.INVALID_PIN,
        message: `Invalid PIN. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
        attemptsRemaining: remaining,
      });
    }
    throw new HttpException(
      {
        code: AuthErrorCode.PIN_DEVICE_LOCKED,
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
      throw new UnauthorizedException({
        code: AuthErrorCode.ACCOUNT_DISABLED,
        message: 'This account has been disabled.',
      });
    }
    if (
      !user.password ||
      !(await bcrypt.compare(currentPassword, user.password))
    ) {
      throw new UnauthorizedException({
        code: AuthErrorCode.CURRENT_PASSWORD_INCORRECT,
        message: 'Current password is incorrect.',
      });
    }
    if (await bcrypt.compare(newPassword, user.password)) {
      throw new HttpException(
        {
          code: AuthErrorCode.PASSWORD_SAME_AS_CURRENT,
          message: 'New password must be different from the current password.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const passwordChangedAt = new Date();
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          password: hashedPassword,
          passwordChangedAt,
          sessionVersion: { increment: 1 },
        },
      });
      await tx.userSession.updateMany({
        where: { userId, revokedAt: null },
        data: {
          revokedAt: passwordChangedAt,
          revokedReason: 'password_changed',
        },
      });
    });

    // P1-13: passwordChangedAt kills the old token on the next HTTP request,
    // but a socket authenticated before the change keeps its connection and
    // carries on receiving live order and payment events. resetStaffPin
    // already evicted; the password paths did not.
    await this.events.evictUser(userId, 'password_changed');

    return { success: true };
  }

  async verifyOtp(
    email?: string,
    code?: string,
    phone?: string,
    name?: string,
    restaurantId?: string,
    meta: AuthSessionMetadata = {},
  ): Promise<{ token: string; user: any; isNew: boolean }> {
    await this.checkCustomersAuthFeature(restaurantId);
    if (!code)
      throw new HttpException('code is required', HttpStatus.BAD_REQUEST);

    const cleanName = name?.trim() || undefined;
    let user: any;
    let isNew = false;

    // Phone-first flow — verify against whichever provider issued the code.
    if (phone && !email) {
      await this.consumePhoneVerificationCode(phone, code);

      user = await this.usersService.findByPhone(phone);
      isNew = !user;
      if (!user) {
        const password = await bcrypt.hash(randomBytes(24).toString('hex'), 10);
        user = await this.usersService.create({
          email: buildPhonePlaceholderEmail(phone),
          password,
          role: 'CUSTOMER',
          phone,
          ...(cleanName ? { name: cleanName } : {}),
        });
      } else if (isPinRole(user.role)) {
        throw new UnauthorizedException({
          code: AuthErrorCode.INVALID_OR_EXPIRED_CODE,
          message: 'Invalid or expired code.',
        });
      } else if (user.isActive === false || user.disabledAt) {
        throw new UnauthorizedException({
          code: AuthErrorCode.ACCOUNT_DISABLED,
          message: 'This account has been disabled.',
        });
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
        throw new UnauthorizedException({
          code: AuthErrorCode.INVALID_OR_EXPIRED_CODE,
          message: 'Invalid or expired code.',
        });
      } else if (user.isActive === false || user.disabledAt) {
        throw new UnauthorizedException({
          code: AuthErrorCode.ACCOUNT_DISABLED,
          message: 'This account has been disabled.',
        });
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

    return {
      token: await this.issueSessionToken(user, 'OTP', meta),
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

  // ── identity linking (V1) ──────────────────────────────────────────────
  //
  // A second identifier may only ever be ADDED to an already-authenticated
  // account — it must never CREATE one. That single rule is what stops a
  // phone-first customer from ending up with a second, email-first account
  // holding a separate point balance. Merging accounts that already split is
  // V2 and deliberately out of scope here.

  private resolveIdentity(
    email?: string,
    phone?: string,
  ): { field: 'email' | 'phone'; value: string } {
    const hasEmail = Boolean(email?.trim());
    const hasPhone = Boolean(phone?.trim());
    if (hasEmail === hasPhone) {
      throw new HttpException(
        'Provide exactly one of email or phone.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return hasEmail
      ? { field: 'email', value: this.normalizeEmail(email!) }
      : { field: 'phone', value: this.normalizePhone(phone!) };
  }

  /**
   * Identity linking is a customer-account feature. Staff and owners change
   * their email through the dashboard profile flow, which has its own rules —
   * letting them through here would be a second, less-guarded path to the same
   * mutation.
   */
  private async loadLinkableCustomer(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Account not found.');
    }
    if (user.isActive === false || user.disabledAt) {
      throw new UnauthorizedException({
        code: AuthErrorCode.ACCOUNT_DISABLED,
        message: 'This account has been disabled.',
      });
    }
    if (user.role !== 'CUSTOMER') {
      throw new ForbiddenException(
        'Identity linking is only available for customer accounts.',
      );
    }
    return user;
  }

  private async assertIdentityFree(
    field: 'email' | 'phone',
    value: string,
    userId: string,
    client: { user: { findFirst: Function } } = this.prisma as any,
  ): Promise<void> {
    const holder = await client.user.findFirst({
      where: { [field]: value, NOT: { id: userId } },
    });
    if (holder) {
      // Distinct, machine-readable code: the client must be able to tell this
      // apart from a bad code. Never silently merge, never silently steal.
      throw new ConflictException('IDENTITY_IN_USE');
    }
  }

  /**
   * Step 1 — send a code to the identifier being ADDED. Requires a session for
   * the account being modified, so an unauthenticated caller cannot use this to
   * probe which addresses are registered.
   */
  async addIdentity(
    userId: string,
    email?: string,
    phone?: string,
  ): Promise<{
    success: boolean;
    devCode?: string;
    channel: 'email' | 'sms' | 'whatsapp';
  }> {
    const identity = this.resolveIdentity(email, phone);
    const user = await this.loadLinkableCustomer(userId);
    await this.assertIdentityFree(identity.field, identity.value, user.id);

    if (identity.field === 'email') {
      const issued = await this.issueEmailVerificationCode(
        identity.value,
        'Confirm your email',
      );
      return { success: true, channel: 'email', ...issued };
    }

    const issued = await this.issuePhoneVerificationCode(identity.value);
    return { success: true, ...issued };
  }

  /**
   * Step 2 — on a valid code, write the identifier onto the EXISTING row,
   * replacing any phone-… @phone.local placeholder. `User.email` is unique, so
   * the collision re-check runs inside the transaction and P2002 is mapped to
   * the same error the pre-check raises.
   */
  async verifyIdentity(
    userId: string,
    code: string,
    email?: string,
    phone?: string,
  ): Promise<{ user: Record<string, unknown> }> {
    if (!code) {
      throw new HttpException('code is required', HttpStatus.BAD_REQUEST);
    }
    const identity = this.resolveIdentity(email, phone);
    const user = await this.loadLinkableCustomer(userId);

    if (identity.field === 'email') {
      await this.consumeEmailVerificationCode(identity.value, code);
    } else {
      await this.consumePhoneVerificationCode(identity.value, code);
    }

    let updated: any;
    try {
      updated = await this.prisma.$transaction(async (tx: any) => {
        // Re-check: the identifier could have been claimed between the add
        // call and this one. `phone` carries no unique constraint, so this
        // check — not the database — is what covers the phone case.
        await this.assertIdentityFree(
          identity.field,
          identity.value,
          user.id,
          tx,
        );
        return tx.user.update({
          where: { id: user.id },
          data: { [identity.field]: identity.value },
        });
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException('IDENTITY_IN_USE');
      }
      throw error;
    }

    return {
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        phone: updated.phone,
        role: updated.role,
        restaurantId: updated.restaurantId,
      },
    };
  }

  async exchangeImpersonation(code: string, meta: AuthSessionMetadata = {}) {
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
    const extraClaims = {
      isImpersonation: true,
      impersonationSessionId: session.id,
    };

    return {
      token: await this.issueSessionToken(
        user,
        'IMPERSONATION',
        meta,
        extraClaims,
        IMPERSONATION_SESSION_TTL_SECONDS,
      ),
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

  async listSessions(
    userId: string,
    currentSessionId?: string,
    cursor?: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { sessionVersion: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const sessions = await this.prisma.userSession.findMany({
      where: {
        userId,
        sessionVersion: user.sessionVersion,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        authMethod: true,
        deviceTokenId: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: 51,
    });

    const page = sessions.slice(0, 50);
    return {
      sessions: page.map((session) => ({
        ...session,
        current: session.id === currentSessionId,
      })),
      nextCursor: sessions.length > 50 ? page[49].id : null,
      legacyCurrentSession: !currentSessionId,
    };
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    currentSessionId?: string,
  ) {
    const revokedAt = new Date();
    const result = await this.prisma.userSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt, revokedReason: 'user_revoked' },
    });

    if (result.count !== 1) {
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: 'Active session not found.',
      });
    }

    await this.events.evictSession(sessionId, 'session_revoked');
    return { success: true, current: sessionId === currentSessionId };
  }

  async signOutEverywhere(userId: string) {
    const revokedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        // The timestamp also invalidates cookies on an old revision during
        // the rollout overlap; new revisions use the exact version counter.
        data: {
          sessionVersion: { increment: 1 },
          passwordChangedAt: revokedAt,
        },
      });
      await tx.userSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt, revokedReason: 'user_global_logout' },
      });
    });

    await this.events.evictUser(userId, 'user_global_logout');
    return { success: true };
  }

  /** Idempotent cookie logout: invalid/expired legacy cookies are still clearable. */
  async logoutSession(token?: string) {
    if (!token) return;
    let payload: {
      sub?: string;
      sessionId?: string;
      impersonationSessionId?: string;
    };
    try {
      payload = this.jwtService.verify<typeof payload>(token);
    } catch {
      // An invalid or expired signature grants no access and is safe to clear.
      return;
    }
    if (typeof payload.sub !== 'string') return;
    const userId = payload.sub;
    const sessionId = payload.sessionId;
    const revokedAt = new Date();
    // Persistence errors deliberately propagate to the global error reporter.
    // The controller clears the cookie in finally, but must not falsely report
    // that a copied credential was revoked when the database is unavailable.
    await this.prisma.$transaction(async (tx) => {
      if (typeof sessionId === 'string') {
        await tx.userSession.updateMany({
          where: {
            id: sessionId,
            userId,
            revokedAt: null,
          },
          data: { revokedAt, revokedReason: 'logout' },
        });
      }
      if (typeof payload.impersonationSessionId === 'string') {
        await tx.impersonationSession.updateMany({
          where: {
            id: payload.impersonationSessionId,
            targetId: userId,
            revokedAt: null,
          },
          data: { revokedAt },
        });
      }
    });
    if (typeof sessionId === 'string') {
      // Retry eviction even for an already-revoked row (e.g. a prior Redis outage).
      await this.events.evictSession(sessionId, 'logout');
    }
  }

  async exitImpersonation(jwtUser: {
    id: string;
    impersonationSessionId?: string;
    sessionId?: string;
  }) {
    const revokedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      if (jwtUser.impersonationSessionId) {
        await tx.impersonationSession.updateMany({
          where: { id: jwtUser.impersonationSessionId, revokedAt: null },
          data: { revokedAt },
        });
      }
      if (jwtUser.sessionId) {
        await tx.userSession.updateMany({
          where: { id: jwtUser.sessionId, userId: jwtUser.id, revokedAt: null },
          data: { revokedAt, revokedReason: 'impersonation_ended' },
        });
      }
    });
    if (jwtUser.sessionId) {
      await this.events.evictSession(jwtUser.sessionId, 'impersonation_ended');
    }
  }
}
