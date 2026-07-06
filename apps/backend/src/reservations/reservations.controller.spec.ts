import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FeatureFlag } from '../subscription/feature-flag.enum';
import { FeatureGuard } from '../subscription/feature.guard';
import { REQUIRE_FEATURE_KEY } from '../subscription/require-feature.decorator';
import { ReservationsController } from './reservations.controller';

function guardNames(metadataTarget: object | Function): string[] {
  return (Reflect.getMetadata(GUARDS_METADATA, metadataTarget) ?? []).map(
    (guard: unknown) => {
      if (typeof guard === 'function') return guard.name;
      return (guard as { constructor?: { name?: string } })?.constructor?.name;
    },
  );
}

describe('ReservationsController entitlement coverage', () => {
  it('requires authentication and the reservations feature for every dashboard route', () => {
    expect(guardNames(ReservationsController)).toEqual(
      expect.arrayContaining([JwtAuthGuard.name, FeatureGuard.name]),
    );
    expect(
      Reflect.getMetadata(REQUIRE_FEATURE_KEY, ReservationsController),
    ).toEqual([FeatureFlag.RESERVATIONS]);
  });
});
