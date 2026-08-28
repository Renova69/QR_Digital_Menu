import { StaffController } from './staff.controller';
import { UsersService } from '../users/users.service';
import { RestaurantAccessContext } from '../auth/restaurant-access.policy';

describe('StaffController authorized dispatch', () => {
  const usersService = {
    listStaffMembers: jest.fn(),
    createStaffMember: jest.fn(),
    updateStaffMember: jest.fn(),
    resetStaffPin: jest.fn(),
    removeStaffMember: jest.fn(),
  };
  const controller = new StaffController(
    usersService as unknown as UsersService,
  );
  const access: RestaurantAccessContext = {
    restaurantId: 'restaurant-id',
    userId: 'owner-id',
    role: 'OWNER',
    tier: 'ENTERPRISE',
    forceTier: null,
  };
  // Role/tenant denials are tested at the real guard and HTTP seam, not by
  // calling a controller method (which never executes Nest decorators).
  beforeEach(() => jest.resetAllMocks());

  it('lists staff in the authorized restaurant', async () => {
    usersService.listStaffMembers.mockResolvedValue([{ id: 'staff-1' }]);
    expect(await controller.listStaff(access)).toEqual([{ id: 'staff-1' }]);
    expect(usersService.listStaffMembers).toHaveBeenCalledWith('restaurant-id');
  });
  it('forwards the effective manager role when creating staff', async () => {
    const dto = {
      name: 'John',
      email: 'john@example.com',
      role: 'STAFF' as const,
    };
    usersService.createStaffMember.mockResolvedValue({ id: 'new-staff' });
    expect(
      await controller.createStaff({ ...access, role: 'MANAGER' }, dto),
    ).toEqual({ id: 'new-staff' });
    expect(usersService.createStaffMember).toHaveBeenCalledWith(
      'restaurant-id',
      dto,
      'MANAGER',
    );
  });
  it('keeps the target user and effective caller role on update', async () => {
    const dto = { isActive: false };
    await controller.updateStaff(access, 'staff-1', dto);
    expect(usersService.updateStaffMember).toHaveBeenCalledWith(
      'restaurant-id',
      'staff-1',
      dto,
      'OWNER',
    );
  });
  it('keeps PIN resets tenant-scoped and attributed to the caller', async () => {
    const manager = { ...access, userId: 'manager-id', role: 'MANAGER' };
    await controller.resetStaffPin(manager, 'staff-1');
    expect(usersService.resetStaffPin).toHaveBeenCalledWith(
      'restaurant-id',
      'staff-1',
      'MANAGER',
      'manager-id',
    );
  });
  it.each([
    ['true', true],
    ['', false],
    ['false', false],
  ] as const)(
    'preserves the hard=%s removal flag and audit actor',
    async (hard, expected) => {
      await controller.removeStaff(access, 'staff-1', hard);
      expect(usersService.removeStaffMember).toHaveBeenCalledWith(
        'restaurant-id',
        'staff-1',
        'OWNER',
        'owner-id',
        expected,
      );
    },
  );
  it('defaults removal to soft removal', async () => {
    await controller.removeStaff(access, 'staff-1');
    expect(usersService.removeStaffMember).toHaveBeenCalledWith(
      'restaurant-id',
      'staff-1',
      'OWNER',
      'owner-id',
      false,
    );
  });
});
