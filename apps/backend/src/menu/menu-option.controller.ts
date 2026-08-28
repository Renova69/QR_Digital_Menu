import {
  Controller,
  Post,
  Body,
  Param,
  Request,
  ValidationPipe,
  Patch,
  Delete,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { MenuCrudService } from './menu-crud.service';
import { RequireRestaurantAccess } from '../auth/require-restaurant-access.decorator';
import { CreateMenuOptionDto } from './dto/create-menu-option.dto';
import { UpdateMenuOptionDto } from './dto/update-menu-option.dto';

@RequireRestaurantAccess({
  policy: 'menu-management',
  source: 'params',
  key: 'itemId',
  resource: 'item',
})
@Controller('items/:itemId/options')
export class MenuOptionController {
  constructor(private readonly crud: MenuCrudService) {}

  // Option name + choice names are pre-warmed to DeepL — throttle for cost (#30).
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post()
  create(
    @Param('itemId') itemId: string,
    @Body(ValidationPipe) createMenuOptionDto: CreateMenuOptionDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.crud.createMenuOption(itemId, createMenuOptionDto, req.user.id);
  }
}

@RequireRestaurantAccess({
  policy: 'menu-management',
  source: 'params',
  key: 'id',
  resource: 'option',
})
@Controller('options')
export class MenuOptionDetailController {
  constructor(private readonly crud: MenuCrudService) {}

  // Same DeepL cost guard as option create (#30).
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateMenuOptionDto: UpdateMenuOptionDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.crud.updateMenuOption(id, updateMenuOptionDto, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.crud.removeMenuOption(id, req.user.id);
  }
}
