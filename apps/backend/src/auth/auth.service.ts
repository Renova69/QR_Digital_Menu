import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { CreateAuthDto } from './dto/create-auth.dto';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
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
    const token = this.jwtService.sign(payload, { expiresIn: '15m' }); // Short-lived token

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    let link = `${frontendUrl}/auth/callback?token=${token}`;
    if (returnTo) {
      link += `&returnTo=${encodeURIComponent(returnTo)}`;
    }

    console.log(`\n\n🔗 MAGIC LINK FOR ${email}:`);
    console.log(`${link}\n\n`);

    return { success: true, message: 'Magic link generated in console', link };
  }
}
