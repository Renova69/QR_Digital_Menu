import { PrintStationController } from './print-station.controller';
import { FeatureFlag } from '../subscription/feature-flag.enum';
import { REQUIRE_FEATURE_KEY } from '../subscription/require-feature.decorator';

describe('PrintStationController feature contract', () => {
  it('requires Enterprise thermal-printer entitlement for every endpoint', () => {
    expect(
      Reflect.getMetadata(REQUIRE_FEATURE_KEY, PrintStationController),
    ).toEqual([FeatureFlag.PRINTERS_THERMAL]);
  });
});
