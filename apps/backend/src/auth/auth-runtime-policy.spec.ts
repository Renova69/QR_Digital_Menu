import {
  isBearerJwtAuthEnabled,
  validateRuntimeEnvironment,
} from './auth-runtime-policy';

describe('auth runtime policy', () => {
  it.each([undefined, '', 'staging', 'prod'])(
    'rejects a missing or unsupported NODE_ENV (%p)',
    (nodeEnv) => {
      expect(() => validateRuntimeEnvironment({ NODE_ENV: nodeEnv })).toThrow(
        'NODE_ENV must be explicitly set',
      );
    },
  );

  it('allows Bearer JWTs automatically only in the test harness', () => {
    expect(isBearerJwtAuthEnabled({ NODE_ENV: 'test' })).toBe(true);
    expect(
      isBearerJwtAuthEnabled({
        NODE_ENV: 'development',
        ALLOW_BEARER_AUTH: 'true',
      }),
    ).toBe(true);
    expect(isBearerJwtAuthEnabled({ NODE_ENV: 'development' })).toBe(false);
  });

  it('never enables Bearer JWTs in production', () => {
    expect(
      isBearerJwtAuthEnabled({
        NODE_ENV: 'production',
        ALLOW_BEARER_AUTH: 'true',
      }),
    ).toBe(false);
  });
});
