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
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { StorageService } from '../storage/storage.service';

@UseGuards(JwtAuthGuard)
@Controller('restaurants/:restaurantId/categories')
export class CategoryController {
  constructor(private readonly crud: MenuCrudService) {}

  @Post()
  create(
    @Param('restaurantId') restaurantId: string,
    @Body(ValidationPipe) createCategoryDto: CreateCategoryDto,
    @Request() req: any,
  ) {
    return this.crud.createCategory(
      restaurantId,
      createCategoryDto,
      req.user.id,
    );
  }

  @Get()
  findAll(@Param('restaurantId') restaurantId: string, @Request() req: any) {
    return this.crud.findAllCategories(restaurantId, req.user.id);
  }

  @Put('order')
  updateOrder(
    @Param('restaurantId') restaurantId: string,
    @Body('orderedIds') orderedIds: string[],
    @Request() req: any,
  ) {
    return this.crud.updateCategoryOrder(restaurantId, orderedIds, req.user.id);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('categories')
export class CategoryDetailController {
  constructor(
    private readonly crud: MenuCrudService,
    private readonly storageService: StorageService,
  ) {}

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateCategoryDto: UpdateCategoryDto,
    @Request() req: any,
  ) {
    return this.crud.updateCategory(id, updateCategoryDto, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.crud.removeCategory(id, req.user.id);
  }

  @Post(':id/image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
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
    @Request() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('Only JPEG and PNG images are supported');
    }
    try {
      const { url, thumbnailUrl } =
        await this.storageService.uploadWithThumbnail(
          file.buffer,
          file.originalname,
          file.mimetype,
        );
      return this.crud.updateCategoryImage(id, url, thumbnailUrl, req.user.id);
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Failed to upload image');
    }
  }
}
