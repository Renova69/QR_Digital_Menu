import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ResolvedSlug {
  restaurantId: string;
  canonicalSlug: string;
  releasedAt: Date | null;
}

@Injectable()
export class RestaurantSlugService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Slug -> restaurant. Deliberately cheap: a single primary-key lookup that
   * returns an id, after which the established restaurant-ID menu flow runs
   * unchanged. Do not grow this into a second menu endpoint — the frontend
   * loads meta first and then batches category items, and a full-menu-by-slug
   * route would fight that.
   */
  async resolve(rawSlug: string): Promise<ResolvedSlug | null> {
    // URLs arrive from browsers, QR scanners, and hand-typing. The column
    // stores lowercase only (CHECK constraint), so normalize before lookup.
    const slug = rawSlug.trim().toLowerCase();
    if (!slug) return null;

    const row = await this.prisma.restaurantSlug.findUnique({
      where: { slug },
      include: { restaurant: { select: { slug: true } } },
    });
    if (!row) return null;

    return {
      restaurantId: row.restaurantId,
      canonicalSlug: row.restaurant.slug ?? row.slug,
      releasedAt: row.releasedAt,
    };
  }
}
