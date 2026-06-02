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
  Req,
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
import { Request as ExpressRequest } from 'express';
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
  @UseGuards(FeatureGuard)
  @Post(':id/logo')
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
    @Param('id') id: string,
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

      const { url, thumbnailUrl } = await this.storageService.uploadWithThumbnail(
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
  @UseGuards(FeatureGuard)
  @Post(':id/device-enrollment')
  createDeviceEnrollment(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true }))
    _dto: CreateDeviceEnrollmentDto,
    @Request() req: any,
    @Req() expressReq: ExpressRequest,
  ) {
    const frontendBaseUrl =
      expressReq.headers.origin ||
      process.env.FRONTEND_URL ||
      'http://localhost:3001';

    return this.deviceEnrollment.createEnrollment(
      id,
      req.user.id,
      frontendBaseUrl,
    );
  }

  @RequireFeature(FeatureFlag.POS)
  @UseGuards(FeatureGuard)
  @Get(':id/device-enrollments')
  listDeviceEnrollments(@Param('id') id: string, @Request() req: any) {
    return this.deviceEnrollment.listEnrollments(id, req.user.id);
  }

  @RequireFeature(FeatureFlag.LANGUAGES_MULTI)
  @UseGuards(FeatureGuard)
  @Post(':id/translate-all')
  translateAll(@Param('id') id: string, @Request() req: any) {
    return this.restaurantsService.translateAll(id, req.user.id);
  }

  @RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
  @UseGuards(FeatureGuard)
  @Post(':id/stripe/connect')
  generateConnectLink(
    @Param('id') id: string,
    @Request() req: any,
    @Body('returnUrl') returnUrl?: string,
    @Body('refreshUrl') refreshUrl?: string,
  ) {
    return this.restaurantsService.generateConnectLink(id, req.user.id, returnUrl, refreshUrl);
  }

  @RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
  @UseGuards(FeatureGuard)
  @Get(':id/stripe/status')
  getStripeStatus(@Param('id') id: string, @Request() req: any) {
    return this.restaurantsService.getStripeStatus(id, req.user.id);
  }

  @RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
  @UseGuards(FeatureGuard)
  @Post(':id/stripe/disconnect')
  disconnectStripe(@Param('id') id: string, @Request() req: any) {
    return this.restaurantsService.disconnectStripe(id, req.user.id);
  }
}
