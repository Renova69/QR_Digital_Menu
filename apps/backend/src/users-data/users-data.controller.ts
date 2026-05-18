import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersDataService } from './users-data.service';

@ApiTags('users-data')
@Controller('users/me')
@UseGuards(JwtAuthGuard)
export class UsersDataController {
  constructor(private readonly usersDataService: UsersDataService) {}

  @Get('export')
  @ApiOperation({ summary: 'Export personal data (GDPR Art. 20)' })
  async exportData(@Req() req: any) {
    return this.usersDataService.exportSelf(req.user.id);
  }

  @Delete('delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 1, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Erase account and all personal data (GDPR Art. 17)' })
  async deleteAccount(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    await this.usersDataService.eraseSelf(req.user.id);
    res.clearCookie('token');
  }
}
