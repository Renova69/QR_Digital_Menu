import { Test, TestingModule } from '@nestjs/testing';
import { HelpContentService } from './help-content.service';
import { PrismaService } from '../prisma/prisma.service';

describe('HelpContentService', () => {
  let service: HelpContentService;
  let prisma: PrismaService;

  const mockPrisma = {
    helpContent: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    adminAuditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const ACTOR = 'test-actor-id';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HelpContentService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<HelpContentService>(HelpContentService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('findBySection', () => {
    it('should return items for a section sorted by sortOrder', async () => {
      const items = [
        {
          id: '1',
          section: 'landing',
          categoryKey: 'general',
          itemKey: 'q1',
          sortOrder: 0,
          locale: 'en',
          title: 'What?',
          body: 'Answer',
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockPrisma.helpContent.findMany.mockResolvedValue(items);

      const result = await service.findBySection('landing');

      expect(result).toEqual(items);
      expect(mockPrisma.helpContent.findMany).toHaveBeenCalledWith({
        where: { section: 'landing' },
        orderBy: { sortOrder: 'asc' },
      });
    });
  });

  describe('findBySectionAndLocale', () => {
    it('should filter by section and locale, only active items', async () => {
      await service.findBySectionAndLocale('landing', 'en');

      expect(mockPrisma.helpContent.findMany).toHaveBeenCalledWith({
        where: { section: 'landing', locale: 'en', active: true },
        orderBy: { sortOrder: 'asc' },
      });
    });
  });

  describe('create', () => {
    it('should create a help content item', async () => {
      const dto = {
        section: 'landing',
        categoryKey: 'general',
        itemKey: 'q9',
        locale: 'en',
        title: 'New?',
        body: 'New answer',
      };
      const created = {
        id: 'new-id',
        ...dto,
        sortOrder: 0,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.helpContent.create.mockResolvedValue(created);

      const result = await service.create(dto, ACTOR);

      expect(result).toEqual(created);
    });
  });

  describe('update', () => {
    it('should update a help content item', async () => {
      const updated = { id: '1', title: 'Updated' };
      mockPrisma.helpContent.update.mockResolvedValue(updated);

      const result = await service.update('1', { title: 'Updated' }, ACTOR);

      expect(result).toEqual(updated);
    });
  });

  describe('delete', () => {
    it('should delete a help content item', async () => {
      mockPrisma.helpContent.delete.mockResolvedValue({ id: '1' });

      mockPrisma.helpContent.findUnique.mockResolvedValue({
        section: 'landing',
        locale: 'en',
      });
      const result = await service.delete('1', ACTOR);

      expect(result).toEqual({ deleted: true });
    });
  });

  describe('reorder', () => {
    it('should bulk update sortOrder in a transaction', async () => {
      mockPrisma.helpContent.update.mockResolvedValue({
        id: '1',
        sortOrder: 0,
      });

      await service.reorder(
        [
          { id: '1', sortOrder: 0 },
          { id: '2', sortOrder: 1 },
        ],
        ACTOR,
      );

      expect(mockPrisma.helpContent.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('deleteByCategory', () => {
    it('should delete all items in a category', async () => {
      mockPrisma.helpContent.deleteMany.mockResolvedValue({ count: 3 });

      const result = await service.deleteByCategory('landing', 'general');

      expect(mockPrisma.helpContent.deleteMany).toHaveBeenCalledWith({
        where: { section: 'landing', categoryKey: 'general' },
      });
      expect(result).toEqual({ count: 3 });
    });
  });
});
