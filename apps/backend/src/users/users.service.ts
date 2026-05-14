import { Injectable, Logger, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { User, Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

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

  async createStaffMember(
    restaurantId: string,
    data: { name: string; email?: string; role: string },
  ): Promise<{ user: { id: string; email: string; name: string | null; role: string }; rawPin: string }> {
    const rawPin = Math.floor(1000 + Math.random() * 9000).toString();
    const pinHash = await bcrypt.hash(rawPin, 10);

    const email = data.email || `staff-${Date.now()}@${restaurantId}.local`;

    const createData: Prisma.UserUncheckedCreateInput = {
      email: email.toLowerCase().trim(),
      password: await bcrypt.hash(Math.random().toString(36).slice(-12), 10),
      name: data.name,
      role: data.role as any,
      pinHash,
      restaurantId,
    };

    const existing = await this.prisma.user.findUnique({ where: { email: createData.email! } });
    if (existing) {
      createData.email = `staff-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@${restaurantId}.local`;
    }

    const user = await this.prisma.user.create({ data: createData });

    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      rawPin,
    };
  }

  async listStaffMembers(restaurantId: string) {
    return this.prisma.user.findMany({
      where: {
        restaurantId,
        role: { not: 'CUSTOMER' as any },
      },
      select: { id: true, email: true, name: true, role: true, restaurantId: true },
      orderBy: { name: 'asc' },
    });
  }

  async removeStaffMember(restaurantId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, restaurantId },
    });
    if (!user) {
      throw new NotFoundException(`Staff member with ID "${userId}" not found`);
    }
    if (user.role === 'OWNER') {
      throw new ForbiddenException('Cannot remove the restaurant owner');
    }
    await this.prisma.user.delete({ where: { id: userId } });
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  async verifyRestaurantAccess(restaurantId: string, userId: string): Promise<void> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { ownerId: true },
    });

    if (!restaurant) {
      throw new NotFoundException(`Restaurant with ID "${restaurantId}" not found`);
    }

    if (restaurant.ownerId === userId) {
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { restaurantId: true },
    });

    if (!user || user.restaurantId !== restaurantId) {
      throw new ForbiddenException('You do not have permission to access this resource');
    }
  }
}
