import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RestaurantsController } from '../restaurants/restaurants.controller';
import { StaffController } from '../restaurants/staff.controller';
import { SuperAdminController } from '../super-admin/super-admin.controller';
import { StepUpAuthGuard } from './step-up-auth.guard';

const handler = (prototype: object, method: string) =>
  Object.getOwnPropertyDescriptor(prototype, method)?.value as object;

const guardNames = (target: object) =>
  ((Reflect.getMetadata(GUARDS_METADATA, target) as unknown[]) ?? []).map(
    (guard) => (guard as { name?: string }).name,
  );

describe('step-up route coverage', () => {
  it('requires step-up on every super-admin mutation', () => {
    const prototype = SuperAdminController.prototype;
    const mutationNames = Object.getOwnPropertyNames(prototype).filter(
      (name) => {
        const target = Object.getOwnPropertyDescriptor(prototype, name)?.value;
        const method = target
          ? (Reflect.getMetadata(METHOD_METADATA, target) as
              | RequestMethod
              | undefined)
          : undefined;
        return method !== undefined && method !== RequestMethod.GET;
      },
    );

    expect(mutationNames).not.toHaveLength(0);
    for (const method of mutationNames) {
      expect(guardNames(handler(prototype, method))).toContain(
        StepUpAuthGuard.name,
      );
    }
  });

  it.each([
    [StaffController.prototype, 'resetStaffPin'],
    [RestaurantsController.prototype, 'createDeviceEnrollment'],
    [RestaurantsController.prototype, 'revokeDeviceEnrollment'],
  ])('requires step-up on %s.%s', (controller, method) => {
    expect(guardNames(handler(controller, method))).toContain(
      StepUpAuthGuard.name,
    );
  });

  it('does not require step-up for the read-only device list', () => {
    expect(
      guardNames(
        handler(RestaurantsController.prototype, 'listDeviceEnrollments'),
      ),
    ).not.toContain(StepUpAuthGuard.name);
  });
});
