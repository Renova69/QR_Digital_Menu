param(
    [string]$DeployScript = (Join-Path $PSScriptRoot '..\deploy.ps1')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
    (Resolve-Path $DeployScript),
    [ref]$tokens,
    [ref]$parseErrors
)
if ($parseErrors.Count -gt 0) {
    $parseErrors | ForEach-Object { Write-Error $_.Message }
    throw "$DeployScript contains PowerShell parse errors"
}

$cleanupTryBlocks = @($ast.FindAll({
    param($node)

    if ($node -isnot [System.Management.Automation.Language.TryStatementAst]) {
        return $false
    }

    $body = $node.Body.Extent.Text
    return $body.Contains('Listing leftover revision tags') -and
        $body.Contains('Stale tag cleanup')
}, $true))

if ($cleanupTryBlocks.Count -ne 1) {
    throw 'The complete stale-tag sweep must be contained in one recoverable try block.'
}

$cleanupCommands = @($cleanupTryBlocks[0].Body.FindAll({
    param($node)
    $node -is [System.Management.Automation.Language.CommandAst]
}, $true))
$cleanupCommandNames = @($cleanupCommands | ForEach-Object { $_.GetCommandName() })

if ($cleanupCommandNames -contains 'Invoke-Native') {
    throw 'Optional stale-tag cleanup must not use the process-terminating Invoke-Native helper.'
}

$recoverableCalls = @($cleanupCommandNames | Where-Object { $_ -eq 'Invoke-NativeOrThrow' })
if ($recoverableCalls.Count -ne 2) {
    throw 'Both stale-tag listing and removal must use Invoke-NativeOrThrow.'
}

$cleanupCatch = $cleanupTryBlocks[0].CatchClauses.Extent.Text
if ($cleanupCatch -notmatch '\bWrite-Warning\b' -or $cleanupCatch -match '\bexit\b') {
    throw 'The stale-tag cleanup handler must warn and continue rather than exit.'
}

$helper = $ast.Find({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
        $node.Name -eq 'Invoke-NativeOrThrow'
}, $true)
if (-not $helper) {
    throw 'Invoke-NativeOrThrow is missing from deploy.ps1.'
}

Invoke-Expression $helper.Extent.Text

$caughtMessage = $null
try {
    Invoke-NativeOrThrow -Description 'Optional cleanup fixture' -Command {
        & node -e 'process.exit(19)'
    }
    throw 'Invoke-NativeOrThrow did not report the native command failure.'
} catch {
    $caughtMessage = $_.Exception.Message
}

if ($caughtMessage -notmatch 'Optional cleanup fixture' -or $caughtMessage -notmatch '19') {
    throw "Invoke-NativeOrThrow did not surface the expected recoverable failure: $caughtMessage"
}

# GitHub's pwsh runner propagates the last native process exit code after the
# script returns. The exit 19 above is the fixture under test, not this test's
# result, so clear the automatic variable once its value has been asserted.
$global:LASTEXITCODE = 0

Write-Host 'Deploy optional-cleanup failure handling checks passed.'
