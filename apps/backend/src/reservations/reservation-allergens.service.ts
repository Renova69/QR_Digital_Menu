import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface MenuAllergenSummary {
  allergens: string[];
  dietaryTags: string[];
}

@Injectable()
export class ReservationAllergensService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aggregate the distinct allergen / dietary labels already present on the
   * restaurant's ACTIVE (non-out-of-stock) menu items. Phase 1 reuses the
   * existing free-text `MenuItem.allergens` / `dietaryTags` — no menu-schema
   * change. Labels are owner-authored, so they are only trimmed + de-duplicated
   * case-insensitively (a coded EU-14 vocabulary is a separate menu task).
   */
  async getMenuAllergenSummary(
    restaurantId: string,
  ): Promise<MenuAllergenSummary> {
    const items = await this.prisma.menuItem.findMany({
      where: { category: { restaurantId }, isOutOfStock: false },
      select: { allergens: true, dietaryTags: true },
    });

    return {
      allergens: this.distinct(items.flatMap((i) => i.allergens)),
      dietaryTags: this.distinct(items.flatMap((i) => i.dietaryTags)),
    };
  }

  private distinct(values: string[]): string[] {
    const byLower = new Map<string, string>();
    for (const raw of values) {
      const trimmed = (raw ?? '').trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (!byLower.has(key)) byLower.set(key, trimmed);
    }
    return [...byLower.values()].sort((a, b) => a.localeCompare(b));
  }
}
