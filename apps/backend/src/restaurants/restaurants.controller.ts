import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Logger,
  Param,
  Patch,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { RestaurantsService } from './restaurants.service';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StorageService } from '../storage/storage.service';
import { DeviceEnrollmentService } from './device-enrollment.service';
import { CreateDeviceEnrollmentDto } from './dto/create-device-enrollment.dto';
import { FeatureGuard } from '../subscription/feature.guard';
import { RequireFeature } from '../subscription/require-feature.decorator';
import { FeatureFlag } from '../subscription/feature-flag.enum';

@UseGuards(JwtAuthGuard)
@Controller('restaurants')
export class RestaurantsController {
  private readonly logger = new Logger(RestaurantsController.name);

  constructor(
    private readonly restaurantsService: RestaurantsService,
    private readonly storageService: StorageService,
    private readonly deviceEnrollment: DeviceEnrollmentService,
  ) {}

  @Post()
  create(
    // Validation + whitelist handled by the global ValidationPipe (main.ts).
    @Body() createRestaurantDto: CreateRestaurantDto,
    @Request() req: any,
  ) {
    return this.restaurantsService.create(createRestaurantDto, req.user.id);
  }

  @Get()
  findAll(@Request() req: any) {
    return this.restaurantsService.findAll(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.restaurantsService.findOneOrStaff(id, req.user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    // Validation + whitelist handled by the global ValidationPipe (main.ts).
    @Body() updateRestaurantDto: UpdateRestaurantDto,
    @Request() req: any,
  ) {
    return this.restaurantsService.update(id, updateRestaurantDto, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.restaurantsService.remove(id, req.user.id);
  }

  // Per-route throttle: each call buffers up to 5MB in memory before the
  // ownership check, so the global 100/60s is too loose for a valid-JWT abuser.
  // 20/60s caps the blast radius without blocking legitimate branding edits (#7).
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @RequireFeature(FeatureFlag.BRANDING_CUSTOM)
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @Post(':restaurantId/logo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
      fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.mimetype)) {
          return cb(null, false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadLogo(
    @Param('restaurantId') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('Only JPEG and PNG images are supported');
    }
    try {
      // Verify ownership before processing the upload so we don't waste R2
      // storage on unauthorised requests.
      await this.restaurantsService.findOneForManagement(id, req.user.id);

      const { url, thumbnailUrl } =
        await this.storageService.uploadWithThumbnail(
          file.buffer,
          file.originalname,
          file.mimetype,
          // The route's own restaurant id, already checked by
          // findOneForManagement above.
          id,
        );

      // Persist the reference immediately rather than waiting for the
      // client's follow-up PATCH /restaurants/:id (which also re-sends
      // these same URLs as part of the full branding form). If the client
      // never sends that PATCH — closed tab, dropped network, crashed form
      // — these R2 objects would otherwise be orphaned forever with no
      // record ever pointing at them. The PATCH still runs afterward as
      // normal and just re-writes the same values (idempotent) alongside
      // whatever other branding fields changed in the same save.
      try {
        await this.restaurantsService.updateLogo(
          id,
          url,
          thumbnailUrl,
          req.user.id,
        );
      } catch (persistError) {
        this.logger.error(
          `Uploaded logo for restaurant ${id} but failed to persist the reference immediately — it will still be written by the follow-up PATCH if that request arrives`,
          persistError,
        );
      }

      return { logoUrl: url, logoThumbnailUrl: thumbnailUrl };
    } catch (error: any) {
      // Preserve a real 403/404 from the ownership check rather than
      // flattening it to 400, and never echo an internal storage or database
      // message back to the caller.
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Logo upload failed for restaurant ${id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new BadRequestException('Failed to upload logo');
    }
  }

  @RequireFeature(FeatureFlag.POS)
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @Post(':restaurantId/device-enrollment')
  createDeviceEnrollment(
    @Param('restaurantId') id: string,
    @Body(new ValidationPipe({ whitelist: true }))
    _dto: CreateDeviceEnrollmentDto,
    @Request() req: any,
  ) {
    // Build the enrollment URL from server-side config only. The request
    // `Origin` header is attacker-controlled (any authenticated caller can set
    // it to a phishing host), so it must never feed a QR/link target.
    const frontendBaseUrl = process.env.FRONTEND_URL || 'http://localhost:3001';

    return this.deviceEnrollment.createEnrollment(
      id,
      req.user.id,
      frontendBaseUrl,
    );
  }

  @RequireFeature(FeatureFlag.POS)
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @Get(':restaurantId/device-enrollments')
  listDeviceEnrollments(
    @Param('restaurantId') id: string,
    @Request() req: any,
  ) {
    return this.deviceEnrollment.listEnrollments(id, req.user.id);
  }

  /** Revoke a specific enrolled device token so it can no longer be used for
   *  PIN login. The device will be rejected at next login attempt.
   *  DELETE /api/restaurants/:restaurantId/device-enrollments/:tokenId */
  @RequireFeature(FeatureFlag.POS)
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @Delete(':restaurantId/device-enrollments/:tokenId')
  revokeDeviceEnrollment(
    @Param('restaurantId') restaurantId: string,
    @Param('tokenId') tokenId: string,
    @Request() req: any,
  ) {
    return this.deviceEnrollment.revokeEnrollment(
      tokenId,
      restaurantId,
      req.user.id,
    );
  }

  // Throttle (Issue 52): DeepL cost protection — 2 full-menu translations per minute.
  // Enqueue-only — returns as soon as work is queued (202-shaped response);
  // MenuTranslationWorkerService does the actual translation asynchronously.
  @Throttle({ default: { limit: 2, ttl: 60000 } })
  @RequireFeature(FeatureFlag.LANGUAGES_MULTI)
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @Post(':restaurantId/translate-all')
  @HttpCode(202)
  translateAll(@Param('restaurantId') id: string, @Request() req: any) {
    return this.restaurantsService.enqueueTranslateAll(id, req.user.id);
  }

  // Poll fallback for the dashboard progress bar (socket-only had no
  // timeout/reconnect story) and the outdated/failed count badge.
  @RequireFeature(FeatureFlag.LANGUAGES_MULTI)
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @Get(':restaurantId/translation-status')
  getTranslationStatus(@Param('restaurantId') id: string, @Request() req: any) {
    return this.restaurantsService.getTranslationStatus(id, req.user.id);
  }

  @RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @Post(':restaurantId/stripe/connect')
  generateConnectLink(
    @Param('restaurantId') id: string,
    @Request() req: any,
    @Body('returnUrl') returnUrl?: string,
    @Body('refreshUrl') refreshUrl?: string,
  ) {
    return this.restaurantsService.generateConnectLink(
      id,
      req.user.id,
      returnUrl,
      refreshUrl,
    );
  }

  /** Return the restaurant logo as a base64 data URL so the QR PNG download
   *  can embed it inline without cross-origin canvas taint (Issue 18). */
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Get(':restaurantId/logo-base64')
  getLogoBase64(@Param('restaurantId') id: string, @Request() req: any) {
    return this.restaurantsService.getLogoBase64(id, req.user.id);
  }

  @RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @Get(':restaurantId/stripe/status')
  getStripeStatus(@Param('restaurantId') id: string, @Request() req: any) {
    return this.restaurantsService.getStripeStatus(id, req.user.id);
  }

  @RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @Post(':restaurantId/stripe/disconnect')
  disconnectStripe(@Param('restaurantId') id: string, @Request() req: any) {
    return this.restaurantsService.disconnectStripe(id, req.user.id);
  }
}
