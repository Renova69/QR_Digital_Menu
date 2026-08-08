<#
.SYNOPSIS
  Provision Sentry alert rules for qr-menu-backend and qr-menu-frontend.

.DESCRIPTION
  The Sentry MCP server is read-only for alert rules (find_alert_rules /
  get_alert_rule only), so the rules are created through the REST API here
  instead. Keeping them in this script means the alerting config is
  version-controlled and re-creatable rather than hand-clicked in the UI.

  Idempotent: existing rules are matched by name and skipped, so re-running
  after adding a new rule below only creates the missing one.

  The two uptime monitors (Backend API health, Public menu) are NOT created
  here -- those were provisioned over MCP and live in Sentry already.

.PARAMETER Token
  A Sentry *User* Auth Token (sntryu_...) with scopes:
    alerts:write, project:write, org:read, project:read
  Create at https://sentry.io/settings/account/api/auth-tokens/

  An Organization token (sntrys_...) will NOT work -- org tokens have a fixed
  scope set that excludes alerts:write.

  Falls back to $env:SENTRY_AUTH_TOKEN when omitted.

.PARAMETER DryRun
  Print the payloads that would be POSTed, then exit without writing.

.EXAMPLE
  .\scripts\sentry-alerts.ps1 -Token 'sntryu_xxx' -DryRun
  .\scripts\sentry-alerts.ps1 -Token 'sntryu_xxx'
#>
[CmdletBinding()]
param(
  [string]$Token,
  [switch]$DryRun
)

# ─── TEMPORARY TOKEN SLOT ────────────────────────────────────────────────────
# Paste a User auth token (sntryu_...) between the quotes, run the script, then
# CLEAR IT AGAIN.
#
# Why this slot exists: `$env:SENTRY_AUTH_TOKEN = '...'` sets the variable only
# inside the shell process you typed it in. Any separate process gets its own
# environment block and never sees it.
#
# !! THIS FILE IS TRACKED BY GIT !!
# A token left here and committed is published in history permanently, and
# scrubbing it afterwards needs a history rewrite. Clear it as soon as the run
# succeeds, and never `git add` this file while it is populated.
#
# Safer alternative: leave this blank and put the token in scripts/.sentry-token
# instead. That path is gitignored and is picked up automatically below.
$InlineToken = ''
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = 'Stop'
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

# --- Constants -------------------------------------------------------------
# Org lives in Sentry's EU region, so the API host is de.sentry.io, not
# sentry.io. Using the wrong host returns 404 on every org-scoped route.
$ApiBase  = 'https://de.sentry.io/api/0'
$Org      = 'renova-design'
$Backend  = 'qr-menu-backend'
$Frontend = 'qr-menu-frontend'
$UserId   = '4854077'          # Kiril Petrov -- email notification target
$EnvName  = 'production'       # matches Sentry.init({ environment }) in both apps

# Resolution order: explicit -Token, then the inline slot, then the gitignored
# token file, then the environment.
$script:UsedInlineToken = $false
if ([string]::IsNullOrWhiteSpace($Token) -and $InlineToken) {
  $Token = $InlineToken.Trim()
  $script:UsedInlineToken = $true
}
if ([string]::IsNullOrWhiteSpace($Token)) {
  $tokenFile = Join-Path $PSScriptRoot '.sentry-token'
  if (Test-Path $tokenFile) {
    $Token = (Get-Content $tokenFile -Raw).Trim()
  }
}
if ([string]::IsNullOrWhiteSpace($Token)) {
  $Token = $env:SENTRY_AUTH_TOKEN
}

