<#
.SYNOPSIS
  Removes every temporary environment variable set by the Phase 03C1A
  acceptance helper scripts, and clears the clipboard.

.DESCRIPTION
  Run this after a live acceptance run is complete (pass or fail) and after
  you have finished with the isolated Sheet/Apps Script project for this
  attempt. Safe to run even if some variables were never set.

  This does NOT delete the isolated Apps Script project, Sheet, or Web App
  deployment — those must still be revoked/deleted manually per
  docs/PHASE_03C1A_ACCEPTANCE_RUNBOOK.md §5. This only clears local session
  state.
#>

[CmdletBinding()]
param()

$variableNames = @(
  "PHASE03C1A_HMAC_ACTIVE_SECRET",
  "PHASE03C1A_SESSION_TOKEN_PEPPER",
  "PHASE03C1A_CSRF_TOKEN_PEPPER",
  "PHASE03C1A_KEY_ID",
  "PHASE03C1A_AUDIENCE",
  "PHASE03C1A_HMAC_KEYS_JSON",
  "PHASE_03C1A_CONFIRM_NON_PRODUCTION",
  "PHASE_03C1A_TARGET_URL",
  "PHASE_03C1A_INTERNAL_AUDIENCE",
  "PHASE_03C1A_HMAC_KEY_ID",
  "PHASE_03C1A_HMAC_SECRET",
  "PHASE_03C1A_TEST_USER_EMAIL",
  "PHASE_03C1A_TEST_USER_SUBJECT"
)

$cleared = @()
foreach ($name in $variableNames) {
  if (Test-Path "Env:$name") {
    Remove-Item "Env:$name"
    $cleared += $name
  }
}

try {
  Set-Clipboard -Value ""
} catch {
  # Clipboard access can fail in some remote/headless sessions; not fatal.
  Write-Host "Could not clear the clipboard automatically; clear it manually." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Cleared $($cleared.Count) temporary environment variable(s) from this session." -ForegroundColor Green
Write-Host "Clipboard cleared." -ForegroundColor Green
Write-Host ""
Write-Host "REMINDER — this script does NOT do the following; confirm you have:" -ForegroundColor Yellow
Write-Host "  [ ] Revoked/deleted the isolated Web App deployment" -ForegroundColor Yellow
Write-Host "  [ ] Deleted the isolated Apps Script project and Sheet" -ForegroundColor Yellow
Write-Host "  [ ] Confirmed no production resource was touched" -ForegroundColor Yellow
