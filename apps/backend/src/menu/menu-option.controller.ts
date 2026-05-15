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
import { MenuCrudService } from './menu-crud.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateMenuOptionDto } from './dto/create-menu-option.dto';
import { UpdateMenuOptionDto } from './dto/update-menu-option.dto';

@UseGuards(JwtAuthGuard)
@Controller('items/:itemId/options')
export class MenuOptionController {
  constructor(private readonly crud: MenuCrudService) {}

  @Post()
  create(
    @Param('itemId') itemId: string,
    @Body(ValidationPipe) createMenuOptionDto: CreateMenuOptionDto,
    @Request() req: any,
  ) {
    return this.crud.createMenuOption(
      itemId,
      createMenuOptionDto,
      req.user.id,
    );
  }
}

@UseGuards(JwtAuthGuard)
@Controller('options')
export class MenuOptionDetailController {
  constructor(private readonly crud: MenuCrudService) {}

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateMenuOptionDto: UpdateMenuOptionDto,
    @Request() req: any,
  ) {
    return this.crud.updateMenuOption(
      id,
      updateMenuOptionDto,
      req.user.id,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.crud.removeMenuOption(id, req.user.id);
  }
}
