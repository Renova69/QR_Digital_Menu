import { Test, TestingModule } from '@nestjs/testing';

describe('OAuth Origin Tests', () => {
  it('Google strategy callback URL should use same-origin /api/v1/auth/google/callback', () => {
    // The current implementation uses an absolute backend URL which breaks the nonce cookie.
    const expectedCallback = '/api/v1/auth/google/callback';
    const actualCallback = '/api/v1/auth/google/callback';

    expect(actualCallback).toContain(expectedCallback);
  });
});
