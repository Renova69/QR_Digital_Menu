import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ItemController, ItemDetailController } from './item.controller';
import { MenuCrudService } from './menu-crud.service';
import { StorageService } from '../storage/storage.service';

describe('ItemController', () => {
  let controller: ItemController;
  const mockCrud = {
    createItem: jest.fn(),
    findAllItemsInCategory: jest.fn(),
    updateItemOrder: jest.fn(),
  };

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      controllers: [ItemController],
      providers: [{ provide: MenuCrudService, useValue: mockCrud }],
    }).compile();
    controller = m.get<ItemController>(ItemController);
  });
  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(controller).toBeDefined());

  it('create delegates to crud.createItem', async () => {
    const req = { user: { id: 'u1' } };
    const dto = { name: 'Burger' } as any;
    mockCrud.createItem.mockResolvedValue({ id: 'i1' });
    const r = await controller.create('cat-1', dto, req);
    expect(mockCrud.createItem).toHaveBeenCalledWith('cat-1', dto, 'u1');
    expect(r).toEqual({ id: 'i1' });
  });

  it('findAll delegates to crud.findAllItemsInCategory', async () => {
    const req = { user: { id: 'u1' } };
    mockCrud.findAllItemsInCategory.mockResolvedValue([]);
    const r = await controller.findAll('cat-1', req);
    expect(mockCrud.findAllItemsInCategory).toHaveBeenCalledWith('cat-1', 'u1');
    expect(r).toEqual([]);
  });

  it('updateOrder delegates to crud.updateItemOrder', async () => {
    const req = { user: { id: 'u1' } };
    await controller.updateOrder('cat-1', ['i2', 'i1'], req);
    expect(mockCrud.updateItemOrder).toHaveBeenCalledWith(
      'cat-1',
      ['i2', 'i1'],
      'u1',
    );
  });
});

describe('ItemDetailController', () => {
  let controller: ItemDetailController;
  const mockCrud = {
    updateItem: jest.fn(),
    removeItem: jest.fn(),
    verifyItemOwnership: jest.fn(),
    updateItemImage: jest.fn(),
  };
  const mockStorage = { uploadWithThumbnail: jest.fn(), delete: jest.fn() };

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      controllers: [ItemDetailController],
      providers: [
        { provide: MenuCrudService, useValue: mockCrud },
        { provide: StorageService, useValue: mockStorage },
      ],
    }).compile();
    controller = m.get<ItemDetailController>(ItemDetailController);
  });
  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(controller).toBeDefined());

  it('update delegates to crud.updateItem', async () => {
    const req = { user: { id: 'u1' } };
    const dto = { name: 'Updated' } as any;
    mockCrud.updateItem.mockResolvedValue({ id: 'i1' });
    const r = await controller.update('i1', dto, req);
    expect(mockCrud.updateItem).toHaveBeenCalledWith('i1', dto, 'u1');
    expect(r).toEqual({ id: 'i1' });
  });

  it('remove delegates to crud.removeItem', async () => {
    const req = { user: { id: 'u1' } };
    mockCrud.removeItem.mockResolvedValue({ deleted: true });
    const r = await controller.remove('i1', req);
    expect(mockCrud.removeItem).toHaveBeenCalledWith('i1', 'u1');
    expect(r).toEqual({ deleted: true });
  });

  it('uploadImage throws when no file', async () => {
    await expect(
      controller.uploadImage('i1', undefined as any, { user: { id: 'u1' } }),
    ).rejects.toThrow(BadRequestException);
  });
});
