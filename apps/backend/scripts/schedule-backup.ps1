# schedule-backup.ps1 — Creates a daily Windows Task Scheduler job
# that runs db-backup.js at 8:00 AM every day.
#
# Run once (as Administrator):
#   powershell -ExecutionPolicy Bypass -File scripts/schedule-backup.ps1
#
# To remove:
#   Unregister-ScheduledTask -TaskName "QRMenu-DailyDBBackup" -Confirm:$false

$ErrorActionPreference = "Stop"

$taskName = "QRMenu-DailyDBBackup"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Resolve-Path "$scriptDir\.."
$backupScript = "$projectDir\scripts\db-backup.js"
$nodeExe = (Get-Command node).Source
$workingDir = $projectDir

# Build the action
$action = New-ScheduledTaskAction -Execute $nodeExe `
  -Argument "`"$backupScript`"" `
  -WorkingDirectory $workingDir

# Daily at 8:00 AM, start even if missed (e.g., PC was off)
$trigger = New-ScheduledTaskTrigger -Daily -At 8:00AM

# Settings: don't run indefinitely, allow on battery
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

# Register
try {
  Register-ScheduledTask -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "QR Digital Menu — Daily Supabase PostgreSQL backup" `
    -RunLevel Limited `
    -Force
  Write-Host "✅ Scheduled task '$taskName' created — runs daily at 8:00 AM."
  Write-Host "   Backup location: $projectDir\backups\"
  Write-Host ""
  Write-Host "   Test run now:"
  Write-Host "   Start-ScheduledTask -TaskName '$taskName'"
} catch {
  if ($_.Exception.Message -match "Access is denied") {
    Write-Host "❌ Access denied. Run this script as Administrator."
  } else {
    Write-Host "❌ Failed: $($_.Exception.Message)"
  }
}
