const assert = require("node:assert/strict");
const test = require("node:test");

const { evaluateAudit, runAudit } = require("./audit-production-dependencies");

function report(...via) {
  return {
    vulnerabilities: {
      dependency: { via },
      transitive: { via: ["dependency"] },
    },
  };
}

const high = {
  source: 123,
  severity: "high",
  title: "high finding",
  url: "https://github.com/advisories/GHSA-example",
};

test("accepts an explicitly reviewed high advisory", () => {
  const result = evaluateAudit(report(high), ["123"]);
  assert.deepEqual(result.blocking, []);
  assert.deepEqual(result.staleBaseline, []);
});

test("blocks a new high advisory", () => {
  const result = evaluateAudit(report(high), []);
  assert.equal(result.blocking[0]?.id, "123");
});

test("always blocks critical advisories even if listed in the baseline", () => {
  const result = evaluateAudit(report({ ...high, severity: "critical" }), [
    "123",
  ]);
  assert.equal(result.blocking[0]?.severity, "critical");
});

test("ignores moderate findings and reports resolved baseline entries", () => {
  const result = evaluateAudit(
    report({ ...high, source: 456, severity: "moderate" }),
    ["123"],
  );
  assert.equal(result.findings.size, 0);
  assert.deepEqual(result.staleBaseline, ["123"]);
});

function completeReport(...findings) {
  return {
    auditReportVersion: 2,
    ...report(...findings),
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 0,
        high: findings.filter((finding) => finding.severity === "high").length,
        critical: findings.filter((finding) => finding.severity === "critical")
          .length,
        total: findings.length,
      },
    },
  };
}

function auditResponse(json, overrides = {}) {
  return { status: 1, stdout: JSON.stringify(json), stderr: "", ...overrides };
}

function fakeAudit(...responses) {
  const calls = [];
  const warnings = [];
  return {
    calls,
    warnings,
    run: () =>
      runAudit("npm-cli.js", {
        spawn: (...args) => {
          calls.push(args);
          assert.ok(responses.length > 0, "audit retried too many times");
          return responses.shift();
        },
        warn: (message) => warnings.push(message),
      }),
  };
}

const timeoutResponse = auditResponse(
  { error: { summary: "", detail: "" } },
  {
    stderr:
      "npm warn audit network timeout at: https://registry.npmjs.org/-/npm/v1/security/advisories/bulk",
  },
);

test("bounds the audit request and process, with no nested npm retries", () => {
  const clean = completeReport();
  const audit = fakeAudit(auditResponse(clean, { status: 0 }));
  assert.deepEqual(audit.run(), clean);
  assert.equal(audit.calls.length, 1);
  const [command, args, options] = audit.calls[0];
  assert.equal(command, process.execPath);
  assert.deepEqual(args, [
    "npm-cli.js",
    "audit",
    "--omit=dev",
    "--json",
    "--fetch-timeout=30000",
    "--fetch-retries=0",
  ]);
  assert.equal(options.timeout, 60_000);
  assert.equal(options.killSignal, "SIGKILL");
  assert.deepEqual(audit.warnings, []);
});

test("retries the observed empty npm error once and requires a real report", () => {
  const clean = completeReport();
  const audit = fakeAudit(timeoutResponse, auditResponse(clean, { status: 0 }));
  assert.deepEqual(audit.run(), clean);
  assert.equal(audit.calls.length, 2);
  assert.match(audit.warnings[0], /timed out.*retrying once/i);
});

test("persistent registry timeouts still fail after exactly two attempts", () => {
  const audit = fakeAudit(timeoutResponse, timeoutResponse);
  assert.throws(audit.run, /timed out.*2 attempts.*no valid security report/i);
  assert.equal(audit.calls.length, 2);
});

test("a hung npm process is retried once, then fails closed", () => {
  const hung = {
    status: null,
    stdout: "",
    stderr: "",
    error: { code: "ETIMEDOUT" },
  };
  const audit = fakeAudit(hung, hung);
  assert.throws(audit.run, /60s process limit.*2 attempts/i);
  assert.equal(audit.calls.length, 2);
});

for (const failure of [
  { statusCode: 429 },
  { statusCode: 503 },
  { error: { code: "E502" } },
  { error: { code: "ECONNRESET" } },
  { error: { code: "EAI_AGAIN" } },
  { message: "network timeout at: https://registry.npmjs.org/" },
]) {
  test(`retries a transient audit failure: ${JSON.stringify(failure)}`, () => {
    const clean = completeReport();
    const audit = fakeAudit(
      auditResponse(failure),
      auditResponse(clean, { status: 0 }),
    );
    assert.deepEqual(audit.run(), clean);
    assert.equal(audit.calls.length, 2);
  });
}

for (const finding of [high, { ...high, severity: "critical" }]) {
  test(`does not retry or bypass a valid ${finding.severity} advisory report`, () => {
    const audit = fakeAudit(auditResponse(completeReport(finding)));
    const result = evaluateAudit(
      audit.run(),
      finding.severity === "critical" ? ["123"] : [],
    );
    assert.equal(result.blocking.length, 1);
    assert.equal(audit.calls.length, 1);
    assert.deepEqual(audit.warnings, []);
  });
}

test("a valid advisory report after a transient error still blocks", () => {
  const audit = fakeAudit(timeoutResponse, auditResponse(completeReport(high)));
  assert.equal(evaluateAudit(audit.run(), []).blocking.length, 1);
  assert.equal(audit.calls.length, 2);
});

for (const invalid of [
  null,
  [],
  {},
  { vulnerabilities: {} },
  { ...completeReport(), auditReportVersion: 1 },
  { ...completeReport(), vulnerabilities: [] },
  { ...completeReport(), metadata: {} },
  { ...completeReport(), error: { summary: "", detail: "" } },
]) {
  test(`rejects an incomplete or error report: ${JSON.stringify(invalid)}`, () => {
    const audit = fakeAudit(auditResponse(invalid, { status: 0 }));
    assert.throws(audit.run, /no valid security report/i);
    assert.equal(audit.calls.length, 1);
  });
}

for (const response of [
  auditResponse({ error: { code: "E401" } }),
  auditResponse({ error: { code: "E403" } }),
  auditResponse({ error: { code: "ENOLOCK" } }),
  auditResponse({}, { stdout: "not JSON" }),
  auditResponse(completeReport(), { status: 2 }),
  auditResponse(completeReport(), { status: null, signal: "SIGTERM" }),
  auditResponse(completeReport(), { error: { code: "ENOENT" } }),
]) {
  test(`does not retry configuration, malformed-output or process failures: ${JSON.stringify(response)}`, () => {
    const audit = fakeAudit(response);
    assert.throws(audit.run, /no valid security report/i);
    assert.equal(audit.calls.length, 1);
  });
}

test("never prints raw npm diagnostics that might contain credentials", () => {
  const sensitiveText = "fixture-private-diagnostic";
  const response = auditResponse(
    { error: { summary: sensitiveText, detail: sensitiveText } },
    {
      stderr: `npm warn audit network timeout at: https://user:${sensitiveText}@registry.example/?token=${sensitiveText}`,
    },
  );
  const audit = fakeAudit(response, response);
  assert.throws(audit.run, (error) => {
    assert.match(error.message, /timed out/);
    assert.equal(error.message.includes(sensitiveText), false);
    return true;
  });
  assert.equal(audit.warnings.join().includes(sensitiveText), false);
});
