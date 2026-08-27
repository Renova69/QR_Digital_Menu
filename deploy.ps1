#!/usr/bin/env pwsh
# Deploy backend to Cloud Run.
# Usage: .\deploy.ps1
# Temporary development exception: .\deploy.ps1 -DevelopmentWithoutStaging
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
# Deploy shape: select the immutable image proved by staging, or build a
# commit-SHA-tagged image under the explicit development exception. Deploy it
# with --no-traffic so the current revision keeps serving 100% of traffic,
# smoke-test the new revision directly via its own tagged URL, and only then
# shift traffic to it. If the smoke check fails, traffic never moved -- there
# is nothing to roll back. The previous revision name is always printed so an
# application rollback is one copy-pasted command either way.

param(
    [switch]$DevelopmentWithoutStaging
)

$ErrorActionPreference = "Stop"
# Windows PowerShell 5.1 / older .NET Framework can default to a TLS
# version Cloud Run's endpoint rejects. Force TLS 1.2 before the first
# Invoke-WebRequest smoke check below.
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

$PROJECT       = "qr-menu-app-469216"
$SERVICE       = "qr-menu-backend"
$STAGING_SERVICE = "qr-menu-backend-staging"
$BACKUP_JOB    = "db-backup"
$REGION        = "europe-west1"
$GCLOUD        = "C:\google-cloud-sdk\bin\gcloud.cmd"
$SRC           = "apps/backend"
$GITHUB_REPOSITORY = "Renova69/QR_Digital_Menu"
$REQUIRED_BRANCH   = "main"
$REQUIRED_CHECK    = "verify"
$GITHUB_API_VERSION = "2026-03-10"
$DB_PROJECT_REF = "scmjaqhiyvzsyyvdygwu"
$DB_HOST = "aws-0-eu-central-1.pooler.supabase.com"
$DB_PORT = 5432
$DB_NAME = "postgres"
# Serving shape. These were never passed, so every deploy silently inherited
# whatever was already on the service -- Cloud Run's defaults of 80 concurrent
# requests and a 300s request timeout, with maxScale pinned at 3. That is up to
# 240 request slots, each holdable for five minutes by a single hung
# dependency. Pinning them here makes the shape reviewable in source rather
# than discoverable only by querying the live service.
#
# 30s is comfortably above the slowest legitimate request now that every
# outbound call carries its own deadline (the longest, Stripe, is bounded at
# ~30s worst case including its one retry). Anything still running past 30s is
# wedged, not slow, and holding the slot helps nobody.
$CONCURRENCY   = 40
$MAX_INSTANCES = 3
$REQUEST_TIMEOUT = 30
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

# --- 0. Prove this exact source revision passed mandatory CI ---------------
# Production deploys must come from the clean, current origin/main commit.
# The GitHub check lookup is intentionally fail-closed: no network, stale
# origin/main, a missing check, or any non-success conclusion stops before the
# build, migration, revision creation, or traffic change. GITHUB_TOKEN is
# optional now that the repository is public; when present it only raises the
# GitHub API rate limit.
$gitBranch = (Invoke-Native -Description "Reading current git branch" -Command {
    & git branch --show-current
} | Out-String).Trim()
if ($gitBranch -ne $REQUIRED_BRANCH) {
    Write-Error "Current branch is '$gitBranch'; production deploys are allowed only from '$REQUIRED_BRANCH'."
    exit 1
}

$gitStatus = Invoke-Native -Description "Reading git working tree status" -Command {
    & git status --porcelain --untracked-files=all
}
if ($gitStatus) {
    Write-Error "Working tree has uncommitted or untracked files -- refusing to deploy source that does not exactly match a commit."
    exit 1
}

Write-Host "==> Refreshing origin/$REQUIRED_BRANCH..."
Invoke-Native -Description "Refreshing origin/$REQUIRED_BRANCH" -Command {
    & git fetch --quiet origin "+refs/heads/${REQUIRED_BRANCH}:refs/remotes/origin/${REQUIRED_BRANCH}"
}

$gitFullSha = (Invoke-Native -Description "Resolving HEAD" -Command {
    & git rev-parse HEAD
} | Out-String).Trim()
$originFullSha = (Invoke-Native -Description "Resolving origin/$REQUIRED_BRANCH" -Command {
    & git rev-parse "origin/$REQUIRED_BRANCH"
} | Out-String).Trim()
if (-not $gitFullSha -or $gitFullSha -ne $originFullSha) {
    Write-Error "HEAD ($gitFullSha) does not match origin/$REQUIRED_BRANCH ($originFullSha) -- refusing to deploy stale or unmerged code."
    exit 1
}

