const assert = require("node:assert/strict");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

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
  if (findings.length === 0) return packageReport({});
  const levels = ["info", "low", "moderate", "high", "critical"];
  const severity =
    levels[
      Math.max(...findings.map((finding) => levels.indexOf(finding.severity)))
    ];
  return packageReport({
    dependency: { name: "dependency", severity, via: findings },
    transitive: { name: "transitive", severity, via: ["dependency"] },
  });
}

function packageReport(vulnerabilities) {
  // npm counts vulnerable packages, not advisory IDs (including metavulns).
  const counts = {
    info: 0,
    low: 0,
    moderate: 0,
    high: 0,
    critical: 0,
    total: 0,
  };
  for (const vulnerability of Object.values(vulnerabilities)) {
    counts[vulnerability.severity] += 1;
    counts.total += 1;
  }
  return {
    auditReportVersion: 2,
    vulnerabilities,
    metadata: { vulnerabilities: counts },
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

  test(`a process timeout cannot replace complete ${finding.severity} evidence with a clean retry`, () => {
    const audit = fakeAudit(
      auditResponse(completeReport(finding), {
        status: null,
        error: { code: "ETIMEDOUT" },
      }),
      auditResponse(completeReport(), { status: 0 }),
    );
    assert.throws(audit.run, /did not complete normally.*CI remains blocked/i);
    assert.equal(audit.calls.length, 1);
    assert.deepEqual(audit.warnings, []);
  });
}

test("a valid advisory report after a transient error still blocks", () => {
  const audit = fakeAudit(timeoutResponse, auditResponse(completeReport(high)));
  assert.equal(evaluateAudit(audit.run(), []).blocking.length, 1);
  assert.equal(audit.calls.length, 2);
});

test("counts packages separately from advisory IDs and preserves high baselines", () => {
  const input = completeReport(high, { ...high, source: 456 });
  assert.equal(input.metadata.vulnerabilities.high, 2);
  const audit = fakeAudit(auditResponse(input));
  const result = evaluateAudit(audit.run(), [123, 456]);
  assert.equal(result.findings.size, 2);
  assert.deepEqual(result.blocking, []);
});

test("accepts transitive cycles grounded in a source advisory", () => {
  const input = packageReport({
    a: { name: "a", severity: "high", via: ["b"] },
    b: { name: "b", severity: "high", via: ["a", high] },
  });
  const audit = fakeAudit(auditResponse(input));
  assert.equal(evaluateAudit(audit.run(), []).blocking.length, 1);
});

test("accepts mixed-severity source packages without inflating every dependent", () => {
  // Different installed versions can make a dependent less severe than the
  // aggregate record for its dependency. Do not require equal maxima.
  const input = packageReport({
    a: { name: "a", severity: "high", via: ["b"] },
    b: {
      name: "b",
      severity: "critical",
      via: [high, { ...high, source: 456, severity: "critical" }],
    },
  });
  const audit = fakeAudit(auditResponse(input));
  assert.equal(evaluateAudit(audit.run(), [123, 456]).blocking[0]?.id, "456");
});

const malformedChanges = {
  "missing package records despite critical metadata": (input) => {
    input.vulnerabilities = {};
  },
  "missing via": (input) => {
    delete input.vulnerabilities.dependency.via;
  },
  "missing advisory source": (input) => {
    delete input.vulnerabilities.dependency.via[0].source;
  },
  "null advisory source": (input) => {
    input.vulnerabilities.dependency.via[0].source = null;
  },
  "empty advisory source": (input) => {
    input.vulnerabilities.dependency.via[0].source = " ";
  },
  "non-scalar advisory source": (input) => {
    input.vulnerabilities.dependency.via[0].source = {};
  },
  "null advisory": (input) => {
    input.vulnerabilities.dependency.via = [null];
  },
  "empty via": (input) => {
    input.vulnerabilities.dependency.via = [];
  },
  "non-array via": (input) => {
    input.vulnerabilities.dependency.via = {};
  },
  "unknown advisory severity": (input) => {
    input.vulnerabilities.dependency.via[0].severity = "unknown";
  },
  "missing advisory title": (input) => {
    delete input.vulnerabilities.dependency.via[0].title;
  },
  "missing advisory URL": (input) => {
    delete input.vulnerabilities.dependency.via[0].url;
  },
  "null package": (input) => {
    input.vulnerabilities.dependency = null;
  },
  "mismatched package name": (input) => {
    input.vulnerabilities.dependency.name = "other";
  },
  "unknown package severity": (input) => {
    input.vulnerabilities.dependency.severity = "unknown";
  },
  "mismatched total": (input) => {
    input.metadata.vulnerabilities.total = 0;
  },
  "mismatched severity counts": (input) => {
    input.metadata.vulnerabilities.high = 2;
    input.metadata.vulnerabilities.critical = 0;
  },
  "dangling dependency": (input) => {
    input.vulnerabilities.transitive.via = ["missing"];
  },
  "prototype dependency": (input) => {
    input.vulnerabilities.transitive.via = ["toString"];
  },
  "ungrounded dependency cycle": (input) => {
    input.vulnerabilities.dependency.via = ["transitive"];
  },
  "critical records backed only by a lower-severity advisory": (input) => {
    input.vulnerabilities.dependency.via[0].severity = "moderate";
  },
};

for (const [description, mutate] of Object.entries(malformedChanges)) {
  test(`rejects inconsistent report without retry: ${description}`, () => {
    const input = completeReport({ ...high, severity: "critical" });
    mutate(input);
    const audit = fakeAudit(auditResponse(input));
    assert.throws(
      audit.run,
      /invalid or incomplete.*no valid security report/i,
    );
    assert.equal(audit.calls.length, 1);
    assert.deepEqual(audit.warnings, []);
  });
}

test("does not classify advisory text as a registry timeout", () => {
  const input = completeReport({
    ...high,
    title: "ETIMEDOUT fixture advisory",
  });
  delete input.vulnerabilities.dependency.via[0].source;
  const audit = fakeAudit(auditResponse(input));
  assert.throws(audit.run, /invalid or incomplete.*no valid security report/i);
  assert.equal(audit.calls.length, 1);
});

test("the CLI never prints a pass for critical metadata with missing details", (t) => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "audit-report-test-"));
  t.after(() => rmSync(fixtureDir, { recursive: true, force: true }));
  const npmFixture = join(fixtureDir, "npm.cjs");
  const input = completeReport({ ...high, severity: "critical" });
  input.vulnerabilities = {};
  writeFileSync(
    npmFixture,
    `process.stdout.write(${JSON.stringify(JSON.stringify(input))}); process.exitCode = 1;`,
  );
  const cli = spawnSync(
    process.execPath,
    [
      join(__dirname, "audit-production-dependencies.js"),
      join(__dirname, "../security/npm-audit-baseline.json"),
    ],
    {
      env: { ...process.env, npm_execpath: npmFixture },
      encoding: "utf8",
      timeout: 5_000,
    },
  );
  assert.equal(cli.error, undefined);
  assert.equal(cli.status, 1);
  assert.doesNotMatch(cli.stdout, /Dependency audit passed/);
  assert.match(cli.stderr, /invalid or incomplete.*no valid security report/i);
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
    assert.throws(audit.run, /CI remains blocked/i);
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
