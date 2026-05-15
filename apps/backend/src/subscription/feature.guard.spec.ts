import { Test, TestingModule } from '@nestjs/testing';
import { FeatureGuard } from './feature.guard';
import { FeatureService } from './feature.service';
import { FeatureFlag } from './feature-flag.enum';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException } from '@nestjs/common';

jest.mock('../prisma/prisma.service');

describe('FeatureGuard', () => {
  let guard: FeatureGuard;
  let reflector: Reflector;
  let prismaMock: {
    user: { findUnique: jest.Mock };
    restaurant: { findUnique: jest.Mock; findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prismaMock = {
      user: { findUnique: jest.fn() },
      restaurant: { findUnique: jest.fn(), findFirst: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeatureGuard,
        FeatureService,
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    guard = module.get<FeatureGuard>(FeatureGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  function makeCtx(userId = 'u1') {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user: { id: userId } }) }),
    } as any;
  }

  it('allows if no feature requirement set', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);
    expect(await guard.canActivate(makeCtx())).toBe(true);
  });

  it('allows staff user whose tier has the required feature', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([FeatureFlag.POS]);
    // Staff: has restaurantId
    prismaMock.user.findUnique.mockResolvedValue({ restaurantId: 'rest-1' });
    prismaMock.restaurant.findUnique.mockResolvedValue({ tier: 'ENTERPRISE' });
    expect(await guard.canActivate(makeCtx())).toBe(true);
  });

  it('allows owner whose tier has the required feature', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([FeatureFlag.PAYMENTS_STRIPE]);
    // Owner: no restaurantId, falls back to findFirst by ownerId
    prismaMock.user.findUnique.mockResolvedValue({ restaurantId: null });
    prismaMock.restaurant.findFirst.mockResolvedValue({ tier: 'PROFESSIONAL' });
    expect(await guard.canActivate(makeCtx())).toBe(true);
  });

  it('throws ForbiddenException when staff tier lacks the feature', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([FeatureFlag.POS]);
    prismaMock.user.findUnique.mockResolvedValue({ restaurantId: 'rest-1' });
    prismaMock.restaurant.findUnique.mockResolvedValue({ tier: 'FREE' });
    await expect(guard.canActivate(makeCtx())).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when owner tier lacks the feature', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([FeatureFlag.POS]);
    prismaMock.user.findUnique.mockResolvedValue({ restaurantId: null });
    prismaMock.restaurant.findFirst.mockResolvedValue({ tier: 'STARTER' });
    await expect(guard.canActivate(makeCtx())).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when user has no restaurant', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([FeatureFlag.ORDERS_RECEIVE]);
    prismaMock.user.findUnique.mockResolvedValue({ restaurantId: null });
    prismaMock.restaurant.findFirst.mockResolvedValue(null);
    await expect(guard.canActivate(makeCtx())).rejects.toThrow(ForbiddenException);
  });
});
