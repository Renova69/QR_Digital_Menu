"use strict";

const { createHash } = require("node:crypto");
const { readdirSync, readFileSync } = require("node:fs");
const { join, relative } = require("node:path");

const PRODUCTION_SUPABASE_PROJECT_REF = "scmjaqhiyvzsyyvdygwu";
const STAGING_SERVICE = "qr-menu-backend-staging";
const FULL_SHA = /^[0-9a-f]{40}$/u;
const DIGEST = /^[0-9a-f]{64}$/u;
const SUPABASE_PROJECT_REF = /^[a-z0-9]{20}$/u;

function requireText(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be set`);
  }
  return value.trim();
}

function parseSupabasePoolerUrl(raw, label, expectedPort) {
  const value = requireText(raw, label);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid PostgreSQL URL`);
  }

  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error(`${label} must use the PostgreSQL protocol`);
  }
  if (!url.hostname.endsWith(".pooler.supabase.com")) {
    throw new Error(`${label} must use a Supabase pooler host`);
  }
  if (Number(url.port) !== expectedPort) {
    throw new Error(`${label} must use port ${expectedPort}`);
  }
  if (url.pathname !== "/postgres") {
    throw new Error(`${label} must target the postgres database`);
  }

  const username = decodeURIComponent(url.username);
  const match = /^postgres\.([a-z0-9]{20})$/u.exec(username);
  if (!match || !SUPABASE_PROJECT_REF.test(match[1])) {
    throw new Error(
      `${label} must identify a Supabase project in its username`,
    );
  }

  if (expectedPort === 6543 && url.searchParams.get("pgbouncer") !== "true") {
    throw new Error(`${label} must enable pgbouncer transaction mode`);
  }
  if (expectedPort === 5432 && url.searchParams.get("pgbouncer") === "true") {
    throw new Error(`${label} session-mode URL must not enable pgbouncer`);
  }

  return {
    projectRef: match[1],
    host: url.hostname,
    port: Number(url.port),
    database: "postgres",
  };
}

function validateStagingDatabaseTargets({
  databaseUrl,
  directUrl,
  productionProjectRef = PRODUCTION_SUPABASE_PROJECT_REF,
}) {
  const pooled = parseSupabasePoolerUrl(
    databaseUrl,
    "STAGING_DATABASE_URL",
    6543,
  );
  const direct = parseSupabasePoolerUrl(directUrl, "STAGING_DIRECT_URL", 5432);

  if (pooled.projectRef !== direct.projectRef) {
    throw new Error(
      "Staging database URLs identify different Supabase projects",
    );
  }
  if (pooled.host !== direct.host) {
    throw new Error(
      "Staging database URLs must use the same Supabase pooler host",
    );
  }
  if (pooled.projectRef === productionProjectRef) {
    throw new Error(
      "Staging database URLs resolve to the production Supabase project",
    );
  }

  return {
    projectRef: pooled.projectRef,
    host: pooled.host,
    database: pooled.database,
    pooledPort: pooled.port,
    directPort: direct.port,
  };
}

function parseHttpsUrl(raw, label) {
  const value = requireText(raw, label);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (url.protocol !== "https:") {
    throw new Error(`${label} must use HTTPS`);
  }
  return url;
}

