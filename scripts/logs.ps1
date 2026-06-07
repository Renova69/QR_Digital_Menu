param(
  [ValidateSet('errors', 'payments', 'client', 'all')]
  [string]$Kind = 'errors',
  [int]$Limit = 80,
  [string]$Freshness = '7d',
  [string]$Project = 'qr-menu-app-469216',
  [string]$Service = 'qr-menu-backend',
  [switch]$Json
)

$gcloudCommand = Get-Command gcloud.cmd -ErrorAction SilentlyContinue
if (-not $gcloudCommand) {
  $gcloudCommand = Get-Command gcloud -ErrorAction SilentlyContinue
}
if (-not $gcloudCommand) {
  throw 'gcloud was not found on PATH. Install Google Cloud SDK or run from a shell where gcloud is available.'
}

$base = 'resource.type="cloud_run_revision" AND resource.labels.service_name="' + $Service + '"'
$filter = $base

switch ($Kind) {
  'errors' {
    $filter = $base + ' AND severity>=ERROR'
  }
  'payments' {
    $filter = $base + ' AND (jsonPayload.context="PaymentService" OR jsonPayload.context="ExceptionFilter" OR jsonPayload.message:"payment" OR jsonPayload.message:"BORICA" OR textPayload:"payment" OR textPayload:"BORICA")'
  }
  'client' {
    $filter = $base + ' AND (jsonPayload.context="ClientLog" OR textPayload:"ClientLog")'
  }
  'all' {
    $filter = $base
  }
}

$format = if ($Json) {
  'json'
} else {
  'table(timestamp,severity,jsonPayload.context,jsonPayload.message,jsonPayload.requestId,jsonPayload.path,textPayload)'
}

& $gcloudCommand.Source logging read $filter `
  --project $Project `
  --limit $Limit `
  --freshness $Freshness `
  --format $format
