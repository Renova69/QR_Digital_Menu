import {
  Controller,
  Get,
  Post,
  Put,
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
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { MenuCrudService } from './menu-crud.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { UpdateItemTranslationDto } from './dto/update-item-translation.dto';
import { StorageService } from '../storage/storage.service';
import { MenuTranslationOverrideService } from './menu-translation-override.service';

@UseGuards(JwtAuthGuard)
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
    @Request() req: any,
  ) {
    return this.crud.createItem(categoryId, createItemDto, req.user.id);
  }

  @Get()
  findAll(@Param('categoryId') categoryId: string, @Request() req: any) {
    return this.crud.findAllItemsInCategory(categoryId, req.user.id);
  }

  @Put('order')
  updateOrder(
    @Param('categoryId') categoryId: string,
    @Body('orderedIds') orderedIds: string[],
    @Request() req: any,
  ) {
    return this.crud.updateItemOrder(categoryId, orderedIds, req.user.id);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('items')
export class ItemDetailController {
  constructor(
    private readonly crud: MenuCrudService,
    private readonly storageService: StorageService,
    private readonly overrides: MenuTranslationOverrideService,
  ) {}

  @Get(':id/translations')
  getTranslations(@Param('id') id: string, @Request() req: any) {
    return this.overrides.getForItem(id, req.user.id);
  }

  // Owner-authored text only — no DeepL call, so the create/update cost guard
  // does not apply here.
  @Patch(':id/translations')
  updateTranslation(
    @Param('id') id: string,
    @Body(ValidationPipe) dto: UpdateItemTranslationDto,
    @Request() req: any,
  ) {
    return this.overrides.setOverride(id, dto.locale, dto.value, req.user.id);
  }

  // Same DeepL cost guard as item create (#30).
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateItemDto: UpdateItemDto,
    @Request() req: any,
  ) {
    return this.crud.updateItem(id, updateItemDto, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.crud.removeItem(id, req.user.id);
  }

  // Tighter per-route throttle: 5MB buffered in memory before ownership check
  // means a valid-JWT non-owner can force allocations at the global 100/60s rate.
  // 20/60s limits the blast radius without blocking legitimate use (L1.1).
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
    @Request() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('Only JPEG and PNG images are supported');
    }
    // Track uploaded URLs so we can delete them if the subsequent DB write fails.
    // `uploaded` is null until R2 upload succeeds — ownership/upload failures leave
    // nothing to clean up. If the DB write throws, the R2 objects are orphaned
    // without this guard (M1.1).
    let uploaded: { url: string; thumbnailUrl: string } | null = null;
    try {
      await this.crud.verifyItemOwnership(id, req.user.id);
      uploaded = await this.storageService.uploadWithThumbnail(
        file.buffer,
        file.originalname,
        file.mimetype,
      );
      return await this.crud.updateItemImage(
        id,
        uploaded.url,
        uploaded.thumbnailUrl,
        req.user.id,
      );
    } catch (error: any) {
      if (uploaded) {
        await Promise.allSettled([
          this.storageService.delete(uploaded.url),
          this.storageService.delete(uploaded.thumbnailUrl),
        ]);
      }
      throw new BadRequestException(error.message || 'Failed to upload image');
    }
  }
}
