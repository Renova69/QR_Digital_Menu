import { Injectable } from '@nestjs/common';

export interface TenantMenuRestaurant {
  id: string;
  slug?: string | null;
}

/**
 * Single backend seam for public tenant URLs.
 *
 * Targets are composed only from trusted server configuration and persisted
 * restaurant data. The legacy ID route remains the nullable-migration fallback.
 */
@Injectable()
export class TenantUrlService {
  getFrontendBaseUrl(): string {
    return (process.env.FRONTEND_URL || 'http://localhost:3001').replace(
      /\/+$/,
      '',
    );
  }

  getMenuBaseUrl(restaurant: TenantMenuRestaurant): string {
    const segment = encodeURIComponent(restaurant.slug || restaurant.id);
    const path = restaurant.slug ? `/m/${segment}` : `/menu/public/${segment}`;
    return `${this.getFrontendBaseUrl()}${path}`;
  }
}
