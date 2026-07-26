import { Test, TestingModule } from '@nestjs/testing';
import { BulkItemController } from './bulk-item.controller';
import { MenuBulkEditService } from './menu-bulk-edit.service';

describe('BulkItemController', () => {
  let controller: BulkItemController;
  let service: MenuBulkEditService;

  const mockBulkEdit = {
    getBulkEditItems: jest.fn(),
    bulkUpdateItems: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BulkItemController],
      providers: [{ provide: MenuBulkEditService, useValue: mockBulkEdit }],
    }).compile();

    controller = module.get<BulkItemController>(BulkItemController);
    service = module.get<MenuBulkEditService>(MenuBulkEditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getBulkItems', () => {
    it('should call bulkEdit.getBulkEditItems with restaurantId and userId', async () => {
      const req = { user: { id: 'user-1' } };
      mockBulkEdit.getBulkEditItems.mockResolvedValue([]);

      const result = await controller.getBulkItems('rest-1', req);

      expect(mockBulkEdit.getBulkEditItems).toHaveBeenCalledWith(
        'rest-1',
        'user-1',
      );
      expect(result).toEqual([]);
    });
  });

  describe('updateBulkItems', () => {
    it('should call bulkEdit.bulkUpdateItems with restaurantId, dto, and userId', async () => {
      const req = { user: { id: 'user-1' } };
      const dto = { items: [{ id: 'item-1', name: 'Updated' }] } as any;
      mockBulkEdit.bulkUpdateItems.mockResolvedValue({ updated: 1 });

      const result = await controller.updateBulkItems('rest-1', dto, req);

      expect(mockBulkEdit.bulkUpdateItems).toHaveBeenCalledWith(
        'rest-1',
        dto,
        'user-1',
      );
      expect(result).toEqual({ updated: 1 });
    });
  });
});
