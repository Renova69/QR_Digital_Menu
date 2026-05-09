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
import { MenuService } from './menu.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { StorageService } from '../storage/storage.service';

@UseGuards(JwtAuthGuard)
@Controller('categories/:categoryId/items')
export class ItemController {
  constructor(private readonly menuService: MenuService) {}

  @Post()
  create(
    @Param('categoryId') categoryId: string,
    @Body(ValidationPipe) createItemDto: CreateItemDto,
    @Request() req,
  ) {
    return this.menuService.createItem(categoryId, createItemDto, req.user.id);
  }

  @Get()
  findAll(@Param('categoryId') categoryId: string, @Request() req) {
    return this.menuService.findAllItemsInCategory(categoryId, req.user.id);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('items')
export class ItemDetailController {
  constructor(
    private readonly menuService: MenuService,
    private readonly storageService: StorageService,
  ) {}

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateItemDto: UpdateItemDto,
    @Request() req,
  ) {
    return this.menuService.updateItem(id, updateItemDto, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.menuService.removeItem(id, req.user.id);
  }

  @Post(':id/image')
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
  async uploadImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req,
  ) {
    if (!file) {
      throw new BadRequestException('Only JPEG and PNG images are supported');
    }
    try {
      const { url, thumbnailUrl } = await this.storageService.uploadWithThumbnail(
        file.buffer,
        file.originalname,
        file.mimetype,
      );
      return this.menuService.updateItemImage(id, url, thumbnailUrl, req.user.id);
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Failed to upload image');
    }
  }
}
