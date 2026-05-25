import { Injectable, Logger, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureService } from '../subscription/feature.service';
import { User, Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private featureService: FeatureService,
  ) {}

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
    callerRole: string = 'OWNER',
  ): Promise<{ user: { id: string; email: string; name: string | null; role: string }; rawPin: string }> {
    if (data.role === 'MANAGER' && callerRole !== 'OWNER') {
      throw new ForbiddenException('Only owners can create manager accounts');
    }

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { tier: true },
    });
    const tier = (restaurant?.tier ?? 'FREE') as string;

    const allowedRoles = this.featureService.getAllowedStaffRoles(tier);
    if (!allowedRoles.includes(data.role)) {
      throw new ForbiddenException(
        `Role ${data.role} is not available on the ${tier} plan. Upgrade to add staff members.`,
      );
    }

    const staffLimit = this.featureService.getStaffLimit(tier);
    const currentCount = await this.prisma.user.count({
      where: { restaurantId, role: { in: ['WAITER', 'MANAGER', 'KITCHEN'] } },
    });
    if (currentCount >= staffLimit) {
      throw new ForbiddenException(
        `Staff limit of ${staffLimit} reached for the ${tier} plan. Upgrade to add more staff.`,
      );
    }

    const rawPin = Math.floor(1000 + Math.random() * 9000).toString();
    const pinHash = await bcrypt.hash(rawPin, 10);

    const explicitEmail = !!data.email;
    const email = data.email || `staff-${Date.now()}@${restaurantId}.local`;

    const createData: Prisma.UserUncheckedCreateInput = {
      email: email.toLowerCase().trim(),
      password: await bcrypt.hash(Math.random().toString(36).slice(-12), 10),
      name: data.name,
      role: data.role as any,
      pinHash,
      restaurantId,
    };

    let user: Awaited<ReturnType<typeof this.prisma.user.create>>;
    try {
      user = await this.prisma.user.create({ data: createData });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        if (explicitEmail) {
          throw new ConflictException('A user with this email already exists');
        }
        createData.email = `staff-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@${restaurantId}.local`;
        user = await this.prisma.user.create({ data: createData });
      } else {
        throw err;
      }
    }

    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      rawPin,
    };
  }

  async listStaffMembers(restaurantId: string) {
    return this.prisma.user.findMany({
      where: {
        restaurantId,
        role: { in: ['WAITER', 'MANAGER', 'KITCHEN'] as any[] },
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        restaurantId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async updateStaffMember(
    restaurantId: string,
    userId: string,
    data: { role?: string; isActive?: boolean },
    callerRole: string = 'OWNER',
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, restaurantId },
      select: { id: true, email: true, name: true, role: true },
    });
    if (!user) {
      throw new NotFoundException(`Staff member with ID "${userId}" not found`);
    }
    if (user.role === 'OWNER') {
      throw new ForbiddenException('Cannot edit the restaurant owner');
    }
    if (user.role === 'MANAGER' && callerRole !== 'OWNER') {
      throw new ForbiddenException('Only owners can manage other managers');
    }

    if (data.role) {
      const restaurant = await this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { tier: true },
      });
      const tier = (restaurant?.tier ?? 'FREE') as string;
      const allowedRoles = this.featureService.getAllowedStaffRoles(tier);
      if (!allowedRoles.includes(data.role)) {
        throw new ForbiddenException(
          `Role ${data.role} is not available on the ${tier} plan.`,
        );
      }
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.role ? { role: data.role as any } : {}),
        ...(typeof data.isActive === 'boolean'
          ? {
              isActive: data.isActive,
              disabledAt: data.isActive ? null : new Date(),
              disabledReason: data.isActive ? null : 'Disabled by staff manager',
            }
          : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        restaurantId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async resetStaffPin(restaurantId: string, userId: string, callerRole: string = 'OWNER') {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, restaurantId },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!user) {
      throw new NotFoundException(`Staff member with ID "${userId}" not found`);
    }
    if (user.role === 'OWNER') {
      throw new ForbiddenException('Cannot reset the owner PIN here');
    }
    if (user.role === 'MANAGER' && callerRole !== 'OWNER') {
      throw new ForbiddenException('Only owners can reset manager PINs');
    }

    const rawPin = Math.floor(1000 + Math.random() * 9000).toString();
    const pinHash = await bcrypt.hash(rawPin, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { pinHash, pinAttempts: 0, pinLockedUntil: null },
    });

    return { user, rawPin };
  }

  async removeStaffMember(restaurantId: string, userId: string, callerRole: string = 'OWNER') {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, restaurantId },
    });
    if (!user) {
      throw new NotFoundException(`Staff member with ID "${userId}" not found`);
    }
    if (user.role === 'OWNER') {
      throw new ForbiddenException('Cannot remove the restaurant owner');
    }
    if (user.role === 'MANAGER' && callerRole !== 'OWNER') {
      throw new ForbiddenException('Only owners can remove managers');
    }
    await this.prisma.user.delete({ where: { id: userId } });
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  async verifyRestaurantAccess(restaurantId: string, userId: string): Promise<void> {
    const [restaurant, user] = await Promise.all([
      this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { ownerId: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { restaurantId: true },
      }),
    ]);

    if (!restaurant) {
      throw new NotFoundException(`Restaurant with ID "${restaurantId}" not found`);
    }

    if (restaurant.ownerId === userId) return;

    if (!user || user.restaurantId !== restaurantId) {
      throw new ForbiddenException('You do not have permission to access this resource');
    }
  }
}
