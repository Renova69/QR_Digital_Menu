import { Test, TestingModule } from '@nestjs/testing';
import { PlatformSettingsService } from './platform-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';

describe('PlatformSettingsService', () => {
  let service: PlatformSettingsService;

  const singletonSettings = {
    id: 'singleton',
    gdprEnabled: true,
    cookieBannerEnabled: false,
    privacyPolicyEnabled: true,
    termsEnabled: true,
    cookiePolicyEnabled: false,
    erasureEndpointEnabled: false,
    dataExportEndpointEnabled: false,
    cookieBannerText: null,
    privacyPolicyContent: null,
    termsContent: null,
    cookiePolicyContent: null,
    dataControllerName: null,
    dataControllerEmail: null,
    announcementBannerEnabled: false,
    announcementBannerText: null,
    announcementBannerType: 'info',
    updatedById: null,
    updatedAt: new Date(),
  } as any;

  const mockTx = {
    platformSettings: {
      upsert: jest.fn(),
    },
    adminAuditLog: {
      create: jest.fn(),
    },
  };

  const mockPrisma = {
    platformSettings: {
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformSettingsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PlatformSettingsService>(PlatformSettingsService);
    // Reset the internal cache between tests
    (service as any).cache = null;
    (service as any).cacheExpiresAt = 0;

    jest.clearAllMocks();
  });

  describe('getOrCreate', () => {
    it('should upsert the singleton settings row', async () => {
      mockPrisma.platformSettings.upsert.mockResolvedValue(singletonSettings);

      const result = await service.getOrCreate();

      expect(mockPrisma.platformSettings.upsert).toHaveBeenCalledWith({
        where: { id: 'singleton' },
        create: { id: 'singleton' },
        update: {},
      });
      expect(result).toEqual(singletonSettings);
    });
  });

  describe('getSettings', () => {
    it('should return cached settings when cache is fresh', async () => {
      (service as any).cache = singletonSettings;
      (service as any).cacheExpiresAt = Date.now() + 30_000;

      const result = await service.getSettings();

      expect(mockPrisma.platformSettings.upsert).not.toHaveBeenCalled();
      expect(result).toEqual(singletonSettings);
    });

    it('should fetch from DB when cache is stale', async () => {
      (service as any).cacheExpiresAt = 0;
      mockPrisma.platformSettings.upsert.mockResolvedValue(singletonSettings);

      const result = await service.getSettings();

      expect(mockPrisma.platformSettings.upsert).toHaveBeenCalled();
      expect(result).toEqual(singletonSettings);
    });
  });

  describe('updateSettings', () => {
    it('should update settings within a transaction and audit log', async () => {
      const dto: UpdatePlatformSettingsDto = {
        gdprEnabled: false,
        privacyPolicyContent: { en: 'New policy' },
      };
      const updatedSettings = { ...singletonSettings, ...dto };
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        mockTx.platformSettings.upsert.mockResolvedValue(updatedSettings);
        return fn(mockTx);
      });

      const result = await service.updateSettings(dto, 'user-1');

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockTx.platformSettings.upsert).toHaveBeenCalledWith({
        where: { id: 'singleton' },
        create: { id: 'singleton', ...dto, updatedById: 'user-1' },
        update: { ...dto, updatedById: 'user-1' },
      });
      expect(mockTx.adminAuditLog.create).toHaveBeenCalledWith({
        data: {
          actorUserId: 'user-1',
          action: 'PLATFORM_SETTINGS_UPDATE',
          targetType: 'PlatformSettings',
          targetId: 'singleton',
          metadata: { changedKeys: ['gdprEnabled', 'privacyPolicyContent'] },
        },
      });
      expect(result).toEqual(updatedSettings);
    });

    it('should update cache after write', async () => {
      const dto: UpdatePlatformSettingsDto = { termsEnabled: false };
      const updatedSettings = { ...singletonSettings, ...dto };
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        mockTx.platformSettings.upsert.mockResolvedValue(updatedSettings);
        return fn(mockTx);
      });

      await service.updateSettings(dto, 'user-1');

      expect((service as any).cache).toEqual(updatedSettings);
      expect((service as any).cacheExpiresAt).toBeGreaterThan(Date.now());
    });
  });

  describe('getPublicPayload', () => {
    it('should return only public-safe fields', () => {
      const payload = service.getPublicPayload(singletonSettings);

      expect(payload).toEqual({
        gdprEnabled: true,
        cookieBannerEnabled: false,
        privacyPolicyEnabled: true,
        termsEnabled: true,
        cookiePolicyEnabled: false,
        erasureEndpointEnabled: false,
        dataExportEndpointEnabled: false,
        cookieBannerText: null,
        privacyPolicyContent: null,
        termsContent: null,
        cookiePolicyContent: null,
        dataControllerName: null,
        dataControllerEmail: null,
        announcementBannerEnabled: false,
        announcementBannerText: null,
        announcementBannerType: 'info',
      });
      // Must not leak internal fields
      expect((payload as any).id).toBeUndefined();
      expect((payload as any).updatedById).toBeUndefined();
    });
  });
});
