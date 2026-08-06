import { Controller, Get, NotFoundException, Query } from '@nestjs/common';

// TEMPORARY — added solely to verify the new Sentry wiring captures a real
// 5xx from the live deployed backend, then removed in the very next commit.
// Gated behind a one-time throwaway token (not a real secret, just prevents
// randoms from tripping it) so it does nothing without the exact token.
const ONE_TIME_TOKEN = '62c13ee6-ef3f-49e0-9180-58a782d90832';

@Controller('debug')
export class DebugSentryVerificationController {
  @Get('sentry-test')
  triggerTestError(@Query('token') token?: string): never {
    if (token !== ONE_TIME_TOKEN) {
      throw new NotFoundException();
    }
    throw new Error(
      'Sentry verification test error — expected, safe to ignore, this route is being removed immediately after confirming capture',
    );
  }
}
