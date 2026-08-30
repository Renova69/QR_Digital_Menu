#!/usr/bin/env node

const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const HIGH_SEVERITIES = new Set(["high", "critical"]);

function extractHighFindings(report) {
  const findings = new Map();
  for (const [packageName, vulnerability] of Object.entries(
    report.vulnerabilities ?? {},
  )) {
    for (const via of vulnerability.via ?? []) {
      if (
        typeof via === "string" ||
        !HIGH_SEVERITIES.has(via.severity) ||
        via.source === undefined
      ) {
        continue;
      }
      const id = String(via.source);
      const existing = findings.get(id) ?? {
        id,
        severity: via.severity,
        title: via.title,
        url: via.url,
        packages: new Set(),
      };
      existing.packages.add(packageName);
      if (via.severity === "critical") existing.severity = "critical";
      findings.set(id, existing);
    }
  }
  return findings;
}

function evaluateAudit(report, baselineIds) {
  const findings = extractHighFindings(report);
  const baseline = new Set(baselineIds.map(String));
  const blocking = [...findings.values()].filter(
    (finding) => finding.severity === "critical" || !baseline.has(finding.id),
  );
  const staleBaseline = [...baseline].filter((id) => !findings.has(id));
  return { findings, blocking, staleBaseline };
}

function main() {
  const baselinePath = resolve(
    process.argv[2] || "security/npm-audit-baseline.json",
  );
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    throw new Error("Run this gate through `npm run audit:production`");
  }
  const audit = spawnSync(
    process.execPath,
    [npmCli, "audit", "--omit=dev", "--json"],
    {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  if (audit.error) throw audit.error;
  let report;
  try {
    report = JSON.parse(audit.stdout);
  } catch {
    throw new Error(
      `npm audit did not return valid JSON (exit ${audit.status}): ${audit.stderr}`,
    );
  }
  if (report.error || ![0, 1].includes(audit.status)) {
    throw new Error(
      `npm audit failed operationally (exit ${audit.status}): ${JSON.stringify(report.error ?? report)}`,
    );
  }

  const result = evaluateAudit(report, baseline.advisoryIds ?? []);
  if (result.staleBaseline.length > 0) {
    console.warn(
      `Resolved baseline advisories can be removed: ${result.staleBaseline.join(", ")}`,
    );
  }
  if (result.blocking.length === 0) {
    console.log(
      `Dependency audit passed: ${result.findings.size} reviewed high advisory ID(s), no critical or new high findings.`,
    );
    return;
  }

  console.error(
    "BLOCKED: new high or critical production dependency advisory:",
  );
  for (const finding of result.blocking) {
    console.error(
      `- ${finding.severity.toUpperCase()} ${finding.id} ${finding.title} (${[...finding.packages].join(", ")}) ${finding.url}`,
    );
  }
  console.error(
    "Upgrade or remove the dependency. Baseline a high advisory only after a documented risk review; critical advisories cannot be baselined.",
  );
  process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { evaluateAudit, extractHighFindings };
