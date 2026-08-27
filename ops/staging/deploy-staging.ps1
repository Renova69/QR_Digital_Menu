#!/usr/bin/env pwsh
# Deploy the exact merged main commit to the isolated staging backend.
# This script never copies production data and contains no destructive
# database-management path. See ops/staging/README.md.

$ErrorActionPreference = "Stop"
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

$PROJECT = "qr-menu-app-469216"
$SERVICE = "qr-menu-backend-staging"
$PRODUCTION_SERVICE = "qr-menu-backend"
$REGION = "europe-west1"
$GCLOUD = "C:\google-cloud-sdk\bin\gcloud.cmd"
$SRC = "apps/backend"
$GITHUB_REPOSITORY = "Renova69/QR_Digital_Menu"
$REQUIRED_BRANCH = "main"
$REQUIRED_CHECK = "verify"
$GITHUB_API_VERSION = "2026-03-10"
$CONCURRENCY = 10
$MAX_INSTANCES = 1
$REQUEST_TIMEOUT = 30
$SMOKE_RETRIES = 10
$SMOKE_DELAY_SECONDS = 3

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $repoRoot

function Invoke-Native {
    param(
        [Parameter(Mandatory)][string]$Description,
        [Parameter(Mandatory)][scriptblock]$Command
    )

    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
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

function Read-GcpSecret {
    param(
        [Parameter(Mandatory)][string]$Name,
        [string]$Version = "latest"
    )

    $value = (Invoke-Native -Description "Reading required secret $Name" -Command {
        & $GCLOUD secrets versions access $Version `
            --secret=$Name `
            --project=$PROJECT
    } | Out-String).Trim()
    if (-not $value) {
        Write-Error "Secret $Name has no readable value."
        exit 1
    }
    return $value
}

function Read-ServiceEnvironmentValue {
    param(
        [Parameter(Mandatory)]$ServiceDocument,
        [Parameter(Mandatory)][string]$Name
    )

    $entry = @($ServiceDocument.spec.template.spec.containers[0].env) |
        Where-Object { $_.name -eq $Name } |
        Select-Object -First 1
    if (-not $entry) {
        Write-Error "$PRODUCTION_SERVICE does not define required environment value $Name."
        exit 1
    }
    if ($null -ne $entry.value) {
        return [string]$entry.value
    }

    $secretRef = $entry.valueFrom.secretKeyRef
    if (-not $secretRef -or -not $secretRef.name) {
        Write-Error "$PRODUCTION_SERVICE has an unsupported binding for $Name."
        exit 1
    }
    $secretName = ([string]$secretRef.name -split "/")[-1]
    $secretVersion = if ($secretRef.key) { [string]$secretRef.key } else { "latest" }
    return Read-GcpSecret -Name $secretName -Version $secretVersion
}

# The staging proof is meaningful only when it represents the exact clean,
# merged commit production would deploy.
$gitBranch = (Invoke-Native -Description "Reading current git branch" -Command {
    & git branch --show-current
} | Out-String).Trim()
if ($gitBranch -ne $REQUIRED_BRANCH) {
    Write-Error "Current branch is '$gitBranch'; staging deploys are allowed only from '$REQUIRED_BRANCH'."
    exit 1
}

$gitStatus = Invoke-Native -Description "Reading git working tree status" -Command {
    & git status --porcelain --untracked-files=all
}
if ($gitStatus) {
    Write-Error "Working tree is not clean -- refusing to create staging proof for uncommitted source."
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
    Write-Error "HEAD does not match origin/$REQUIRED_BRANCH -- refusing stale or unmerged source."
    exit 1
}

Write-Host "==> Verifying GitHub Actions '$REQUIRED_CHECK' for $gitFullSha..."
$githubHeaders = @{
    Accept = "application/vnd.github+json"
    "User-Agent" = "QR-Digital-Menu-staging-preflight"
    "X-GitHub-Api-Version" = $GITHUB_API_VERSION
}
if ($env:GITHUB_TOKEN) {
    $githubHeaders.Authorization = "Bearer $($env:GITHUB_TOKEN)"
}
$checkRunsUrl = "https://api.github.com/repos/$GITHUB_REPOSITORY/commits/$gitFullSha/check-runs?check_name=$REQUIRED_CHECK&filter=latest&per_page=100"
try {
    $checkRunsResponse = Invoke-RestMethod -Method Get -Uri $checkRunsUrl -Headers $githubHeaders
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
    Write-Error "Required GitHub Actions check '$REQUIRED_CHECK' is not successful for $gitFullSha."
    exit 1
}

# Load staging credentials directly from Secret Manager, then compare them to
# the production service's effective bindings. Values stay in this process and
# are never written or printed.
Write-Host "==> Verifying staging database and credential isolation..."
$productionJson = Invoke-Native -Description "Reading production service bindings" -Command {
    & $GCLOUD run services describe $PRODUCTION_SERVICE `
        --project=$PROJECT `
        --region=$REGION `
        --format=json
}
$productionService = ($productionJson | Out-String | ConvertFrom-Json)

$stagingDatabaseUrl = Read-GcpSecret -Name "STAGING_DATABASE_URL"
$stagingDirectUrl = Read-GcpSecret -Name "STAGING_DIRECT_URL"
$env:STAGING_DATABASE_URL = $stagingDatabaseUrl
$env:STAGING_DIRECT_URL = $stagingDirectUrl
$env:STAGING_JWT_SECRET = Read-GcpSecret -Name "STAGING_JWT_SECRET"
$env:STAGING_REDIS_URL = Read-GcpSecret -Name "STAGING_REDIS_URL"
$env:STAGING_STRIPE_SECRET_KEY = Read-GcpSecret -Name "STAGING_STRIPE_SECRET_KEY"
$env:STAGING_STRIPE_WEBHOOK_SECRET = Read-GcpSecret -Name "STAGING_STRIPE_WEBHOOK_SECRET"
$env:STAGING_STRIPE_SUBSCRIPTION_WEBHOOK_SECRET = Read-GcpSecret -Name "STAGING_STRIPE_SUBSCRIPTION_WEBHOOK_SECRET"
$env:STAGING_FRONTEND_URL = Read-GcpSecret -Name "STAGING_FRONTEND_URL"
$null = Read-GcpSecret -Name "STAGING_SENTRY_DSN"

$env:PRODUCTION_JWT_SECRET = Read-ServiceEnvironmentValue $productionService "JWT_SECRET"
$env:PRODUCTION_REDIS_URL = Read-ServiceEnvironmentValue $productionService "REDIS_URL"
$env:PRODUCTION_STRIPE_SECRET_KEY = Read-ServiceEnvironmentValue $productionService "STRIPE_SECRET_KEY"
$env:PRODUCTION_STRIPE_WEBHOOK_SECRET = Read-ServiceEnvironmentValue $productionService "STRIPE_WEBHOOK_SECRET"
$env:PRODUCTION_STRIPE_SUBSCRIPTION_WEBHOOK_SECRET = Read-ServiceEnvironmentValue $productionService "STRIPE_SUBSCRIPTION_WEBHOOK_SECRET"
$env:PRODUCTION_FRONTEND_URL = Read-ServiceEnvironmentValue $productionService "FRONTEND_URL"

Invoke-Native -Description "Staging Supabase target validation" -Command {
    & node ops/staging/staging-policy.js target
}
Invoke-Native -Description "Staging runtime isolation validation" -Command {
    & node ops/staging/staging-policy.js runtime
}

foreach ($name in @(
    "STAGING_JWT_SECRET",
    "STAGING_REDIS_URL",
    "STAGING_STRIPE_SECRET_KEY",
    "STAGING_STRIPE_WEBHOOK_SECRET",
    "STAGING_STRIPE_SUBSCRIPTION_WEBHOOK_SECRET",
    "STAGING_FRONTEND_URL",
    "PRODUCTION_JWT_SECRET",
    "PRODUCTION_REDIS_URL",
    "PRODUCTION_STRIPE_SECRET_KEY",
    "PRODUCTION_STRIPE_WEBHOOK_SECRET",
    "PRODUCTION_STRIPE_SUBSCRIPTION_WEBHOOK_SECRET",
    "PRODUCTION_FRONTEND_URL"
)) {
    Remove-Item "Env:$name" -ErrorAction SilentlyContinue
}

$migrationDigest = (Invoke-Native -Description "Computing migration digest" -Command {
    & node ops/staging/staging-policy.js digest apps/backend/prisma/migrations
} | Out-String).Trim()
$gitSha = $gitFullSha.Substring(0, 12)
$IMAGE = "gcr.io/$PROJECT/$SERVICE`:sha-$gitSha"
$revisionTag = "rev-$gitSha"

Write-Host "==> Building staging image $IMAGE ..."
Invoke-Native -Description "Staging build" -Command {
    & $GCLOUD builds submit --project=$PROJECT --tag=$IMAGE $SRC
}
$imageDigest = (Invoke-Native -Description "Resolving immutable staging image digest" -Command {
    & $GCLOUD container images describe $IMAGE `
        --project=$PROJECT `
        --format="value(image_summary.digest)"
} | Out-String).Trim()
if ($imageDigest -notmatch '^sha256:[0-9a-f]{64}$') {
    Write-Error "Cloud Build did not return a valid immutable image digest."
    exit 1
}

Write-Host "==> Rejecting destructive migration SQL..."
Invoke-Native -Description "Migration SQL safety gate" -Command {
    & node scripts/check-migration-safety.js apps/backend/prisma/migrations
}

# The staging URLs were already proven to identify a non-production Supabase
# project. This block is forward-only: it applies reviewed migrations and then
# verifies the resulting schema. A first-time empty staging project cannot run
# the application-table verifier before migrations because those tables do not
# exist yet.
$hadDatabaseUrl = Test-Path Env:DATABASE_URL
$previousDatabaseUrl = $env:DATABASE_URL
$hadDirectUrl = Test-Path Env:DIRECT_URL
$previousDirectUrl = $env:DIRECT_URL
$env:DATABASE_URL = $stagingDatabaseUrl
$env:DIRECT_URL = $stagingDirectUrl
$migrationLocationPushed = $false
try {
    Push-Location (Join-Path $repoRoot $SRC)
    $migrationLocationPushed = $true

    Write-Host "==> Applying forward-only migrations to isolated staging..."
    Invoke-Native -Description "Staging database migration" -Command {
        & npm run migrate:deploy
    }

    Write-Host "==> Verifying staging migration integrity and data blockers..."
    Invoke-Native -Description "Staging post-migration verification" -Command {
        & npx ts-node scripts/verify-preproduction-readonly.ts
    }
    Invoke-Native -Description "Staging slug invariant verification" -Command {
        & npm run slug:verify
    }
    Invoke-Native -Description "Staging schema parity verification" -Command {
        & npx prisma migrate diff `
            --from-schema-datasource=prisma/schema.prisma `
            --to-schema-datamodel=prisma/schema.prisma `
            --exit-code
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
    Remove-Item Env:STAGING_DATABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:STAGING_DIRECT_URL -ErrorAction SilentlyContinue
}

Write-Host "==> Reading current staging traffic..."
$previousRevision = $null
$serviceExists = $true
$previousPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
    $currentTrafficJson = & $GCLOUD run services describe $SERVICE `
        --project=$PROJECT `
        --region=$REGION `
        --format="json(status.traffic)" 2>$null
    if ($LASTEXITCODE -ne 0) {
        $serviceExists = $false
    }
} finally {
    $ErrorActionPreference = $previousPreference
}
if ($serviceExists) {
    $currentTraffic = ($currentTrafficJson | Out-String | ConvertFrom-Json).status.traffic
    $previousRevision = ($currentTraffic | Where-Object { $_.percent -gt 0 } | Select-Object -First 1).revisionName
}

# This is an exact declarative staging configuration. --set-secrets is
# intentional here: it removes any accidentally inherited production
# integration credentials. No Resend, Twilio, R2, DeepL, Google OAuth, VAPID,
# or live payment-provider secrets are bound to staging.
$secretBindings = @(
    "DATABASE_URL=STAGING_DATABASE_URL:latest",
    "DIRECT_URL=STAGING_DIRECT_URL:latest",
    "JWT_SECRET=STAGING_JWT_SECRET:latest",
    "REDIS_URL=STAGING_REDIS_URL:latest",
    "STRIPE_SECRET_KEY=STAGING_STRIPE_SECRET_KEY:latest",
    "STRIPE_WEBHOOK_SECRET=STAGING_STRIPE_WEBHOOK_SECRET:latest",
    "STRIPE_SUBSCRIPTION_WEBHOOK_SECRET=STAGING_STRIPE_SUBSCRIPTION_WEBHOOK_SECRET:latest",
    "FRONTEND_URL=STAGING_FRONTEND_URL:latest",
    "SENTRY_DSN=STAGING_SENTRY_DSN:latest"
) -join ","
$plainEnvironment = @(
    "NODE_ENV=production",
    "REQUIRE_PRODUCTION_NODE_ENV=true",
    "DEPLOYMENT_ENV=staging",
    "SENTRY_ENVIRONMENT=staging",
    "SENTRY_RELEASE=$gitFullSha",
    "STAGING_VALIDATED_SHA=$gitFullSha",
    "STAGING_MIGRATION_DIGEST=$migrationDigest",
    "STAGING_IMAGE_DIGEST=$imageDigest",
    "COOKIE_SAMESITE=none",
    "TRANSLATION_ENABLED=false"
) -join ","

Write-Host "==> Deploying isolated staging revision..."
Invoke-Native -Description "Staging deploy" -Command {
    & $GCLOUD run deploy $SERVICE `
        --project=$PROJECT `
        --image=$IMAGE `
        --region=$REGION `
        --platform=managed `
        --allow-unauthenticated `
        --session-affinity `
        --no-traffic `
        --concurrency=$CONCURRENCY `
        --max-instances=$MAX_INSTANCES `
        --timeout=$REQUEST_TIMEOUT `
        --set-secrets=$secretBindings `
        --set-env-vars=$plainEnvironment `
        --tag=$revisionTag
}

$canaryUrlJson = Invoke-Native -Description "Resolving staging canary URL" -Command {
    & $GCLOUD run services describe $SERVICE `
        --project=$PROJECT `
        --region=$REGION `
        --format="json(status.traffic)"
}
$canaryTraffic = ($canaryUrlJson | Out-String | ConvertFrom-Json).status.traffic
$canaryEntry = $canaryTraffic | Where-Object { $_.tag -eq $revisionTag } | Select-Object -First 1
if (-not $canaryEntry -or -not $canaryEntry.url) {
    Write-Error "Could not resolve the staging canary URL; no traffic was intentionally shifted."
    exit 1
}
$canaryUrl = $canaryEntry.url
$newRevision = $canaryEntry.revisionName

Write-Host "==> Smoke-testing staging health and database readiness..."
$healthy = $false
for ($i = 1; $i -le $SMOKE_RETRIES; $i++) {
    try {
        $health = Invoke-WebRequest -Uri "$canaryUrl/api/v1/health" -UseBasicParsing -TimeoutSec 10
        $ready = Invoke-RestMethod -Uri "$canaryUrl/api/v1/health/ready" -TimeoutSec 10
        if (
            $health.StatusCode -eq 200 -and
            $ready.status -eq "ok" -and
            $ready.checks.database.status -eq "ok"
        ) {
            $healthy = $true
            break
        }
        Write-Host "    attempt $i/$SMOKE_RETRIES : readiness did not report database ok"
    } catch {
        Write-Host "    attempt $i/$SMOKE_RETRIES : $($_.Exception.Message)"
    }
    Start-Sleep -Seconds $SMOKE_DELAY_SECONDS
}
if (-not $healthy) {
    $fallback = if ($previousRevision) { $previousRevision } else { "no previous staging revision" }
    Write-Error "Staging smoke check failed. Production remains untouched; staging fallback is $fallback."
    exit 1
}

Write-Host "==> Promoting $newRevision to 100% staging traffic and removing its canary tag..."
Invoke-Native -Description "Staging traffic shift" -Command {
    & $GCLOUD run services update-traffic $SERVICE `
        --project=$PROJECT `
        --region=$REGION `
        --to-revisions "$newRevision=100" `
        --remove-tags $revisionTag
}

Write-Host ""
Write-Host "==> Isolated staging proof recorded for $gitFullSha"
Write-Host "==> Production deploy is now eligible for this exact commit and migration set."
