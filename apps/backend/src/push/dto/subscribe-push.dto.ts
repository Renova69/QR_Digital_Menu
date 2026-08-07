import { Type } from 'class-transformer';
import {
  IsDefined,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class PushSubscriptionKeysDto {
  @IsString()
  @IsNotEmpty()
  p256dh: string;

  @IsString()
  @IsNotEmpty()
  auth: string;
}

export class SubscribePushDto {
  @IsString()
  @IsNotEmpty()
  endpoint: string;

  // Native PushSubscription.toJSON() always includes this (nullable) — not
  // read/stored anywhere server-side, but must be declared or the whitelist
  // pipe rejects the whole subscription payload.
  @IsOptional()
  @IsNumber()
  expirationTime?: number | null;

  // @ValidateNested() alone does NOT reject a missing/null `keys` —
  // class-validator skips nested validation for undefined values. Without
  // @IsDefined()/@IsObject() a keys-less payload passed validation and then
  // threw on `keys.p256dh` in push.service.createSubscription, turning bad
  // client input into a 500 instead of a 400.
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys: PushSubscriptionKeysDto;
}
