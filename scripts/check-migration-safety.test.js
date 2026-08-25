const assert = require("node:assert/strict");
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");

const {
  findUnsafeStatements,
  scanMigrationDirectory,
} = require("./check-migration-safety");

test("accepts forward-only schema changes and ignores explanatory comments", () => {
  const sql = `
    -- Never use DROP SCHEMA or TRUNCATE in production.
    CREATE TABLE IF NOT EXISTS "safe_table" ("id" text PRIMARY KEY);
    ALTER TABLE "safe_table" ADD COLUMN IF NOT EXISTS "label" text;
  `;

  assert.deepEqual(findUnsafeStatements(sql), []);
});

test("blocks every data-destructive migration shape", () => {
  const cases = [
    ["DROP SCHEMA public CASCADE;", "DROP SCHEMA"],
    ['DROP TABLE "customer_order";', "DROP TABLE"],
    ['TRUNCATE TABLE "app_user";', "TRUNCATE"],
    ['DELETE FROM "restaurant" WHERE true;', "DELETE FROM"],
    ['ALTER TABLE "payment" DROP COLUMN "amount";', "DROP COLUMN"],
  ];

  for (const [sql, rule] of cases) {
    assert.equal(findUnsafeStatements(sql)[0]?.rule, rule, sql);
  }
});

test("the committed migration chain is forward-only", () => {
  const migrations = resolve(__dirname, "../apps/backend/prisma/migrations");

  assert.deepEqual(scanMigrationDirectory(migrations), []);
});

test("reports the migration path and line for review", () => {
  const root = mkdtempSync(join(tmpdir(), "migration-safety-"));
  const migration = join(root, "20990101000000_bad");
  mkdirSync(migration);
  writeFileSync(
    join(migration, "migration.sql"),
    'CREATE TABLE "x" ("id" text);\nTRUNCATE TABLE "x";\n',
  );

  try {
    const findings = scanMigrationDirectory(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].rule, "TRUNCATE");
    assert.equal(findings[0].line, 2);
    assert.match(findings[0].file, /20990101000000_bad/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
