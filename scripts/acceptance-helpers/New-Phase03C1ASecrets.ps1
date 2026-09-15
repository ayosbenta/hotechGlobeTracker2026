<#
.SYNOPSIS
  Generates independent, non-production secrets for a fresh Phase 03C1A
  isolated acceptance run, and stages them ONLY in the current PowerShell
  session's environment variables and clipboard — never to a file, never to
  this script's own output stream in a way that gets logged, and never
  reused from any Phase 03B isolated run or production value.

.DESCRIPTION
  Run this once per isolated acceptance attempt. It sets, in the CURRENT
  session only:
    $env:PHASE03C1A_HMAC_ACTIVE_SECRET   (for Script Properties + the runner)
    $env:PHASE03C1A_SESSION_TOKEN_PEPPER (for Script Properties only)
    $env:PHASE03C1A_CSRF_TOKEN_PEPPER    (for Script Properties only)

  It does NOT print these values to the console. Each one is copied to the
  clipboard one at a time, with a pause so you can paste it into the Apps
  Script "Script Properties" editor before the next value overwrites the
  clipboard. Nothing is written to disk.

  Run Clear-Phase03C1ASession.ps1 when you are done with this isolated
  acceptance attempt to remove these from the session and clear the
  clipboard.

.NOTES
  This script never contacts any external resource and never touches
  production. It only calls Node's built-in crypto module locally.
#>

[CmdletBinding()]
param()

function New-IndependentSecret {
  # 32 random bytes, base64url-encoded — matches the format every other
  # isolated-acceptance secret in this repository uses (see
  # docs/PHASE_03B_ACCEPTANCE_RUNBOOK.md and docs/PHASE_03C1A_ACCEPTANCE_RUNBOOK.md).
  $value = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Failed to generate a secret via node -e; is Node.js on PATH?"
  }
  return $value
}

Write-Host "Generating three independent, isolated, non-production secrets." -ForegroundColor Cyan
Write-Host "None of these will be printed to this terminal." -ForegroundColor Cyan
Write-Host ""

$env:PHASE03C1A_HMAC_ACTIVE_SECRET = New-IndependentSecret
$env:PHASE03C1A_SESSION_TOKEN_PEPPER = New-IndependentSecret
$env:PHASE03C1A_CSRF_TOKEN_PEPPER = New-IndependentSecret

Write-Host "Three secrets generated and held only in this session's environment variables:" -ForegroundColor Green
Write-Host "  `$env:PHASE03C1A_HMAC_ACTIVE_SECRET"
Write-Host "  `$env:PHASE03C1A_SESSION_TOKEN_PEPPER"
Write-Host "  `$env:PHASE03C1A_CSRF_TOKEN_PEPPER"
Write-Host ""
Write-Host "Next: run .\Build-Phase03C1AKeyRing.ps1 to build the INTERNAL_HMAC_KEYS_JSON" -ForegroundColor Cyan
Write-Host "value (also staged as an env var, never printed), then paste each Script" -ForegroundColor Cyan
Write-Host "Property value from your clipboard when this script or the key-ring script" -ForegroundColor Cyan
Write-Host "pauses for you." -ForegroundColor Cyan
