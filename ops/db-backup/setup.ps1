#!/usr/bin/env pwsh
# Provision the nightly Neon -> GCS backup: bucket, service accounts, Cloud Run
# job, and Cloud Scheduler trigger. Idempotent -- safe to re-run after a change.
#
# Usage: .\ops\db-backup\setup.ps1

$ErrorActionPreference = "Stop"

$PROJECT   = "qr-menu-app-469216"
$REGION    = "europe-west1"
$GCLOUD    = "C:\google-cloud-sdk\bin\gcloud.cmd"
$BUCKET    = "qr-menu-db-backups-469216"
$JOB       = "db-backup"
$SA        = "db-backup-job"
$SA_EMAIL  = "$SA@$PROJECT.iam.gserviceaccount.com"
$SCHED_SA  = "db-backup-scheduler"
$SCHED_SA_EMAIL = "$SCHED_SA@$PROJECT.iam.gserviceaccount.com"
$REPO      = "db-backup"
$IMAGE     = "$REGION-docker.pkg.dev/$PROJECT/$REPO/db-backup:latest"
# 02:15 UTC: outside Neon's Sunday maintenance window (03:00-04:00 UTC) and
# before European breakfast traffic.
$SCHEDULE  = "15 2 * * *"

Set-Location (Join-Path $PSScriptRoot "..\..")

function Invoke-Native {
    param([string]$File, [string[]]$Arguments, [switch]$AllowFailure)
    Write-Host "> $File $($Arguments -join ' ')" -ForegroundColor DarkGray
    & $File @Arguments
    $code = $LASTEXITCODE
    if ($code -ne 0 -and -not $AllowFailure) {
        throw "Command failed with exit code $code"
    }
    return $code
}

function Test-Exists {
    param([string[]]$Arguments)
    & $GCLOUD @Arguments 2>$null | Out-Null
    return ($LASTEXITCODE -eq 0)
}

Write-Host "`n=== 1/7  APIs ===" -ForegroundColor Cyan
# Cloud Scheduler is the only one not already enabled; Run Jobs ride on
# run.googleapis.com, which the backend service already uses.
Invoke-Native $GCLOUD @("services", "enable", "cloudscheduler.googleapis.com", "--project=$PROJECT") | Out-Null

Write-Host "`n=== 2/7  Backup bucket ===" -ForegroundColor Cyan
if (Test-Exists @("storage", "buckets", "describe", "gs://$BUCKET", "--project=$PROJECT")) {
    Write-Host "Bucket gs://$BUCKET already exists." -ForegroundColor Yellow
} else {
    # Same region as the job, and inside the EU where the data already lives.
    # Uniform access + public-access-prevention because this holds a full dump
    # of every tenant's data, PII included.
    Invoke-Native $GCLOUD @(
        "storage", "buckets", "create", "gs://$BUCKET",
        "--project=$PROJECT",
        "--location=$REGION",
        "--default-storage-class=STANDARD",
        "--uniform-bucket-level-access",
        "--public-access-prevention"
    ) | Out-Null
}

# Versioning makes an overwrite or delete recoverable. Combined with the job's
# write-only permission below, nothing that reaches the job can destroy history.
Invoke-Native $GCLOUD @("storage", "buckets", "update", "gs://$BUCKET", "--versioning", "--project=$PROJECT") | Out-Null

$lifecycle = @'
{
  "rule": [
    {
      "action": {"type": "SetStorageClass", "storageClass": "NEARLINE"},
      "condition": {"age": 14}
    },
    {
      "action": {"type": "Delete"},
      "condition": {"age": 90}
    },
    {
      "action": {"type": "Delete"},
      "condition": {"daysSinceNoncurrentTime": 14}
    }
  ]
}
'@
$lifecycleFile = [System.IO.Path]::GetTempFileName()
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($lifecycleFile, $lifecycle, $utf8)
Invoke-Native $GCLOUD @("storage", "buckets", "update", "gs://$BUCKET", "--lifecycle-file=$lifecycleFile", "--project=$PROJECT") | Out-Null
Remove-Item $lifecycleFile

