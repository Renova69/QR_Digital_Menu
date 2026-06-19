import {
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';

const ENROLLMENT_TTL_MINUTES = 10;

@Injectable()
export class DeviceEnrollmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  private get tokenStore() {
    return this.prisma.deviceEnrollmentToken;
  }

  private hashToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async verifyManagerAccess(restaurantId: string, userId: string) {
    const [restaurant, user] = await Promise.all([
      this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: {
          id: true,
          name: true,
          ownerId: true,
          sharedDeviceModeEnabled: true,
        },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, restaurantId: true },
      }),
    ]);

    if (!restaurant) {
      throw new NotFoundException(
        `Restaurant with ID "${restaurantId}" not found`,
      );
    }

    const role = user?.role?.toUpperCase();
    const isOwner = restaurant.ownerId === userId;
    const isAssignedManager =
      role === 'MANAGER' && user?.restaurantId === restaurantId;

    if (!isOwner && !isAssignedManager) {
      throw new ForbiddenException(
        'Only owners and managers can enroll staff devices',
      );
    }

    return restaurant;
  }

  async createEnrollment(
    restaurantId: string,
    createdById: string,
    frontendBaseUrl: string,
  ) {
    const restaurant = await this.verifyManagerAccess(restaurantId, createdById);

    if (restaurant.sharedDeviceModeEnabled === false) {
      throw new ForbiddenException({
        code: 'SHARED_DEVICE_MODE_DISABLED',
        message:
          'Shared Device Mode is off. Enable it before generating staff device QR links.',
      });
    }

    // L2.3 — Cap active (unused, non-expired, non-revoked) tokens to prevent
    // unbounded accumulation. If the limit is reached the caller must wait for
    // tokens to expire or revoke an existing one.
    const MAX_ACTIVE_TOKENS = 10;
    const activeCount = await this.tokenStore.count({
      where: {
        restaurantId,
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (activeCount >= MAX_ACTIVE_TOKENS) {
      throw new ForbiddenException(
        `Maximum of ${MAX_ACTIVE_TOKENS} active enrollment links reached. ` +
          'Wait for existing links to expire or revoke one first.',
      );
    }

    const rawToken = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + ENROLLMENT_TTL_MINUTES * 60 * 1000);

    await this.tokenStore.create({
      data: {
        tokenHash: this.hashToken(rawToken),
        restaurantId,
        createdById,
        expiresAt,
      },
    });

    const baseUrl = frontendBaseUrl.replace(/\/$/, '');
    const enrollmentUrl = `${baseUrl}/device-enroll?token=${encodeURIComponent(rawToken)}`;

    return { enrollmentUrl, expiresAt };
  }

  async listEnrollments(restaurantId: string, userId: string) {
    await this.verifyManagerAccess(restaurantId, userId);

    return this.tokenStore.findMany({
      where: { restaurantId },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        usedAt: true,
        revokedAt: true,
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        staffBindings: {
          orderBy: { lastSeenAt: 'desc' },
          take: 5,
          select: {
            firstSeenAt: true,
            lastSeenAt: true,
            user: {
              select: { id: true, name: true, email: true, role: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /** Revoke an enrolled device so it can no longer authenticate via PIN login.
   *  Only owners and managers of the restaurant can revoke tokens. */
  async revokeEnrollment(
    tokenId: string,
    restaurantId: string,
    userId: string,
  ) {
    await this.verifyManagerAccess(restaurantId, userId);

    const token = await this.tokenStore.findFirst({
      where: { id: tokenId, restaurantId },
      select: { id: true, revokedAt: true },
    });

    if (!token) {
      throw new NotFoundException(
        `Enrollment token "${tokenId}" not found for this restaurant`,
      );
    }
    if (token.revokedAt) {
      throw new ForbiddenException('This enrollment has already been revoked');
    }

    const revokedAt = new Date();

    await this.tokenStore.update({
      where: { id: tokenId },
      data: { revokedAt },
    });

    await this.eventsGateway.evictDeviceToken(token.id, 'device_revoked');

    return { success: true, revokedAt };
  }

  async revokeRestaurantDevices(
    restaurantId: string,
    reason = 'shared_device_mode_disabled',
  ) {
    const revokedAt = new Date();
    const tokens = await this.tokenStore.findMany({
      where: { restaurantId, revokedAt: null },
      select: { id: true },
    });

    if (tokens.length === 0) {
      return { success: true, revokedAt, count: 0 };
    }

    await this.tokenStore.updateMany({
      where: { restaurantId, revokedAt: null },
      data: { revokedAt },
    });

    await Promise.all(
      tokens.map((token) => this.eventsGateway.evictDeviceToken(token.id, reason)),
    );

    return { success: true, revokedAt, count: tokens.length };
  }

  async evictRestaurantDevices(
    restaurantId: string,
    reason = 'shared_device_mode_disabled',
  ) {
    const tokens = await this.tokenStore.findMany({
      where: {
        restaurantId,
        revokedAt: null,
        usedAt: { not: null },
      },
      select: { id: true },
    });

    if (tokens.length > 0) {
      await this.tokenStore.updateMany({
        where: {
          restaurantId,
          revokedAt: null,
          usedAt: { not: null },
        },
        data: { sessionVersion: { increment: 1 } },
      });
    }

    await Promise.all(
      tokens.map((token) => this.eventsGateway.evictDeviceToken(token.id, reason)),
    );

    return { success: true, count: tokens.length };
  }

  async getDeviceStatus(token: string) {
    const tokenHash = this.hashToken(token);
    const tokenRecord = await this.tokenStore.findUnique({
      where: { tokenHash },
      include: {
        restaurant: {
          select: { id: true, name: true, sharedDeviceModeEnabled: true },
        },
      },
    });

    if (!tokenRecord || !tokenRecord.usedAt) {
      throw new UnauthorizedException(
        'This device is not enrolled for staff PIN login.',
      );
    }
    if (tokenRecord.revokedAt) {
      throw new GoneException('Device enrollment link has been revoked');
    }

    return {
      restaurantId: tokenRecord.restaurant.id,
      restaurantName: tokenRecord.restaurant.name,
      sharedDeviceModeEnabled: tokenRecord.restaurant.sharedDeviceModeEnabled,
      enrolled: true,
      revoked: false,
    };
  }

  async verifyEnrollment(token: string) {
    const tokenHash = this.hashToken(token);
    const now = new Date();

    const tokenRecord = await this.tokenStore.findUnique({
      where: { tokenHash },
      include: {
        restaurant: {
          select: { id: true, name: true, sharedDeviceModeEnabled: true },
        },
      },
    });

    if (!tokenRecord) {
      throw new UnauthorizedException('Invalid device enrollment link');
    }
    if (tokenRecord.revokedAt) {
      throw new GoneException('Device enrollment link has been revoked');
    }
    if (tokenRecord.usedAt) {
      throw new GoneException('Device enrollment link has already been used');
    }
    if (tokenRecord.expiresAt <= now) {
      throw new GoneException('Device enrollment link has expired');
    }
    if (tokenRecord.restaurant.sharedDeviceModeEnabled === false) {
      throw new ForbiddenException({
        code: 'SHARED_DEVICE_MODE_DISABLED',
        message:
          'Shared Device Mode is off. Ask a manager to enable it before enrolling this device.',
      });
    }

    // Atomic single-use claim (#M4). Marking usedAt in a guarded updateMany
    // means only one of N concurrent requests can win — a find→check→update
    // sequence let two requests both pass the usedAt check and consume the link.
    const claim = await this.tokenStore.updateMany({
      where: {
        tokenHash,
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });

    if (claim.count === 0) {
      // Claim failed — disambiguate the reason for a useful error.
      const existing = await this.tokenStore.findUnique({
        where: { tokenHash },
        select: { usedAt: true, expiresAt: true, revokedAt: true },
      });
      if (!existing) {
        throw new UnauthorizedException('Invalid device enrollment link');
      }
      if (existing.revokedAt) {
        throw new GoneException('Device enrollment link has been revoked');
      }
      if (existing.usedAt) {
        throw new GoneException('Device enrollment link has already been used');
      }
      throw new GoneException('Device enrollment link has expired');
    }

    return {
      restaurantId: tokenRecord.restaurant.id,
      restaurantName: tokenRecord.restaurant.name,
      allowedModes: ['POS', 'KDS'],
    };
  }
}