Write-Host "==> Verifying GitHub Actions '$REQUIRED_CHECK' for $gitFullSha..."
$githubHeaders = @{
    Accept                 = "application/vnd.github+json"
    "User-Agent"           = "QR-Digital-Menu-deploy-preflight"
    "X-GitHub-Api-Version" = $GITHUB_API_VERSION
}
if ($env:GITHUB_TOKEN) {
    $githubHeaders.Authorization = "Bearer $($env:GITHUB_TOKEN)"
}

$checkRunsUrl = "https://api.github.com/repos/$GITHUB_REPOSITORY/commits/$gitFullSha/check-runs?check_name=$REQUIRED_CHECK&filter=latest&per_page=100"
try {
    $checkRunsResponse = Invoke-RestMethod `
        -Method Get `
        -Uri $checkRunsUrl `
        -Headers $githubHeaders
} catch {
    Write-Error "Could not verify GitHub Actions for $gitFullSha -- refusing to deploy. $($_.Exception.Message)"
    exit 1
}

$successfulCheck = @($checkRunsResponse.check_runs) |
    Where-Object {
        $_.name -eq $REQUIRED_CHECK -and
        $_.head_sha -eq $gitFullSha -and
        $_.status -eq "completed" -and
        $_.conclusion -eq "success" -and
        $_.app.slug -eq "github-actions"
    } |
    Select-Object -First 1
if (-not $successfulCheck) {
    $observedChecks = @($checkRunsResponse.check_runs) |
        ForEach-Object { "$($_.name):$($_.app.slug):$($_.status):$($_.conclusion)" }
    $observedSummary = if ($observedChecks) { $observedChecks -join ", " } else { "none" }
    Write-Error "Required GitHub Actions check '$REQUIRED_CHECK' is not successful for $gitFullSha (observed: $observedSummary) -- refusing to deploy."
    exit 1
}
Write-Host "==> Mandatory CI verified: $($successfulCheck.details_url)"

$gitSha = $gitFullSha.Substring(0, 12)

# --- 0b. Prove this commit already survived isolated staging ---------------
# Staging owns a separate Supabase project, Redis deployment, frontend origin,
# and Stripe test credentials. Production refuses before build, backup,
# migration, revision creation, or traffic changes unless the one serving
# staging revision proves the exact commit, migration set, and image digest.
# Production then deploys that same digest; rebuilding here would create a
# second, untested artifact even when the source commit is unchanged.
#
# While the product has no real tenants, payments, or customer data, the owner
# may explicitly use -DevelopmentWithoutStaging. Staging remains the default;
# remove the exception before the first real tenant or payment.
$useStagingProof = -not $DevelopmentWithoutStaging
if ($useStagingProof) {
Write-Host "==> Verifying isolated staging proof..."
$migrationDigest = (Invoke-Native -Description "Computing migration digest" -Command {
    & node ops/staging/staging-policy.js digest apps/backend/prisma/migrations
} | Out-String).Trim()
$stagingImageTag = "gcr.io/$PROJECT/$STAGING_SERVICE`:sha-$gitSha"
$expectedImageDigest = (Invoke-Native -Description "Resolving staged image digest" -Command {
    & $GCLOUD container images describe $stagingImageTag `
        --project=$PROJECT `
        --format="value(image_summary.digest)"
} | Out-String).Trim()

$stagingServiceJson = Invoke-Native -Description "Reading isolated staging service" -Command {
    & $GCLOUD run services describe $STAGING_SERVICE `
        --project=$PROJECT `
        --region=$REGION `
        --format=json
}
$stagingServiceDocument = ($stagingServiceJson | Out-String | ConvertFrom-Json)
$positiveStagingTraffic = @($stagingServiceDocument.status.traffic) |
    Where-Object { $_.percent -gt 0 }
if (
    @($positiveStagingTraffic).Count -ne 1 -or
    $positiveStagingTraffic[0].percent -ne 100 -or
    -not $positiveStagingTraffic[0].revisionName
) {
    Write-Error "Isolated staging must have exactly one revision serving 100% traffic."
    exit 1
}
$stagingServingRevision = $positiveStagingTraffic[0].revisionName
$stagingRevisionJson = Invoke-Native -Description "Reading serving staging revision" -Command {
    & $GCLOUD run revisions describe $stagingServingRevision `
        --project=$PROJECT `
        --region=$REGION `
        --format=json
}
$stagingRevision = ($stagingRevisionJson | Out-String | ConvertFrom-Json)
$stagingRevisionEnvironment = @($stagingRevision.spec.containers[0].env)
function Read-StagingProofValue {
    param([Parameter(Mandatory)][string]$Name)

    $entry = $stagingRevisionEnvironment |
        Where-Object { $_.name -eq $Name } |
        Select-Object -First 1
    if (-not $entry -or $null -eq $entry.value) {
        Write-Error "Serving staging revision does not expose proof value $Name."
        exit 1
    }
    return [string]$entry.value
}
$stagingReady = @($stagingRevision.status.conditions) |
    Where-Object { $_.type -eq "Ready" -and $_.status -eq "True" } |
    Select-Object -First 1
$stagingProof = @{
    serviceName = [string]$stagingServiceDocument.metadata.name
    revisionName = [string]$stagingRevision.metadata.name
    trafficRevisionName = [string]$stagingServingRevision
    trafficPercent = [int]$positiveStagingTraffic[0].percent
    image = [string]$stagingRevision.spec.containers[0].image
    deployedImageDigest = Read-StagingProofValue "STAGING_IMAGE_DIGEST"
    validatedSha = Read-StagingProofValue "STAGING_VALIDATED_SHA"
    migrationDigest = Read-StagingProofValue "STAGING_MIGRATION_DIGEST"
    ready = [bool]$stagingReady
}
$env:STAGING_PROOF_JSON = $stagingProof | ConvertTo-Json -Compress
try {
    Invoke-Native -Description "Isolated staging proof" -Command {
        & node ops/staging/staging-policy.js proof `
            $gitFullSha `
            $migrationDigest `
            $expectedImageDigest
    }
} finally {
    Remove-Item Env:STAGING_PROOF_JSON -ErrorAction SilentlyContinue
}
Write-Host "==> Isolated staging proof verified for $gitFullSha."
$IMAGE = "gcr.io/$PROJECT/$STAGING_SERVICE@$expectedImageDigest"
} else {
    Write-Warning "DEVELOPMENT EXCEPTION: isolated staging proof is skipped explicitly."
    Write-Warning "Remove this exception before the first real tenant, payment, or customer data."
    $IMAGE = "gcr.io/$PROJECT/$SERVICE`:sha-$gitSha"
}

# Cloud Run traffic tags must start with a letter; git SHAs are hex and can
# start with a digit, so both tags below are prefixed.
$revisionTag = "rev-$gitSha"

# --- 1. Identify what's currently serving, before anything changes --------
Write-Host "==> Checking current traffic..."
$currentTrafficJson = Invoke-Native -Description "Reading current service state" -Command {
    & $GCLOUD run services describe $SERVICE `
        --project=$PROJECT --region=$REGION `
        --format="json(status.traffic)"
}
$currentTraffic = ($currentTrafficJson | Out-String | ConvertFrom-Json).status.traffic
$previousRevision = ($currentTraffic | Where-Object { $_.percent -gt 0 } | Select-Object -First 1).revisionName
Write-Host "==> Currently serving: $previousRevision"

# --- 2. Select or build the immutable artifact ------------------------------
if ($useStagingProof) {
    Write-Host "==> Using staging-verified immutable image $IMAGE ..."
} else {
    Write-Host "==> Building development image $IMAGE ..."
    Invoke-Native -Description "Build" -Command {
        & $GCLOUD builds submit --project=$PROJECT --tag=$IMAGE $SRC
    }
}

# --- 2b. Migrate once, here, rather than once per container -----------------
# The image no longer runs `prisma migrate deploy` at start-up (see the CMD
# comment in apps/backend/Dockerfile). Running it here means exactly one
# migration process per deploy instead of one per instance, so there is nothing
# to serialise and Prisma's advisory lock has no contention to arbitrate.
#
# This uses DIRECT_URL from apps/backend/.env -- Supabase's session-mode pooler
# -- because migrations need a real session. Ordering is deliberate: after the
# image passed isolated staging (or the explicit development build completed),
# and before the deploy, so the schema is always at or ahead of the code. Every
# migration must remain compatible with the revision currently serving
# production.
# Contract migrations require their readiness revision to be fully deployed first.
#
# A failure aborts before any new revision exists, leaving $previousRevision
# serving untouched.
# Refuse to migrate a local database. prisma.config.ts loads dotenv, and dotenv
# never overrides an already-set variable, so the step below targets
# $env:DIRECT_URL when present and the .env value otherwise -- resolve it the
# same way here. Without this, a developer .env still pointing at Docker makes
# the migration "succeed" against localhost while the revision deployed below
# boots against Supabase, so the columns the new code expects are simply absent in
# production and every affected endpoint 500s.
$effectiveDirectUrl = $env:DIRECT_URL
if (-not $effectiveDirectUrl) {
    $envFile = Join-Path $PSScriptRoot "$SRC\.env"
    if (Test-Path $envFile) {
        $directUrlLine = Get-Content $envFile |
            Where-Object { $_ -match '^\s*DIRECT_URL\s*=' } |
            Select-Object -First 1
        if ($directUrlLine) {
            $effectiveDirectUrl = ($directUrlLine -split '=', 2)[1].Trim().Trim('"').Trim("'")
        }
    }
}
if (-not $effectiveDirectUrl) {
    Write-Error "DIRECT_URL is set neither in the environment nor in $SRC/.env -- refusing to deploy, since migrations would have no defined target."
    exit 1
}
if ($effectiveDirectUrl -match 'localhost|127\.0\.0\.1|\[::1\]') {
    # Redact credentials before echoing the URL back.
    $redacted = $effectiveDirectUrl -replace '://[^@/]*@', '://***@'
    Write-Error @"
DIRECT_URL resolves to a LOCAL database: $redacted
Migrations would be applied there, while the revision deployed below serves
production. Point this run at the Supabase session-mode pooler and re-run.
"@
    exit 1
}

try {
    $directUri = [System.Uri]$effectiveDirectUrl
    $directUser = [System.Uri]::UnescapeDataString(($directUri.UserInfo -split ':', 2)[0])
    $directDatabase = $directUri.AbsolutePath.TrimStart('/')
} catch {
    Write-Error "DIRECT_URL is not a valid PostgreSQL URL -- refusing to migrate."
    exit 1
}
if (
    $directUri.Scheme -notin @("postgres", "postgresql") -or
    $directUri.Host -ne $DB_HOST -or
    $directUri.Port -ne $DB_PORT -or
    -not $directUser.EndsWith(".$DB_PROJECT_REF") -or
    $directDatabase -ne $DB_NAME
) {
    Write-Error @"
DIRECT_URL does not match the protected production Supabase target.
Expected project reference: $DB_PROJECT_REF
Expected host/port: ${DB_HOST}:$DB_PORT
Expected database: $DB_NAME
Refusing to migrate a different or ambiguously identified database.
"@
    exit 1
}

Write-Host "==> Rejecting destructive migration SQL..."
Invoke-Native -Description "Migration SQL safety gate" -Command {
    & node scripts/check-migration-safety.js apps/backend/prisma/migrations
}

# Recovery is a release precondition. The job uses a read-only database role
# and refuses wrong/empty targets. If it cannot create a fresh verified
# artifact, deployment stops before migrations.
Write-Host "==> Creating verified pre-migration database backup..."
Invoke-Native -Description "Pre-migration database backup" -Command {
    & $GCLOUD run jobs execute $BACKUP_JOB `
        --project=$PROJECT `
        --region=$REGION `
        --wait
}

# The slug verifier is an application query, so PrismaClient normally reads
# DATABASE_URL rather than the CLI-only directUrl. Point both variables at the
# exact migration target for this guarded block: the complete invariant check
# and `prisma migrate deploy` must never inspect different databases.
$hadDatabaseUrl = Test-Path Env:DATABASE_URL
$previousDatabaseUrl = $env:DATABASE_URL
$hadDirectUrl = Test-Path Env:DIRECT_URL
$previousDirectUrl = $env:DIRECT_URL
$env:DATABASE_URL = $effectiveDirectUrl
$env:DIRECT_URL = $effectiveDirectUrl

Write-Host "==> Applying database migrations..."
$migrationLocationPushed = $false
try {
    Push-Location (Join-Path $PSScriptRoot $SRC)
    $migrationLocationPushed = $true

    Write-Host "==> Verifying applied migration integrity before migration..."
    Invoke-Native -Description "Pre-migration integrity verification" -Command {
        & npx ts-node scripts/verify-preproduction-readonly.ts --allow-pending-migrations
    }

    # This guard is managed independently of Prisma so an accidental reset or
    # destructive raw migration is rejected by PostgreSQL itself. A missing,
    # disabled, or altered trigger is a deployment blocker.
    Write-Host "==> Verifying production database DDL-loss guard..."
    Invoke-Native -Description "Production DDL-loss guard verification" -Command {
        & npm run db:guard:verify
    }

    Write-Host "==> Verifying tenant slug invariants before migration..."
    Invoke-Native -Description "Slug invariant verification" -Command {
        & npm run slug:verify
    }

    Invoke-Native -Description "Database migration" -Command {
        & npm run migrate:deploy
    }

    Write-Host "==> Verifying migrated database..."
    Invoke-Native -Description "Post-migration verification" -Command {
        & npx ts-node scripts/verify-preproduction-readonly.ts
    }
} finally {
    if ($migrationLocationPushed) {
        Pop-Location
    }
    if ($hadDatabaseUrl) {
        $env:DATABASE_URL = $previousDatabaseUrl
    } else {
        Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
    }
    if ($hadDirectUrl) {
        $env:DIRECT_URL = $previousDirectUrl
    } else {
        Remove-Item Env:DIRECT_URL -ErrorAction SilentlyContinue
    }
}

# --- 3. Deploy with no traffic -- the new revision exists but serves nobody
Write-Host "==> Deploying new revision (no traffic yet)..."
# --update-secrets, never --set-secrets: the latter replaces the service's
# entire secret list, silently dropping every binding not named here. The same
# rule holds for --update-env-vars vs --set-env-vars.
#
# SENTRY_RELEASE is stamped here rather than baked into the image, so the
# release a Sentry event carries is the commit this revision was deployed from,
# and a regression can be attributed to the release that introduced it.
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
        --concurrency=$CONCURRENCY `
        --max-instances=$MAX_INSTANCES `
        --timeout=$REQUEST_TIMEOUT `
        --update-secrets=DIRECT_URL=DIRECT_URL:latest `
        --update-env-vars=SENTRY_RELEASE=$gitFullSha `
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
#
# Route to the revision by name and drop the tag in the same call.
#
# Shifting `--to-tags "$revisionTag=100"` used to leave the tag in place
# forever, and a tagged revision keeps its own public URL
# (https://<tag>---<service>-<hash>.run.app) regardless of its traffic share.
# Twenty deploys had accumulated twenty permanently reachable URLs, each still
# answering 200 and each serving whatever code that revision shipped -- so every
# security fix in this repo was bypassable by addressing an older revision
# directly. The traffic split does not gate a tag.
#
# The tag still earns its keep during the smoke check above; it just must not
# outlive it. One atomic update so traffic is never pointed at a tag that is
# being removed in the same breath.
Write-Host "==> Shifting 100% traffic to $newRevision and retiring the canary tag ..."
Invoke-Native -Description "Traffic shift ($previousRevision may still be serving -- verify with: gcloud run services describe $SERVICE --project=$PROJECT --region=$REGION --format='value(status.traffic)')" -Command {
    & $GCLOUD run services update-traffic $SERVICE `
        --project=$PROJECT --region=$REGION `
        --to-revisions "$newRevision=100" `
        --remove-tags $revisionTag
}

# Sweep any tag left behind by an earlier deploy that predates the cleanup
# above, so the exposure cannot silently rebuild.
$staleTagsJson = Invoke-Native -Description "Listing leftover revision tags" -Command {
    & $GCLOUD run services describe $SERVICE `
        --project=$PROJECT --region=$REGION --format=json
}
try {
    $staleTags = ($staleTagsJson | ConvertFrom-Json).status.traffic |
        Where-Object { $_.tag } |
        ForEach-Object { $_.tag }
    if ($staleTags) {
        Write-Host "==> Removing $($staleTags.Count) leftover tag(s) from earlier deploys ..."
        Invoke-Native -Description "Stale tag cleanup" -Command {
            & $GCLOUD run services update-traffic $SERVICE `
                --project=$PROJECT --region=$REGION `
                --remove-tags ($staleTags -join ',')
        }
    }
} catch {
    # Never fail a healthy deploy over cleanup; the tag exposure is reported
    # loudly enough to be handled on the next run.
    Write-Warning "Could not sweep leftover tags: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "==> Done. Now serving: $newRevision"
Write-Host "==> Service URL: https://$SERVICE-822584248302.$REGION.run.app"
Write-Host ""
Write-Host "Rollback to the previous revision if needed:"
Write-Host "  $GCLOUD run services update-traffic $SERVICE --project=$PROJECT --region=$REGION --to-revisions=$previousRevision=100"
