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

function Invoke-Native {
    <#
    .SYNOPSIS
      Run an external command, judging success by exit code alone.

    .DESCRIPTION
      Windows PowerShell 5.1 converts every stderr line from a native
      executable into an ErrorRecord whenever that stream is redirected --
      piped, captured, teed, or merged with 2>&1. Under
      $ErrorActionPreference = "Stop" those records are terminating, so
      gcloud's ordinary progress output ("Creating temporary archive...",
      "Waiting for build to complete...") aborts the script with
      NativeCommandError even though gcloud exited 0.

      That makes the whole script fragile in a way that depends on how it is
      invoked: `.\deploy.ps1` works, `.\deploy.ps1 2>&1 | Tee-Object log.txt`
      dies mid-build with a false failure. CI, a wrapper script, or an agent
      capturing output all hit it.

      Keep "Stop" for cmdlets, where it is genuinely useful (the
      Invoke-WebRequest smoke check depends on it), but run native commands
      under "Continue" and check $LASTEXITCODE instead -- the only reliable
      success signal an external process gives us.
    #>
    param(
        [Parameter(Mandatory)][string]$Description,
        [Parameter(Mandatory)][scriptblock]$Command
    )

    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $Command
    } finally {
        $ErrorActionPreference = $previousPreference
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Error "$Description failed (exit $LASTEXITCODE)"
        exit 1
    }
}

# --- 0. Identify what's currently serving, before anything changes --------
Write-Host "==> Checking current traffic..."
$currentTrafficJson = Invoke-Native -Description "Reading current service state" -Command {
    & $GCLOUD run services describe $SERVICE `
        --project=$PROJECT --region=$REGION `
        --format="json(status.traffic)"
}
$currentTraffic = ($currentTrafficJson | Out-String | ConvertFrom-Json).status.traffic
$previousRevision = ($currentTraffic | Where-Object { $_.percent -gt 0 } | Select-Object -First 1).revisionName
Write-Host "==> Currently serving: $previousRevision"

# --- 1. Warn (not block) on an uncommitted working tree --------------------
# No 2>&1: it would both trip the NativeCommandError behaviour described in
# Invoke-Native and fold any git warning into $gitStatus, producing a false
# "uncommitted changes" warning on a clean tree.
$gitStatus = git status --porcelain
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
Invoke-Native -Description "Build" -Command {
    & $GCLOUD builds submit --project=$PROJECT --tag=$IMAGE $SRC
}

# --- 3. Deploy with no traffic -- the new revision exists but serves nobody
Write-Host "==> Deploying new revision (no traffic yet)..."
# --update-secrets, never --set-secrets: the latter replaces the service's
# entire secret list, silently dropping every binding not named here.
# Attaching DIRECT_URL through the deploy (rather than a bare
# `gcloud run services update`) keeps it inside the canary flow below, so a
# bad secret fails the smoke check instead of going straight to live traffic.
Invoke-Native -Description "Deploy" -Command {
    & $GCLOUD run deploy $SERVICE `
        --project=$PROJECT `
        --image=$IMAGE `
        --region=$REGION `
        --platform=managed `
        --session-affinity `
        --no-traffic `
        --update-secrets=DIRECT_URL=DIRECT_URL:latest `
        --tag=$revisionTag
}

$canaryUrlJson = Invoke-Native -Description "Resolving the new revision's tagged URL" -Command {
    & $GCLOUD run services describe $SERVICE `
        --project=$PROJECT --region=$REGION `
        --format="json(status.traffic)"
}
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
Invoke-Native -Description "Traffic shift ($previousRevision may still be serving -- verify with: gcloud run services describe $SERVICE --project=$PROJECT --region=$REGION --format='value(status.traffic)')" -Command {
    & $GCLOUD run services update-traffic $SERVICE `
        --project=$PROJECT --region=$REGION `
        --to-tags "$revisionTag=100"
}

Write-Host ""
Write-Host "==> Done. Now serving: $newRevision"
Write-Host "==> Service URL: https://$SERVICE-822584248302.$REGION.run.app"
Write-Host ""
Write-Host "Rollback to the previous revision if needed:"
Write-Host "  $GCLOUD run services update-traffic $SERVICE --project=$PROJECT --region=$REGION --to-revisions=$previousRevision=100"
