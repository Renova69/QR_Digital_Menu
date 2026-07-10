import { Test, TestingModule } from '@nestjs/testing';
import { StaffController } from './staff.controller';
import { UsersService } from '../users/users.service';
import { ForbiddenException } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

describe('StaffController', () => {
  let controller: StaffController;
  let usersService: jest.Mocked<UsersService>;

  beforeEach(async () => {
    const mockUsersService = {
      verifyRestaurantAccess: jest.fn(),
      listStaffMembers: jest.fn(),
      createStaffMember: jest.fn(),
      updateStaffMember: jest.fn(),
      resetStaffPin: jest.fn(),
      removeStaffMember: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60, limit: 10 }])],
      controllers: [StaffController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<StaffController>(StaffController);
    usersService = module.get(UsersService) as jest.Mocked<UsersService>;
  });

  describe('listStaff', () => {
    it('should throw ForbiddenException if user is not OWNER or MANAGER', async () => {
      const req = { user: { role: 'STAFF', id: 'user-id' } };
      await expect(controller.listStaff('restaurant-id', req)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return staff members if user is OWNER', async () => {
      const req = { user: { role: 'OWNER', id: 'user-id' } };
      usersService.listStaffMembers.mockResolvedValue([
        { id: 'staff-1' },
      ] as unknown as Awaited<ReturnType<UsersService['listStaffMembers']>>);

      const result = await controller.listStaff('restaurant-id', req);

      expect(usersService.verifyRestaurantAccess).toHaveBeenCalledWith(
        'restaurant-id',
        'user-id',
      );
      expect(usersService.listStaffMembers).toHaveBeenCalledWith(
        'restaurant-id',
      );
      expect(result).toEqual([{ id: 'staff-1' }]);
    });
  });

  describe('createStaff', () => {
    it('should call usersService.createStaffMember', async () => {
      const req = { user: { role: 'MANAGER', id: 'user-id' } };
      const dto = { name: 'John', email: 'john@example.com', role: 'STAFF' };
      usersService.createStaffMember.mockResolvedValue({
        id: 'new-staff',
      } as unknown as Awaited<ReturnType<UsersService['createStaffMember']>>);

      const result = await controller.createStaff(
        'restaurant-id',
        dto as Parameters<typeof controller.createStaff>[1],
        req,
      );

      expect(usersService.verifyRestaurantAccess).toHaveBeenCalledWith(
        'restaurant-id',
        'user-id',
      );
      expect(usersService.createStaffMember).toHaveBeenCalledWith(
        'restaurant-id',
        { name: dto.name, email: dto.email, role: dto.role },
        'MANAGER',
      );
      expect(result).toEqual({ id: 'new-staff' });
    });
  });

  describe('updateStaff', () => {
    it('should call usersService.updateStaffMember', async () => {
      const req = { user: { role: 'OWNER', id: 'user-id' } };
      const dto = { name: 'John Doe' };
      usersService.updateStaffMember.mockResolvedValue({
        id: 'staff-1',
        name: 'John Doe',
      } as unknown as Awaited<ReturnType<UsersService['updateStaffMember']>>);

      const result = await controller.updateStaff(
        'restaurant-id',
        'staff-1',
        dto as Parameters<typeof controller.updateStaff>[2],
        req,
      );

      expect(usersService.updateStaffMember).toHaveBeenCalledWith(
        'restaurant-id',
        'staff-1',
        dto,
        'OWNER',
      );
      expect(result).toEqual({ id: 'staff-1', name: 'John Doe' });
    });
  });

  describe('resetStaffPin', () => {
    it('should call usersService.resetStaffPin', async () => {
      const req = { user: { role: 'MANAGER', id: 'manager-id' } };
      usersService.resetStaffPin.mockResolvedValue({
        tempPin: '1234',
      } as unknown as Awaited<ReturnType<UsersService['resetStaffPin']>>);

      const result = await controller.resetStaffPin(
        'restaurant-id',
        'staff-1',
        req,
      );

      expect(usersService.resetStaffPin).toHaveBeenCalledWith(
        'restaurant-id',
        'staff-1',
        'MANAGER',
        'manager-id',
      );
      expect(result).toEqual({ tempPin: '1234' });
    });
  });

  describe('removeStaff', () => {
    it('should call usersService.removeStaffMember', async () => {
      const req = { user: { role: 'OWNER', id: 'owner-id' } };
      usersService.removeStaffMember.mockResolvedValue({
        success: true,
      } as unknown as Awaited<ReturnType<UsersService['removeStaffMember']>>);

      const result = await controller.removeStaff(
        'restaurant-id',
        'staff-1',
        req,
        'true',
      );

      expect(usersService.removeStaffMember).toHaveBeenCalledWith(
        'restaurant-id',
        'staff-1',
        'OWNER',
        'owner-id',
        true,
      );
      expect(result).toEqual({ success: true });
    });

    it('should handle hard query parameter properly when absent', async () => {
      const req = { user: { role: 'OWNER', id: 'owner-id' } };
      await controller.removeStaff('restaurant-id', 'staff-1', req);
      expect(usersService.removeStaffMember).toHaveBeenCalledWith(
        'restaurant-id',
        'staff-1',
        'OWNER',
        'owner-id',
        false,
      );
    });
  });
});
