const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const {
  GUARD_FUNCTION,
  GUARD_NAME,
  GUARDS,
  assertGuardRows,
  assertProductionTarget,
} = require("../apps/backend/scripts/production-db-guard");

function validRows(overrides = {}) {
  return GUARDS.map((guard) => ({
    evtname: guard.name,
    evtevent: guard.event,
    evtenabled: "A",
    function_schema: "public",
    function_name: guard.functionName,
    function_definition: guard.requiredFragments.join("\n"),
    ...(overrides[guard.name] ?? {}),
  }));
}

test("accepts only the exact production Supabase session-pooler target", () => {
  const result = assertProductionTarget(
    "postgresql://postgres.scmjaqhiyvzsyyvdygwu:example-password@aws-0-eu-central-1.pooler.supabase.com:5432/postgres",
  );
  assert.equal(result.projectRef, "scmjaqhiyvzsyyvdygwu");

  for (const unsafe of [
    "postgresql://postgres.scmjaqhiyvzsyyvdygwu:example-password@localhost:5432/postgres",
    "postgresql://postgres.other:example-password@aws-0-eu-central-1.pooler.supabase.com:5432/postgres",
    "postgresql://postgres.scmjaqhiyvzsyyvdygwu:example-password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres",
    "postgresql://postgres.scmjaqhiyvzsyyvdygwu:example-password@aws-0-eu-central-1.pooler.supabase.com:5432/other",
  ]) {
    assert.throws(() => assertProductionTarget(unsafe), /does not match/);
  }
});

test("requires the exact enabled-always sql_drop trigger and function body", () => {
  assert.doesNotThrow(() => assertGuardRows(validRows()));
  assert.throws(() => assertGuardRows([]), /missing/);
  assert.throws(
    () =>
      assertGuardRows(
        validRows({
          protect_production_data_definition: { evtenabled: "D" },
        }),
      ),
    /not enabled ALWAYS/,
  );
  assert.throws(
    () =>
      assertGuardRows(
        validRows({
          protect_production_data_definition: {
            function_definition: "SELECT 1",
          },
        }),
      ),
    /unexpected function definition/,
  );
  assert.throws(
    () => assertGuardRows(validRows(), ["public.customer_order"]),
    /missing the production TRUNCATE guard/,
  );
});

test("installer defines every verified guard without disabling or replacing one", () => {
  const sql = readFileSync(
    join(__dirname, "..", "ops", "db-safety", "install-production-guards.sql"),
    "utf8",
  );
  for (const guard of GUARDS) {
    assert.match(sql, new RegExp(guard.name, "u"));
    assert.match(sql, new RegExp(guard.functionName, "u"));
  }
  assert.doesNotMatch(sql, /DROP\s+EVENT\s+TRIGGER|DISABLE\s+TRIGGER/iu);
});
