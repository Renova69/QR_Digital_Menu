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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConsentService } from './consent.service';

class RecordConsentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiProperty()
  @IsString()
  visitorId: string;

  @ApiProperty({ enum: ['ANALYTICS', 'MARKETING'] })
  @IsIn(['ANALYTICS', 'MARKETING'])
  category: 'ANALYTICS' | 'MARKETING';

  @ApiProperty()
  @IsBoolean()
  granted: boolean;

  @ApiProperty({ type: Number })
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
