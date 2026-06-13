import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureService } from '../subscription/feature.service';
import { EventsGateway } from '../events/events.gateway';
import { isPinRole } from './staff-roles';
import { User, Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private featureService: FeatureService,
    private events: EventsGateway,
  ) {}

  /** Generates a PIN that doesn't collide with any existing hash in the list.
   *  Compares in parallel per attempt so wall time stays ~100ms regardless of staff count. */
  private async generateUniquePin(
    existingHashes: { pinHash: string | null }[],
    maxAttempts = 20,
  ): Promise<string> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidate = crypto.randomInt(0, 10000).toString().padStart(4, '0');
      const hashes = existingHashes.map((e) => e.pinHash).filter(Boolean) as string[];
      const results = await Promise.all(hashes.map((h) => bcrypt.compare(candidate, h)));
      if (!results.some(Boolean)) return candidate;
    }
    throw new ConflictException(
      `Could not generate a unique PIN after ${maxAttempts} attempts. Please try again.`,
    );
  }

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
  ): Promise<{
    user: { id: string; email: string; name: string | null; role: string };
    rawPin?: string;
    tempPassword?: string;
  }> {
    if (data.role === 'MANAGER' && callerRole !== 'OWNER') {
      throw new ForbiddenException('Only owners can create manager accounts');
    }

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { tier: true, forceTier: true },
    });
    const tier = this.featureService.getEffectiveTier(
      restaurant?.tier ?? 'FREE',
      restaurant?.forceTier ?? null,
    );

    const allowedRoles = this.featureService.getAllowedStaffRoles(tier);
    if (!allowedRoles.includes(data.role)) {
      throw new ForbiddenException(
        `Role ${data.role} is not available on the ${tier} plan. Upgrade to add staff members.`,
      );
    }

    const staffLimit = this.featureService.getStaffLimit(tier);

    // Role-exclusive credentials. Device roles (WAITER/KITCHEN) authenticate by
    // PIN at a shared POS/KDS tablet; dashboard roles (STAFF/MANAGER) authenticate
    // by email + temp password. A role must never carry both — a short PIN must
    // not be able to mint a JWT for a dashboard account (see pinLogin scoping).
    const usePinCredential = isPinRole(data.role);

    // Issue 56: full 10 000-space entropy, padStart preserves leading zeros.
    // Issue 41: regenerate until the PIN is unique within this restaurant (max 20 tries).
    let rawPin: string | undefined;
    if (usePinCredential) {
      // Fetch all existing PIN hashes for active staff in this restaurant once,
      // then compare cheaply without re-querying on each attempt.
      const existingPinHashes = await this.prisma.user.findMany({
        where: { restaurantId, pinHash: { not: null }, isActive: true },
        select: { pinHash: true },
      });

      rawPin = await this.generateUniquePin(existingPinHashes);
    }
    const pinHash = rawPin ? await bcrypt.hash(rawPin, 10) : null;

    // `password` is non-nullable in the schema, so every user gets a hash. For
    // PIN roles it is a random throwaway value that is never surfaced and cannot
    // be used to log in (it is not returned to the caller).
    const tempPassword = crypto.randomBytes(6).toString('hex'); // 12-character random string

    const explicitEmail = !!data.email;
    const baseEmail = data.email || `staff-${Date.now()}@${restaurantId}.local`;

    const createData: Prisma.UserUncheckedCreateInput = {
      email: baseEmail.toLowerCase().trim(),
      password: await bcrypt.hash(tempPassword, 10),
      name: data.name,
      role: data.role as any,
      pinHash,
      restaurantId,
    };

    const doCreate = async (
      tx: Prisma.TransactionClient,
      emailOverride?: string,
    ) => {
      const currentCount = await tx.user.count({
        where: {
          restaurantId,
          role: { in: ['STAFF', 'WAITER', 'MANAGER', 'KITCHEN'] },
        },
      });
      if (currentCount >= staffLimit) {
        throw new ForbiddenException(
          `Staff limit of ${staffLimit} reached for the ${tier} plan. Upgrade to add more staff.`,
        );
      }
      if (emailOverride) createData.email = emailOverride;
      return tx.user.create({ data: createData });
    };

    const txOpts = {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    };

    const runTx = async (emailOverride?: string): Promise<typeof user> => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await this.prisma.$transaction(
            (tx: Prisma.TransactionClient) => doCreate(tx, emailOverride),
            txOpts,
          );
        } catch (err: any) {
          if (
            err instanceof ForbiddenException ||
            err instanceof ConflictException
          )
            throw err;
          if (err?.code === 'P2034' && attempt < 2) continue; // serialization conflict -- retry
          throw err;
        }
      }
      throw new Error('Unreachable');
    };

    let user: Awaited<ReturnType<typeof this.prisma.user.create>>;
    try {
      user = await runTx();
    } catch (err: any) {
      if (err instanceof ForbiddenException || err instanceof ConflictException)
        throw err;
      if (err?.code === 'P2002') {
        if (explicitEmail) {
          throw new ConflictException('A user with this email already exists');
        }
        const fallbackEmail = `staff-${Date.now()}-${crypto.randomBytes(3).toString('hex')}@${restaurantId}.local`;
        user = await runTx(fallbackEmail);
      } else {
        throw err;
      }
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      ...(usePinCredential ? { rawPin } : { tempPassword }),
    };
  }

  async listStaffMembers(restaurantId: string) {
    return this.prisma.user.findMany({
      where: {
        restaurantId,
        role: { in: ['STAFF', 'WAITER', 'MANAGER', 'KITCHEN'] as any[] },
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
        select: { tier: true, forceTier: true },
      });
      const tier = this.featureService.getEffectiveTier(
        restaurant?.tier ?? 'FREE',
        restaurant?.forceTier ?? null,
      );
      const allowedRoles = this.featureService.getAllowedStaffRoles(tier);
      if (!allowedRoles.includes(data.role)) {
        throw new ForbiddenException(
          `Role ${data.role} is not available on the ${tier} plan.`,
        );
      }
    }

    // Reconcile the PIN credential when the role actually changes so the
    // "dashboard roles have no PIN, device roles do" invariant holds in the DB:
    //   → device role (WAITER/KITCHEN): mint a fresh PIN (surfaced via rawPin)
    //   → dashboard role (STAFF/MANAGER): clear any stale pinHash
    let pinCredential: { rawPin: string; pinHash: string } | null = null;
    let clearPin = false;
    if (data.role && data.role !== user.role) {
      if (isPinRole(data.role)) {
        // Issue 56: full 10 000-space entropy + padStart for leading zeros.
        // Issue 41: ensure PIN is unique within the restaurant.
        const existingPinHashes = await this.prisma.user.findMany({
          where: { restaurantId, pinHash: { not: null }, isActive: true },
          select: { pinHash: true },
        });
        const generatedPin = await this.generateUniquePin(existingPinHashes);
        pinCredential = { rawPin: generatedPin, pinHash: await bcrypt.hash(generatedPin, 10) };
      } else {
        clearPin = true;
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.role ? { role: data.role as any } : {}),
        ...(pinCredential
          ? {
              pinHash: pinCredential.pinHash,
              pinAttempts: 0,
              pinLockedUntil: null,
              password: await bcrypt.hash(
                crypto.randomBytes(24).toString('hex'),
                10,
              ),
              passwordChangedAt: new Date(),
            }
          : {}),
        ...(clearPin
          ? { pinHash: null, pinAttempts: 0, pinLockedUntil: null }
          : {}),
        ...(typeof data.isActive === 'boolean'
          ? {
              isActive: data.isActive,
              disabledAt: data.isActive ? null : new Date(),
              disabledReason: data.isActive
                ? null
                : 'Disabled by staff manager',
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

    // Evict live WebSocket sessions when access changes (Issue 39)
    if (data.isActive === false || (data.role && data.role !== user.role)) {
      void this.events.evictUser(
        updated.id,
        data.isActive === false ? 'account_disabled' : 'role_changed',
      );
    }

    // Surface the freshly minted PIN so the dashboard can show it (WAITER/KITCHEN).
    return pinCredential
      ? { ...updated, rawPin: pinCredential.rawPin }
      : updated;
  }

  async resetStaffPin(
    restaurantId: string,
    userId: string,
    callerRole: string = 'OWNER',
  ) {
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
    // Dashboard roles (STAFF/MANAGER/OWNER) authenticate by password and must
    // never hold a PIN — reject even direct API calls (the UI already hides this).
    if (!isPinRole(user.role)) {
      throw new ForbiddenException(
        'Only device roles (waiter/kitchen) use a PIN. Dashboard roles sign in with email and password.',
      );
    }

    // Issue 56: full 10 000-space entropy + padStart for leading zeros.
    // Issue 41: ensure PIN is unique within the restaurant.
    const existingPinHashes = await this.prisma.user.findMany({
      where: {
        restaurantId,
        pinHash: { not: null },
        isActive: true,
        id: { not: userId }, // exclude the user being reset
      },
      select: { pinHash: true },
    });
    const rawPin = await this.generateUniquePin(existingPinHashes);
    const pinHash = await bcrypt.hash(rawPin, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { pinHash, pinAttempts: 0, pinLockedUntil: null },
    });

    return { user, rawPin };
  }

  async removeStaffMember(
    restaurantId: string,
    userId: string,
    callerRole: string = 'OWNER',
  ) {
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

  async verifyRestaurantAccess(
    restaurantId: string,
    userId: string,
  ): Promise<void> {
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
      throw new NotFoundException(
        `Restaurant with ID "${restaurantId}" not found`,
      );
    }

    if (restaurant.ownerId === userId) return;

    if (!user || user.restaurantId !== restaurantId) {
      throw new ForbiddenException(
        'You do not have permission to access this resource',
      );
    }
  }
}
