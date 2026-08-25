const { readFile } = require('node:fs/promises');
const { join } = require('node:path');

const EXPECTED_PROJECT_REF = 'scmjaqhiyvzsyyvdygwu';
const EXPECTED_HOST = 'aws-0-eu-central-1.pooler.supabase.com';
const EXPECTED_PORT = '5432';
const EXPECTED_DATABASE = 'postgres';
const GUARDS = [
  {
    event: 'ddl_command_start',
    functionName: 'prevent_production_destructive_ddl_start',
    name: 'protect_production_destructive_ddl_start',
    requiredFragments: [
      'PRODUCTION_DESTRUCTIVE_DDL_BLOCKED',
      "'DROP SCHEMA'",
      "'DROP TABLE'",
    ],
  },
  {
    event: 'sql_drop',
    functionName: 'prevent_production_data_definition_loss',
    name: 'protect_production_data_definition',
    requiredFragments: [
      'pg_event_trigger_dropped_objects()',
      "object_type = 'schema'",
      "schema_name = 'public'",
      "'table'",
      "'table column'",
      'PRODUCTION_DATA_DEFINITION_LOSS_BLOCKED',
    ],
  },
  {
    event: 'ddl_command_end',
    functionName: 'attach_production_truncate_guard',
    name: 'protect_new_production_tables',
    requiredFragments: [
      'pg_event_trigger_ddl_commands()',
      'protect_production_truncate',
      'block_production_truncate()',
    ],
  },
];
const GUARD_NAME = 'protect_production_data_definition';
const GUARD_FUNCTION = 'prevent_production_data_definition_loss';
const INSTALL_CONFIRMATION = `--confirm-additive-production-guard=${EXPECTED_PROJECT_REF}`;

function assertProductionTarget(rawUrl) {
  if (!rawUrl) {
    throw new Error('DIRECT_URL is required; refusing an unidentified database.');
  }

  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    throw new Error('DIRECT_URL is not a valid PostgreSQL URL.');
  }

  const database = decodeURIComponent(target.pathname.replace(/^\//, ''));
  const username = decodeURIComponent(target.username);
  if (
    !['postgres:', 'postgresql:'].includes(target.protocol) ||
    target.hostname !== EXPECTED_HOST ||
    target.port !== EXPECTED_PORT ||
    database !== EXPECTED_DATABASE ||
    !username.endsWith(`.${EXPECTED_PROJECT_REF}`)
  ) {
    throw new Error(
      'DIRECT_URL does not match the protected production Supabase project, host, session-pooler port, and database.',
    );
  }

  return {
    database,
    host: target.hostname,
    projectRef: EXPECTED_PROJECT_REF,
    username,
  };
}

function assertGuardRows(rows, unprotectedRelations = []) {
  if (rows.length !== GUARDS.length) {
    const found = new Set(rows.map((row) => row.evtname));
    const missing = GUARDS.filter((guard) => !found.has(guard.name)).map(
      (guard) => guard.name,
    );
    throw new Error(
      `Required production event triggers are missing: ${missing.join(', ') || 'unexpected duplicate rows'}.`,
    );
  }

  for (const expected of GUARDS) {
    const row = rows.find((candidate) => candidate.evtname === expected.name);
    if (
      !row ||
      row.evtevent !== expected.event ||
      row.evtenabled !== 'A' ||
      row.function_schema !== 'public' ||
      row.function_name !== expected.functionName
    ) {
      throw new Error(
        `Production event trigger ${expected.name} is not enabled ALWAYS with the expected ${expected.event} function.`,
      );
    }

    const definition = String(row.function_definition ?? '');
    const missing = expected.requiredFragments.filter(
      (fragment) => !definition.includes(fragment),
    );
    if (missing.length > 0) {
      throw new Error(
        `Production event trigger ${expected.name} has an unexpected function definition (missing: ${missing.join(', ')}).`,
      );
    }
  }

  if (unprotectedRelations.length > 0) {
    throw new Error(
      `Public tables are missing the production TRUNCATE guard: ${unprotectedRelations.join(', ')}.`,
    );
  }
}

async function queryGuard(client) {
  const result = await client.query(
    `SELECT
       e.evtname,
       e.evtevent,
       e.evtenabled,
       n.nspname AS function_schema,
       p.proname AS function_name,
       pg_get_functiondef(p.oid) AS function_definition
     FROM pg_event_trigger e
     JOIN pg_proc p ON p.oid = e.evtfoid
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE e.evtname = ANY($1::text[])`,
    [GUARDS.map((guard) => guard.name)],
  );
  const truncateResult = await client.query(
    `SELECT format('%I.%I', n.nspname, c.relname) AS relation
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p')
       AND NOT EXISTS (
         SELECT 1
         FROM pg_trigger t
         JOIN pg_proc p ON p.oid = t.tgfoid
         JOIN pg_namespace pn ON pn.oid = p.pronamespace
         WHERE t.tgrelid = c.oid
           AND t.tgname = 'protect_production_truncate'
           AND NOT t.tgisinternal
           AND t.tgenabled = 'A'
           AND pn.nspname = 'public'
           AND p.proname = 'block_production_truncate'
       )
     ORDER BY 1`,
  );
  assertGuardRows(
    result.rows,
    truncateResult.rows.map((row) => row.relation),
  );
}

async function run(argv = process.argv.slice(2)) {
  require('dotenv').config({ path: join(__dirname, '..', '.env') });
  const rawUrl = process.env.DIRECT_URL;
  const target = assertProductionTarget(rawUrl);
  const command = argv[0];
  if (!['verify', 'install'].includes(command)) {
    throw new Error('Usage: node scripts/production-db-guard.js verify|install');
  }

  if (command === 'install' && !argv.includes(INSTALL_CONFIRMATION)) {
    throw new Error(
      `Installation is additive but production-scoped. Re-run with ${INSTALL_CONFIRMATION}.`,
    );
  }

  const { Client } = require('pg');
  const client = new Client({ connectionString: rawUrl });
  await client.connect();
  try {
    if (command === 'install') {
      const sqlPath = join(
        __dirname,
        '..',
        '..',
        '..',
        'ops',
        'db-safety',
        'install-production-guards.sql',
      );
      const sql = await readFile(sqlPath, 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    await queryGuard(client);
    process.stdout.write(
      `Production DDL-loss guard verified for ${target.projectRef}/${target.database} through ${target.host}.\n`,
    );
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  run().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  EXPECTED_PROJECT_REF,
  GUARDS,
  GUARD_FUNCTION,
  GUARD_NAME,
  INSTALL_CONFIRMATION,
  assertGuardRows,
  assertProductionTarget,
};
