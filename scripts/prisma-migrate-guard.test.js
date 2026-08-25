const assert = require("node:assert/strict");
const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const GUARD = resolve(
  __dirname,
  "../apps/backend/scripts/prisma-migrate-guard.js",
);

function runGuard({ databaseUrl, dotenvUrl, allowRemoteReset } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "prisma-guard-"));
  if (dotenvUrl) {
    writeFileSync(join(cwd, ".env"), `DATABASE_URL=${dotenvUrl}\n`);
  }

  try {
    const env = {
      ...process.env,
      ALLOW_REMOTE_RESET: allowRemoteReset ? "true" : "",
    };
    if (databaseUrl !== undefined) env.DATABASE_URL = databaseUrl;
    else delete env.DATABASE_URL;

    return spawnSync(process.execPath, [GUARD, "--allow-reset"], {
      cwd,
      encoding: "utf8",
      env,
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("blocks a remote database even when the legacy override is set", () => {
  const result = runGuard({
    databaseUrl: "postgresql://user:test-secret@db.example.com/prod",
    allowRemoteReset: true,
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /BLOCKED/);
});

test("loads .env before deciding whether the target is local", () => {
  const result = runGuard({
    dotenvUrl: "postgresql://user:test-secret@db.example.com/prod",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /BLOCKED/);
});

test("blocks an unknown target instead of assuming it is local", () => {
  const result = runGuard();

  assert.equal(result.status, 1);
  assert.match(result.stderr, /DATABASE_URL/);
});

test("does not treat wildcard or LAN hostnames as loopback", () => {
  for (const databaseUrl of [
    "postgresql://postgres:test-secret@0.0.0.0:5432/test_db",
    "postgresql://postgres:test-secret@database.local:5432/test_db",
  ]) {
    const result = runGuard({ databaseUrl });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /BLOCKED/);
  }
});

test("allows an explicitly local disposable database", () => {
  const result = runGuard({
    databaseUrl: "postgresql://postgres:test-secret@127.0.0.1:5432/test_db",
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Local database detected/);
});
