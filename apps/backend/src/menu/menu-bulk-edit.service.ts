import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MenuCrudService } from './menu-crud.service';
import { BulkUpdateItemsDto } from './dto/bulk-update-items.dto';
import { restaurantManagementWhere } from '../auth/restaurant-management-scope';

export interface BulkUpdateResult {
  updated: string[];
  failed: { id: string; error: string }[];
}

const BULK_EDIT_ITEM_SELECT = {
  id: true,
  name: true,
  description: true,
  price: true,
  costPrice: true,
  weight: true,
  currency: true,
  categoryId: true,
  allergens: true,
  dietaryTags: true,
  tags: true,
  isFeatured: true,
  isOutOfStock: true,
  rewardPointsMode: true,
  rewardPointsPrice: true,
} as const;

@Injectable()
export class MenuBulkEditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly menuCrud: MenuCrudService,
  ) {}

  // Flat list across every category — the bulk-edit grid groups client-side
  // using the categories the dashboard already has cached, so this only needs
  // to return items + the fields the grid can edit.
  async getBulkEditItems(restaurantId: string, userId: string) {
    await this.menuCrud.verifyRestaurantOwnership(restaurantId, userId);

    return this.prisma.menuItem.findMany({
      where: {
        category: {
          restaurantId,
          restaurant: restaurantManagementWhere(userId),
        },
      },
      orderBy: [{ category: { order: 'asc' } }, { order: 'asc' }],
      select: BULK_EDIT_ITEM_SELECT,
    });
  }

  // Each row is delegated to MenuCrudService.updateItem — the single-item
  // update path — so translation-cache purge, image cleanup, and the
  // availability socket emit all stay in one place rather than being
  // reimplemented here. Field-level DTO validation (price>0, maxlengths,
  // array caps) already ran in the controller's ValidationPipe before this
  // method is reached, so failures collected below are runtime/ownership
  // conditions only: item deleted concurrently, or an id that doesn't belong
  // to this restaurant (a user with two restaurants must not be able to
  // cross-contaminate them via one bulk-edit call scoped to a single id).
  async bulkUpdateItems(
    restaurantId: string,
    dto: BulkUpdateItemsDto,
    userId: string,
  ): Promise<BulkUpdateResult> {
    await this.menuCrud.verifyRestaurantOwnership(restaurantId, userId);

    const result: BulkUpdateResult = { updated: [], failed: [] };

    for (const { id, ...fields } of dto.updates) {
      try {
        const item = await this.prisma.menuItem.findUnique({
          where: {
            id,
            category: {
              restaurantId,
              restaurant: restaurantManagementWhere(userId),
            },
          },
          select: { category: { select: { restaurantId: true } } },
        });
        if (!item) {
          result.failed.push({ id, error: 'Item not found' });
          continue;
        }
        if (item.category.restaurantId !== restaurantId) {
          result.failed.push({
            id,
            error: 'Item does not belong to this restaurant',
          });
          continue;
        }
        await this.menuCrud.updateItem(id, fields, userId, restaurantId);
        result.updated.push(id);
      } catch (error: any) {
        result.failed.push({
          id,
          error: error?.message || 'Update failed',
        });
      }
    }

    return result;
  }
}
