import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Logger,
  Param,
  Patch,
  Post,
  Put,
  Request,
  UploadedFile,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { MenuCrudService } from './menu-crud.service';
import { RequireRestaurantAccess } from '../auth/require-restaurant-access.decorator';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { StorageService } from '../storage/storage.service';

@RequireRestaurantAccess({
  policy: 'menu-management',
  source: 'params',
  key: 'restaurantId',
  resource: 'restaurant',
})
@Controller('restaurants/:restaurantId/categories')
export class CategoryController {
  constructor(private readonly crud: MenuCrudService) {}

  // Category name is pre-warmed to DeepL on create — throttle to cap
  // translation cost abuse, mirroring item create/update (#30).
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post()
  create(
    @Param('restaurantId') restaurantId: string,
    @Body(ValidationPipe) createCategoryDto: CreateCategoryDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.crud.createCategory(
      restaurantId,
      createCategoryDto,
      req.user.id,
    );
  }

  @Get()
  findAll(
    @Param('restaurantId') restaurantId: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.crud.findAllCategories(restaurantId, req.user.id);
  }

  @Put('order')
  updateOrder(
    @Param('restaurantId') restaurantId: string,
    @Body('orderedIds') orderedIds: string[],
    @Request() req: { user: { id: string } },
  ) {
    return this.crud.updateCategoryOrder(restaurantId, orderedIds, req.user.id);
  }
}

@RequireRestaurantAccess({
  policy: 'menu-management',
  source: 'params',
  key: 'id',
  resource: 'category',
})
@Controller('categories')
export class CategoryDetailController {
  private readonly logger = new Logger(CategoryDetailController.name);
  constructor(
    private readonly crud: MenuCrudService,
    private readonly storageService: StorageService,
  ) {}

  // Same DeepL cost guard as category create (#30).
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateCategoryDto: UpdateCategoryDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.crud.updateCategory(id, updateCategoryDto, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.crud.removeCategory(id, req.user.id);
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post(':id/image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.mimetype)) {
          return cb(null, false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: { id: string } },
  ) {
    if (!file) {
      throw new BadRequestException('Only JPEG and PNG images are supported');
    }
    let uploaded: { url: string; thumbnailUrl: string } | null = null;
    let restaurantId: string | null = null;
    try {
      // Tenant comes from the resource whose ownership was just verified --
      // never from the request, which the client controls.
      restaurantId = await this.crud.verifyCategoryOwnership(id, req.user.id);
      uploaded = await this.storageService.uploadWithThumbnail(
        file.buffer,
        file.originalname,
        file.mimetype,
        restaurantId,
      );
      return await this.crud.updateCategoryImage(
        id,
        uploaded.url,
        uploaded.thumbnailUrl,
        req.user.id,
      );
    } catch (error: unknown) {
      if (uploaded && restaurantId) {
        await Promise.allSettled([
          this.storageService.delete(uploaded.url, restaurantId),
          this.storageService.delete(uploaded.thumbnailUrl, restaurantId),
        ]);
      }
      // The ownership check runs inside this same try, so a blanket rethrow
      // turned every 403 into a 400 -- telling the caller their request was
      // malformed when they simply were not allowed to touch this resource.
      // Anything Nest already classified keeps its own status.
      if (error instanceof HttpException) throw error;
      // Everything else here is internal: the R2 client, sharp, Prisma. Their
      // messages carry bucket names, endpoints, constraint names and query
      // fragments. Log it in full, return none of it.
      this.logger.error(
        `Image upload failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new BadRequestException('Failed to upload image');
    }
  }
}
