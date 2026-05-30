import {
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

const ENROLLMENT_TTL_MINUTES = 10;

@Injectable()
export class DeviceEnrollmentService {
  constructor(private readonly prisma: PrismaService) {}

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
        select: { id: true, name: true, ownerId: true },
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
    await this.verifyManagerAccess(restaurantId, createdById);

    const rawToken = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + ENROLLMENT_TTL_MINUTES * 60 * 1000,
    );

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
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
  }

  async verifyEnrollment(token: string) {
    const tokenHash = this.hashToken(token);

    // Atomic single-use claim (#M4). Marking usedAt in a guarded updateMany
    // means only one of N concurrent requests can win — a find→check→update
    // sequence let two requests both pass the usedAt check and consume the link.
    const claim = await this.tokenStore.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });

    if (claim.count === 0) {
      // Claim failed — disambiguate the reason for a useful error.
      const existing = await this.tokenStore.findUnique({
        where: { tokenHash },
        select: { usedAt: true, expiresAt: true },
      });
      if (!existing) {
        throw new UnauthorizedException('Invalid device enrollment link');
      }
      if (existing.usedAt) {
        throw new GoneException('Device enrollment link has already been used');
      }
      throw new GoneException('Device enrollment link has expired');
    }

    const tokenRecord = await this.tokenStore.findUnique({
      where: { tokenHash },
      include: {
        restaurant: {
          select: { id: true, name: true },
        },
      },
    });

    return {
      restaurantId: tokenRecord!.restaurant.id,
      restaurantName: tokenRecord!.restaurant.name,
      allowedModes: ['POS', 'KDS'],
    };
  }
}
