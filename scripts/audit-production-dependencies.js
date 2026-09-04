#!/usr/bin/env node

const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const HIGH_SEVERITIES = new Set(["high", "critical"]);
const SEVERITIES = ["info", "low", "moderate", "high", "critical"];
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

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonemptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isAuditReport(report) {
  const counts = report?.metadata?.vulnerabilities;
  if (
    report?.auditReportVersion !== 2 ||
    Object.hasOwn(report, "error") ||
    !isRecord(report.vulnerabilities) ||
    ![...SEVERITIES, "total"].every(
      (severity) =>
        Number.isSafeInteger(counts?.[severity]) && counts[severity] >= 0,
    )
  ) {
    return false;
  }

  const entries = Object.entries(report.vulnerabilities);
  const actual = Object.fromEntries(
    SEVERITIES.map((severity) => [severity, 0]),
  );
  const sources = new Map(entries.map(([name]) => [name, new Set()]));
  const dependents = new Map(entries.map(([name]) => [name, []]));
  const pending = [];
  for (const [name, vulnerability] of entries) {
    if (
      !isRecord(vulnerability) ||
      vulnerability.name !== name ||
      !SEVERITIES.includes(vulnerability.severity) ||
      !Array.isArray(vulnerability.via) ||
      vulnerability.via.length === 0
    ) {
      return false;
    }
    actual[vulnerability.severity] += 1;
    for (const via of vulnerability.via) {
      if (typeof via === "string") {
        if (!dependents.has(via)) return false;
        dependents.get(via).push(name);
      } else {
        if (
          !isRecord(via) ||
          !SEVERITIES.includes(via.severity) ||
          !(
            (Number.isSafeInteger(via.source) && via.source > 0) ||
            isNonemptyString(via.source)
          ) ||
          !isNonemptyString(via.title) ||
          !isNonemptyString(via.url)
        ) {
          return false;
        }
        if (!sources.get(name).has(via.severity)) {
          sources.get(name).add(via.severity);
          pending.push([name, via.severity]);
        }
      }
    }
  }
  // npm metadata counts vulnerable packages, not distinct advisory IDs.
  if (
    counts.total !== entries.length ||
    SEVERITIES.some((severity) => counts[severity] !== actual[severity])
  ) {
    return false;
  }
  // Metavulnerabilities reference other packages and may form cycles. Every
  // declared severity must reach a source advisory, not just another claim.
  // Propagate each severity once per package; cycles need no recursive walk.
  for (let index = 0; index < pending.length; index += 1) {
    const [name, severity] = pending[index];
    for (const dependent of dependents.get(name)) {
      if (!sources.get(dependent).has(severity)) {
        sources.get(dependent).add(severity);
        pending.push([dependent, severity]);
      }
    }
  }
  // Mixed installed versions need not share a dependency's maximum severity.
  return entries.every(([name, vulnerability]) =>
    sources.get(name).has(vulnerability.severity),
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
  const detail = `${JSON.stringify({ error: report?.error, message: report?.message })}\n${audit.stderr ?? ""}`;
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
    if (isAuditReport(report)) {
      // Complete evidence must not be replaced by a retry, even if npm hangs
      // or crashes after printing it. A failed process is still not a pass.
      if (audit.error || ![0, 1].includes(audit.status)) {
        throw new Error(
          "npm returned audit data but did not complete normally; CI remains blocked.",
        );
      }
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
