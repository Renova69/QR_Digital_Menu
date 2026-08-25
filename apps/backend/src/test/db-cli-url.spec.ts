import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const GET_BACKUP_URL_DRIVER = `
const { getDirectUrl } = require(process.argv[1]);
try {
  process.stdout.write(getDirectUrl(process.argv[2]));
} catch (error) {
  process.stderr.write(error.message);
  process.exitCode = 1;
}
`;

const GET_RESTORE_TARGET_DRIVER = `
const { getLocalRestoreTarget } = require(process.argv[1]);
try {
  process.stdout.write(JSON.stringify(getLocalRestoreTarget(process.argv[2])));
} catch (error) {
  process.stderr.write(error.message);
  process.exitCode = 1;
}
`;

function runDriver(driver: string, scriptName: string, raw: string) {
  return spawnSync(
    process.execPath,
    ['-e', driver, resolve(__dirname, `../../scripts/${scriptName}`), raw],
    {
      encoding: 'utf8',
      env: { ...process.env, DOTENV_CONFIG_QUIET: 'true' },
    },
  );
}

const STRIPPED_QUERY_PARAMS = [
  'pgbouncer',
  'connection_limit',
  'connect_timeout',
  'pool_timeout',
] as const;

describe('backup PostgreSQL CLI URL conversion', () => {
  it('preserves the Supabase session-pooler host and removes application-only parameters', () => {
    const result = runDriver(
      GET_BACKUP_URL_DRIVER,
      'db-backup.js',
      'postgresql://postgres.ref:example-password@aws-0-eu-central-1.pooler.supabase.com:5432/postgres' +
        '?sslmode=prefer&pgbouncer=true&connection_limit=5&connect_timeout=10' +
        '&pool_timeout=30&application_name=qr-menu-backup',
    );

    expect(result.status).toBe(0);
    const converted = new URL(result.stdout.trim());
    expect(converted.hostname).toBe('aws-0-eu-central-1.pooler.supabase.com');
    expect(converted.port).toBe('5432');
    expect(converted.searchParams.get('sslmode')).toBe('require');
    expect(converted.searchParams.get('application_name')).toBe(
      'qr-menu-backup',
    );
    for (const parameter of STRIPPED_QUERY_PARAMS) {
      expect(converted.searchParams.has(parameter)).toBe(false);
    }
  });

  it('rejects transaction-mode Supabase and a missing direct URL', () => {
    const pooled = runDriver(
      GET_BACKUP_URL_DRIVER,
      'db-backup.js',
      'postgresql://postgres.ref:example-password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres',
    );
    expect(pooled.status).toBe(1);
    expect(pooled.stderr).toContain('session-mode pooler on port 5432');

    const missing = runDriver(GET_BACKUP_URL_DRIVER, 'db-backup.js', '');
    expect(missing.status).toBe(1);
    expect(missing.stderr).toBe('DIRECT_URL not set in .env or environment');
  });
});

describe('restore PostgreSQL target safety', () => {
  it('accepts only a named local restore database', () => {
    const result = runDriver(
      GET_RESTORE_TARGET_DRIVER,
      'db-restore.js',
      'postgresql://postgres:example-password@localhost:5432/qr_restore_drill?pgbouncer=true',
    );
    expect(result.status).toBe(0);
    const target = JSON.parse(result.stdout) as {
      database: string;
      url: string;
    };
    expect(target.database).toBe('qr_restore_drill');
    expect(new URL(target.url).searchParams.has('pgbouncer')).toBe(false);
    expect(new URL(target.url).searchParams.get('sslmode')).toBe('disable');
  });

  it('rejects remote, default, non-drill, and missing targets', () => {
    for (const unsafe of [
      'postgresql://postgres:example-password@aws-0-eu-central-1.pooler.supabase.com:5432/postgres',
      'postgresql://postgres:example-password@localhost:5432/postgres',
      'postgresql://postgres:example-password@localhost:5432/qr_menu_dev',
      '',
    ]) {
      const result = runDriver(
        GET_RESTORE_TARGET_DRIVER,
        'db-restore.js',
        unsafe,
      );
      expect(result.status).toBe(1);
      expect(result.stderr).not.toBe('');
    }
  });
});
