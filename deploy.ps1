#!/usr/bin/env pwsh
# Deploy backend to Cloud Run.
# Usage: .\deploy.ps1
#
# Secrets live in Google Secret Manager — never pass them here.
# To update a secret value:
#   $utf8 = New-Object System.Text.UTF8Encoding $false
#   $tmp = [System.IO.Path]::GetTempFileName()
#   [System.IO.File]::WriteAllText($tmp, "NEW_VALUE", $utf8)
#   gcloud secrets versions add SECRET_NAME --data-file=$tmp --project=qr-menu-app-469216
#   Remove-Item $tmp
#
# To add a NEW plain env var (non-secret):
#   Use --update-env-vars, NOT --set-env-vars (which wipes everything).

$PROJECT  = "qr-menu-app-469216"
$SERVICE  = "qr-menu-backend"
$REGION   = "europe-west1"
$IMAGE    = "gcr.io/$PROJECT/$SERVICE`:latest"
$GCLOUD   = "C:\google-cloud-sdk\bin\gcloud.cmd"
$SRC      = "apps/backend"

Set-Location $PSScriptRoot

Write-Host "==> Building image..."
& $GCLOUD builds submit --project=$PROJECT --tag=$IMAGE $SRC
if ($LASTEXITCODE -ne 0) { Write-Error "Build failed"; exit 1 }

Write-Host "==> Deploying to Cloud Run..."
& $GCLOUD run deploy $SERVICE `
    --project=$PROJECT `
    --image=$IMAGE `
    --region=$REGION `
    --platform=managed `
    2>&1
if ($LASTEXITCODE -ne 0) { Write-Error "Deploy failed"; exit 1 }

Write-Host "==> Done. Service URL: https://$SERVICE-822584248302.$REGION.run.app"
