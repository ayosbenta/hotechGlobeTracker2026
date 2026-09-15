<#
.SYNOPSIS
  Runs the live Phase 03C1A acceptance suite and prints only the sanitized
  summary. Thin wrapper around `npm run acceptance:phase-03c1a`.

.DESCRIPTION
  Requires Set-Phase03C1ARunnerEnv.ps1 to have already run in this session,
  and (recommended) Test-Phase03C1AConfig.ps1 to have already passed.

  This makes real HTTP requests to the isolated Web App URL in
  $env:PHASE_03C1A_TARGET_URL. It does not touch production, does not
  deploy, commit, or push anything, and prints nothing beyond the runner's
  own sanitized JSON summary.
#>

[CmdletBinding()]
param()

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")

if (-not $env:PHASE_03C1A_TARGET_URL) {
  throw "Run .\Set-Phase03C1ARunnerEnv.ps1 first in this same PowerShell session."
}

Write-Host "Running the live Phase 03C1A acceptance suite against the configured" -ForegroundColor Cyan
Write-Host "isolated Web App URL. This makes real HTTP requests." -ForegroundColor Cyan
Write-Host ""

Push-Location $repoRoot
try {
  npm run acceptance:phase-03c1a
  $exitCode = $LASTEXITCODE
} finally {
  Pop-Location
}

Write-Host ""
if ($exitCode -eq 0) {
  Write-Host "All acceptance checks passed. Review the summary above, then run" -ForegroundColor Green
  Write-Host ".\Clear-Phase03C1ASession.ps1 and complete manual teardown (revoke the" -ForegroundColor Green
  Write-Host "deployment, delete the isolated project/Sheet) per the runbook." -ForegroundColor Green
} else {
  Write-Host "One or more acceptance checks FAILED. Review the summary above before" -ForegroundColor Red
  Write-Host "doing anything else. Do not mark Phase 03C1A Owner Approved." -ForegroundColor Red
}
