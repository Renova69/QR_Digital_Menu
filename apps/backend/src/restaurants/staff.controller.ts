import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UsersService } from '../users/users.service';
import { CreateStaffDto } from '../users/dto/create-staff.dto';
import { UpdateStaffDto } from '../users/dto/update-staff.dto';
import {
  AuthorizedRestaurant,
  RequireRestaurantAccess,
} from '../auth/require-restaurant-access.decorator';
import { RestaurantAccessContext } from '../auth/restaurant-access.policy';

@RequireRestaurantAccess({
  policy: 'staff-management',
  source: 'params',
  key: 'restaurantId',
})
@Controller('restaurants/:restaurantId/staff')
export class StaffController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  listStaff(@AuthorizedRestaurant() access: RestaurantAccessContext) {
    return this.usersService.listStaffMembers(access.restaurantId);
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  createStaff(
    @AuthorizedRestaurant() access: RestaurantAccessContext,
    @Body(new ValidationPipe({ whitelist: true })) dto: CreateStaffDto,
  ) {
    return this.usersService.createStaffMember(
      access.restaurantId,
      { name: dto.name, email: dto.email, role: dto.role },
      access.role,
    );
  }

  @Patch(':userId')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  updateStaff(
    @AuthorizedRestaurant() access: RestaurantAccessContext,
    @Param('userId') userId: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: UpdateStaffDto,
  ) {
    return this.usersService.updateStaffMember(
      access.restaurantId,
      userId,
      dto,
      access.role,
    );
  }

  @Post(':userId/reset-pin')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  resetStaffPin(
    @AuthorizedRestaurant() access: RestaurantAccessContext,
    @Param('userId') userId: string,
  ) {
    return this.usersService.resetStaffPin(
      access.restaurantId,
      userId,
      access.role,
      access.userId,
    );
  }

  @Delete(':userId')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  removeStaff(
    @AuthorizedRestaurant() access: RestaurantAccessContext,
    @Param('userId') userId: string,
    @Query('hard') hard = '',
  ) {
    return this.usersService.removeStaffMember(
      access.restaurantId,
      userId,
      access.role,
      access.userId,
      hard === 'true',
    );
  }
}
