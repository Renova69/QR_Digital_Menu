import {
  Controller,
  Get,
  Param,
  Res,
  Version,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ReservationsService } from './reservations.service';

/**
 * Short in-house manage-link redirect used in reservation SMS. The path is
 * excluded from the global `/api` prefix and version segment in `main.ts`, so
 * the public URL is simply `{BACKEND_URL}/r/{token}` — far shorter than the
 * full `/booking/manage?r=&token=&lang=` frontend URL. The token stays in our
 * own infrastructure (no third-party shortener) and is the credential, so this
 * route is public but rate-limited.
 */
@Controller()
export class ReservationRedirectController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get('r/:token')
  @Version(VERSION_NEUTRAL)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async redirect(
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const url = await this.reservations.resolveManageRedirect(token);
    const fallback = `${(process.env.FRONTEND_URL || 'http://localhost:3001').replace(/\/+$/, '')}/booking`;
    // 302 (not 301) — a manage link must not be cached; the reservation it
    // points at can be cancelled or expire.
    res.redirect(302, url ?? fallback);
  }
}
