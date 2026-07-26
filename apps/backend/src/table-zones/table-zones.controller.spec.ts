import { Test, TestingModule } from '@nestjs/testing';
import { TableZonesController } from './table-zones.controller';
import { TableZonesService } from './table-zones.service';

describe('TableZonesController', () => {
  let controller: TableZonesController;
  let service: TableZonesService;

  const mockZonesService = {
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    reorder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TableZonesController],
      providers: [{ provide: TableZonesService, useValue: mockZonesService }],
    }).compile();

    controller = module.get<TableZonesController>(TableZonesController);
    service = module.get<TableZonesService>(TableZonesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should call zonesService.findAll with restaurantId and user', async () => {
      const req = { user: { id: 'user-1' } };
      mockZonesService.findAll.mockResolvedValue([{ id: 'z1', name: 'Main' }]);

      const result = await controller.findAll('rest-1', req);

      expect(mockZonesService.findAll).toHaveBeenCalledWith('rest-1', req.user);
      expect(result).toEqual([{ id: 'z1', name: 'Main' }]);
    });
  });

  describe('create', () => {
    it('should call zonesService.create with restaurantId, dto, and userId', async () => {
      const dto = { name: 'Terrace' } as any;
      const req = { user: { id: 'user-1' } };
      mockZonesService.create.mockResolvedValue({ id: 'z2', name: 'Terrace' });

      const result = await controller.create('rest-1', dto, req);

      expect(mockZonesService.create).toHaveBeenCalledWith(
        'rest-1',
        dto,
        'user-1',
      );
      expect(result).toEqual({ id: 'z2', name: 'Terrace' });
    });
  });

  describe('update', () => {
    it('should call zonesService.update with id, dto, and userId', async () => {
      const dto = { name: 'Updated' } as any;
      const req = { user: { id: 'user-1' } };
      mockZonesService.update.mockResolvedValue({ id: 'z1', name: 'Updated' });

      const result = await controller.update('z1', dto, req);

      expect(mockZonesService.update).toHaveBeenCalledWith('z1', dto, 'user-1');
      expect(result).toEqual({ id: 'z1', name: 'Updated' });
    });
  });

  describe('remove', () => {
    it('should call zonesService.remove with id and userId', async () => {
      const req = { user: { id: 'user-1' } };
      mockZonesService.remove.mockResolvedValue({ deleted: true });

      const result = await controller.remove('z1', req);

      expect(mockZonesService.remove).toHaveBeenCalledWith('z1', 'user-1');
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('reorder', () => {
    it('should call zonesService.reorder with restaurantId, dto, and userId', async () => {
      const dto = { zoneIds: ['z2', 'z1'] } as any;
      const req = { user: { id: 'user-1' } };
      mockZonesService.reorder.mockResolvedValue([{ id: 'z2' }, { id: 'z1' }]);

      const result = await controller.reorder('rest-1', dto, req);

      expect(mockZonesService.reorder).toHaveBeenCalledWith(
        'rest-1',
        dto,
        'user-1',
      );
      expect(result).toEqual([{ id: 'z2' }, { id: 'z1' }]);
    });
  });
});
