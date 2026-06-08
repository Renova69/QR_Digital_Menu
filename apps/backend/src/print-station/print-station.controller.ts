import {
  Controller, Get, Post, Patch, Delete, Query,
  Param, Body, UseGuards, Request,
  NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrintStationService } from './print-station.service';
import { CreatePrintStationDto } from './dto/create-print-station.dto';
import { UpdatePrintStationDto } from './dto/update-print-station.dto';
import { GenerateTokenDto } from './dto/generate-token.dto';
import { RestaurantsService } from '../restaurants/restaurants.service';

@UseGuards(JwtAuthGuard)
@Controller('print-stations')
export class PrintStationController {
  constructor(
    private readonly service: PrintStationService,
    private readonly restaurantsService: RestaurantsService,
  ) {}

  // H-4: explicit OWNER gate — print-station management is owner-only
  private async getRestaurantId(userId: string, userRole: string): Promise<string> {
    if (userRole !== 'OWNER') {
      throw new ForbiddenException('Print station management requires OWNER role');
    }
    const restaurant = await this.restaurantsService.findByOwner(userId);
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    return restaurant.id;
  }

  @Get()
  async list(@Request() req: any) {
    const restaurantId = await this.getRestaurantId(req.user.id, req.user.role);
    return this.service.list(restaurantId);
  }

  @Get('health')
  async health(@Request() req: any) {
    const restaurantId = await this.getRestaurantId(req.user.id, req.user.role);
    return this.service.getStationHealth(restaurantId);
  }

  @Post()
  async create(@Request() req: any, @Body() dto: CreatePrintStationDto) {
    const restaurantId = await this.getRestaurantId(req.user.id, req.user.role);
    return this.service.create(restaurantId, dto);
  }

  @Patch(':id')
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdatePrintStationDto,
  ) {
    const restaurantId = await this.getRestaurantId(req.user.id, req.user.role);
    return this.service.update(restaurantId, id, dto);
  }

  @Delete(':id')
  async remove(@Request() req: any, @Param('id') id: string) {
    const restaurantId = await this.getRestaurantId(req.user.id, req.user.role);
    await this.service.remove(restaurantId, id);
    return { success: true };
  }

  @Get(':id/jobs')
  async getJobs(
    @Request() req: any,
    @Param('id') id: string,
    @Query('status') status?: string,
  ) {
    const restaurantId = await this.getRestaurantId(req.user.id, req.user.role);
    return this.service.getJobs(restaurantId, id, status);
  }

  @Post(':id/tokens')
  async generateToken(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: GenerateTokenDto,
  ) {
    const restaurantId = await this.getRestaurantId(req.user.id, req.user.role);
    return this.service.generateToken(restaurantId, id, dto.label);
  }

  @Delete('tokens/:tokenId')
  async revokeToken(@Request() req: any, @Param('tokenId') tokenId: string) {
    const restaurantId = await this.getRestaurantId(req.user.id, req.user.role);
    await this.service.revokeToken(restaurantId, tokenId);
    return { success: true };
  }
}
