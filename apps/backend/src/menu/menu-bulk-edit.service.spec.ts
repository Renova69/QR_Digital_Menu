import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { MenuBulkEditService } from './menu-bulk-edit.service';
import { MenuCrudService } from './menu-crud.service';
import { PrismaService } from '../prisma/prisma.service';
import { BulkUpdateItemsDto } from './dto/bulk-update-items.dto';

describe('MenuBulkEditService', () => {
  let service: MenuBulkEditService;
  let prisma: {
    menuItem: { findMany: jest.Mock; findUnique: jest.Mock };
  };
  let menuCrud: {
    verifyRestaurantOwnership: jest.Mock;
    updateItem: jest.Mock;
  };

  const RESTAURANT_ID = 'rest-1';
  const USER_ID = 'user-1';

  beforeEach(async () => {
    prisma = {
      menuItem: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
      },
    };
    menuCrud = {
      verifyRestaurantOwnership: jest.fn().mockResolvedValue(undefined),
      updateItem: jest.fn().mockResolvedValue({ id: 'item-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MenuBulkEditService,
        { provide: PrismaService, useValue: prisma },
        { provide: MenuCrudService, useValue: menuCrud },
      ],
    }).compile();

    service = module.get(MenuBulkEditService);
  });

  describe('getBulkEditItems', () => {
    it('verifies restaurant ownership before querying items', async () => {
      await service.getBulkEditItems(RESTAURANT_ID, USER_ID);

      expect(menuCrud.verifyRestaurantOwnership).toHaveBeenCalledWith(
        RESTAURANT_ID,
        USER_ID,
      );
      expect(prisma.menuItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { category: { restaurantId: RESTAURANT_ID } },
        }),
      );
    });

    it('propagates ownership failures without querying items', async () => {
      menuCrud.verifyRestaurantOwnership.mockRejectedValue(
        new ForbiddenException(),
      );

      await expect(
        service.getBulkEditItems(RESTAURANT_ID, USER_ID),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.menuItem.findMany).not.toHaveBeenCalled();
    });
  });

  describe('bulkUpdateItems', () => {
    const dto: BulkUpdateItemsDto = {
      updates: [
        { id: 'item-1', price: 9.99 } as any,
        { id: 'item-2', name: 'New Name' } as any,
      ],
    };

    it('propagates ownership failures without processing any row', async () => {
      menuCrud.verifyRestaurantOwnership.mockRejectedValue(
        new ForbiddenException(),
      );

      await expect(
        service.bulkUpdateItems(RESTAURANT_ID, dto, USER_ID),
      ).rejects.toThrow(ForbiddenException);
      expect(menuCrud.updateItem).not.toHaveBeenCalled();
    });

    it('updates every row that belongs to the restaurant', async () => {
      prisma.menuItem.findUnique.mockImplementation(({ where: { id } }) =>
        Promise.resolve({ category: { restaurantId: RESTAURANT_ID } }),
      );

      const result = await service.bulkUpdateItems(RESTAURANT_ID, dto, USER_ID);

      expect(menuCrud.updateItem).toHaveBeenCalledTimes(2);
      expect(menuCrud.updateItem).toHaveBeenCalledWith(
        'item-1',
        { price: 9.99 },
        USER_ID,
      );
      expect(result).toEqual({
        updated: ['item-1', 'item-2'],
        failed: [],
      });
    });

    it('soft-fails a row whose item no longer exists', async () => {
      prisma.menuItem.findUnique.mockResolvedValue(null);

      const result = await service.bulkUpdateItems(RESTAURANT_ID, dto, USER_ID);

      expect(menuCrud.updateItem).not.toHaveBeenCalled();
      expect(result.updated).toEqual([]);
      expect(result.failed).toEqual([
        { id: 'item-1', error: 'Item not found' },
        { id: 'item-2', error: 'Item not found' },
      ]);
    });

    it('soft-fails a row belonging to a different restaurant without touching it', async () => {
      prisma.menuItem.findUnique.mockResolvedValue({
        category: { restaurantId: 'some-other-restaurant' },
      });

      const result = await service.bulkUpdateItems(RESTAURANT_ID, dto, USER_ID);

      expect(menuCrud.updateItem).not.toHaveBeenCalled();
      expect(result.failed).toEqual([
        { id: 'item-1', error: 'Item does not belong to this restaurant' },
        { id: 'item-2', error: 'Item does not belong to this restaurant' },
      ]);
    });

    it('collects a per-row error and keeps processing the rest on partial failure', async () => {
      prisma.menuItem.findUnique.mockResolvedValue({
        category: { restaurantId: RESTAURANT_ID },
      });
      menuCrud.updateItem
        .mockRejectedValueOnce(new Error('price must be positive'))
        .mockResolvedValueOnce({ id: 'item-2' });

      const result = await service.bulkUpdateItems(RESTAURANT_ID, dto, USER_ID);

      expect(result.updated).toEqual(['item-2']);
      expect(result.failed).toEqual([
        { id: 'item-1', error: 'price must be positive' },
      ]);
    });
  });
});