if ([string]::IsNullOrWhiteSpace($Token)) {
  throw @"
No token.

Provide one of:
  1. Paste it into the `$InlineToken slot near the top of this file (clear it after).
  2. Put it in scripts/.sentry-token  (gitignored - preferred).
  3. Pass -Token 'sntryu_...'.

Create the token at https://sentry.io/settings/account/api/auth-tokens/
with scopes: alerts:write, project:write, org:read, project:read
"@
}
if ($Token.StartsWith('sntrys_')) {
  throw "That is an Organization token. Alert rules need a User token (sntryu_...) with alerts:write."
}

$Headers = @{
  Authorization  = "Bearer $Token"
  'Content-Type' = 'application/json'
}

# Email action shapes differ between the two APIs.
$IssueEmailAction = @{
  id               = 'sentry.mail.actions.NotifyEmailAction'
  targetType       = 'Member'
  targetIdentifier = [int]$UserId
}
$MetricEmailAction = @{
  type             = 'email'
  targetType       = 'user'
  targetIdentifier = $UserId
}

# --- Helpers ---------------------------------------------------------------
function Invoke-SentryApi {
  param([string]$Method, [string]$Path, $Body)
  $uri = "$ApiBase$Path"
  if ($null -eq $Body) {
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $Headers
  }
  $json = $Body | ConvertTo-Json -Depth 12 -Compress
  return Invoke-RestMethod -Method $Method -Uri $uri -Headers $Headers -Body $json
}

function Get-ApiError {
  param($ErrorRecord)
  # PS 5.1 puts the response body in ErrorDetails.Message; fall back to the
  # raw stream when it does not.
  if ($ErrorRecord.ErrorDetails -and $ErrorRecord.ErrorDetails.Message) {
    return $ErrorRecord.ErrorDetails.Message
  }
  return $ErrorRecord.Exception.Message
}

$script:Created = 0
$script:Skipped = 0
$script:Failed  = 0

function New-IssueRule {
  param([string]$ProjectSlug, [hashtable]$Rule)

  $name = $Rule.name
  try {
    $existing = Invoke-SentryApi -Method GET -Path "/projects/$Org/$ProjectSlug/rules/"
  } catch {
    Write-Host "  [FAIL] $name -- could not list existing rules: $(Get-ApiError $_)" -ForegroundColor Red
    $script:Failed++
    return
  }

  if ($existing | Where-Object { $_.name -eq $name }) {
    Write-Host "  [skip] $name (already exists)" -ForegroundColor DarkGray
    $script:Skipped++
    return
  }

  if ($DryRun) {
    Write-Host "  [dry ] $ProjectSlug <- $name" -ForegroundColor Yellow
    Write-Host ($Rule | ConvertTo-Json -Depth 12)
    return
  }

  try {
    $res = Invoke-SentryApi -Method POST -Path "/projects/$Org/$ProjectSlug/rules/" -Body $Rule
    Write-Host "  [ OK ] $name (id $($res.id))" -ForegroundColor Green
    $script:Created++
  } catch {
    Write-Host "  [FAIL] $name -- $(Get-ApiError $_)" -ForegroundColor Red
    $script:Failed++
  }
}

function New-MetricRule {
  param([hashtable]$Rule)

  $name = $Rule.name
  try {
    $existing = Invoke-SentryApi -Method GET -Path "/organizations/$Org/alert-rules/"
  } catch {
    Write-Host "  [FAIL] $name -- could not list existing rules: $(Get-ApiError $_)" -ForegroundColor Red
    $script:Failed++
    return
  }

  if ($existing | Where-Object { $_.name -eq $name }) {
    Write-Host "  [skip] $name (already exists)" -ForegroundColor DarkGray
    $script:Skipped++
    return
  }

  if ($DryRun) {
    Write-Host "  [dry ] metric <- $name" -ForegroundColor Yellow
    Write-Host ($Rule | ConvertTo-Json -Depth 12)
    return
  }

  try {
    $res = Invoke-SentryApi -Method POST -Path "/organizations/$Org/alert-rules/" -Body $Rule
    Write-Host "  [ OK ] $name (id $($res.id))" -ForegroundColor Green
    $script:Created++
  } catch {
    Write-Host "  [FAIL] $name -- $(Get-ApiError $_)" -ForegroundColor Red
    $script:Failed++
  }
}

# --- Issue alert rules -----------------------------------------------------
Write-Host "`n== Issue alerts: $Backend ==" -ForegroundColor Cyan

# 1. Every new backend issue. Baseline is ~3 errors/7d, so per-issue paging is
#    not noisy at this volume. Raise the frequency window if that changes.
New-IssueRule -ProjectSlug $Backend -Rule @{
  name        = 'Backend: new issue in production'
  environment = $EnvName
  actionMatch = 'any'
  filterMatch = 'all'
  frequency   = 30            # minutes before the same rule re-notifies
  owner       = "user:$UserId"
  conditions  = @(
    @{ id = 'sentry.rules.conditions.first_seen_event.FirstSeenEventCondition' },
    @{ id = 'sentry.rules.conditions.regression_event.RegressionEventCondition' }
  )
  filters     = @()
  actions     = @($IssueEmailAction)
}

# 2. Money path. Fires on a brand-new issue OR an existing one re-firing, so a
#    known-but-unresolved payment bug that starts spiking still pages.
New-IssueRule -ProjectSlug $Backend -Rule @{
  name        = 'Backend: payment / order path error'
  environment = $EnvName
  actionMatch = 'any'
  filterMatch = 'any'
  frequency   = 5
  owner       = "user:$UserId"
  conditions  = @(
    @{ id = 'sentry.rules.conditions.first_seen_event.FirstSeenEventCondition' },
    @{
      id       = 'sentry.rules.conditions.event_frequency.EventFrequencyCondition'
      value    = 5
      interval = '1h'
    }
  )
  # `transaction` is NOT a valid EventAttributeFilter attribute -- that filter
  # accepts only a fixed enum (message, platform, type, exception.type,
  # exception.value, user.*, http.*, sdk.name, stacktrace.*, os.*). Transaction
  # is exposed as a tag instead, so it has to go through TaggedEventFilter,
  # which keys off `key` rather than `attribute`.
  filters     = @(
    @{ id = 'sentry.rules.filters.tagged_event.TaggedEventFilter'; key = 'transaction'; match = 'co'; value = 'payment' },
    @{ id = 'sentry.rules.filters.tagged_event.TaggedEventFilter'; key = 'transaction'; match = 'co'; value = 'orders' },
    @{ id = 'sentry.rules.filters.tagged_event.TaggedEventFilter'; key = 'transaction'; match = 'co'; value = 'webhook' }
  )
  actions     = @($IssueEmailAction)
}

Write-Host "`n== Issue alerts: $Frontend ==" -ForegroundColor Cyan

# 3. Every new frontend issue -- this is the white-screen tripwire.
New-IssueRule -ProjectSlug $Frontend -Rule @{
  name        = 'Frontend: new issue in production'
  environment = $EnvName
  actionMatch = 'any'
  filterMatch = 'all'
  frequency   = 30
  owner       = "user:$UserId"
  conditions  = @(
    @{ id = 'sentry.rules.conditions.first_seen_event.FirstSeenEventCondition' },
    @{ id = 'sentry.rules.conditions.regression_event.RegressionEventCondition' }
  )
  filters     = @()
  actions     = @($IssueEmailAction)
}

# 4. Stale-chunk / chunk-cycle regressions. This project has shipped this bug
#    twice (prod white screen from a React/vendor chunk cycle, and 404s on old
#    lazy chunks for tabs open across a deploy), so it gets its own rule with a
#    tighter re-notify window than the catch-all above.
New-IssueRule -ProjectSlug $Frontend -Rule @{
  name        = 'Frontend: chunk load failure (stale deploy)'
  environment = $EnvName
  actionMatch = 'any'
  filterMatch = 'any'
  frequency   = 5
  owner       = "user:$UserId"
  conditions  = @(
    @{ id = 'sentry.rules.conditions.first_seen_event.FirstSeenEventCondition' },
    @{
      id       = 'sentry.rules.conditions.event_frequency.EventFrequencyCondition'
      value    = 3
      interval = '1h'
    }
  )
  # EventAttributeFilter names these `exception.type` / `exception.value`.
  # `error.type` / `error.value` are Discover/search field names and are
  # rejected here ("not one of the available choices").
  filters     = @(
    @{ id = 'sentry.rules.filters.event_attribute.EventAttributeFilter'; attribute = 'exception.type';  match = 'co'; value = 'ChunkLoadError' },
    @{ id = 'sentry.rules.filters.event_attribute.EventAttributeFilter'; attribute = 'exception.value'; match = 'co'; value = 'dynamically imported module' },
    @{ id = 'sentry.rules.filters.event_attribute.EventAttributeFilter'; attribute = 'exception.value'; match = 'co'; value = 'Loading chunk' }
  )
  actions     = @($IssueEmailAction)
}

# --- Metric alert rules ----------------------------------------------------
Write-Host "`n== Metric alerts ==" -ForegroundColor Cyan

# 5. Aggregate error spike -- catches a bad deploy that breaks many endpoints
#    at once, which per-issue rules would report as scattered singletons.
New-MetricRule -Rule @{
  name             = 'Backend: error spike'
  projects         = @($Backend)
  environment      = $EnvName
  dataset          = 'events'
  eventTypes       = @('error')
  query            = ''
  aggregate        = 'count()'
  timeWindow       = 5                 # minutes
  thresholdType    = 0                 # 0 = alert when ABOVE threshold
  resolveThreshold = $null
  owner            = "user:$UserId"
  triggers         = @(
    @{ label = 'critical'; alertThreshold = 10; actions = @($MetricEmailAction) }
  )
}

# 6. Latency. Neon runs behind PgBouncer in transaction mode; pool exhaustion
#    and cold starts surface here as a p95 climb long before they surface as
#    errors, so this is the early-warning rule.
#
#    Sentry has disabled creation of transaction-dataset alerts while migrating
#    to spans ("Creation of transaction-based alerts is disabled"). The
#    replacement is the analytics/span dataset filtered to transaction-like
#    spans, measuring span.duration instead of transaction.duration. No
#    eventTypes key -- that field belongs to the old error/transaction datasets
#    and this dataset rejects it.
#
#    span.op:http.server is load-bearing. A bare `is_transaction:true` also
#    matches Prisma's own root spans (prisma:client:operation,
#    prisma:client:transaction), which are emitted by the background crons with
#    no HTTP request behind them. Those ran 10-28s during the 2026-08-07 pool
#    contention and dominated the percentile, so the rule fired on cron DB time
#    (6.2s evaluated) while the only real endpoint in the window served in 55ms.
#    Keep this scoped to server requests -- cron health belongs in the error
#    rules, not in a user-facing latency SLO.
New-MetricRule -Rule @{
  name             = 'Backend: p95 latency > 3s'
  projects         = @($Backend)
  environment      = $EnvName
  dataset          = 'events_analytics_platform'
  query            = 'is_transaction:true span.op:http.server'
  aggregate        = 'p95(span.duration)'
  timeWindow       = 10                # minutes
  thresholdType    = 0
  resolveThreshold = $null
  owner            = "user:$UserId"
  triggers         = @(
    @{ label = 'critical'; alertThreshold = 3000; actions = @($MetricEmailAction) }   # ms
  )
}

# --- Summary ---------------------------------------------------------------
Write-Host ''
if ($DryRun) {
  Write-Host 'Dry run -- nothing was written to Sentry.' -ForegroundColor Yellow
} else {
  Write-Host "created=$script:Created  skipped=$script:Skipped  failed=$script:Failed" -ForegroundColor Cyan
  Write-Host 'Review at https://renova-design.sentry.io/alerts/rules/'
}

if ($script:UsedInlineToken) {
  Write-Host ''
  Write-Host '  !! Your token is still pasted in this file.' -ForegroundColor Red
  Write-Host '     Clear $InlineToken now - this file is tracked by git and a' -ForegroundColor Red
  Write-Host '     committed token cannot be removed without rewriting history.' -ForegroundColor Red
}

if ($script:Failed -gt 0) { exit 1 }
