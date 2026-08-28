import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isPinRole } from '../users/staff-roles';

/**
 * The subset of a session JWT that decides whether the session is still alive.
 * Deliberately loose: this is fed by two very different callers (Passport, and
 * a raw `jwt.verify()` in the websocket handshake) and neither can promise a
 * shape beyond "it verified".
 */
export type SessionJwtPayload = {
  sub: string;
  iat?: number;
  sessionId?: string;
  sessionVersion?: number;
  deviceTokenId?: string;
  deviceSessionVersion?: number;
  isImpersonation?: boolean;
  impersonationSessionId?: string;
};

/**
 * Every revocation signal that outlives a JWT's own signature and expiry:
 * account disable, password rotation, staff-device revocation, restaurant
 * suspension, ended impersonation.
 *
 * This lives on its own so the HTTP path and the websocket handshake cannot
 * drift apart. They did: `jwt.strategy` enforced all of it, while
 * `EventsGateway.handleConnection` only called `jwt.verify()` — so a cookie
 * issued before a password reset, or belonging to a device that had since been
 * revoked, still opened a live socket and kept receiving order traffic until
 * the token expired on its own.
 *
 * Throws rather than returning a result so the two callers stay honest: the
 * HTTP strategy lets the exception become a 401 with its existing code, and
 * the gateway catches it and leaves the socket anonymous.
 */
@Injectable()
export class SessionRevocationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @returns the User row (with `staffRestaurant`) when the session is still
   *          usable, so callers do not pay for a second lookup.
   */
  async assertSessionUsable(payload: SessionJwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        staffRestaurant: {
          select: { isActive: true, tier: true, forceTier: true },
        },
        // Issue 21: do NOT fetch restaurants[] — OWNER suspension deferred
        // to verifyDashboardAccess to avoid arbitrary restaurants[0] selection.
      },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    if (user.isActive === false || user.disabledAt) {
      throw new UnauthorizedException('ACCOUNT_DISABLED');
    }

    const legacy =
      payload.sessionId === undefined && payload.sessionVersion === undefined;
    if (
      !legacy &&
      (typeof payload.sessionId !== 'string' ||
        !payload.sessionId ||
        !Number.isInteger(payload.sessionVersion) ||
        (payload.sessionVersion ?? -1) < 0)
    ) {
      throw new UnauthorizedException('SESSION_REVOKED');
    }
    const payloadSessionVersion = legacy ? 0 : payload.sessionVersion;
    let issuedAt = payload.iat ? new Date(payload.iat * 1000) : undefined;

    // sessionVersion is the O(1) global-revocation gate. Legacy JWTs predate
    // the claim and therefore read as version zero; a sign-out-everywhere or
    // password reset increments the user row and invalidates them too.
    if (payloadSessionVersion !== (user.sessionVersion ?? 0)) {
      throw new UnauthorizedException('SESSION_REVOKED');
    }

    if (payload.sessionId) {
      const session = await this.prisma.userSession.findFirst({
        where: {
          id: payload.sessionId,
          userId: payload.sub,
          sessionVersion: payloadSessionVersion,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true, createdAt: true },
      });

      if (!session) {
        throw new UnauthorizedException('SESSION_REVOKED');
      }
      // A fresh login in the same second as a password change must work.
      // JWT iat loses milliseconds; the durable row does not. Retaining this
      // check also honours password changes made by the old serving revision.
      issuedAt = session.createdAt;
    } else {
      // Expand-contract bridge: the old revision can mint a JWT without a
      // session id while the new revision is canarying. The migration persists
      // a deadline equal to the old token's maximum TTL. Once it passes, the
      // fallback closes itself; there is no hardcoded date or permanent bypass.
      const rollout = await this.prisma.authSessionRollout.findUnique({
        where: { id: 1 },
        select: { legacyAcceptedUntil: true },
      });
      if (!rollout || rollout.legacyAcceptedUntil <= new Date()) {
        throw new UnauthorizedException('SESSION_REVOKED');
      }
    }

    if (payload.deviceTokenId) {
      const deviceToken = await this.prisma.deviceEnrollmentToken.findUnique({
        where: { id: payload.deviceTokenId },
        select: {
          restaurantId: true,
          usedAt: true,
          revokedAt: true,
          sessionVersion: true,
          restaurant: {
            select: {
              sharedDeviceModeEnabled: true,
              isActive: true,
            },
          },
        },
      });

      if (
        !deviceToken ||
        !deviceToken.usedAt ||
        deviceToken.revokedAt ||
        deviceToken.restaurantId !== user.restaurantId
      ) {
        throw new UnauthorizedException('DEVICE_REVOKED');
      }

      const payloadDeviceSessionVersion =
        typeof payload.deviceSessionVersion === 'number'
          ? payload.deviceSessionVersion
          : 0;

      if (payloadDeviceSessionVersion !== deviceToken.sessionVersion) {
        throw new UnauthorizedException('DEVICE_SESSION_EXPIRED');
      }

      if (deviceToken.restaurant.isActive === false) {
        throw new UnauthorizedException('ACCOUNT_SUSPENDED');
      }

      if (deviceToken.restaurant.sharedDeviceModeEnabled === false) {
        throw new UnauthorizedException('SHARED_DEVICE_MODE_DISABLED');
      }

      // Device-bound JWT must only authenticate PIN-role users (WAITER/KITCHEN).
      // Role promotion without re-auth would let a 4-digit PIN mint dashboard
      // JWTs — this is the last line of defense after passwordChangedAt (#DEVICE-M1).
      if (!isPinRole(user.role)) {
        throw new UnauthorizedException('DEVICE_SESSION_EXPIRED');
      }
    }

    // Invalidate tokens issued before the last password change (e.g. super-admin
    // reset). `iat` is in seconds; passwordChangedAt is a Date. Reject stale tokens.
    if (
      user.passwordChangedAt &&
      issuedAt &&
      issuedAt < user.passwordChangedAt
    ) {
      throw new UnauthorizedException('PASSWORD_CHANGED');
    }

    // Validate impersonation session is still active (not revoked/expired).
    if (payload.isImpersonation && payload.impersonationSessionId) {
      const impSession = await this.prisma.impersonationSession.findUnique({
        where: { id: payload.impersonationSessionId },
        select: { revokedAt: true, expiresAt: true },
      });
      if (
        !impSession ||
        impSession.revokedAt ||
        new Date() > impSession.expiresAt
      ) {
        throw new UnauthorizedException('IMPERSONATION_REVOKED');
      }
    }

    if (user.role !== 'SUPER_ADMIN') {
      // Issue 21: only check staffRestaurant (staff roles). OWNER restaurant
      // suspension is deferred to verifyDashboardAccess — this avoids blocking
      // an OWNER who has one active and one suspended restaurant via a
      // non-deterministic restaurants[0] pick.
      if (user.staffRestaurant?.isActive === false) {
        throw new UnauthorizedException('ACCOUNT_SUSPENDED');
      }
    }

    return user;
  }
}
