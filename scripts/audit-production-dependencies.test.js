const assert = require("node:assert/strict");
const test = require("node:test");

const { evaluateAudit } = require("./audit-production-dependencies");

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
