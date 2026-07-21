export type RuntimeEnvironment = 'development' | 'test' | 'production';

type RuntimeEnvironmentVariables = Record<string, string | undefined>;

export function validateRuntimeEnvironment(
  env: RuntimeEnvironmentVariables = process.env,
): RuntimeEnvironment {
  const value = env.NODE_ENV;
  if (value !== 'development' && value !== 'test' && value !== 'production') {
    throw new Error(
      'NODE_ENV must be explicitly set to development, test, or production.',
    );
  }
  return value;
}

export function isBearerJwtAuthEnabled(
  env: RuntimeEnvironmentVariables = process.env,
): boolean {
  const runtime = validateRuntimeEnvironment(env);
  if (runtime === 'test') return true;
  return runtime === 'development' && env.ALLOW_BEARER_AUTH === 'true';
}
