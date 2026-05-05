import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  ValidationPipe,
  Patch,
  Delete,
} from '@nestjs/common';
import { MenuService } from './menu.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateMenuOptionDto } from './dto/create-menu-option.dto';
import { UpdateMenuOptionDto } from './dto/update-menu-option.dto';

@UseGuards(JwtAuthGuard)
@Controller('items/:itemId/options')
export class MenuOptionController {
  constructor(private readonly menuService: MenuService) {}

  @Post()
  create(
    @Param('itemId') itemId: string,
    @Body(ValidationPipe) createMenuOptionDto: CreateMenuOptionDto,
    @Request() req,
  ) {
    return this.menuService.createMenuOption(
      itemId,
      createMenuOptionDto,
      req.user.id,
    );
  }
}

@UseGuards(JwtAuthGuard)
@Controller('options')
export class MenuOptionDetailController {
  constructor(private readonly menuService: MenuService) {}

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateMenuOptionDto: UpdateMenuOptionDto,
    @Request() req,
  ) {
    return this.menuService.updateMenuOption(
      id,
      updateMenuOptionDto,
      req.user.id,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.menuService.removeMenuOption(id, req.user.id);
  }
}
