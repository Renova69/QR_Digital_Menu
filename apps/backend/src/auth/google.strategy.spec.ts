import { Logger } from '@nestjs/common';
import { GoogleStrategy } from './google.strategy';
import { getDependencyNodeAgents } from '../common/http/dependency-http';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function setGoogleEnv() {
  process.env.GOOGLE_CLIENT_ID = 'client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
  process.env.GOOGLE_CALLBACK_URL = '/api/v1/auth/google/callback';
}

describe('GoogleStrategy', () => {
  it('constructs without env vars using dummy values', () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_CALLBACK_URL;
    const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => {});

    const strategy = new GoogleStrategy();

    expect(strategy).toBeDefined();
    expect(strategy['_oauth2']['_agent']).toBe(
      getDependencyNodeAgents('google-oauth').httpsAgent,
    );
    expect(warnSpy).toHaveBeenCalledWith(
      'Google OAuth environment variables not set. Skipping Google Strategy.',
      'GoogleStrategy',
    );
    warnSpy.mockRestore();
  });

  it('constructs silently when all env vars are present', () => {
    setGoogleEnv();
    const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => {});

    const strategy = new GoogleStrategy();

    expect(strategy).toBeDefined();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('maps a verified profile to the normalized user shape', async () => {
    setGoogleEnv();
    const strategy = new GoogleStrategy();

    const result = await strategy.validate('access', 'refresh', {
      id: 'g-1',
      emails: [{ value: 'ivan@example.com', verified: true }],
      name: { givenName: 'Ivan', familyName: 'Petrov' },
    } as any);

    expect(result).toEqual({
      googleId: 'g-1',
      email: 'ivan@example.com',
      emailVerified: true,
      firstName: 'Ivan',
      lastName: 'Petrov',
    });
  });

  it('normalizes the string form of email_verified to true', async () => {
    setGoogleEnv();
    const strategy = new GoogleStrategy();

    const result = await strategy.validate('a', 'r', {
      id: 'g-2',
      emails: [{ value: 'x@y.z', verified: 'true' }],
      name: undefined,
    } as any);

    expect(result.emailVerified).toBe(true);
    expect(result.firstName).toBeUndefined();
  });

  it('treats a false verification flag as unverified', async () => {
    setGoogleEnv();
    const strategy = new GoogleStrategy();

    const result = await strategy.validate('a', 'r', {
      id: 'g-3',
      emails: [{ value: 'x@y.z', verified: false }],
      name: {},
    } as any);

    expect(result.emailVerified).toBe(false);
  });

  it('handles profiles without emails', async () => {
    setGoogleEnv();
    const strategy = new GoogleStrategy();

    const result = await strategy.validate('a', 'r', {
      id: 'g-4',
      emails: [],
      name: {},
    } as any);

    expect(result.googleId).toBe('g-4');
    expect(result.email).toBeUndefined();
    expect(result.emailVerified).toBe(false);
  });
});
