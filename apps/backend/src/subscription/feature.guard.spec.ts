import { Test, TestingModule } from '@nestjs/testing';
import { FeatureGuard } from './feature.guard';
import { FeatureService } from './feature.service';
import { FeatureFlag } from './feature-flag.enum';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: jest.fn(),
}));

describe('FeatureGuard', () => {
  let guard: FeatureGuard;
  let reflector: Reflector;
  let featureService: FeatureService;
  let prismaMock: { user: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prismaMock = { user: { findUnique: jest.fn() } };
    const { PrismaService: MockPrismaService } = await import('../prisma/prisma.service');
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeatureGuard,
        FeatureService,
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
        { provide: MockPrismaService, useValue: prismaMock },
      ],
    }).compile();
    guard = module.get<FeatureGuard>(FeatureGuard);
    reflector = module.get<Reflector>(Reflector);
    featureService = module.get<FeatureService>(FeatureService);
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

  it('allows if user tier has the required feature', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([FeatureFlag.POS]);
    prismaMock.user.findUnique.mockResolvedValue({
      staffRestaurant: { tier: 'ENTERPRISE' },
    });
    expect(await guard.canActivate(makeCtx())).toBe(true);
  });

  it('throws ForbiddenException if user tier lacks the feature', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([FeatureFlag.POS]);
    prismaMock.user.findUnique.mockResolvedValue({
      staffRestaurant: { tier: 'FREE' },
    });
    await expect(guard.canActivate(makeCtx())).rejects.toThrow(ForbiddenException);
  });
});
