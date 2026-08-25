#!/usr/bin/env pwsh
# Provision the nightly Supabase -> GCS backup: bucket, service accounts, Cloud Run
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
$BACKUP_CONNECTION_RESOURCE = "BACKUP_DIRECT_URL"
$DB_PROJECT_REF = "scmjaqhiyvzsyyvdygwu"
$DB_HOST = "aws-0-eu-central-1.pooler.supabase.com"
$DB_NAME = "postgres"
$DB_ROLE = "qr_menu_backup"
# 02:15 and 14:15 UTC: two verified recovery points per day. The 12-hour gap
# also permits a 15-hour missing-success alert; Cloud Monitoring rejects
# absence windows longer than 23h30, which cannot safely monitor a daily cron.
$SCHEDULE  = "15 2,14 * * *"

Set-Location (Join-Path $PSScriptRoot "..\..")

# Both helpers drop $ErrorActionPreference to Continue around the native call.
# Windows PowerShell 5.1 wraps a native command's stderr in an ErrorRecord, and
# with the script-level "Stop" that turns any stderr output into a terminating
# error -- so gcloud writing a routine "NOT_FOUND" (or even a progress line)
# aborts the script. Exit code is the only trustworthy success signal here.

function Invoke-Native {
    param([string]$File, [string[]]$Arguments, [switch]$AllowFailure)
    Write-Host "> $File $($Arguments -join ' ')" -ForegroundColor DarkGray
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $File @Arguments
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    if ($code -ne 0 -and -not $AllowFailure) {
        throw "Command failed with exit code $code"
    }
    return $code
}

function Test-Exists {
    param([string[]]$Arguments)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        # *> redirects every stream, including the native stderr that would
        # otherwise surface as a NativeCommandError.
        & $GCLOUD @Arguments *> $null
        return ($LASTEXITCODE -eq 0)
    } finally {
        $ErrorActionPreference = $previous
    }
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

# Reassert protections even for an existing bucket. Versioning makes an
# overwrite recoverable, soft delete makes an operator deletion recoverable,
# and uniform/PAP prevent an object-level ACL from exposing a full database.
Invoke-Native $GCLOUD @(
    "storage", "buckets", "update", "gs://$BUCKET",
    "--versioning",
    "--uniform-bucket-level-access",
    "--public-access-prevention",
    "--soft-delete-duration=7d",
    "--project=$PROJECT"
) | Out-Null

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
# objectCreator + objectViewer, NOT objectAdmin or objectUser. Neither role
# grants storage.objects.delete, so nothing that compromises this job can
# destroy the thing you would restore from -- and with versioning enabled above,
# even an overwrite leaves the previous generation intact.
#
# objectViewer is required, not optional: `gcloud storage cp` issues a GET to
# check whether the destination already exists before uploading, so a
# create-only binding fails the upload with a 403 on storage.objects.get after
# the dump has already succeeded. Read access is needed to restore in any case.
foreach ($role in @("roles/storage.objectCreator", "roles/storage.objectViewer")) {
    Invoke-Native $GCLOUD @(
        "storage", "buckets", "add-iam-policy-binding", "gs://$BUCKET",
        "--member=serviceAccount:$SA_EMAIL",
        "--role=$role",
        "--project=$PROJECT"
    ) | Out-Null
}
# Scoped to the read-only backup credential, not the privileged migration
# secret and not project-wide secretAccessor.
Invoke-Native $GCLOUD @(
    "secrets", "add-iam-policy-binding", $BACKUP_CONNECTION_RESOURCE,
    "--member=serviceAccount:$SA_EMAIL",
    "--role=roles/secretmanager.secretAccessor",
    "--project=$PROJECT"
) | Out-Null
# Remove the legacy privileged migration-secret grant. Merely changing the
# job's env binding is insufficient: a compromised job identity could call
# Secret Manager directly while this IAM permission remained.
Invoke-Native $GCLOUD @(
    "secrets", "remove-iam-policy-binding", "DIRECT_URL",
    "--member=serviceAccount:$SA_EMAIL",
    "--role=roles/secretmanager.secretAccessor",
    "--project=$PROJECT"
) -AllowFailure | Out-Null

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
    "--set-secrets=DIRECT_URL=${BACKUP_CONNECTION_RESOURCE}:latest",
    # Floors are deliberately below the verified 2026-08-25 production
    # snapshot, but high enough that an empty or materially wiped database can
    # never be accepted as a healthy backup. A legitimate bulk deletion must
    # update these values consciously before backups resume.
    "--set-env-vars=BACKUP_BUCKET=$BUCKET,BACKUP_EXPECTED_PROJECT_REF=$DB_PROJECT_REF,BACKUP_EXPECTED_DATABASE=$DB_NAME,BACKUP_EXPECTED_ROLE=$DB_ROLE,BACKUP_EXPECTED_HOST=$DB_HOST,BACKUP_EXPECTED_PORT=5432,BACKUP_MIN_USERS=20,BACKUP_MIN_RESTAURANTS=12,BACKUP_MIN_ORDERS=2000,BACKUP_MIN_MENU_ITEMS=800,BACKUP_MIN_TABLES=50,BACKUP_MIN_PAYMENTS=60,BACKUP_MIN_MENU_VIEWS=1200,BACKUP_MIN_MIGRATIONS=60,BACKUP_MIN_PUBLIC_TABLES=50,BACKUP_MIN_SOURCE_RETENTION_PERCENT=80",
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
