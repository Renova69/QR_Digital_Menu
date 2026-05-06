import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { CreateAuthDto } from './dto/create-auth.dto';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
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
      },
    };
  }

  async sendMagicLink(email: string, returnTo?: string) {
    let user = await this.usersService.findByEmail(email);

    if (!user) {
      const generatedPassword = await bcrypt.hash(
        Math.random().toString(36).slice(-8),
        10,
      );
      user = await this.usersService.create({
        email,
        password: generatedPassword,
        role: 'CUSTOMER' as any,
      });
    }

    const payload = { email: user.email, sub: user.id };
    const token = this.jwtService.sign(payload, { expiresIn: '15m' });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    let link = `${frontendUrl}/auth/callback?token=${token}`;
    if (returnTo) {
      link += `&returnTo=${encodeURIComponent(returnTo)}`;
    }

    console.log(`\n\n🔗 MAGIC LINK FOR ${email}:`);
    console.log(`${link}\n\n`);

    return { success: true, message: 'Magic link generated in console', link };
  }

  async sendOtp(
    email: string,
    phone?: string,
  ): Promise<{ success: boolean; devCode?: string }> {
    const recentToken = await this.prisma.verificationToken.findFirst({
      where: {
        email,
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
      where: { email, usedAt: null },
    });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedCode = await bcrypt.hash(code, 10);

    await this.prisma.verificationToken.create({
      data: {
        email,
        code: hashedCode,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const isDev = !process.env.RESEND_API_KEY;

    if (!isDev) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL || 'noreply@yourdomain.com',
          to: [email],
          subject: 'Your verification code',
          text: `Your verification code: ${code}\n\nExpires in 10 minutes.`,
          html: `<p style="font-family:sans-serif;font-size:16px;">Your verification code:</p><p style="font-family:monospace;font-size:32px;font-weight:bold;letter-spacing:8px;">${code}</p><p style="font-family:sans-serif;color:#666;">Expires in 10 minutes. If you did not request this, ignore this email.</p>`,
        }),
      });
    } else {
      console.log(`\n\n🔑 OTP FOR ${email}: ${code}\n\n`);
    }

    return { success: true, ...(isDev ? { devCode: code } : {}) };
  }

  async verifyOtp(
    email: string,
    code: string,
    phone?: string,
  ): Promise<{ token: string; user: any; isNew: boolean }> {
    const tokenRecord = await this.prisma.verificationToken.findFirst({
      where: {
        email,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!tokenRecord) {
      throw new UnauthorizedException('Invalid or expired code.');
    }

    const valid = await bcrypt.compare(code, tokenRecord.code);
    if (!valid) {
      throw new UnauthorizedException('Invalid or expired code.');
    }

    await this.prisma.verificationToken.update({
      where: { id: tokenRecord.id },
      data: { usedAt: new Date() },
    });

    let user = await this.usersService.findByEmail(email);
    const isNew = !user;

    if (!user) {
      const password = await bcrypt.hash(
        Math.random().toString(36).slice(-12),
        10,
      );
      user = await this.usersService.create({
        email,
        password,
        role: 'CUSTOMER' as any,
        ...(phone ? { phone } : {}),
      });
    } else if (phone && !(user as any).phone) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { phone },
      });
    }

    const payload = { email: user.email, sub: user.id };
    return {
      token: this.jwtService.sign(payload),
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      isNew,
    };
  }
}
