<#
.SYNOPSIS
  Validates the Phase 03C1A acceptance runner's configuration WITHOUT
  sending any HTTP request to the isolated deployment. Safe to run as many
  times as you like before committing to the live run.

.DESCRIPTION
  Requires Set-Phase03C1ARunnerEnv.ps1 to have already run in this session.
  Invokes `npm run acceptance:phase-03c1a:check`, which loads and validates
  configuration (non-production confirmation, URL suffix, secret shape,
  audience/key-id shape) and prints only a shape summary — never a secret
  value, never the target URL, never the test-user email.

.NOTES
  Run this from anywhere; it changes to the repository root itself.
#>

[CmdletBinding()]
param()

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")

if (-not $env:PHASE_03C1A_TARGET_URL) {
  throw "Run .\Set-Phase03C1ARunnerEnv.ps1 first in this same PowerShell session."
}

Write-Host "Validating Phase 03C1A acceptance configuration (no network calls)..." -ForegroundColor Cyan
Push-Location $repoRoot
try {
  npm run acceptance:phase-03c1a:check
  if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Configuration is valid. Ready to run the live suite with:" -ForegroundColor Green
    Write-Host "  npm run acceptance:phase-03c1a" -ForegroundColor Green
  } else {
    Write-Host ""
    Write-Host "Configuration is INVALID. See the message above and re-run the setup" -ForegroundColor Red
    Write-Host "scripts before attempting a live run." -ForegroundColor Red
  }
} finally {
  Pop-Location
}
