import { SetMetadata } from '@nestjs/common';
import { FeatureFlag } from './feature-flag.enum';

export const REQUIRE_FEATURE_KEY = 'requireFeature';
export const RequireFeature = (...features: FeatureFlag[]) =>
  SetMetadata(REQUIRE_FEATURE_KEY, features);
