import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UseGuards,
  applyDecorators,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthErrorCode } from '../common/errors/auth-error-codes';

export const STEP_UP_MAX_AGE_SECONDS = 5 * 60;
const STRONG_AUTH_METHODS = ['PASSWORD', 'GOOGLE', 'OTP'] as const;

type StepUpRequest = {
  user?: {
    id?: string;
    sessionId?: string;
    isImpersonation?: boolean;
  };
};

/**
 * Requires a recently created durable session obtained with a strong
 * credential. The normal JWT/session guards remain responsible for identity
 * and revocation; this guard adds only the freshness requirement for a small
 * set of high-impact mutations.
 *
 * PIN, impersonation and legacy sessions can never satisfy step-up. A caller
 * re-authenticates by signing in again, which creates a new durable session.
 */
@Injectable()
export class StepUpAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<StepUpRequest>();
    const userId = request.user?.id;
    const sessionId = request.user?.sessionId;

    if (!userId || !sessionId || request.user?.isImpersonation) {
      this.reject();
    }

    const now = new Date();
    const authenticatedAfter = new Date(
      now.getTime() - STEP_UP_MAX_AGE_SECONDS * 1000,
    );
    const session = await this.prisma.userSession.findFirst({
      where: {
        id: sessionId,
        userId,
        authMethod: { in: [...STRONG_AUTH_METHODS] },
        createdAt: { gte: authenticatedAfter },
        revokedAt: null,
        expiresAt: { gt: now },
      },
      select: { id: true },
    });

    if (!session) this.reject();
    return true;
  }

  private reject(): never {
    throw new ForbiddenException({
      code: AuthErrorCode.STEP_UP_REQUIRED,
      message: 'Sign in again before performing this sensitive action.',
      maxAgeSeconds: STEP_UP_MAX_AGE_SECONDS,
    });
  }
}

export function RequireStepUp() {
  return applyDecorators(UseGuards(StepUpAuthGuard));
}
