import { RestaurantAccessGuard } from '../auth/restaurant-access.guard';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  CategoryController,
  CategoryDetailController,
} from './category.controller';
import { MenuCrudService } from './menu-crud.service';
import { StorageService } from '../storage/storage.service';

describe('CategoryController', () => {
  let controller: CategoryController;
  let crud: MenuCrudService;

  const mockCrud = {
    createCategory: jest.fn(),
    findAllCategories: jest.fn(),
    updateCategoryOrder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoryController],
      providers: [{ provide: MenuCrudService, useValue: mockCrud }],
    })
      // Direct-call dispatch tests; the real guard runs in menu-access.http.spec.ts.
      .overrideGuard(RestaurantAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CategoryController>(CategoryController);
    crud = module.get<MenuCrudService>(MenuCrudService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(controller).toBeDefined());

  describe('create', () => {
    it('should call crud.createCategory', async () => {
      const req = { user: { id: 'user-1' } };
      const dto = { name: 'Soups' } as any;
      mockCrud.createCategory.mockResolvedValue({ id: 'cat-1' });

      const result = await controller.create('rest-1', dto, req);

      expect(mockCrud.createCategory).toHaveBeenCalledWith(
        'rest-1',
        dto,
        'user-1',
      );
      expect(result).toEqual({ id: 'cat-1' });
    });
  });

  describe('findAll', () => {
    it('should call crud.findAllCategories', async () => {
      const req = { user: { id: 'user-1' } };
      mockCrud.findAllCategories.mockResolvedValue([]);

      const result = await controller.findAll('rest-1', req);

      expect(mockCrud.findAllCategories).toHaveBeenCalledWith(
        'rest-1',
        'user-1',
      );
      expect(result).toEqual([]);
    });
  });

  describe('updateOrder', () => {
    it('should call crud.updateCategoryOrder', async () => {
      const req = { user: { id: 'user-1' } };
      mockCrud.updateCategoryOrder.mockResolvedValue(undefined);

      await controller.updateOrder('rest-1', ['cat-2', 'cat-1'], req);

      expect(mockCrud.updateCategoryOrder).toHaveBeenCalledWith(
        'rest-1',
        ['cat-2', 'cat-1'],
        'user-1',
      );
    });
  });
});

describe('CategoryDetailController', () => {
  let controller: CategoryDetailController;
  let crud: MenuCrudService;

  const mockCrud = {
    updateCategory: jest.fn(),
    removeCategory: jest.fn(),
    verifyCategoryOwnership: jest.fn(),
    updateCategoryImage: jest.fn(),
  };

  const mockStorage = {
    uploadWithThumbnail: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoryDetailController],
      providers: [
        { provide: MenuCrudService, useValue: mockCrud },
        { provide: StorageService, useValue: mockStorage },
      ],
    })
      // Direct-call dispatch tests; the real guard runs in menu-access.http.spec.ts.
      .overrideGuard(RestaurantAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CategoryDetailController>(CategoryDetailController);
    crud = module.get<MenuCrudService>(MenuCrudService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(controller).toBeDefined());

  describe('update', () => {
    it('should call crud.updateCategory', async () => {
      const req = { user: { id: 'user-1' } };
      const dto = { name: 'Updated' } as any;
      mockCrud.updateCategory.mockResolvedValue({ id: 'cat-1' });

      const result = await controller.update('cat-1', dto, req);

      expect(mockCrud.updateCategory).toHaveBeenCalledWith(
        'cat-1',
        dto,
        'user-1',
      );
      expect(result).toEqual({ id: 'cat-1' });
    });
  });

  describe('remove', () => {
    it('should call crud.removeCategory', async () => {
      const req = { user: { id: 'user-1' } };
      mockCrud.removeCategory.mockResolvedValue({ deleted: true });

      const result = await controller.remove('cat-1', req);

      expect(mockCrud.removeCategory).toHaveBeenCalledWith('cat-1', 'user-1');
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('uploadImage', () => {
    const file = {
      buffer: Buffer.from('x'),
      originalname: 'a.png',
      mimetype: 'image/png',
    } as any;
    const req = { user: { id: 'user-1' } };

    it('should throw BadRequestException when no file', async () => {
      await expect(
        controller.uploadImage('cat-1', undefined as any, {
          user: { id: 'user-1' },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    // The ownership check runs inside the same try block as the upload, so a
    // catch-all rethrow turned every 403 into a 400 -- telling the caller their
    // request was malformed when in fact they were not allowed to touch this
    // category.
    it('preserves the status of an authorization failure', async () => {
      mockCrud.verifyCategoryOwnership.mockRejectedValue(
        new ForbiddenException('Forbidden access'),
      );

      await expect(controller.uploadImage('cat-1', file, req)).rejects.toThrow(
        ForbiddenException,
      );
    });

    // Everything in this block is internal: the R2 client, sharp, and Prisma.
    // Their messages carry bucket names, endpoints, constraint names and query
    // fragments, none of which belongs in a response to a tenant.
    it('does not echo an internal error back to the caller', async () => {
      mockCrud.verifyCategoryOwnership.mockResolvedValue(undefined);
      mockStorage.uploadWithThumbnail.mockRejectedValue(
        new Error(
          'connect ECONNREFUSED 10.0.0.5:443 bucket=qr-menu-uploads key=AKIAIOSFODNN7',
        ),
      );

      await expect(controller.uploadImage('cat-1', file, req)).rejects.toThrow(
        new BadRequestException('Failed to upload image'),
      );
      await expect(
        controller.uploadImage('cat-1', file, req),
      ).rejects.not.toThrow(/ECONNREFUSED|AKIA|bucket=/);
    });

    it('still removes the uploaded object when persistence fails', async () => {
      mockCrud.verifyCategoryOwnership.mockResolvedValue('rest-1');
      mockStorage.uploadWithThumbnail.mockResolvedValue({
        url: 'u',
        thumbnailUrl: 't',
      });
      mockCrud.updateCategoryImage.mockRejectedValue(new Error('db down'));

      await expect(controller.uploadImage('cat-1', file, req)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockStorage.delete).toHaveBeenCalledWith('u', 'rest-1');
      expect(mockStorage.delete).toHaveBeenCalledWith('t', 'rest-1');
    });
  });
});
