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
} from '@nestjs/common';
import { PrintStationService } from './print-station.service';
import { CreatePrintStationDto } from './dto/create-print-station.dto';
import { UpdatePrintStationDto } from './dto/update-print-station.dto';
import { GenerateTokenDto } from './dto/generate-token.dto';
import { FeatureGuard } from '../subscription/feature.guard';
import { FeatureFlag } from '../subscription/feature-flag.enum';
import { RequireFeature } from '../subscription/require-feature.decorator';
import {
  AuthorizedRestaurant,
  RequireRestaurantAccess,
} from '../auth/require-restaurant-access.decorator';
import { RestaurantAccessContext } from '../auth/restaurant-access.policy';

@RequireFeature(FeatureFlag.PRINTERS_THERMAL)
@UseGuards(FeatureGuard)
@RequireRestaurantAccess({
  policy: 'print-management',
  source: 'query',
  key: 'restaurantId',
})
@Controller('print-stations')
export class PrintStationController {
  constructor(private readonly service: PrintStationService) {}

  @Get()
  list(@AuthorizedRestaurant() access: RestaurantAccessContext) {
    return this.service.list(access.restaurantId);
  }

  @Get('health')
  health(@AuthorizedRestaurant() access: RestaurantAccessContext) {
    return this.service.getStationHealth(access.restaurantId);
  }

  @Post()
  create(
    @AuthorizedRestaurant() access: RestaurantAccessContext,
    @Body() dto: CreatePrintStationDto,
  ) {
    return this.service.create(access.restaurantId, dto);
  }

  @Patch(':id')
  update(
    @AuthorizedRestaurant() access: RestaurantAccessContext,
    @Param('id') id: string,
    @Body() dto: UpdatePrintStationDto,
  ) {
    return this.service.update(access.restaurantId, id, dto);
  }

  @Delete(':id')
  async remove(
    @AuthorizedRestaurant() access: RestaurantAccessContext,
    @Param('id') id: string,
  ) {
    await this.service.remove(access.restaurantId, id);
    return { success: true };
  }

  @Get(':id/jobs')
  getJobs(
    @AuthorizedRestaurant() access: RestaurantAccessContext,
    @Param('id') id: string,
    @Query('status') status?: string,
  ) {
    return this.service.getJobs(access.restaurantId, id, status);
  }

  @Post(':id/jobs/:jobId/retry')
  retryJob(
    @AuthorizedRestaurant() access: RestaurantAccessContext,
    @Param('id') id: string,
    @Param('jobId') jobId: string,
  ) {
    return this.service.retryFailedJob(access.restaurantId, id, jobId);
  }

  @Post(':id/tokens')
  generateToken(
    @AuthorizedRestaurant() access: RestaurantAccessContext,
    @Param('id') id: string,
    @Body() dto: GenerateTokenDto,
  ) {
    return this.service.generateToken(access.restaurantId, id, dto.label);
  }

  @Delete('tokens/:tokenId')
  async revokeToken(
    @AuthorizedRestaurant() access: RestaurantAccessContext,
    @Param('tokenId') tokenId: string,
  ) {
    await this.service.revokeToken(access.restaurantId, tokenId);
    return { success: true };
  }

  /** Restoring a credential uses the same owner/tenant/feature gate as revocation.
   * The service also scopes the token and requires an existing quarantine;
   * a manually revoked (deleted) token cannot be restored. */
  @Post('tokens/:tokenId/reactivate')
  async reactivateToken(
    @AuthorizedRestaurant() access: RestaurantAccessContext,
    @Param('tokenId') tokenId: string,
  ) {
    await this.service.reactivateAgentToken(access.restaurantId, tokenId);
    return { success: true };
  }
}
