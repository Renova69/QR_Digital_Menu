const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function includesSequence(
  args: readonly string[],
  first: string,
  second: string,
) {
  const firstIndex = args.indexOf(first);
  return firstIndex >= 0 && args.slice(firstIndex + 1).includes(second);
}

export function isDestructivePrismaCommand(argv: readonly string[]): boolean {
  const args = argv.map((argument) => argument.toLowerCase());
  return (
    includesSequence(args, 'migrate', 'reset') ||
    includesSequence(args, 'migrate', 'dev') ||
    includesSequence(args, 'db', 'push') ||
    includesSequence(args, 'db', 'execute')
  );
}

export function isLocalDatabaseUrl(databaseUrl: string | undefined): boolean {
  if (!databaseUrl) return false;
  try {
    const hostname = new URL(databaseUrl).hostname.toLowerCase();
    return LOCAL_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

/**
 * Runs from prisma.config.ts, so it covers direct `npx prisma ...` commands as
 * well as package scripts. Production changes go through reviewed, forward-only
 * migrations and `migrate deploy`; reset/dev/db-push/db-execute are local-only.
 */
export function assertSafePrismaCommand(
  argv: readonly string[],
  databaseUrl: string | undefined,
): void {
  if (!isDestructivePrismaCommand(argv)) return;
  if (isLocalDatabaseUrl(databaseUrl)) return;

  throw new Error(
    'BLOCKED: destructive Prisma commands are local-only. Remote databases ' +
      'must use reviewed forward-only migrations via prisma migrate deploy.',
  );
}
