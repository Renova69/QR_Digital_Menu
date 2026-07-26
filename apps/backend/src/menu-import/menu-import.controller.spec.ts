import { Test, TestingModule } from '@nestjs/testing';
import { MenuImportController } from './menu-import.controller';
import { MenuImportService } from './menu-import.service';
import { PrismaService } from '../prisma/prisma.service';

describe('MenuImportController', () => {
  let controller: MenuImportController;
  let service: MenuImportService;

  const mockMenuImportService = {
    upsertMenu: jest.fn(),
    checkOwnership: jest.fn(),
    getOrCreateApiKey: jest.fn(),
    regenerateApiKey: jest.fn(),
    exportMenu: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MenuImportController],
      providers: [
        { provide: MenuImportService, useValue: mockMenuImportService },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    controller = module.get<MenuImportController>(MenuImportController);
    service = module.get<MenuImportService>(MenuImportService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('importFromOcr', () => {
    it('should call menuImportService.upsertMenu with id and dto', async () => {
      const dto = { items: [] } as any;
      mockMenuImportService.upsertMenu.mockResolvedValue({ imported: 0 });

      const result = await controller.importFromOcr('rest-1', dto);

      expect(mockMenuImportService.upsertMenu).toHaveBeenCalledWith(
        'rest-1',
        dto,
      );
      expect(result).toEqual({ imported: 0 });
    });
  });

  describe('importConfirm', () => {
    it('should check ownership then upsert for authenticated user', async () => {
      const dto = { items: [] } as any;
      const req = { user: { id: 'user-1' } };
      mockMenuImportService.checkOwnership.mockResolvedValue(true);
      mockMenuImportService.upsertMenu.mockResolvedValue({ imported: 5 });

      const result = await controller.importConfirm('rest-1', dto, req);

      expect(mockMenuImportService.checkOwnership).toHaveBeenCalledWith(
        'rest-1',
        'user-1',
      );
      expect(mockMenuImportService.upsertMenu).toHaveBeenCalledWith(
        'rest-1',
        dto,
      );
      expect(result).toEqual({ imported: 5 });
    });

    it('should reject when ownership check fails', async () => {
      const dto = { items: [] } as any;
      const req = { user: { id: 'user-2' } };
      mockMenuImportService.checkOwnership.mockRejectedValue(
        new Error('Forbidden'),
      );

      await expect(
        controller.importConfirm('rest-1', dto, req),
      ).rejects.toThrow('Forbidden');
    });
  });

  describe('getApiKey', () => {
    it('should call menuImportService.getOrCreateApiKey with id and userId', async () => {
      const req = { user: { id: 'user-1' } };
      mockMenuImportService.getOrCreateApiKey.mockResolvedValue({
        key: 'api-key-123',
      });

      const result = await controller.getApiKey('rest-1', req);

      expect(mockMenuImportService.getOrCreateApiKey).toHaveBeenCalledWith(
        'rest-1',
        'user-1',
      );
      expect(result).toEqual({ key: 'api-key-123' });
    });
  });

  describe('regenerateApiKey', () => {
    it('should call menuImportService.regenerateApiKey with id and userId', async () => {
      const req = { user: { id: 'user-1' } };
      mockMenuImportService.regenerateApiKey.mockResolvedValue({
        key: 'new-key',
      });

      const result = await controller.regenerateApiKey('rest-1', req);

      expect(mockMenuImportService.regenerateApiKey).toHaveBeenCalledWith(
        'rest-1',
        'user-1',
      );
      expect(result).toEqual({ key: 'new-key' });
    });
  });

  describe('exportMenu', () => {
    it('should call menuImportService.exportMenu with id and userId', async () => {
      const req = { user: { id: 'user-1' } };
      mockMenuImportService.exportMenu.mockResolvedValue({ items: [] });

      const result = await controller.exportMenu('rest-1', req);

      expect(mockMenuImportService.exportMenu).toHaveBeenCalledWith(
        'rest-1',
        'user-1',
      );
      expect(result).toEqual({ items: [] });
    });
  });
});
