<#
.SYNOPSIS
  Loads the environment variables the Phase 03C1A acceptance runner
  (npm run acceptance:phase-03c1a) reads, into the CURRENT PowerShell session
  only. Prompts securely (no console echo) for the two values only you know:
  the deployment URL and the seeded test user's email.

.DESCRIPTION
  Requires New-Phase03C1ASecrets.ps1 and Build-Phase03C1AKeyRing.ps1 to have
  already run in this same session (it reuses the HMAC key/audience they
  staged).

  Sets, in the current session only:
    PHASE_03C1A_CONFIRM_NON_PRODUCTION
    PHASE_03C1A_TARGET_URL              (read via secure prompt, not echoed)
    PHASE_03C1A_INTERNAL_AUDIENCE
    PHASE_03C1A_HMAC_KEY_ID
    PHASE_03C1A_HMAC_SECRET
    PHASE_03C1A_TEST_USER_EMAIL         (read via secure prompt, not echoed)
    PHASE_03C1A_TEST_USER_SUBJECT

  Never writes any of these to a file, and never prints the URL or email
  back to the console after you type them.
#>

[CmdletBinding()]
param()

if (-not $env:PHASE03C1A_HMAC_ACTIVE_SECRET -or -not $env:PHASE03C1A_KEY_ID -or -not $env:PHASE03C1A_AUDIENCE) {
  throw "Run .\New-Phase03C1ASecrets.ps1 and .\Build-Phase03C1AKeyRing.ps1 first in this same session."
}

Write-Host "This will prompt for the isolated deployment URL and the seeded test" -ForegroundColor Cyan
Write-Host "user's email. Neither will be echoed to this console." -ForegroundColor Cyan
Write-Host ""
Write-Host "REMINDER: the URL must be the URL of a FRESH deployment you just created" -ForegroundColor Yellow
Write-Host "for THIS acceptance attempt. Do not reuse any previously shared or" -ForegroundColor Yellow
Write-Host "already-exposed temporary Web App URL." -ForegroundColor Yellow
Write-Host ""

$targetUrlSecure = Read-Host -Prompt "Isolated Web App URL (ending in /exec/v1/internal/auth)" -AsSecureString
$targetUrlPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($targetUrlSecure)
)

$testUserEmailSecure = Read-Host -Prompt "Seeded isolated test user's email" -AsSecureString
$testUserEmailPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($testUserEmailSecure)
)

$env:PHASE_03C1A_CONFIRM_NON_PRODUCTION = "I_UNDERSTAND_THIS_IS_NOT_PRODUCTION"
$env:PHASE_03C1A_TARGET_URL = $targetUrlPlain
$env:PHASE_03C1A_INTERNAL_AUDIENCE = $env:PHASE03C1A_AUDIENCE
$env:PHASE_03C1A_HMAC_KEY_ID = $env:PHASE03C1A_KEY_ID
$env:PHASE_03C1A_HMAC_SECRET = $env:PHASE03C1A_HMAC_ACTIVE_SECRET
$env:PHASE_03C1A_TEST_USER_EMAIL = $testUserEmailPlain
$env:PHASE_03C1A_TEST_USER_SUBJECT = "phase03c1a-acceptance-subject-$([guid]::NewGuid().ToString('N').Substring(0,12))"

# Clear the plaintext locals promptly; PowerShell strings are immutable so
# this does not scrub the underlying memory, but it removes the accessible
# reference as soon as it is no longer needed.
Remove-Variable targetUrlPlain, testUserEmailPlain, targetUrlSecure, testUserEmailSecure -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Runner environment variables loaded into this session." -ForegroundColor Green
Write-Host "Next: run .\Test-Phase03C1AConfig.ps1 to validate configuration safely," -ForegroundColor Cyan
Write-Host "then npm run acceptance:phase-03c1a from the repository root." -ForegroundColor Cyan
