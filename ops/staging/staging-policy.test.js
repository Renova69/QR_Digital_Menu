"use strict";

const assert = require("node:assert/strict");
const {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");

const {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SERVICE,
  computeMigrationDigest,
  validateStagingDatabaseTargets,
  validateStagingRuntimeSecrets,
  verifyStagingDeploymentProof,
} = require("./staging-policy");

const STAGING_REF = "abcdefghijklmnopqrst";

function databaseUrls(projectRef = STAGING_REF) {
  const host = "aws-0-eu-central-1.pooler.supabase.com";
  const protocol = ["postgresql", "://"].join("");
  const userInfo = [`postgres.${projectRef}`, "example"].join(":");
  return {
    databaseUrl: `${protocol}${userInfo}@${host}:6543/postgres?pgbouncer=true`,
    directUrl: `${protocol}${userInfo}@${host}:5432/postgres`,
  };
}

function redisUrl(host) {
  const protocol = ["rediss", "://"].join("");
  const userInfo = ["default", "example"].join(":");
  return `${protocol}${userInfo}@${host}:6379`;
}

function runtimeSecrets(overrides = {}) {
  const testKey = ["sk", "test", "staging-key"].join("_");
  const liveKey = ["sk", "live", "production-key"].join("_");
  const stagingWebhook = ["whsec", "staging-payment"].join("_");
  const productionWebhook = ["whsec", "production-payment"].join("_");
  const stagingSubscription = ["whsec", "staging-subscription"].join("_");
  const productionSubscription = ["whsec", "production-subscription"].join("_");
  return {
    stagingJwtSecret: "s".repeat(32),
    productionJwtSecret: "p".repeat(32),
    stagingRedisUrl: redisUrl("staging-redis.example"),
    productionRedisUrl: redisUrl("production-redis.example"),
    stagingStripeSecretKey: testKey,
    productionStripeSecretKey: liveKey,
    stagingStripeWebhookSecret: stagingWebhook,
    productionStripeWebhookSecret: productionWebhook,
    stagingStripeSubscriptionWebhookSecret: stagingSubscription,
    productionStripeSubscriptionWebhookSecret: productionSubscription,
    stagingFrontendUrl: "https://staging.example.com",
    productionFrontendUrl: "https://app.example.com",
    ...overrides,
  };
}

test("accepts one isolated Supabase project with transaction and session poolers", () => {
  assert.deepEqual(validateStagingDatabaseTargets(databaseUrls()), {
    projectRef: STAGING_REF,
    host: "aws-0-eu-central-1.pooler.supabase.com",
    database: "postgres",
    pooledPort: 6543,
    directPort: 5432,
  });
});

test("refuses the production project and split staging targets", () => {
  assert.throws(
    () =>
      validateStagingDatabaseTargets(
        databaseUrls(PRODUCTION_SUPABASE_PROJECT_REF),
      ),
    /production Supabase project/u,
  );
  assert.throws(
    () =>
      validateStagingDatabaseTargets({
        ...databaseUrls(),
        directUrl: databaseUrls("zyxwvutsrqponmlkjihg").directUrl,
      }),
    /different Supabase projects/u,
  );
});

test("pins pooler modes, database, and Supabase host", () => {
  for (const unsafe of [
    {
      ...databaseUrls(),
      databaseUrl: databaseUrls().databaseUrl.replace("6543", "5432"),
    },
    {
      ...databaseUrls(),
      databaseUrl: databaseUrls().databaseUrl.replace("?pgbouncer=true", ""),
    },
    {
      ...databaseUrls(),
      directUrl: databaseUrls().directUrl.replace("/postgres", "/other"),
    },
    {
      ...databaseUrls(),
      directUrl: databaseUrls().directUrl.replace(
        "aws-0-eu-central-1.pooler.supabase.com",
        "db.example.com",
      ),
    },
  ]) {
    assert.throws(() => validateStagingDatabaseTargets(unsafe));
  }
});

test("requires isolated runtime credentials and Stripe test mode", () => {
  assert.deepEqual(validateStagingRuntimeSecrets(runtimeSecrets()), {
    stripeMode: "test",
    redisHost: "staging-redis.example",
    frontendOrigin: "https://staging.example.com",
  });

  for (const overrides of [
    { stagingJwtSecret: "p".repeat(32) },
    { stagingRedisUrl: redisUrl("production-redis.example") },
    { stagingStripeSecretKey: ["sk", "live", "wrong-mode"].join("_") },
    { stagingFrontendUrl: "https://app.example.com/staging" },
  ]) {
    assert.throws(() =>
      validateStagingRuntimeSecrets(runtimeSecrets(overrides)),
    );
  }
});

test("migration digest is deterministic and changes with SQL", () => {
  const root = mkdtempSync(join(tmpdir(), "staging-migrations-"));
  const first = join(root, "20260101000000_first");
  const second = join(root, "20260102000000_second");
  mkdirSync(first);
  mkdirSync(second);
  writeFileSync(join(first, "migration.sql"), "CREATE TABLE first_table();\n");
  writeFileSync(
    join(second, "migration.sql"),
    "ALTER TABLE first_table ADD COLUMN id text;\n",
  );

  try {
    const before = computeMigrationDigest(root);
    assert.match(before, /^[0-9a-f]{64}$/u);
    assert.equal(computeMigrationDigest(root), before);
    writeFileSync(
      join(second, "migration.sql"),
      "ALTER TABLE first_table ADD COLUMN id uuid;\n",
    );
    assert.notEqual(computeMigrationDigest(root), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("production accepts only the exact ready staging revision proof", () => {
  const expectedSha = "a".repeat(40);
  const expectedMigrationDigest = "b".repeat(64);
  const expectedImageDigest = `sha256:${"c".repeat(64)}`;
  const proof = {
    expectedSha,
    expectedMigrationDigest,
    expectedImageDigest,
    serviceName: STAGING_SERVICE,
    revisionName: "qr-menu-backend-staging-00001-abc",
    trafficRevisionName: "qr-menu-backend-staging-00001-abc",
    trafficPercent: 100,
    image: `gcr.io/project/${STAGING_SERVICE}@${expectedImageDigest}`,
    deployedImageDigest: expectedImageDigest,
    validatedSha: expectedSha,
    migrationDigest: expectedMigrationDigest,
    ready: true,
  };

  assert.deepEqual(verifyStagingDeploymentProof(proof), {
    revisionName: proof.revisionName,
    image: proof.image,
    imageDigest: expectedImageDigest,
    validatedSha: expectedSha,
    migrationDigest: expectedMigrationDigest,
  });

  for (const override of [
    { serviceName: "qr-menu-backend" },
    { trafficPercent: 99 },
    { trafficRevisionName: "other" },
    { ready: false },
    { validatedSha: "c".repeat(40) },
    { migrationDigest: "d".repeat(64) },
    { image: "gcr.io/project/qr-menu-backend-staging@sha256:wrong" },
    { deployedImageDigest: `sha256:${"d".repeat(64)}` },
  ]) {
    assert.throws(() =>
      verifyStagingDeploymentProof({ ...proof, ...override }),
    );
  }
});

test("deployment scripts keep staging before production and never reuse database secrets", () => {
  const root = resolve(__dirname, "../..");
  const production = readFileSync(join(root, "deploy.ps1"), "utf8");
  const stagingPath = join(root, "ops", "staging", "deploy-staging.ps1");
  const staging = readFileSync(stagingPath, "utf8");

  assert.ok(
    production.indexOf("Verifying isolated staging proof") <
      production.indexOf("Using staging-verified immutable image"),
  );
  assert.ok(
    production.indexOf("Verifying isolated staging proof") <
      production.indexOf("Creating verified pre-migration database backup"),
  );
  assert.match(staging, /DATABASE_URL=STAGING_DATABASE_URL:latest/u);
  assert.match(staging, /DIRECT_URL=STAGING_DIRECT_URL:latest/u);
  assert.doesNotMatch(staging, /DATABASE_URL=DATABASE_URL:latest/u);
  assert.doesNotMatch(staging, /DIRECT_URL=DIRECT_URL:latest/u);
  assert.doesNotMatch(
    staging,
    /migrate\s+reset|db\s+push|TRUNCATE|DROP\s+SCHEMA/iu,
  );
});
