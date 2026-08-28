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
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { UpdateItemTranslationDto } from './dto/update-item-translation.dto';
import { StorageService } from '../storage/storage.service';
import { MenuTranslationOverrideService } from './menu-translation-override.service';

interface AuthenticatedRequest {
  user: { id: string };
}

@RequireRestaurantAccess({
  policy: 'menu-management',
  source: 'params',
  key: 'categoryId',
  resource: 'category',
})
@Controller('categories/:categoryId/items')
export class ItemController {
  constructor(private readonly crud: MenuCrudService) {}

  // Item create/update fan out to DeepL for every target language (name +
  // description + allergens + tags). Left on the global 100/60s, scripted edits
  // could push hundreds of thousands of characters/min at the platform's DeepL
  // key. 30/60s still covers manual menu setup but caps cost abuse (#30).
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post()
  create(
    @Param('categoryId') categoryId: string,
    @Body(ValidationPipe) createItemDto: CreateItemDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.crud.createItem(categoryId, createItemDto, req.user.id);
  }

  @Get()
  findAll(
    @Param('categoryId') categoryId: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.crud.findAllItemsInCategory(categoryId, req.user.id);
  }

  @Put('order')
  updateOrder(
    @Param('categoryId') categoryId: string,
    @Body('orderedIds') orderedIds: string[],
    @Request() req: { user: { id: string } },
  ) {
    return this.crud.updateItemOrder(categoryId, orderedIds, req.user.id);
  }
}

@RequireRestaurantAccess({
  policy: 'menu-management',
  source: 'params',
  key: 'id',
  resource: 'item',
})
@Controller('items')
export class ItemDetailController {
  private readonly logger = new Logger(ItemDetailController.name);
  constructor(
    private readonly crud: MenuCrudService,
    private readonly storageService: StorageService,
    private readonly overrides: MenuTranslationOverrideService,
  ) {}

  @Get(':id/translations')
  getTranslations(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.overrides.getForItem(id, req.user.id);
  }

  // Owner-authored text only — no DeepL call, so the create/update cost guard
  // does not apply here.
  @Patch(':id/translations')
  updateTranslation(
    @Param('id') id: string,
    @Body(ValidationPipe) dto: UpdateItemTranslationDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.overrides.setOverride(
      id,
      dto.field,
      dto.locale,
      dto.value,
      req.user.id,
    );
  }

  // Same DeepL cost guard as item create (#30).
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateItemDto: UpdateItemDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.crud.updateItem(id, updateItemDto, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.crud.removeItem(id, req.user.id);
  }

  // Tenant authorization now precedes Multer buffering. Keep the tighter
  // throttle and 5MB cap to bound uploads by authorized owners/managers too.
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post(':id/image')
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
  async uploadImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: { id: string } },
  ) {
    if (!file) {
      throw new BadRequestException('Only JPEG and PNG images are supported');
    }
    // Track uploaded URLs so we can delete them if the subsequent DB write fails.
    // `uploaded` is null until R2 upload succeeds — ownership/upload failures leave
    // nothing to clean up. If the DB write throws, the R2 objects are orphaned
    // without this guard (M1.1).
    let uploaded: { url: string; thumbnailUrl: string } | null = null;
    let restaurantId: string | null = null;
    try {
      // Server-derived tenant; see CategoryDetailController.uploadImage.
      restaurantId = await this.crud.verifyItemOwnership(id, req.user.id);
      uploaded = await this.storageService.uploadWithThumbnail(
        file.buffer,
        file.originalname,
        file.mimetype,
        restaurantId,
      );
      return await this.crud.updateItemImage(
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
