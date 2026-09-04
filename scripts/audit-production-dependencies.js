#!/usr/bin/env node

const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const HIGH_SEVERITIES = new Set(["high", "critical"]);
const AUDIT_TIMEOUT_MS = 60_000;
const MAX_AUDIT_ATTEMPTS = 2;

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

function isAuditReport(report) {
  const counts = report?.metadata?.vulnerabilities;
  return (
    report?.auditReportVersion === 2 &&
    !Object.hasOwn(report, "error") &&
    report.vulnerabilities !== null &&
    typeof report.vulnerabilities === "object" &&
    !Array.isArray(report.vulnerabilities) &&
    ["info", "low", "moderate", "high", "critical", "total"].every(
      (severity) =>
        Number.isInteger(counts?.[severity]) && counts[severity] >= 0,
    )
  );
}

function auditFailure(audit, report) {
  if (audit.error?.code === "ETIMEDOUT") {
    return { transient: true, reason: "exceeded the 60s process limit" };
  }
  if (audit.error || ![0, 1].includes(audit.status)) {
    return { transient: false, reason: "npm could not complete normally" };
  }

  // npm sometimes serializes FetchError as {summary:'', detail:''}. Its useful
  // message is on stderr or the top-level report. Classify it, but never echo
  // raw diagnostics: registry URLs/headers can contain credentials.
  const detail = `${JSON.stringify(report ?? {})}\n${audit.stderr ?? ""}`;
  if (/\b(E401|E403|ENOLOCK|EUSAGE|EJSONPARSE)\b/.test(detail)) {
    return { transient: false, reason: "npm rejected configuration or access" };
  }
  if (
    /network timeout|request-timeout|\b(ETIMEDOUT|ESOCKETTIMEDOUT)\b/i.test(
      detail,
    )
  ) {
    return { transient: true, reason: "registry request timed out" };
  }
  if (
    /\b(ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH)\b/.test(
      detail,
    )
  ) {
    return { transient: true, reason: "temporary registry connection failure" };
  }
  const status = report?.statusCode;
  if (
    status === 408 ||
    status === 429 ||
    (status >= 500 && status <= 599) ||
    /\bE(?:408|429|5\d\d)\b|\b(?:HTTP|audit) (?:408|429|5\d\d)\b/i.test(detail)
  ) {
    return {
      transient: true,
      reason: "registry temporarily unavailable or rate limited",
    };
  }
  return {
    transient: false,
    reason: "npm returned an invalid or incomplete audit report",
  };
}

function runAudit(npmCli, { spawn = spawnSync, warn = console.warn } = {}) {
  for (let attempt = 1; attempt <= MAX_AUDIT_ATTEMPTS; attempt += 1) {
    const audit = spawn(
      process.execPath,
      [
        npmCli,
        "audit",
        "--omit=dev",
        "--json",
        "--fetch-timeout=30000",
        "--fetch-retries=0",
      ],
      {
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
        timeout: AUDIT_TIMEOUT_MS,
        killSignal: "SIGKILL",
      },
    );
    let report;
    try {
      report = JSON.parse(audit.stdout);
    } catch {
      // Invalid JSON is never interpreted as an empty, successful report.
    }
    if (
      !audit.error &&
      [0, 1].includes(audit.status) &&
      isAuditReport(report)
    ) {
      // Exit 1 is normal for vulnerability findings. Evaluate them once using
      // the existing policy; never retry a valid report to seek a green result.
      return report;
    }
    const failure = auditFailure(audit, report);
    if (failure.transient && attempt < MAX_AUDIT_ATTEMPTS) {
      warn(`npm audit ${failure.reason}; retrying once (attempt 2/2).`);
      continue;
    }
    throw new Error(
      `npm audit ${failure.reason} after ${attempt} attempt${attempt === 1 ? "" : "s"}; no valid security report. CI remains blocked.`,
    );
  }
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
  const report = runAudit(npmCli);
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

module.exports = { evaluateAudit, extractHighFindings, runAudit };
