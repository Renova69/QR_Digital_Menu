#!/usr/bin/env pwsh
# Deploy backend to Cloud Run.
# Usage: .\deploy.ps1
#
# Secrets live in Google Secret Manager -- never pass them here.
# To update a secret value:
#   $utf8 = New-Object System.Text.UTF8Encoding $false
#   $tmp = [System.IO.Path]::GetTempFileName()
#   [System.IO.File]::WriteAllText($tmp, "NEW_VALUE", $utf8)
#   gcloud secrets versions add SECRET_NAME --data-file=$tmp --project=qr-menu-app-469216
#   Remove-Item $tmp
#
# To add a NEW plain env var (non-secret):
#   Use --update-env-vars, NOT --set-env-vars (which wipes everything).
#
# Deploy shape: build a commit-SHA-tagged image (never mutable :latest),
# deploy it with --no-traffic so the current revision keeps serving 100% of
# traffic, smoke-test the new revision directly via its own tagged URL, and
# only then shift traffic to it. If the smoke check fails, traffic never
# moved -- there is nothing to roll back. The previous revision name is
# always printed so a rollback is one copy-pasted command either way.

$ErrorActionPreference = "Stop"
# Windows PowerShell 5.1 / older .NET Framework can default to a TLS
# version Cloud Run's endpoint rejects. Force TLS 1.2 before the first
# Invoke-WebRequest smoke check below.
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

$PROJECT       = "qr-menu-app-469216"
$SERVICE       = "qr-menu-backend"
$REGION        = "europe-west1"
$GCLOUD        = "C:\google-cloud-sdk\bin\gcloud.cmd"
$SRC           = "apps/backend"
$SMOKE_RETRIES = 10
$SMOKE_DELAY_SECONDS = 3

Set-Location $PSScriptRoot

# --- 0. Identify what's currently serving, before anything changes --------
Write-Host "==> Checking current traffic..."
$currentTrafficJson = & $GCLOUD run services describe $SERVICE `
    --project=$PROJECT --region=$REGION `
    --format="json(status.traffic)"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Could not read current service state (exit $LASTEXITCODE)"
    exit 1
}
$currentTraffic = ($currentTrafficJson | Out-String | ConvertFrom-Json).status.traffic
$previousRevision = ($currentTraffic | Where-Object { $_.percent -gt 0 } | Select-Object -First 1).revisionName
Write-Host "==> Currently serving: $previousRevision"

# --- 1. Warn (not block) on an uncommitted working tree --------------------
$gitStatus = git status --porcelain 2>&1
if ($gitStatus) {
    Write-Warning "Working tree has uncommitted changes -- deploying whatever is on disk in $SRC, which may not match any commit."
}
$gitSha = (git rev-parse --short=12 HEAD).Trim()
if (-not $gitSha) {
    Write-Error "Could not resolve a git commit SHA -- refusing to deploy an untraceable image."
    exit 1
}
# Cloud Run traffic tags must start with a letter; git SHAs are hex and can
# start with a digit, so both tags below are prefixed.
$IMAGE       = "gcr.io/$PROJECT/$SERVICE`:sha-$gitSha"
$revisionTag = "rev-$gitSha"

# --- 2. Build -- tagged by commit, never :latest ----------------------------
Write-Host "==> Building image $IMAGE ..."
& $GCLOUD builds submit --project=$PROJECT --tag=$IMAGE $SRC
if ($LASTEXITCODE -ne 0) { Write-Error "Build failed"; exit 1 }

# --- 3. Deploy with no traffic -- the new revision exists but serves nobody
Write-Host "==> Deploying new revision (no traffic yet)..."
& $GCLOUD run deploy $SERVICE `
    --project=$PROJECT `
    --image=$IMAGE `
    --region=$REGION `
    --platform=managed `
    --session-affinity `
    --no-traffic `
    --tag=$revisionTag `
    2>&1
if ($LASTEXITCODE -ne 0) { Write-Error "Deploy failed"; exit 1 }

$canaryUrlJson = & $GCLOUD run services describe $SERVICE `
    --project=$PROJECT --region=$REGION `
    --format="json(status.traffic)"
$canaryTraffic = ($canaryUrlJson | Out-String | ConvertFrom-Json).status.traffic
$canaryEntry = $canaryTraffic | Where-Object { $_.tag -eq $revisionTag } | Select-Object -First 1
if (-not $canaryEntry -or -not $canaryEntry.url) {
    Write-Error "Deployed but could not resolve the new revision's tagged URL -- aborting before any traffic shift. Inspect manually: gcloud run revisions list --service=$SERVICE --region=$REGION"
    exit 1
}
$canaryUrl = $canaryEntry.url
$newRevision = $canaryEntry.revisionName
Write-Host "==> New revision $newRevision deployed at $canaryUrl (0% traffic)"

# --- 4. Smoke-test the new revision directly, not through the service's ---
#        public traffic split -- retried because a cold-started container
#        can take a few seconds to accept its first request.
Write-Host "==> Smoke-testing new revision..."
$healthy = $false
for ($i = 1; $i -le $SMOKE_RETRIES; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "$canaryUrl/api/v1/health" -UseBasicParsing -TimeoutSec 10
        if ($response.StatusCode -eq 200) {
            $healthy = $true
            break
        }
        Write-Host "    attempt $i/$SMOKE_RETRIES : HTTP $($response.StatusCode)"
    } catch {
        Write-Host "    attempt $i/$SMOKE_RETRIES : $($_.Exception.Message)"
    }
    Start-Sleep -Seconds $SMOKE_DELAY_SECONDS
}

if (-not $healthy) {
    Write-Error "Smoke check failed after $SMOKE_RETRIES attempts. Traffic was never shifted -- $previousRevision is still serving 100%."
    Write-Host "Inspect the bad revision directly: $canaryUrl"
    Write-Host "Logs: gcloud run services logs read $SERVICE --project=$PROJECT --region=$REGION --limit=100"
    exit 1
}
Write-Host "==> Smoke check passed."

# --- 5. Shift traffic only now that the new revision proved healthy -------
Write-Host "==> Shifting 100% traffic to $newRevision ..."
& $GCLOUD run services update-traffic $SERVICE `
    --project=$PROJECT --region=$REGION `
    --to-tags "$revisionTag=100"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Traffic shift failed. $previousRevision may still be serving -- verify with: gcloud run services describe $SERVICE --project=$PROJECT --region=$REGION --format='value(status.traffic)'"
    exit 1
}

Write-Host ""
Write-Host "==> Done. Now serving: $newRevision"
Write-Host "==> Service URL: https://$SERVICE-822584248302.$REGION.run.app"
Write-Host ""
Write-Host "Rollback to the previous revision if needed:"
Write-Host "  $GCLOUD run services update-traffic $SERVICE --project=$PROJECT --region=$REGION --to-revisions=$previousRevision=100"
