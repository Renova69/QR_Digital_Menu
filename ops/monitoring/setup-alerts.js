#!/usr/bin/env node
//
// Provision the alerting that was missing on 23 Aug 2026, when the database was
// unreachable for ~5 hours and nothing noticed:
//
//   1. an email notification channel
//   2. an uptime check against /api/v1/health/ready (503 when the DB is down)
//   3. an alert policy that fires when that check fails
//   4. an alert policy that fires when a scheduled backup job fails
//   5. an alert policy that fires when no successful backup runs for 15 hours
//
// Driven against the Monitoring REST API rather than `gcloud monitoring`, which
// lives in the alpha component and is not installed here. Auth is borrowed from
// the local gcloud login, so there are no static credentials anywhere.
//
// Idempotent: everything is looked up by display name first and reused.
//
// Usage:  node ops/monitoring/setup-alerts.js <alert-email> [--dry-run]

const { execFileSync } = require("child_process");

const PROJECT = "qr-menu-app-469216";
const HOST = "qr-menu-backend-kmrmfcgtva-ew.a.run.app";
const READINESS_PATH = "/api/v1/health/ready";
const BACKUP_JOB = "db-backup";

const DRY_RUN = process.argv.includes("--dry-run");
const EMAIL = process.argv.slice(2).find((a) => !a.startsWith("--"));

const CHANNEL_NAME = "QR Menu alerts (email)";
const UPTIME_NAME = "qr-menu-backend readiness";
const UPTIME_POLICY = "Backend readiness failing";
const BACKUP_POLICY = "Nightly database backup failed";
const BACKUP_MISSING_POLICY = "Database backup missing";

function token() {
  return execFileSync("gcloud", ["auth", "print-access-token"], {
    encoding: "utf8",
    shell: true,
  }).trim();
}

async function api(method, path, body) {
  const res = await fetch(`https://monitoring.googleapis.com/v3/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}\n${text.slice(0, 600)}`);
  return text ? JSON.parse(text) : {};
}

async function findByDisplayName(collection, displayName, key) {
  const result = await api("GET", `projects/${PROJECT}/${collection}`);
  return (result[key] || []).find((x) => x.displayName === displayName) || null;
}

async function ensureChannel() {
  const existing = await findByDisplayName(
    "notificationChannels",
    CHANNEL_NAME,
    "notificationChannels",
  );
  if (existing) {
    console.log(`channel: reusing ${existing.name}`);
    return existing.name;
  }
  if (DRY_RUN) {
    console.log(`channel: would create for ${EMAIL}`);
    return "DRY_RUN_CHANNEL";
  }
  const created = await api(
    "POST",
    `projects/${PROJECT}/notificationChannels`,
    {
      type: "email",
      displayName: CHANNEL_NAME,
      labels: { email_address: EMAIL },
    },
  );
  console.log(`channel: created ${created.name}`);
  return created.name;
}

async function ensureUptimeCheck() {
  const existing = await findByDisplayName(
    "uptimeCheckConfigs",
    UPTIME_NAME,
    "uptimeCheckConfigs",
  );
  if (existing) {
    console.log(`uptime check: reusing ${existing.name}`);
    return existing.name;
  }
  if (DRY_RUN) {
    console.log(`uptime check: would create against ${HOST}${READINESS_PATH}`);
    return "DRY_RUN_UPTIME";
  }
  const created = await api("POST", `projects/${PROJECT}/uptimeCheckConfigs`, {
    displayName: UPTIME_NAME,
    monitoredResource: {
      type: "uptime_url",
      labels: { project_id: PROJECT, host: HOST },
    },
    httpCheck: {
      path: READINESS_PATH,
      port: 443,
      useSsl: true,
      validateSsl: true,
      requestMethod: "GET",
      // Only 200 counts. The default treats any 2xx/3xx as success, which would
      // hide a redirect to an error page.
      acceptedResponseStatusCodes: [{ statusValue: 200 }],
    },
    // 60s is the tightest Cloud Monitoring allows. The readiness probe carries
    // its own 5s deadline, so 10s here is comfortably above a healthy response
    // and still fails fast on a wedged instance.
    period: "60s",
    timeout: "10s",
  });
  console.log(`uptime check: created ${created.name}`);
  return created.name;
}

async function ensurePolicy(displayName, build, channel) {
  const existing = await findByDisplayName(
    "alertPolicies",
    displayName,
    "alertPolicies",
  );
  if (existing) {
    console.log(`policy "${displayName}": already exists`);
    return;
  }
  if (DRY_RUN) {
    console.log(`policy "${displayName}": would create`);
    return;
  }
  const created = await api("POST", `projects/${PROJECT}/alertPolicies`, {
    ...build(),
    notificationChannels: [channel],
    enabled: true,
  });
  console.log(`policy "${displayName}": created ${created.name}`);
}

