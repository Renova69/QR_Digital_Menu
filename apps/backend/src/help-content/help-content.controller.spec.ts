import { Test, TestingModule } from '@nestjs/testing';
import { HelpContentController } from './help-content.controller';
import { HelpContentService } from './help-content.service';

describe('HelpContentController', () => {
  let controller: HelpContentController;
  let service: HelpContentService;

  const mockService = {
    findBySection: jest.fn().mockResolvedValue([]),
    findBySectionAndLocale: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    reorder: jest.fn(),
    deleteByCategory: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HelpContentController],
      providers: [{ provide: HelpContentService, useValue: mockService }],
    }).compile();

    controller = module.get<HelpContentController>(HelpContentController);
    service = module.get<HelpContentService>(HelpContentService);
  });

  describe('GET /help-content/:section', () => {
    it('should return items for section filtered by locale query param', async () => {
      mockService.findBySectionAndLocale.mockResolvedValue([
        { id: '1', title: 'Test' },
      ]);

      const result = await controller.getPublic('landing', 'en');

      expect(mockService.findBySectionAndLocale).toHaveBeenCalledWith(
        'landing',
        'en',
      );
      expect(result).toEqual([{ id: '1', title: 'Test' }]);
    });

    it('should default locale to en when not provided', async () => {
      await controller.getPublic('dashboard');

      expect(mockService.findBySectionAndLocale).toHaveBeenCalledWith(
        'dashboard',
        'en',
      );
    });
  });

  describe('GET /super-admin/help-content', () => {
    it('should return all items for section', async () => {
      mockService.findBySection.mockResolvedValue([{ id: '1' }, { id: '2' }]);

      const result = await controller.getAll('landing');

      expect(result).toHaveLength(2);
    });
  });

  describe('POST /super-admin/help-content', () => {
    it('should create an item', async () => {
      const dto = {
        section: 'landing',
        categoryKey: 'general',
        itemKey: 'q1',
        locale: 'en',
        title: 'Q',
        body: 'A',
      };
      mockService.create.mockResolvedValue({ id: '1', ...dto });

      const result = await controller.create(dto);

      expect(result).toHaveProperty('id', '1');
    });
  });

  describe('PATCH /super-admin/help-content/:id', () => {
    it('should update an item', async () => {
      mockService.update.mockResolvedValue({ id: '1', title: 'Updated' });

      const result = await controller.update('1', { title: 'Updated' });

      expect(result).toHaveProperty('title', 'Updated');
    });
  });

  describe('DELETE /super-admin/help-content/:id', () => {
    it('should delete an item', async () => {
      mockService.delete.mockResolvedValue({ id: '1' });

      const result = await controller.delete('1');

      expect(result).toEqual({ id: '1' });
    });
  });

  describe('PATCH /super-admin/help-content/reorder', () => {
    it('should reorder items', async () => {
      await controller.reorder({ items: [{ id: '1', sortOrder: 0 }] });

      expect(mockService.reorder).toHaveBeenCalledWith([
        { id: '1', sortOrder: 0 },
      ]);
    });
  });
});
