import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const GET_DIRECT_URL_DRIVER = `
const { getDirectUrl } = require(process.argv[1]);
try {
  process.stdout.write(getDirectUrl(process.argv[2]));
} catch (error) {
  process.stderr.write(error.message);
  process.exitCode = 1;
}
`;

function getDirectUrl(scriptName: string, raw: string) {
  return spawnSync(
    process.execPath,
    [
      '-e',
      GET_DIRECT_URL_DRIVER,
      resolve(__dirname, `../../scripts/${scriptName}`),
      raw,
    ],
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

describe.each([
  ['backup', 'db-backup.js'],
  ['restore', 'db-restore.js'],
] as const)('%s PostgreSQL CLI URL conversion', (_name, scriptName) => {
  it('removes pooler and application-only query parameters', () => {
    const result = getDirectUrl(
      scriptName,
      'postgresql://user:secret@ep-example-pooler.eu-central-1.aws.neon.tech/neondb' +
        '?sslmode=prefer&pgbouncer=true&connection_limit=5&connect_timeout=10' +
        '&pool_timeout=30&application_name=qr-menu-backup',
    );

    expect(result.status).toBe(0);
    const converted = new URL(result.stdout.trim());

    expect(converted.hostname).toBe('ep-example.eu-central-1.aws.neon.tech');
    expect(converted.searchParams.get('sslmode')).toBe('require');
    expect(converted.searchParams.get('application_name')).toBe(
      'qr-menu-backup',
    );
    for (const parameter of STRIPPED_QUERY_PARAMS) {
      expect(converted.searchParams.has(parameter)).toBe(false);
    }
  });

  it('rejects a missing database URL', () => {
    const result = getDirectUrl(scriptName, '');

    expect(result.status).toBe(1);
    expect(result.stderr).toBe('DATABASE_URL not set in .env or environment');
  });
});
