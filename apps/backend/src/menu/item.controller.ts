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
import { memoryStorage } from 'multer';
import { MenuCrudService } from './menu-crud.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { StorageService } from '../storage/storage.service';

@UseGuards(JwtAuthGuard)
@Controller('categories/:categoryId/items')
export class ItemController {
  constructor(private readonly crud: MenuCrudService) {}

  @Post()
  create(
    @Param('categoryId') categoryId: string,
    @Body(ValidationPipe) createItemDto: CreateItemDto,
    @Request() req,
  ) {
    return this.crud.createItem(categoryId, createItemDto, req.user.id);
  }

  @Get()
  findAll(@Param('categoryId') categoryId: string, @Request() req) {
    return this.crud.findAllItemsInCategory(categoryId, req.user.id);
  }

  @Put('order')
  updateOrder(
    @Param('categoryId') categoryId: string,
    @Body('orderedIds') orderedIds: string[],
    @Request() req,
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
  ) {}

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateItemDto: UpdateItemDto,
    @Request() req,
  ) {
    return this.crud.updateItem(id, updateItemDto, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.crud.removeItem(id, req.user.id);
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
      return this.crud.updateItemImage(id, url, thumbnailUrl, req.user.id);
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Failed to upload image');
    }
  }
}
