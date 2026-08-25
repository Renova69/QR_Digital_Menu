const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export type LocalSeedTarget = {
  database: string;
  host: string;
};

export function assertLocalSeedTarget(
  rawUrl: string | undefined,
  nodeEnv: string | undefined,
): LocalSeedTarget {
  if (nodeEnv === 'production') {
    throw new Error('Seed aborted: NODE_ENV=production.');
  }
  if (!rawUrl) {
    throw new Error('Seed aborted: DATABASE_URL is missing.');
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    throw new Error('Seed aborted: DATABASE_URL is invalid.');
  }

  if (
    !['postgres:', 'postgresql:'].includes(target.protocol) ||
    !LOCAL_DATABASE_HOSTS.has(target.hostname)
  ) {
    throw new Error(
      'Seed aborted: only an explicitly local PostgreSQL database is allowed. Remote overrides do not exist.',
    );
  }

  const database = decodeURIComponent(target.pathname.replace(/^\//, ''));
  if (!database || ['postgres', 'template0', 'template1'].includes(database)) {
    throw new Error(
      'Seed aborted: use a named local development database, never a PostgreSQL maintenance database.',
    );
  }

  return { database, host: target.hostname };
}
