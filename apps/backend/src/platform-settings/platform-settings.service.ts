import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';
import { PlatformSettings, Prisma } from '@prisma/client';

@Injectable()
export class PlatformSettingsService {
  private cache: PlatformSettings | null = null;
  private cacheExpiresAt = 0;
  private readonly CACHE_TTL_MS = 30_000;
  // Changing any of these invalidates previously-given cookie consent —
  // policyVersion bumps so the frontend re-prompts. Unrelated settings
  // (retention windows, announcement banner) never force a re-prompt.
  private readonly POLICY_VERSION_FIELDS = [
    'cookieBannerEnabled',
    'cookieBannerText',
    'analyticsCookieEnabled',
  ];

  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(): Promise<PlatformSettings> {
    return this.prisma.platformSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton' },
      update: {},
    });
  }

  async getSettings(): Promise<PlatformSettings> {
    const now = Date.now();
    if (this.cache && now < this.cacheExpiresAt) {
      return this.cache;
    }
    const settings = await this.getOrCreate();
    this.cache = settings;
    this.cacheExpiresAt = now + this.CACHE_TTL_MS;
    return settings;
  }

  async updateSettings(
    dto: UpdatePlatformSettingsDto,
    updatedById: string,
  ): Promise<PlatformSettings> {
    const changedKeys = Object.keys(dto);
    const bumpPolicyVersion = changedKeys.some((key) =>
      this.POLICY_VERSION_FIELDS.includes(key),
    );
    let settings!: PlatformSettings;

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      settings = await tx.platformSettings.upsert({
        where: { id: 'singleton' },
        create: { id: 'singleton', ...dto, updatedById },
        update: {
          ...dto,
          updatedById,
          ...(bumpPolicyVersion ? { policyVersion: { increment: 1 } } : {}),
        },
      });
      await tx.adminAuditLog.create({
        data: {
          actorUserId: updatedById,
          action: 'PLATFORM_SETTINGS_UPDATE',
          targetType: 'PlatformSettings',
          targetId: 'singleton',
          metadata: { changedKeys },
        },
      });
    });

    this.cache = settings;
    this.cacheExpiresAt = Date.now() + this.CACHE_TTL_MS;
    return settings;
  }

  getPublicPayload(settings: PlatformSettings) {
    return {
      gdprEnabled: settings.gdprEnabled,
      cookieBannerEnabled: settings.cookieBannerEnabled,
      privacyPolicyEnabled: settings.privacyPolicyEnabled,
      termsEnabled: settings.termsEnabled,
      cookiePolicyEnabled: settings.cookiePolicyEnabled,
      erasureEndpointEnabled: settings.erasureEndpointEnabled,
      dataExportEndpointEnabled: settings.dataExportEndpointEnabled,
      analyticsCookieEnabled: settings.analyticsCookieEnabled,
      policyVersion: settings.policyVersion,
      cookieBannerText: settings.cookieBannerText,
      privacyPolicyContent: settings.privacyPolicyContent,
      termsContent: settings.termsContent,
      cookiePolicyContent: settings.cookiePolicyContent,
      dataControllerName: settings.dataControllerName,
      dataControllerEmail: settings.dataControllerEmail,
      announcementBannerEnabled: settings.announcementBannerEnabled,
      announcementBannerText: settings.announcementBannerText ?? null,
      announcementBannerType: settings.announcementBannerType,
    };
  }
}
