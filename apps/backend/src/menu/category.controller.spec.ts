import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
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
    }).compile();

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
    }).compile();

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
    it('should throw BadRequestException when no file', async () => {
      await expect(
        controller.uploadImage('cat-1', undefined as any, {
          user: { id: 'user-1' },
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
