import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { PushService } from './push.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @UseGuards(JwtAuthGuard)
  @Post('subscribe')
  async subscribe(@Request() req: any, @Body() subscription: any) {
    return this.pushService.createSubscription(req.user.id, subscription);
  }
}
