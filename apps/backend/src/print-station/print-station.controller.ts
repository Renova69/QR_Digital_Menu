import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, UseGuards, Request,
  NotFoundException,
} from '@nestjs/common';
import { IsString, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrintStationService } from './print-station.service';
import { CreatePrintStationDto } from './dto/create-print-station.dto';
import { UpdatePrintStationDto } from './dto/update-print-station.dto';
import { RestaurantsService } from '../restaurants/restaurants.service';

class GenerateTokenDto {
  @IsOptional()
  @IsString()
  label?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('print-stations')
export class PrintStationController {
  constructor(
    private readonly service: PrintStationService,
    private readonly restaurantsService: RestaurantsService,
  ) {}

  private async getRestaurantId(userId: string): Promise<string> {
    const restaurant = await this.restaurantsService.findByOwner(userId);
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    return restaurant.id;
  }

  @Get()
  async list(@Request() req: any) {
    const restaurantId = await this.getRestaurantId(req.user.id);
    return this.service.list(restaurantId);
  }

  @Get('health')
  async health(@Request() req: any) {
    const restaurantId = await this.getRestaurantId(req.user.id);
    return this.service.getStationHealth(restaurantId);
  }

  @Post()
  async create(@Request() req: any, @Body() dto: CreatePrintStationDto) {
    const restaurantId = await this.getRestaurantId(req.user.id);
    return this.service.create(restaurantId, dto);
  }

  @Patch(':id')
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdatePrintStationDto,
  ) {
    const restaurantId = await this.getRestaurantId(req.user.id);
    return this.service.update(restaurantId, id, dto);
  }

  @Delete(':id')
  async remove(@Request() req: any, @Param('id') id: string) {
    const restaurantId = await this.getRestaurantId(req.user.id);
    await this.service.remove(restaurantId, id);
    return { success: true };
  }

  @Post(':id/tokens')
  async generateToken(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: GenerateTokenDto,
  ) {
    const restaurantId = await this.getRestaurantId(req.user.id);
    return this.service.generateToken(restaurantId, id, dto.label);
  }

  @Delete('tokens/:tokenId')
  async revokeToken(@Request() req: any, @Param('tokenId') tokenId: string) {
    const restaurantId = await this.getRestaurantId(req.user.id);
    await this.service.revokeToken(restaurantId, tokenId);
    return { success: true };
  }
}
