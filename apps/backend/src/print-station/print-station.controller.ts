import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Query,
  Param,
  Body,
  UseGuards,
  Request,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrintStationService } from './print-station.service';
import { CreatePrintStationDto } from './dto/create-print-station.dto';
import { UpdatePrintStationDto } from './dto/update-print-station.dto';
import { GenerateTokenDto } from './dto/generate-token.dto';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { FeatureGuard } from '../subscription/feature.guard';
import { FeatureFlag } from '../subscription/feature-flag.enum';
import { RequireFeature } from '../subscription/require-feature.decorator';

@RequireFeature(FeatureFlag.PRINTERS_THERMAL)
@UseGuards(JwtAuthGuard, FeatureGuard)
@Controller('print-stations')
export class PrintStationController {
  constructor(
    private readonly service: PrintStationService,
    private readonly restaurantsService: RestaurantsService,
  ) {}

  // H-4: explicit OWNER gate — print-station management is owner-only.
  // Issue 28: accept explicit restaurantId for multi-restaurant support;
  // verify ownership when provided; fall back to findByOwner otherwise.
  private async getRestaurantId(
    userId: string,
    userRole: string,
    restaurantIdParam?: string,
  ): Promise<string> {
    if (userRole !== 'OWNER') {
      throw new ForbiddenException(
        'Print station management requires OWNER role',
      );
    }
    if (restaurantIdParam) {
      // findOne verifies existence and ownership; throws on failure.
      const restaurant = await this.restaurantsService.findOne(
        restaurantIdParam,
        userId,
      );
      if (!restaurant.isActive) {
        throw new ForbiddenException('Restaurant is suspended');
      }
      return restaurantIdParam;
    }
    const restaurant = await this.restaurantsService.findByOwner(userId);
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    if (!restaurant.isActive) {
      throw new ForbiddenException('Restaurant is suspended');
    }
    return restaurant.id;
  }

  @Get()
  async list(
    @Request() req: any,
    @Query('restaurantId') restaurantId?: string,
  ) {
    const id = await this.getRestaurantId(
      req.user.id,
      req.user.role,
      restaurantId,
    );
    return this.service.list(id);
  }

  @Get('health')
  async health(
    @Request() req: any,
    @Query('restaurantId') restaurantId?: string,
  ) {
    const id = await this.getRestaurantId(
      req.user.id,
      req.user.role,
      restaurantId,
    );
    return this.service.getStationHealth(id);
  }

  @Post()
  async create(
    @Request() req: any,
    @Body() dto: CreatePrintStationDto,
    @Query('restaurantId') restaurantId?: string,
  ) {
    const id = await this.getRestaurantId(
      req.user.id,
      req.user.role,
      restaurantId,
    );
    return this.service.create(id, dto);
  }

  @Patch(':id')
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdatePrintStationDto,
    @Query('restaurantId') restaurantId?: string,
  ) {
    const resolvedId = await this.getRestaurantId(
      req.user.id,
      req.user.role,
      restaurantId,
    );
    return this.service.update(resolvedId, id, dto);
  }

  @Delete(':id')
  async remove(
    @Request() req: any,
    @Param('id') id: string,
    @Query('restaurantId') restaurantId?: string,
  ) {
    const resolvedId = await this.getRestaurantId(
      req.user.id,
      req.user.role,
      restaurantId,
    );
    await this.service.remove(resolvedId, id);
    return { success: true };
  }

  @Get(':id/jobs')
  async getJobs(
    @Request() req: any,
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('restaurantId') restaurantId?: string,
  ) {
    const resolvedId = await this.getRestaurantId(
      req.user.id,
      req.user.role,
      restaurantId,
    );
    return this.service.getJobs(resolvedId, id, status);
  }

  @Post(':id/jobs/:jobId/retry')
  async retryJob(
    @Request() req: any,
    @Param('id') id: string,
    @Param('jobId') jobId: string,
    @Query('restaurantId') restaurantId?: string,
  ) {
    const resolvedId = await this.getRestaurantId(
      req.user.id,
      req.user.role,
      restaurantId,
    );
    return this.service.retryFailedJob(resolvedId, id, jobId);
  }

  @Post(':id/tokens')
  async generateToken(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: GenerateTokenDto,
    @Query('restaurantId') restaurantId?: string,
  ) {
    const resolvedId = await this.getRestaurantId(
      req.user.id,
      req.user.role,
      restaurantId,
    );
    return this.service.generateToken(resolvedId, id, dto.label);
  }

  @Delete('tokens/:tokenId')
  async revokeToken(
    @Request() req: any,
    @Param('tokenId') tokenId: string,
    @Query('restaurantId') restaurantId?: string,
  ) {
    const resolvedId = await this.getRestaurantId(
      req.user.id,
      req.user.role,
      restaurantId,
    );
    await this.service.revokeToken(resolvedId, tokenId);
    return { success: true };
  }

  /**
   * Bring a quarantined agent back.
   *
   * Same guard, same role resolution and same restaurant scoping as revocation
   * -- reactivation restores a working credential, so it cannot be the weaker
   * of the pair.
   *
   * A manually revoked token is deleted outright, so it is not reachable here:
   * the lookup simply finds nothing and returns 404. Quarantine is reversible;
   * an owner's explicit revocation is not.
   */
  @Post('tokens/:tokenId/reactivate')
  async reactivateToken(
    @Request() req: any,
    @Param('tokenId') tokenId: string,
    @Query('restaurantId') restaurantId?: string,
  ) {
    const resolvedId = await this.getRestaurantId(
      req.user.id,
      req.user.role,
      restaurantId,
    );
    await this.service.reactivateAgentToken(resolvedId, tokenId);
    return { success: true };
  }
}
