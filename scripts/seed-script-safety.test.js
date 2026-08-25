const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");

test("comprehensive seed has no clearing phase or remote override", () => {
  const source = readFileSync(
    join(__dirname, "..", "apps", "backend", "prisma", "seed.ts"),
    "utf8",
  );
  assert.match(source, /assertLocalSeedTarget/u);
  assert.doesNotMatch(
    source,
    /deleteMany|deleteRaw|DELETE\s+FROM|TRUNCATE|DROP\s+(?:SCHEMA|TABLE)|FORCE_SEED_WIPE|ALLOW_REMOTE_SEED/iu,
  );
});
