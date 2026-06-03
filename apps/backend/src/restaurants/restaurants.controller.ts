import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  ValidationPipe,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
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

  @RequireFeature(FeatureFlag.BRANDING_CUSTOM)
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @Post(':restaurantId/logo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
      fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png'];
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
      // storage on unauthorised requests. The actual DB write happens in the
      // subsequent PATCH /restaurants/:id so that logo + branding settings are
      // persisted atomically in one transaction.
      await this.restaurantsService.findOneForManagement(id, req.user.id);

      const { url, thumbnailUrl } =
        await this.storageService.uploadWithThumbnail(
          file.buffer,
          file.originalname,
          file.mimetype,
        );
      return { logoUrl: url, logoThumbnailUrl: thumbnailUrl };
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Failed to upload logo');
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

  @RequireFeature(FeatureFlag.LANGUAGES_MULTI)
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @Post(':restaurantId/translate-all')
  translateAll(@Param('restaurantId') id: string, @Request() req: any) {
    return this.restaurantsService.translateAll(id, req.user.id);
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
