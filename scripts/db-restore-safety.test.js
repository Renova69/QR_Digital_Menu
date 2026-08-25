const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const {
  getLocalRestoreTarget,
  omitRedundantPublicSchema,
} = require("../apps/backend/scripts/db-restore");

test("restore helper accepts only an explicitly named local disposable database", () => {
  const target = getLocalRestoreTarget(
    "postgresql://postgres:example-password@localhost:5432/qr_restore_drill",
  );
  assert.equal(target.database, "qr_restore_drill");
  assert.equal(new URL(target.url).searchParams.get("sslmode"), "disable");
  for (const unsafe of [
    "postgresql://postgres:example-password@aws-0-eu-central-1.pooler.supabase.com:5432/postgres",
    "postgresql://postgres:example-password@0.0.0.0:5432/qr_restore_drill",
    "https://localhost:5432/qr_restore_drill",
    "postgresql://postgres:example-password@localhost:5432/postgres",
    "postgresql://postgres:example-password@localhost:5432/qr_menu_dev",
  ]) {
    assert.throws(() => getLocalRestoreTarget(unsafe), /blocked|must be/);
  }
});

test("restore list omits only the redundant public schema declaration", () => {
  const input = [
    "31; 2615 2200 SCHEMA - public owner\n",
    "32; 1259 1 TABLE public app_user owner\n",
  ].join("");
  assert.equal(
    omitRedundantPublicSchema(input),
    ";31; 2615 2200 SCHEMA - public owner\n32; 1259 1 TABLE public app_user owner\n",
  );
});

test("restore helper has no clean or force-restore path", () => {
  const source = readFileSync(
    require.resolve("../apps/backend/scripts/db-restore"),
    "utf8",
  );
  assert.doesNotMatch(source, /--clean|FORCE_RESTORE/u);
});
