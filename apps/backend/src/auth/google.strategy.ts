import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const callbackURL = process.env.GOOGLE_CALLBACK_URL;

    // Skip Google Strategy if environment variables are missing (for tests)
    if (!clientId || !clientSecret || !callbackURL) {
      console.warn(
        'Google OAuth environment variables not set. Skipping Google Strategy.',
      );
    }

    super({
      clientID: clientId || 'dummy',
      clientSecret: clientSecret || 'dummy',
      callbackURL: callbackURL || 'http://localhost:3000/auth/google/callback',
      scope: ['profile', 'email'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
  ): Promise<any> {
    const { id, emails, name } = profile;
    return {
      googleId: id,
      email: emails[0].value,
      firstName: name.givenName,
      lastName: name.familyName,
    };
  }
}