function parseRedisUrl(raw, label) {
  const value = requireText(raw, label);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid Redis URL`);
  }
  if (!["redis:", "rediss:"].includes(url.protocol)) {
    throw new Error(`${label} must use redis or rediss`);
  }
  return url;
}

function requireDifferent(stagingValue, productionValue, label) {
  const staging = requireText(stagingValue, `STAGING_${label}`);
  const production = requireText(productionValue, `production ${label}`);
  if (staging === production) {
    throw new Error(`Staging and production ${label} must be different`);
  }
  return staging;
}

function validateStagingRuntimeSecrets(values) {
  const jwtSecret = requireDifferent(
    values.stagingJwtSecret,
    values.productionJwtSecret,
    "JWT_SECRET",
  );
  if (jwtSecret.length < 32) {
    throw new Error("STAGING_JWT_SECRET must be at least 32 characters");
  }

  const stripeSecret = requireDifferent(
    values.stagingStripeSecretKey,
    values.productionStripeSecretKey,
    "STRIPE_SECRET_KEY",
  );
  if (!stripeSecret.startsWith("sk_test_")) {
    throw new Error("STAGING_STRIPE_SECRET_KEY must be a Stripe test-mode key");
  }

  for (const [label, stagingValue, productionValue] of [
    [
      "STRIPE_WEBHOOK_SECRET",
      values.stagingStripeWebhookSecret,
      values.productionStripeWebhookSecret,
    ],
    [
      "STRIPE_SUBSCRIPTION_WEBHOOK_SECRET",
      values.stagingStripeSubscriptionWebhookSecret,
      values.productionStripeSubscriptionWebhookSecret,
    ],
  ]) {
    const secret = requireDifferent(stagingValue, productionValue, label);
    if (!secret.startsWith("whsec_")) {
      throw new Error(`STAGING_${label} must be a Stripe webhook secret`);
    }
  }

  const stagingRedis = parseRedisUrl(
    requireDifferent(
      values.stagingRedisUrl,
      values.productionRedisUrl,
      "REDIS_URL",
    ),
    "STAGING_REDIS_URL",
  );
  const productionRedis = parseRedisUrl(
    values.productionRedisUrl,
    "production REDIS_URL",
  );
  if (stagingRedis.hostname === productionRedis.hostname) {
    throw new Error("Staging Redis must use a different host from production");
  }

  const stagingFrontend = parseHttpsUrl(
    requireDifferent(
      values.stagingFrontendUrl,
      values.productionFrontendUrl,
      "FRONTEND_URL",
    ),
    "STAGING_FRONTEND_URL",
  );
  const productionFrontend = parseHttpsUrl(
    values.productionFrontendUrl,
    "production FRONTEND_URL",
  );
  if (stagingFrontend.hostname === productionFrontend.hostname) {
    throw new Error(
      "Staging frontend must use a different host from production",
    );
  }

  return {
    stripeMode: "test",
    redisHost: stagingRedis.hostname,
    frontendOrigin: stagingFrontend.origin,
  };
}

function collectMigrationFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMigrationFiles(path));
    } else if (entry.isFile() && entry.name === "migration.sql") {
      files.push(path);
    }
  }
  return files;
}

function computeMigrationDigest(root) {
  const hash = createHash("sha256");
  const files = collectMigrationFiles(root);
  if (files.length === 0) {
    throw new Error("Migration directory contains no migration.sql files");
  }
  for (const file of files) {
    hash.update(relative(root, file).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function verifyStagingDeploymentProof({
  expectedSha,
  expectedMigrationDigest,
  expectedImageDigest,
  serviceName,
  revisionName,
  trafficRevisionName,
  trafficPercent,
  image,
  deployedImageDigest,
  validatedSha,
  migrationDigest,
  ready,
}) {
  if (!FULL_SHA.test(expectedSha)) {
    throw new Error("Expected commit must be a full lowercase git SHA");
  }
  if (!DIGEST.test(expectedMigrationDigest)) {
    throw new Error("Expected migration digest is invalid");
  }
  if (!/^sha256:[0-9a-f]{64}$/u.test(expectedImageDigest)) {
    throw new Error("Expected image digest is invalid");
  }
  if (serviceName !== STAGING_SERVICE) {
    throw new Error("Staging proof came from the wrong Cloud Run service");
  }
  if (!revisionName || revisionName !== trafficRevisionName) {
    throw new Error("Staging proof revision is not the serving revision");
  }
  if (Number(trafficPercent) !== 100) {
    throw new Error(
      "Staging proof requires 100 percent traffic on one revision",
    );
  }
  if (ready !== true) {
    throw new Error("Staging serving revision is not ready");
  }
  if (validatedSha !== expectedSha) {
    throw new Error("Staging validated a different commit");
  }
  if (migrationDigest !== expectedMigrationDigest) {
    throw new Error("Staging validated a different migration set");
  }
  if (
    typeof image !== "string" ||
    !image.endsWith(`@${expectedImageDigest}`) ||
    deployedImageDigest !== expectedImageDigest
  ) {
    throw new Error(
      "Staging is not serving the expected immutable image digest",
    );
  }

  return {
    revisionName,
    image,
    imageDigest: deployedImageDigest,
    validatedSha,
    migrationDigest,
  };
}

function runCli() {
  const command = process.argv[2];
  if (command === "target") {
    console.log(
      JSON.stringify(
        validateStagingDatabaseTargets({
          databaseUrl: process.env.STAGING_DATABASE_URL,
          directUrl: process.env.STAGING_DIRECT_URL,
        }),
      ),
    );
    return;
  }
  if (command === "runtime") {
    console.log(
      JSON.stringify(
        validateStagingRuntimeSecrets({
          stagingJwtSecret: process.env.STAGING_JWT_SECRET,
          productionJwtSecret: process.env.PRODUCTION_JWT_SECRET,
          stagingRedisUrl: process.env.STAGING_REDIS_URL,
          productionRedisUrl: process.env.PRODUCTION_REDIS_URL,
          stagingStripeSecretKey: process.env.STAGING_STRIPE_SECRET_KEY,
          productionStripeSecretKey: process.env.PRODUCTION_STRIPE_SECRET_KEY,
          stagingStripeWebhookSecret: process.env.STAGING_STRIPE_WEBHOOK_SECRET,
          productionStripeWebhookSecret:
            process.env.PRODUCTION_STRIPE_WEBHOOK_SECRET,
          stagingStripeSubscriptionWebhookSecret:
            process.env.STAGING_STRIPE_SUBSCRIPTION_WEBHOOK_SECRET,
          productionStripeSubscriptionWebhookSecret:
            process.env.PRODUCTION_STRIPE_SUBSCRIPTION_WEBHOOK_SECRET,
          stagingFrontendUrl: process.env.STAGING_FRONTEND_URL,
          productionFrontendUrl: process.env.PRODUCTION_FRONTEND_URL,
        }),
      ),
    );
    return;
  }
  if (command === "digest") {
    console.log(
      computeMigrationDigest(requireText(process.argv[3], "migration path")),
    );
    return;
  }
  if (command === "proof") {
    const proof = JSON.parse(
      requireText(process.env.STAGING_PROOF_JSON, "STAGING_PROOF_JSON"),
    );
    console.log(
      JSON.stringify(
        verifyStagingDeploymentProof({
          ...proof,
          expectedSha: requireText(process.argv[3], "expected SHA"),
          expectedMigrationDigest: requireText(
            process.argv[4],
            "expected migration digest",
          ),
          expectedImageDigest: requireText(
            process.argv[5],
            "expected image digest",
          ),
        }),
      ),
    );
    return;
  }
  throw new Error(
    "Usage: staging-policy.js target|runtime|digest|proof <sha> <migration-digest> <image-digest>",
  );
}

if (require.main === module) {
  try {
    runCli();
  } catch (error) {
    console.error(`Staging safety check failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SERVICE,
  computeMigrationDigest,
  validateStagingDatabaseTargets,
  validateStagingRuntimeSecrets,
  verifyStagingDeploymentProof,
};
