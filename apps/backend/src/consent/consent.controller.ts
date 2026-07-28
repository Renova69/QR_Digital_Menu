import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { ConsentService } from './consent.service';

class RecordConsentDto {
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @IsString()
  visitorId: string;

  @IsIn(['ANALYTICS', 'MARKETING'])
  category: 'ANALYTICS' | 'MARKETING';

  @IsBoolean()
  granted: boolean;

  @IsInt()
  policyVersion: number;
}

@Controller()
export class ConsentController {
  constructor(private readonly consentService: ConsentService) {}

  // Public — anonymous visitors record their own consent choice, no auth.
  @Post('consent')
  @HttpCode(204)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async recordConsent(
    @Body() body: RecordConsentDto,
    @Req() req: any,
  ): Promise<void> {
    await this.consentService.recordConsent(
      {
        restaurantId: body.restaurantId,
        visitorId: body.visitorId,
        category: body.category,
        granted: body.granted,
        policyVersion: body.policyVersion,
      },
      req.ip,
    );
  }
}
