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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { RestaurantsService } from './restaurants.service';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StorageService } from '../storage/storage.service';

@UseGuards(JwtAuthGuard)
@Controller('restaurants')
export class RestaurantsController {
  constructor(
    private readonly restaurantsService: RestaurantsService,
    private readonly storageService: StorageService,
  ) {}

  @Post()
  create(
    @Body(ValidationPipe) createRestaurantDto: CreateRestaurantDto,
    @Request() req,
  ) {
    return this.restaurantsService.create(createRestaurantDto, req.user.id);
  }

  @Get()
  findAll(@Request() req) {
    return this.restaurantsService.findAll(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.restaurantsService.findOne(id, req.user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateRestaurantDto: UpdateRestaurantDto,
    @Request() req,
  ) {
    return this.restaurantsService.update(id, updateRestaurantDto, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.restaurantsService.remove(id, req.user.id);
  }

  @Post(':id/logo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new Error('Only image files are allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadLogo(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req,
  ) {
    const logoUrl = await this.storageService.upload(
      file.buffer,
      file.originalname,
      file.mimetype,
    );
    return this.restaurantsService.updateLogo(id, logoUrl, req.user.id);
  }

  @Post(':id/translate-all')
  translateAll(@Param('id') id: string, @Request() req) {
    return this.restaurantsService.translateAll(id, req.user.id);
  }
}
