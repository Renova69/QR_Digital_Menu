import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-google-oauth20';
import { getDependencyNodeAgents } from '../common/http/dependency-http';
import type { RequestOptions } from 'node:http';
import { requestBudgetSignal } from '../common/http/request-budget';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const callbackURL = process.env.GOOGLE_CALLBACK_URL;

    // Skip Google Strategy if environment variables are missing (for tests)
    if (!clientId || !clientSecret || !callbackURL) {
      // Static logger — constructor runs before super(), so no instance yet.
      Logger.warn(
        'Google OAuth environment variables not set. Skipping Google Strategy.',
        'GoogleStrategy',
      );
    }

    super({
      clientID: clientId || 'dummy',
      clientSecret: clientSecret || 'dummy',
      callbackURL: callbackURL || '/api/v1/auth/google/callback',
      // M-AUTH-2: `openid` makes Google return a signed ID token carrying the
      // `email_verified` claim, which passport-google-oauth20 surfaces as
      // `emails[0].verified`. Without it we cannot trust the email for
      // account linking.
      scope: ['openid', 'profile', 'email'],
    });

    // passport-google-oauth20 delegates token/profile requests to `oauth`,
    // whose default is Node's unbounded global agent. Keep Google isolated
    // from the other providers just like the explicit fetch/SDK clients.
    this._oauth2.setAgent(getDependencyNodeAgents('google-oauth').httpsAgent);
    // `oauth` exposes no signal option in its public get/token API. Adapt its
    // single transport seam, leaving token parsing/profile validation untouched.
    // Real-transport tests pin this SDK seam for dependency upgrades. The signal
    // is read per invocation (before guards finish), never stored on the client.
    const oauth = this._oauth2;
    const execute = oauth['_executeRequest'];
    oauth['_executeRequest'] = (...args: unknown[]): void => {
      const options = args[1] as RequestOptions;
      Reflect.apply(execute, oauth, [
        args[0],
        { ...options, signal: requestBudgetSignal(options.signal) },
        ...args.slice(2),
      ]);
    };
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
  ): Promise<any> {
    const { id, emails, name } = profile;
    const primaryEmail = (emails ?? [])[0];
    return {
      googleId: id,
      email: primaryEmail?.value,
      // M-AUTH-2: carry Google's verification signal through to the service.
      // passport reports it as boolean `true`/`false` or the string form
      // depending on version — normalize both to a strict boolean here so the
      // service can reject anything that is not explicitly verified.
      emailVerified:
        (primaryEmail as { verified?: boolean | string } | undefined)
          ?.verified === true ||
        (primaryEmail as { verified?: boolean | string } | undefined)
          ?.verified === 'true',
      firstName: name?.givenName,
      lastName: name?.familyName,
    };
  }
}
