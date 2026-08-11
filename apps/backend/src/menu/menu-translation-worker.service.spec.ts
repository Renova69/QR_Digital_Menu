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
    count: jest.fn(),
  },
  translationRun: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
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
    mockPrisma.menuTranslationState.count.mockResolvedValue(0);
    mockPrisma.translationRun.findFirst.mockResolvedValue(null);
    mockPrisma.translationRun.findUnique.mockResolvedValue(null);
    mockPrisma.translationRun.findMany.mockResolvedValue([]);
    mockPrisma.translationRun.update.mockResolvedValue({ id: 'run-1' });
    mockPrisma.translationRun.updateMany.mockResolvedValue({ count: 0 });
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

  describe('getRestaurantProgress — read model', () => {
    it('is read-only and treats a persisted RUNNING run as active even after its last state becomes current', async () => {
      mockPrisma.translationRun.findFirst.mockResolvedValue({
        id: 'run-1',
        status: 'RUNNING',
        totalUnits: 1,
        locales: ['en'],
        createdAt: new Date(),
      });
      mockPrisma.menuTranslationState.groupBy.mockResolvedValue([
        { status: 'CURRENT', _count: { _all: 1 } },
      ]);

      const result = await service.getRestaurantProgress('rest-1');

      expect(result).toMatchObject({
        active: true,
        done: 1,
        total: 1,
        status: 'COMPLETED',
        runId: 'run-1',
      });
      expect(mockPrisma.translationRun.update).not.toHaveBeenCalled();
    });

    it('does not call a completed run active merely because later work is stale', async () => {
      mockPrisma.translationRun.findFirst.mockResolvedValue({
        id: 'run-1',
        status: 'COMPLETED',
        totalUnits: 1,
        locales: ['en'],
        createdAt: new Date(),
      });
      mockPrisma.menuTranslationState.groupBy.mockResolvedValue([
        { status: 'STALE', _count: { _all: 1 } },
      ]);

      const result = await service.getRestaurantProgress('rest-1');

      expect(result.active).toBe(false);
      expect(result.status).toBe('COMPLETED');
      expect(mockPrisma.translationRun.update).not.toHaveBeenCalled();
    });

    it('scopes an active run to its explicit state membership so later edits cannot join it', async () => {
      const startedAt = new Date('2026-08-09T10:00:00.000Z');
      mockPrisma.translationRun.findFirst.mockResolvedValue({
        id: 'run-2',
        status: 'RUNNING',
        totalUnits: 1,
        locales: ['en'],
        startedAt,
        createdAt: new Date('2026-08-09T10:00:01.000Z'),
      });
      mockPrisma.menuTranslationState.groupBy.mockResolvedValue([
        { status: 'CURRENT', _count: { _all: 1 } },
      ]);

      const result = await service.getRestaurantProgress('rest-1');

      expect(result).toMatchObject({
        done: 1,
        total: 1,
        failed: 0,
        status: 'COMPLETED',
      });
      expect(mockPrisma.menuTranslationState.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            restaurantId: 'rest-1',
            runId: 'run-2',
          },
        }),
      );
    });
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

    it('never claims MANUAL or NEEDS_REVIEW rows', async () => {
      await service.runOnce();

      const claimSql = String(mockPrisma.$queryRawUnsafe.mock.calls[0][0]);
      expect(claimSql).toContain(`"status" IN ('STALE', 'FAILED')`);
      expect(claimSql).not.toContain('MANUAL');
    });

    it('reconciles a RUNNING run after a crash saved its final row but missed finalization', async () => {
      const startedAt = new Date('2026-08-09T10:00:00.000Z');
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
      mockPrisma.translationRun.findMany.mockResolvedValue([
        { id: 'run-1', restaurantId: 'rest-1' },
      ]);
      mockPrisma.translationRun.findUnique.mockResolvedValue({
        id: 'run-1',
        restaurantId: 'rest-1',
        status: 'RUNNING',
        totalUnits: 1,
        locales: ['en'],
        startedAt,
        createdAt: startedAt,
      });
      mockPrisma.menuTranslationState.groupBy.mockResolvedValue([
        { status: 'CURRENT', _count: { _all: 1 } },
      ]);

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
          where: { id: { in: ['state-1'] }, status: 'PENDING' },
          data: expect.objectContaining({ status: 'CURRENT' }),
        }),
      );
    });

    it('cannot demote an owner description that becomes MANUAL while translation is in flight', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        claimedRow({ field: 'DESCRIPTION' }),
      ]);
      mockPrisma.menuItem.findMany.mockResolvedValue([
        { id: 'item-1', name: 'X', description: 'Source description' },
      ]);

      await service.runOnce();

      expect(mockPrisma.menuTranslationState.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['state-1'] }, status: 'PENDING' },
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

      expect(mockPrisma.menuTranslationState.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'state-1', status: 'PENDING' },
          data: expect.objectContaining({
            status: 'FAILED',
            failureCount: 1,
            lastError: 'DeepL down',
          }),
        }),
      );
    });

    it('marks deterministic garbage output NEEDS_REVIEW so it cannot burn quota forever', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([claimedRow()]);
      mockPrisma.menuItem.findMany.mockResolvedValue([
        { id: 'item-1', name: 'Луканка' },
      ]);
      mockMenuTranslation.applyLazyTranslations.mockRejectedValue(
        new Error('Garbage translation detected for "Луканка" -> "Луканка"'),
      );

      await service.runOnce();

      expect(mockPrisma.menuTranslationState.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'state-1', status: 'PENDING' },
          data: expect.objectContaining({
            status: 'NEEDS_REVIEW',
            nextAttemptAt: null,
          }),
        }),
      );
    });

    it('isolates garbage output so valid rows in the same batch still become CURRENT', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        claimedRow({ id: 'state-good', entityId: 'item-good' }),
        claimedRow({ id: 'state-bad', entityId: 'item-bad' }),
      ]);
      mockPrisma.menuItem.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.id.in.map((id: string) => ({
            id,
            name: id === 'item-good' ? 'Супа' : 'Луканка',
          })),
        ),
      );
      mockMenuTranslation.applyLazyTranslations
        .mockRejectedValueOnce(
          new Error('Garbage translation detected for one batch member'),
        )
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(
          new Error('Garbage translation detected for "Луканка"'),
        );

      await service.runOnce();

      expect(mockPrisma.menuTranslationState.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['state-good'] }, status: 'PENDING' },
          data: expect.objectContaining({ status: 'CURRENT' }),
        }),
      );
      expect(mockPrisma.menuTranslationState.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'state-bad', status: 'PENDING' },
          data: expect.objectContaining({ status: 'NEEDS_REVIEW' }),
        }),
      );
    });

    it('isolates a bad field from a good field on the same item', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        claimedRow({ id: 'state-name', field: 'NAME' }),
        claimedRow({ id: 'state-description', field: 'DESCRIPTION' }),
      ]);
      mockPrisma.menuItem.findMany.mockResolvedValue([
        {
          id: 'item-1',
          name: 'Супа',
          description: 'Луканка',
          translations: { en: {} },
        },
      ]);
      mockMenuTranslation.applyLazyTranslations.mockImplementation(
        async (categories: any[]) => {
          const entry = categories[0].items[0].translations.en;
          if (!entry.name && !entry.description) {
            throw new Error('Garbage translation detected for mixed fields');
          }
          if (!entry.description) {
            throw new Error('Garbage translation detected for description');
          }
        },
      );

      await service.runOnce();

      expect(mockPrisma.menuTranslationState.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['state-name'] }, status: 'PENDING' },
          data: expect.objectContaining({ status: 'CURRENT' }),
        }),
      );
      expect(mockPrisma.menuTranslationState.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'state-description', status: 'PENDING' },
          data: expect.objectContaining({ status: 'NEEDS_REVIEW' }),
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

    it('emits a partial progress event when a unit reaches terminal review', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([claimedRow()]);
      mockPrisma.menuItem.findMany.mockResolvedValue([
        { id: 'item-1', name: 'X' },
      ]);
      mockMenuTranslation.applyLazyTranslations.mockRejectedValue(
        new Error('Garbage translation detected for "X"'),
      );
      mockPrisma.menuTranslationState.groupBy.mockResolvedValue([
        { status: 'NEEDS_REVIEW', _count: { _all: 1 } },
      ]);

      await service.runOnce();

      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        'rest-1',
        'translate:progress',
        expect.objectContaining({ status: 'PARTIAL' }),
      );
    });

    it('keeps the persisted run RUNNING while a failed row is still retryable', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([claimedRow()]);
      mockPrisma.menuItem.findMany.mockResolvedValue([
        { id: 'item-1', name: 'X' },
      ]);
      mockMenuTranslation.applyLazyTranslations.mockRejectedValue(
        new Error('temporary provider failure'),
      );
      mockPrisma.menuTranslationState.groupBy.mockResolvedValue([
        { status: 'FAILED', _count: { _all: 1 } },
      ]);
      mockPrisma.menuTranslationState.count.mockResolvedValue(1);
      mockPrisma.translationRun.findFirst.mockResolvedValue({
        id: 'run-1',
        status: 'RUNNING',
        totalUnits: 1,
        locales: ['en'],
        createdAt: new Date(),
      });

      await service.runOnce();

      expect(mockPrisma.translationRun.update).toHaveBeenLastCalledWith({
        where: { id: 'run-1' },
        data: expect.objectContaining({
          status: 'RUNNING',
          doneUnits: 0,
          failedUnits: 1,
        }),
      });
      expect(
        mockPrisma.translationRun.update.mock.calls.at(-1)?.[0].data,
      ).not.toHaveProperty('finishedAt');
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

    it('fails an abandoned QUEUED run so the one-active-run guard can recover', async () => {
      await service.resetStuckPending();

      expect(mockPrisma.translationRun.updateMany).toHaveBeenCalledWith({
        where: {
          status: 'QUEUED',
          updatedAt: { lt: expect.any(Date) },
        },
        data: expect.objectContaining({
          status: 'FAILED',
          finishedAt: expect.any(Date),
        }),
      });
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
