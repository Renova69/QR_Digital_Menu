import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.toLowerCase().trim();
    return this.prisma.user.findUnique({ where: { email: normalizedEmail } });
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { phone } });
  }

  async create(data: Prisma.UserCreateInput): Promise<User> {
    if (data.email) {
      data.email = data.email.toLowerCase().trim();
    }
    return this.prisma.user.create({ data });
  }
}
