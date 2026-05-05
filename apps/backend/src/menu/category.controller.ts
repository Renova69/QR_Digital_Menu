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
import { MenuService } from './menu.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { StorageService } from '../storage/storage.service';

@UseGuards(JwtAuthGuard)
@Controller('restaurants/:restaurantId/categories')
export class CategoryController {
  constructor(private readonly menuService: MenuService) {}

  @Post()
  create(
    @Param('restaurantId') restaurantId: string,
    @Body(ValidationPipe) createCategoryDto: CreateCategoryDto,
    @Request() req,
  ) {
    return this.menuService.createCategory(
      restaurantId,
      createCategoryDto,
      req.user.id,
    );
  }

  @Get()
  findAll(@Param('restaurantId') restaurantId: string, @Request() req) {
    return this.menuService.findAllCategories(restaurantId, req.user.id);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('categories')
export class CategoryDetailController {
  constructor(
    private readonly menuService: MenuService,
    private readonly storageService: StorageService,
  ) {}

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateCategoryDto: UpdateCategoryDto,
    @Request() req,
  ) {
    return this.menuService.updateCategory(id, updateCategoryDto, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.menuService.removeCategory(id, req.user.id);
  }

  @Post(':id/image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new Error('Only image files are allowed'), false);
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
    const imageUrl = await this.storageService.upload(
      file.buffer,
      file.originalname,
      file.mimetype,
    );
    return this.menuService.updateCategoryImage(id, imageUrl, req.user.id);
  }
}