Write-Host "`n=== 3/7  Service accounts ===" -ForegroundColor Cyan
if (-not (Test-Exists @("iam", "service-accounts", "describe", $SA_EMAIL, "--project=$PROJECT"))) {
    Invoke-Native $GCLOUD @(
        "iam", "service-accounts", "create", $SA,
        "--display-name=Nightly database backup job",
        "--project=$PROJECT"
    ) | Out-Null
}
if (-not (Test-Exists @("iam", "service-accounts", "describe", $SCHED_SA_EMAIL, "--project=$PROJECT"))) {
    Invoke-Native $GCLOUD @(
        "iam", "service-accounts", "create", $SCHED_SA,
        "--display-name=Cloud Scheduler trigger for the backup job",
        "--project=$PROJECT"
    ) | Out-Null
}

Write-Host "`n=== 4/7  IAM (least privilege) ===" -ForegroundColor Cyan
# objectCreator, NOT objectAdmin: the job can write a new backup and can never
# delete or overwrite an existing one. Anything that compromises the job cannot
# destroy the thing you would restore from.
Invoke-Native $GCLOUD @(
    "storage", "buckets", "add-iam-policy-binding", "gs://$BUCKET",
    "--member=serviceAccount:$SA_EMAIL",
    "--role=roles/storage.objectCreator",
    "--project=$PROJECT"
) | Out-Null
# Scoped to the one secret it needs, not project-wide secretAccessor.
Invoke-Native $GCLOUD @(
    "secrets", "add-iam-policy-binding", "DIRECT_URL",
    "--member=serviceAccount:$SA_EMAIL",
    "--role=roles/secretmanager.secretAccessor",
    "--project=$PROJECT"
) | Out-Null

Write-Host "`n=== 5/7  Build the image ===" -ForegroundColor Cyan
if (-not (Test-Exists @("artifacts", "repositories", "describe", $REPO, "--location=$REGION", "--project=$PROJECT"))) {
    Invoke-Native $GCLOUD @(
        "artifacts", "repositories", "create", $REPO,
        "--repository-format=docker",
        "--location=$REGION",
        "--project=$PROJECT"
    ) | Out-Null
}
Invoke-Native $GCLOUD @(
    "builds", "submit", "ops/db-backup",
    "--tag=$IMAGE",
    "--project=$PROJECT",
    "--region=$REGION"
) | Out-Null

Write-Host "`n=== 6/7  Cloud Run job ===" -ForegroundColor Cyan
Invoke-Native $GCLOUD @(
    "run", "jobs", "deploy", $JOB,
    "--image=$IMAGE",
    "--region=$REGION",
    "--project=$PROJECT",
    "--service-account=$SA_EMAIL",
    "--set-secrets=DIRECT_URL=DIRECT_URL:latest",
    "--set-env-vars=BACKUP_BUCKET=$BUCKET",
    # One attempt, no retry: a second dump of a database that just refused the
    # first is unlikely to help and doubles the load. A failure should surface,
    # not quietly succeed on attempt three.
    "--max-retries=0",
    "--task-timeout=900s",
    "--memory=512Mi",
    "--cpu=1"
) | Out-Null

# Bound after the job exists -- the binding targets the job resource.
Invoke-Native $GCLOUD @(
    "run", "jobs", "add-iam-policy-binding", $JOB,
    "--member=serviceAccount:$SCHED_SA_EMAIL",
    "--role=roles/run.invoker",
    "--region=$REGION",
    "--project=$PROJECT"
) | Out-Null

Write-Host "`n=== 7/7  Scheduler ===" -ForegroundColor Cyan
$uri = "https://$REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT/jobs/${JOB}:run"
$schedArgs = @(
    "scheduler", "jobs", "create", "http", "$JOB-nightly",
    "--location=$REGION",
    "--project=$PROJECT",
    "--schedule=$SCHEDULE",
    "--time-zone=UTC",
    "--uri=$uri",
    "--http-method=POST",
    "--oauth-service-account-email=$SCHED_SA_EMAIL",
    "--attempt-deadline=1800s"
)
$exit = Invoke-Native $GCLOUD $schedArgs -AllowFailure
if ($exit -ne 0) {
    Write-Host "Scheduler job already exists -- updating instead." -ForegroundColor Yellow
    $schedArgs[2] = "update"
    Invoke-Native $GCLOUD $schedArgs | Out-Null
}

Write-Host "`nDone." -ForegroundColor Green
Write-Host "  Run now:  gcloud run jobs execute $JOB --region=$REGION --project=$PROJECT --wait"
Write-Host "  List:     gcloud storage ls -r gs://$BUCKET"
Write-Host "  Schedule: $SCHEDULE UTC"