function readinessPolicy(uptimeCheckId) {
  return {
    displayName: UPTIME_POLICY,
    documentation: {
      content:
        "/api/v1/health/ready is not returning 200. The process is up but a " +
        "dependency it cannot work without — normally the database — is " +
        "unavailable. Check: gcloud run services logs read qr-menu-backend " +
        "--region=europe-west1 --limit=50",
      mimeType: "text/markdown",
    },
    combiner: "OR",
    conditions: [
      {
        displayName: "readiness check failing",
        conditionThreshold: {
          filter:
            'metric.type="monitoring.googleapis.com/uptime_check/check_passed" ' +
            'AND resource.type="uptime_url" ' +
            `AND metric.label.check_id="${uptimeCheckId}"`,
          comparison: "COMPARISON_LT",
          thresholdValue: 1,
          // Two consecutive failed minutes, not one. A single missed check is
          // routine (a cold start, a redeploy); five hours of them is what this
          // exists to catch.
          duration: "120s",
          aggregations: [
            {
              alignmentPeriod: "60s",
              perSeriesAligner: "ALIGN_NEXT_OLDER",
              crossSeriesReducer: "REDUCE_COUNT_FALSE",
              groupByFields: ["resource.label.host"],
            },
          ],
          trigger: { count: 1 },
        },
      },
    ],
  };
}

function backupPolicy() {
  return {
    displayName: BACKUP_POLICY,
    documentation: {
      content:
        "The nightly Supabase->GCS backup job failed or rejected an unsafe " +
        "source/archive. Supabase's free tier has no managed backups, so this " +
        "job is the only automated copy that exists. " +
        "Check: gcloud run jobs executions list --job=db-backup " +
        "--region=europe-west1",
      mimeType: "text/markdown",
    },
    combiner: "OR",
    conditions: [
      {
        displayName: "backup job execution failed",
        // Log-based: the job either completes or it does not, so there is no
        // useful metric to threshold — the failure IS the log line.
        conditionMatchedLog: {
          filter:
            'resource.type="cloud_run_job" ' +
            `AND resource.labels.job_name="${BACKUP_JOB}" ` +
            'AND (severity>=ERROR OR textPayload:"Container called exit(1)")',
        },
      },
    ],
    alertStrategy: {
      // Required for log-based conditions: how long without a new matching log
      // before the incident auto-closes.
      notificationRateLimit: { period: "3600s" },
      autoClose: "86400s",
    },
  };
}

function backupMissingPolicy() {
  return {
    displayName: BACKUP_MISSING_POLICY,
    documentation: {
      content:
        "No successful db-backup execution has been recorded for 15 hours. " +
        "Check both Cloud Scheduler and Cloud Run executions: gcloud run jobs " +
        "executions list --job=db-backup --region=europe-west1",
      mimeType: "text/markdown",
    },
    combiner: "OR",
    conditions: [
      {
        displayName: "no successful backup execution for 15 hours",
        conditionAbsent: {
          filter:
            'metric.type="run.googleapis.com/job/completed_execution_count" ' +
            'AND resource.type="cloud_run_job" ' +
            `AND resource.labels.job_name="${BACKUP_JOB}" ` +
            'AND metric.labels.result="succeeded"',
          // Backups run every 12 hours. A 15-hour window tolerates Monitoring
          // ingestion delay but detects one missed execution before the next
          // scheduled recovery point.
          duration: "54000s",
          aggregations: [
            {
              alignmentPeriod: "3600s",
              perSeriesAligner: "ALIGN_SUM",
            },
          ],
          trigger: { count: 1 },
        },
      },
    ],
  };
}

async function main() {
  if (!EMAIL || !/^[^@\s]+@[^@\s]+$/.test(EMAIL)) {
    console.error(
      "Usage: node ops/monitoring/setup-alerts.js <alert-email> [--dry-run]",
    );
    return 1;
  }
  console.log(`project: ${PROJECT}`);
  console.log(`alerts to: ${EMAIL}${DRY_RUN ? "  (dry run)" : ""}\n`);

  const channel = await ensureChannel();
  const uptimeName = await ensureUptimeCheck();
  // The policy filter keys off the trailing id, not the full resource path.
  const uptimeCheckId = uptimeName.split("/").pop();

  await ensurePolicy(
    UPTIME_POLICY,
    () => readinessPolicy(uptimeCheckId),
    channel,
  );
  await ensurePolicy(BACKUP_POLICY, backupPolicy, channel);
  await ensurePolicy(BACKUP_MISSING_POLICY, backupMissingPolicy, channel);

  console.log("\nDone.");
  console.log(
    "  Confirm the email: Google Cloud sends a verification link to " + EMAIL,
  );
  return 0;
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`FAILED: ${error.message}`);
      process.exit(1);
    });
}

module.exports = { backupMissingPolicy, backupPolicy };
