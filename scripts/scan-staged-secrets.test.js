const assert = require("node:assert/strict");
const test = require("node:test");

const {
  parseAddedLines,
  scanAddedLines,
  isPlaceholder,
} = require("./scan-staged-secrets");

// Credential-shaped fixtures are assembled at runtime rather than written as
// literals. A file full of realistic-looking keys trips GitHub push protection
// and gitleaks -- and "allow this secret" on a fixture is a habit worth not
// forming. Assembly keeps the values full-length, so the rules are still
// exercised against the real shape.
const join = (...parts) => parts.join("_");
const FAKE = {
  stripeLive: join("sk", "live", "51QxAbCdEfGhIjKlMnOpQrStU"),
  stripeLive2: join("sk", "live", "92ZyXwVuTsRqPoNmLkJiHgFe"),
  stripeWebhook: join("whsec", "9fKmQ2xVb1dLmR7kQ2xVb1dL"),
  neonPassword: join("npg", "R7kQ2xVb1dLm"),
  jwtSecret: "r7kQ2xVb1dLmR7kQ2xVb1dLm",
};
const neonUrl = () =>
  `postgresql://neondb_owner:${FAKE.neonPassword}` +
  "@ep-cool-sun.eu-central-1.aws.neon.tech/neondb";

const diffOf = (file, startLine, lines) =>
  [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -${startLine},0 +${startLine},${lines.length} @@`,
    ...lines.map((line) => `+${line}`),
  ].join("\n");

const scan = (file, startLine, lines) =>
  scanAddedLines(parseAddedLines(diffOf(file, startLine, lines)));

test("added lines carry the file and the new-file line number", () => {
  const added = parseAddedLines(
    diffOf("apps/backend/.env", 12, ["A=1", "B=2"]),
  );

  assert.deepEqual(added, [
    { file: "apps/backend/.env", line: 12, text: "A=1" },
    { file: "apps/backend/.env", line: 13, text: "B=2" },
  ]);
});

test("removed lines are not scanned", () => {
  const diff = [
    "diff --git a/x.ts b/x.ts",
    "--- a/x.ts",
    "+++ b/x.ts",
    "@@ -1,1 +1,0 @@",
    `-const key = '${FAKE.stripeLive}';`,
  ].join("\n");

  assert.deepEqual(scanAddedLines(parseAddedLines(diff)), []);
});

// The leak this repo actually had: a Neon URL with the password inline,
// committed to a public remote.
test("catches a Postgres URL carrying an inline password", () => {
  const findings = scan("apps/backend/.env", 1, [`DATABASE_URL=${neonUrl()}`]);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "postgres-url-with-password");
});

test("catches Stripe secret and webhook keys", () => {
  const findings = scan("scripts/tmp.js", 1, [
    `const k = '${FAKE.stripeLive}';`,
    `const w = '${FAKE.stripeWebhook}';`,
  ]);

  assert.deepEqual(
    findings.map((f) => f.rule).sort(),
    ["stripe-secret-key", "stripe-webhook-secret"],
  );
});

test("catches a secret-named variable assigned a long literal", () => {
  const findings = scan("apps/backend/src/config.ts", 4, [
    `const JWT_SECRET = '${FAKE.jwtSecret}';`,
  ]);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "assigned-secret-literal");
});

// The scanner is worthless if it fires on the repo's own fixtures and docs --
// it gets bypassed, then uninstalled.
test("ignores documented placeholders", () => {
  const findings = scan("apps/backend/.env.example", 1, [
    "DATABASE_URL=postgresql://user:your-password-here@host/db",
    `STRIPE_SECRET_KEY=${join("sk", "live", "x".repeat(24))}`,
    "JWT_SECRET='ci-jwt-secret-not-for-production'",
    "R2_SECRET_ACCESS_KEY='<your-r2-secret-access-key>'",
  ]);

  assert.deepEqual(findings, []);
});

test("isPlaceholder recognises the usual stand-ins", () => {
  assert.equal(isPlaceholder("your-key-here"), true);
  assert.equal(isPlaceholder("sk_live_..."), true);
  assert.equal(isPlaceholder("<REDACTED>"), true);
  assert.equal(isPlaceholder(FAKE.neonPassword), false);
});

// A /g regex keeps `lastIndex` between calls; without a reset the second line
// with the same secret shape is silently skipped.
test("reports a repeated pattern on every line it appears on", () => {
  const findings = scan("scripts/tmp.js", 1, [
    `const a = '${FAKE.stripeLive}';`,
    `const b = '${FAKE.stripeLive2}';`,
  ]);

  assert.equal(
    findings.filter((f) => f.rule === "stripe-secret-key").length,
    2,
  );
});

test("never echoes the credential itself", () => {
  const secret = FAKE.stripeLive;
  const findings = scan("scripts/tmp.js", 1, [`const k = '${secret}';`]);

  assert.equal(findings.length, 1);
  assert.ok(!findings[0].preview.includes(secret));
  assert.ok(findings[0].preview.length < secret.length);
});

// The scanner's own fixtures and the gitleaks config exist to hold
// credential-shaped strings; without an exemption the tool blocks every commit
// that touches itself, and the first thing anyone reaches for is the bypass.
test("does not flag its own fixtures or the gitleaks config", () => {
  const findings = scan("scripts/scan-staged-secrets.test.js", 1, [
    `const k = '${FAKE.stripeLive}';`,
  ]).concat(
    scan(".gitleaks.toml", 1, [
      "  '''postgresql://ci:ci@localhost:5432/ci_test''',",
    ]),
  );

  assert.deepEqual(findings, []);
});

// The exemption is exact paths only -- a glob would be somewhere to hide a
// real credential.
test("the exemption does not extend to neighbouring files", () => {
  const findings = scan("scripts/deploy-helper.js", 1, [
    `const k = '${FAKE.stripeLive}';`,
  ]);

  assert.equal(findings.length, 1);
});
