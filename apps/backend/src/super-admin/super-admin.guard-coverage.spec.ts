import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HelpContentController } from '../help-content/help-content.controller';
import { PlatformSettingsController } from '../platform-settings/platform-settings.controller';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminGuard } from './super-admin.guard';

function guardNames(metadataTarget: object | Function): string[] {
  return (Reflect.getMetadata(GUARDS_METADATA, metadataTarget) ?? []).map(
    (guard: unknown) => {
      if (typeof guard === 'function') return guard.name;
      return (guard as { constructor?: { name?: string } })?.constructor?.name;
    },
  );
}

function expectSuperAdminGuards(metadataTarget: object | Function) {
  const guards = guardNames(metadataTarget);
  expect(guards).toContain(JwtAuthGuard.name);
  expect(guards).toContain(SuperAdminGuard.name);
}

describe('Super-admin route guard coverage', () => {
  it('guards every route on the /super-admin tenant controller at class level', () => {
    expectSuperAdminGuards(SuperAdminController);
  });

  it('guards platform settings admin endpoints', () => {
    expectSuperAdminGuards(PlatformSettingsController.prototype.getAdmin);
    expectSuperAdminGuards(PlatformSettingsController.prototype.updateAdmin);
  });

  it('guards help-content admin endpoints', () => {
    expectSuperAdminGuards(HelpContentController.prototype.getAll);
    expectSuperAdminGuards(HelpContentController.prototype.create);
    expectSuperAdminGuards(HelpContentController.prototype.reorder);
    expectSuperAdminGuards(HelpContentController.prototype.update);
    expectSuperAdminGuards(HelpContentController.prototype.delete);
  });
});
