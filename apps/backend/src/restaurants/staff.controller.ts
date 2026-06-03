import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
  ValidationPipe,
  ForbiddenException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from '../users/users.service';
import { CreateStaffDto } from '../users/dto/create-staff.dto';
import { UpdateStaffDto } from '../users/dto/update-staff.dto';

function assertManagerOrOwner(req: any): string {
  const role: string = req.user?.role?.toUpperCase() ?? '';
  if (role !== 'OWNER' && role !== 'MANAGER') {
    throw new ForbiddenException('Only owners and managers can manage staff');
  }
  return role;
}

@UseGuards(JwtAuthGuard)
@Controller('restaurants/:restaurantId/staff')
export class StaffController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async listStaff(
    @Param('restaurantId') restaurantId: string,
    @Request() req: any,
  ) {
    assertManagerOrOwner(req);
    await this.usersService.verifyRestaurantAccess(restaurantId, req.user.id);
    return this.usersService.listStaffMembers(restaurantId);
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async createStaff(
    @Param('restaurantId') restaurantId: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: CreateStaffDto,
    @Request() req: any,
  ) {
    const callerRole = assertManagerOrOwner(req);
    await this.usersService.verifyRestaurantAccess(restaurantId, req.user.id);
    return this.usersService.createStaffMember(
      restaurantId,
      { name: dto.name, email: dto.email, role: dto.role },
      callerRole,
    );
  }

  @Patch(':userId')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async updateStaff(
    @Param('restaurantId') restaurantId: string,
    @Param('userId') userId: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: UpdateStaffDto,
    @Request() req: any,
  ) {
    const callerRole = assertManagerOrOwner(req);
    await this.usersService.verifyRestaurantAccess(restaurantId, req.user.id);
    return this.usersService.updateStaffMember(
      restaurantId,
      userId,
      dto,
      callerRole,
    );
  }

  @Post(':userId/reset-pin')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async resetStaffPin(
    @Param('restaurantId') restaurantId: string,
    @Param('userId') userId: string,
    @Request() req: any,
  ) {
    const callerRole = assertManagerOrOwner(req);
    await this.usersService.verifyRestaurantAccess(restaurantId, req.user.id);
    return this.usersService.resetStaffPin(restaurantId, userId, callerRole);
  }

  @Delete(':userId')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async removeStaff(
    @Param('restaurantId') restaurantId: string,
    @Param('userId') userId: string,
    @Request() req: any,
  ) {
    const callerRole = assertManagerOrOwner(req);
    await this.usersService.verifyRestaurantAccess(restaurantId, req.user.id);
    return this.usersService.removeStaffMember(
      restaurantId,
      userId,
      callerRole,
    );
  }
}
