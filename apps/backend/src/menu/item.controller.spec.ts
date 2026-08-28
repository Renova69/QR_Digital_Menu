import { RestaurantAccessGuard } from '../auth/restaurant-access.guard';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ItemController, ItemDetailController } from './item.controller';
import { MenuCrudService } from './menu-crud.service';
import { StorageService } from '../storage/storage.service';
import { MenuTranslationOverrideService } from './menu-translation-override.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';

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
    })
      // Direct-call dispatch tests; the real guard runs in menu-access.http.spec.ts.
      .overrideGuard(RestaurantAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = m.get<ItemController>(ItemController);
  });
  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(controller).toBeDefined());

  it('create delegates to crud.createItem', async () => {
    const req = { user: { id: 'u1' } };
    const dto = { name: 'Burger' } as CreateItemDto;
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
  const mockOverrides = {
    getForItem: jest.fn(),
    setOverride: jest.fn(),
  };

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      controllers: [ItemDetailController],
      providers: [
        { provide: MenuCrudService, useValue: mockCrud },
        { provide: StorageService, useValue: mockStorage },
        {
          provide: MenuTranslationOverrideService,
          useValue: mockOverrides,
        },
      ],
    })
      // Direct-call dispatch tests; the real guard runs in menu-access.http.spec.ts.
      .overrideGuard(RestaurantAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = m.get<ItemDetailController>(ItemDetailController);
  });
  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(controller).toBeDefined());

  it('update delegates to crud.updateItem', async () => {
    const req = { user: { id: 'u1' } };
    const dto = { name: 'Updated' } as UpdateItemDto;
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

  it('reads translations for the authenticated owner', async () => {
    mockOverrides.getForItem.mockResolvedValue({
      itemId: 'item-1',
      locales: [],
    });

    await controller.getTranslations('item-1', {
      user: { id: 'user-1' },
    });

    expect(mockOverrides.getForItem).toHaveBeenCalledWith('item-1', 'user-1');
  });

  it('writes a description override for the authenticated owner', async () => {
    mockOverrides.setOverride.mockResolvedValue({
      itemId: 'item-1',
      locales: [],
    });

    await controller.updateTranslation(
      'item-1',
      {
        field: 'DESCRIPTION',
        locale: 'en',
        value: 'Classic London dry gin',
      },
      { user: { id: 'user-1' } },
    );

    expect(mockOverrides.setOverride).toHaveBeenCalledWith(
      'item-1',
      'DESCRIPTION',
      'en',
      'Classic London dry gin',
      'user-1',
    );
  });

  // Same defect as CategoryDetailController: the ownership check runs inside
  // the upload try block, so a catch-all rethrow flattened 403 to 400 and
  // echoed internal storage/database detail to the caller.
  it('uploadImage preserves an authorization failure status', async () => {
    mockCrud.verifyItemOwnership.mockRejectedValue(
      new ForbiddenException('Forbidden access'),
    );

    await expect(
      controller.uploadImage(
        'item-1',
        {
          buffer: Buffer.from('x'),
          originalname: 'a.png',
          mimetype: 'image/png',
        } as any,
        { user: { id: 'user-1' } },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('uploadImage does not echo an internal error', async () => {
    mockCrud.verifyItemOwnership.mockResolvedValue(undefined);
    mockStorage.uploadWithThumbnail.mockRejectedValue(
      new Error('connect ECONNREFUSED 10.0.0.5:443 bucket=qr-menu-uploads'),
    );

    await expect(
      controller.uploadImage(
        'item-1',
        {
          buffer: Buffer.from('x'),
          originalname: 'a.png',
          mimetype: 'image/png',
        } as any,
        { user: { id: 'user-1' } },
      ),
    ).rejects.toThrow(new BadRequestException('Failed to upload image'));
  });

  it('uploadImage throws when no file', async () => {
    await expect(
      controller.uploadImage(
        'i1',
        undefined as unknown as Express.Multer.File,
        { user: { id: 'u1' } },
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
