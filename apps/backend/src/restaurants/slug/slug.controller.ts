import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RequireRestaurantAccess } from '../../auth/require-restaurant-access.decorator';
import { RestaurantsService } from '../restaurants.service';
import { ReleaseSlugDto } from './dto/release-slug.dto';
import { UpdateSlugDto } from './dto/update-slug.dto';
import { RestaurantSlugService } from './restaurant-slug.service';

interface AuthenticatedRequest {
  user: { id: string };
}

// Shared access policies run before handlers; keep the existing service checks
// too. There is no blanket RolesGuard or grant to every management operation.
//
// Deliberate three-level authorization ladder on this controller — do not
// "simplify" one rung to match its neighbours:
//   - rename / release -> RestaurantSlugService.assertOwner (OWNER only)
//   - commit            -> RestaurantsService.findOneForManagement
//                           (OWNER or MANAGER of *this* restaurant)
//   - available         -> JwtAuthGuard only, no membership check (the
//                           slug namespace is already public via /m/<slug>)
@Controller('restaurants/:id/slug')
export class SlugController {
  constructor(
    private readonly slugs: RestaurantSlugService,
    private readonly restaurants: RestaurantsService,
  ) {}

  /**
   * Precondition for rendering a QR. Not owner-gated — a manager printing
   * table tents must be able to trigger it, and it only freezes the current
   * (already-chosen) name, not a privileged mutation. It DOES still require
   * the caller to be staff (OWNER or MANAGER) of *this* restaurant: without
   * that check, any authenticated account — staff of a different
   * restaurant, or a CUSTOMER — could commit a stranger's slug and force
   * that restaurant into its 14-day rename cooldown. Reuses the existing
   * findOneForManagement seam rather than a third bespoke check.
   */
  @RequireRestaurantAccess({
    policy: 'restaurant-management',
    source: 'params',
    key: 'id',
  })
  @Post('commit')
  async commit(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    await this.restaurants.findOneForManagement(id, req.user.id);
    return this.slugs.commitSlug(id);
  }

  // OWNER only. Renaming the public menu URL is stricter than the OWNER-or-
  // MANAGER seam used elsewhere (findOneForManagement) — see assertOwner's
  // doc comment. Let ConflictException/BadRequestException from renameSlug
  // propagate unwrapped.
  @RequireRestaurantAccess({
    policy: 'restaurant-owner',
    source: 'params',
    key: 'id',
  })
  @Patch()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async rename(
    @Param('id') id: string,
    @Body() dto: UpdateSlugDto,
    @Request() req: AuthenticatedRequest,
  ) {
    await this.slugs.assertOwner(id, req.user.id);
    const slug = await this.slugs.renameSlug(id, dto.slug);
    return { slug };
  }

  // OWNER only, and requires the server-validated CONFIRM token on the DTO.
  @RequireRestaurantAccess({
    policy: 'restaurant-owner',
    source: 'params',
    key: 'id',
  })
  @Post('release')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async release(
    @Param('id') id: string,
    @Body() dto: ReleaseSlugDto,
    @Request() req: AuthenticatedRequest,
  ) {
    await this.slugs.assertOwner(id, req.user.id);
    await this.slugs.releaseSlug(id, dto.slug);
    return { released: dto.slug };
  }

  /** OWNER-only history used by settings release controls. */
  @RequireRestaurantAccess({
    policy: 'restaurant-owner',
    source: 'params',
    key: 'id',
  })
  @Get('aliases')
  async aliases(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    await this.slugs.assertOwner(id, req.user.id);
    const [primary, aliases] = await Promise.all([
      this.slugs.getPrimaryState(id),
      this.slugs.listAliases(id),
    ]);
    return { primary, aliases };
  }

  /** Advisory only — the unique index is the authority at write time. */
  @UseGuards(JwtAuthGuard)
  @Get('available')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async available(@Query('slug') slug: string) {
    return { available: await this.slugs.isSlugAvailable(slug ?? '') };
  }
}

/**
 * Signup-time availability has no restaurant id yet. Keep this authenticated
 * and advisory; exact ownership is established by the atomic create write.
 */
@Controller('restaurants/slug')
@UseGuards(JwtAuthGuard)
export class OnboardingSlugController {
  constructor(private readonly slugs: RestaurantSlugService) {}

  @Get('available')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async available(@Query('slug') slug: string) {
    return { available: await this.slugs.isSlugAvailable(slug ?? '') };
  }
}
