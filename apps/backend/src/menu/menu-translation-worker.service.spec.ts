import { Test, TestingModule } from '@nestjs/testing';
import { MenuTranslationWorkerService } from './menu-translation-worker.service';
import { PrismaService } from '../prisma/prisma.service';
import { MenuTranslationService } from './menu-translation.service';
import { TranslationService } from '../translation/translation.service';
import { TranslationQuotaService } from '../translation/translation-quota.service';
import { DeepLGlossaryService } from '../translation/deepl-glossary.service';
import { EventsGateway } from '../events/events.gateway';

const mockPrisma = {
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
  restaurant: { findUnique: jest.fn() },
  menuCategory: { findMany: jest.fn() },
  menuItem: { findMany: jest.fn() },
  menuOption: { findMany: jest.fn() },
  menuTranslationState: {
    updateMany: jest.fn(),
    update: jest.fn(),
    groupBy: jest.fn(),
  },
  translationRun: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

const mockMenuTranslation = { applyLazyTranslations: jest.fn() };
const mockTranslationService = { isEnabled: jest.fn() };
const mockQuota = { assertCanSpend: jest.fn() };
const mockGlossary = { ensureGlossary: jest.fn() };
const mockEvents = { emitToRestaurant: jest.fn() };

const claimedRow = (overrides: object = {}) => ({
  id: 'state-1',
  restaurantId: 'rest-1',
  entityType: 'ITEM',
  entityId: 'item-1',
  field: 'NAME',
  locale: 'en',
  sourceLang: 'bg',
  failureCount: 0,
  ...overrides,
});

describe('MenuTranslationWorkerService', () => {
  let service: MenuTranslationWorkerService;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv, TRANSLATION_ENABLED: 'true' };
    jest.clearAllMocks();
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    mockPrisma.$executeRawUnsafe.mockResolvedValue(0);
    mockPrisma.menuTranslationState.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.menuTranslationState.groupBy.mockResolvedValue([
      { status: 'CURRENT', _count: { _all: 1 } },
    ]);
    mockPrisma.translationRun.findFirst.mockResolvedValue(null);
    mockQuota.assertCanSpend.mockResolvedValue({
      allowed: true,
      remaining: 1000,
    });
    mockGlossary.ensureGlossary.mockResolvedValue(undefined);
    mockMenuTranslation.applyLazyTranslations.mockResolvedValue(undefined);
    mockTranslationService.isEnabled.mockReturnValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MenuTranslationWorkerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MenuTranslationService, useValue: mockMenuTranslation },
        { provide: TranslationService, useValue: mockTranslationService },
        { provide: TranslationQuotaService, useValue: mockQuota },
        { provide: DeepLGlossaryService, useValue: mockGlossary },
        { provide: EventsGateway, useValue: mockEvents },
      ],
    }).compile();
    service = module.get<MenuTranslationWorkerService>(
      MenuTranslationWorkerService,
    );
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('tick / kick — kill switch', () => {
    it('tick does nothing when TRANSLATION_ENABLED is not "true"', async () => {
      delete process.env.TRANSLATION_ENABLED;
      await service.tick();
      expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it('kick does nothing when TRANSLATION_ENABLED is not "true"', () => {
      delete process.env.TRANSLATION_ENABLED;
      service.kick();
      expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it('tick claims a batch when enabled', async () => {
      await service.tick();
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE SKIP LOCKED'),
        expect.any(Number),
        expect.any(Number),
      );
    });
  });

  describe('runOnce — mutex', () => {
    it('does nothing when nothing is claimed', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
      await service.runOnce();
      expect(mockPrisma.restaurant.findUnique).not.toHaveBeenCalled();
    });

    it('does not even claim when the translation provider is not configured — mirrors the old translateAll upfront check, prevents caching source text as a fake translation', async () => {
      mockTranslationService.isEnabled.mockReturnValue(false);
      await service.runOnce();
      expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it('does not run two overlapping invocations concurrently', async () => {
      let resolveClaim: (v: any[]) => void;
      mockPrisma.$queryRawUnsafe.mockReturnValueOnce(
        new Promise((r) => {
          resolveClaim = r;
        }),
      );
      const first = service.runOnce();
      const second = service.runOnce(); // should be a no-op — mutex held
      resolveClaim!([]);
      await Promise.all([first, second]);
      // Only the first call actually queried — the second returned immediately.
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    });
  });

  describe('processGroup — quota', () => {
    it('releases claimed rows back to STALE and emits quota_blocked when quota denies', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([claimedRow()]);
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest-1',
        tier: 'STARTER',
      });
      mockPrisma.menuItem.findMany.mockResolvedValue([
        { name: 'X', description: null },
      ]);
      mockQuota.assertCanSpend.mockResolvedValue({
        allowed: false,
        reason: 'platform_quota_exceeded',
        remaining: 0,
      });

      await service.runOnce();

      expect(mockPrisma.menuTranslationState.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'STALE' }),
        }),
      );
      expect(mockMenuTranslation.applyLazyTranslations).not.toHaveBeenCalled();
      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        'rest-1',
        'translate:progress',
        expect.objectContaining({ status: 'QUOTA_BLOCKED' }),
      );
    });

    it('marks CURRENT if the restaurant was deleted since enqueue', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([claimedRow()]);
      mockPrisma.restaurant.findUnique.mockResolvedValue(null);

      await service.runOnce();

      expect(mockPrisma.menuTranslationState.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'CURRENT' }),
        }),
      );
      expect(mockMenuTranslation.applyLazyTranslations).not.toHaveBeenCalled();
    });
  });

  describe('processGroup — success/failure per entity type', () => {
    beforeEach(() => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest-1',
        tier: 'PROFESSIONAL',
      });
    });

    it('wraps a claimed ITEM in a synthetic pre-translated category before calling applyLazyTranslations', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        claimedRow({ entityType: 'ITEM' }),
      ]);
      mockPrisma.menuItem.findMany.mockResolvedValue([
        { id: 'item-1', name: 'Кебапче' },
      ]);

      await service.runOnce();

      expect(mockMenuTranslation.applyLazyTranslations).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            translations: { en: { name: ' ' } },
            items: expect.arrayContaining([
              expect.objectContaining({ id: 'item-1' }),
            ]),
          }),
        ],
        'en',
        'bg',
        expect.objectContaining({ restaurantId: 'rest-1' }),
      );
    });

    it('removes only the claimed cached field so a stale value is regenerated', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        claimedRow({ entityType: 'ITEM', field: 'NAME' }),
      ]);
      mockPrisma.menuItem.findMany.mockResolvedValue([
        {
          id: 'item-1',
          name: 'Шкембе на фурна',
          description: 'Традиционно',
          translations: {
            en: { name: 'Шкембе на фурна', description: 'Traditional' },
          },
        },
      ]);

      await service.runOnce();

      const [categories] =
        mockMenuTranslation.applyLazyTranslations.mock.calls[0];
      expect(categories[0].items[0].translations.en).toEqual({
        description: 'Traditional',
      });
    });

    it('wraps a claimed OPTION in synthetic category+item before calling applyLazyTranslations', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        claimedRow({ entityType: 'OPTION', entityId: 'opt-1' }),
      ]);
      mockPrisma.menuOption.findMany.mockResolvedValue([
        { id: 'opt-1', name: 'Size' },
      ]);

      await service.runOnce();

      const [categories] =
        mockMenuTranslation.applyLazyTranslations.mock.calls[0];
      expect(categories[0].items[0].options).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: 'opt-1' })]),
      );
    });

    it('passes real category rows directly (no synthetic wrapper) for CATEGORY claims', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        claimedRow({ entityType: 'CATEGORY', entityId: 'cat-1' }),
      ]);
      mockPrisma.menuCategory.findMany.mockResolvedValue([
        { id: 'cat-1', name: 'Мезета' },
      ]);

      await service.runOnce();

      expect(mockMenuTranslation.applyLazyTranslations).toHaveBeenCalledWith(
        [expect.objectContaining({ id: 'cat-1' })],
        'en',
        'bg',
        expect.any(Object),
      );
    });

    it('marks the claimed state row CURRENT on success', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([claimedRow()]);
      mockPrisma.menuItem.findMany.mockResolvedValue([
        { id: 'item-1', name: 'X' },
      ]);

      await service.runOnce();

      expect(mockPrisma.menuTranslationState.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['state-1'] } },
          data: expect.objectContaining({ status: 'CURRENT' }),
        }),
      );
    });

    it('marks the claimed state row FAILED with backoff on translation failure', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        claimedRow({ failureCount: 0 }),
      ]);
      mockPrisma.menuItem.findMany.mockResolvedValue([
        { id: 'item-1', name: 'X' },
      ]);
      mockMenuTranslation.applyLazyTranslations.mockRejectedValue(
        new Error('DeepL down'),
      );

      await service.runOnce();

      expect(mockPrisma.menuTranslationState.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'state-1' },
          data: expect.objectContaining({
            status: 'FAILED',
            failureCount: 1,
            lastError: 'DeepL down',
          }),
        }),
      );
    });

    it('emits a completed progress event on full success', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([claimedRow()]);
      mockPrisma.menuItem.findMany.mockResolvedValue([
        { id: 'item-1', name: 'X' },
      ]);

      await service.runOnce();

      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        'rest-1',
        'translate:progress',
        expect.objectContaining({ status: 'COMPLETED' }),
      );
    });

    it('finalizes the persisted run when its last queued unit completes', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([claimedRow()]);
      mockPrisma.menuItem.findMany.mockResolvedValue([
        { id: 'item-1', name: 'X' },
      ]);
      mockPrisma.menuTranslationState.groupBy.mockResolvedValue([
        { status: 'CURRENT', _count: { _all: 1 } },
      ]);
      mockPrisma.translationRun.findFirst.mockResolvedValue({
        id: 'run-1',
        status: 'RUNNING',
        totalUnits: 1,
        locales: ['en'],
        createdAt: new Date(),
      });

      await service.runOnce();

      expect(mockPrisma.translationRun.update).toHaveBeenCalledWith({
        where: { id: 'run-1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          doneUnits: 1,
          failedUnits: 0,
          finishedAt: expect.any(Date),
        }),
      });
    });

    it('reports done/total against ALL outstanding restaurant work, not just this batch (2026-07-25 live-data fix)', async () => {
      // Batch claims only 1 row, but the restaurant has far more queued
      // overall (e.g. 100 CURRENT already + 50 still STALE) — done/total
      // must reflect the whole run, not the batch size, or the dashboard
      // progress bar shows a misleadingly "complete" small total (was
      // observed live as "50/50" while most of the run was still queued).
      mockPrisma.$queryRawUnsafe.mockResolvedValue([claimedRow()]);
      mockPrisma.menuItem.findMany.mockResolvedValue([
        { id: 'item-1', name: 'X' },
      ]);
      mockPrisma.menuTranslationState.groupBy.mockResolvedValue([
        { status: 'CURRENT', _count: { _all: 101 } },
        { status: 'STALE', _count: { _all: 50 } },
      ]);

      await service.runOnce();

      expect(mockPrisma.menuTranslationState.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { restaurantId: 'rest-1' } }),
      );
      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        'rest-1',
        'translate:progress',
        expect.objectContaining({ done: 101, total: 151 }),
      );
    });

    it('emits a partial progress event when some entity types failed', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([claimedRow()]);
      mockPrisma.menuItem.findMany.mockResolvedValue([
        { id: 'item-1', name: 'X' },
      ]);
      mockMenuTranslation.applyLazyTranslations.mockRejectedValue(
        new Error('fail'),
      );

      await service.runOnce();

      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        'rest-1',
        'translate:progress',
        expect.objectContaining({ status: 'PARTIAL' }),
      );
    });

    it('groups claimed rows by (restaurantId, locale) and processes each group independently', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        claimedRow({
          id: 's1',
          restaurantId: 'rest-1',
          locale: 'en',
          entityId: 'item-1',
        }),
        claimedRow({
          id: 's2',
          restaurantId: 'rest-2',
          locale: 'de',
          entityId: 'item-2',
        }),
      ]);
      mockPrisma.restaurant.findUnique.mockImplementation(({ where }: any) =>
        Promise.resolve({ id: where.id, tier: 'PROFESSIONAL' }),
      );
      mockPrisma.menuItem.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve([{ id: where.id.in[0], name: 'X' }]),
      );

      await service.runOnce();

      expect(mockMenuTranslation.applyLazyTranslations).toHaveBeenCalledTimes(
        2,
      );
      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        'rest-1',
        'translate:progress',
        expect.any(Object),
      );
      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        'rest-2',
        'translate:progress',
        expect.any(Object),
      );
    });
  });

  describe('resetStuckPending', () => {
    it('resets PENDING rows older than the stuck threshold back to STALE', async () => {
      mockPrisma.menuTranslationState.updateMany.mockResolvedValue({
        count: 3,
      });
      await service.resetStuckPending();
      expect(mockPrisma.menuTranslationState.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PENDING' }),
          data: { status: 'STALE', claimedAt: null },
        }),
      );
    });

    it('does nothing when TRANSLATION_ENABLED is not "true"', async () => {
      delete process.env.TRANSLATION_ENABLED;
      await service.resetStuckPending();
      expect(mockPrisma.menuTranslationState.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('reapOrphans', () => {
    it('issues one DELETE per entity type', async () => {
      await service.reapOrphans();
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(3);
    });
  });
});
